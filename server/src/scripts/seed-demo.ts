import bcrypt from 'bcrypt';
import { pool } from '../config/db';
import '../config/env';

type DemoTeam = {
  email: string;
  username: string;
  password: string;
  teamName: string;
  color: string;
};

const DEMO_PASSWORD = 'password123';

const DEMO_TEAMS: DemoTeam[] = [
  { email: 'alpha@demo.local', username: 'alpha_captain', password: DEMO_PASSWORD, teamName: 'Альфа', color: '#DC2626' },
  { email: 'bravo@demo.local', username: 'bravo_captain', password: DEMO_PASSWORD, teamName: 'Браво', color: '#2563EB' },
  { email: 'charlie@demo.local', username: 'charlie_captain', password: DEMO_PASSWORD, teamName: 'Чарли', color: '#16A34A' },
];

const NEIGHBOR_OFFSETS: ReadonlyArray<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
];

async function seed(): Promise<void> {
  const sectorsCount = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM sectors",
  );
  if (parseInt(sectorsCount.rows[0].count, 10) === 0) {
    throw new Error('Map not generated. Run generate-map first via admin panel.');
  }

  for (const demo of DEMO_TEAMS) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existingEmail = await client.query<{ id: string; team_id: string | null }>(
        'SELECT id, team_id FROM users WHERE email = $1',
        [demo.email],
      );
      if (existingEmail.rows.length > 0) {
        console.log(`[skip] ${demo.email} already exists`);
        await client.query('ROLLBACK');
        continue;
      }

      const existingTeam = await client.query<{ id: string }>(
        'SELECT id FROM teams WHERE name = $1',
        [demo.teamName],
      );
      if (existingTeam.rows.length > 0) {
        console.log(`[skip] team ${demo.teamName} already exists`);
        await client.query('ROLLBACK');
        continue;
      }

      const homeRes = await client.query<{ id: string; q: number; r: number }>(
        `SELECT id, q, r FROM sectors
         WHERE is_home_base = true AND status = 'free' AND home_team_id IS NULL
         ORDER BY q, r
         LIMIT 1
         FOR UPDATE`,
      );
      if (homeRes.rows.length === 0) {
        console.log(`[skip] no free home_base for ${demo.teamName}`);
        await client.query('ROLLBACK');
        continue;
      }
      const home = homeRes.rows[0];

      const passwordHash = await bcrypt.hash(demo.password, 12);
      const userRes = await client.query<{ id: string }>(
        `INSERT INTO users (email, username, password_hash, role)
         VALUES ($1, $2, $3, 'student')
         RETURNING id`,
        [demo.email, demo.username, passwordHash],
      );
      const userId = userRes.rows[0].id;

      const teamRes = await client.query<{ id: string }>(
        `INSERT INTO teams (name, color) VALUES ($1, $2) RETURNING id`,
        [demo.teamName, demo.color],
      );
      const teamId = teamRes.rows[0].id;

      await client.query(
        `UPDATE users SET team_id = $1, team_role = 'captain' WHERE id = $2`,
        [teamId, userId],
      );

      await client.query(
        `UPDATE sectors
         SET status = 'captured', captured_by_team_id = $1, home_team_id = $1
         WHERE id = $2`,
        [teamId, home.id],
      );
      await client.query(
        'INSERT INTO sector_captures (sector_id, team_id) VALUES ($1, $2)',
        [home.id, teamId],
      );

      let captured = 0;
      for (const [dq, dr] of NEIGHBOR_OFFSETS) {
        if (captured >= 2) break;
        const q = home.q + dq;
        const r = home.r + dr;
        const neighbour = await client.query<{ id: string }>(
          `SELECT id FROM sectors
           WHERE q = $1 AND r = $2
             AND is_home_base = false
             AND status = 'free'
           FOR UPDATE`,
          [q, r],
        );
        if (neighbour.rows.length === 0) continue;
        const sectorId = neighbour.rows[0].id;
        await client.query(
          `UPDATE sectors
           SET status = 'captured', captured_by_team_id = $1
           WHERE id = $2`,
          [teamId, sectorId],
        );
        await client.query(
          'INSERT INTO sector_captures (sector_id, team_id) VALUES ($1, $2)',
          [sectorId, teamId],
        );
        captured++;
      }

      await client.query('COMMIT');
      console.log(`[ok] ${demo.teamName} (${demo.email}) — home (${home.q},${home.r}) + ${captured} neighbours`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[fail] ${demo.teamName}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  console.log('\nDemo seed complete.');
  console.log(`Login: alpha@demo.local / bravo@demo.local / charlie@demo.local — password: ${DEMO_PASSWORD}`);
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => pool.end());

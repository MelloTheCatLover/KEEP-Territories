import bcrypt from 'bcrypt';
import { pool } from '../config/db';
import '../config/env';
import { generateMap, defaultMapConfig } from '../services/map-generator.service';

const PRESERVED_USERNAME = 'cat2';
const DEMO_PASSWORD = 'password123';

type DemoMember = {
  email: string;
  username: string;
};

type DemoTeam = {
  name: string;
  color: string;
  captain: DemoMember;
  members: DemoMember[];
  captures: number;
  fortify: number;
};

const DEMO_TEAMS: DemoTeam[] = [
  {
    name: 'Альфа',
    color: '#E53935',
    captain: { email: 'alpha_cap@vkr.local', username: 'alpha_cap' },
    members: [
      { email: 'alpha_m1@vkr.local', username: 'alpha_m1' },
      { email: 'alpha_m2@vkr.local', username: 'alpha_m2' },
    ],
    captures: 4,
    fortify: 2,
  },
  {
    name: 'Браво',
    color: '#2952D9',
    captain: { email: 'bravo_cap@vkr.local', username: 'bravo_cap' },
    members: [{ email: 'bravo_m1@vkr.local', username: 'bravo_m1' }],
    captures: 3,
    fortify: 1,
  },
  {
    name: 'Чарли',
    color: '#2BA84A',
    captain: { email: 'charlie_cap@vkr.local', username: 'charlie_cap' },
    members: [{ email: 'charlie_m1@vkr.local', username: 'charlie_m1' }],
    captures: 2,
    fortify: 0,
  },
  {
    name: 'Дельта',
    color: '#E6B422',
    captain: { email: 'delta_cap@vkr.local', username: 'delta_cap' },
    members: [],
    captures: 1,
    fortify: 0,
  },
];

const NEIGHBOR_OFFSETS: ReadonlyArray<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
];

async function wipe(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM task_submissions');
    await client.query('DELETE FROM sector_captures');
    await client.query('DELETE FROM sector_tasks');
    await client.query('DELETE FROM sectors');
    await client.query('DELETE FROM team_stat_upgrades');
    await client.query(
      'UPDATE users SET team_id = NULL, team_role = NULL WHERE team_id IS NOT NULL',
    );
    await client.query('DELETE FROM teams');
    await client.query('DELETE FROM users WHERE username <> $1', [PRESERVED_USERNAME]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function ensureCat2(): Promise<void> {
  const r = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE username = $1',
    [PRESERVED_USERNAME],
  );
  if (r.rows.length === 0) {
    throw new Error(`User ${PRESERVED_USERNAME} not found — refusing to wipe.`);
  }
}

async function pendingCaptureSubmission(
  teamId: string,
  userId: string,
  sectorId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sector = await client.query<{
      difficulty_id: string;
      task_id: string | null;
      status: string;
    }>(
      'SELECT difficulty_id, task_id, status FROM sectors WHERE id = $1 FOR UPDATE',
      [sectorId],
    );
    if (sector.rows.length === 0) {
      await client.query('ROLLBACK');
      return;
    }
    const { difficulty_id, task_id, status } = sector.rows[0];
    if (status !== 'free') {
      await client.query('ROLLBACK');
      return;
    }

    let chosenTaskId = task_id;
    if (!chosenTaskId) {
      const t = await client.query<{ id: string }>(
        `SELECT id FROM tasks WHERE difficulty_id = $1 ORDER BY random() LIMIT 1`,
        [difficulty_id],
      );
      chosenTaskId = t.rows[0]?.id ?? null;
    }
    if (!chosenTaskId) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `INSERT INTO task_submissions
         (sector_id, team_id, user_id, task_id, action_type, status)
       VALUES ($1, $2, $3, $4, 'capture', 'pending')`,
      [sectorId, teamId, userId, chosenTaskId],
    );

    await client.query(
      `UPDATE sectors
         SET status = 'capturing',
             capturing_by_team_id = $1,
             capture_started_at = NOW(),
             current_action_type = 'capture'
       WHERE id = $2`,
      [teamId, sectorId],
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function seedTeam(team: DemoTeam): Promise<{ teamId: string; capturedSectorIds: string[]; captainId: string; homeQ: number; homeR: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    const captainRes = await client.query<{ id: string }>(
      `INSERT INTO users (email, username, password_hash, role)
       VALUES ($1, $2, $3, 'student') RETURNING id`,
      [team.captain.email, team.captain.username, passwordHash],
    );
    const captainId = captainRes.rows[0].id;

    const memberIds: string[] = [];
    for (const m of team.members) {
      const r = await client.query<{ id: string }>(
        `INSERT INTO users (email, username, password_hash, role)
         VALUES ($1, $2, $3, 'student') RETURNING id`,
        [m.email, m.username, passwordHash],
      );
      memberIds.push(r.rows[0].id);
    }

    const home = await client.query<{ id: string; q: number; r: number }>(
      `SELECT id, q, r FROM sectors
       WHERE is_home_base = true AND status = 'free' AND home_team_id IS NULL
       ORDER BY q, r
       LIMIT 1
       FOR UPDATE`,
    );
    if (home.rows.length === 0) throw new Error(`No free home base for ${team.name}`);
    const homeRow = home.rows[0];

    const teamRes = await client.query<{ id: string }>(
      `INSERT INTO teams (name, color) VALUES ($1, $2) RETURNING id`,
      [team.name, team.color],
    );
    const teamId = teamRes.rows[0].id;

    await client.query(
      `UPDATE users SET team_id = $1, team_role = 'captain' WHERE id = $2`,
      [teamId, captainId],
    );
    for (const mid of memberIds) {
      await client.query(
        `UPDATE users SET team_id = $1, team_role = 'member' WHERE id = $2`,
        [teamId, mid],
      );
    }

    await client.query(
      `UPDATE sectors
       SET status = 'captured', captured_by_team_id = $1, home_team_id = $1
       WHERE id = $2`,
      [teamId, homeRow.id],
    );
    await client.query(
      'INSERT INTO sector_captures (sector_id, team_id) VALUES ($1, $2)',
      [homeRow.id, teamId],
    );

    const capturedSectorIds: string[] = [homeRow.id];

    const queue: Array<{ q: number; r: number }> = [{ q: homeRow.q, r: homeRow.r }];
    const seen = new Set<string>([`${homeRow.q},${homeRow.r}`]);
    let captured = 0;

    while (captured < team.captures && queue.length > 0) {
      const head = queue.shift();
      if (!head) break;
      for (const [dq, dr] of NEIGHBOR_OFFSETS) {
        if (captured >= team.captures) break;
        const q = head.q + dq;
        const r = head.r + dr;
        const key = `${q},${r}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const cell = await client.query<{ id: string }>(
          `SELECT id FROM sectors
           WHERE q = $1 AND r = $2 AND is_home_base = false AND status = 'free'
           FOR UPDATE`,
          [q, r],
        );
        if (cell.rows.length === 0) continue;
        const sid = cell.rows[0].id;
        await client.query(
          `UPDATE sectors SET status = 'captured', captured_by_team_id = $1 WHERE id = $2`,
          [teamId, sid],
        );
        await client.query(
          'INSERT INTO sector_captures (sector_id, team_id) VALUES ($1, $2)',
          [sid, teamId],
        );
        capturedSectorIds.push(sid);
        queue.push({ q, r });
        captured++;
      }
    }

    let fortified = 0;
    for (const sid of capturedSectorIds.slice(1)) {
      if (fortified >= team.fortify) break;
      await client.query(
        `UPDATE sectors SET fortification_level = LEAST(3, fortification_level + 1) WHERE id = $1`,
        [sid],
      );
      fortified++;
    }

    await client.query('COMMIT');
    return { teamId, capturedSectorIds, captainId, homeQ: homeRow.q, homeR: homeRow.r };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  console.log('Verifying preserved user...');
  await ensureCat2();

  console.log('Wiping DB (preserving user cat2 and tasks/difficulty_levels/game_settings)...');
  await wipe();

  console.log('Generating map (default 3 rings)...');
  await generateMap(defaultMapConfig());

  const seeded: Array<{
    team: DemoTeam;
    teamId: string;
    captainId: string;
    capturedSectorIds: string[];
    homeQ: number;
    homeR: number;
  }> = [];

  for (const team of DEMO_TEAMS) {
    console.log(`Seeding team ${team.name}...`);
    const r = await seedTeam(team);
    seeded.push({ team, ...r });
  }

  // Active capture submission for visual: Альфа tries one more adjacent sector.
  const alpha = seeded[0];
  const adjFree = await pool.query<{ id: string }>(
    `SELECT s.id FROM sectors s
     WHERE s.status = 'free' AND s.is_home_base = false
       AND EXISTS (
         SELECT 1 FROM sectors o
         WHERE o.captured_by_team_id = $1
           AND ((o.q - s.q = 1 AND o.r - s.r = 0)
             OR (o.q - s.q = -1 AND o.r - s.r = 0)
             OR (o.q - s.q = 0 AND o.r - s.r = 1)
             OR (o.q - s.q = 0 AND o.r - s.r = -1)
             OR (o.q - s.q = 1 AND o.r - s.r = -1)
             OR (o.q - s.q = -1 AND o.r - s.r = 1))
       )
     LIMIT 1`,
    [alpha.teamId],
  );
  if (adjFree.rows.length > 0) {
    await pendingCaptureSubmission(alpha.teamId, alpha.captainId, adjFree.rows[0].id);
    console.log(`  Альфа started a pending capture on sector ${adjFree.rows[0].id}`);
  }

  console.log('\nDone.');
  console.log('Captains:');
  for (const s of seeded) {
    console.log(
      `  ${s.team.name}: ${s.team.captain.email} / ${DEMO_PASSWORD} — home (${s.homeQ}, ${s.homeR})`,
    );
  }
}

main()
  .catch((e) => {
    console.error('Fresh seed failed:', e);
    process.exit(1);
  })
  .finally(() => pool.end());

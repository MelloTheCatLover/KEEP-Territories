import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { getActiveSeasonId } from './season.service';
import { computeOverall } from './trophy.service';
import {
  CATEGORY_ORDER,
  CategoryCount,
  DistributionParticipant,
  DistributionState,
  DistributionTeam,
  ParticipantCategory,
  SpinAssignment,
  SpinResult,
} from '../types/distribution';

const MAX_BATCH = 50;

type Queryable = Pick<PoolClient, 'query'>;

async function seasonName(q: Queryable, seasonId: string): Promise<string> {
  const res = await q.query<{ name: string }>('SELECT name FROM seasons WHERE id = $1', [seasonId]);
  if (res.rows.length === 0) throw new AppError(404, 'Сезон не найден');
  return res.rows[0].name;
}

async function homeBaseCount(q: Queryable, seasonId: string): Promise<number> {
  const res = await q.query<{ n: string }>(
    `SELECT COUNT(*)::int AS n FROM sectors WHERE season_id = $1 AND is_home_base = true`,
    [seasonId],
  );
  return Number(res.rows[0].n);
}

async function listTeams(q: Queryable, seasonId: string): Promise<DistributionTeam[]> {
  const res = await q.query<DistributionTeam>(
    `SELECT t.id, t.name, t.color,
            (SELECT COUNT(*)::int FROM season_participants sp WHERE sp.team_id = t.id) AS member_count
       FROM teams t
      WHERE t.season_id = $1
      ORDER BY t.created_at ASC`,
    [seasonId],
  );
  return res.rows;
}

async function listParticipants(q: Queryable, seasonId: string): Promise<DistributionParticipant[]> {
  const res = await q.query<{
    child_id: string;
    full_name: string;
    code: string;
    login: string | null;
    has_account: boolean;
    category: ParticipantCategory | null;
    team_id: string | null;
    team_name: string | null;
  }>(
    `SELECT c.id AS child_id, c.full_name, c.code,
            u.email AS login, (c.user_id IS NOT NULL) AS has_account,
            sp.category, sp.team_id, t.name AS team_name
       FROM children c
       JOIN list_members lm ON lm.child_id = c.id
       JOIN season_lists sl ON sl.list_id = lm.list_id
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN season_participants sp ON sp.child_id = c.id AND sp.season_id = $1
       LEFT JOIN teams t ON t.id = sp.team_id
      WHERE sl.season_id = $1
      GROUP BY c.id, u.email, sp.category, sp.team_id, t.name
      ORDER BY c.full_name ASC`,
    [seasonId],
  );
  return res.rows.map((r) => ({
    child_id: r.child_id,
    full_name: r.full_name,
    code: r.code,
    login: r.login,
    has_account: r.has_account,
    category: r.category ?? 'newbie',
    team_id: r.team_id,
    team_name: r.team_name,
  }));
}

function buildState(
  seasonId: string,
  name: string,
  bases: number,
  teams: DistributionTeam[],
  participants: DistributionParticipant[],
  prepared: boolean,
): DistributionState {
  const counts = {} as Record<ParticipantCategory, CategoryCount>;
  for (const cat of CATEGORY_ORDER) counts[cat] = { total: 0, assigned: 0 };
  let assignedTotal = 0;
  for (const p of participants) {
    counts[p.category].total += 1;
    if (p.team_id) {
      counts[p.category].assigned += 1;
      assignedTotal += 1;
    }
  }
  const remaining = participants.length - assignedTotal;
  return {
    season_id: seasonId,
    season_name: name,
    home_base_count: bases,
    team_count: teams.length,
    prepared,
    teams,
    participants,
    category_counts: counts,
    remaining,
    done: prepared && participants.length > 0 && remaining === 0,
  };
}

async function isPreparedFor(q: Queryable, seasonId: string): Promise<boolean> {
  const res = await q.query('SELECT 1 FROM season_participants WHERE season_id = $1 LIMIT 1', [seasonId]);
  return res.rows.length > 0;
}

async function refresh(q: Queryable, seasonId: string): Promise<DistributionState> {
  const [name, bases, teams, participants, prepared] = await Promise.all([
    seasonName(q, seasonId),
    homeBaseCount(q, seasonId),
    listTeams(q, seasonId),
    listParticipants(q, seasonId),
    isPreparedFor(q, seasonId),
  ]);
  return buildState(seasonId, name, bases, teams, participants, prepared);
}

export async function getState(): Promise<DistributionState> {
  const seasonId = await getActiveSeasonId();
  return refresh(pool, seasonId);
}

/** Whether the active season is in admin-distribution mode (prepare has run). */
export async function isDistributed(seasonId: string, client?: Queryable): Promise<boolean> {
  return isPreparedFor(client ?? pool, seasonId);
}

/**
 * Set of child_ids that were on a champion team (overall place 1) in any season
 * other than the current one. Used to default a returning child to "winner".
 */
async function winnerChildIds(client: Queryable, currentSeasonId: string): Promise<Set<string>> {
  const seasonsRes = await client.query<{ season_id: string }>(
    `SELECT DISTINCT season_id FROM season_participants WHERE season_id <> $1`,
    [currentSeasonId],
  );
  const championTeamIds: string[] = [];
  for (const { season_id } of seasonsRes.rows) {
    const overall = await computeOverall(season_id);
    for (const entry of overall) {
      if (entry.place === 1) championTeamIds.push(entry.team_id);
    }
  }
  if (championTeamIds.length === 0) return new Set();
  const res = await client.query<{ child_id: string }>(
    `SELECT DISTINCT child_id FROM season_participants WHERE team_id = ANY($1::uuid[])`,
    [championTeamIds],
  );
  return new Set(res.rows.map((r) => r.child_id));
}

/** child_ids with any prior-season participation (returning, non-winner → participant). */
async function returningChildIds(client: Queryable, currentSeasonId: string): Promise<Set<string>> {
  const res = await client.query<{ child_id: string }>(
    `SELECT DISTINCT child_id FROM season_participants WHERE season_id <> $1`,
    [currentSeasonId],
  );
  return new Set(res.rows.map((r) => r.child_id));
}

export async function prepare(): Promise<DistributionState> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seasonId = await getActiveSeasonId(client);

    const bases = await homeBaseCount(client, seasonId);
    if (bases === 0) {
      throw new AppError(400, 'Сначала сгенерируйте карту сезона — нет домашних баз');
    }

    // Enrolled children of the active season (deduped across their lists).
    const enrolled = await client.query<{ child_id: string }>(
      `SELECT DISTINCT c.id AS child_id
         FROM children c
         JOIN list_members lm ON lm.child_id = c.id
         JOIN season_lists sl ON sl.list_id = lm.list_id
        WHERE sl.season_id = $1`,
      [seasonId],
    );
    if (enrolled.rows.length === 0) {
      throw new AppError(400, 'В списках сезона нет детей');
    }

    const winners = await winnerChildIds(client, seasonId);
    const returning = await returningChildIds(client, seasonId);

    // Snapshot each enrolled child with a default category. Existing rows are
    // kept (preserves manual edits / partial distribution) via ON CONFLICT.
    for (const { child_id } of enrolled.rows) {
      const category: ParticipantCategory = winners.has(child_id)
        ? 'winner'
        : returning.has(child_id)
          ? 'participant'
          : 'newbie';
      await client.query(
        `INSERT INTO season_participants (season_id, child_id, category)
         VALUES ($1, $2, $3)
         ON CONFLICT (season_id, child_id) DO NOTHING`,
        [seasonId, child_id, category],
      );
    }

    // Create empty placeholder teams up to N = home base count, each bound 1:1
    // to a free home base (captured, like team.service.create).
    const existing = await client.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM teams WHERE season_id = $1`,
      [seasonId],
    );
    let teamCount = Number(existing.rows[0].n);

    while (teamCount < bases) {
      const freeBase = await client.query<{ id: string }>(
        `SELECT id FROM sectors
          WHERE season_id = $1 AND is_home_base = true AND home_team_id IS NULL AND status = 'free'
          ORDER BY number ASC NULLS LAST, created_at ASC
          LIMIT 1
          FOR UPDATE`,
        [seasonId],
      );
      if (freeBase.rows.length === 0) break; // no more free bases
      const baseId = freeBase.rows[0].id;

      const name = await nextTeamName(client, seasonId, teamCount + 1);
      const teamRes = await client.query<{ id: string }>(
        `INSERT INTO teams (name, color, season_id) VALUES ($1, NULL, $2) RETURNING id`,
        [name, seasonId],
      );
      const teamId = teamRes.rows[0].id;
      await client.query(
        `UPDATE sectors SET status = 'captured', captured_by_team_id = $1, home_team_id = $1 WHERE id = $2`,
        [teamId, baseId],
      );
      await client.query(
        `INSERT INTO sector_captures (sector_id, team_id) VALUES ($1, $2)`,
        [baseId, teamId],
      );
      teamCount += 1;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getState();
}

/** Pick the next free "Команда N" name for the season. */
async function nextTeamName(client: Queryable, seasonId: string, start: number): Promise<string> {
  let i = start;
  for (;;) {
    const name = `Команда ${i}`;
    const res = await client.query('SELECT 1 FROM teams WHERE season_id = $1 AND name = $2', [seasonId, name]);
    if (res.rows.length === 0) return name;
    i += 1;
  }
}

export async function setCategory(childId: string, category: ParticipantCategory): Promise<DistributionState> {
  if (!CATEGORY_ORDER.includes(category)) {
    throw new AppError(400, 'Неизвестная категория');
  }
  const seasonId = await getActiveSeasonId();
  const res = await pool.query<{ team_id: string | null }>(
    'SELECT team_id FROM season_participants WHERE season_id = $1 AND child_id = $2',
    [seasonId, childId],
  );
  if (res.rows.length === 0) {
    throw new AppError(404, 'Участник не найден — сначала подготовьте распределение');
  }
  if (res.rows[0].team_id) {
    throw new AppError(400, 'Участник уже распределён — сбросьте распределение, чтобы менять категорию');
  }
  await pool.query(
    'UPDATE season_participants SET category = $1 WHERE season_id = $2 AND child_id = $3',
    [category, seasonId, childId],
  );
  return getState();
}

export async function spin(batchSize: number): Promise<SpinResult> {
  const batch = Math.max(1, Math.min(MAX_BATCH, Math.floor(batchSize) || 1));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seasonId = await getActiveSeasonId(client);

    const teamsRes = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM teams WHERE season_id = $1 ORDER BY created_at ASC`,
      [seasonId],
    );
    const teams = teamsRes.rows;
    if (teams.length === 0) {
      throw new AppError(400, 'Нет команд — сначала подготовьте распределение');
    }

    const assignedRes = await client.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM season_participants WHERE season_id = $1 AND team_id IS NOT NULL`,
      [seasonId],
    );
    const alreadyAssigned = Number(assignedRes.rows[0].n);

    // First category in priority order that still has unassigned participants.
    let currentCategory: ParticipantCategory | null = null;
    for (const cat of CATEGORY_ORDER) {
      const r = await client.query<{ n: string }>(
        `SELECT COUNT(*)::int AS n FROM season_participants
          WHERE season_id = $1 AND category = $2 AND team_id IS NULL`,
        [seasonId, cat],
      );
      if (Number(r.rows[0].n) > 0) {
        currentCategory = cat;
        break;
      }
    }

    if (currentCategory === null) {
      const state = await refresh(client, seasonId);
      await client.query('COMMIT');
      return { category: null, assigned: [], done: true, state };
    }

    const pickRes = await client.query<{ child_id: string; full_name: string; user_id: string | null }>(
      `SELECT sp.child_id, c.full_name, c.user_id
         FROM season_participants sp
         JOIN children c ON c.id = sp.child_id
        WHERE sp.season_id = $1 AND sp.category = $2 AND sp.team_id IS NULL
        ORDER BY random()
        LIMIT $3
        FOR UPDATE OF sp`,
      [seasonId, currentCategory, batch],
    );

    const assigned: SpinAssignment[] = [];
    for (let k = 0; k < pickRes.rows.length; k++) {
      const pick = pickRes.rows[k];
      const seq = alreadyAssigned + k + 1;
      const team = teams[(alreadyAssigned + k) % teams.length];

      await client.query(
        `UPDATE season_participants SET team_id = $1, assigned_seq = $2
          WHERE season_id = $3 AND child_id = $4`,
        [team.id, seq, seasonId, pick.child_id],
      );

      if (pick.user_id) {
        const capRes = await client.query(
          `SELECT 1 FROM users WHERE team_id = $1 AND team_role = 'captain' LIMIT 1`,
          [team.id],
        );
        const role = capRes.rows.length === 0 ? 'captain' : 'member';
        await client.query(
          `UPDATE users SET team_id = $1, team_role = $2 WHERE id = $3`,
          [team.id, role, pick.user_id],
        );
      }

      assigned.push({
        child_id: pick.child_id,
        full_name: pick.full_name,
        team_id: team.id,
        team_name: team.name,
      });
    }

    const state = await refresh(client, seasonId);
    await client.query('COMMIT');
    return { category: currentCategory, assigned, done: state.done, state };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reset(): Promise<DistributionState> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seasonId = await getActiveSeasonId(client);

    // Detach players, free home bases, drop the placeholder teams, clear snapshot.
    await client.query(
      `UPDATE users SET team_id = NULL, team_role = NULL
        WHERE team_id IN (SELECT id FROM teams WHERE season_id = $1)`,
      [seasonId],
    );
    await client.query(
      `DELETE FROM sector_captures
        WHERE team_id IN (SELECT id FROM teams WHERE season_id = $1)`,
      [seasonId],
    );
    await client.query(
      `UPDATE sectors
          SET status = 'free', captured_by_team_id = NULL, capturing_by_team_id = NULL,
              capture_started_at = NULL, home_team_id = NULL, fortification_level = 0,
              current_action_type = NULL
        WHERE season_id = $1`,
      [seasonId],
    );
    await client.query(
      `DELETE FROM task_submissions
        WHERE team_id IN (SELECT id FROM teams WHERE season_id = $1)`,
      [seasonId],
    );
    await client.query(`DELETE FROM teams WHERE season_id = $1`, [seasonId]);
    await client.query(`DELETE FROM season_participants WHERE season_id = $1`, [seasonId]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getState();
}

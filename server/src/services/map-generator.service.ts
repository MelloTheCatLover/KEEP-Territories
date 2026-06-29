import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { SectorPublic } from '../types/sector';
import { DifficultyLevel, DifficultySlug } from '../types/difficulty';
import { getActiveSeasonId } from './season.service';

/**
 * Fixed camp map preset. Radius 4 → 5 rings (incl. core), 61 sectors:
 *
 *   r0  core            — 1
 *   r1  hard            — 6
 *   r2  medium / special alternating (corners medium, edges special-blue) — 12
 *   r3  medium edges, easy corners — 18
 *   r4  easy, 6 home bases at corners — 24
 *
 * The ring layout, difficulties, special sectors and home-base positions are
 * not configurable — this is the single canonical world for a season.
 */
export const PRESET_RADIUS = 4;

export function generateHexCoordinates(radius: number): Array<{ q: number; r: number }> {
  const coords: Array<{ q: number; r: number }> = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      coords.push({ q, r });
    }
  }
  return coords;
}

export function getRing(q: number, r: number): number {
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

/** The 6 corner cells of the hex ring at the given radius. */
export function cornerCoordsForRadius(radius: number): Array<{ q: number; r: number }> {
  if (radius < 1) return [];
  return [
    { q: radius, r: 0 },
    { q: radius, r: -radius },
    { q: 0, r: -radius },
    { q: -radius, r: 0 },
    { q: -radius, r: radius },
    { q: 0, r: radius },
  ];
}

interface PresetCell {
  q: number;
  r: number;
  slug: DifficultySlug;
  isHome: boolean;
  isSpecial: boolean;
}

/** Build the fixed preset cells with their difficulty / home / special roles. */
export function buildPresetCells(): PresetCell[] {
  const cornerSetByRing = new Map<number, Set<string>>();
  for (let ring = 1; ring <= PRESET_RADIUS; ring++) {
    cornerSetByRing.set(
      ring,
      new Set(cornerCoordsForRadius(ring).map((c) => `${c.q},${c.r}`)),
    );
  }

  const cells: PresetCell[] = [];
  for (const { q, r } of generateHexCoordinates(PRESET_RADIUS)) {
    const ring = getRing(q, r);
    const isCorner = cornerSetByRing.get(ring)?.has(`${q},${r}`) ?? false;

    if (ring === 0) {
      cells.push({ q, r, slug: 'core', isHome: false, isSpecial: false });
    } else if (ring === 1) {
      cells.push({ q, r, slug: 'hard', isHome: false, isSpecial: false });
    } else if (ring === 2) {
      // corners → medium, edges → special-event (blue, non-capturable)
      cells.push({ q, r, slug: 'medium', isHome: false, isSpecial: !isCorner });
    } else if (ring === 3) {
      // corners → easy, edges → medium
      cells.push({ q, r, slug: isCorner ? 'easy' : 'medium', isHome: false, isSpecial: false });
    } else {
      // ring 4: corners → home bases, edges → easy
      cells.push({ q, r, slug: 'easy', isHome: isCorner, isSpecial: false });
    }
  }
  return cells;
}

interface DiffIdMap {
  easy: string;
  medium: string;
  hard: string;
  core: string;
}

type SectorRow = {
  id: string;
  number: number | null;
  q: number;
  r: number;
  difficulty_id: string;
  task_id: string | null;
  status: 'free' | 'capturing' | 'captured';
  captured_by_team_id: string | null;
  capturing_by_team_id: string | null;
  capture_started_at: Date | null;
  fortification_level: number;
  is_home_base: boolean;
  home_team_id: string | null;
  current_action_type: 'capture' | 'fortify' | 'remove_fortification' | 'recapture' | null;
  is_special: boolean;
  difficulty_name: string;
  difficulty_slug: DifficultySlug;
  difficulty_influence_reward: number;
  difficulty_experience_reward: number;
};

function rowToSectorPublic(row: SectorRow): SectorPublic {
  const difficulty: DifficultyLevel = {
    id: row.difficulty_id,
    name: row.difficulty_name,
    slug: row.difficulty_slug,
    influence_reward: row.difficulty_influence_reward,
    experience_reward: row.difficulty_experience_reward,
  };
  return {
    id: row.id,
    number: row.number,
    q: row.q,
    r: row.r,
    difficulty_id: row.difficulty_id,
    task_id: row.task_id,
    status: row.status,
    captured_by_team_id: row.captured_by_team_id,
    capturing_by_team_id: row.capturing_by_team_id,
    capture_started_at: row.capture_started_at,
    fortification_level: row.fortification_level,
    is_home_base: row.is_home_base,
    home_team_id: row.home_team_id,
    current_action_type: row.current_action_type,
    is_special: row.is_special,
    difficulty,
    active_submission_team_id: null,
  };
}

async function loadDifficultyMap(client: PoolClient): Promise<DiffIdMap> {
  const res = await client.query<{ id: string; slug: DifficultySlug }>(
    'SELECT id, slug FROM difficulty_levels'
  );
  const map: Partial<Record<DifficultySlug, string>> = {};
  for (const row of res.rows) {
    map[row.slug] = row.id;
  }
  if (!map.easy || !map.medium || !map.hard || !map.core) {
    throw new AppError(500, 'Difficulty levels not seeded');
  }
  return { easy: map.easy, medium: map.medium, hard: map.hard, core: map.core };
}

async function checkTaskCounts(client: PoolClient, diffMap: DiffIdMap): Promise<void> {
  const res = await client.query<{ difficulty_id: string; count: string }>(
    'SELECT difficulty_id, COUNT(*)::text AS count FROM tasks GROUP BY difficulty_id'
  );
  const counts: Record<string, number> = {};
  for (const row of res.rows) {
    counts[row.difficulty_id] = parseInt(row.count, 10);
  }
  const easy = counts[diffMap.easy] ?? 0;
  const medium = counts[diffMap.medium] ?? 0;
  const core = counts[diffMap.core] ?? 0;
  const errors: string[] = [];
  if (core < 1) errors.push(`core ${core}/1`);
  if (easy < 4) errors.push(`easy ${easy}/4`);
  if (medium < 5) errors.push(`medium ${medium}/5`);
  if (errors.length > 0) {
    throw new AppError(400, `Not enough tasks: ${errors.join(', ')}`);
  }
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function assignTasksAfterGeneration(client: PoolClient, seasonId: string): Promise<void> {
  // Special and home-base sectors never get tasks — they can't be captured.
  const sectorsRes = await client.query<{ id: string; difficulty_id: string }>(
    `SELECT id, difficulty_id FROM sectors
      WHERE season_id = $1 AND is_special = false AND is_home_base = false`,
    [seasonId]
  );
  const tasksRes = await client.query<{ id: string; difficulty_id: string }>(
    'SELECT id, difficulty_id FROM tasks'
  );
  const diffsRes = await client.query<{ id: string; slug: DifficultySlug }>(
    'SELECT id, slug FROM difficulty_levels'
  );

  const slugById: Record<string, DifficultySlug> = {};
  for (const d of diffsRes.rows) slugById[d.id] = d.slug;

  const tasksByDiff: Record<string, string[]> = {};
  for (const t of tasksRes.rows) {
    if (!tasksByDiff[t.difficulty_id]) tasksByDiff[t.difficulty_id] = [];
    tasksByDiff[t.difficulty_id].push(t.id);
  }

  for (const sector of sectorsRes.rows) {
    const slug = slugById[sector.difficulty_id];
    const taskPool = tasksByDiff[sector.difficulty_id] ?? [];

    if (slug === 'easy' || slug === 'medium') {
      const need = slug === 'easy' ? 4 : 5;
      if (taskPool.length < need) {
        throw new AppError(
          400,
          `Not enough ${slug} tasks: need ${need} distinct, have ${taskPool.length}`
        );
      }
      const picked = shuffle(taskPool).slice(0, need);
      const values: string[] = [];
      const params: string[] = [];
      picked.forEach((taskId, i) => {
        values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
        params.push(sector.id, taskId);
      });
      await client.query(
        `INSERT INTO sector_tasks (sector_id, task_id) VALUES ${values.join(', ')}`,
        params
      );
    } else if (slug === 'core') {
      if (taskPool.length < 1) {
        throw new AppError(400, 'Not enough core tasks: need 1, have 0');
      }
      const picked = shuffle(taskPool)[0];
      await client.query('UPDATE sectors SET task_id = $1 WHERE id = $2', [picked, sector.id]);
    }
  }
}

/** Delete this season's sectors and everything anchored to them, keeping teams. */
async function clearSeasonSectors(client: PoolClient, seasonId: string): Promise<void> {
  const seasonSectors = `(SELECT id FROM sectors WHERE season_id = $1)`;
  await client.query(`DELETE FROM task_submissions WHERE sector_id IN ${seasonSectors}`, [seasonId]);
  await client.query(`DELETE FROM sector_captures WHERE sector_id IN ${seasonSectors}`, [seasonId]);
  await client.query(`DELETE FROM sector_tasks WHERE sector_id IN ${seasonSectors}`, [seasonId]);
  await client.query('DELETE FROM sectors WHERE season_id = $1', [seasonId]);
}

/** Re-anchor each surviving team 1:1 to a fresh free home base. */
async function repinTeams(client: PoolClient, seasonId: string, teamIds: string[]): Promise<void> {
  const bases = await client.query<{ id: string }>(
    `SELECT id FROM sectors
      WHERE season_id = $1 AND is_home_base = true
      ORDER BY q ASC, r ASC`,
    [seasonId],
  );
  if (teamIds.length > bases.rows.length) {
    throw new AppError(
      400,
      `Команд (${teamIds.length}) больше, чем домашних баз (${bases.rows.length})`,
    );
  }
  for (let i = 0; i < teamIds.length; i++) {
    const teamId = teamIds[i];
    const baseId = bases.rows[i].id;
    await client.query(
      `UPDATE sectors
          SET status = 'captured', captured_by_team_id = $1, home_team_id = $1,
              fortification_level = 0, capturing_by_team_id = NULL,
              capture_started_at = NULL, current_action_type = NULL
        WHERE id = $2`,
      [teamId, baseId],
    );
    await client.query(
      `INSERT INTO sector_captures (sector_id, team_id) VALUES ($1, $2)`,
      [baseId, teamId],
    );
  }
}

/**
 * (Re)generate the season map from the fixed preset. Existing teams and the
 * children distribution (`season_participants`, `users.team_id`) are preserved:
 * teams are re-anchored to new home bases, only field progress is reset.
 */
export async function generateMap(): Promise<SectorPublic[]> {
  const seasonId = await getActiveSeasonId();
  const cells = buildPresetCells();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const diffMap = await loadDifficultyMap(client);
    await checkTaskCounts(client, diffMap);

    // Snapshot surviving teams before wiping the old field.
    const teamsRes = await client.query<{ id: string }>(
      'SELECT id FROM teams WHERE season_id = $1 ORDER BY created_at ASC',
      [seasonId],
    );
    const teamIds = teamsRes.rows.map((t) => t.id);

    await clearSeasonSectors(client, seasonId);

    // Sequential per-difficulty numbers over capturable cells only.
    const numberBySlug: Record<DifficultySlug, number> = { easy: 0, medium: 0, hard: 0, core: 0 };
    const rows = cells.map((cell) => {
      const numbered = !cell.isHome && !cell.isSpecial;
      const number = numbered ? (numberBySlug[cell.slug] += 1) : null;
      return {
        number,
        q: cell.q,
        r: cell.r,
        difficultyId: diffMap[cell.slug],
        isHome: cell.isHome,
        isSpecial: cell.isSpecial,
      };
    });

    const values: string[] = [];
    const params: Array<string | number | boolean | null> = [];
    rows.forEach((row, i) => {
      const base = i * 7;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`,
      );
      params.push(row.number, row.q, row.r, row.difficultyId, row.isHome, row.isSpecial, seasonId);
    });

    await client.query(
      `INSERT INTO sectors (number, q, r, difficulty_id, is_home_base, is_special, season_id)
       VALUES ${values.join(', ')}`,
      params,
    );

    await assignTasksAfterGeneration(client, seasonId);
    await repinTeams(client, seasonId, teamIds);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const result = await pool.query<SectorRow>(
    `SELECT s.*,
            dl.name AS difficulty_name,
            dl.slug AS difficulty_slug,
            dl.influence_reward AS difficulty_influence_reward,
            dl.experience_reward AS difficulty_experience_reward
     FROM sectors s
     JOIN difficulty_levels dl ON s.difficulty_id = dl.id
     WHERE s.season_id = $1
     ORDER BY dl.slug ASC, s.number ASC`,
    [seasonId]
  );
  return result.rows.map(rowToSectorPublic);
}

export async function countTeams(): Promise<number> {
  const seasonId = await getActiveSeasonId();
  const r = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM teams WHERE season_id = $1',
    [seasonId]
  );
  return parseInt(r.rows[0].count, 10);
}

export async function deleteAllSectors(): Promise<{ deleted_count: number; deleted_teams_count: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seasonId = await getActiveSeasonId(client);

    await client.query(
      `UPDATE users SET team_id = NULL, team_role = NULL
       WHERE team_id IN (SELECT id FROM teams WHERE season_id = $1)`,
      [seasonId]
    );

    const seasonSectors = `(SELECT id FROM sectors WHERE season_id = $1)`;
    await client.query(`DELETE FROM task_submissions WHERE sector_id IN ${seasonSectors}`, [seasonId]);
    await client.query(`DELETE FROM sector_captures WHERE sector_id IN ${seasonSectors}`, [seasonId]);
    await client.query(`DELETE FROM sector_tasks WHERE sector_id IN ${seasonSectors}`, [seasonId]);

    const sectors = await client.query('DELETE FROM sectors WHERE season_id = $1 RETURNING id', [seasonId]);
    const teams = await client.query('DELETE FROM teams WHERE season_id = $1 RETURNING id', [seasonId]);

    await client.query('COMMIT');
    return {
      deleted_count: sectors.rowCount ?? 0,
      deleted_teams_count: teams.rowCount ?? 0,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

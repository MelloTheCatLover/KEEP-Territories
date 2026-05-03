import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { SectorPublic } from '../types/sector';
import { DifficultyLevel, DifficultySlug } from '../types/difficulty';

export type RingDifficulty = Exclude<DifficultySlug, 'core'>;
export interface RingConfig {
  difficulty: RingDifficulty;
}
export interface MapGeneratorConfig {
  rings: RingConfig[];
}

const MAX_RINGS = 6;
const DEFAULT_CONFIG: MapGeneratorConfig = {
  rings: [{ difficulty: 'hard' }, { difficulty: 'medium' }, { difficulty: 'easy' }],
};

export function defaultMapConfig(): MapGeneratorConfig {
  return { rings: DEFAULT_CONFIG.rings.map((r) => ({ ...r })) };
}

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

export function homeBaseCoordsForRadius(radius: number): Array<{ q: number; r: number }> {
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

export function validateMapConfig(input: unknown): MapGeneratorConfig {
  if (input == null) return defaultMapConfig();
  if (typeof input !== 'object') {
    throw new AppError(400, 'Invalid map config');
  }
  const obj = input as { rings?: unknown };
  if (obj.rings == null) return defaultMapConfig();
  if (!Array.isArray(obj.rings)) {
    throw new AppError(400, 'rings must be an array');
  }
  if (obj.rings.length < 1 || obj.rings.length > MAX_RINGS) {
    throw new AppError(400, `rings must contain between 1 and ${MAX_RINGS} entries`);
  }
  const rings: RingConfig[] = obj.rings.map((entry, idx) => {
    if (!entry || typeof entry !== 'object') {
      throw new AppError(400, `rings[${idx}] must be an object`);
    }
    const diff = (entry as { difficulty?: unknown }).difficulty;
    if (diff !== 'easy' && diff !== 'medium' && diff !== 'hard') {
      throw new AppError(400, `rings[${idx}].difficulty must be easy|medium|hard`);
    }
    return { difficulty: diff };
  });
  return { rings };
}

function ringDifficultyAt(ringIndex: number, config: MapGeneratorConfig): DifficultySlug {
  if (ringIndex === 0) return 'core';
  const entry = config.rings[ringIndex - 1];
  if (!entry) throw new AppError(500, `ring ${ringIndex} not configured`);
  return entry.difficulty;
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

async function checkTaskCounts(
  client: PoolClient,
  diffMap: DiffIdMap,
  needed: { easyNonHome: number; mediumNonHome: number }
): Promise<void> {
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
  if (needed.easyNonHome > 0 && easy < 4) errors.push(`easy ${easy}/4`);
  if (needed.mediumNonHome > 0 && medium < 5) errors.push(`medium ${medium}/5`);
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

async function assignTasksAfterGeneration(client: PoolClient): Promise<void> {
  const sectorsRes = await client.query<{ id: string; difficulty_id: string }>(
    'SELECT id, difficulty_id FROM sectors'
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
    const pool = tasksByDiff[sector.difficulty_id] ?? [];

    if (slug === 'easy' || slug === 'medium') {
      const need = slug === 'easy' ? 4 : 5;
      if (pool.length < need) {
        throw new AppError(
          400,
          `Not enough ${slug} tasks: need ${need} distinct, have ${pool.length}`
        );
      }
      const picked = shuffle(pool).slice(0, need);
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
      if (pool.length < 1) {
        throw new AppError(400, 'Not enough core tasks: need 1, have 0');
      }
      const picked = shuffle(pool)[0];
      await client.query('UPDATE sectors SET task_id = $1 WHERE id = $2', [picked, sector.id]);
    }
  }
}

export async function generateMap(config: MapGeneratorConfig = defaultMapConfig()): Promise<SectorPublic[]> {
  const radius = config.rings.length;
  const homeBaseSet = new Set(homeBaseCoordsForRadius(radius).map((c) => `${c.q},${c.r}`));

  const existing = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM sectors'
  );
  if (parseInt(existing.rows[0].count, 10) > 0) {
    throw new AppError(
      409,
      'Map already exists. Delete existing map first via DELETE /api/sectors/all'
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const diffMap = await loadDifficultyMap(client);

    const coords = generateHexCoordinates(radius);
    const bySlug: Record<DifficultySlug, Array<{ q: number; r: number; isHome: boolean }>> = {
      easy: [],
      medium: [],
      hard: [],
      core: [],
    };
    for (const { q, r } of coords) {
      const slug = ringDifficultyAt(getRing(q, r), config);
      const isHome = homeBaseSet.has(`${q},${r}`);
      bySlug[slug].push({ q, r, isHome });
    }

    await checkTaskCounts(client, diffMap, {
      easyNonHome: bySlug.easy.filter((c) => !c.isHome).length,
      mediumNonHome: bySlug.medium.filter((c) => !c.isHome).length,
    });

    const rows: Array<{ number: number | null; q: number; r: number; difficultyId: string; isHome: boolean }> = [];
    (Object.keys(bySlug) as DifficultySlug[]).forEach((slug) => {
      const bucket = bySlug[slug];
      const nonHome = shuffle(bucket.filter((c) => !c.isHome));
      const homes = bucket.filter((c) => c.isHome);
      nonHome.forEach(({ q, r, isHome }, idx) => {
        rows.push({ number: idx + 1, q, r, difficultyId: diffMap[slug], isHome });
      });
      homes.forEach(({ q, r, isHome }) => {
        rows.push({ number: null, q, r, difficultyId: diffMap[slug], isHome });
      });
    });

    const values: string[] = [];
    const params: Array<string | number | boolean | null> = [];
    rows.forEach((row, i) => {
      const base = i * 5;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
      params.push(row.number, row.q, row.r, row.difficultyId, row.isHome);
    });

    await client.query(
      `INSERT INTO sectors (number, q, r, difficulty_id, is_home_base)
       VALUES ${values.join(', ')}`,
      params
    );

    await assignTasksAfterGeneration(client);

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
     ORDER BY dl.slug ASC, s.number ASC`
  );
  return result.rows.map(rowToSectorPublic);
}

export async function countTeams(): Promise<number> {
  const r = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM teams');
  return parseInt(r.rows[0].count, 10);
}

export async function deleteAllSectors(): Promise<{ deleted_count: number; deleted_teams_count: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM task_submissions');
    await client.query('DELETE FROM sector_captures');
    await client.query('DELETE FROM sector_tasks');

    const sectors = await client.query('DELETE FROM sectors RETURNING id');

    await client.query(
      `UPDATE users SET team_id = NULL, team_role = NULL WHERE team_id IS NOT NULL`
    );
    const teams = await client.query('DELETE FROM teams RETURNING id');

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

import { pool } from '../config/db';
import { Sector, SectorPublic, CreateSectorDto, SectorStatus } from '../types/sector';
import { DifficultyLevel, DifficultySlug } from '../types/difficulty';
import { AppError } from '../types/errors';
import { PoolClient } from 'pg';
import { getActiveSeasonId } from './season.service';

type SectorRow = Sector & {
  difficulty_name: string;
  difficulty_slug: string;
  difficulty_influence_reward: number;
  difficulty_experience_reward: number;
  active_submission_team_id: string | null;
};

const SECTOR_SELECT = `
  SELECT s.*,
         dl.name as difficulty_name,
         dl.slug as difficulty_slug,
         dl.influence_reward as difficulty_influence_reward,
         dl.experience_reward as difficulty_experience_reward,
         ts.team_id as active_submission_team_id
  FROM sectors s
  JOIN difficulty_levels dl ON s.difficulty_id = dl.id
  LEFT JOIN task_submissions ts
    ON ts.sector_id = s.id AND ts.status = 'pending'
`;

function rowToSectorPublic(row: SectorRow): SectorPublic {
  const difficulty: DifficultyLevel = {
    id: row.difficulty_id,
    name: row.difficulty_name,
    slug: row.difficulty_slug as DifficultySlug,
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
    active_submission_team_id: row.active_submission_team_id,
  };
}

async function insertSector(
  client: PoolClient,
  dto: CreateSectorDto,
  seasonId: string,
): Promise<Sector> {
  const diffCheck = await client.query(
    'SELECT id FROM difficulty_levels WHERE id = $1',
    [dto.difficulty_id]
  );
  if (diffCheck.rows.length === 0) {
    throw new AppError(400, `Difficulty level not found: ${dto.difficulty_id}`);
  }

  if (dto.task_id) {
    const taskCheck = await client.query(
      'SELECT id FROM tasks WHERE id = $1',
      [dto.task_id]
    );
    if (taskCheck.rows.length === 0) {
      throw new AppError(400, `Task not found: ${dto.task_id}`);
    }
  }

  const result = await client.query<Sector>(
    `INSERT INTO sectors (number, q, r, difficulty_id, task_id, status, season_id)
     VALUES ($1, $2, $3, $4, $5, 'free', $6)
     RETURNING *`,
    [dto.number, dto.q, dto.r, dto.difficulty_id, dto.task_id || null, seasonId]
  );

  return result.rows[0];
}

export async function create(dto: CreateSectorDto): Promise<SectorPublic> {
  const client = await pool.connect();
  let insertedId: string;
  try {
    await client.query('BEGIN');

    const seasonId = await getActiveSeasonId(client);
    const inserted = await insertSector(client, dto, seasonId);
    insertedId = inserted.id;

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const result = await pool.query<SectorRow>(
    `${SECTOR_SELECT} WHERE s.id = $1`,
    [insertedId]
  );
  return rowToSectorPublic(result.rows[0]);
}

export async function getAll(seasonId?: string): Promise<SectorPublic[]> {
  const sid = seasonId ?? (await getActiveSeasonId());
  const result = await pool.query<SectorRow>(
    `${SECTOR_SELECT} WHERE s.season_id = $1 ORDER BY dl.slug ASC, s.number ASC`,
    [sid]
  );
  return result.rows.map(rowToSectorPublic);
}

export async function getById(sectorId: string): Promise<SectorPublic> {
  const result = await pool.query<SectorRow>(
    `${SECTOR_SELECT} WHERE s.id = $1`,
    [sectorId]
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Sector not found');
  }
  return rowToSectorPublic(result.rows[0]);
}

export async function getMap(seasonId?: string): Promise<SectorPublic[]> {
  return getAll(seasonId);
}

export async function createBulk(sectors: CreateSectorDto[]): Promise<SectorPublic[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seasonId = await getActiveSeasonId(client);
    for (const dto of sectors) {
      await insertSector(client, dto, seasonId);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return getAll();
}

export interface SectorTaskRow {
  task_id: string;
  title: string;
  question: string;
  difficulty_slug: DifficultySlug;
}

export async function getSectorTasks(sectorId: string): Promise<SectorTaskRow[]> {
  const sectorRes = await pool.query('SELECT id FROM sectors WHERE id = $1', [sectorId]);
  if (sectorRes.rows.length === 0) {
    throw new AppError(404, 'Sector not found');
  }
  const res = await pool.query<SectorTaskRow>(
    `SELECT t.id AS task_id,
            t.title,
            t.question,
            dl.slug AS difficulty_slug
       FROM sector_tasks st
       JOIN tasks t ON t.id = st.task_id
       JOIN difficulty_levels dl ON dl.id = t.difficulty_id
      WHERE st.sector_id = $1
      ORDER BY t.title ASC`,
    [sectorId],
  );
  return res.rows;
}

export async function attachTask(
  sectorId: string,
  taskId: string,
): Promise<SectorTaskRow[]> {
  // Fetch sector + task difficulties first to give a clear error
  const checkRes = await pool.query<{
    sector_diff: string | null;
    task_diff: string | null;
  }>(
    `SELECT (SELECT difficulty_id FROM sectors WHERE id = $1) AS sector_diff,
            (SELECT difficulty_id FROM tasks WHERE id = $2) AS task_diff`,
    [sectorId, taskId],
  );
  const { sector_diff, task_diff } = checkRes.rows[0];
  if (sector_diff === null) throw new AppError(404, 'Sector not found');
  if (task_diff === null) throw new AppError(404, 'Task not found');
  if (sector_diff !== task_diff) {
    throw new AppError(400, 'Сложность задания не совпадает со сложностью сектора');
  }

  await pool.query(
    `INSERT INTO sector_tasks (sector_id, task_id)
       VALUES ($1, $2)
       ON CONFLICT (sector_id, task_id) DO NOTHING`,
    [sectorId, taskId],
  );
  return getSectorTasks(sectorId);
}

export async function detachTask(
  sectorId: string,
  taskId: string,
): Promise<SectorTaskRow[]> {
  const res = await pool.query(
    'DELETE FROM sector_tasks WHERE sector_id = $1 AND task_id = $2',
    [sectorId, taskId],
  );
  if (res.rowCount === 0) {
    throw new AppError(404, 'Привязка не найдена');
  }
  return getSectorTasks(sectorId);
}

export interface BindingRow {
  sector_id: string;
  task_id: string;
}

export async function getAllBindings(): Promise<BindingRow[]> {
  const res = await pool.query<BindingRow>(
    'SELECT sector_id, task_id FROM sector_tasks ORDER BY sector_id, task_id',
  );
  return res.rows;
}

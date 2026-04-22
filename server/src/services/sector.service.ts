import { pool } from '../config/db';
import { Sector, SectorPublic, CreateSectorDto, SectorStatus } from '../types/sector';
import { DifficultyLevel, DifficultySlug } from '../types/difficulty';
import { AppError } from '../types/errors';
import { PoolClient } from 'pg';

type SectorRow = Sector & {
  difficulty_name: string;
  difficulty_slug: string;
  difficulty_influence_reward: number;
  difficulty_experience_reward: number;
};

const SECTOR_SELECT = `
  SELECT s.*,
         dl.name as difficulty_name,
         dl.slug as difficulty_slug,
         dl.influence_reward as difficulty_influence_reward,
         dl.experience_reward as difficulty_experience_reward
  FROM sectors s
  JOIN difficulty_levels dl ON s.difficulty_id = dl.id
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
    difficulty,
  };
}

async function insertSector(client: PoolClient, dto: CreateSectorDto): Promise<Sector> {
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
    `INSERT INTO sectors (number, q, r, difficulty_id, task_id, status)
     VALUES ($1, $2, $3, $4, $5, 'free')
     RETURNING *`,
    [dto.number, dto.q, dto.r, dto.difficulty_id, dto.task_id || null]
  );

  return result.rows[0];
}

export async function create(dto: CreateSectorDto): Promise<SectorPublic> {
  const client = await pool.connect();
  let insertedId: string;
  try {
    await client.query('BEGIN');

    const inserted = await insertSector(client, dto);
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

export async function getAll(): Promise<SectorPublic[]> {
  const result = await pool.query<SectorRow>(
    `${SECTOR_SELECT} ORDER BY dl.slug ASC, s.number ASC`
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

export async function getMap(): Promise<SectorPublic[]> {
  return getAll();
}

export async function createBulk(sectors: CreateSectorDto[]): Promise<SectorPublic[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const dto of sectors) {
      await insertSector(client, dto);
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

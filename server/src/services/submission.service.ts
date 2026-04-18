import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import {
  TaskSubmission,
  TaskSubmissionWithDetails,
  SubmissionStatus,
} from '../types/task-submission';
import { Sector, SectorActionType } from '../types/sector';

const MAX_FORTIFICATION = 3;

const ACTION_TYPES: ReadonlyArray<SectorActionType> = [
  'capture',
  'fortify',
  'remove_fortification',
  'recapture',
];

function assertActionType(value: unknown): SectorActionType {
  if (typeof value !== 'string' || !ACTION_TYPES.includes(value as SectorActionType)) {
    throw new AppError(400, 'Invalid action_type');
  }
  return value as SectorActionType;
}

async function getUserTeamId(client: PoolClient, userId: string): Promise<string> {
  const res = await client.query<{ team_id: string | null }>(
    'SELECT team_id FROM users WHERE id = $1',
    [userId],
  );
  if (res.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }
  if (!res.rows[0].team_id) {
    throw new AppError(400, 'You are not in a team');
  }
  return res.rows[0].team_id;
}

function validateActionForSector(action: SectorActionType, sector: Sector, teamId: string): void {
  switch (action) {
    case 'capture':
      if (sector.status !== 'free') {
        throw new AppError(400, 'Сектор не свободен');
      }
      return;
    case 'recapture':
      if (sector.status !== 'captured' || sector.captured_by_team_id === teamId) {
        throw new AppError(400, 'Нельзя перехватить этот сектор');
      }
      return;
    case 'fortify':
      if (sector.captured_by_team_id !== teamId) {
        throw new AppError(400, 'Сектор не принадлежит вашей команде');
      }
      if (sector.fortification_level >= MAX_FORTIFICATION) {
        throw new AppError(400, 'Максимальный уровень укрепления уже достигнут');
      }
      return;
    case 'remove_fortification':
      if (sector.captured_by_team_id === teamId) {
        throw new AppError(400, 'Нельзя снимать укрепление со своего сектора');
      }
      if (sector.captured_by_team_id === null) {
        throw new AppError(400, 'Сектор не захвачен');
      }
      if (sector.fortification_level <= 0) {
        throw new AppError(400, 'На секторе нет укрепления');
      }
      return;
  }
}

export async function startAction(
  sectorId: string,
  userId: string,
  rawActionType: unknown,
): Promise<TaskSubmissionWithDetails> {
  const actionType = assertActionType(rawActionType);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teamId = await getUserTeamId(client, userId);

    const sectorRes = await client.query<Sector>(
      'SELECT * FROM sectors WHERE id = $1 FOR UPDATE',
      [sectorId],
    );
    if (sectorRes.rows.length === 0) {
      throw new AppError(404, 'Sector not found');
    }
    const sector = sectorRes.rows[0];

    validateActionForSector(actionType, sector, teamId);

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM task_submissions WHERE sector_id = $1 AND status = 'pending'`,
      [sectorId],
    );
    if (existing.rows.length > 0) {
      throw new AppError(409, 'По этому сектору уже есть заявка на рассмотрении');
    }

    if (actionType === 'capture' || actionType === 'recapture') {
      await client.query(
        `UPDATE sectors SET
           status = 'capturing',
           capturing_by_team_id = $1,
           capture_started_at = NOW(),
           current_action_type = $2
         WHERE id = $3`,
        [teamId, actionType, sectorId],
      );
    } else {
      await client.query(
        'UPDATE sectors SET current_action_type = $1 WHERE id = $2',
        [actionType, sectorId],
      );
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO task_submissions
         (sector_id, team_id, user_id, task_id, action_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [sectorId, teamId, userId, sector.task_id, actionType],
    );

    await client.query('COMMIT');

    return getById(inserted.rows[0].id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const DETAILS_SELECT = `
  SELECT
    sub.id,
    sub.sector_id,
    sub.team_id,
    sub.user_id,
    sub.task_id,
    sub.action_type,
    sub.status,
    sub.comment,
    sub.reviewed_by,
    sub.reviewed_at,
    sub.created_at,
    sub.updated_at,
    t.id AS team_row_id,
    t.name AS team_name,
    t.color AS team_color,
    s.id AS sector_row_id,
    s.number AS sector_number,
    s.q AS sector_q,
    s.r AS sector_r,
    dl.id AS difficulty_id,
    dl.name AS difficulty_name,
    dl.slug AS difficulty_slug,
    dl.influence_reward AS difficulty_influence_reward,
    dl.experience_reward AS difficulty_experience_reward,
    tk.id AS task_row_id,
    tk.title AS task_title,
    tk.question AS task_question,
    u.id AS user_row_id,
    u.username AS user_username
  FROM task_submissions sub
  JOIN teams t ON t.id = sub.team_id
  JOIN sectors s ON s.id = sub.sector_id
  JOIN difficulty_levels dl ON dl.id = s.difficulty_id
  JOIN users u ON u.id = sub.user_id
  LEFT JOIN tasks tk ON tk.id = sub.task_id
`;

type DetailsRow = {
  id: string;
  sector_id: string;
  team_id: string;
  user_id: string;
  task_id: string | null;
  action_type: SectorActionType;
  status: SubmissionStatus;
  comment: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  team_row_id: string;
  team_name: string;
  team_color: string | null;
  sector_row_id: string;
  sector_number: number;
  sector_q: number;
  sector_r: number;
  difficulty_id: string;
  difficulty_name: string;
  difficulty_slug: 'easy' | 'medium' | 'hard' | 'core';
  difficulty_influence_reward: number;
  difficulty_experience_reward: number;
  task_row_id: string | null;
  task_title: string | null;
  task_question: string | null;
  user_row_id: string;
  user_username: string;
};

function rowToDetails(row: DetailsRow): TaskSubmissionWithDetails {
  return {
    id: row.id,
    sector_id: row.sector_id,
    team_id: row.team_id,
    user_id: row.user_id,
    task_id: row.task_id,
    action_type: row.action_type,
    status: row.status,
    comment: row.comment,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    team: {
      id: row.team_row_id,
      name: row.team_name,
      color: row.team_color,
    },
    sector: {
      id: row.sector_row_id,
      number: row.sector_number,
      q: row.sector_q,
      r: row.sector_r,
    },
    difficulty: {
      id: row.difficulty_id,
      name: row.difficulty_name,
      slug: row.difficulty_slug,
      influence_reward: row.difficulty_influence_reward,
      experience_reward: row.difficulty_experience_reward,
    },
    task:
      row.task_row_id && row.task_title !== null && row.task_question !== null
        ? {
            id: row.task_row_id,
            title: row.task_title,
            question: row.task_question,
          }
        : null,
    user: {
      id: row.user_row_id,
      username: row.user_username,
    },
  };
}

export async function getById(id: string): Promise<TaskSubmissionWithDetails> {
  const res = await pool.query<DetailsRow>(
    `${DETAILS_SELECT} WHERE sub.id = $1`,
    [id],
  );
  if (res.rows.length === 0) {
    throw new AppError(404, 'Submission not found');
  }
  return rowToDetails(res.rows[0]);
}

export async function getPending(): Promise<TaskSubmissionWithDetails[]> {
  const res = await pool.query<DetailsRow>(
    `${DETAILS_SELECT} WHERE sub.status = 'pending' ORDER BY sub.created_at ASC`,
  );
  return res.rows.map(rowToDetails);
}

async function applyApprovedEffect(
  client: PoolClient,
  submission: TaskSubmission,
): Promise<void> {
  const sectorRes = await client.query<Sector>(
    'SELECT * FROM sectors WHERE id = $1 FOR UPDATE',
    [submission.sector_id],
  );
  if (sectorRes.rows.length === 0) {
    throw new AppError(404, 'Sector not found');
  }
  const sector = sectorRes.rows[0];

  switch (submission.action_type) {
    case 'capture':
    case 'recapture': {
      await client.query(
        `UPDATE sectors SET
           status = 'captured',
           captured_by_team_id = $1,
           capturing_by_team_id = NULL,
           capture_started_at = NULL,
           current_action_type = NULL
         WHERE id = $2`,
        [submission.team_id, submission.sector_id],
      );
      await client.query(
        'INSERT INTO sector_captures (sector_id, team_id) VALUES ($1, $2)',
        [submission.sector_id, submission.team_id],
      );
      return;
    }
    case 'fortify': {
      const next = Math.min(sector.fortification_level + 1, MAX_FORTIFICATION);
      await client.query(
        `UPDATE sectors SET
           fortification_level = $1,
           current_action_type = NULL
         WHERE id = $2`,
        [next, submission.sector_id],
      );
      return;
    }
    case 'remove_fortification': {
      const next = Math.max(sector.fortification_level - 1, 0);
      await client.query(
        `UPDATE sectors SET
           fortification_level = $1,
           current_action_type = NULL
         WHERE id = $2`,
        [next, submission.sector_id],
      );
      return;
    }
  }
}

export async function approve(
  id: string,
  reviewerId: string,
  comment: string | null,
): Promise<TaskSubmissionWithDetails> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const subRes = await client.query<TaskSubmission>(
      'SELECT * FROM task_submissions WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (subRes.rows.length === 0) {
      throw new AppError(404, 'Submission not found');
    }
    const submission = subRes.rows[0];

    if (submission.status !== 'pending') {
      throw new AppError(409, 'Заявка уже обработана');
    }

    await applyApprovedEffect(client, submission);

    await client.query(
      `UPDATE task_submissions SET
         status = 'approved',
         comment = $1,
         reviewed_by = $2,
         reviewed_at = NOW(),
         updated_at = NOW()
       WHERE id = $3`,
      [comment, reviewerId, id],
    );

    await client.query('COMMIT');
    return getById(id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import {
  TaskSubmission,
  TaskSubmissionWithDetails,
  SubmissionStatus,
  TaskBrief,
  StartActionResponse,
} from '../types/task-submission';
import { Sector, SectorActionType } from '../types/sector';
import { StatName } from '../types/team-stats';
import * as encounterService from './encounter.service';
import * as seasonService from './season.service';

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

/**
 * Resolve which team an action is performed for.
 * Admins drive the field on behalf of a team via `actingTeamId` (no membership
 * required). Other callers fall back to their own team membership.
 */
async function resolveActingTeam(
  client: PoolClient,
  userId: string,
  actingTeamId?: string,
): Promise<string> {
  if (!actingTeamId) {
    return getUserTeamId(client, userId);
  }
  const userRes = await client.query<{ role: string }>(
    'SELECT role FROM users WHERE id = $1',
    [userId],
  );
  if (userRes.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }
  if (userRes.rows[0].role !== 'admin') {
    throw new AppError(403, 'Только администратор может играть за команду');
  }
  const teamRes = await client.query<{ id: string }>(
    'SELECT id FROM teams WHERE id = $1',
    [actingTeamId],
  );
  if (teamRes.rows.length === 0) {
    throw new AppError(404, 'Команда не найдена');
  }
  return actingTeamId;
}

async function getUserTeamId(client: PoolClient, userId: string): Promise<string> {
  const res = await client.query<{ team_id: string | null; team_role: string | null }>(
    'SELECT team_id, team_role FROM users WHERE id = $1',
    [userId],
  );
  if (res.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }
  if (!res.rows[0].team_id) {
    throw new AppError(400, 'You are not in a team');
  }
  // Captains manage team stats, not the field — sector actions are off-limits.
  if (res.rows[0].team_role === 'captain') {
    throw new AppError(403, 'Капитан не может захватывать сектора');
  }
  return res.rows[0].team_id;
}

const NEIGHBOR_OFFSETS: ReadonlyArray<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
];

async function hasAdjacentOwnedSector(
  client: PoolClient,
  sector: Sector,
  teamId: string,
): Promise<boolean> {
  const pairs = NEIGHBOR_OFFSETS.map(([dq, dr]) => [sector.q + dq, sector.r + dr]);
  const placeholders = pairs.map((_, i) => `($${i * 2 + 2}, $${i * 2 + 3})`).join(',');
  const params: Array<string | number> = [teamId];
  pairs.forEach(([q, r]) => params.push(q, r));
  const res = await client.query(
    `SELECT 1 FROM sectors
     WHERE captured_by_team_id = $1 AND (q, r) IN (${placeholders})
     LIMIT 1`,
    params,
  );
  return res.rows.length > 0;
}

async function buildTaskPool(
  client: PoolClient,
  sector: Sector,
): Promise<TaskBrief[]> {
  const mapped = await client.query<TaskBrief>(
    `SELECT t.id, t.title, t.question
       FROM sector_tasks st
       JOIN tasks t ON t.id = st.task_id
      WHERE st.sector_id = $1`,
    [sector.id],
  );
  if (mapped.rows.length > 0) return mapped.rows;

  if (sector.task_id) {
    const direct = await client.query<TaskBrief>(
      'SELECT id, title, question FROM tasks WHERE id = $1',
      [sector.task_id],
    );
    if (direct.rows.length > 0) return direct.rows;
  }

  const fallback = await client.query<TaskBrief>(
    'SELECT id, title, question FROM tasks WHERE difficulty_id = $1',
    [sector.difficulty_id],
  );
  return fallback.rows;
}

function pickRandom<T>(pool: T[]): T | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function validateActionForSector(action: SectorActionType, sector: Sector, teamId: string): void {
  switch (action) {
    case 'capture':
      if (sector.is_home_base) {
        throw new AppError(400, 'Домашний сектор нельзя захватить');
      }
      if (sector.status !== 'free') {
        throw new AppError(400, 'Сектор не свободен');
      }
      return;
    case 'recapture':
      if (sector.is_home_base) {
        throw new AppError(400, 'Домашний сектор нельзя перехватить');
      }
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
      if (sector.is_home_base) {
        throw new AppError(400, 'С домашнего сектора нельзя снять укрепление');
      }
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
  actingTeamId?: string,
): Promise<StartActionResponse> {
  const actionType = assertActionType(rawActionType);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teamId = await resolveActingTeam(client, userId, actingTeamId);

    const sectorRes = await client.query<Sector>(
      'SELECT * FROM sectors WHERE id = $1 FOR UPDATE',
      [sectorId],
    );
    if (sectorRes.rows.length === 0) {
      throw new AppError(404, 'Sector not found');
    }
    const sector = sectorRes.rows[0];

    if (sector.is_special) {
      throw new AppError(400, 'Особый сектор — действия недоступны');
    }

    validateActionForSector(actionType, sector, teamId);

    if (actionType === 'capture' || actionType === 'recapture' || actionType === 'remove_fortification') {
      const adjacent = await hasAdjacentOwnedSector(client, sector, teamId);
      if (!adjacent) {
        throw new AppError(400, 'Сектор не граничит с вашими — действие невозможно');
      }
    }

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM task_submissions WHERE sector_id = $1 AND status = 'pending'`,
      [sectorId],
    );
    if (existing.rows.length > 0) {
      throw new AppError(409, 'По этому сектору уже есть заявка на рассмотрении');
    }

    const teamPending = await client.query<{ id: string }>(
      `SELECT id FROM task_submissions WHERE team_id = $1 AND status = 'pending'`,
      [teamId],
    );
    if (teamPending.rows.length > 0) {
      throw new AppError(409, 'У вашей команды уже есть активное действие — дождитесь модерации');
    }

    const taskPool = await buildTaskPool(client, sector);
    const picked = pickRandom(taskPool);
    const taskId = picked ? picked.id : null;

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
      [sectorId, teamId, userId, taskId, actionType],
    );

    // A capture attempt rolls a random encounter for the acting team; it is
    // shown and resolved inside the capture window.
    let encounterInstanceId: string | null = null;
    if (actionType === 'capture' || actionType === 'recapture') {
      const seasonId = await seasonService.getActiveSeasonId(client);
      encounterInstanceId = await encounterService.rollForCapture(
        client,
        inserted.rows[0].id,
        teamId,
        seasonId,
      );
    }

    await client.query('COMMIT');

    const submission = await getById(inserted.rows[0].id);
    const encounter = encounterInstanceId
      ? await encounterService.getInstanceView(encounterInstanceId)
      : null;
    return { submission, task_pool: taskPool, encounter };
  } catch (error) {
    await client.query('ROLLBACK');
    if (
      error &&
      typeof error === 'object' &&
      (error as { code?: string }).code === '23505'
    ) {
      const constraint = (error as { constraint?: string }).constraint;
      if (constraint === 'idx_task_submissions_one_pending_per_team') {
        throw new AppError(409, 'У вашей команды уже есть активное действие — дождитесь модерации');
      }
      if (constraint === 'idx_task_submissions_one_pending_per_sector') {
        throw new AppError(409, 'По этому сектору уже есть заявка на рассмотрении');
      }
    }
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
  sector_number: number | null;
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

export async function getCurrentForSector(
  sectorId: string,
  userId: string,
): Promise<TaskSubmissionWithDetails | null> {
  const userRes = await pool.query<{ team_id: string | null; role: 'admin' | 'student' }>(
    'SELECT team_id, role FROM users WHERE id = $1',
    [userId],
  );
  if (userRes.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }
  const { team_id, role } = userRes.rows[0];

  const res = await pool.query<DetailsRow>(
    `${DETAILS_SELECT}
     WHERE sub.sector_id = $1 AND sub.status = 'pending'
     ORDER BY sub.created_at DESC
     LIMIT 1`,
    [sectorId],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  if (role !== 'admin' && row.team_id !== team_id) return null;
  return rowToDetails(row);
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

async function revertPendingEffect(
  client: PoolClient,
  submission: TaskSubmission,
): Promise<void> {
  if (submission.action_type === 'capture' || submission.action_type === 'recapture') {
    await client.query(
      `UPDATE sectors SET
         status = CASE WHEN captured_by_team_id IS NULL THEN 'free' ELSE 'captured' END,
         capturing_by_team_id = NULL,
         capture_started_at = NULL,
         current_action_type = NULL
       WHERE id = $1`,
      [submission.sector_id],
    );
  } else {
    await client.query(
      'UPDATE sectors SET current_action_type = NULL WHERE id = $1',
      [submission.sector_id],
    );
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

export async function reject(
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

    await revertPendingEffect(client, submission);

    await client.query(
      `UPDATE task_submissions SET
         status = 'rejected',
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

export interface DropResponse {
  submission: TaskSubmissionWithDetails;
  penalty: { influence: number; experience: number };
  level_before: number;
  level_after: number;
  removed_stats: StatName[];
}

async function calculateLevelInTx(
  client: PoolClient,
  teamId: string,
): Promise<number> {
  const expRes = await client.query<{ experience: number }>(
    `SELECT GREATEST(
       0,
       (SELECT COALESCE(SUM(dl.experience_reward), 0)
          FROM sector_captures sc
          JOIN sectors s ON sc.sector_id = s.id
          JOIN difficulty_levels dl ON dl.id = s.difficulty_id
         WHERE sc.team_id = $1)
       - COALESCE((SELECT SUM(experience) FROM team_penalties WHERE team_id = $1), 0)
     )::int AS experience`,
    [teamId],
  );
  const experience = expRes.rows[0].experience;

  const settingsRes = await client.query<{ key: string; value: string }>(
    `SELECT key, value FROM game_settings
      WHERE key IN ('base_exp_threshold', 'exp_step')`,
  );
  let baseExp = 50;
  let expStep = 10;
  for (const row of settingsRes.rows) {
    if (row.key === 'base_exp_threshold') baseExp = Number(row.value);
    if (row.key === 'exp_step') expStep = Number(row.value);
  }

  let level = 0;
  let remaining = experience;
  let threshold = baseExp;
  while (remaining >= threshold) {
    remaining -= threshold;
    level++;
    threshold += expStep;
  }
  return level;
}

export async function dropPending(
  submissionId: string,
  userId: string,
): Promise<DropResponse> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teamId = await getUserTeamId(client, userId);

    const subRes = await client.query<TaskSubmission>(
      'SELECT * FROM task_submissions WHERE id = $1 FOR UPDATE',
      [submissionId],
    );
    if (subRes.rows.length === 0) {
      throw new AppError(404, 'Submission not found');
    }
    const submission = subRes.rows[0];
    if (submission.team_id !== teamId) {
      throw new AppError(403, 'Это задание не вашей команды');
    }
    if (submission.status !== 'pending') {
      throw new AppError(409, 'Заявка уже закрыта');
    }

    const sectorRewardsRes = await client.query<{
      influence_reward: number;
      experience_reward: number;
    }>(
      `SELECT dl.influence_reward, dl.experience_reward
         FROM sectors s
         JOIN difficulty_levels dl ON dl.id = s.difficulty_id
        WHERE s.id = $1
        FOR UPDATE OF s`,
      [submission.sector_id],
    );
    if (sectorRewardsRes.rows.length === 0) {
      throw new AppError(404, 'Sector not found');
    }
    const { influence_reward, experience_reward } = sectorRewardsRes.rows[0];

    const penaltyInfluence = Math.floor(influence_reward / 2);
    const penaltyExperience = Math.floor(experience_reward / 2);

    const levelBefore = await calculateLevelInTx(client, teamId);

    await client.query(
      `INSERT INTO team_penalties
         (team_id, influence, experience, reason, sector_id, submission_id)
       VALUES ($1, $2, $3, 'drop', $4, $5)`,
      [
        teamId,
        penaltyInfluence,
        penaltyExperience,
        submission.sector_id,
        submission.id,
      ],
    );

    await revertPendingEffect(client, submission);

    await client.query(
      `UPDATE task_submissions SET
         status = 'rejected',
         comment = $1,
         reviewed_at = NOW(),
         updated_at = NOW()
       WHERE id = $2`,
      ['Сектор сброшен командой', submissionId],
    );

    const levelAfter = await calculateLevelInTx(client, teamId);
    const levelsLost = Math.max(0, levelBefore - levelAfter);
    const removedStats: StatName[] = [];
    for (let i = 0; i < levelsLost; i++) {
      const removed = await client.query<{ stat_name: StatName }>(
        `DELETE FROM team_stat_upgrades
          WHERE id = (
            SELECT id FROM team_stat_upgrades
             WHERE team_id = $1
             ORDER BY random()
             LIMIT 1
          )
          RETURNING stat_name`,
        [teamId],
      );
      if (removed.rows.length === 0) break;
      removedStats.push(removed.rows[0].stat_name);
    }

    await client.query('COMMIT');

    const updated = await getById(submissionId);
    return {
      submission: updated,
      penalty: { influence: penaltyInfluence, experience: penaltyExperience },
      level_before: levelBefore,
      level_after: levelAfter,
      removed_stats: removedStats,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

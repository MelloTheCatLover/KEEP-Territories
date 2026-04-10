import { pool } from '../config/db';
import { Sector } from '../types/sector';
import { TaskPublic, TaskOptionPublic } from '../types/task';
import { DifficultyLevel } from '../types/difficulty';
import { AppError } from '../types/errors';
import * as taskService from './task.service';

export interface SubmitAnswerResult {
  correct: boolean;
  sector: Sector;
  experience_gained: number;
  influence_gained: number;
}

export async function startCapture(sectorId: string, teamId: string): Promise<Sector> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sectorResult = await client.query<Sector>(
      'SELECT * FROM sectors WHERE id = $1 FOR UPDATE',
      [sectorId]
    );
    if (sectorResult.rows.length === 0) {
      throw new AppError(404, 'Sector not found');
    }
    const sector = sectorResult.rows[0];

    if (sector.status === 'capturing') {
      throw new AppError(400, 'Сектор уже захватывается');
    }
    if (sector.status === 'captured' && sector.captured_by_team_id === teamId) {
      throw new AppError(400, 'Вы уже владеете этим сектором');
    }

    // Determine task — validate it exists
    if (sector.task_id) {
      await taskService.getById(sector.task_id);
    } else {
      // Check that random tasks exist for this difficulty
      await taskService.getRandomByDifficulty(sector.difficulty_id);
    }

    const result = await client.query<Sector>(
      `UPDATE sectors SET
        status = 'capturing',
        capturing_by_team_id = $1,
        capture_started_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [teamId, sectorId]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getTask(sectorId: string, teamId: string): Promise<TaskPublic> {
  const sectorResult = await pool.query<Sector>(
    'SELECT * FROM sectors WHERE id = $1',
    [sectorId]
  );
  if (sectorResult.rows.length === 0) {
    throw new AppError(404, 'Sector not found');
  }
  const sector = sectorResult.rows[0];

  if (sector.status !== 'capturing' || sector.capturing_by_team_id !== teamId) {
    throw new AppError(403, 'Вы не захватываете этот сектор');
  }

  const taskWithOptions = sector.task_id
    ? await taskService.getById(sector.task_id)
    : await taskService.getRandomByDifficulty(sector.difficulty_id);

  // Strip is_correct from options
  const publicOptions: TaskOptionPublic[] = taskWithOptions.options.map((o) => ({
    id: o.id,
    text: o.text,
    sort_order: o.sort_order,
  }));

  return {
    id: taskWithOptions.id,
    title: taskWithOptions.title,
    question: taskWithOptions.question,
    difficulty: taskWithOptions.difficulty,
    options: publicOptions,
  };
}

export async function submitAnswer(
  sectorId: string,
  teamId: string,
  optionId: string
): Promise<SubmitAnswerResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sectorResult = await client.query<Sector>(
      'SELECT * FROM sectors WHERE id = $1 FOR UPDATE',
      [sectorId]
    );
    if (sectorResult.rows.length === 0) {
      throw new AppError(404, 'Sector not found');
    }
    const sector = sectorResult.rows[0];

    if (sector.status !== 'capturing' || sector.capturing_by_team_id !== teamId) {
      throw new AppError(403, 'Вы не захватываете этот сектор');
    }

    const optionResult = await client.query<{ is_correct: boolean; task_id: string }>(
      'SELECT is_correct, task_id FROM task_options WHERE id = $1',
      [optionId]
    );
    if (optionResult.rows.length === 0) {
      throw new AppError(400, 'Option not found');
    }

    const { is_correct } = optionResult.rows[0];
    const wasCaputredByOther = sector.captured_by_team_id !== null;

    if (is_correct) {
      const updatedResult = await client.query<Sector>(
        `UPDATE sectors SET
          status = 'captured',
          captured_by_team_id = $1,
          capturing_by_team_id = NULL,
          capture_started_at = NULL
         WHERE id = $2
         RETURNING *`,
        [teamId, sectorId]
      );

      await client.query(
        'INSERT INTO sector_captures (sector_id, team_id) VALUES ($1, $2)',
        [sectorId, teamId]
      );

      const diffResult = await client.query<DifficultyLevel>(
        'SELECT * FROM difficulty_levels WHERE id = $1',
        [sector.difficulty_id]
      );
      const diff = diffResult.rows[0];

      await client.query('COMMIT');

      return {
        correct: true,
        sector: updatedResult.rows[0],
        experience_gained: diff.experience_reward,
        influence_gained: diff.influence_reward,
      };
    } else {
      // Wrong answer — revert to previous state
      const revertStatus = wasCaputredByOther ? 'captured' : 'free';
      const revertCapturedBy = wasCaputredByOther ? sector.captured_by_team_id : null;

      const updatedResult = await client.query<Sector>(
        `UPDATE sectors SET
          status = $1,
          captured_by_team_id = $2,
          capturing_by_team_id = NULL,
          capture_started_at = NULL
         WHERE id = $3
         RETURNING *`,
        [revertStatus, revertCapturedBy, sectorId]
      );

      await client.query('COMMIT');

      return {
        correct: false,
        sector: updatedResult.rows[0],
        experience_gained: 0,
        influence_gained: 0,
      };
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelCapture(sectorId: string, teamId: string): Promise<Sector> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sectorResult = await client.query<Sector>(
      'SELECT * FROM sectors WHERE id = $1 FOR UPDATE',
      [sectorId]
    );
    if (sectorResult.rows.length === 0) {
      throw new AppError(404, 'Sector not found');
    }
    const sector = sectorResult.rows[0];

    if (sector.status !== 'capturing' || sector.capturing_by_team_id !== teamId) {
      throw new AppError(403, 'Вы не захватываете этот сектор');
    }

    const wasCaputredByOther = sector.captured_by_team_id !== null;
    const revertStatus = wasCaputredByOther ? 'captured' : 'free';
    const revertCapturedBy = wasCaputredByOther ? sector.captured_by_team_id : null;

    const result = await client.query<Sector>(
      `UPDATE sectors SET
        status = $1,
        captured_by_team_id = $2,
        capturing_by_team_id = NULL,
        capture_started_at = NULL
       WHERE id = $3
       RETURNING *`,
      [revertStatus, revertCapturedBy, sectorId]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

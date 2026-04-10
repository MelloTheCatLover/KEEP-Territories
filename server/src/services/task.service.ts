import { pool } from '../config/db';
import { Task, TaskOption, TaskWithOptions, CreateTaskDto } from '../types/task';
import { DifficultyLevel, DifficultySlug } from '../types/difficulty';
import { AppError } from '../types/errors';

export async function create(dto: CreateTaskDto): Promise<TaskWithOptions> {
  if (dto.options.length < 2) {
    throw new AppError(400, 'Task must have at least 2 options');
  }
  if (!dto.options.some((o) => o.is_correct)) {
    throw new AppError(400, 'Task must have at least one correct option');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const diffCheck = await client.query<DifficultyLevel>(
      'SELECT * FROM difficulty_levels WHERE id = $1',
      [dto.difficulty_id]
    );
    if (diffCheck.rows.length === 0) {
      throw new AppError(400, 'Difficulty level not found');
    }
    const difficulty = diffCheck.rows[0];

    const taskResult = await client.query<Task>(
      `INSERT INTO tasks (title, question, difficulty_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [dto.title, dto.question, dto.difficulty_id]
    );
    const task = taskResult.rows[0];

    const options: TaskOption[] = [];
    for (const opt of dto.options) {
      const optResult = await client.query<TaskOption>(
        `INSERT INTO task_options (task_id, text, is_correct, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [task.id, opt.text, opt.is_correct, opt.sort_order]
      );
      options.push(optResult.rows[0]);
    }

    await client.query('COMMIT');

    return { ...task, options, difficulty };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getById(taskId: string): Promise<TaskWithOptions> {
  const taskResult = await pool.query<Task & { difficulty_name: string; difficulty_slug: string; difficulty_influence_reward: number; difficulty_experience_reward: number }>(
    `SELECT t.*,
            dl.name as difficulty_name,
            dl.slug as difficulty_slug,
            dl.influence_reward as difficulty_influence_reward,
            dl.experience_reward as difficulty_experience_reward
     FROM tasks t
     JOIN difficulty_levels dl ON t.difficulty_id = dl.id
     WHERE t.id = $1`,
    [taskId]
  );
  if (taskResult.rows.length === 0) {
    throw new AppError(404, 'Task not found');
  }

  const row = taskResult.rows[0];
  const difficulty: DifficultyLevel = {
    id: row.difficulty_id,
    name: row.difficulty_name,
    slug: row.difficulty_slug as DifficultySlug,
    influence_reward: row.difficulty_influence_reward,
    experience_reward: row.difficulty_experience_reward,
  };

  const optionsResult = await pool.query<TaskOption>(
    'SELECT * FROM task_options WHERE task_id = $1 ORDER BY sort_order',
    [taskId]
  );

  return {
    id: row.id,
    title: row.title,
    question: row.question,
    difficulty_id: row.difficulty_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    options: optionsResult.rows,
    difficulty,
  };
}

export async function getByDifficulty(difficultyId: string): Promise<Task[]> {
  const result = await pool.query<Task>(
    'SELECT * FROM tasks WHERE difficulty_id = $1 ORDER BY created_at DESC',
    [difficultyId]
  );
  return result.rows;
}

export async function getRandomByDifficulty(difficultyId: string): Promise<TaskWithOptions> {
  const taskResult = await pool.query<Task>(
    'SELECT * FROM tasks WHERE difficulty_id = $1 ORDER BY RANDOM() LIMIT 1',
    [difficultyId]
  );
  if (taskResult.rows.length === 0) {
    throw new AppError(404, 'No tasks found for this difficulty');
  }
  return getById(taskResult.rows[0].id);
}

export async function getAll(): Promise<(Task & { difficulty: DifficultyLevel })[]> {
  const result = await pool.query<Task & { difficulty_name: string; difficulty_slug: string; difficulty_influence_reward: number; difficulty_experience_reward: number }>(
    `SELECT t.*,
            dl.name as difficulty_name,
            dl.slug as difficulty_slug,
            dl.influence_reward as difficulty_influence_reward,
            dl.experience_reward as difficulty_experience_reward
     FROM tasks t
     JOIN difficulty_levels dl ON t.difficulty_id = dl.id
     ORDER BY t.created_at DESC`
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    question: row.question,
    difficulty_id: row.difficulty_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    difficulty: {
      id: row.difficulty_id,
      name: row.difficulty_name,
      slug: row.difficulty_slug as DifficultySlug,
      influence_reward: row.difficulty_influence_reward,
      experience_reward: row.difficulty_experience_reward,
    },
  }));
}

export async function update(taskId: string, dto: Partial<CreateTaskDto>): Promise<TaskWithOptions> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM tasks WHERE id = $1', [taskId]);
    if (existing.rows.length === 0) {
      throw new AppError(404, 'Task not found');
    }

    if (dto.difficulty_id) {
      const diffCheck = await client.query(
        'SELECT id FROM difficulty_levels WHERE id = $1',
        [dto.difficulty_id]
      );
      if (diffCheck.rows.length === 0) {
        throw new AppError(400, 'Difficulty level not found');
      }
    }

    if (dto.options) {
      if (dto.options.length < 2) {
        throw new AppError(400, 'Task must have at least 2 options');
      }
      if (!dto.options.some((o) => o.is_correct)) {
        throw new AppError(400, 'Task must have at least one correct option');
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (dto.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(dto.title);
    }
    if (dto.question !== undefined) {
      updates.push(`question = $${paramIndex++}`);
      values.push(dto.question);
    }
    if (dto.difficulty_id !== undefined) {
      updates.push(`difficulty_id = $${paramIndex++}`);
      values.push(dto.difficulty_id);
    }

    if (updates.length > 0) {
      values.push(taskId);
      await client.query(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    }

    if (dto.options) {
      await client.query('DELETE FROM task_options WHERE task_id = $1', [taskId]);

      for (const opt of dto.options) {
        await client.query(
          `INSERT INTO task_options (task_id, text, is_correct, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [taskId, opt.text, opt.is_correct, opt.sort_order]
        );
      }
    }

    await client.query('COMMIT');

    return getById(taskId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function remove(taskId: string): Promise<void> {
  const result = await pool.query('DELETE FROM tasks WHERE id = $1', [taskId]);
  if (result.rowCount === 0) {
    throw new AppError(404, 'Task not found');
  }
}

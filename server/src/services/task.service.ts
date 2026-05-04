import { PoolClient } from 'pg';
import { pool } from '../config/db';
import {
  Task,
  TaskOption,
  TaskWithOptions,
  TaskTestCase,
  CreateTaskDto,
  CodeLanguage,
} from '../types/task';
import { DifficultyLevel, DifficultySlug } from '../types/difficulty';
import { AppError } from '../types/errors';

const VALID_LANGUAGES: CodeLanguage[] = ['python', 'pascal'];

function normalizeLanguage(value: unknown): CodeLanguage | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !VALID_LANGUAGES.includes(value as CodeLanguage)) {
    throw new AppError(400, 'Invalid code_language (expected python or pascal)');
  }
  return value as CodeLanguage;
}

function validateTestCases(
  cases: CreateTaskDto['test_cases'] | undefined,
  language: CodeLanguage | null,
): NonNullable<CreateTaskDto['test_cases']> {
  if (!cases || cases.length === 0) return [];
  if (language === null) {
    throw new AppError(400, 'test_cases require code_language to be set');
  }
  for (const tc of cases) {
    if (typeof tc.input !== 'string' || typeof tc.expected_output !== 'string') {
      throw new AppError(400, 'Test case input and expected_output must be strings');
    }
    if (!Number.isInteger(tc.ord) || tc.ord < 0) {
      throw new AppError(400, 'Test case ord must be non-negative integer');
    }
  }
  const seen = new Set<number>();
  for (const tc of cases) {
    if (seen.has(tc.ord)) throw new AppError(400, 'Test case ord must be unique');
    seen.add(tc.ord);
  }
  return cases;
}

async function loadTestCases(client: PoolClient, taskId: string): Promise<TaskTestCase[]> {
  const res = await client.query<TaskTestCase>(
    'SELECT * FROM task_test_cases WHERE task_id = $1 ORDER BY ord',
    [taskId],
  );
  return res.rows;
}

async function replaceTestCases(
  client: PoolClient,
  taskId: string,
  cases: NonNullable<CreateTaskDto['test_cases']>,
): Promise<void> {
  await client.query('DELETE FROM task_test_cases WHERE task_id = $1', [taskId]);
  for (const tc of cases) {
    await client.query(
      `INSERT INTO task_test_cases (task_id, ord, input, expected_output)
       VALUES ($1, $2, $3, $4)`,
      [taskId, tc.ord, tc.input, tc.expected_output],
    );
  }
}

export async function create(dto: CreateTaskDto): Promise<TaskWithOptions> {
  if (dto.options.length > 0 && dto.options.length < 2) {
    throw new AppError(400, 'Task must have at least 2 options');
  }
  if (dto.options.length > 0 && !dto.options.some((o) => o.is_correct)) {
    throw new AppError(400, 'Task must have at least one correct option');
  }

  const language = normalizeLanguage(dto.code_language);
  const codeTemplate = dto.code_template ?? null;
  const testCases = validateTestCases(dto.test_cases, language);

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
      `INSERT INTO tasks (title, question, difficulty_id, code_language, code_template)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [dto.title, dto.question, dto.difficulty_id, language, codeTemplate]
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

    if (testCases.length > 0) {
      await replaceTestCases(client, task.id, testCases);
    }

    const test_cases = await loadTestCases(client, task.id);
    await client.query('COMMIT');

    return { ...task, options, difficulty, test_cases };
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

  const testsResult = await pool.query<TaskTestCase>(
    'SELECT * FROM task_test_cases WHERE task_id = $1 ORDER BY ord',
    [taskId]
  );

  return {
    id: row.id,
    title: row.title,
    question: row.question,
    difficulty_id: row.difficulty_id,
    code_language: row.code_language,
    code_template: row.code_template,
    created_at: row.created_at,
    updated_at: row.updated_at,
    options: optionsResult.rows,
    difficulty,
    test_cases: testsResult.rows,
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

export async function getAll(): Promise<(Task & { difficulty: DifficultyLevel; test_cases_count: number })[]> {
  const result = await pool.query<Task & {
    difficulty_name: string;
    difficulty_slug: string;
    difficulty_influence_reward: number;
    difficulty_experience_reward: number;
    test_cases_count: string;
  }>(
    `SELECT t.*,
            dl.name as difficulty_name,
            dl.slug as difficulty_slug,
            dl.influence_reward as difficulty_influence_reward,
            dl.experience_reward as difficulty_experience_reward,
            (SELECT COUNT(*) FROM task_test_cases WHERE task_id = t.id) as test_cases_count
     FROM tasks t
     JOIN difficulty_levels dl ON t.difficulty_id = dl.id
     ORDER BY t.created_at DESC`
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    question: row.question,
    difficulty_id: row.difficulty_id,
    code_language: row.code_language,
    code_template: row.code_template,
    created_at: row.created_at,
    updated_at: row.updated_at,
    test_cases_count: Number(row.test_cases_count),
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

    const existing = await client.query<Task>('SELECT * FROM tasks WHERE id = $1', [taskId]);
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
      if (dto.options.length > 0 && dto.options.length < 2) {
        throw new AppError(400, 'Task must have at least 2 options');
      }
      if (dto.options.length > 0 && !dto.options.some((o) => o.is_correct)) {
        throw new AppError(400, 'Task must have at least one correct option');
      }
    }

    const language =
      dto.code_language === undefined
        ? existing.rows[0].code_language
        : normalizeLanguage(dto.code_language);

    if (dto.test_cases !== undefined) {
      validateTestCases(dto.test_cases, language);
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
    if (dto.code_language !== undefined) {
      updates.push(`code_language = $${paramIndex++}`);
      values.push(language);
    }
    if (dto.code_template !== undefined) {
      updates.push(`code_template = $${paramIndex++}`);
      values.push(dto.code_template);
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

    if (dto.test_cases !== undefined) {
      await replaceTestCases(client, taskId, dto.test_cases);
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

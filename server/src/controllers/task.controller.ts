import { Request, Response, NextFunction } from 'express';
import * as taskService from '../services/task.service';
import { AppError } from '../types/errors';
import { CreateTaskDto, CreateTaskTestCaseDto } from '../types/task';

function parseTestCases(raw: unknown): CreateTaskTestCaseDto[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new AppError(400, 'test_cases must be an array');
  }
  return raw.map((tc, idx) => {
    if (!tc || typeof tc !== 'object') {
      throw new AppError(400, `test_cases[${idx}] must be an object`);
    }
    const obj = tc as Record<string, unknown>;
    const ord = typeof obj.ord === 'number' ? obj.ord : idx;
    const input = typeof obj.input === 'string' ? obj.input : '';
    const expected = obj.expected_output;
    if (typeof expected !== 'string') {
      throw new AppError(400, `test_cases[${idx}].expected_output must be a string`);
    }
    return { ord, input, expected_output: expected };
  });
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, question, difficulty_id, options, code_language, code_template, test_cases } =
      req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      throw new AppError(400, 'Title is required');
    }
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      throw new AppError(400, 'Question is required');
    }
    if (!difficulty_id || typeof difficulty_id !== 'string') {
      throw new AppError(400, 'difficulty_id is required');
    }
    if (options !== undefined) {
      if (!Array.isArray(options)) {
        throw new AppError(400, 'options must be an array');
      }
      if (options.length > 0 && options.length < 2) {
        throw new AppError(400, 'At least 2 options are required');
      }
      if (
        options.length > 0 &&
        !options.some((o: { is_correct?: boolean }) => o.is_correct === true)
      ) {
        throw new AppError(400, 'At least one option must be correct');
      }
    }

    const dto: CreateTaskDto = {
      title: title.trim(),
      question: question.trim(),
      difficulty_id,
      options: Array.isArray(options) ? options : [],
    };
    if (code_language !== undefined) dto.code_language = code_language;
    if (code_template !== undefined) dto.code_template = code_template;
    const parsedTests = parseTestCases(test_cases);
    if (parsedTests !== undefined) dto.test_cases = parsedTests;

    const task = await taskService.create(dto);

    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await taskService.getById(req.params.id);
    res.status(200).json(task);
  } catch (error) {
    next(error);
  }
}

export async function getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { difficulty_id } = req.query;

    if (difficulty_id && typeof difficulty_id === 'string') {
      const tasks = await taskService.getByDifficulty(difficulty_id);
      res.status(200).json(tasks);
      return;
    }

    const tasks = await taskService.getAll();
    res.status(200).json(tasks);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, question, difficulty_id, options, code_language, code_template, test_cases } =
      req.body;
    const dto: Partial<CreateTaskDto> = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        throw new AppError(400, 'Title cannot be empty');
      }
      dto.title = title.trim();
    }
    if (question !== undefined) {
      if (typeof question !== 'string' || question.trim().length === 0) {
        throw new AppError(400, 'Question cannot be empty');
      }
      dto.question = question.trim();
    }
    if (difficulty_id !== undefined) {
      dto.difficulty_id = difficulty_id;
    }
    if (options !== undefined) {
      if (!Array.isArray(options)) {
        throw new AppError(400, 'options must be an array');
      }
      if (options.length > 0 && options.length < 2) {
        throw new AppError(400, 'At least 2 options are required');
      }
      if (
        options.length > 0 &&
        !options.some((o: { is_correct?: boolean }) => o.is_correct === true)
      ) {
        throw new AppError(400, 'At least one option must be correct');
      }
      dto.options = options;
    }
    if (code_language !== undefined) dto.code_language = code_language;
    if (code_template !== undefined) dto.code_template = code_template;
    const parsedTests = parseTestCases(test_cases);
    if (parsedTests !== undefined) dto.test_cases = parsedTests;

    const task = await taskService.update(req.params.id, dto);
    res.status(200).json(task);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    await taskService.remove(req.params.id);
    res.status(200).json({ message: 'Task deleted' });
  } catch (error) {
    next(error);
  }
}

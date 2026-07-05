import { Request, Response, NextFunction } from 'express';
import * as sectorService from '../services/sector.service';
import * as specialSectorService from '../services/special-sector.service';
import * as audit from '../services/audit.service';
import { CreateSectorDto } from '../types/sector';
import { AppError } from '../types/errors';

function validateSectorDto(dto: Record<string, unknown>): CreateSectorDto {
  const { number, q, r, difficulty_id, task_id } = dto;

  if (number === undefined || typeof number !== 'number' || !Number.isInteger(number) || number <= 0) {
    throw new AppError(400, 'number must be a positive integer');
  }
  if (q === undefined || typeof q !== 'number' || !Number.isInteger(q)) {
    throw new AppError(400, 'q must be an integer');
  }
  if (r === undefined || typeof r !== 'number' || !Number.isInteger(r)) {
    throw new AppError(400, 'r must be an integer');
  }
  if (!difficulty_id || typeof difficulty_id !== 'string') {
    throw new AppError(400, 'difficulty_id is required');
  }

  const result: CreateSectorDto = { number, q, r, difficulty_id };
  if (task_id !== undefined) {
    if (typeof task_id !== 'string') {
      throw new AppError(400, 'task_id must be a string');
    }
    result.task_id = task_id;
  }

  return result;
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = validateSectorDto(req.body);
    const sector = await sectorService.create(dto);
    res.status(201).json(sector);
  } catch (error) {
    next(error);
  }
}

export async function captureSpecial(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const assignments = specialSectorService.parseAssignments(req.body?.assignments);
    const result = await specialSectorService.captureSpecialSector(req.params.id, assignments);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'sector.special_capture',
      entityType: 'sector',
      entityId: req.params.id,
      summary: `Админ провёл особый захват сектора (${result.awards.length} мест)`,
      metadata: { sector_id: req.params.id, awards: result.awards },
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function createBulk(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sectors } = req.body;

    if (!Array.isArray(sectors) || sectors.length === 0) {
      throw new AppError(400, 'sectors must be a non-empty array');
    }

    const dtos = sectors.map((s: Record<string, unknown>, i: number) => {
      try {
        return validateSectorDto(s);
      } catch (error) {
        if (error instanceof AppError) {
          throw new AppError(400, `Sector [${i}]: ${error.message}`);
        }
        throw error;
      }
    });

    const result = await sectorService.createBulk(dtos);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sectors = await sectorService.getAll();
    res.status(200).json(sectors);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const sector = await sectorService.getById(req.params.id);
    res.status(200).json(sector);
  } catch (error) {
    next(error);
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getMap(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = req.query.season_id;
    let seasonId: string | undefined;
    if (typeof raw === 'string' && raw.length > 0) {
      if (!UUID_REGEX.test(raw)) throw new AppError(400, 'Invalid season_id');
      seasonId = raw;
    }
    const sectors = await sectorService.getMap(seasonId);
    res.status(200).json(sectors);
  } catch (error) {
    next(error);
  }
}

export async function getTimelapse(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const raw = req.query.season_id;
    let seasonId: string | undefined;
    if (typeof raw === 'string' && raw.length > 0) {
      if (!UUID_REGEX.test(raw)) throw new AppError(400, 'Invalid season_id');
      seasonId = raw;
    }
    const data = await sectorService.getTimelapse(seasonId);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}

export async function listSectorTasks(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tasks = await sectorService.getSectorTasks(req.params.id);
    res.status(200).json({ tasks });
  } catch (error) {
    next(error);
  }
}

export async function attachSectorTask(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const taskId = req.body?.task_id;
    if (typeof taskId !== 'string' || taskId.length === 0) {
      throw new AppError(400, 'task_id обязателен');
    }
    const tasks = await sectorService.attachTask(req.params.id, taskId);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'sector_task.attach',
      entityType: 'sector',
      entityId: req.params.id,
      summary: 'Админ привязал задание к сектору',
      metadata: { sector_id: req.params.id, task_id: taskId },
    });
    res.status(200).json({ tasks });
  } catch (error) {
    next(error);
  }
}

export async function detachSectorTask(
  req: Request<{ id: string; taskId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tasks = await sectorService.detachTask(req.params.id, req.params.taskId);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'sector_task.detach',
      entityType: 'sector',
      entityId: req.params.id,
      summary: 'Админ отвязал задание от сектора',
      metadata: { sector_id: req.params.id, task_id: req.params.taskId },
    });
    res.status(200).json({ tasks });
  } catch (error) {
    next(error);
  }
}

export async function getBindings(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const bindings = await sectorService.getAllBindings();
    res.status(200).json({ bindings });
  } catch (error) {
    next(error);
  }
}

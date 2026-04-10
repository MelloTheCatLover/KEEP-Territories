import { Request, Response, NextFunction } from 'express';
import * as sectorService from '../services/sector.service';
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

export async function getMap(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sectors = await sectorService.getMap();
    res.status(200).json(sectors);
  } catch (error) {
    next(error);
  }
}

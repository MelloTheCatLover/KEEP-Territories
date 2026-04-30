import { Request, Response, NextFunction } from 'express';
import * as mapGeneratorService from '../services/map-generator.service';

export async function generateMap(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const config = mapGeneratorService.validateMapConfig(req.body);
    const result = await mapGeneratorService.generateMap(config);
    res.status(201).json({ sectors: result, count: result.length });
  } catch (err) {
    next(err);
  }
}

export async function deleteAll(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await mapGeneratorService.deleteAllSectors();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getStatus(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teams_count = await mapGeneratorService.countTeams();
    res.status(200).json({ teams_count });
  } catch (err) {
    next(err);
  }
}

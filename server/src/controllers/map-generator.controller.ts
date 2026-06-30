import { Request, Response, NextFunction } from 'express';
import * as mapGeneratorService from '../services/map-generator.service';
import * as audit from '../services/audit.service';

export async function generateMap(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await mapGeneratorService.generateMap();
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'map.generate',
      entityType: 'map',
      summary: `Админ сгенерировал карту (${result.length} секторов)`,
      metadata: { count: result.length },
    });
    res.status(201).json({ sectors: result, count: result.length });
  } catch (err) {
    next(err);
  }
}

export async function deleteAll(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await mapGeneratorService.deleteAllSectors();
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'map.clear',
      entityType: 'map',
      summary: `Админ удалил карту (${result.deleted_count} секторов, ${result.deleted_teams_count} команд)`,
      metadata: result,
    });
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

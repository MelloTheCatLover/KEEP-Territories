import { Request, Response, NextFunction } from 'express';
import * as diversionService from '../services/diversion.service';
import * as audit from '../services/audit.service';
import { AppError } from '../types/errors';

export async function getCatalog(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json({ diversions: diversionService.DIVERSIONS });
  } catch (error) {
    next(error);
  }
}

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(await diversionService.list());
  } catch (error) {
    next(error);
  }
}

export async function cast(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const casterTeamId = req.body?.caster_team_id;
    if (typeof casterTeamId !== 'string' || casterTeamId.length === 0) {
      throw new AppError(400, 'Не указана команда-диверсант');
    }
    const view = await diversionService.cast({
      casterTeamId,
      kind: req.body?.kind,
      targetTeamId: req.body?.target_team_id ?? null,
      sectorId: req.body?.sector_id ?? null,
    });
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: view.caster_team_id,
      action: 'diversion.cast',
      entityType: 'diversion',
      entityId: view.id,
      summary: `Диверсия «${view.title}»${
        view.target_team_name ? ` по команде ${view.target_team_name}` : ''
      }`,
      metadata: {
        kind: view.kind,
        status: view.status,
        target_team_id: view.target_team_id,
        sector_id: view.sector_id,
        note: view.note,
      },
    });
    res.status(201).json(view);
  } catch (error) {
    next(error);
  }
}

export async function cancel(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const view = await diversionService.cancel(req.params.id);
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: view.caster_team_id,
      action: 'diversion.cancel',
      entityType: 'diversion',
      entityId: view.id,
      summary: `Снята диверсия «${view.title}»`,
      metadata: { kind: view.kind, target_team_id: view.target_team_id },
    });
    res.status(200).json(view);
  } catch (error) {
    next(error);
  }
}

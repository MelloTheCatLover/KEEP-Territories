import { Request, Response, NextFunction } from 'express';
import * as encounterService from '../services/encounter.service';
import * as audit from '../services/audit.service';
import { AppError } from '../types/errors';

export async function getPool(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json({ encounters: await encounterService.listPool() });
  } catch (error) {
    next(error);
  }
}

export async function setActive(
  req: Request<{ number: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const num = Number(req.params.number);
    if (!Number.isInteger(num)) throw new AppError(400, 'Некорректный номер');
    if (typeof req.body?.active !== 'boolean') throw new AppError(400, 'active должен быть boolean');
    res.status(200).json(await encounterService.setActive(num, req.body.active));
  } catch (error) {
    next(error);
  }
}

export async function getPending(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json({ instances: await encounterService.listPending() });
  } catch (error) {
    next(error);
  }
}

export async function resolve(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const choice = typeof req.body?.choice === 'string' ? req.body.choice : undefined;
    const view = await encounterService.resolve(req.params.id, choice);
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: view.team_id,
      action: 'encounter.resolve',
      entityType: 'encounter',
      entityId: view.id,
      summary: `Случайная встреча #${view.encounter_number} для «${view.team_name ?? '—'}»: ${view.outcome_text ?? ''}`,
      metadata: { encounter_number: view.encounter_number, choice: view.choice, applied: view.applied },
    });
    res.status(200).json(view);
  } catch (error) {
    next(error);
  }
}

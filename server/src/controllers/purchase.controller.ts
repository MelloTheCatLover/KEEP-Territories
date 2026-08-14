import { Request, Response, NextFunction } from 'express';
import * as purchaseService from '../services/purchase.service';
import * as audit from '../services/audit.service';
import { AppError } from '../types/errors';

export async function getCatalog(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json({
      purchases: purchaseService.PURCHASES,
      base_slots: purchaseService.BASE_IMPLANT_SLOTS,
    });
  } catch (error) {
    next(error);
  }
}

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(await purchaseService.list());
  } catch (error) {
    next(error);
  }
}

export async function buy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamId = req.body?.team_id;
    if (typeof teamId !== 'string' || teamId.length === 0) {
      throw new AppError(400, 'Не указана команда-покупатель');
    }
    const view = await purchaseService.buy({
      teamId,
      kind: req.body?.kind,
      targetTeamId: req.body?.target_team_id ?? null,
      sectorId: req.body?.sector_id ?? null,
    });
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: view.team_id,
      action: 'purchase.buy',
      entityType: 'purchase',
      entityId: view.id,
      summary: `Покупка «${view.title}»${
        view.target_team_name ? ` у команды ${view.target_team_name}` : ''
      }`,
      metadata: {
        kind: view.kind,
        merchant: view.merchant,
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
    const view = await purchaseService.cancel(req.params.id);
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: view.team_id,
      action: 'purchase.cancel',
      entityType: 'purchase',
      entityId: view.id,
      summary: `Снят имплант «${view.title}»`,
      metadata: { kind: view.kind, merchant: view.merchant },
    });
    res.status(200).json(view);
  } catch (error) {
    next(error);
  }
}

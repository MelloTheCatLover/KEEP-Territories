import { Request, Response, NextFunction } from 'express';
import * as merchantService from '../services/merchant.service';
import * as audit from '../services/audit.service';

export async function listSectors(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json({ sectors: await merchantService.listMerchantSectors() });
  } catch (error) {
    next(error);
  }
}

export async function spendToken(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await merchantService.spendToken(req.params.id);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'merchant.token_spend',
      entityType: 'merchant',
      entityId: req.params.id,
      summary: 'Жетон покупки отмечен потраченным',
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

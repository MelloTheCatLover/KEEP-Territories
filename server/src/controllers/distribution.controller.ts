import { Request, Response, NextFunction } from 'express';
import * as distributionService from '../services/distribution.service';
import { CATEGORY_ORDER, ParticipantCategory } from '../types/distribution';

export async function getState(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await distributionService.getState());
  } catch (error) {
    next(error);
  }
}

export async function prepare(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await distributionService.prepare());
  } catch (error) {
    next(error);
  }
}

export async function setCategory(
  req: Request<{ childId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { category } = req.body ?? {};
    if (!CATEGORY_ORDER.includes(category as ParticipantCategory)) {
      res.status(400).json({ error: 'Неизвестная категория' });
      return;
    }
    res.json(await distributionService.setCategory(req.params.childId, category as ParticipantCategory));
  } catch (error) {
    next(error);
  }
}

export async function spin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = (req.body ?? {}).batch_size;
    const batchSize = typeof raw === 'number' ? raw : Number(raw) || 1;
    res.json(await distributionService.spin(batchSize));
  } catch (error) {
    next(error);
  }
}

export async function reset(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await distributionService.reset());
  } catch (error) {
    next(error);
  }
}

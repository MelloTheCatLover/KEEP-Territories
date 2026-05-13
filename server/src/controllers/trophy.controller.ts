import { Request, Response, NextFunction } from 'express';
import * as trophyService from '../services/trophy.service';

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await trophyService.getTrophies(req.user!.userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

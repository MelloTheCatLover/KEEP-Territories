import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import * as captureService from '../services/capture.service';
import { AppError } from '../types/errors';

async function getUserTeamId(userId: string): Promise<string> {
  const result = await pool.query<{ team_id: string | null }>(
    'SELECT team_id FROM users WHERE id = $1',
    [userId]
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }
  if (!result.rows[0].team_id) {
    throw new AppError(400, 'You are not in a team');
  }
  return result.rows[0].team_id;
}

export async function startCapture(
  req: Request<{ sectorId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teamId = await getUserTeamId(req.user!.userId);
    const sector = await captureService.startCapture(req.params.sectorId, teamId);
    res.status(200).json(sector);
  } catch (error) {
    next(error);
  }
}

export async function getTask(
  req: Request<{ sectorId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teamId = await getUserTeamId(req.user!.userId);
    const task = await captureService.getTask(req.params.sectorId, teamId);
    res.status(200).json(task);
  } catch (error) {
    next(error);
  }
}

export async function submitAnswer(
  req: Request<{ sectorId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { optionId } = req.body;
    if (!optionId || typeof optionId !== 'string') {
      throw new AppError(400, 'optionId is required');
    }

    const teamId = await getUserTeamId(req.user!.userId);
    const result = await captureService.submitAnswer(req.params.sectorId, teamId, optionId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function cancelCapture(
  req: Request<{ sectorId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teamId = await getUserTeamId(req.user!.userId);
    const sector = await captureService.cancelCapture(req.params.sectorId, teamId);
    res.status(200).json(sector);
  } catch (error) {
    next(error);
  }
}

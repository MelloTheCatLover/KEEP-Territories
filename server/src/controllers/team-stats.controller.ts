import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import * as teamStatsService from '../services/team-stats.service';
import { StatName } from '../types/team-stats';
import { AppError } from '../types/errors';

const VALID_STATS: StatName[] = ['strength', 'intelligence', 'endurance', 'leadership', 'luck'];

export async function getStats(
  req: Request<{ teamId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await teamStatsService.getFullStats(req.params.teamId);
    res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
}

export async function upgradeStat(
  req: Request<{ teamId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { stat_name } = req.body;

    if (!stat_name || !VALID_STATS.includes(stat_name)) {
      throw new AppError(400, `stat_name must be one of: ${VALID_STATS.join(', ')}`);
    }

    const userResult = await pool.query<{ team_id: string | null; team_role: string | null }>(
      'SELECT team_id, team_role FROM users WHERE id = $1',
      [req.user!.userId]
    );
    if (userResult.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    const { team_id, team_role } = userResult.rows[0];

    if (!team_id) {
      throw new AppError(400, 'You are not in a team');
    }
    if (team_id !== req.params.teamId) {
      throw new AppError(403, 'You can only upgrade stats for your own team');
    }
    if (team_role !== 'captain') {
      throw new AppError(403, 'Only the captain can upgrade stats');
    }

    await teamStatsService.upgradeStat(team_id, { stat_name });
    const stats = await teamStatsService.getFullStats(team_id);
    res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
}

function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

export async function adminSetResources(
  req: Request<{ teamId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const payload: teamStatsService.AdminResourcesPayload = {};
    const inf = parseNumber(req.body?.influence);
    const exp = parseNumber(req.body?.experience);
    const up = parseNumber(req.body?.upgrade_points);
    if (inf !== undefined) payload.influence = inf;
    if (exp !== undefined) payload.experience = exp;
    if (up !== undefined) payload.upgrade_points = up;
    const stats = await teamStatsService.adminSetResources(req.params.teamId, payload);
    res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
}

export async function adminSetStats(
  req: Request<{ teamId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const payload: teamStatsService.AdminStatsPayload = {};
    for (const stat of VALID_STATS) {
      const v = parseNumber(req.body?.[stat]);
      if (v !== undefined) payload[stat] = v;
    }
    const stats = await teamStatsService.adminSetStats(req.params.teamId, payload);
    res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
}

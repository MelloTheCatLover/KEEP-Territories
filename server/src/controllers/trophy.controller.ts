import { Request, Response, NextFunction } from 'express';
import * as trophyService from '../services/trophy.service';
import * as trophyDetailsService from '../services/trophy-details.service';
import * as gameSettingsService from '../services/game-settings.service';
import * as seasonService from '../services/season.service';
import { pool } from '../config/db';
import { UserRole } from '../types/user';
import { AppError } from '../types/errors';
import { TrophyKey } from '../types/trophy';

async function isAdmin(userId: string): Promise<boolean> {
  const roleRes = await pool.query<{ role: UserRole }>(
    'SELECT role FROM users WHERE id = $1',
    [userId],
  );
  return roleRes.rows[0]?.role === 'admin';
}

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const admin = await isAdmin(userId);

    // Live standings are the admin's call: participants see them only while the
    // trophies_visible flag is on. Admins always see them.
    if (!admin && !(await gameSettingsService.getTrophiesVisible())) {
      throw new AppError(403, 'Кубки скрыты председателем КТП');
    }

    const result = await trophyService.getTrophies(userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/** Полная раскладка одного кубка. Только председатель: журнал раскрывает чужие метрики. */
export async function details(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const seasonId = await seasonService.getActiveSeasonId();
    const result = await trophyDetailsService.getTrophyDetails(
      seasonId,
      req.params.key as TrophyKey,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listOverrides(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const seasonId = await seasonService.getActiveSeasonId();
    res.status(200).json(await trophyDetailsService.getOverrides(seasonId));
  } catch (error) {
    next(error);
  }
}

/**
 * Назначить победителя кубка вручную. `team_id: null` снимает назначение и
 * возвращает кубок расчёту по метрике.
 */
export async function setOverride(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { team_id, note } = req.body as { team_id?: unknown; note?: unknown };
    if (team_id !== null && typeof team_id !== 'string') {
      throw new AppError(400, 'team_id должен быть строкой или null');
    }
    if (note !== undefined && note !== null && typeof note !== 'string') {
      throw new AppError(400, 'note должен быть строкой');
    }
    const seasonId = await seasonService.getActiveSeasonId();
    await trophyService.setOverride(
      seasonId,
      req.params.key as TrophyKey,
      team_id ?? null,
      typeof note === 'string' && note.trim().length > 0 ? note.trim() : null,
      req.user!.userId,
    );
    res.status(200).json(await trophyService.getTrophies(req.user!.userId));
  } catch (error) {
    next(error);
  }
}

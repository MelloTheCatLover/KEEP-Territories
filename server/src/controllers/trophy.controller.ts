import { Request, Response, NextFunction } from 'express';
import * as trophyService from '../services/trophy.service';
import * as gameSettingsService from '../services/game-settings.service';
import { pool } from '../config/db';
import { UserRole } from '../types/user';
import { AppError } from '../types/errors';

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const roleRes = await pool.query<{ role: UserRole }>(
      'SELECT role FROM users WHERE id = $1',
      [userId],
    );
    const isAdmin = roleRes.rows[0]?.role === 'admin';

    // Live standings are the admin's call: participants see them only while the
    // trophies_visible flag is on. Admins always see them.
    if (!isAdmin && !(await gameSettingsService.getTrophiesVisible())) {
      throw new AppError(403, 'Кубки скрыты администратором');
    }

    const result = await trophyService.getTrophies(userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { UserRole } from '../types/user';

export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await pool.query<{ role: UserRole }>(
      'SELECT role FROM users WHERE id = $1',
      [req.user!.userId],
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }

    if (result.rows[0].role !== 'admin') {
      throw new AppError(403, 'Admin access required');
    }

    next();
  } catch (error) {
    next(error);
  }
}

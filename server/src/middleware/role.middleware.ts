import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { TeamRole } from '../types/user';
import { AppError } from '../types/errors';

export function requireTeamRole(...roles: TeamRole[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await pool.query(
        'SELECT team_id, team_role FROM users WHERE id = $1',
        [req.user!.userId]
      );

      if (result.rows.length === 0) {
        throw new AppError(404, 'User not found');
      }

      const { team_id, team_role } = result.rows[0];

      if (!team_id) {
        throw new AppError(403, 'You are not in a team');
      }

      if (!roles.includes(team_role)) {
        throw new AppError(403, 'Insufficient team role');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { DifficultyLevel } from '../types/difficulty';

export async function getAll(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await pool.query<DifficultyLevel>(
      `SELECT id, name, slug, influence_reward, experience_reward
       FROM difficulty_levels
       ORDER BY influence_reward ASC`,
    );
    res.status(200).json(result.rows);
  } catch (error) {
    next(error);
  }
}

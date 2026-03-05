import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/errors';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
}

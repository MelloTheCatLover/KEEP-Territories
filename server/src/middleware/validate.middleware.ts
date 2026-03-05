import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/errors';

const STAT_FIELDS = ['influence', 'experience', 'strength', 'intelligence', 'endurance', 'leadership', 'luck'] as const;
const USERNAME_REGEX = /^[a-zA-Zа-яА-ЯёЁ0-9_-]+$/;
const MAX_USERNAME_LENGTH = 30;
const MAX_TEAM_NAME_LENGTH = 50;
const MAX_STAT_VALUE = 1000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateRegister(req: Request, _res: Response, next: NextFunction): void {
  if (!req.body || typeof req.body !== 'object') {
    return next(new AppError(400, 'Request body must be valid JSON'));
  }
  const { email, username, password } = req.body;

  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    return next(new AppError(400, 'Email is required'));
  }
  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return next(new AppError(400, 'Username must be at least 3 characters'));
  }
  if (username.trim().length > MAX_USERNAME_LENGTH) {
    return next(new AppError(400, `Username must be at most ${MAX_USERNAME_LENGTH} characters`));
  }
  if (!USERNAME_REGEX.test(username.trim())) {
    return next(new AppError(400, 'Username can only contain letters, numbers, hyphens and underscores'));
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return next(new AppError(400, 'Password must be at least 8 characters'));
  }

  next();
}

export function validateLogin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.body || typeof req.body !== 'object') {
    return next(new AppError(400, 'Request body must be valid JSON'));
  }
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    return next(new AppError(400, 'Email is required'));
  }
  if (!password || typeof password !== 'string' || password.length === 0) {
    return next(new AppError(400, 'Password is required'));
  }

  next();
}

export function validateCreateTeam(req: Request, _res: Response, next: NextFunction): void {
  if (!req.body || typeof req.body !== 'object') {
    return next(new AppError(400, 'Request body must be valid JSON'));
  }
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return next(new AppError(400, 'Team name is required'));
  }
  if (name.trim().length > MAX_TEAM_NAME_LENGTH) {
    return next(new AppError(400, `Team name must be at most ${MAX_TEAM_NAME_LENGTH} characters`));
  }

  for (const field of STAT_FIELDS) {
    const value = req.body[field];
    if (value === undefined || value === null || typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return next(new AppError(400, `${field} must be a finite number >= 0`));
    }
    if (!Number.isInteger(value)) {
      return next(new AppError(400, `${field} must be an integer`));
    }
    if (value > MAX_STAT_VALUE) {
      return next(new AppError(400, `${field} must be at most ${MAX_STAT_VALUE}`));
    }
  }

  next();
}

export function validateParamId(req: Request<{ id: string }>, _res: Response, next: NextFunction): void {
  const id = req.params.id;
  if (!id || !UUID_REGEX.test(id)) {
    return next(new AppError(400, 'Invalid ID format'));
  }
  next();
}

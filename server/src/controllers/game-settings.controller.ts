import { Request, Response, NextFunction } from 'express';
import * as gameSettingsService from '../services/game-settings.service';
import { GameSettingKey } from '../types/game-settings';
import { AppError } from '../types/errors';

const VALID_KEYS: GameSettingKey[] = ['base_exp_threshold', 'exp_step', 'max_fortification_level'];

export async function getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await gameSettingsService.getAll();
    res.status(200).json(settings);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { key, value } = req.body;

    if (!key || typeof key !== 'string' || !VALID_KEYS.includes(key as GameSettingKey)) {
      throw new AppError(400, `key must be one of: ${VALID_KEYS.join(', ')}`);
    }
    if (value === undefined || value === null || typeof value !== 'string' || value.trim().length === 0) {
      throw new AppError(400, 'value is required and must be a non-empty string');
    }

    await gameSettingsService.set(key as GameSettingKey, value.trim());
    const settings = await gameSettingsService.getAll();
    res.status(200).json(settings);
  } catch (error) {
    next(error);
  }
}

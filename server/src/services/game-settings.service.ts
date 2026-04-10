import { pool } from '../config/db';
import { GameSettings, GameSettingKey } from '../types/game-settings';
import { AppError } from '../types/errors';

export async function get(key: GameSettingKey): Promise<string> {
  const result = await pool.query<GameSettings>(
    'SELECT * FROM game_settings WHERE key = $1',
    [key]
  );
  if (result.rows.length === 0) {
    throw new AppError(404, `Setting "${key}" not found`);
  }
  return result.rows[0].value;
}

export async function getNumber(key: GameSettingKey): Promise<number> {
  const value = await get(key);
  return parseInt(value, 10);
}

export async function set(key: GameSettingKey, value: string): Promise<void> {
  const result = await pool.query(
    'UPDATE game_settings SET value = $1 WHERE key = $2',
    [value, key]
  );
  if (result.rowCount === 0) {
    throw new AppError(404, `Setting "${key}" not found`);
  }
}

export async function getAll(): Promise<GameSettings[]> {
  const result = await pool.query<GameSettings>(
    'SELECT * FROM game_settings ORDER BY key'
  );
  return result.rows;
}

import { api } from '../../shared/api/client';

export type GameSettingKey =
  | 'base_exp_threshold'
  | 'exp_step'
  | 'max_fortification_level';

export type GameSetting = {
  key: GameSettingKey;
  value: string;
  updated_at: string;
};

export function getSettings(): Promise<GameSetting[]> {
  return api.get<GameSetting[]>('/settings');
}

export function updateSetting(
  key: GameSettingKey,
  value: string,
): Promise<GameSetting[]> {
  return api.put<GameSetting[]>('/settings', { key, value });
}

import { api } from '../../shared/api/client';

export type GameSettingKey =
  | 'base_exp_threshold'
  | 'exp_step'
  | 'max_fortification_level'
  | 'reward_multiplier';

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

/**
 * Toggle the ×1.5 reward flag. Enabling boosts sectors captured today and makes
 * further captures inherit the boost; disabling clears it from all sectors.
 */
export function setRewardBoost(enabled: boolean): Promise<{ enabled: boolean; boosted: number }> {
  return api.put<{ enabled: boolean; boosted: number }>('/settings/reward-boost', { enabled });
}

export interface GameSettings {
  key: string;
  value: string;
  updated_at: Date;
}

// Типизированные ключи
export type GameSettingKey =
  | 'base_exp_threshold'
  | 'exp_step'
  | 'max_fortification_level'
  | 'reward_multiplier';

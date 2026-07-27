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
  | 'reward_multiplier'
  | 'active_law'
  | 'trophies_visible';

/** Mechanical congress laws that can be the single active "generation". */
export type ActiveLaw = 'none' | 'teleport';
export const ACTIVE_LAWS: ActiveLaw[] = ['none', 'teleport'];

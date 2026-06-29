export type SectorStatus = 'free' | 'capturing' | 'captured';
export type ActionType = 'capture' | 'fortify' | 'remove_fortification' | 'recapture';
export type DifficultySlug = 'easy' | 'medium' | 'hard' | 'core';

export type Difficulty = {
  id: string;
  name: string;
  slug: DifficultySlug;
  influence_reward: number;
  experience_reward: number;
};

export type Sector = {
  id: string;
  number: number | null;
  q: number;
  r: number;
  difficulty_id: string;
  task_id: string | null;
  status: SectorStatus;
  captured_by_team_id: string | null;
  capturing_by_team_id: string | null;
  capture_started_at: string | null;
  fortification_level: number;
  is_home_base: boolean;
  home_team_id: string | null;
  current_action_type: ActionType | null;
  is_special: boolean;
  difficulty: Difficulty;
  /**
   * ID of the team that currently has a pending submission on this sector,
   * regardless of action type. Null if no active submission.
   */
  active_submission_team_id: string | null;
};

export type Axial = { q: number; r: number };

const SECTOR_PREFIX: Record<DifficultySlug, string> = {
  easy: 'L',
  medium: 'С',
  hard: 'А',
  core: 'Я',
};

export function formatSectorLabel(slug: DifficultySlug, number: number | null): string {
  return `${SECTOR_PREFIX[slug]}${number ?? ''}`;
}

import { DifficultyLevel } from './difficulty';

export interface Sector {
  id: string;
  number: number | null;
  q: number;
  r: number;
  difficulty_id: string;
  task_id: string | null;
  status: SectorStatus;
  captured_by_team_id: string | null;
  capturing_by_team_id: string | null;
  capture_started_at: Date | null;
  fortification_level: number;
  is_home_base: boolean;
  home_team_id: string | null;
  current_action_type: SectorActionType | null;
}

export type SectorStatus = 'free' | 'capturing' | 'captured';

export type SectorActionType = 'capture' | 'fortify' | 'remove_fortification' | 'recapture';

export interface SectorPublic extends Sector {
  difficulty: DifficultyLevel;
  /**
   * ID of the team that currently has a pending submission on this sector,
   * regardless of action type. Null if no active submission.
   */
  active_submission_team_id: string | null;
}

export interface CreateSectorDto {
  number: number;
  q: number;
  r: number;
  difficulty_id: string;
  task_id?: string;
  is_home_base?: boolean;
  home_team_id?: string;
}

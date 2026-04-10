import { DifficultyLevel } from './difficulty';

export interface Sector {
  id: string;
  number: number;
  q: number;
  r: number;
  difficulty_id: string;
  task_id: string | null;
  status: SectorStatus;
  captured_by_team_id: string | null;
  capturing_by_team_id: string | null;
  capture_started_at: Date | null;
}

export type SectorStatus = 'free' | 'capturing' | 'captured';

export interface SectorPublic extends Sector {
  difficulty: DifficultyLevel;
}

export interface CreateSectorDto {
  number: number;
  q: number;
  r: number;
  difficulty_id: string;
  task_id?: string;
}

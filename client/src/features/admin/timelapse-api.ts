import { api } from '../../shared/api/client';
import type { DifficultySlug } from '../map/types';

export type TimelapseSector = {
  id: string;
  q: number;
  r: number;
  number: number | null;
  difficulty_slug: DifficultySlug;
  is_home_base: boolean;
};

export type TimelapseTeam = {
  id: string;
  name: string;
  color: string | null;
};

export type TimelapseEvent = {
  sector_id: string;
  team_id: string;
  at: string;
};

export type TimelapseData = {
  sectors: TimelapseSector[];
  teams: TimelapseTeam[];
  events: TimelapseEvent[];
};

export function getTimelapse(): Promise<TimelapseData> {
  return api.get<TimelapseData>('/sectors/timelapse');
}

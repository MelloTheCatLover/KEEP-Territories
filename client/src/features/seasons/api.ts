import { api } from '../../shared/api/client';
import type { Sector } from '../map/types';
import type { Team } from '../team/types';
import type { TrophiesResponse } from '../trophies/types';
import type { TimelapseData } from '../admin/timelapse-api';

export type SeasonStatus = 'draft' | 'active' | 'archived';

export type Season = {
  id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  status: SeasonStatus;
  created_at: string;
  list_ids: string[];
};

export function getSeasons(): Promise<Season[]> {
  return api.get<Season[]>('/seasons');
}

export function getSeasonMap(seasonId: string): Promise<Sector[]> {
  return api.get<Sector[]>(`/sectors/map?season_id=${encodeURIComponent(seasonId)}`);
}

export function getSeasonTeams(seasonId: string): Promise<Team[]> {
  return api.get<Team[]>(`/teams?season_id=${encodeURIComponent(seasonId)}`);
}

export function getSeasonTrophies(seasonId: string): Promise<TrophiesResponse> {
  return api.get<TrophiesResponse>(`/seasons/${encodeURIComponent(seasonId)}/trophies`);
}

export function getSeasonTimelapse(seasonId: string): Promise<TimelapseData> {
  return api.get<TimelapseData>(`/seasons/${encodeURIComponent(seasonId)}/timelapse`);
}

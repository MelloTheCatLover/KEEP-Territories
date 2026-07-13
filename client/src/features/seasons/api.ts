import { api } from '../../shared/api/client';
import type { Sector } from '../map/types';
import type { Team } from '../team/types';
import type { TrophiesResponse, TrophyRanking, OverallEntry } from '../trophies/types';
import type { TimelapseData } from '../admin/timelapse-api';

export type SeasonStatus = 'draft' | 'active' | 'archived';

export type Season = {
  id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  status: SeasonStatus;
  created_at: string;
  mvp_child_id: string | null;
  list_ids: string[];
};

export type FinalsMvp = {
  child_id: string;
  full_name: string;
  team_id: string | null;
  team_name: string | null;
  team_color: string | null;
};

export type FinalsChampion = {
  team_id: string;
  team_name: string;
  team_color: string | null;
  trophies_won: number;
};

export type SeasonFinals = {
  season_id: string;
  season_name: string;
  status: SeasonStatus;
  trophies: TrophyRanking[];
  overall: OverallEntry[];
  champions: FinalsChampion[];
  mvp: FinalsMvp | null;
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

export function getSeasonFinals(seasonId: string): Promise<SeasonFinals> {
  return api.get<SeasonFinals>(`/seasons/${encodeURIComponent(seasonId)}/finals`);
}

export type SeasonRosterMember = {
  child_id: string;
  full_name: string;
  user_id: string | null;
};

export type SeasonRoster = {
  team_id: string;
  team_name: string;
  team_color: string | null;
  members: SeasonRosterMember[];
};

export function getSeasonRosters(seasonId: string): Promise<SeasonRoster[]> {
  return api.get<SeasonRoster[]>(`/seasons/${encodeURIComponent(seasonId)}/rosters`);
}

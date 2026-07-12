import { api } from '../../shared/api/client';

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

export function createSeason(name: string): Promise<Season> {
  return api.post<Season>('/seasons', { name });
}

export function setSeasonLists(id: string, listIds: string[]): Promise<Season> {
  return api.put<Season>(`/seasons/${id}/lists`, { list_ids: listIds });
}

export function activateSeason(id: string): Promise<Season> {
  return api.post<Season>(`/seasons/${id}/activate`);
}

export function archiveSeason(id: string): Promise<Season> {
  return api.post<Season>(`/seasons/${id}/archive`);
}

export function deleteSeason(id: string): Promise<void> {
  return api.delete<void>(`/seasons/${id}`);
}

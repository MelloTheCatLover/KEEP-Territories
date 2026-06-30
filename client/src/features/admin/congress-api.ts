import { api } from '../../shared/api/client';

export type LawStatus = 'pending' | 'accepted' | 'rejected';

export interface CongressLaw {
  id: string;
  season_id: string;
  text: string;
  status: LawStatus;
  created_at: string;
  decided_at: string | null;
}

export interface CongressTeam {
  id: string;
  name: string;
  color: string | null;
  influence: number;
}

export function getCongressOverview(): Promise<{ teams: CongressTeam[] }> {
  return api.get<{ teams: CongressTeam[] }>('/congress/overview');
}

export function getCongressLaws(): Promise<{ laws: CongressLaw[] }> {
  return api.get<{ laws: CongressLaw[] }>('/congress/laws');
}

export function createCongressLaw(text: string): Promise<CongressLaw> {
  return api.post<CongressLaw>('/congress/laws', { text });
}

export function setCongressLawStatus(id: string, status: LawStatus): Promise<CongressLaw> {
  return api.patch<CongressLaw>(`/congress/laws/${id}`, { status });
}

export function deleteCongressLaw(id: string): Promise<void> {
  return api.delete<void>(`/congress/laws/${id}`);
}

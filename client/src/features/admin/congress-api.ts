import { api } from '../../shared/api/client';

export type LawStatus = 'pending' | 'accepted' | 'rejected' | 'vetoed';

export interface CongressLaw {
  id: string;
  season_id: string;
  text: string;
  status: LawStatus;
  created_at: string;
  decided_at: string | null;
  vetoed_by_team_id: string | null;
  vetoed_by_team_name: string | null;
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

/** Participant-facing: only decided (accepted/rejected) laws. */
export function getPublicLaws(): Promise<{ laws: CongressLaw[] }> {
  return api.get<{ laws: CongressLaw[] }>('/congress/public-laws');
}

export function createCongressLaw(text: string): Promise<CongressLaw> {
  return api.post<CongressLaw>('/congress/laws', { text });
}

export function setCongressLawStatus(id: string, status: LawStatus): Promise<CongressLaw> {
  return api.patch<CongressLaw>(`/congress/laws/${id}`, { status });
}

/** Cast the veto — the server assigns it to the top-influence team. */
export function vetoCongressLaw(id: string): Promise<CongressLaw> {
  return api.post<CongressLaw>(`/congress/laws/${id}/veto`, {});
}

export function updateCongressLawText(id: string, text: string): Promise<CongressLaw> {
  return api.patch<CongressLaw>(`/congress/laws/${id}/text`, { text });
}

export function deleteCongressLaw(id: string): Promise<void> {
  return api.delete<void>(`/congress/laws/${id}`);
}

/** "Свинский поступок": +1 saboteur (диверсант) token to every team. */
export function piggishDeed(): Promise<{ teams: number }> {
  return api.post<{ teams: number }>('/congress/piggish-deed', {});
}

export interface EarthquakeAssignment {
  team_id: string;
  team_name: string;
  sector_id: string;
  sector_number: number | null;
}

/** "Землетрясение": scatter up to 8 sectors among teams (one each). */
export function earthquake(): Promise<{ assignments: EarthquakeAssignment[] }> {
  return api.post<{ assignments: EarthquakeAssignment[] }>('/congress/earthquake', {});
}

import { api } from '../../shared/api/client';

export type DiversionKind =
  | 'trader_point'
  | 'strip_fortification'
  | 'hard_reset'
  | 'false_scouting'
  | 'steal_influence'
  | 'opponent_move'
  | 'no_reward';

export type DiversionStatus = 'applied' | 'armed' | 'consumed' | 'cancelled';

export interface DiversionDef {
  kind: DiversionKind;
  title: string;
  description: string;
  timing: 'instant' | 'armed';
  needs_target: boolean;
  needs_sector: boolean;
}

export interface Diversion {
  id: string;
  kind: DiversionKind;
  title: string;
  status: DiversionStatus;
  caster_team_id: string;
  caster_team_name: string;
  target_team_id: string | null;
  target_team_name: string | null;
  sector_id: string | null;
  sector_number: number | null;
  sector_difficulty_slug: string | null;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface DiversionsResponse {
  armed: Diversion[];
  history: Diversion[];
}

export function getDiversionCatalog(): Promise<{ diversions: DiversionDef[] }> {
  return api.get<{ diversions: DiversionDef[] }>('/diversions/catalog');
}

export function getDiversions(): Promise<DiversionsResponse> {
  return api.get<DiversionsResponse>('/diversions');
}

export function castDiversion(payload: {
  caster_team_id: string;
  kind: DiversionKind;
  target_team_id?: string | null;
  sector_id?: string | null;
}): Promise<Diversion> {
  return api.post<Diversion>('/diversions', payload);
}

export function cancelDiversion(id: string): Promise<Diversion> {
  return api.post<Diversion>(`/diversions/${id}/cancel`, {});
}

import { api } from '../../shared/api/client';

export interface EncounterEffect {
  influence?: number;
  experience?: number;
  stats?: Record<string, number>;
  level?: number;
}

export interface EncounterEval {
  number: number;
  title: string;
  description: string;
  relevant: { label: string; value: number } | null;
  choice: { prompt: string; options: { key: string; label: string }[] } | null;
  resolution: { outcomeText: string; effect: EncounterEffect; manual: boolean } | null;
}

export interface EncounterInstance {
  id: string;
  team_id: string;
  team_name: string | null;
  encounter_number: number;
  status: 'pending' | 'resolved';
  choice: string | null;
  outcome_text: string | null;
  applied: EncounterEffect | null;
  created_at: string;
  resolved_at: string | null;
  eval: EncounterEval;
}

export interface EncounterPoolRow {
  number: number;
  title: string;
  active: boolean;
  description: string;
  target_team_id: string | null;
  supports_target: boolean;
}

export function getEncounterPool(): Promise<{ encounters: EncounterPoolRow[] }> {
  return api.get<{ encounters: EncounterPoolRow[] }>('/encounters/pool');
}

export function setEncounterActive(number: number, active: boolean): Promise<EncounterPoolRow> {
  return api.patch<EncounterPoolRow>(`/encounters/pool/${number}`, { active });
}

export function setEncounterTarget(number: number, teamId: string | null): Promise<EncounterPoolRow> {
  return api.patch<EncounterPoolRow>(`/encounters/pool/${number}/target`, { target_team_id: teamId });
}

export function getPendingEncounters(): Promise<{ instances: EncounterInstance[] }> {
  return api.get<{ instances: EncounterInstance[] }>('/encounters/pending');
}

export function resolveEncounter(id: string, choice?: string): Promise<EncounterInstance> {
  return api.post<EncounterInstance>(`/encounters/${id}/resolve`, choice ? { choice } : {});
}

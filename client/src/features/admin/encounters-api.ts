import { api } from '../../shared/api/client';

export interface EncounterEffect {
  influence?: number;
  experience?: number;
  stats?: Record<string, number>;
  level?: number;
  /** Stats reset to 0 outright — their upgrade points are burned. */
  zeroStats?: string[];
  swapStats?: [string, string];
}

export type EncounterPolarity = 'positive' | 'negative';

export interface EncounterEval {
  number: number;
  title: string;
  description: string;
  polarity: EncounterPolarity;
  relevant: { label: string; value: number } | null;
  choice: { prompt: string; options: { key: string; label: string }[] } | null;
  resolution: { outcomeText: string; effect: EncounterEffect; manual: boolean } | null;
}

export interface EncounterInstance {
  id: string;
  team_id: string;
  team_name: string | null;
  target_team_name: string | null;
  target_person_name: string | null;
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
  polarity: EncounterPolarity;
  /** 'roster' = per-team «есть ли в команде …» check. */
  kind: 'standard' | 'roster';
  target_team_id: string | null;
  target_team_name: string | null;
  target_person_name: string | null;
  supports_target: boolean;
}

export interface RosterSyncResult {
  teams: number;
  /** Teams with no winner/MVP on the roster — named by captain instead. */
  withoutChampion: string[];
  encounters: EncounterPoolRow[];
}

/** Rebuild one roster check per team, naming that team's winner / MVP. */
export function syncRosterChecks(): Promise<RosterSyncResult> {
  return api.post<RosterSyncResult>('/encounters/pool/roster-checks', {});
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

import { api } from '../../shared/api/client';
import type { ActionType, DifficultySlug, Sector } from './types';
import type { TaskSubmissionWithDetails } from '../admin/submissions-api';
import type { EncounterInstance } from '../admin/encounters-api';

export type TaskBrief = { id: string; title: string; question: string };
export type StartActionResponse = {
  submission: TaskSubmissionWithDetails;
  task_pool: TaskBrief[];
  encounter?: EncounterInstance | null;
};

export function getSectorsMap(): Promise<Sector[]> {
  return api.get<Sector[]>('/sectors/map');
}

export function getSectorById(id: string): Promise<Sector> {
  return api.get<Sector>(`/sectors/${id}`);
}

export function startAction(
  sectorId: string,
  actionType: ActionType,
  teamId?: string,
): Promise<StartActionResponse> {
  return api.post<StartActionResponse>(`/sectors/${sectorId}/action/start`, {
    action_type: actionType,
    ...(teamId ? { team_id: teamId } : {}),
  });
}

export function getCurrentSubmission(
  sectorId: string,
): Promise<TaskSubmissionWithDetails | null> {
  return api.get<TaskSubmissionWithDetails | null>(`/sectors/${sectorId}/submission/current`);
}

export type RerollResponse = {
  submission: TaskSubmissionWithDetails;
  task_pool: TaskBrief[];
  rerolls_remaining: number;
};

/** Reroll (удача): swap the assigned task for another from the pool. */
export function rerollTask(submissionId: string, teamId?: string): Promise<RerollResponse> {
  return api.post<RerollResponse>(`/submissions/${submissionId}/reroll`, {
    ...(teamId ? { team_id: teamId } : {}),
  });
}

export type PeekResponse = { task_pool: TaskBrief[]; checks_remaining: number };

/** Check / разведка (интеллект): preview a sector's task pool before committing. */
export function peekSector(sectorId: string, teamId?: string): Promise<PeekResponse> {
  return api.post<PeekResponse>(`/sectors/${sectorId}/peek`, {
    ...(teamId ? { team_id: teamId } : {}),
  });
}

export type SpecialPlaceAssignment = { team_id: string; place: number };
export type SpecialCaptureResult = {
  sector: Sector;
  awards: Array<{ team_id: string; place: number; influence: number; experience: number }>;
};

/**
 * Admin-only special-sector event: submit the final standings (places 1-6).
 * Rewards distribute by place; 1st place paints the sector. Replaces any prior
 * standings for this sector.
 */
export function captureSpecialSector(
  sectorId: string,
  assignments: SpecialPlaceAssignment[],
): Promise<SpecialCaptureResult> {
  return api.post<SpecialCaptureResult>(`/sectors/${sectorId}/special-capture`, {
    assignments,
  });
}

export type GenerateMapResponse = {
  sectors: Sector[];
  count: number;
};

export type MapPresetCell = {
  q: number;
  r: number;
  slug: DifficultySlug;
  isHome: boolean;
  isSpecial: boolean;
};

export type MapPreset = {
  id: string;
  title: string;
  description: string;
  radius: number;
  teams: number;
  cells: MapPresetCell[];
};

export function getMapPresets(): Promise<{ presets: MapPreset[]; default: string }> {
  return api.get<{ presets: MapPreset[]; default: string }>('/sectors/admin/presets');
}

/**
 * (Re)generate the season map from the chosen preset. Existing teams and the
 * children distribution survive — they are re-anchored to new home bases.
 */
export function generateMap(preset: string): Promise<GenerateMapResponse> {
  return api.post<GenerateMapResponse>('/sectors/generate-map', { preset });
}

export function deleteAllSectors(): Promise<{ deleted_count: number; deleted_teams_count: number }> {
  return api.delete<{ deleted_count: number; deleted_teams_count: number }>('/sectors/all');
}

export function getAdminMapStatus(): Promise<{ teams_count: number }> {
  return api.get<{ teams_count: number }>('/sectors/admin/status');
}

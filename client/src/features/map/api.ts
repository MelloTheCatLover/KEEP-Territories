import { api } from '../../shared/api/client';
import type { ActionType, Sector } from './types';
import type { TaskSubmissionWithDetails } from '../admin/submissions-api';

export function getSectorsMap(): Promise<Sector[]> {
  return api.get<Sector[]>('/sectors/map');
}

export function getSectorById(id: string): Promise<Sector> {
  return api.get<Sector>(`/sectors/${id}`);
}

export function startAction(
  sectorId: string,
  actionType: ActionType,
): Promise<TaskSubmissionWithDetails> {
  return api.post<TaskSubmissionWithDetails>(`/sectors/${sectorId}/action/start`, {
    action_type: actionType,
  });
}

export function getCurrentSubmission(
  sectorId: string,
): Promise<TaskSubmissionWithDetails | null> {
  return api.get<TaskSubmissionWithDetails | null>(`/sectors/${sectorId}/submission/current`);
}

export type GenerateMapResponse = {
  sectors: Sector[];
  count: number;
};

export function generateMap(): Promise<GenerateMapResponse> {
  return api.post<GenerateMapResponse>('/sectors/generate-map');
}

export function deleteAllSectors(): Promise<{ deleted_count: number; deleted_teams_count: number }> {
  return api.delete<{ deleted_count: number; deleted_teams_count: number }>('/sectors/all');
}

export function getAdminMapStatus(): Promise<{ teams_count: number }> {
  return api.get<{ teams_count: number }>('/sectors/admin/status');
}

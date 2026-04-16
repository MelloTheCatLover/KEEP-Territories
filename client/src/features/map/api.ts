import { api } from '../../shared/api/client';
import type { ActionType, Sector } from './types';

export function getSectorsMap(): Promise<Sector[]> {
  return api.get<Sector[]>('/sectors/map');
}

export type StartActionResponse = {
  sector: Sector;
  task: unknown;
  submission_id: string;
};

export function startAction(
  sectorId: string,
  actionType: ActionType,
): Promise<StartActionResponse> {
  return api.post<StartActionResponse>(`/sectors/${sectorId}/action/start`, {
    action_type: actionType,
  });
}

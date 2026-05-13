import { api } from '../../shared/api/client';
import type { DifficultySlug } from '../map/types';

export type SectorTaskRow = {
  task_id: string;
  title: string;
  question: string;
  difficulty_slug: DifficultySlug;
};

export type Binding = { sector_id: string; task_id: string };

export function getSectorTasks(sectorId: string): Promise<{ tasks: SectorTaskRow[] }> {
  return api.get<{ tasks: SectorTaskRow[] }>(`/sectors/${sectorId}/tasks`);
}

export function attachSectorTask(
  sectorId: string,
  taskId: string,
): Promise<{ tasks: SectorTaskRow[] }> {
  return api.post<{ tasks: SectorTaskRow[] }>(`/sectors/${sectorId}/tasks`, {
    task_id: taskId,
  });
}

export function detachSectorTask(
  sectorId: string,
  taskId: string,
): Promise<{ tasks: SectorTaskRow[] }> {
  return api.delete<{ tasks: SectorTaskRow[] }>(
    `/sectors/${sectorId}/tasks/${taskId}`,
  );
}

export function getAllBindings(): Promise<{ bindings: Binding[] }> {
  return api.get<{ bindings: Binding[] }>('/sectors/admin/task-bindings');
}

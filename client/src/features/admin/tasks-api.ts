import { api } from '../../shared/api/client';
import type { DifficultySlug } from '../map/types';

export type Difficulty = {
  id: string;
  name: string;
  slug: DifficultySlug;
  influence_reward: number;
  experience_reward: number;
};

export type TaskSummary = {
  id: string;
  title: string;
  question: string;
  difficulty_id: string;
  created_at: string;
  updated_at: string;
  difficulty: Difficulty;
};

export type TaskUpsertDto = {
  title: string;
  question: string;
  difficulty_id: string;
};

export function getDifficulties(): Promise<Difficulty[]> {
  return api.get<Difficulty[]>('/difficulties');
}

export function getTasks(): Promise<TaskSummary[]> {
  return api.get<TaskSummary[]>('/tasks');
}

export function createTask(dto: TaskUpsertDto): Promise<TaskSummary> {
  return api.post<TaskSummary>('/tasks', dto);
}

export function updateTask(id: string, dto: TaskUpsertDto): Promise<TaskSummary> {
  return api.put<TaskSummary>(`/tasks/${id}`, dto);
}

export function deleteTask(id: string): Promise<{ message: string }> {
  return api.delete<{ message: string }>(`/tasks/${id}`);
}

import { api } from '../../shared/api/client';
import type { DifficultySlug } from '../map/types';

export type Difficulty = {
  id: string;
  name: string;
  slug: DifficultySlug;
  influence_reward: number;
  experience_reward: number;
};

export type CodeLanguage = 'python' | 'pascal';

export type TaskTestCase = {
  id: string;
  task_id: string;
  ord: number;
  input: string;
  expected_output: string;
  created_at: string;
};

export type TaskSummary = {
  id: string;
  title: string;
  question: string;
  difficulty_id: string;
  code_language: CodeLanguage | null;
  code_template: string | null;
  test_cases_count: number;
  created_at: string;
  updated_at: string;
  difficulty: Difficulty;
};

export type TaskFull = TaskSummary & {
  options: Array<{ id: string; text: string; is_correct: boolean; sort_order: number }>;
  test_cases: TaskTestCase[];
};

export type TaskUpsertDto = {
  title: string;
  question: string;
  difficulty_id: string;
  options?: Array<{ text: string; is_correct: boolean; sort_order: number }>;
  code_language?: CodeLanguage | null;
  code_template?: string | null;
  test_cases?: Array<{ ord: number; input: string; expected_output: string }>;
};

export function getDifficulties(): Promise<Difficulty[]> {
  return api.get<Difficulty[]>('/difficulties');
}

export function getTasks(): Promise<TaskSummary[]> {
  return api.get<TaskSummary[]>('/tasks');
}

export function getTask(id: string): Promise<TaskFull> {
  return api.get<TaskFull>(`/tasks/${id}`);
}

export function createTask(dto: TaskUpsertDto): Promise<TaskFull> {
  return api.post<TaskFull>('/tasks', dto);
}

export function updateTask(id: string, dto: TaskUpsertDto): Promise<TaskFull> {
  return api.put<TaskFull>(`/tasks/${id}`, dto);
}

export function deleteTask(id: string): Promise<{ message: string }> {
  return api.delete<{ message: string }>(`/tasks/${id}`);
}

import { DifficultyLevel } from './difficulty';

export interface Task {
  id: string;
  title: string;
  question: string;
  difficulty_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface TaskOption {
  id: string;
  task_id: string;
  text: string;
  is_correct: boolean;
  sort_order: number;
}

export interface TaskWithOptions extends Task {
  options: TaskOption[];
  difficulty: DifficultyLevel;
}

// DTO для создания задания
export interface CreateTaskDto {
  title: string;
  question: string;
  difficulty_id: string;
  options: CreateTaskOptionDto[];
}

export interface CreateTaskOptionDto {
  text: string;
  is_correct: boolean;
  sort_order: number;
}

// Для ответа клиенту (без is_correct)
export interface TaskOptionPublic {
  id: string;
  text: string;
  sort_order: number;
}

export interface TaskPublic {
  id: string;
  title: string;
  question: string;
  difficulty: DifficultyLevel;
  options: TaskOptionPublic[];
}

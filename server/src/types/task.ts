import { DifficultyLevel } from './difficulty';

export type CodeLanguage = 'python' | 'pascal';

export interface TaskTestCase {
  id: string;
  task_id: string;
  ord: number;
  input: string;
  expected_output: string;
  created_at: Date;
}

export interface CreateTaskTestCaseDto {
  ord: number;
  input: string;
  expected_output: string;
}

export interface Task {
  id: string;
  title: string;
  question: string;
  difficulty_id: string;
  code_language: CodeLanguage | null;
  code_template: string | null;
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
  test_cases: TaskTestCase[];
}

// DTO для создания задания
export interface CreateTaskDto {
  title: string;
  question: string;
  difficulty_id: string;
  options: CreateTaskOptionDto[];
  code_language?: CodeLanguage | null;
  code_template?: string | null;
  test_cases?: CreateTaskTestCaseDto[];
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
  code_language: CodeLanguage | null;
  code_template: string | null;
  test_cases: TaskTestCase[];
}

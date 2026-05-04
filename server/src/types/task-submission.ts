import { DifficultyLevel } from './difficulty';
import { SectorActionType } from './sector';

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface TestRunResult {
  ord: number;
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  stderr: string;
  timed_out: boolean;
  error?: string;
}

export interface TaskSubmission {
  id: string;
  sector_id: string;
  team_id: string;
  user_id: string;
  task_id: string | null;
  action_type: SectorActionType;
  status: SubmissionStatus;
  comment: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  code: string | null;
  last_run_at: Date | null;
  last_run_results: TestRunResult[] | null;
  auto_approved: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TaskSubmissionWithDetails extends TaskSubmission {
  team: {
    id: string;
    name: string;
    color: string | null;
  };
  sector: {
    id: string;
    number: number | null;
    q: number;
    r: number;
  };
  difficulty: DifficultyLevel;
  task: {
    id: string;
    title: string;
    question: string;
    code_language: 'python' | 'pascal' | null;
    code_template: string | null;
    has_test_cases: boolean;
  } | null;
  user: {
    id: string;
    username: string;
  };
}

export interface StartActionDto {
  action_type: SectorActionType;
}

export interface TaskBrief {
  id: string;
  title: string;
  question: string;
}

export interface StartActionResponse {
  submission: TaskSubmissionWithDetails;
  task_pool: TaskBrief[];
}

export interface ApproveSubmissionDto {
  comment?: string | null;
}

export interface RunCodeDto {
  code: string;
}

export interface RunCodeResponse {
  submission: TaskSubmissionWithDetails;
  passed: boolean;
  results: TestRunResult[];
}

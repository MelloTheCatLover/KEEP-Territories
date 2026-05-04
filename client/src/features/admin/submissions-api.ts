import { api } from '../../shared/api/client';
import type { DifficultySlug } from '../map/types';

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';
export type SubmissionActionType =
  | 'capture'
  | 'fortify'
  | 'remove_fortification'
  | 'recapture';

export type CodeLanguage = 'python' | 'pascal';

export type TestRunResult = {
  ord: number;
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  stderr: string;
  timed_out: boolean;
  error?: string;
};

export type TaskSubmissionWithDetails = {
  id: string;
  sector_id: string;
  team_id: string;
  user_id: string;
  task_id: string | null;
  action_type: SubmissionActionType;
  status: SubmissionStatus;
  comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  code: string | null;
  last_run_at: string | null;
  last_run_results: TestRunResult[] | null;
  auto_approved: boolean;
  created_at: string;
  updated_at: string;
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
  difficulty: {
    id: string;
    name: string;
    slug: DifficultySlug;
    influence_reward: number;
    experience_reward: number;
  };
  task: {
    id: string;
    title: string;
    question: string;
    code_language: CodeLanguage | null;
    code_template: string | null;
    has_test_cases: boolean;
  } | null;
  user: {
    id: string;
    username: string;
  };
};

export type RunCodeResponse = {
  submission: TaskSubmissionWithDetails;
  passed: boolean;
  results: TestRunResult[];
};

export function runSubmissionCode(
  id: string,
  code: string,
): Promise<RunCodeResponse> {
  return api.post<RunCodeResponse>(`/submissions/${id}/run`, { code });
}

export function getPendingSubmissions(): Promise<TaskSubmissionWithDetails[]> {
  return api.get<TaskSubmissionWithDetails[]>('/submissions/pending');
}

export function approveSubmission(
  id: string,
  comment?: string | null,
): Promise<TaskSubmissionWithDetails> {
  return api.post<TaskSubmissionWithDetails>(`/submissions/${id}/approve`, {
    comment: comment ?? null,
  });
}

export function rejectSubmission(
  id: string,
  comment?: string | null,
): Promise<TaskSubmissionWithDetails> {
  return api.post<TaskSubmissionWithDetails>(`/submissions/${id}/reject`, {
    comment: comment ?? null,
  });
}

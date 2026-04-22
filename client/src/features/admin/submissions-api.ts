import { api } from '../../shared/api/client';
import type { DifficultySlug } from '../map/types';

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';
export type SubmissionActionType =
  | 'capture'
  | 'fortify'
  | 'remove_fortification'
  | 'recapture';

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
  } | null;
  user: {
    id: string;
    username: string;
  };
};

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

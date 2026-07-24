import { api } from '../../shared/api/client';
import type { DifficultySlug } from '../map/types';
import type { StatName, MerchantType } from '../team/types';

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
  reroll_count: number;
  rerolls_max: number;
};

export function getPendingSubmissions(): Promise<TaskSubmissionWithDetails[]> {
  return api.get<TaskSubmissionWithDetails[]>('/submissions/pending');
}

export type ApproveResult = TaskSubmissionWithDetails & {
  /** Merchant NPC found on the sector by this capture, or null. */
  merchant: MerchantType | null;
  /** True only when a fresh purchase token was minted (not a re-looted sector). */
  merchant_token_minted: boolean;
};

export function approveSubmission(
  id: string,
  comment?: string | null,
): Promise<ApproveResult> {
  return api.post<ApproveResult>(`/submissions/${id}/approve`, {
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

export type DropSubmissionResponse = {
  submission: TaskSubmissionWithDetails;
  penalty: { influence: number; experience: number };
  level_before: number;
  level_after: number;
  removed_stats: StatName[];
};

export function dropSubmission(id: string): Promise<DropSubmissionResponse> {
  return api.post<DropSubmissionResponse>(`/submissions/${id}/drop`);
}

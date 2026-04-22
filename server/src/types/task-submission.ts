import { DifficultyLevel } from './difficulty';
import { SectorActionType } from './sector';

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

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
  } | null;
  user: {
    id: string;
    username: string;
  };
}

export interface StartActionDto {
  action_type: SectorActionType;
}

export interface ApproveSubmissionDto {
  comment?: string | null;
}

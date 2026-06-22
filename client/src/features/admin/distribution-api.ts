import { api } from '../../shared/api/client';

export type ParticipantCategory = 'mvp' | 'winner' | 'participant' | 'newbie';

export const CATEGORY_ORDER: ParticipantCategory[] = ['mvp', 'winner', 'participant', 'newbie'];

export const CATEGORY_LABEL: Record<ParticipantCategory, string> = {
  mvp: 'MVP',
  winner: 'Победители',
  participant: 'Участники',
  newbie: 'Новенькие',
};

export type DistributionParticipant = {
  child_id: string;
  full_name: string;
  code: string;
  login: string | null;
  has_account: boolean;
  category: ParticipantCategory;
  team_id: string | null;
  team_name: string | null;
};

export type DistributionTeam = {
  id: string;
  name: string;
  color: string | null;
  member_count: number;
};

export type CategoryCount = { total: number; assigned: number };

export type DistributionState = {
  season_id: string;
  season_name: string;
  home_base_count: number;
  team_count: number;
  prepared: boolean;
  teams: DistributionTeam[];
  participants: DistributionParticipant[];
  category_counts: Record<ParticipantCategory, CategoryCount>;
  remaining: number;
  done: boolean;
};

export type SpinAssignment = {
  child_id: string;
  full_name: string;
  team_id: string;
  team_name: string;
};

export type SpinResult = {
  category: ParticipantCategory | null;
  assigned: SpinAssignment[];
  done: boolean;
  state: DistributionState;
};

export function getDistribution(): Promise<DistributionState> {
  return api.get<DistributionState>('/distribution');
}

export function prepareDistribution(): Promise<DistributionState> {
  return api.post<DistributionState>('/distribution/prepare');
}

export function setParticipantCategory(
  childId: string,
  category: ParticipantCategory,
): Promise<DistributionState> {
  return api.patch<DistributionState>(`/distribution/participants/${childId}`, { category });
}

export function spinDistribution(batchSize: number): Promise<SpinResult> {
  return api.post<SpinResult>('/distribution/spin', { batch_size: batchSize });
}

export function resetDistribution(): Promise<DistributionState> {
  return api.post<DistributionState>('/distribution/reset');
}

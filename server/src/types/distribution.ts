export type ParticipantCategory = 'mvp' | 'winner' | 'participant' | 'newbie';

/** Distribution order: stronger categories are dealt first into the round-robin. */
export const CATEGORY_ORDER: ParticipantCategory[] = ['mvp', 'winner', 'participant', 'newbie'];

export interface DistributionParticipant {
  child_id: string;
  full_name: string;
  code: string;
  login: string | null;
  has_account: boolean;
  category: ParticipantCategory;
  team_id: string | null;
  team_name: string | null;
}

export interface DistributionTeam {
  id: string;
  name: string;
  color: string | null;
  member_count: number;
}

export interface CategoryCount {
  total: number;
  assigned: number;
}

export interface DistributionState {
  season_id: string;
  season_name: string;
  home_base_count: number;
  team_count: number;
  /** True once participants have been snapshotted (prepare ran). */
  prepared: boolean;
  teams: DistributionTeam[];
  participants: DistributionParticipant[];
  category_counts: Record<ParticipantCategory, CategoryCount>;
  remaining: number;
  /** True when every participant has a team. */
  done: boolean;
}

export interface SpinAssignment {
  child_id: string;
  full_name: string;
  team_id: string;
  team_name: string;
}

export interface SpinResult {
  category: ParticipantCategory | null;
  assigned: SpinAssignment[];
  done: boolean;
  state: DistributionState;
}

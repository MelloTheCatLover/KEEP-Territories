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
  /** Order in which the team was drawn to pick a colour; null until drawn. */
  color_pick_seq: number | null;
}

/** Colour-pick phase: runs after every participant has a team. */
export interface ColorPickState {
  /** Participants are all placed, so the queue may run. */
  active: boolean;
  /** Team currently choosing (drawn, colour not set yet). */
  pending_team_id: string | null;
  /** Teams still waiting to be drawn. */
  remaining_team_ids: string[];
  /** Colour families already claimed this season — excluded from the next pick. */
  taken_color_keys: string[];
  /** Every team has a colour. */
  done: boolean;
}

export interface ColorSpinResult {
  team_id: string;
  team_name: string;
  state: DistributionState;
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
  color_pick: ColorPickState;
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

export type SeasonStatus = 'draft' | 'active' | 'archived';

export interface Season {
  id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  status: SeasonStatus;
  created_at: string;
  mvp_child_id: string | null;
}

export interface SeasonWithLists extends Season {
  list_ids: string[];
}

export interface SeasonRosterMember {
  child_id: string;
  full_name: string;
  user_id: string | null;
}

export interface SeasonRoster {
  team_id: string;
  team_name: string;
  team_color: string | null;
  members: SeasonRosterMember[];
}

export interface FinalsMvp {
  child_id: string;
  full_name: string;
  team_id: string | null;
  team_name: string | null;
  team_color: string | null;
}

export interface FinalsChampion {
  team_id: string;
  team_name: string;
  team_color: string | null;
  trophies_won: number;
}

export interface SeasonFinals {
  season_id: string;
  season_name: string;
  status: SeasonStatus;
  // Trophies in presentation order, each with its place-1 winner(s) revealed.
  trophies: import('./trophy').TrophyRanking[];
  overall: import('./trophy').OverallEntry[];
  champions: FinalsChampion[];
  mvp: FinalsMvp | null;
}

export interface CreateSeasonDto {
  name: string;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface UpdateSeasonDto {
  name?: string;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface ChildrenList {
  id: string;
  name: string;
  created_at: string;
  entry_count: number;
}

/** A child as a member of a specific list. */
export interface ListMember {
  child_id: string;
  /** Short human ID, distinguishes same-named children. */
  code: string;
  full_name: string;
  user_id: string | null;
  /** Account login (email), null if no account yet. */
  login: string | null;
  /** Decrypted issued password, null if none. */
  issued_password: string | null;
  /** Names of all seasons this child takes part in (across their lists). */
  seasons: string[];
}

/** Result of adding one child to a list (matched = reused existing child). */
export interface AddChildResult {
  child_id: string;
  code: string;
  full_name: string;
  matched: boolean;
  login: string | null;
  seasons: string[];
}

export interface IssuedAccount {
  login: string;
  password: string;
  child_id: string;
}

/** One row of the global children dashboard. */
export interface ChildDashboardRow {
  id: string;
  code: string;
  full_name: string;
  login: string | null;
  has_account: boolean;
  lists: string[];
  seasons: string[];
}

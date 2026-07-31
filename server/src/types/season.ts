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

/** One parsed line of the counselor's shift spreadsheet. */
export interface RosterRow {
  full_name: string;
  /** Lifetime points from the sheet — informational. */
  sparks: number;
  /** КТП: prior standing that seeds the start-of-season distribution. */
  category: import('./distribution').ParticipantCategory;
  login: string;
  password: string;
}

/** Outcome of one imported row. */
export interface RosterImportEntry {
  full_name: string;
  code: string;
  /** The child already existed in the registry and was reused. */
  matched: boolean;
  category: import('./distribution').ParticipantCategory;
  sparks: number;
  /** Login the child actually has after the import. */
  login: string;
  /** Login printed in the sheet — differs from `login` when the account is older. */
  sheet_login: string;
  password: string;
  account: 'created' | 'password_updated';
}

export interface RosterImportResult {
  /** False for a preview run: everything below is what *would* happen. */
  applied: boolean;
  list_name: string;
  created: number;
  matched: number;
  accounts_created: number;
  passwords_updated: number;
  /** Participants of the active season whose category was refreshed. */
  resynced: number;
  entries: RosterImportEntry[];
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

export type SeasonStatus = 'draft' | 'active' | 'archived';

export interface Season {
  id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  status: SeasonStatus;
  created_at: string;
}

export interface SeasonWithLists extends Season {
  list_ids: string[];
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

export interface RosterEntry {
  id: string;
  list_id: string;
  full_name: string;
  code: string;
  user_id: string | null;
  /** Username of the account that claimed this entry, null if unclaimed. */
  username: string | null;
  created_at: string;
}

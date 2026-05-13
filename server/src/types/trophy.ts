export type TrophyKey =
  | 'influential'
  | 'core_keepers'
  | 'experienced'
  | 'rulers'
  | 'universal'
  | 'unbreakable'
  | 'conquerors'
  | 'champions';

export interface TrophyEntry {
  team_id: string;
  team_name: string;
  team_color: string | null;
  place: number;
  /** null when value is hidden from the requester (private trophies). */
  value: number | null;
}

export interface TrophyRanking {
  key: TrophyKey;
  name: string;
  description: string;
  /** When true the raw value is hidden from non-team members. */
  private_value: boolean;
  entries: TrophyEntry[];
}

export interface OverallEntry {
  team_id: string;
  team_name: string;
  team_color: string | null;
  trophies_won: number;
  sum_of_places: number;
  place: number;
}

export interface TrophiesResponse {
  trophies: TrophyRanking[];
  overall: OverallEntry[];
}

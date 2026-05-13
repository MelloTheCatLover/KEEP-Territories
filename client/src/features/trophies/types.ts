export type TrophyKey =
  | 'influential'
  | 'core_keepers'
  | 'experienced'
  | 'rulers'
  | 'universal'
  | 'unbreakable'
  | 'conquerors'
  | 'champions';

export type TrophyEntry = {
  team_id: string;
  team_name: string;
  team_color: string | null;
  place: number;
  value: number | null;
};

export type TrophyRanking = {
  key: TrophyKey;
  name: string;
  description: string;
  private_value: boolean;
  entries: TrophyEntry[];
};

export type OverallEntry = {
  team_id: string;
  team_name: string;
  team_color: string | null;
  trophies_won: number;
  sum_of_places: number;
  place: number;
};

export type TrophiesResponse = {
  trophies: TrophyRanking[];
  overall: OverallEntry[];
};

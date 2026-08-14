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

export type TrophyOverrideInfo = {
  team_id: string;
  note: string | null;
};

export type TrophyRanking = {
  key: TrophyKey;
  name: string;
  description: string;
  private_value: boolean;
  entries: TrophyEntry[];
  /** Победитель назначен председателем вручную, а не посчитан по метрике. */
  override: TrophyOverrideInfo | null;
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

export type TrophyDetailEvent = {
  at: string | null;
  kind: string;
  label: string;
  detail: string;
  value: number | null;
};

export type TrophyBreakdownPart = {
  label: string;
  value: number;
  hint?: string;
};

export type TrophyDetailTeam = {
  team_id: string;
  team_name: string;
  team_color: string | null;
  place: number;
  value: number;
  breakdown: TrophyBreakdownPart[];
  events: TrophyDetailEvent[];
};

export type TrophyDetails = {
  key: TrophyKey;
  name: string;
  rule: string;
  value_label: string;
  teams: TrophyDetailTeam[];
};

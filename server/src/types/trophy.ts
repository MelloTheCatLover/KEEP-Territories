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

export interface TrophyOverrideInfo {
  team_id: string;
  note: string | null;
}

export interface TrophyRanking {
  key: TrophyKey;
  name: string;
  description: string;
  /** When true the raw value is hidden from non-team members. */
  private_value: boolean;
  entries: TrophyEntry[];
  /** Set when an admin pinned the winner by hand instead of the metric. */
  override: TrophyOverrideInfo | null;
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

/** Одна строка журнала: что именно принесло команде очки этого кубка. */
export interface TrophyDetailEvent {
  /** ISO-время события; null для «состояния» (текущее владение, корректировка). */
  at: string | null;
  /** Машинный тег для иконки/цвета: capture, recapture, fortify, drop, ... */
  kind: string;
  label: string;
  detail: string;
  /** Вклад строки в метрику кубка, если он измерим. */
  value: number | null;
}

export interface TrophyBreakdownPart {
  label: string;
  value: number;
  hint?: string;
}

export interface TrophyDetailTeam {
  team_id: string;
  team_name: string;
  team_color: string | null;
  place: number;
  value: number;
  breakdown: TrophyBreakdownPart[];
  events: TrophyDetailEvent[];
}

export interface TrophyDetails {
  key: TrophyKey;
  name: string;
  /** Человекочитаемое правило подсчёта — то же, что видит админ в карточке. */
  rule: string;
  /** Подпись к колонке «Значение». */
  value_label: string;
  teams: TrophyDetailTeam[];
}

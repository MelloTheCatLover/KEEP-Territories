/** Товары диверсанта — то, что команда «кидает» по сопернику за жетон. */
export type DiversionKind =
  | 'trader_point'
  | 'strip_fortification'
  | 'hard_reset'
  | 'false_scouting'
  | 'steal_influence'
  | 'opponent_move'
  | 'no_reward';

/**
 * `instant` срабатывает в момент применения, `armed` висит на жертве и ждёт
 * своего события (следующий захват / проверка / ход).
 */
export type DiversionTiming = 'instant' | 'armed';

export type DiversionStatus = 'applied' | 'armed' | 'consumed' | 'cancelled';

export interface DiversionDef {
  kind: DiversionKind;
  title: string;
  description: string;
  timing: DiversionTiming;
  /** Нужна команда-жертва (всё, кроме «очка покупки» себе). */
  needs_target: boolean;
  /** Нужен конкретный сектор в момент применения. */
  needs_sector: boolean;
}

export interface DiversionView {
  id: string;
  kind: DiversionKind;
  title: string;
  status: DiversionStatus;
  caster_team_id: string;
  caster_team_name: string;
  target_team_id: string | null;
  target_team_name: string | null;
  sector_id: string | null;
  sector_number: number | null;
  sector_difficulty_slug: string | null;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** Механические законы съезда — то, что председатель включает руками. */
export type LawKind = 'wheel_of_fortune' | 'graffiti' | 'helping_hand';

/** Плюшки колеса фортуны. Мелочь, кроме «джекпота». */
export type WheelPrizeKind =
  | 'influence'
  | 'experience'
  | 'upgrade_point'
  | 'trader_token'
  | 'saboteur_token'
  | 'queue_priority'
  | 'fortification'
  | 'jackpot';

/**
 * `instant` срабатывает в момент вращения, `armed` ложится команде и ждёт
 * своего момента: очередь сдачи — следующей заявки, «мешок цемента» —
 * выбранного сектора.
 */
export type LawEffectTiming = 'instant' | 'armed';

export type LawEffectStatus = 'applied' | 'armed' | 'consumed' | 'cancelled';

export interface WheelPrizeDef {
  kind: WheelPrizeKind;
  title: string;
  description: string;
  timing: LawEffectTiming;
  /** Вес в колесе: доля сектора и шанс выпадения. */
  weight: number;
  /** Нужен свой сектор, чтобы плюшка сработала («мешок цемента»). */
  needs_sector: boolean;
}

/** Всё, что может лежать в журнале законов: плюшка колеса, краска, реролл. */
export type LawEffectKind = WheelPrizeKind | 'graffiti' | 'extra_reroll';

export interface LawEffectView {
  id: string;
  law: LawKind;
  kind: LawEffectKind;
  title: string;
  status: LawEffectStatus;
  team_id: string;
  team_name: string;
  team_color: string | null;
  sector_id: string | null;
  sector_number: number | null;
  sector_difficulty_slug: string | null;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
}

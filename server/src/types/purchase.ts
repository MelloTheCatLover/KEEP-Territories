/** Лавка, в которой куплен товар. Диверсант живёт отдельно (types/diversion). */
export type PurchaseMerchant = 'master' | 'trader';

/** Товары мастера и торговца — то, что команда берёт за жетон покупки. */
export type PurchaseKind =
  | 'split_capture'
  | 'kip'
  | 'chip'
  | 'shield'
  | 'high_start'
  | 'level_up'
  | 'trampoline'
  | 'spyglass'
  | 'airbag'
  | 'bricks'
  | 'extra_hand'
  | 'refit';

/**
 * `instant` срабатывает в момент покупки, `armed` ложится команде имплантом и
 * ждёт своего события (следующий захват / проверка / сброс / диверсия).
 */
export type PurchaseTiming = 'instant' | 'armed';

export type PurchaseStatus = 'applied' | 'armed' | 'consumed' | 'cancelled';

export interface PurchaseDef {
  kind: PurchaseKind;
  merchant: PurchaseMerchant;
  title: string;
  description: string;
  timing: PurchaseTiming;
  /** Нужна чужая команда (только «чип» — копия импланта). */
  needs_target: boolean;
  /** Нужен свой сектор в момент покупки (только «кирпичи»). */
  needs_sector: boolean;
  /** Сколько срабатываний даёт покупка: батут — 2, подзорная труба — 3. */
  charges: number;
  /** Занимает слот импланта, пока висит заряженным. */
  takes_slot: boolean;
}

export interface PurchaseView {
  id: string;
  kind: PurchaseKind;
  merchant: PurchaseMerchant;
  title: string;
  status: PurchaseStatus;
  charges_left: number;
  team_id: string;
  team_name: string;
  target_team_id: string | null;
  target_team_name: string | null;
  sector_id: string | null;
  sector_number: number | null;
  sector_difficulty_slug: string | null;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** Слоты имплантов команды: сколько занято и сколько всего. */
export interface PurchaseSlots {
  team_id: string;
  used: number;
  total: number;
}

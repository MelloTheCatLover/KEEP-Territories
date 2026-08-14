import { api } from '../../shared/api/client';

export type PurchaseMerchant = 'master' | 'trader';

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

export type PurchaseStatus = 'applied' | 'armed' | 'consumed' | 'cancelled';

export interface PurchaseDef {
  kind: PurchaseKind;
  merchant: PurchaseMerchant;
  title: string;
  description: string;
  timing: 'instant' | 'armed';
  needs_target: boolean;
  needs_sector: boolean;
  charges: number;
  takes_slot: boolean;
}

export interface Purchase {
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

export interface PurchaseSlots {
  team_id: string;
  used: number;
  total: number;
}

export interface PurchasesResponse {
  armed: Purchase[];
  history: Purchase[];
  slots: PurchaseSlots[];
}

export function getPurchaseCatalog(): Promise<{
  purchases: PurchaseDef[];
  base_slots: number;
}> {
  return api.get<{ purchases: PurchaseDef[]; base_slots: number }>('/purchases/catalog');
}

export function getPurchases(): Promise<PurchasesResponse> {
  return api.get<PurchasesResponse>('/purchases');
}

export function buyPurchase(payload: {
  team_id: string;
  kind: PurchaseKind;
  target_team_id?: string | null;
  sector_id?: string | null;
}): Promise<Purchase> {
  return api.post<Purchase>('/purchases', payload);
}

export function cancelPurchase(id: string): Promise<Purchase> {
  return api.post<Purchase>(`/purchases/${id}/cancel`, {});
}

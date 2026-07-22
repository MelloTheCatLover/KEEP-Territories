import { api } from '../../shared/api/client';
import type { MerchantType } from '../team/types';

export interface MerchantSector {
  sector_id: string;
  q: number;
  r: number;
  number: number | null;
  difficulty_slug: string;
  merchant_type: MerchantType;
  captured_by_team_id: string | null;
  captured_by_team_name: string | null;
  captured_by_team_color: string | null;
  token_id: string | null;
  token_spent_at: string | null;
}

export function getMerchantSectors(): Promise<{ sectors: MerchantSector[] }> {
  return api.get<{ sectors: MerchantSector[] }>('/merchants/sectors');
}

export function spendMerchantToken(tokenId: string): Promise<void> {
  return api.post<void>(`/merchants/tokens/${tokenId}/spend`, {});
}

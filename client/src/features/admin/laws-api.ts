import { api } from '../../shared/api/client';

/** Механические законы съезда: колесо фортуны и граффити. */
export type LawKind = 'wheel_of_fortune' | 'graffiti' | 'helping_hand';

export type WheelPrizeKind =
  | 'influence'
  | 'experience'
  | 'upgrade_point'
  | 'trader_token'
  | 'saboteur_token'
  | 'queue_priority'
  | 'fortification'
  | 'jackpot';

/** Всё, что попадает в журнал законов: плюшка колеса или краска. */
export type LawEffectKind = WheelPrizeKind | 'graffiti' | 'extra_reroll';

export type LawEffectStatus = 'applied' | 'armed' | 'consumed' | 'cancelled';

export interface WheelPrizeDef {
  kind: WheelPrizeKind;
  title: string;
  description: string;
  timing: 'instant' | 'armed';
  weight: number;
  needs_sector: boolean;
}

export interface LawEffect {
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

export interface LawEffectsResponse {
  armed: LawEffect[];
  history: LawEffect[];
}

export function getWheelCatalog(): Promise<{ prizes: WheelPrizeDef[] }> {
  return api.get<{ prizes: WheelPrizeDef[] }>('/laws/wheel/catalog');
}

export function getLawEffects(): Promise<LawEffectsResponse> {
  return api.get<LawEffectsResponse>('/laws');
}

/** Лента колеса — её видят и участники на странице законов. */
export function getWheelFeed(): Promise<{ spins: LawEffect[] }> {
  return api.get<{ spins: LawEffect[] }>('/laws/feed');
}

/** Крутит сервер: клиент только доигрывает анимацию до выпавшего сектора. */
export function spinWheel(teamId: string): Promise<LawEffect> {
  return api.post<LawEffect>('/laws/wheel/spin', { team_id: teamId });
}

export function applyLawEffect(id: string, sectorId: string): Promise<LawEffect> {
  return api.post<LawEffect>(`/laws/${id}/apply`, { sector_id: sectorId });
}

/** Закон «Граффити»: покрасить сектор в цвет команды. */
export function paintGraffiti(payload: {
  team_id: string;
  sector_id: string;
}): Promise<LawEffect> {
  return api.post<LawEffect>('/laws/graffiti', payload);
}

/** Смыть краску. */
export function washGraffiti(id: string): Promise<LawEffect> {
  return api.post<LawEffect>(`/laws/graffiti/${id}/wash`, {});
}

/** Закон «Рука помощи»: раздать доп. реролл тем, у кого его нет. */
export function grantHelpingHand(): Promise<{ granted: string[]; skipped: string[] }> {
  return api.post<{ granted: string[]; skipped: string[] }>('/laws/helping-hand', {});
}

export function cancelLawEffect(id: string): Promise<LawEffect> {
  return api.post<LawEffect>(`/laws/${id}/cancel`, {});
}

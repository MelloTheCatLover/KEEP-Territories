import { api } from '../../shared/api/client';
import type { TeamFullStats } from '../team/types';

export type AwardResource = 'influence' | 'experience';

export type AwardShare = {
  team_id: string;
  team_name: string;
  points: number;
  influence: number;
  experience: number;
};

export type ProportionalAwardPayload = {
  resources: AwardResource[];
  totals: Partial<Record<AwardResource, number>>;
  points: Array<{ team_id: string; points: number }>;
};

export type ProportionalAwardResult = {
  shares: AwardShare[];
  teams: TeamFullStats[];
};

/** Split the totals by per-team scores and add them to every team at once. */
export function applyProportionalAward(
  payload: ProportionalAwardPayload,
): Promise<ProportionalAwardResult> {
  return api.post<ProportionalAwardResult>('/awards/proportional', payload);
}

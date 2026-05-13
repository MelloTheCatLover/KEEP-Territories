import { api } from '../../shared/api/client';
import type { TrophiesResponse } from './types';

export function getTrophies(): Promise<TrophiesResponse> {
  return api.get<TrophiesResponse>('/trophies');
}

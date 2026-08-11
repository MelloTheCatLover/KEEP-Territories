import { api } from '../../shared/api/client';
import type { TrophiesResponse, TrophyDetails, TrophyKey } from './types';

export function getTrophies(): Promise<TrophiesResponse> {
  return api.get<TrophiesResponse>('/trophies');
}

/** Полная раскладка метрики кубка по командам. Только для админа. */
export function getTrophyDetails(key: TrophyKey): Promise<TrophyDetails> {
  return api.get<TrophyDetails>(`/trophies/${key}/details`);
}

/** Назначить победителя вручную; `teamId = null` возвращает расчёт по метрике. */
export function setTrophyWinner(
  key: TrophyKey,
  teamId: string | null,
  note: string | null,
): Promise<TrophiesResponse> {
  return api.put<TrophiesResponse>(`/trophies/overrides/${key}`, {
    team_id: teamId,
    note,
  });
}

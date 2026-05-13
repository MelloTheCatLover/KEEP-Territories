import { api } from '../../shared/api/client';
import type { StatName, TeamFullStats } from '../team/types';

export function adminUpdateTeam(
  teamId: string,
  patch: { name?: string; color?: string | null },
): Promise<TeamFullStats> {
  return api.patch<TeamFullStats>(`/teams/${teamId}`, patch);
}

export function adminDeleteTeam(teamId: string): Promise<void> {
  return api.delete<void>(`/teams/${teamId}`);
}

export function adminKickMember(
  teamId: string,
  userId: string,
): Promise<TeamFullStats | { team_deleted: true }> {
  return api.delete<TeamFullStats | { team_deleted: true }>(
    `/teams/${teamId}/members/${userId}`,
  );
}

export function adminSetTeamResources(
  teamId: string,
  payload: { influence?: number; experience?: number; upgrade_points?: number },
): Promise<TeamFullStats> {
  return api.put<TeamFullStats>(`/teams/${teamId}/stats/admin/resources`, payload);
}

export function adminSetTeamStats(
  teamId: string,
  payload: Partial<Record<StatName, number>>,
): Promise<TeamFullStats> {
  return api.put<TeamFullStats>(`/teams/${teamId}/stats/admin/stats`, payload);
}

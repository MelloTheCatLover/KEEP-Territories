import { api } from '../../shared/api/client';
import type { TeamFullStats } from '../team/types';

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

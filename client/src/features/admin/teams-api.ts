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

export type UnassignedMember = { id: string; username: string; full_name: string | null };

export function getUnassignedMembers(): Promise<UnassignedMember[]> {
  return api.get<UnassignedMember[]>('/teams/unassigned');
}

export type RosterMember = {
  child_id: string;
  full_name: string | null;
  user_id: string | null;
  has_account: boolean;
  team_id: string | null;
  team_name: string | null;
};

export function getRoster(): Promise<RosterMember[]> {
  return api.get<RosterMember[]>('/teams/roster');
}

/** Move a player into a team from any other team, or from no team (post-kick). */
export function adminAssignMember(teamId: string, userId: string): Promise<TeamFullStats> {
  return api.post<TeamFullStats>(`/teams/${teamId}/members`, { user_id: userId });
}

/** Promote a team member to captain (demotes the current captain). */
export function adminSetCaptain(teamId: string, userId: string): Promise<TeamFullStats> {
  return api.post<TeamFullStats>(`/teams/${teamId}/captain`, { userId });
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

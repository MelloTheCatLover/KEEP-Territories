import { api } from '../../shared/api/client';
import type {
  CreateTeamPayload,
  LeaveTeamResponse,
  SetTeamIdentityPayload,
  Team,
  TeamFullStats,
  TransferCaptainPayload,
  UpgradeStatPayload,
} from './types';

export function getTeams(): Promise<Team[]> {
  return api.get<Team[]>('/teams');
}

export function getTeam(teamId: string): Promise<TeamFullStats> {
  return api.get<TeamFullStats>(`/teams/${teamId}`);
}

export function getTeamStats(teamId: string): Promise<TeamFullStats> {
  return api.get<TeamFullStats>(`/teams/${teamId}/stats`);
}

export function createTeam(payload: CreateTeamPayload): Promise<TeamFullStats> {
  return api.post<TeamFullStats>('/teams', payload);
}

export function joinTeam(teamId: string): Promise<TeamFullStats> {
  return api.post<TeamFullStats>(`/teams/${teamId}/join`);
}

export function setTeamIdentity(payload: SetTeamIdentityPayload): Promise<TeamFullStats> {
  return api.patch<TeamFullStats>('/teams/mine', payload);
}

export function leaveTeam(): Promise<LeaveTeamResponse> {
  return api.post<LeaveTeamResponse>('/teams/leave');
}

export function transferCaptain(payload: TransferCaptainPayload): Promise<TeamFullStats> {
  return api.post<TeamFullStats>('/teams/transfer', payload);
}

export function upgradeStat(teamId: string, payload: UpgradeStatPayload): Promise<TeamFullStats> {
  return api.post<TeamFullStats>(`/teams/${teamId}/stats/upgrade`, payload);
}

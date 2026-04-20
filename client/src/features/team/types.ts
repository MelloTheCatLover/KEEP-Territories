import type { User } from '../auth/types';

export type StatName = 'strength' | 'intelligence' | 'endurance' | 'leadership' | 'luck';

export type Team = {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamStats = {
  strength: number;
  intelligence: number;
  endurance: number;
  leadership: number;
  luck: number;
};

export type TeamFullStats = {
  id: string;
  name: string;
  color: string | null;
  influence: number;
  experience: number;
  level: number;
  available_upgrade_points: number;
  stats: TeamStats;
  members: User[];
  captured_sectors_count: number;
};

export type CreateTeamPayload = {
  name: string;
  home_sector_id: string;
  color?: string | null;
};

export type TransferCaptainPayload = {
  newCaptainId: string;
};

export type UpgradeStatPayload = {
  stat_name: StatName;
};

export type LeaveTeamResponse = {
  success: true;
};

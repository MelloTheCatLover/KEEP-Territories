import { UserPublic } from './user';

export type StatName = 'strength' | 'intelligence' | 'endurance' | 'leadership' | 'luck';

export interface TeamStatUpgrade {
  id: string;
  team_id: string;
  stat_name: StatName;
  level: number;
  created_at: Date;
}

export interface UpgradeStatDto {
  stat_name: StatName;
}

// Полная вычисляемая информация о команде
export interface TeamFullStats {
  id: string;
  name: string;
  color: string | null;
  influence: number;
  experience: number;
  level: number;
  available_upgrade_points: number;
  stats: {
    strength: number;
    intelligence: number;
    endurance: number;
    leadership: number;
    luck: number;
  };
  members: UserPublic[];
  captured_sectors_count: number;
}

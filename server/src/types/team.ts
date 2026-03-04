import { UserPublic } from './user';

export interface Team {
  id: string;
  name: string;
  influence: number;
  experience: number;
  strength: number;
  intelligence: number;
  endurance: number;
  leadership: number;
  luck: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTeamDto {
  name: string;
  influence: number;
  experience: number;
  strength: number;
  intelligence: number;
  endurance: number;
  leadership: number;
  luck: number;
}

export interface TeamWithMembers extends Team {
  members: UserPublic[];
}

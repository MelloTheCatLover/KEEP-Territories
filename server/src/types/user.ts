export interface User {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  team_id: string | null;
  team_role: TeamRole | null;
  created_at: Date;
  updated_at: Date;
}

export type TeamRole = 'captain' | 'member';

export interface UserPublic {
  id: string;
  email: string;
  username: string;
  team_id: string | null;
  team_role: TeamRole | null;
  created_at: Date;
}

export interface CreateUserDto {
  email: string;
  username: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

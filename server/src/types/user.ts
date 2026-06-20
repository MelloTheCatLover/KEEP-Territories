export interface User {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  team_id: string | null;
  team_role: TeamRole | null;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export type TeamRole = 'captain' | 'member';
export type UserRole = 'student' | 'admin';

export interface UserPublic {
  id: string;
  email: string;
  username: string;
  team_id: string | null;
  team_role: TeamRole | null;
  role: UserRole;
  created_at: Date;
}

export interface CreateUserDto {
  email: string;
  username: string;
  password: string;
  /** Optional roster code: links the new account to a child in a list. */
  code?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export type UserRole = 'student' | 'admin';
export type TeamRole = 'captain' | 'member';

export type User = {
  id: string;
  email: string;
  username: string;
  team_id: string | null;
  team_role: TeamRole | null;
  role: UserRole;
  created_at: string;
};

export type AuthResponse = {
  user: User;
  token: string;
};

export type MeResponse = {
  user: User;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  email: string;
  username: string;
  password: string;
};

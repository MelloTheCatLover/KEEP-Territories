import { UserPublic } from './user';

export interface JwtPayload {
  userId: string;
  email: string;
}

export interface AuthResponse {
  user: UserPublic;
  token: string;
}

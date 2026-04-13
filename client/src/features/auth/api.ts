import { api } from '../../shared/api/client';
import type {
  AuthResponse,
  MeResponse,
  LoginPayload,
  RegisterPayload,
} from './types';

export function loginRequest(payload: LoginPayload): Promise<AuthResponse> {
  return api.post<AuthResponse>('/auth/login', payload);
}

export function registerRequest(payload: RegisterPayload): Promise<AuthResponse> {
  return api.post<AuthResponse>('/auth/register', payload);
}

export function meRequest(): Promise<MeResponse> {
  return api.get<MeResponse>('/auth/me');
}

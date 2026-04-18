import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { setAuthToken, getAuthToken } from '../../shared/api/client';
import { loginRequest, registerRequest, meRequest } from './api';
import type { User } from './types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setStatus('unauthenticated');
      return;
    }
    meRequest()
      .then((res) => {
        setUser(res.user);
        setStatus('authenticated');
      })
      .catch(() => {
        setAuthToken(null);
        setUser(null);
        setStatus('unauthenticated');
      });
  }, []);

  async function login(email: string, password: string) {
    const res = await loginRequest({ email, password });
    setAuthToken(res.token);
    setUser(res.user);
    setStatus('authenticated');
  }

  async function register(email: string, username: string, password: string) {
    const res = await registerRequest({ email, username, password });
    setAuthToken(res.token);
    setUser(res.user);
    setStatus('authenticated');
  }

  function logout() {
    setAuthToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }

  async function refreshUser() {
    const res = await meRequest();
    setUser(res.user);
  }

  return (
    <AuthContext.Provider value={{ status, user, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

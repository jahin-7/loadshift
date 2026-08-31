import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as api from './api.js';
import { clearToken, getToken, setToken } from './tokenStore.js';

interface AuthState {
  user: api.User | null;
  loading: boolean;
  signup: (email: string, password: string, shopName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => void;
  refreshUser: (user: api.User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<api.User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .fetchMe()
      .then(({ user: me }) => setUser(me))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const signup = useCallback(async (email: string, password: string, shopName: string) => {
    const { token, user: created } = await api.signup(email, password, shopName);
    setToken(token);
    setUser(created);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: loggedIn } = await api.login(email, password);
    setToken(token);
    setUser(loggedIn);
  }, []);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const { token, user: loggedIn } = await api.loginWithGoogle(credential);
    setToken(token);
    setUser(loggedIn);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const refreshUser = useCallback((updated: api.User) => setUser(updated), []);

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, loginWithGoogle, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}

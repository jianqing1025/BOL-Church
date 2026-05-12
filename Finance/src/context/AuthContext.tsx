import React, { createContext, useContext, useEffect, useReducer } from 'react';
import { api } from '../utils/api';
import type { Role, User } from '../types';

type AuthState = {
  user: User | null;
  loading: boolean;
  error: string | null;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  hasPermission: (...roles: Role[]) => boolean;
};

type Action =
  | { type: 'loading'; loading: boolean }
  | { type: 'user'; user: User | null }
  | { type: 'error'; error: string | null };

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function reducer(state: AuthState, action: Action): AuthState {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: action.loading };
    case 'user':
      return { ...state, user: action.user, loading: false, error: null };
    case 'error':
      return { ...state, error: action.error, loading: false };
    default:
      return state;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { user: null, loading: true, error: null });

  useEffect(() => {
    api.me()
      .then(({ user }) => dispatch({ type: 'user', user }))
      .catch(() => dispatch({ type: 'user', user: null }));
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const result = await api.login(email, password);
      dispatch({ type: 'user', user: result.user });
      return true;
    } catch (error) {
      dispatch({ type: 'error', error: error instanceof Error ? error.message : '登入失敗' });
      return false;
    }
  };

  const logout = async () => {
    await api.logout().catch(() => undefined);
    dispatch({ type: 'user', user: null });
  };

  const hasPermission = (...roles: Role[]) => Boolean(state.user && roles.includes(state.user.role));

  return (
    <AuthContext.Provider value={{ ...state, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

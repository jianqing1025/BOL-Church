import React, { createContext, useContext, useEffect, useReducer } from 'react';
import { api } from '../utils/api';
import { isMultiChurch, type Me } from '../saas/platform';
import type { Role, User } from '../types';

type AuthState = {
  user: User | null;
  /** The whole /api/auth/me answer: in the multi-church app also the account, the church and its plan. */
  me: Me | null;
  loading: boolean;
  error: string | null;
  /** Set when a login needs the e-mail verified first (multi-church app). */
  unverifiedEmail: string | null;
};

type AuthContextValue = AuthState & {
  /** The multi-church app (sign-up, several churches, plans) rather than BOLCCOP's own. */
  multiChurch: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  hasPermission: (...roles: Role[]) => boolean;
  /** Takes a fresh /api/auth/me answer (after sign-up, creating or switching a church). */
  applyMe: (me: Me) => void;
  refresh: () => Promise<void>;
};

type Action =
  | { type: 'loading'; loading: boolean }
  | { type: 'me'; me: Me | null }
  | { type: 'error'; error: string | null; unverifiedEmail?: string | null };

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function reducer(state: AuthState, action: Action): AuthState {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: action.loading };
    case 'me':
      return { ...state, me: action.me, user: action.me?.user ?? null, loading: false, error: null, unverifiedEmail: null };
    case 'error':
      return { ...state, error: action.error, unverifiedEmail: action.unverifiedEmail ?? null, loading: false };
    default:
      return state;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { user: null, me: null, loading: true, error: null, unverifiedEmail: null });

  const refresh = async () => {
    try {
      dispatch({ type: 'me', me: await api.me() });
    } catch {
      dispatch({ type: 'me', me: null });
    }
  };

  useEffect(() => { void refresh(); }, []);

  const login = async (email: string, password: string) => {
    try {
      const result = await api.login(email, password);
      dispatch({ type: 'me', me: result });
      return true;
    } catch (error) {
      const code = (error as { code?: string }).code;
      dispatch({
        type: 'error',
        error: error instanceof Error ? error.message : '登入失敗',
        unverifiedEmail: code === 'email_unverified' ? email : null,
      });
      return false;
    }
  };

  const logout = async () => {
    await api.logout().catch(() => undefined);
    // Keep knowing which app this is, so the login page shows sign-up where it should.
    dispatch({ type: 'me', me: isMultiChurch(state.me) ? { user: null, account: null, church: null, churches: [] } : null });
  };

  const hasPermission = (...roles: Role[]) => Boolean(state.user && roles.includes(state.user.role));

  return (
    <AuthContext.Provider value={{
      ...state,
      multiChurch: isMultiChurch(state.me),
      login,
      logout,
      hasPermission,
      applyMe: (me) => dispatch({ type: 'me', me }),
      refresh,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

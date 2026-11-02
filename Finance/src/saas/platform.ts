import type { User } from '../types';

/**
 * The multi-church app's side of the frontend. The same build serves BOLCCOP
 * (single church) and the multi-church app; which one this is shows in
 * /api/auth/me, which only the multi-church server answers with `account`.
 */

export interface ChurchPlan { needsSubscription: boolean; subscribed: boolean; writable: boolean }

export interface ChurchInfo {
  id: string;
  name: string;
  declaredSize: number;
  timezone: string;
  currency: string;
  plan: ChurchPlan;
}

export interface Me {
  user: User | null;
  /** Present only in the multi-church app. */
  account?: { id: string; name: string; email: string } | null;
  church?: ChurchInfo | null;
  churches?: Array<{ id: string; name: string; role: User['role'] }>;
}

export const isMultiChurch = (me: Me | null) => !!me && 'account' in me;

/** Churches with this many people or fewer use everything free. */
export const FREE_CHURCH_SIZE = 100;
export const PRO_PRICE_USD = 5.99;

/** A church's public pages live under /c/<churchId>; '' elsewhere (and always for BOLCCOP). */
const PREFIX = /^\/c\/[0-9a-f-]{36}(?=\/|$)/i;

export function publicBase(): string {
  return window.location.pathname.match(PREFIX)?.[0] ?? '';
}

/** The app's own path, without a church prefix: what the page routes on. */
export function appPath(): string {
  return window.location.pathname.replace(PREFIX, '') || '/';
}

async function send<T>(path: string, body: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as T & { error?: string; code?: string };
  if (!response.ok) throw Object.assign(new Error(data.error || `Request failed: ${response.status}`), { code: data.code });
  return data;
}

export const platformApi = {
  register: (name: string, email: string, password: string) => send<{ ok: true; email: string }>('/api/platform/register', { name, email, password }),
  verifyEmail: (email: string, code: string) => send<Me>('/api/platform/verify-email', { email, code }),
  resendCode: (email: string) => send<{ ok: true }>('/api/platform/resend-code', { email }),
  createChurch: (name: string, declaredSize: number) => send<Me>('/api/platform/churches', { name, declaredSize }),
  switchChurch: (churchId: string) => send<Me>('/api/platform/switch-church', { churchId }),
  updateChurch: (changes: { name?: string; declaredSize?: number }) => send<Me>('/api/platform/church', changes, 'PUT'),
  deleteAccount: (password: string) => send<{ ok: true }>('/api/platform/delete-account', { password }),
};

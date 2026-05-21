import type { AppSettings, AuditLog, DashboardStats, Expense, ExpenseCategory, LookupData, Member, Offering, Role, User, UserAccount } from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers
    },
    ...init
  });

  if (!response.ok) {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body) as { error?: string };
      throw new Error(parsed.error || `Request failed: ${response.status}`);
    } catch {
      throw new Error(body || `Request failed: ${response.status}`);
    }
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<{ user: User | null }>('/api/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  forgotPassword: (email: string) =>
    request<{ ok: true }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: true }>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  dashboard: () => request<DashboardStats>('/api/finance/dashboard'),
  settings: () => request<AppSettings>('/api/settings'),
  updateSettings: (payload: AppSettings) =>
    request<AppSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  lookups: () => request<LookupData>('/api/lookups'),
  members: (query = '') => request<{ items: Member[]; total: number }>(`/api/members${query}`),
  createMember: (payload: Partial<Member>) =>
    request<Member>('/api/members', { method: 'POST', body: JSON.stringify(payload) }),
  updateMember: (id: string, payload: Partial<Member>) =>
    request<Member>(`/api/members/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteMember: (id: string, reason: string) =>
    request<{ ok: true }>(`/api/members/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  starMember: (id: string) => request<Member>(`/api/members/${id}/star`, { method: 'POST' }),
  offerings: (query = '') => request<{ items: Offering[]; total: number }>(`/api/offerings${query}`),
  createOffering: (payload: Partial<Offering>) =>
    request<Offering>('/api/offerings', { method: 'POST', body: JSON.stringify(payload) }),
  updateOffering: (id: string, payload: Partial<Offering>) =>
    request<Offering>(`/api/offerings/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteOffering: (id: string, reason: string) =>
    request<{ ok: true }>(`/api/offerings/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  expenses: (query = '') => request<{ items: Expense[]; total: number }>(`/api/expenses${query}`),
  createExpense: (payload: Partial<Expense>) =>
    request<Expense>('/api/expenses', { method: 'POST', body: JSON.stringify(payload) }),
  updateExpense: (id: string, payload: Partial<Expense>) =>
    request<Expense>(`/api/expenses/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteExpense: (id: string, reason: string) =>
    request<{ ok: true }>(`/api/expenses/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  approveExpense: (id: string) => request<Expense>(`/api/expenses/${id}/approve`, { method: 'POST' }),
  rejectExpense: (id: string) => request<Expense>(`/api/expenses/${id}/reject`, { method: 'POST' }),
  expenseCategories: () => request<ExpenseCategory[]>('/api/expenses/categories'),
  auditLogs: () => request<{ items: AuditLog[]; total: number }>('/api/audit-logs'),
  sendTaxStatement: (memberId: string, year: number) =>
    request<{ ok: true }>('/api/reports/tax-statement/send', { method: 'POST', body: JSON.stringify({ memberId, year }) }),
  users: () => request<{ items: UserAccount[]; total: number }>('/api/users'),
  createUser: (payload: { name: string; email: string; role: Role; password: string }) =>
    request<UserAccount>('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id: string, payload: { name: string; email: string; role: Role; active: boolean }) =>
    request<UserAccount>(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteUser: (id: string) =>
    request<{ ok: true }>(`/api/users/${id}`, { method: 'DELETE' }),
  resetUserPassword: (id: string, password: string) =>
    request<{ ok: true }>(`/api/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
  upload: (file: File, type: string, entityId?: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    if (entityId) form.append('entityId', entityId);
    return request<{ key: string; url: string }>('/api/upload', { method: 'POST', body: form });
  }
};

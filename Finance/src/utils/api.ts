import type { DashboardStats, Expense, ExpenseCategory, LookupData, Member, Offering, User } from '../types';

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
  dashboard: () => request<DashboardStats>('/api/finance/dashboard'),
  lookups: () => request<LookupData>('/api/lookups'),
  members: (query = '') => request<{ items: Member[]; total: number }>(`/api/members${query}`),
  createMember: (payload: Partial<Member>) =>
    request<Member>('/api/members', { method: 'POST', body: JSON.stringify(payload) }),
  updateMember: (id: string, payload: Partial<Member>) =>
    request<Member>(`/api/members/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteMember: (id: string) => request<{ ok: true }>(`/api/members/${id}`, { method: 'DELETE' }),
  offerings: (query = '') => request<{ items: Offering[]; total: number }>(`/api/offerings${query}`),
  createOffering: (payload: Partial<Offering>) =>
    request<Offering>('/api/offerings', { method: 'POST', body: JSON.stringify(payload) }),
  updateOffering: (id: string, payload: Partial<Offering>) =>
    request<Offering>(`/api/offerings/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteOffering: (id: string) => request<{ ok: true }>(`/api/offerings/${id}`, { method: 'DELETE' }),
  expenses: (query = '') => request<{ items: Expense[]; total: number }>(`/api/expenses${query}`),
  createExpense: (payload: Partial<Expense>) =>
    request<Expense>('/api/expenses', { method: 'POST', body: JSON.stringify(payload) }),
  updateExpense: (id: string, payload: Partial<Expense>) =>
    request<Expense>(`/api/expenses/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteExpense: (id: string) => request<{ ok: true }>(`/api/expenses/${id}`, { method: 'DELETE' }),
  approveExpense: (id: string) => request<Expense>(`/api/expenses/${id}/approve`, { method: 'POST' }),
  rejectExpense: (id: string) => request<Expense>(`/api/expenses/${id}/reject`, { method: 'POST' }),
  expenseCategories: () => request<ExpenseCategory[]>('/api/expenses/categories'),
  upload: (file: File, type: string, entityId?: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    if (entityId) form.append('entityId', entityId);
    return request<{ key: string; url: string }>('/api/upload', { method: 'POST', body: form });
  }
};

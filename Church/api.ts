import type { AdminRole, AdminUser, AnalyticsSummary, Donation, Message, PrayerRequest, Sermon, SiteBootstrap } from './data';

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
    credentials: 'same-origin',
    ...init,
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = raw;

    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed?.error) {
        message = parsed.error;
      }
    } catch {
      // Keep raw text when the response body is not JSON.
    }

    throw new Error(message || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: () => request<SiteBootstrap>('/api/bootstrap'),
  me: () => request<{ user: AdminUser | null }>('/api/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: AdminUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () =>
    request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  updateMe: (payload: { name?: string; email?: string; currentPassword?: string; newPassword?: string }) =>
    request<{ user: AdminUser }>('/api/auth/me', { method: 'PATCH', body: JSON.stringify(payload) }),
  listUsers: () =>
    request<AdminUser[]>('/api/users'),
  createUser: (payload: { name: string; email: string; password: string; role: AdminRole }) =>
    request<AdminUser>('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id: string, payload: Partial<{ name: string; email: string; password: string; role: AdminRole; active: boolean }>) =>
    request<AdminUser>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  saveContent: (content: SiteBootstrap['content']) =>
    request<{ ok: true }>('/api/content', { method: 'PUT', body: JSON.stringify(content) }),
  createSermon: (sermon: Omit<Sermon, 'id'>) =>
    request<Sermon>('/api/sermons', { method: 'POST', body: JSON.stringify(sermon) }),
  updateSermon: (id: string, sermon: Omit<Sermon, 'id'>) =>
    request<Sermon>(`/api/sermons/${id}`, { method: 'PUT', body: JSON.stringify(sermon) }),
  deleteSermon: (id: string) =>
    request<{ ok: true }>(`/api/sermons/${id}`, { method: 'DELETE' }),
  createDailyManna: (sermon: Omit<Sermon, 'id'>) =>
    request<Sermon>('/api/daily-manna', { method: 'POST', body: JSON.stringify(sermon) }),
  updateDailyManna: (id: string, sermon: Omit<Sermon, 'id'>) =>
    request<Sermon>(`/api/daily-manna/${id}`, { method: 'PUT', body: JSON.stringify(sermon) }),
  deleteDailyManna: (id: string) =>
    request<{ ok: true }>(`/api/daily-manna/${id}`, { method: 'DELETE' }),
  saveImages: (images: Record<string, string>) =>
    request<Record<string, string>>('/api/images', { method: 'PUT', body: JSON.stringify(images) }),
  uploadImage: async (key: string, file: Blob, fileName: string) => {
    const form = new FormData();
    form.append('file', file, fileName);
    return request<{ key: string; url: string }>(`/api/images/upload?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      body: form,
    });
  },
  submitMessage: (payload: Omit<Message, 'id' | 'date' | 'read'>) =>
    request<Message>('/api/messages', { method: 'POST', body: JSON.stringify(payload) }),
  markMessageRead: (id: string) =>
    request<Message>(`/api/messages/${id}/read`, { method: 'PATCH' }),
  deleteMessage: (id: string) =>
    request<{ ok: true }>(`/api/messages/${id}`, { method: 'DELETE' }),
  submitPrayerRequest: (payload: Omit<PrayerRequest, 'id' | 'date' | 'status'>) =>
    request<PrayerRequest>('/api/prayer-requests', { method: 'POST', body: JSON.stringify(payload) }),
  markPrayerPrayed: (id: string) =>
    request<PrayerRequest>(`/api/prayer-requests/${id}/prayed`, { method: 'PATCH' }),
  deletePrayerRequest: (id: string) =>
    request<{ ok: true }>(`/api/prayer-requests/${id}`, { method: 'DELETE' }),
  submitDonation: (payload: Omit<Donation, 'id' | 'date' | 'status'>) =>
    request<Donation>('/api/donations', { method: 'POST', body: JSON.stringify(payload) }),
  analyticsSummary: () =>
    request<AnalyticsSummary>('/api/analytics/summary'),
};

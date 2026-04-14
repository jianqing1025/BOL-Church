import type { Donation, Message, PrayerRequest, Sermon, SiteBootstrap } from './data';

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: () => request<SiteBootstrap>('/api/bootstrap'),
  saveContent: (content: SiteBootstrap['content']) =>
    request<{ ok: true }>('/api/content', { method: 'PUT', body: JSON.stringify(content) }),
  createSermon: (sermon: Omit<Sermon, 'id'>) =>
    request<Sermon>('/api/sermons', { method: 'POST', body: JSON.stringify(sermon) }),
  updateSermon: (id: string, sermon: Omit<Sermon, 'id'>) =>
    request<Sermon>(`/api/sermons/${id}`, { method: 'PUT', body: JSON.stringify(sermon) }),
  deleteSermon: (id: string) =>
    request<{ ok: true }>(`/api/sermons/${id}`, { method: 'DELETE' }),
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
};

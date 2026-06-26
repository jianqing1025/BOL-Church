import type { AdminRole, AdminUser, AnalyticsSummary, ChurchPhoto, Donation, Message, PrayerRequest, Sermon, SermonCategory, SiteBootstrap, WebAnalyticsRange, WebAnalyticsSummary } from './data';
import type { LiveStreamAdminState, LiveStreamConfig, LiveStreamPublicState, LiveChatMessage } from './types';

export interface LiveStreamSavePayload {
  channelId?: string;
  apiKey?: string;
  serviceDay?: number;
  serviceStartLocal?: string;
  serviceDurationMinutes?: number;
  timezone?: string;
  manualVideoId?: string;
  enabled?: boolean;
}

export interface SyncChannelAdmin {
  id: string;
  name: string;
  channelId: string;
  apiKeyMasked: string;
  apiKeyPresent: boolean;
  enabled: boolean;
  sortOrder: number;
  updatedAt: string;
}

export type SyncTargetClient =
  | 'all' | 'sunday-worship' | 'worship-praise' | 'healing-prayer' | 'testimony' | 'daily-manna';

export interface SyncResultClient {
  inserted: number; updated: number; skipped: number;
  errors: string[]; pages: number; hasMore: boolean; category: string;
}

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
  photos: () => request<{ photos: ChurchPhoto[] }>('/api/photos'),
  photoSettings: () => request<{ maxLongEdge: number; jpegQuality: number }>('/api/photos/settings'),
  adminUpdatePhotoSettings: (payload: { maxLongEdge: number; jpegQuality: number }) =>
    request<{ maxLongEdge: number; jpegQuality: number }>('/api/admin/photos/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  uploadPhoto: (payload: {
    file: Blob;
    fileName: string;
    title?: string;
    collection?: string;
    album?: string;
    uploaderId: string;
    uploaderName?: string;
    thumb?: Blob | null;
    width?: number;
    height?: number;
    shotAt?: string;
    camera?: string;
    lens?: string;
    focalLength?: string;
    aperture?: string;
    shutter?: string;
    iso?: number;
  }) => {
    const form = new FormData();
    form.append('file', payload.file, payload.fileName);
    form.append('uploaderId', payload.uploaderId);
    if (payload.thumb) form.append('thumb', payload.thumb, `thumb-${payload.fileName}`);
    if (payload.title) form.append('title', payload.title);
    if (payload.collection) form.append('collection', payload.collection);
    if (payload.album) form.append('album', payload.album);
    if (payload.uploaderName) form.append('uploaderName', payload.uploaderName);
    if (payload.width) form.append('width', String(payload.width));
    if (payload.height) form.append('height', String(payload.height));
    if (payload.shotAt) form.append('shotAt', payload.shotAt);
    if (payload.camera) form.append('camera', payload.camera);
    if (payload.lens) form.append('lens', payload.lens);
    if (payload.focalLength) form.append('focalLength', payload.focalLength);
    if (payload.aperture) form.append('aperture', payload.aperture);
    if (payload.shutter) form.append('shutter', payload.shutter);
    if (payload.iso) form.append('iso', String(payload.iso));
    return request<{ photo: ChurchPhoto }>('/api/photos/upload', { method: 'POST', body: form });
  },
  deleteOwnPhoto: (id: string, uploaderId: string) =>
    request<{ ok: true }>(`/api/photos/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ uploaderId }) }),
  updateOwnPhoto: (id: string, uploaderId: string, payload: Partial<{ title: string; collection: string; album: string; uploaderName: string }>) =>
    request<{ photo: ChurchPhoto }>(`/api/photos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...payload, uploaderId }),
    }),
  adminPhotos: () => request<{ photos: ChurchPhoto[] }>('/api/admin/photos'),
  adminUpdatePhoto: (id: string, payload: Partial<{ title: string; collection: string; album: string; uploaderName: string; hidden: boolean; sortOrder: number }>) =>
    request<{ photo: ChurchPhoto }>(`/api/admin/photos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  adminDeletePhoto: (id: string) =>
    request<{ ok: true }>(`/api/admin/photos/${encodeURIComponent(id)}`, { method: 'DELETE' }),
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
  webAnalytics: (range: WebAnalyticsRange, excludeBots = true) =>
    request<WebAnalyticsSummary>(`/api/analytics/web?range=${encodeURIComponent(range)}&excludeBots=${excludeBots ? '1' : '0'}`),
  liveStreamPublic: () =>
    request<LiveStreamPublicState>('/api/live-stream'),
  liveStreamAdminGet: () =>
    request<{ config: LiveStreamConfig; state: LiveStreamAdminState }>('/api/admin/live-stream/config'),
  liveStreamAdminSave: (payload: LiveStreamSavePayload) =>
    request<{ config: LiveStreamConfig }>('/api/admin/live-stream/config', { method: 'PUT', body: JSON.stringify(payload) }),
  liveStreamAdminTest: (payload: { channelId?: string; apiKey?: string }) =>
    request<{ ok: boolean; channelName?: string; error?: string }>('/api/admin/live-stream/test', { method: 'POST', body: JSON.stringify(payload) }),
  liveStreamAdminProbe: () =>
    request<{ state: LiveStreamAdminState }>('/api/admin/live-stream/probe', { method: 'POST' }),
  sermonsSyncYoutube: (category: 'sermon' | 'daily-manna' | 'all' = 'all') =>
    request<{ inserted: number; updated: number; skipped: number; errors: string[]; pages: number; hasMore: boolean; category: string }>(
      `/api/admin/sermons/sync-youtube${category !== 'all' ? `?category=${category}` : ''}`,
      { method: 'POST' }
    ),
  syncChannelsList: () =>
    request<{ channels: SyncChannelAdmin[] }>('/api/admin/sync-channels'),
  syncChannelCreate: (payload: { name: string; channelId: string; apiKey: string }) =>
    request<{ channel: SyncChannelAdmin }>('/api/admin/sync-channels', { method: 'POST', body: JSON.stringify(payload) }),
  syncChannelUpdate: (id: string, payload: Partial<{ name: string; channelId: string; apiKey: string; enabled: boolean }>) =>
    request<{ channel: SyncChannelAdmin }>(`/api/admin/sync-channels/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  syncChannelDelete: (id: string) =>
    request<{ ok: true }>(`/api/admin/sync-channels/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  syncChannelTest: (id: string) =>
    request<{ ok: boolean; channelName?: string; error?: string }>(`/api/admin/sync-channels/${encodeURIComponent(id)}/test`, { method: 'POST' }),
  syncChannelSync: (id: string, target: SyncTargetClient) =>
    request<SyncResultClient>(`/api/admin/sync-channels/${encodeURIComponent(id)}/sync?target=${target}`, { method: 'POST' }),
  moveSermon: (id: string, to: SermonCategory | 'daily-manna' | 'live-override') =>
    request<{ ok: true; moved: string }>(`/api/admin/sermons/${encodeURIComponent(id)}/move`, {
      method: 'POST', body: JSON.stringify({ to })
    }),
  moveDailyManna: (id: string, to: SermonCategory) =>
    request<{ ok: true; moved: string }>(`/api/admin/daily-manna/${encodeURIComponent(id)}/move`, {
      method: 'POST', body: JSON.stringify({ to })
    }),
  setSermonVisibility: (id: string, hidden: boolean) =>
    request<{ ok: true; hidden: boolean }>(`/api/admin/sermons/${encodeURIComponent(id)}/visibility`, {
      method: 'PATCH', body: JSON.stringify({ hidden })
    }),
  setDailyMannaVisibility: (id: string, hidden: boolean) =>
    request<{ ok: true; hidden: boolean }>(`/api/admin/daily-manna/${encodeURIComponent(id)}/visibility`, {
      method: 'PATCH', body: JSON.stringify({ hidden })
    }),
  backfillSermonMetadata: () =>
    request<{ updated: number; batches: number; errors: string[]; hasMore: boolean }>('/api/admin/sermons/backfill-metadata', {
      method: 'POST',
    }),
  liveJoin: (payload: { sessionId: string; name?: string; asGuest?: boolean; displayName?: string }) =>
    request<{ displayName: string; guestNumber: number | null; isAdmin: boolean; videoId: string }>('/api/live/join', { method: 'POST', body: JSON.stringify(payload) }),
  liveRefresh: () =>
    request<LiveStreamPublicState>('/api/live/refresh', { method: 'POST' }),
  livePing: (sessionId: string) =>
    request<{ ok: boolean }>('/api/live/ping', { method: 'POST', body: JSON.stringify({ sessionId }) }),
  liveChatGet: (videoId: string, since = 0) =>
    request<{ messages: LiveChatMessage[] }>(`/api/live/chat?videoId=${encodeURIComponent(videoId)}&since=${since}`),
  liveChatPost: (payload: { sessionId: string; message: string }) =>
    request<{ ok: boolean; message?: LiveChatMessage; error?: string }>('/api/live/chat', { method: 'POST', body: JSON.stringify(payload) }),
  liveChatDelete: (id: string) =>
    request<{ ok: true }>(`/api/live/chat/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

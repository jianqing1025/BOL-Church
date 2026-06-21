
export enum Language {
  EN = 'en',
  ZH = 'zh',
}

export type SubPage = 'our-church' | 'our-beliefs' | 'about-pastor' | 'job-opportunities' | 'ministry-leaders' | 'becoming-a-member';
export type MinistrySubPage = 'kids' | 'men' | 'women' | 'joint' | 'alpha' | 'prayer';
export type SermonSubPage = 'daily-manna' | 'sunday-worship' | 'recent-sermons';
export type GivingSubPage = 'why-we-give' | 'what-is-tithing' | 'ways-to-give' | 'other-ways-to-give';
export type ContactSubPage = 'contact-us' | 'join-us' | 'prayer-request';
export type PrayerRequestSubPage = 'submit-request';

export interface LiveStreamConfig {
  channelId: string;
  apiKeyMasked: string;
  apiKeyPresent: boolean;
  serviceDay: number;
  serviceStartLocal: string;
  serviceDurationMinutes: number;
  timezone: string;
  manualVideoId: string;
  enabled: boolean;
  updatedAt: number;
}

export interface LiveStreamPublicLatestSermon {
  id: string;
  titleEn: string;
  titleZh: string;
  videoId: string;
  date: string;
}

export interface LiveStreamViewer {
  displayName: string;
  isAdmin: boolean;
  isGuest: boolean;
  guestNumber: number | null;
}

export interface LiveChatMessage {
  id: string;
  displayName: string;
  isAdmin: boolean;
  message: string;
  createdAt: number;
}

export interface LiveStreamPublicState {
  status: 'live' | 'offline';
  videoId: string | null;
  startedAt: number | null;
  nextServiceIso: string | null;
  latestSermon: LiveStreamPublicLatestSermon | null;
  latestSermons: LiveStreamPublicLatestSermon[];
  checkedAt: number | null;
  viewersOnline: number;
  youtubeViewers: number | null;
  viewerList: LiveStreamViewer[];
}

export interface LiveStreamAdminState {
  isLive: boolean;
  videoId: string | null;
  startedAt: number | null;
  checkedAt: number | null;
  lastError: string | null;
}

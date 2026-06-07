
export enum Language {
  EN = 'en',
  ZH = 'zh',
}

export type SubPage = 'our-church' | 'our-beliefs' | 'about-pastor' | 'job-opportunities' | 'ministry-leaders' | 'becoming-a-member';
export type MinistrySubPage = 'kids' | 'men' | 'women' | 'joint' | 'alpha' | 'prayer';
export type SermonSubPage = 'daily-manna' | 'sunday-worship' | 'recent-sermons' | 'live-stream';
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

export interface LiveStreamPublicState {
  status: 'live' | 'offline';
  videoId: string | null;
  startedAt: number | null;
  nextServiceIso: string | null;
  latestSermon: LiveStreamPublicLatestSermon | null;
  checkedAt: number | null;
}

export interface LiveStreamAdminState {
  isLive: boolean;
  videoId: string | null;
  startedAt: number | null;
  checkedAt: number | null;
  lastError: string | null;
}

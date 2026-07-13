import { translations } from './constants/translations';

export type SermonCategory = 'sunday-worship' | 'worship-praise' | 'healing-prayer' | 'testimony' | 'live-broadcast';

export interface Sermon {
  id: string;
  title: { en: string; zh: string };
  speaker: { en: string; zh: string };
  date: string;
  series: { en: string; zh: string };
  passage: { en: string; zh: string };
  youtubeId: string;
  imageUrl?: string;
  type: 'sermon' | 'daily-manna';
  category?: SermonCategory;
  hidden?: boolean;
  durationSeconds?: number | null;
  viewCount?: number | null;
  liveOnlineTotal?: number | null;
}

export interface SenderLocation {
  country?: string | null;
  region?: string | null;
  city?: string | null;
}

export interface Message extends SenderLocation {
  id: string;
  date: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  read: boolean;
}

export interface PrayerRequest extends SenderLocation {
  id: string;
  date: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  status: 'new' | 'prayed';
}

export interface MailboxReply {
  id: string;
  parentType: 'message' | 'prayer';
  parentId: string;
  body: string;
  toEmail: string;
  sentBy: string | null;
  status: 'sent' | 'failed' | 'received';
  error: string | null;
  createdAt: number;
  /** out=我方回覆；in=對方來信（Resend inbound webhook 寫入） */
  direction: 'out' | 'in';
  /** 入站郵件的發件人（out 方向為 null） */
  fromEmail: string | null;
}

/** 信箱寄信設定：發信人（名稱+郵箱）、對方回信收件地址，以及回信模板（稱呼/署名）。 */
export interface MailboxSettings {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  /** 開頭稱呼模板，{name} 代表對方姓名 */
  greeting: string;
  /** 結尾署名（可多行） */
  signature: string;
}

export interface Donation {
  id: string;
  date: string;
  amount: number;
  type: 'one-time' | 'recurring';
  status: 'completed';
}

export interface ChurchPhotoExif {
  camera?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutter?: string;
  iso?: number;
}

export interface ChurchPhoto {
  id: string;
  src: string;
  title: string;
  collection: string;
  album: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  thumbSrc?: string;
  shotAt?: string;
  exif?: ChurchPhotoExif;
  uploaderId?: string;
  uploaderName?: string;
  hidden?: boolean;
  viewCount?: number;
  favoriteCount?: number;
  isFavorite?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type AdminRole = 'owner' | 'contributor';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsCountry {
  country: string;
  requests: number;
}

export interface AnalyticsTimeseriesPoint {
  date: string;
  pageviews: number;
  visitors: number;
}

export interface AnalyticsSummary {
  configured: boolean;
  source: 'cloudflare';
  period: '7d';
  pageviews: number;
  visitors: number;
  countries: AnalyticsCountry[];
  timeseries: AnalyticsTimeseriesPoint[];
  lastUpdated: string;
  error?: string;
}

export type WebAnalyticsRange = '24h' | '72h' | '7d' | '30d';

export interface WebAnalyticsRankedItem {
  label: string;
  pageviews: number;
  visits: number;
}

export interface WebAnalyticsTimeseriesPoint {
  datetime: string;
  pageviews: number;
  visits: number;
}

export interface WebAnalyticsPerformance {
  pageLoadP50Ms: number | null;
  pageLoadP75Ms: number | null;
  pageLoadP90Ms: number | null;
  lcpP75Ms: number | null;
  inpP75Ms: number | null;
  clsP75: number | null;
  fcpP75Ms: number | null;
}

export interface WebAnalyticsSummary {
  configured: boolean;
  source: 'cloudflare-web-analytics';
  range: WebAnalyticsRange;
  excludeBots: boolean;
  siteTag?: string;
  pageviews: number;
  visits: number;
  timeseries: WebAnalyticsTimeseriesPoint[];
  paths: WebAnalyticsRankedItem[];
  countries: WebAnalyticsRankedItem[];
  referrers: WebAnalyticsRankedItem[];
  browsers: WebAnalyticsRankedItem[];
  operatingSystems: WebAnalyticsRankedItem[];
  deviceTypes: WebAnalyticsRankedItem[];
  hosts: WebAnalyticsRankedItem[];
  performance: WebAnalyticsPerformance;
  lastUpdated: string;
  error?: string;
}

export interface SiteBootstrap {
  content: typeof translations;
  images: Record<string, string>;
  sermons: Sermon[];
  dailyManna: Sermon[];
  messages: Message[];
  prayerRequests: PrayerRequest[];
  donations: Donation[];
  currentUser?: AdminUser | null;
  users?: AdminUser[];
}

export const DEFAULT_SERMONS: Omit<Sermon, 'id'>[] = [
  {
    title: { en: 'Daily Manna: Walking with God', zh: '每日天言：與神同行' },
    speaker: { en: 'Pastor Andy Yu', zh: '余大器 牧師' },
    date: '2024-05-20',
    series: { en: 'Daily Devotion', zh: '每日靈修' },
    passage: { en: 'Psalm 23', zh: '詩篇 23' },
    youtubeId: 'Fj-P7o5Fv5g',
    type: 'daily-manna'
  },
  {
    title: { en: 'The Power of Forgiveness', zh: '饒恕的力量' },
    speaker: { en: 'Pastor Andy Yu', zh: '余大器 牧師' },
    date: '2024-05-19',
    series: { en: 'Gospel Living', zh: '福音生活' },
    passage: { en: 'Matthew 18:21-35', zh: '馬太福音 18:21-35' },
    youtubeId: 'kYm9S2v7Y7U',
    type: 'sermon'
  },
  {
    title: { en: 'Living a Life of Purpose', zh: '活出有目標的生命' },
    speaker: { en: 'Guest Pastor Chen', zh: '特邀講員陳牧師' },
    date: '2024-05-12',
    series: { en: 'Purpose Driven', zh: '標竿人生' },
    passage: { en: 'Ephesians 2:10', zh: '以弗所書 2:10' },
    youtubeId: '8pBq2H8yY-U',
    type: 'sermon'
  },
  {
    title: { en: 'Faith Over Fear', zh: '以信勝懼' },
    speaker: { en: 'Pastor Andy Yu', zh: '余大器 牧師' },
    date: '2024-05-05',
    series: { en: 'Faith Journey', zh: '信心之旅' },
    passage: { en: 'Isaiah 41:10', zh: '以賽亞書 41:10' },
    youtubeId: 'vV06uH9O90M',
    type: 'sermon'
  }
];

export const DEFAULT_SITE_BOOTSTRAP: SiteBootstrap = {
  content: translations,
  images: {},
  sermons: DEFAULT_SERMONS
    .filter(sermon => sermon.type === 'sermon')
    .map((sermon, index) => ({ ...sermon, id: `default-sermon-${index + 1}` })),
  dailyManna: DEFAULT_SERMONS
    .filter(sermon => sermon.type === 'daily-manna')
    .map((sermon, index) => ({ ...sermon, id: `default-manna-${index + 1}` })),
  messages: [],
  prayerRequests: [],
  donations: []
};

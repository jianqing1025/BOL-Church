import { translations } from './constants/translations';

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
}

export interface Message {
  id: string;
  date: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  read: boolean;
}

export interface PrayerRequest {
  id: string;
  date: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  status: 'new' | 'prayed';
}

export interface Donation {
  id: string;
  date: string;
  amount: number;
  type: 'one-time' | 'recurring';
  status: 'completed';
}

export interface SiteBootstrap {
  content: typeof translations;
  images: Record<string, string>;
  sermons: Sermon[];
  messages: Message[];
  prayerRequests: PrayerRequest[];
  donations: Donation[];
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
  sermons: DEFAULT_SERMONS.map((sermon, index) => ({ ...sermon, id: `default-${index + 1}` })),
  messages: [],
  prayerRequests: [],
  donations: []
};

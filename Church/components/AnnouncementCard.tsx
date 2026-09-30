import React, { useMemo, useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { useLocalization } from '../hooks/useLocalization';
import { Language } from '../types';
import { currentAnnouncements, shouldShowCard, todayInChurch, type Announcement } from '../bulletin/announcements';

const DISMISS_KEY = 'bolccop.announcements.dismissed';

const readDismissed = (): string[] | null => {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** 公告的日期徽章：活動日期，沒有則顯示到。「10/12 週日」／「Oct 12 Sun」 */
export function announcementDateLabel(item: Announcement, language: Language): string {
  const date = item.eventDate ?? item.showUntil;
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12));
  if (language === Language.EN) {
    return day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' });
  }
  return `${m}/${d} ${day.toLocaleDateString('zh-TW', { weekday: 'short', timeZone: 'UTC' })}`;
}

/** 目前（今天、教會時區）未到期的公告。 */
export function useCurrentAnnouncements(): Announcement[] {
  const { announcements } = useAdmin();
  return useMemo(() => currentAnnouncements(announcements, todayInChurch()), [announcements]);
}

/**
 * 首頁 Hero 上的公告小卡：桌面浮在右側，手機是下緣的精簡橫條。
 * 按 × 關閉；之後只有出現新的公告才會再出現。
 */
const AnnouncementCard: React.FC = () => {
  const { t, language } = useLocalization();
  const current = useCurrentAnnouncements();
  const [dismissed, setDismissed] = useState(readDismissed);
  const ids = current.map(item => item.id);
  if (!shouldShowCard(ids, dismissed)) return null;

  const close = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(ids)); } catch { /* 無痕模式：只是下次還會出現 */ }
    setDismissed(ids);
  };
  const closeButton = (
    <button type="button" onClick={close} aria-label={t('announcements.close')} title={t('announcements.close')}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/15 hover:text-white">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  );
  const badge = (item: Announcement) => (
    <span className="shrink-0 rounded-md bg-blue-500/90 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white tabular-nums">
      {announcementDateLabel(item, language)}
    </span>
  );

  const first = current[0];
  return (
    <>
      {/* 桌面：右側小卡 */}
      <aside className="absolute bottom-8 right-6 z-20 hidden w-80 rounded-2xl bg-black/55 p-4 text-left text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-md md:block lg:right-10"
        aria-label={t('announcements.latest')}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-wide">{t('announcements.latest')}</h2>
          {closeButton}
        </div>
        <ul className="space-y-1">
          {current.slice(0, 3).map(item => (
            <li key={item.id}>
              <a href={`/announcements#${item.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10">
                {badge(item)}
                <span className="min-w-0 truncate text-sm">{item.title}</span>
              </a>
            </li>
          ))}
        </ul>
        <a href="/announcements" className="mt-2 block px-2 text-right text-xs font-semibold text-blue-200 hover:text-white">{t('announcements.viewAll')}</a>
      </aside>

      {/* 手機：Hero 下緣的橫條 */}
      <a href="/announcements" aria-label={t('announcements.latest')}
        className="absolute inset-x-4 bottom-4 z-20 flex items-center gap-2 rounded-xl bg-black/60 py-1.5 pl-3 pr-1.5 text-left text-white shadow-xl ring-1 ring-white/15 backdrop-blur-md md:hidden">
        {badge(first)}
        <span className="min-w-0 flex-1 truncate text-sm">{first.title}</span>
        {current.length > 1 && (
          <span className="shrink-0 text-xs text-white/70">{t('announcements.more').replace('{n}', String(current.length - 1))}</span>
        )}
        {closeButton}
      </a>
    </>
  );
};

export default AnnouncementCard;

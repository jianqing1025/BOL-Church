import React, { useEffect, useState } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { useAdmin } from '../hooks/useAdmin';
import { renderRichText } from '../utils/richText';
import { VideoCardSkeletons } from './ListPlaceholder';
import { announcementDateLabel, useCurrentAnnouncements } from './AnnouncementCard';

/** 公告欄全文：所有未到期的公告，由近到遠。網址帶 #id 時捲到那一則並短暫標示。 */
const AnnouncementsPage: React.FC = () => {
  const { t, language } = useLocalization();
  const { loading } = useAdmin();
  const current = useCurrentAnnouncements();
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (!id || !current.some(item => item.id === id)) return;
    document.getElementById(`announcement-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlight(id);
    const timer = window.setTimeout(() => setHighlight(null), 2000);
    return () => window.clearTimeout(timer);
  }, [current]);

  return (
    <div>
      <PageHeader title={t('announcements.title')} subtitle={t('announcements.subtitle')} />
      <div className="container mx-auto max-w-3xl px-6 py-12">
        {loading && current.length === 0 ? (
          <VideoCardSkeletons count={2} className="grid gap-4" />
        ) : current.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 py-16 text-center text-gray-500">{t('announcements.empty')}</p>
        ) : (
          <ol className="space-y-5">
            {current.map(item => (
              <li key={item.id} id={`announcement-${item.id}`}
                className={`rounded-2xl bg-white p-6 shadow-sm ring-1 transition-shadow ${highlight === item.id ? 'ring-2 ring-blue-400' : 'ring-gray-200'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-md bg-blue-600 px-2 py-1 text-xs font-bold text-white tabular-nums">{announcementDateLabel(item, language)}</span>
                  <h2 className="text-xl font-bold text-gray-900">{item.title}</h2>
                </div>
                {item.bodyHtml && <div className="rich-text mt-3 leading-relaxed text-gray-700">{renderRichText(item.bodyHtml)}</div>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};

export default AnnouncementsPage;

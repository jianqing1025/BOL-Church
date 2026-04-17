

import React, { useState, useMemo } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { PlayIcon } from './icons/Icons';
import { useAdmin } from '../hooks/useAdmin';
import { Language } from '../types';
import type { Sermon } from '../data';

interface SermonCardProps {
  title: string;
  speaker: string;
  imageSrc: string;
}

const SermonCard: React.FC<SermonCardProps> = ({ title, speaker, imageSrc }) => (
    <div className="group relative rounded-lg overflow-hidden cursor-pointer shadow-lg">
        <div className="relative aspect-video bg-gray-900">
            <img src={imageSrc} alt={title} className="absolute inset-0 h-full w-full object-cover transform group-hover:scale-105 transition-transform duration-300"/>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <PlayIcon />
            </div>
            <div className="absolute bottom-0 left-0 p-4 text-white">
                <h3 className="font-bold text-base leading-snug">{title}</h3>
                <p className="text-sm text-gray-200">{speaker}</p>
            </div>
        </div>
    </div>
);

const getYouTubeThumbnail = (youtubeId: string) => `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;

const filterEntries = (entries: Sermon[], searchTerm: string) => {
  if (!searchTerm) {
    return entries;
  }

  const lowercasedFilter = searchTerm.toLowerCase();
  return entries.filter(sermon => {
    return (
      sermon.title.en.toLowerCase().includes(lowercasedFilter) ||
      sermon.title.zh.toLowerCase().includes(lowercasedFilter) ||
      sermon.speaker.en.toLowerCase().includes(lowercasedFilter) ||
      sermon.speaker.zh.toLowerCase().includes(lowercasedFilter)
    );
  });
};

const VideoSection: React.FC<{
  title: string;
  entries: Sermon[];
  language: Language;
  emptyText: string;
  ctaHref: string;
  ctaText: string;
  entryHref: (sermon: Sermon) => string;
  headerExtra?: React.ReactNode;
}> = ({ title, entries, language, emptyText, ctaHref, ctaText, entryHref, headerExtra }) => (
  <div className="rounded-[2rem] bg-white px-4 py-10 shadow-sm ring-1 ring-gray-200 sm:px-8">
    <h3 className="mb-12 text-center text-3xl font-bold text-gray-800 md:text-4xl">{title}</h3>
    {headerExtra}
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
      {entries.length > 0 ? (
        entries.map((sermon) => (
          <a href={entryHref(sermon)} key={sermon.id}>
            <SermonCard
              imageSrc={sermon.imageUrl || getYouTubeThumbnail(sermon.youtubeId)}
              title={language === Language.EN ? sermon.title.en : sermon.title.zh}
              speaker={language === Language.EN ? sermon.speaker.en : sermon.speaker.zh}
            />
          </a>
        ))
      ) : (
        <p className="text-gray-500 text-center col-span-4">{emptyText}</p>
      )}
    </div>
    <div className="text-center mt-12">
      <a href={ctaHref} className="bg-gray-800 text-white px-8 py-3 rounded-full hover:bg-gray-900 transition-all font-semibold">
        {ctaText}
      </a>
    </div>
  </div>
);

const Sermons: React.FC = () => {
  const { t, language } = useLocalization();
  const { sermons, dailyManna } = useAdmin();
  const [searchTerm, setSearchTerm] = useState('');
  
  const recentSermons = useMemo(() => {
    return [...filterEntries(sermons, searchTerm)]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
  }, [sermons, searchTerm]);

  const recentDailyManna = useMemo(() => {
    return [...filterEntries(dailyManna, searchTerm)]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
  }, [dailyManna, searchTerm]);

  return (
    <section id="sermons" className="py-20 bg-gray-50">
      <div className="container mx-auto px-6">
        <div className="space-y-10">
          <VideoSection
            title={t('sermons.title')}
            entries={recentSermons}
            language={language}
            emptyText={t('sermonArchive.noResults')}
            ctaHref="#/sermons/sunday-worship"
            ctaText={t('sermons.button')}
            entryHref={(sermon) => `#/sermons/sunday-worship?video=${encodeURIComponent(sermon.id)}`}
            headerExtra={
              <div className="mb-10 max-w-lg mx-auto">
                <input
                  type="text"
                  placeholder={t('sermonArchive.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow"
                  aria-label="Search recent sermons"
                />
              </div>
            }
          />
          <VideoSection
            title={t('sermonsPage.navDailyManna')}
            entries={recentDailyManna}
            language={language}
            emptyText={t('sermonArchive.noResults')}
            ctaHref="#/sermons/daily-manna"
            ctaText={t('sermons.mannaButton')}
            entryHref={(sermon) => `#/sermons/daily-manna?video=${encodeURIComponent(sermon.id)}`}
          />
        </div>
      </div>
    </section>
  );
};

export default Sermons;

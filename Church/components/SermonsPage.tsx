
import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { SermonSubPage, Language } from '../types';
import Editable from './Editable';
import { useAdmin } from '../hooks/useAdmin';
import type { Sermon } from '../data';

const formatEntryDate = (date: string, language: Language) => {
  const [year, month = 1, day = 1] = date.split('-').map(Number);
  const safeDate = new Date(year, month - 1, day);

  return {
    monthDay: safeDate.toLocaleDateString(language === Language.EN ? 'en-US' : 'zh-TW', {
      month: 'short',
      day: 'numeric',
    }),
    year: String(year),
    full: safeDate.toLocaleDateString(language === Language.EN ? 'en-US' : 'zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };
};

const getLocalizedText = (value: { en: string; zh: string }, language: Language) => {
  return language === Language.EN ? (value.en || value.zh) : (value.zh || value.en);
};

const getYouTubeThumbnail = (youtubeId: string, quality: 'max' | 'high' = 'max') => {
  const thumbnailQuality = quality === 'max' ? 'maxresdefault' : 'hqdefault';
  return `https://img.youtube.com/vi/${youtubeId}/${thumbnailQuality}.jpg`;
};

const VideoThumbnail: React.FC<{ youtubeId: string; title: string }> = ({ youtubeId, title }) => {
  const [src, setSrc] = useState(getYouTubeThumbnail(youtubeId));

  useEffect(() => {
    setSrc(getYouTubeThumbnail(youtubeId));
  }, [youtubeId]);

  return (
    <img
      src={src}
      alt={title}
      onError={() => setSrc(getYouTubeThumbnail(youtubeId, 'high'))}
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      loading="lazy"
    />
  );
};

const SermonVideoCollection: React.FC<{ entryType: Sermon['type'] }> = ({ entryType }) => {
  const { t, language } = useLocalization();
  const { sermons, dailyManna } = useAdmin();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sourceEntries = entryType === 'daily-manna' ? dailyManna : sermons;

  const entries = useMemo(() => {
    return [...sourceEntries]
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [sourceEntries]);

  const selectedEntry = useMemo(() => {
    return entries.find(entry => entry.id === selectedId) ?? entries[0] ?? null;
  }, [entries, selectedId]);

  useEffect(() => {
    if (!selectedEntry) {
      setSelectedId(null);
      return;
    }

    if (selectedId !== selectedEntry.id) {
      setSelectedId(selectedEntry.id);
    }
  }, [selectedEntry, selectedId]);

  if (!selectedEntry) {
    return (
      <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
        <p className="text-gray-500">{t('sermonArchive.noResults')}</p>
      </div>
    );
  }

  const selectedTitle = getLocalizedText(selectedEntry.title, language);
  const selectedSpeaker = getLocalizedText(selectedEntry.speaker, language);
  const selectedPassage = getLocalizedText(selectedEntry.passage, language);
  const selectedDate = formatEntryDate(selectedEntry.date, language);
  const isManna = entryType === 'daily-manna';

  return (
    <div className="space-y-16">
      <section className="rounded-[2rem] bg-gray-50 px-4 py-10 text-center shadow-inner sm:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-6xl">
          <div className="overflow-hidden rounded-3xl bg-black shadow-2xl ring-1 ring-black/10">
            <div className="relative aspect-video">
              <iframe
                key={selectedEntry.id}
                src={`https://www.youtube.com/embed/${selectedEntry.youtubeId}?rel=0`}
                title={selectedTitle}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              ></iframe>
            </div>
          </div>
          <div className="mx-auto mt-6 max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-blue-600">{selectedDate.full}</p>
            <h2 className="mt-3 text-3xl font-extrabold text-gray-950 sm:text-4xl">{selectedTitle}</h2>
            {!isManna && (
              <p className="mt-3 text-gray-600">
                {selectedSpeaker && <span>{t('sermonDetail.speaker')}: {selectedSpeaker}</span>}
                {selectedSpeaker && selectedPassage && <span className="mx-2 text-gray-300">&bull;</span>}
                {selectedPassage && <span>{t('sermonDetail.passage')}: {selectedPassage}</span>}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] bg-white px-4 py-10 shadow-sm ring-1 ring-gray-200 sm:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-sm">
          {entries.map((entry) => {
            const date = formatEntryDate(entry.date, language);
            const title = getLocalizedText(entry.title, language);
            const speaker = getLocalizedText(entry.speaker, language);
            const passage = getLocalizedText(entry.passage, language);
            const isSelected = entry.id === selectedEntry.id;

            return (
              <article
                key={entry.id}
                className={`group flex flex-col gap-5 border-b border-gray-200 p-4 transition-colors last:border-b-0 md:flex-row md:items-center md:gap-7 md:p-6 ${
                  isSelected ? 'bg-teal-50/80' : 'bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex flex-col gap-5 md:flex-1 md:flex-row md:items-center md:gap-7">
                  <div className="relative h-36 w-full shrink-0 overflow-hidden rounded-none bg-gray-100 shadow-sm md:h-32 md:w-52">
                    <VideoThumbnail youtubeId={entry.youtubeId} title={title} />
                    {isSelected && (
                      <div className="absolute inset-0 bg-teal-900/15 ring-4 ring-inset ring-teal-500/70"></div>
                    )}
                  </div>
                  <div className="min-w-0 text-left">
                    <h4 className="text-2xl font-extrabold leading-tight text-gray-950">{title}</h4>
                    <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-gray-700">
                      <span>{date.full}</span>
                      {!isManna && speaker && <span>{t('sermonDetail.speaker')}: <span className="text-teal-700">{speaker}</span></span>}
                      {!isManna && passage && <span>{t('sermonDetail.passage')}: <span className="text-teal-700">{passage}</span></span>}
                      {!isManna && getLocalizedText(entry.series, language) && (
                        <span>{t('sermonDetail.series')}: <span className="text-teal-700">{getLocalizedText(entry.series, language)}</span></span>
                      )}
                      {isManna && <span className="text-teal-700">{date.monthDay}, {date.year}</span>}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(entry.id)}
                  className={`shrink-0 rounded-full border px-7 py-3 text-sm font-extrabold transition-all md:ml-auto ${
                    isSelected
                      ? 'border-teal-700 bg-teal-700 text-white shadow-md shadow-teal-900/15'
                      : 'border-teal-700 bg-white text-teal-700 shadow-sm hover:bg-teal-700 hover:text-white'
                  }`}
                  aria-pressed={isSelected}
                >
                  {t('sermonArchive.watch')}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};

const RecentSermonsContent: React.FC = () => {
  const { t, language } = useLocalization();
  const { sermons: allSermons } = useAdmin();
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredSermons = useMemo(() => {
    let sermons = allSermons.filter(s => s.type !== 'daily-manna');

    if (searchTerm) {
      const lowercasedFilter = searchTerm.toLowerCase();
      sermons = sermons.filter(sermon => {
        const title = language === Language.EN ? sermon.title.en : sermon.title.zh;
        const speaker = language === Language.EN ? sermon.speaker.en : sermon.speaker.zh;
        return (
          title.toLowerCase().includes(lowercasedFilter) ||
          speaker.toLowerCase().includes(lowercasedFilter) ||
          sermon.date.includes(lowercasedFilter)
        );
      });
    }

    if (startDate) {
        sermons = sermons.filter(sermon => sermon.date >= startDate);
    }
    if (endDate) {
        sermons = sermons.filter(sermon => sermon.date <= endDate);
    }

    return sermons;
  }, [allSermons, searchTerm, startDate, endDate, language]);

  return (
    <>
      <div className="mb-12 max-w-4xl mx-auto bg-gray-50 p-6 rounded-lg shadow-inner">
          <div className="flex justify-center mb-4">
              <input
                type="text"
                placeholder={t('sermonArchive.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full max-w-lg p-3 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow"
                aria-label="Search messages"
              />
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-gray-700">
            <span>Filter by date:</span>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow"
              aria-label="Start date"
            />
            <span>to</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow"
              aria-label="End date"
            />
          </div>
        </div>
        <div className="max-w-4xl mx-auto text-left">
          {filteredSermons.length > 0 ? (
            <ul className="space-y-4">
              {filteredSermons.map((sermon) => (
                <li key={sermon.id} className="p-6 bg-gray-50 rounded-lg shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row justify-between items-start sm:items-center">
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">{language === Language.EN ? sermon.title.en : sermon.title.zh}</h3>
                    <p className="text-gray-600 mt-1">{language === Language.EN ? (sermon.speaker?.en || '') : (sermon.speaker?.zh || '')} &bull; {sermon.date}</p>
                  </div>
                  <div className="mt-4 sm:mt-0">
                    <a href={`#/sermons/${sermon.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-800 bg-blue-100 px-4 py-2 rounded-full transition-colors">
                      {t('sermonArchive.watch')}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 mt-8 text-center">{t('sermonArchive.noResults')}</p>
          )}
        </div>
    </>
  );
}


interface SermonsPageProps {
  activeSubPage: SermonSubPage;
}

const SermonsPage: React.FC<SermonsPageProps> = ({ activeSubPage: initialSubPage }) => {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<SermonSubPage>(initialSubPage);

  useEffect(() => {
     const handleHashChange = () => {
        const hash = window.location.hash;
        const subPage = (hash.split('/')[2] || 'sunday-worship') as SermonSubPage;
        setActiveTab(subPage);
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  
  const navItems: { key: SermonSubPage; textKey: string }[] = [
    { key: 'sunday-worship', textKey: 'sermonsPage.navSundayWorship' },
    { key: 'daily-manna', textKey: 'sermonsPage.navDailyManna' },
    { key: 'recent-sermons', textKey: 'sermonsPage.navRecentSermons' },
    { key: 'live-stream', textKey: 'sermonsPage.navLiveStream' },
  ];

  const headerContent: Record<SermonSubPage, { titleKey: string; subtitleKey: string }> = {
    'daily-manna': { titleKey: 'sermonsPage.navDailyManna', subtitleKey: 'sermonsPage.dailyMannaSubtitle' },
    'sunday-worship': { titleKey: 'sermonsPage.navSundayWorship', subtitleKey: 'sermonsPage.sundayWorshipContent' },
    'recent-sermons': { titleKey: 'sermonArchive.title', subtitleKey: 'sermonsPage.pageSubtitle' },
    'live-stream': { titleKey: 'sermonsPage.navLiveStream', subtitleKey: 'sermonsPage.liveStreamContent' },
  };

  const currentHeader = headerContent[activeTab];

  return (
    <div>
      <PageHeader
        title={t(currentHeader.titleKey)}
        subtitle={t(currentHeader.subtitleKey)}
      />
      
      <div className="sticky top-[88px] bg-gray-800 text-white z-40 shadow-md">
        <nav className="container mx-auto px-6">
          <ul className="flex justify-center items-center -mb-px space-x-4 sm:space-x-8 overflow-x-auto">
            {navItems.map((item) => (
              <li key={item.key}>
                <a
                  href={`#/sermons/${item.key}`}
                  className={`whitespace-nowrap inline-block text-sm sm:text-base font-semibold py-4 border-b-2 transition-colors duration-300 ${
                    activeTab === item.key
                      ? 'border-white text-white'
                      : 'border-transparent text-gray-400 hover:text-white hover:border-gray-300'
                  }`}
                >
                  {t(item.textKey)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      
      <div className="container mx-auto max-w-7xl px-6 py-16">
        {activeTab === 'daily-manna' ? (
            <SermonVideoCollection entryType="daily-manna" />
        ) : activeTab === 'sunday-worship' ? (
            <SermonVideoCollection entryType="sermon" />
        ) : activeTab === 'recent-sermons' ? (
          <RecentSermonsContent />
        ) : activeTab === 'live-stream' ? (
          <div className="prose prose-lg max-w-none">
             <Editable
                as="h2"
                contentKey="sermonsPage.liveStreamTitle"
                className="text-3xl font-extrabold text-gray-900 mb-6"
              />
              <Editable
                as="div"
                contentKey="sermonsPage.liveStreamContent"
                isTextarea={true}
              />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default SermonsPage;

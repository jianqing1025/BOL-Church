
import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { SermonSubPage, Language } from '../types';
import Editable from './Editable';
import { useAdmin } from '../hooks/useAdmin';

const DailyMannaContent: React.FC = () => {
    const { t, language } = useLocalization();
    const { sermons } = useAdmin();
    
    const mannaList = useMemo(() => {
        return sermons.filter(s => s.type === 'daily-manna').sort((a, b) => b.date.localeCompare(a.date));
    }, [sermons]);

    return (
        <div className="space-y-12">
            {mannaList.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {mannaList.map((item) => (
                        <div key={item.id} className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100 transform transition-all hover:shadow-xl">
                            <div className="relative" style={{ paddingTop: '56.25%' }}>
                                <iframe
                                    src={`https://www.youtube.com/embed/${item.youtubeId}`}
                                    title={item.title.zh || item.title.en}
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    className="absolute top-0 left-0 w-full h-full"
                                ></iframe>
                            </div>
                            <div className="p-6">
                                <div className="text-sm font-bold text-blue-600 mb-1">{item.date}</div>
                                <h3 className="text-xl font-bold text-gray-900">{language === Language.EN ? (item.title.en || item.title.zh) : (item.title.zh || item.title.en)}</h3>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                    <p className="text-gray-500">{t('sermonArchive.noResults')}</p>
                </div>
            )}
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
      
      <div className="container mx-auto max-w-4xl px-6 py-16">
        {activeTab === 'daily-manna' ? (
            <DailyMannaContent />
        ) : activeTab === 'recent-sermons' ? (
          <RecentSermonsContent />
        ) : activeTab === 'sunday-worship' || activeTab === 'live-stream' ? (
          <div className="prose prose-lg max-w-none">
             <Editable
                as="h2"
                contentKey={activeTab === 'sunday-worship' ? 'sermonsPage.sundayWorshipTitle' : 'sermonsPage.liveStreamTitle'}
                className="text-3xl font-extrabold text-gray-900 mb-6"
              />
              <Editable
                as="div"
                contentKey={activeTab === 'sunday-worship' ? 'sermonsPage.sundayWorshipContent' : 'sermonsPage.liveStreamContent'}
                isTextarea={true}
              />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default SermonsPage;

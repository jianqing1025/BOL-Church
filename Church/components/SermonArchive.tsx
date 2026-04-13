
import React, { useState, useMemo } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { Language } from '../types';
import { useAdmin } from '../hooks/useAdmin';

const SermonArchive: React.FC = () => {
  const { t, language } = useLocalization();
  const { sermons: allSermons } = useAdmin();
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredSermons = useMemo(() => {
    let sermons = allSermons;

    // Filter by search term
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

    // Filter by date range
    if (startDate) {
        sermons = sermons.filter(sermon => sermon.date >= startDate);
    }
    if (endDate) {
        sermons = sermons.filter(sermon => sermon.date <= endDate);
    }

    return sermons;
  }, [allSermons, searchTerm, startDate, endDate, language]);

  return (
    <section id="sermon-archive" className="py-20 bg-white">
      <div className="container mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-8 text-gray-800">{t('sermonArchive.title')}</h2>
        <div className="mb-12 max-w-4xl mx-auto">
          <div className="flex justify-center mb-4">
              <input
                type="text"
                placeholder={t('sermonArchive.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full max-w-lg p-3 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow"
                aria-label="Search sermons"
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
                    <p className="text-gray-600 mt-1">{language === Language.EN ? sermon.speaker.en : sermon.speaker.zh} &bull; {sermon.date}</p>
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
      </div>
    </section>
  );
};

export default SermonArchive;
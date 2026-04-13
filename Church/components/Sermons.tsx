

import React, { useState, useMemo } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { PlayIcon } from './icons/Icons';
import { useAdmin } from '../hooks/useAdmin';
import { Language } from '../types';

interface SermonCardProps {
  title: string;
  speaker: string;
  imageSrc: string;
}

const SermonCard: React.FC<SermonCardProps> = ({ title, speaker, imageSrc }) => (
    <div className="group relative rounded-lg overflow-hidden cursor-pointer shadow-lg">
        <img src={imageSrc} alt={title} className="w-full h-64 object-cover transform group-hover:scale-105 transition-transform duration-300"/>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <PlayIcon />
        </div>
        <div className="absolute bottom-0 left-0 p-6 text-white">
            <h3 className="font-bold text-xl">{title}</h3>
            <p className="text-gray-200">{speaker}</p>
        </div>
    </div>
);

const Sermons: React.FC = () => {
  const { t, language } = useLocalization();
  const { sermons } = useAdmin();
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredSermons = useMemo(() => {
    if (!searchTerm) {
      return sermons;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return sermons.filter(sermon => {
      return (
        sermon.title.en.toLowerCase().includes(lowercasedFilter) ||
        sermon.title.zh.toLowerCase().includes(lowercasedFilter) ||
        sermon.speaker.en.toLowerCase().includes(lowercasedFilter) ||
        sermon.speaker.zh.toLowerCase().includes(lowercasedFilter)
      );
    });
  }, [sermons, searchTerm]);
  
  const recentSermons = filteredSermons.slice(0, 4);

  return (
    <section id="sermons" className="py-20 bg-gray-50">
      <div className="container mx-auto px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-6 text-gray-800">{t('sermons.title')}</h2>
        
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
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {recentSermons.length > 0 ? (
            recentSermons.map((sermon) => (
              <a href={`#/sermons/${sermon.id}`} key={sermon.id}>
                <SermonCard 
                    imageSrc={sermon.imageUrl || `https://picsum.photos/400/500?random=${sermon.id}`}
                    title={language === Language.EN ? sermon.title.en : sermon.title.zh} 
                    speaker={language === Language.EN ? sermon.speaker.en : sermon.speaker.zh}
                />
              </a>
            ))
          ) : (
            <p className="text-gray-500 text-center col-span-4">{t('sermonArchive.noResults')}</p>
          )}
        </div>
        <div className="text-center mt-12">
           <a href="#/sermons/recent-sermons" className="bg-gray-800 text-white px-8 py-3 rounded-full hover:bg-gray-900 transition-all font-semibold">
             {t('sermons.button')}
           </a>
        </div>
      </div>
    </section>
  );
};

export default Sermons;
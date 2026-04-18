
import React from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { useLocalization } from '../hooks/useLocalization';
import { Language } from '../types';
import { FacebookIcon, XIcon } from './icons/Icons';

interface SermonDetailPageProps {
  sermonId: string;
}

const SermonDetailPage: React.FC<SermonDetailPageProps> = ({ sermonId }) => {
  const { sermons, dailyManna, loading } = useAdmin();
  const { t, language } = useLocalization();

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-40 text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-500">Loading sermon details...</p>
      </div>
    );
  }

  const allEntries = [...sermons, ...dailyManna];
  const sermon = allEntries.find(s => s.id === sermonId);
  
  if (!sermon) {
    return (
      <div className="container mx-auto px-6 py-40 text-center">
        <h1 className="text-3xl font-bold text-gray-800">Sermon not found</h1>
        <p className="mt-4 text-gray-600">The sermon you are looking for might have been moved or deleted.</p>
        <a href="/sermons/recent-sermons" className="mt-8 inline-block bg-blue-600 text-white px-8 py-3 rounded-full hover:bg-blue-700 transition-colors">
          Back to Sermon Archive
        </a>
      </div>
    );
  }

  const otherSermonsInSeries = allEntries.filter(
    s => (s.series.en === sermon.series.en) && (s.id !== sermon.id)
  );
  
  const sermonTitle = language === Language.EN ? sermon.title.en : sermon.title.zh;
  const sermonSpeaker = language === Language.EN ? sermon.speaker.en : sermon.speaker.zh;
  const sermonSeries = language === Language.EN ? sermon.series.en : sermon.series.zh;
  const sermonPassage = language === Language.EN ? sermon.passage.en : sermon.passage.zh;
  const sermonDate = new Date(sermon.date).toLocaleDateString(language === Language.EN ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="bg-white">
      <div className="w-full bg-black">
        <div className="relative" style={{ paddingTop: '56.25%' }}>
          <iframe
            src={`https://www.youtube.com/embed/${sermon.youtubeId}?autoplay=1`}
            title={sermonTitle}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute top-0 left-0 w-full h-full"
          ></iframe>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
        <p className="text-sm font-semibold uppercase tracking-wider text-gray-500">{sermonDate.toUpperCase()}</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-2">{sermonTitle}</h1>
        
        <div className="mt-4 text-gray-600 text-sm sm:text-base grid grid-cols-1 sm:flex sm:items-center gap-2 sm:gap-0">
          <span>{t('sermonDetail.speaker')}: </span>
          <span className="font-semibold text-gray-800">{sermonSpeaker}</span>
          <span className="hidden sm:inline mx-2 text-gray-300">|</span>
          <span>{t('sermonDetail.series')}: </span>
          <span className="font-semibold text-gray-800">{sermonSeries}</span>
          <span className="hidden sm:inline mx-2 text-gray-300">|</span>
          <span>{t('sermonDetail.passage')}: </span>
          <span className="font-semibold text-gray-800">{sermonPassage}</span>
        </div>

        <hr className="my-8" />

        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <button className="w-full sm:w-auto text-center border border-gray-300 text-gray-700 font-bold py-2 px-6 rounded-md hover:bg-gray-50 transition-colors">
            {t('sermonDetail.discussionGuide')}
          </button>
          <div className="flex-grow"></div>
          <div className="flex gap-2 w-full sm:w-auto">
            <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none flex items-center justify-center gap-2 border border-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-md hover:bg-gray-50 transition-colors text-sm">
              <FacebookIcon />
              {t('sermonDetail.shareFacebook')}
            </a>
            <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(sermonTitle)}`} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none flex items-center justify-center gap-2 border border-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-md hover:bg-gray-50 transition-colors text-sm">
              <XIcon />
               {t('sermonDetail.shareX')}
            </a>
          </div>
        </div>

        {otherSermonsInSeries.length > 0 && (
          <div className="my-16">
            <h2 className="text-sm font-bold text-center text-gray-500 uppercase tracking-widest mb-8">
              {t('sermonDetail.otherSermons')}
            </h2>
            <div className="space-y-1">
              {otherSermonsInSeries.map(otherSermon => {
                const otherDate = new Date(otherSermon.date);
                return (
                   <a href={`/sermons/${otherSermon.id}`} key={otherSermon.id} className="block border-b border-gray-200 py-6 last:border-b-0 group">
                      <div className="flex items-center gap-4 sm:gap-6">
                          <div className="text-center w-20 flex-shrink-0">
                              <p className="text-lg font-bold text-gray-800">{otherDate.toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric' })}</p>
                              <p className="text-sm text-gray-500">{otherDate.getFullYear()}</p>
                          </div>
                          <div className="flex-grow">
                              <h3 className="text-xl font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                                {language === Language.EN ? otherSermon.title.en : otherSermon.title.zh}
                              </h3>
                              <p className="text-sm text-gray-600">
                                  <span>{t('sermonDetail.speaker')}: {language === Language.EN ? otherSermon.speaker.en : otherSermon.speaker.zh}</span>
                                  <span className="mx-2 text-gray-300">&bull;</span>
                                  <span>{t('sermonDetail.passage')}: {language === Language.EN ? otherSermon.passage.en : otherSermon.passage.zh}</span>
                              </p>
                          </div>
                          <div className="flex-shrink-0 ml-auto hidden sm:block">
                              <span className="border border-gray-300 text-gray-700 font-bold py-2 px-6 rounded-full group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all">
                                  {t('sermonArchive.watch')}
                              </span>
                          </div>
                      </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SermonDetailPage;

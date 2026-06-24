
import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { SermonSubPage, Language } from '../types';
import SermonsSecondaryNav from './SermonsSecondaryNav';
import { useAdmin } from '../hooks/useAdmin';
import type { Sermon, SermonCategory } from '../data';
import { buildPaginationNumbers } from '../utils/pagination';

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

// 直接用 hqdefault.jpg（480×360）：YouTube 對每個視頻都保證生成此版本
// maxresdefault 不可靠 —— YouTube 在沒有高清版時返回 120×90 灰色佔位圖（HTTP 200），
// onError 不會觸發，導致一堆視頻顯示破圖。所以乾脆不用 maxres。
const getYouTubeThumbnail = (youtubeId: string, quality: 'high' | 'mq' = 'high') => {
  const variant = quality === 'high' ? 'hqdefault' : 'mqdefault';
  return `https://img.youtube.com/vi/${youtubeId}/${variant}.jpg`;
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
      onError={() => setSrc(getYouTubeThumbnail(youtubeId, 'mq'))}
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      loading="lazy"
    />
  );
};

const VIDEO_GRID_PAGE_SIZE = 40;

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatViewCount(count?: number | null): string {
  if (count == null || count < 0) return '';
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

const SermonVideoCollection: React.FC<{ entryType: Sermon['type']; category?: SermonCategory }> = ({ entryType, category }) => {
  const { t, language } = useLocalization();
  const { sermons, dailyManna } = useAdmin();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shouldAutoplay, setShouldAutoplay] = useState(false);
  const [page, setPage] = useState(1);
  // 公開頁 filter: year + 自由文字搜尋（title / speaker / date）
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const playerSectionRef = React.useRef<HTMLElement>(null);
  const gridSectionRef = React.useRef<HTMLElement>(null);
  const sourceEntries = entryType === 'daily-manna' ? dailyManna : sermons;

  // 此 tab 下所有可見條目（用於播放器選擇 + 連續播放隊列 + 年份列表計算）
  const entries = useMemo(() => {
    return [...sourceEntries]
      .filter(e => !e.hidden)
      .filter(e => entryType === 'daily-manna' || !category || (e.category ?? 'sunday-worship') === category)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [sourceEntries, entryType, category]);

  // 切換 tab / category 時清掉 filter（避免「上個 tab 的 2024」殘留到下個 tab）
  useEffect(() => {
    setYearFilter('all');
    setSearchTerm('');
  }, [entryType, category]);

  // 從 entries 推導可選年份（倒序）
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    for (const item of entries) {
      const y = (item.date || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) set.add(y);
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [entries]);

  // 套用 filter 後的條目（用於下方 grid）
  const filteredEntries = useMemo(() => {
    let list = entries;
    if (yearFilter !== 'all') {
      list = list.filter(e => (e.date || '').slice(0, 4) === yearFilter);
    }
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      list = list.filter(e => {
        const titleEn = (e.title?.en || '').toLowerCase();
        const titleZh = (e.title?.zh || '').toLowerCase();
        const speakerEn = (e.speaker?.en || '').toLowerCase();
        const speakerZh = (e.speaker?.zh || '').toLowerCase();
        const date = (e.date || '').toLowerCase();
        return titleEn.includes(term) || titleZh.includes(term)
          || speakerEn.includes(term) || speakerZh.includes(term)
          || date.includes(term);
      });
    }
    return list;
  }, [entries, yearFilter, searchTerm]);

  // 切 tab、改 filter 或減少 entries 數時 reset 到第 1 頁
  useEffect(() => {
    setPage(1);
  }, [entryType, category, yearFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / VIDEO_GRID_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageEntries = useMemo(() => {
    const start = (safePage - 1) * VIDEO_GRID_PAGE_SIZE;
    return filteredEntries.slice(start, start + VIDEO_GRID_PAGE_SIZE);
  }, [filteredEntries, safePage]);

  const gotoPage = (next: number) => {
    const clamped = Math.max(1, Math.min(next, totalPages));
    setPage(clamped);
    window.setTimeout(() => {
      gridSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  // 分頁：前 5、中間 3、後 5，當前頁 ±1，自動補省略符
  const paginationNumbers = useMemo<(number | 'gap')[]>(
    () => buildPaginationNumbers(totalPages, safePage),
    [totalPages, safePage]
  );

  useEffect(() => {
    const videoId = new URLSearchParams(window.location.search).get('video');
    if (videoId) {
      setSelectedId(videoId);
    }
  }, [entryType]);

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
  // 只有主日信息（sunday-worship）顯示講員；其它分類（敬拜讚美 / 醫治禱告 / 見證 / 歷史直播 / 每日天言）不顯示
  const showSpeaker = entryType === 'sermon' && category === 'sunday-worship';

  // 構造連續播放：當前 videoId 之後接最多 PLAYLIST_QUEUE_LIMIT 條後續視頻
  // （YouTube embed URL 的 playlist 參數太長會被瀏覽器/YouTube 拒絕，例如 daily-manna 1400+ 條就會炸）
  //
  // 注意：playlist 參數的第一條 ID 必須是當前 selectedEntry.youtubeId！
  // YouTube embed 在 autoplay=1 + playlist=... 的組合下，常常跳過 URL 路徑裡的影片、
  // 直接從 playlist[0] 開始播。把當前影片放在 playlist[0]，無論 YouTube 走哪條路徑，
  // 用戶點的影片都會是第一支被播放的。
  const PLAYLIST_QUEUE_LIMIT = 30;
  const currentIndex = entries.findIndex(e => e.id === selectedEntry.id);
  const followingIds = currentIndex >= 0
    ? entries.slice(currentIndex + 1, currentIndex + 1 + PLAYLIST_QUEUE_LIMIT).map(e => e.youtubeId).filter(Boolean)
    : [];
  const playlistIds = selectedEntry.youtubeId ? [selectedEntry.youtubeId, ...followingIds] : followingIds;
  const playlistParam = playlistIds.length > 0 ? `&playlist=${playlistIds.join(',')}` : '';
  const autoplayParam = shouldAutoplay ? '&autoplay=1' : '';
  const embedSrc = `https://www.youtube.com/embed/${selectedEntry.youtubeId}?rel=0${playlistParam}${autoplayParam}`;

  const handleCardClick = (entryId: string) => {
    setSelectedId(entryId);
    setShouldAutoplay(true);
    const page = entryType === 'daily-manna' ? 'daily-manna' : (category ?? 'sunday-worship');
    window.history.replaceState(null, '', `/sermons/${page}?video=${encodeURIComponent(entryId)}`);
    // 滚回上方播放器
    window.setTimeout(() => {
      playerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  return (
    <div className="space-y-12">
      <section ref={playerSectionRef} className="rounded-[2rem] bg-gray-50 px-4 py-10 text-center shadow-inner sm:px-8 lg:px-10 scroll-mt-32">
        <div className="mx-auto w-full max-w-6xl">
          <div className="overflow-hidden rounded-3xl bg-black shadow-2xl ring-1 ring-black/10">
            <div className="relative aspect-video">
              <iframe
                key={selectedEntry.id + (shouldAutoplay ? '-play' : '-idle')}
                src={embedSrc}
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
            {showSpeaker && (selectedSpeaker || selectedPassage) && (
              <p className="mt-3 text-gray-600">
                {selectedSpeaker && <span>{t('sermonDetail.speaker')}: {selectedSpeaker}</span>}
                {selectedSpeaker && selectedPassage && <span className="mx-2 text-gray-300">&bull;</span>}
                {selectedPassage && <span>{t('sermonDetail.passage')}: {selectedPassage}</span>}
              </p>
            )}
          </div>
        </div>
      </section>

      <section ref={gridSectionRef} className="px-4 sm:px-6 lg:px-8 scroll-mt-32">
        <div className="mx-auto w-full max-w-6xl">
          {/* 年份篩選 + 自由文字搜尋 */}
          {availableYears.length > 0 && (
            <div className="mb-4 space-y-3 rounded-2xl bg-gray-50 px-4 py-4 shadow-inner sm:px-6">
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setYearFilter('all')}
                  className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
                    yearFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-blue-50'
                  }`}
                >
                  {t('sermonArchive.filterAllYears')}
                </button>
                {availableYears.map(y => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setYearFilter(y)}
                    className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
                      yearFilter === y
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-blue-50'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
              <div className="flex justify-center">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('sermonArchive.searchPlaceholder')}
                  className="w-full max-w-md rounded-full border border-gray-300 bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  aria-label={t('sermonArchive.searchPlaceholder')}
                />
              </div>
            </div>
          )}

          <div className="mb-4 flex items-center justify-between text-sm text-gray-600">
            <span>{t('sermonArchive.pageInfo').replace('{page}', String(safePage)).replace('{total}', String(totalPages)).replace('{count}', String(filteredEntries.length))}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {pageEntries.map((entry) => {
              const date = formatEntryDate(entry.date, language);
              const title = getLocalizedText(entry.title, language);
              const speaker = getLocalizedText(entry.speaker, language);
              const isSelected = entry.id === selectedEntry.id;
              const duration = formatDuration(entry.durationSeconds ?? null);
              const views = formatViewCount(entry.viewCount ?? null);

              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => handleCardClick(entry.id)}
                  aria-pressed={isSelected}
                  className={`group flex flex-col text-left rounded-xl overflow-hidden bg-white transition-all ${
                    isSelected
                      ? 'ring-2 ring-teal-600 shadow-lg'
                      : 'ring-1 ring-gray-200 hover:ring-teal-500 hover:shadow-md'
                  }`}
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
                    <VideoThumbnail youtubeId={entry.youtubeId} title={title} />
                    {duration && (
                      <span className="absolute bottom-1.5 right-1.5 z-10 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white tabular-nums">
                        {duration}
                      </span>
                    )}
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-teal-900/30">
                        <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-teal-700">
                          ▶ {t('sermonArchive.watch')}
                        </span>
                      </div>
                    )}
                    {!isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
                        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-gray-900">
                          ▶ {t('sermonArchive.watch')}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <h4 className="line-clamp-2 text-sm font-bold leading-tight text-gray-900 sm:text-base">{title}</h4>
                    <p className="flex items-center justify-between text-xs text-gray-500">
                      <span>{date.full}</span>
                      {views && <span className="text-gray-400 whitespace-nowrap">{views} {t('admin.viewsLabel')}</span>}
                    </p>
                    {showSpeaker && speaker && (
                      <p className="text-xs font-medium text-teal-700">{speaker}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {totalPages > 1 && (
            <nav className="mt-8 flex flex-wrap items-center justify-center gap-1.5" aria-label="pagination">
              <button
                type="button"
                onClick={() => gotoPage(safePage - 1)}
                disabled={safePage <= 1}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ‹ {t('sermonArchive.prev')}
              </button>
              {paginationNumbers.map((n, idx) => n === 'gap' ? (
                <span key={`gap-${idx}`} className="px-2 text-gray-400">…</span>
              ) : (
                <button
                  key={n}
                  type="button"
                  onClick={() => gotoPage(n)}
                  aria-current={n === safePage ? 'page' : undefined}
                  className={`min-w-[2.25rem] rounded-md px-2 py-1.5 text-sm font-semibold ${
                    n === safePage
                      ? 'bg-teal-600 text-white'
                      : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => gotoPage(safePage + 1)}
                disabled={safePage >= totalPages}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('sermonArchive.next')} ›
              </button>
            </nav>
          )}
        </div>
      </section>
    </div>
  );
};

interface SermonsPageProps {
  activeSubPage: SermonSubPage;
}

const SermonsPage: React.FC<SermonsPageProps> = ({ activeSubPage: initialSubPage }) => {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<SermonSubPage>(initialSubPage);

  useEffect(() => {
    setActiveTab(initialSubPage);
  }, [initialSubPage]);

  const headerContent: Record<SermonSubPage, { titleKey: string; subtitleKey: string }> = {
    'daily-manna': { titleKey: 'sermonsPage.navDailyManna', subtitleKey: 'sermonsPage.dailyMannaSubtitle' },
    'sunday-worship': { titleKey: 'sermonsPage.navSundayWorship', subtitleKey: 'sermonsPage.sundayWorshipContent' },
    'worship-praise': { titleKey: 'sermonsPage.navWorshipPraise', subtitleKey: 'sermonsPage.worshipPraiseContent' },
    'healing-prayer': { titleKey: 'sermonsPage.navHealingPrayer', subtitleKey: 'sermonsPage.healingPrayerContent' },
    'testimony': { titleKey: 'sermonsPage.navTestimony', subtitleKey: 'sermonsPage.testimonyContent' },
  };

  const currentHeader = headerContent[activeTab];

  return (
    <div>
      <PageHeader
        title={t(currentHeader.titleKey)}
        subtitle={t(currentHeader.subtitleKey)}
      />

      <SermonsSecondaryNav active={activeTab} />

      <div className="container mx-auto max-w-7xl px-6 py-16">
        {activeTab === 'daily-manna' ? (
            <SermonVideoCollection entryType="daily-manna" />
        ) : activeTab === 'sunday-worship' ? (
            <SermonVideoCollection entryType="sermon" category="sunday-worship" />
        ) : (
            <SermonVideoCollection entryType="sermon" category={activeTab} />
        )}
      </div>
    </div>
  );
};

export default SermonsPage;

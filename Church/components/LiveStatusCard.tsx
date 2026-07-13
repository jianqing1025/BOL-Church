import React, { useEffect, useMemo, useState } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { Language } from '../types';
import type { LiveStreamPublicState } from '../types';
import type { PageCta } from '../live/liveRoom';

function formatStartedAt(ts: number | null, language: Language): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString(language === Language.ZH ? 'zh-Hant' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function formatNextService(iso: string | null, language: Language): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(language === Language.ZH ? 'zh-Hant' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function useCountdown(targetIso: string | null) {
  const target = useMemo(() => (targetIso ? new Date(targetIso).getTime() : null), [targetIso]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [target]);
  if (!target || target <= now) return null;
  const diff = target - now;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return { days, hours, minutes };
}

interface LiveStatusCardProps {
  state: LiveStreamPublicState;
  cta: PageCta;
  refreshing: boolean;
  refreshMsg: string | null;
  onRefresh: () => void;
  onOpenRoom: () => void;
}

/**
 * 直播頁狀態卡（頁面唯一入口，站內不再嵌直播/回放視頻）：
 *   waiting      → 下次崇拜 + 倒計時 + 置灰「進入直播」
 *   watch-replay → 下次崇拜 + 倒計時 + 藍色「查看回放」
 *   enter-live   → 直播進行中 + 開播時間 + 在線數 + 紅色「進入直播」
 * 右側始終帶刷新按鈕。
 */
const LiveStatusCard: React.FC<LiveStatusCardProps> = ({ state, cta, refreshing, refreshMsg, onRefresh, onOpenRoom }) => {
  const { t, language } = useLocalization();
  const countdown = useCountdown(state.nextServiceIso ?? null);
  const isLiveCta = cta === 'enter-live';

  const primaryButton = cta === 'enter-live' ? (
    <button
      type="button"
      onClick={onOpenRoom}
      className="flex h-10 flex-none items-center rounded-md bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700"
    >
      {t('liveChat.enterRoom')}
    </button>
  ) : cta === 'watch-replay' ? (
    <button
      type="button"
      onClick={onOpenRoom}
      className="flex h-10 flex-none items-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
    >
      {t('liveChat.watchReplay')}
    </button>
  ) : (
    <button
      type="button"
      disabled
      title={t('liveChat.enterRoomOffline')}
      className="flex h-10 flex-none cursor-not-allowed items-center rounded-md bg-gray-300 px-4 text-sm font-bold text-gray-500"
    >
      {t('liveChat.enterRoom')}
    </button>
  );

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-5 ${isLiveCta ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="min-w-0 flex-1">
        {isLiveCta ? (
          <>
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-red-600">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
              {t('liveChat.liveInProgress')}
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900">
              {state.startedAt
                ? `${t('sermonsPage.liveStartedAt')} ${formatStartedAt(state.startedAt, language as Language)}`
                : t('sermonsPage.liveBadge')}
            </div>
            <p className="mt-3 text-sm text-gray-600">{t('liveChat.countLabelSite')}: {state.websiteTotal}</p>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t('sermonsPage.nextServiceLabel')}
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900">
              {formatNextService(state.nextServiceIso, language as Language)}
            </div>
            {countdown && (
              <div className="mt-3 text-sm text-gray-600">
                {countdown.days > 0 && <span className="mr-3">{countdown.days} {t('sermonsPage.countdownDays')}</span>}
                <span className="mr-3">{countdown.hours} {t('sermonsPage.countdownHours')}</span>
                <span>{countdown.minutes} {t('sermonsPage.countdownMinutes')}</span>
              </div>
            )}
            <p className="mt-3 text-xs text-gray-500">
              {cta === 'watch-replay' ? t('liveChat.replayUntil') : t('sermonsPage.liveStreamOfflineNote')}
            </p>
          </>
        )}
        {refreshMsg && <p className="mt-2 text-xs text-amber-600">{refreshMsg}</p>}
      </div>
      <div className="flex flex-none items-center gap-2">
        {primaryButton}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title={`${t('liveChat.refreshButton')} — ${t('liveChat.refreshHint')}`}
          aria-label={t('liveChat.refreshButton')}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-blue-600 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <span className={refreshing ? 'animate-spin' : ''}>↻</span>
        </button>
      </div>
    </div>
  );
};

export default LiveStatusCard;

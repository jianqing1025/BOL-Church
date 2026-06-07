import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useLocalization } from '../hooks/useLocalization';
import { Language } from '../types';
import type { LiveStreamPublicState } from '../types';

const POLL_INTERVAL_MS = 30_000;

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

const LiveStreamSection: React.FC = () => {
  const { t, language } = useLocalization();
  const [state, setState] = useState<LiveStreamPublicState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchState = async () => {
      try {
        const data = await api.liveStreamPublic();
        if (!cancelled) {
          setState(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error('LiveStream fetch failed', err);
          setError('unavailable');
        }
      }
    };
    fetchState();
    const interval = window.setInterval(fetchState, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const countdown = useCountdown(state?.nextServiceIso ?? null);

  if (error && !state) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
        {t('sermonsPage.liveStreamOfflineNote')}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
        ...
      </div>
    );
  }

  if (state.status === 'live' && state.videoId) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
            {t('sermonsPage.liveBadge')}
          </span>
          {state.startedAt && (
            <span className="text-red-600/80 font-normal">
              · {t('sermonsPage.liveStartedAt')} {formatStartedAt(state.startedAt, language)}
            </span>
          )}
        </div>
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black shadow-lg">
          <iframe
            title="Live Stream"
            src={`https://www.youtube.com/embed/${state.videoId}?autoplay=1&mute=1&rel=0`}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  // Offline state
  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
        <div className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t('sermonsPage.nextServiceLabel')}
        </div>
        <div className="mt-2 text-xl font-bold text-gray-900">
          {formatNextService(state.nextServiceIso, language)}
        </div>
        {countdown && (
          <div className="mt-3 text-sm text-gray-600">
            {countdown.days > 0 && <span className="mr-3">{countdown.days} {t('sermonsPage.countdownDays')}</span>}
            <span className="mr-3">{countdown.hours} {t('sermonsPage.countdownHours')}</span>
            <span>{countdown.minutes} {t('sermonsPage.countdownMinutes')}</span>
          </div>
        )}
        <p className="mt-3 text-xs text-gray-500">{t('sermonsPage.liveStreamOfflineNote')}</p>
      </div>

      {state.latestSermon && state.latestSermon.videoId ? (
        <div>
          <div className="mb-3 text-sm font-semibold text-gray-700">
            {t('sermonsPage.watchLatestReplay')}
          </div>
          <div className="mb-2 text-base font-bold text-gray-900">
            {language === Language.ZH ? state.latestSermon.titleZh : state.latestSermon.titleEn}
          </div>
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black shadow-lg">
            <iframe
              title={state.latestSermon.titleEn}
              src={`https://www.youtube.com/embed/${state.latestSermon.videoId}?rel=0`}
              className="h-full w-full"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default LiveStreamSection;

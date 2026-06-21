import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useLocalization } from '../hooks/useLocalization';
import { useAdmin } from '../hooks/useAdmin';
import { Language } from '../types';
import type { LiveStreamPublicState } from '../types';
import LiveJoinModal from './LiveJoinModal';
import LiveViewerList from './LiveViewerList';
import LiveChatPanel from './LiveChatPanel';

const POLL_INTERVAL_MS = 30_000;
const PING_INTERVAL_MS = 20_000;
const IDENTITY_STORAGE_KEY = 'bolccop.liveChatIdentity.v1';

interface StoredIdentity {
  sessionId: string;
  displayName: string;
  asGuest: boolean;
}

function readIdentity(): StoredIdentity | null {
  try {
    const raw = window.localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.sessionId === 'string' && typeof parsed.displayName === 'string') return parsed as StoredIdentity;
    return null;
  } catch { return null; }
}

function writeIdentity(identity: StoredIdentity) {
  try { window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity)); } catch { /* ignore */ }
}

function newSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID();
  } catch { /* ignore */ }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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
  const { currentUser } = useAdmin();
  const [state, setState] = useState<LiveStreamPublicState | null>(null);
  const [identity, setIdentity] = useState<StoredIdentity | null>(() => (typeof window !== 'undefined' ? readIdentity() : null));
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);

  const isLoggedInAdmin = !!currentUser;
  const isLive = state?.status === 'live' && !!state?.videoId;

  // Public state polling
  useEffect(() => {
    let cancelled = false;
    const fetchState = async () => {
      try {
        const data = await api.liveStreamPublic();
        if (!cancelled) setState(data);
      } catch { /* silent */ }
    };
    fetchState();
    const id = window.setInterval(fetchState, POLL_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // Show join modal once we know we're live and there's no identity yet
  useEffect(() => {
    if (!isLive) { setShowJoinModal(false); return; }
    if (isLoggedInAdmin) {
      // Auto-join admins on first live tick
      if (!identity) {
        (async () => {
          const sessionId = newSessionId();
          try {
            const res = await api.liveJoin({ sessionId });
            const next: StoredIdentity = { sessionId, displayName: res.displayName, asGuest: false };
            writeIdentity(next);
            setIdentity(next);
          } catch { /* will retry next tick */ }
        })();
      }
      setShowJoinModal(false);
      return;
    }
    if (!identity) {
      setShowJoinModal(true);
    } else {
      // Re-register with server so we appear in live_viewers for the current video
      (async () => {
        try {
          await api.liveJoin({ sessionId: identity.sessionId, displayName: identity.displayName, asGuest: identity.asGuest });
        } catch { /* ignore */ }
      })();
    }
  }, [isLive, identity, isLoggedInAdmin]);

  // Heartbeat
  useEffect(() => {
    if (!identity || !isLive) return undefined;
    const ping = async () => { try { await api.livePing(identity.sessionId); } catch { /* ignore */ } };
    const id = window.setInterval(ping, PING_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [identity, isLive]);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const data = await api.liveRefresh();
      setState(data);
      if (data.status !== 'live') {
        setRefreshMsg(t('liveChat.refreshNoChange'));
      }
    } catch (err) {
      setRefreshMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  const handleJoin = useCallback(async (params: { name?: string; asGuest?: boolean }) => {
    const sessionId = identity?.sessionId || newSessionId();
    const res = await api.liveJoin({ sessionId, name: params.name, asGuest: params.asGuest });
    const next: StoredIdentity = { sessionId, displayName: res.displayName, asGuest: !!params.asGuest };
    writeIdentity(next);
    setIdentity(next);
    setShowJoinModal(false);
  }, [identity]);

  const countdown = useCountdown(state?.nextServiceIso ?? null);

  if (!state) {
    return <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">...</div>;
  }

  // LIVE state — main layout with chat sidebar
  if (isLive) {
    return (
      <>
        {showJoinModal && (
          <LiveJoinModal
            loggedInName={currentUser?.name}
            onJoin={handleJoin}
          />
        )}
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Left: player —— 取剩下的所有寬度（chat 固定後，player 自動大約 +20%） */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 mb-3">
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

          {/* Right: chat sidebar 1/4 */}
          <aside className="flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm lg:w-[320px] lg:flex-none h-[500px] lg:h-auto lg:self-stretch overflow-hidden">
            {/* Counts bar */}
            <div className="grid grid-cols-2 gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span>👥</span>
                <span className="text-gray-600">{t('liveChat.countLabelSite')}</span>
                <span className="text-gray-900">{state.viewersOnline}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>📺</span>
                <span className="text-gray-600">YouTube</span>
                <span className="text-gray-900">{state.youtubeViewers ?? '—'}</span>
              </div>
            </div>

            {/* Mobile collapse toggle */}
            <button
              type="button"
              onClick={() => setChatCollapsed(c => !c)}
              className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 lg:hidden"
            >
              <span>{chatCollapsed ? `▸ ${t('liveChat.expandChat')}` : `▾ ${t('liveChat.collapseChat')}`}</span>
              <span className="text-gray-400">{state.viewersOnline} {t('liveChat.onlineCountSuffix')}</span>
            </button>

            {(!chatCollapsed) && (
              <>
                {/* Viewer list: 1/3 height */}
                <div className="border-b border-gray-200 bg-gray-50/50 basis-1/3 min-h-0 overflow-hidden flex flex-col">
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-100">{t('liveChat.onlineHeader')}</div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <LiveViewerList viewers={state.viewerList} myDisplayName={identity?.displayName} />
                  </div>
                </div>

                {/* Chat: 2/3 height */}
                <div className="basis-2/3 min-h-0 flex flex-col">
                  {identity ? (
                    <LiveChatPanel
                      videoId={state.videoId}
                      sessionId={identity.sessionId}
                      displayName={identity.displayName}
                      isAdmin={isLoggedInAdmin}
                      enabled={isLive}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-3 text-center text-xs text-gray-500">
                      {t('liveChat.joinFirst')}
                    </div>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      </>
    );
  }

  // Offline state — original layout (no chat, since chat is per-stream)
  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 flex items-start gap-3">
        <div className="flex-1 min-w-0">
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
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          title={`${t('liveChat.refreshButton')} — ${t('liveChat.refreshHint')}`}
          aria-label={t('liveChat.refreshButton')}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-blue-600 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <span className={refreshing ? 'animate-spin' : ''}>↻</span>
        </button>
      </div>

      {state.latestSermons && state.latestSermons.length > 0 ? (
        <div>
          <div className="mb-3 text-sm font-semibold text-gray-700">
            {t('sermonsPage.watchLatestReplay')}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {state.latestSermons.map(sermon => {
              const title = language === Language.ZH ? sermon.titleZh : sermon.titleEn;
              const dateStr = sermon.date
                ? new Date(sermon.date.length === 10 ? `${sermon.date}T00:00:00` : sermon.date)
                    .toLocaleDateString(language === Language.ZH ? 'zh-Hant' : 'en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                : '';
              return (
                <a
                  key={sermon.id}
                  href={`/sermons/${sermon.id}`}
                  className="group block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-black">
                    <img
                      src={`https://img.youtube.com/vi/${sermon.videoId}/mqdefault.jpg`}
                      alt={title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white">▶</div>
                    </div>
                  </div>
                  <div className="p-2.5">
                    <div className="line-clamp-2 text-sm font-semibold text-gray-900">{title}</div>
                    {dateStr && <div className="mt-1 text-xs text-gray-500">{dateStr}</div>}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default LiveStreamSection;

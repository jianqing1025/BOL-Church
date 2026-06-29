import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useLocalization } from '../hooks/useLocalization';
import { useAdmin } from '../hooks/useAdmin';
import { Language } from '../types';
import type { LiveStreamPublicState } from '../types';
import LiveJoinModal from './LiveJoinModal';
import LiveViewerList from './LiveViewerList';
import LiveChatPanel from './LiveChatPanel';
import LivePlayer from './LivePlayer';

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

function formatLiveDuration(seconds?: number | null): string {
  if (!seconds || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const LiveStreamSection: React.FC = () => {
  const { t, language } = useLocalization();
  const { currentUser, sermons } = useAdmin();
  const [state, setState] = useState<LiveStreamPublicState | null>(null);
  const [identity, setIdentity] = useState<StoredIdentity | null>(() => (typeof window !== 'undefined' ? readIdentity() : null));
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);

  const isLoggedInAdmin = !!currentUser;
  const isLive = state?.status === 'live' && !!state?.videoId;
  const isReplay = state?.status === 'replay' && !!state?.videoId;

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

  // 歷史直播：從本地 sermons 拉所有 category='live-broadcast' 的條目，
  // 過濾隱藏，按日期倒序排，限制顯示前 12 條（多了讓用戶去 /sermons 翻）
  const pastBroadcasts = useMemo(() => {
    return sermons
      .filter(s => s.category === 'live-broadcast' && !s.hidden)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 12);
  }, [sermons]);

  const renderPastBroadcasts = () => {
    if (pastBroadcasts.length === 0) return null;
    return (
      <div>
        <div className="mb-3 text-sm font-semibold text-gray-700">
          {t('sermonsPage.pastBroadcastsTitle')}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {pastBroadcasts.map(sermon => {
            const title = language === Language.ZH ? (sermon.title.zh || sermon.title.en) : (sermon.title.en || sermon.title.zh);
            const dateStr = sermon.date
              ? new Date(`${sermon.date}T00:00:00`).toLocaleDateString(language === Language.ZH ? 'zh-Hant' : 'en-US', {
                  year: 'numeric', month: 'short', day: 'numeric',
                })
              : '';
            const duration = formatLiveDuration(sermon.durationSeconds);
            return (
              <a
                key={sermon.id}
                href={`/sermons/${sermon.id}`}
                className="group block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-black">
                  <img
                    src={`https://img.youtube.com/vi/${sermon.youtubeId}/hqdefault.jpg`}
                    alt={title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  {duration && (
                    <span className="absolute bottom-1.5 right-1.5 z-10 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white tabular-nums">
                      {duration}
                    </span>
                  )}
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
    );
  };

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
              <LivePlayer videoId={state.videoId} />
            </div>
          </div>

          {/* Right: chat sidebar 1/4 — mobile 較矮（手機優先看 player），desktop 跟 player 等高 */}
          <aside className="flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm lg:w-[320px] lg:flex-none h-[260px] lg:h-auto lg:self-stretch overflow-hidden">
            {/* Counts bar */}
            <div className="grid grid-cols-2 gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span>👥</span>
                <span className="text-gray-600">{t('liveChat.countLabelSite')}</span>
                <span className="text-gray-900">{state.websiteTotal}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>📺</span>
                <span className="text-gray-600">YouTube</span>
                <span className="text-gray-900">{state.youtubePeak ?? '—'}</span>
              </div>
            </div>

            {/* Mobile collapse toggle */}
            <button
              type="button"
              onClick={() => setChatCollapsed(c => !c)}
              className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 lg:hidden"
            >
              <span>{chatCollapsed ? `▸ ${t('liveChat.expandChat')}` : `▾ ${t('liveChat.collapseChat')}`}</span>
              <span className="text-gray-400">{t('liveChat.countLabelTotal')} {state.totalOnline}</span>
            </button>

            {(!chatCollapsed) && (
              <>
                {/* Viewer list:
                      mobile: 固定高 h-20（容納 ~2 行 pill）
                      desktop: 佔 1/6（原本 1/3 的一半，多出的 1/6 給 chat） */}
                <div className="border-b border-gray-200 bg-gray-50/50 h-20 shrink-0 lg:h-auto lg:shrink lg:basis-1/6 min-h-0 overflow-hidden flex flex-col">
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-100">{t('liveChat.onlineHeader')}</div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <LiveViewerList viewers={state.viewerList} myDisplayName={identity?.displayName} />
                  </div>
                </div>

                {/* Chat:
                      mobile: flex-1 吃掉剩餘高度（約 260 - 40(counts) - 36(toggle) - 80(viewer) ≈ 104px，原本 ~333px 的 1/3）
                      desktop: 佔 5/6（吃掉 viewer 縮減出來的空間） */}
                <div className="flex-1 lg:flex-none lg:basis-5/6 min-h-0 flex flex-col">
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

        {/* 歷史直播：直播狀態下也在底部展示，便於用戶下播後繼續看舊內容 */}
        <div className="mt-8">{renderPastBroadcasts()}</div>
      </>
    );
  }

  // Replay state — 上次直播的回放（manual_video_id 已被 archive flow 設為剛結束的直播）
  // 跟 LIVE 不同：沒有「🔴 LIVE」徽章、不顯示聊天面板（chat per-stream）、徽章用中性色
  if (isReplay) {
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
          <span className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            {t('sermonsPage.replayBadge')}
          </span>
          {state.nextServiceIso && (
            <span className="text-blue-600/80 font-normal">
              · {t('sermonsPage.nextServiceLabel')} {formatNextService(state.nextServiceIso, language)}
            </span>
          )}
        </div>
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black shadow-lg">
          <iframe
            key={state.videoId || 'replay'}
            src={`https://www.youtube.com/embed/${state.videoId}?rel=0`}
            title="Last broadcast replay"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
        <div className="mt-8">{renderPastBroadcasts()}</div>
      </div>
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

      {renderPastBroadcasts()}
    </div>
  );
};

export default LiveStreamSection;

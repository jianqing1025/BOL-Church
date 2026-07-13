import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useLocalization } from '../hooks/useLocalization';
import { useAdmin } from '../hooks/useAdmin';
import { Language } from '../types';
import type { LiveStreamPublicState } from '../types';
import LiveJoinModal from './LiveJoinModal';
import LiveStatusCard from './LiveStatusCard';
import LiveRoomView from './LiveRoomView';
import { pageCtaState, shouldCloseLiveRoom } from '../live/liveRoom';

const POLL_INTERVAL_MS = 30_000;
const PING_INTERVAL_MS = 20_000;
const CTA_TICK_MS = 60_000; // 回放窗口跨過週六零點時不刷新頁面也能切換
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

function formatLiveDuration(seconds?: number | null): string {
  if (!seconds || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Match SermonsPage view-count formatting (1.2K / 3.4M)
function formatViewCount(count?: number | null): string {
  if (count == null || count < 0) return '';
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/**
 * 直播頁 = 入口頁：狀態卡（等待/查看回放/進入直播）+ 歷史直播網格。
 * 直播與回放都不再站內嵌視頻——觀看、聊天、在線名單全部在 LiveRoomView 房間裏；
 * 身份與 join/ping 心跳只在直播房間打開期間運行（網站在線人數 = 進房人數）。
 */
/** 房間目標：跟隨當前流（直播/上次回放）或某一期歷史直播 */
type RoomTarget = { kind: 'stream' } | { kind: 'past'; videoId: string };

const LiveStreamSection: React.FC = () => {
  const { t, language } = useLocalization();
  const { currentUser, sermons } = useAdmin();
  const [state, setState] = useState<LiveStreamPublicState | null>(null);
  const [identity, setIdentity] = useState<StoredIdentity | null>(() => (typeof window !== 'undefined' ? readIdentity() : null));
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [roomTarget, setRoomTarget] = useState<RoomTarget | null>(null);
  const [pendingRoomEntry, setPendingRoomEntry] = useState(false);

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

  // 每分鐘重算 CTA（回放窗口的週六零點邊界靠這個 tick 跨過）
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), CTA_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  const cta = pageCtaState(state?.status ?? 'offline', state?.videoId ?? null, new Date(nowTick));

  // 管理員直播時自動取得身份（免彈窗）；一般用戶點「進入直播」才彈
  useEffect(() => {
    if (!isLive || !isLoggedInAdmin || identity) return;
    (async () => {
      const sessionId = newSessionId();
      try {
        const res = await api.liveJoin({ sessionId });
        const next: StoredIdentity = { sessionId, displayName: res.displayName, asGuest: false };
        writeIdentity(next);
        setIdentity(next);
      } catch { /* will retry next tick */ }
    })();
  }, [isLive, isLoggedInAdmin, identity]);

  // 直播不在「可進入」狀態時收起彈窗並清掉待進房標記（含直播中途結束的情形）
  useEffect(() => {
    if (cta !== 'enter-live') {
      setShowJoinModal(false);
      setPendingRoomEntry(false);
    }
  }, [cta]);

  // join + 心跳只在直播房間打開期間運行——網站在線人數 = 進房觀看的人
  const inStreamRoom = roomTarget?.kind === 'stream';
  useEffect(() => {
    if (!inStreamRoom || !isLive || !identity) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await api.liveJoin({ sessionId: identity.sessionId, displayName: identity.displayName, asGuest: identity.asGuest });
      } catch { /* ignore */ }
    })();
    const id = window.setInterval(async () => {
      if (cancelled) return;
      try { await api.livePing(identity.sessionId); } catch { /* ignore */ }
    }, PING_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [inStreamRoom, isLive, identity]);

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

  const handleOpenRoom = useCallback(() => {
    if (cta === 'watch-replay') { setRoomTarget({ kind: 'stream' }); return; } // 看回放不需要身份
    if (cta !== 'enter-live') return;
    if (identity) { setRoomTarget({ kind: 'stream' }); return; }
    setPendingRoomEntry(true);
    // 管理員的身份由自動加入 effect 補齊，這裏只等；一般用戶先填名字
    if (!isLoggedInAdmin) setShowJoinModal(true);
  }, [cta, identity, isLoggedInAdmin]);

  // 等待身份就緒後補開房間（覆蓋一般用戶入會與管理員自動加入兩條路徑）
  useEffect(() => {
    if (pendingRoomEntry && identity) {
      setPendingRoomEntry(false);
      setRoomTarget({ kind: 'stream' });
    }
  }, [pendingRoomEntry, identity]);

  const handleJoin = useCallback(async (params: { name?: string; asGuest?: boolean }) => {
    const sessionId = identity?.sessionId || newSessionId();
    const res = await api.liveJoin({ sessionId, name: params.name, asGuest: params.asGuest });
    const next: StoredIdentity = { sessionId, displayName: res.displayName, asGuest: !!params.asGuest };
    writeIdentity(next);
    setIdentity(next);
    setShowJoinModal(false);
  }, [identity]);

  // 跟隨當前流的房間：無直播也無可看回放（waiting）時自動關；live ↔ 回放原地換模式。
  // 歷史直播房間不受當前流狀態影響。
  useEffect(() => {
    if (roomTarget?.kind === 'stream' && shouldCloseLiveRoom(true, cta)) setRoomTarget(null);
  }, [roomTarget, cta]);

  // 歷史直播：從本地 sermons 拉所有 category='live-broadcast' 的條目，
  // 過濾隱藏，按日期倒序排，限制顯示前 12 條（多了讓用戶去 /sermons 翻）
  const pastBroadcasts = useMemo(() => {
    return sermons
      .filter(s => s.category === 'live-broadcast' && !s.hidden)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 12);
  }, [sermons]);
  // 歷史直播（直播回放）也進影院式房間觀看：replay 模式、聊天為該場存檔（只讀）
  const handlePastBroadcastClick = (youtubeId: string) => {
    setRoomTarget({ kind: 'past', videoId: youtubeId });
  };

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
              <button
                key={sermon.id}
                type="button"
                onClick={() => handlePastBroadcastClick(sermon.youtubeId)}
                className="group block overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md"
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
                  <div className="mt-1 grid grid-cols-[max-content_minmax(0,1fr)_max-content] items-center gap-2 text-xs text-gray-500">
                    <span className="flex-shrink-0 whitespace-nowrap">{dateStr}</span>
                    <span className="min-w-0 text-center text-gray-400 whitespace-nowrap" title={t('liveChat.countLabelTotal')}>
                      {language === Language.ZH ? '在線' : 'Online'}: {formatViewCount(sermon.liveOnlineTotal ?? 0)}
                    </span>
                    <span className="text-right text-gray-400 whitespace-nowrap">
                      {formatViewCount(sermon.viewCount)
                        ? `${language === Language.ZH ? '觀看' : 'Views'}: ${formatViewCount(sermon.viewCount)}`
                        : ''}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (!state) {
    return <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">...</div>;
  }

  return (
    <div className="space-y-8">
      {showJoinModal && (
        <LiveJoinModal
          loggedInName={currentUser?.name}
          onJoin={handleJoin}
        />
      )}

      {/* 房間：直播需要身份；回放/歷史直播直接看。跟隨流的房間在 live ↔ 回放間原地換模式 */}
      {(() => {
        if (!roomTarget) return null;
        const roomView = roomTarget.kind === 'past'
          ? { mode: 'replay' as const, videoId: roomTarget.videoId }
          : cta === 'enter-live' && identity
            ? { mode: 'live' as const, videoId: state.videoId ?? '' }
            : cta === 'watch-replay'
              ? { mode: 'replay' as const, videoId: state.videoId ?? '' }
              : null;
        if (!roomView) return null;
        return (
          <LiveRoomView
            state={state}
            mode={roomView.mode}
            videoId={roomView.videoId}
            identity={identity}
            isAdmin={isLoggedInAdmin}
            onLeave={() => setRoomTarget(null)}
          />
        );
      })()}

      <LiveStatusCard
        state={state}
        cta={cta}
        refreshing={refreshing}
        refreshMsg={refreshMsg}
        onRefresh={handleRefresh}
        onOpenRoom={handleOpenRoom}
      />

      {renderPastBroadcasts()}
    </div>
  );
};

export default LiveStreamSection;

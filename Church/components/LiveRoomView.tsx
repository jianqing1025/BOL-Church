import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, Maximize, MessageSquare, Minimize, PhoneOff, Users, X } from 'lucide-react';
import { useLocalization } from '../hooks/useLocalization';
import { Language } from '../types';
import type { LiveStreamPublicState } from '../types';
import LivePlayer from './LivePlayer';
import LiveViewerList from './LiveViewerList';
import LiveChatPanel from './LiveChatPanel';

export type LiveRoomMode = 'live' | 'replay';
type PanelKind = 'none' | 'members' | 'chat';

const formatElapsed = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

const formatStartedAt = (ts: number, language: Language): string =>
  new Date(ts).toLocaleTimeString(language === Language.ZH ? 'zh-Hant' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

// 與 MeetingControlBar 同款圓鈕
const CircleButton: React.FC<{
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, active, danger, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    title={label}
    className={`relative flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors ${
      danger
        ? 'bg-red-600 hover:bg-red-700'
        : active
          ? 'bg-blue-600 hover:bg-blue-500'
          : 'bg-gray-700 hover:bg-gray-600'
    }`}
  >
    {children}
  </button>
);

interface LiveRoomViewProps {
  state: LiveStreamPublicState;
  /** live：直播（聊天可發言、有在線列表）；replay：回放（聊天只讀、無在線列表） */
  mode: LiveRoomMode;
  /** 房間播放的視頻：直播/上次回放為 state.videoId，歷史直播為該期 youtubeId */
  videoId: string;
  /** 回放模式可為 null（看回放不需要身份） */
  identity: { sessionId: string; displayName: string } | null;
  isAdmin: boolean;
  onLeave: () => void;
}

/**
 * 主日直播/回放房間：與線上查經（MeetingRoomView）同款佈局——
 * 頂部 header（品牌 / 直播計時+開播時間 / 總在線人數可點開名單）、
 * 中間 YouTube 鋪滿、底部三圓鈕（聊天 / 在線列表 / 掛斷）。
 * 右側面板以 flex 佔位，打開時視頻隨之縮放；名單與聊天互斥。
 * 數據全部由 LiveStreamSection 傳入，自身無請求邏輯。
 */
const LiveRoomView: React.FC<LiveRoomViewProps> = ({ state, mode, videoId, identity, isAdmin, onLeave }) => {
  const { t, language } = useLocalization();
  const rootRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<PanelKind>('none');

  // 房間打開期間鎖定頁面滾動，關閉時恢復
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // 只有觸屏設備進房自動全屏 + 鎖橫屏（Android 生效，iOS 靜默失敗）；
  // 桌面留在瀏覽器裏，由 header 的全屏按鈕手動切換。退房統一恢復。
  useEffect(() => {
    const root = rootRef.current;
    const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    if (isTouch) {
      void (async () => {
        try { await root?.requestFullscreen?.(); } catch { /* ignore */ }
        try {
          await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape');
        } catch { /* ignore */ }
      })();
    }
    return () => {
      try { (screen.orientation as unknown as { unlock?: () => void }).unlock?.(); } catch { /* ignore */ }
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => { /* ignore */ });
    };
  }, []);

  // 全屏狀態跟隨瀏覽器事件（Esc 退出也能同步按鈕圖標）
  const [isFullscreen, setIsFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => { /* ignore */ });
    } else {
      void rootRef.current?.requestFullscreen?.().catch(() => { /* ignore */ });
    }
  }, []);

  // 直播計時：從開播時間起算，每秒更新
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (mode !== 'live' || !state.startedAt) return undefined;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [mode, state.startedAt]);
  const elapsedSec = mode === 'live' && state.startedAt
    ? Math.max(0, Math.floor((nowMs - state.startedAt) / 1000))
    : null;

  // 回放沒有實時名單：若切到回放時名單開着則收起
  useEffect(() => {
    if (mode !== 'live') setPanel((p) => (p === 'members' ? 'none' : p));
  }, [mode]);

  const togglePanel = useCallback((kind: Exclude<PanelKind, 'none'>) => {
    setPanel((prev) => (prev === kind ? 'none' : kind));
  }, []);

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-gray-100">
      {/* 頂欄：品牌（點擊離開）/ 直播狀態+計時 / 總在線人數（點擊開名單） */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-gray-900/80 px-4 py-3">
        <button
          type="button"
          onClick={onLeave}
          className="flex min-w-0 items-center gap-1 text-sm font-semibold text-gray-300 hover:text-white"
        >
          <ChevronLeft size={18} className="shrink-0" />
          <span className="truncate">{t('liveChat.roomBrand')}</span>
        </button>
        <div className="flex min-w-0 items-center gap-3">
          {mode === 'live' ? (
            <>
              <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-red-500">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-600" />
                {t('sermonsPage.liveBadge')}
              </span>
              {state.startedAt && (
                <span className="hidden truncate text-sm text-gray-400 sm:inline">
                  {t('sermonsPage.liveStartedAt')} {formatStartedAt(state.startedAt, language as Language)}
                </span>
              )}
              {elapsedSec != null && (
                <span className="shrink-0 tabular-nums text-sm text-gray-400">{formatElapsed(elapsedSec)}</span>
              )}
            </>
          ) : (
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-blue-400">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
              {t('sermonsPage.replayBadge')}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {mode === 'live' && (
            <button
              type="button"
              onClick={() => togglePanel('members')}
              title={t('liveChat.membersLabel')}
              aria-label={t('liveChat.membersLabel')}
              className="flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-white"
            >
              <Users size={16} />
              {state.totalOnline}
            </button>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={t('liveChat.fullscreenLabel')}
            aria-label={t('liveChat.fullscreenLabel')}
            className="text-gray-400 transition-colors hover:text-white"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </header>

      {/* 主體：視頻 + 右側面板（flex 佔位，開面板視頻隨之縮放） */}
      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 min-w-0 flex-1 p-3">
          <div className="h-full w-full overflow-hidden rounded-xl bg-black">
            <LivePlayer videoId={videoId} />
          </div>
        </main>

        {panel !== 'none' && (
          <aside className="flex w-1/3 shrink-0 flex-col overflow-hidden border-l border-white/10 bg-gray-900 sm:w-80">
            <div className="flex shrink-0 items-center justify-between px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {panel === 'members' ? t('liveChat.membersLabel') : t('liveChat.chatLabel')}
              </span>
              <button
                type="button"
                onClick={() => setPanel('none')}
                title={t('liveChat.closePanelLabel')}
                aria-label={t('liveChat.closePanelLabel')}
                className="text-gray-400 transition-colors hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-white text-gray-900">
              {panel === 'members' ? (
                <div className="h-full overflow-y-auto">
                  <LiveViewerList viewers={state.viewerList} myDisplayName={identity?.displayName} />
                </div>
              ) : (
                <LiveChatPanel
                  videoId={videoId}
                  sessionId={identity?.sessionId ?? ''}
                  displayName={identity?.displayName ?? ''}
                  isAdmin={isAdmin}
                  enabled={mode === 'live' && !!identity}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* 底部控制欄：與查經同款，只留 聊天 / 在線列表 / 掛斷 */}
      <div className="flex shrink-0 items-center justify-center gap-3 border-t border-white/10 bg-gray-900/80 px-4 py-3">
        <CircleButton label={t('liveChat.chatLabel')} active={panel === 'chat'} onClick={() => togglePanel('chat')}>
          <MessageSquare size={20} />
        </CircleButton>
        {mode === 'live' && (
          <CircleButton label={t('liveChat.membersLabel')} active={panel === 'members'} onClick={() => togglePanel('members')}>
            <Users size={20} />
          </CircleButton>
        )}
        <CircleButton label={t('liveChat.hangUpLabel')} danger onClick={onLeave}>
          <PhoneOff size={20} />
        </CircleButton>
      </div>
    </div>
  );
};

export default LiveRoomView;

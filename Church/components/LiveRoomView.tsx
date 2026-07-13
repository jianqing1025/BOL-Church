import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, PhoneOff, Users } from 'lucide-react';
import { useLocalization } from '../hooks/useLocalization';
import type { LiveStreamPublicState } from '../types';
import LivePlayer from './LivePlayer';
import LiveViewerList from './LiveViewerList';
import LiveChatPanel from './LiveChatPanel';

export type LiveRoomMode = 'live' | 'replay';
type DrawerKind = 'none' | 'members' | 'chat';

/** 進房後 chrome（header + 底部按鈕）自動隱藏的延時 */
const CHROME_HIDE_MS = 4000;

// 觸屏設備豎屏時的橫屏 fallback（iOS 不支持 orientation.lock，用 CSS 旋轉補）
const roomStyles = `
    @media (orientation: portrait) and (pointer: coarse) {
        .live-room-root {
            width: 100vh;
            height: 100vw;
            transform: rotate(90deg) translateY(-100%);
            transform-origin: top left;
        }
    }
`;

interface LiveRoomViewProps {
  state: LiveStreamPublicState;
  /** live：直播（聊天可發言、有在線列表）；replay：回放（聊天只讀、無在線列表） */
  mode: LiveRoomMode;
  /** 回放模式可為 null（看回放不需要身份） */
  identity: { sessionId: string; displayName: string } | null;
  isAdmin: boolean;
  onLeave: () => void;
}

/**
 * 影院式直播/回放房間：視頻鋪滿全屏，header 與底部三圓鈕（在線列表/聊天/掛斷）
 * 自動隱藏、點屏喚出；右側抽屜寬 20%（min 200px），在線列表與聊天互斥。
 * 進房嘗試全屏+鎖橫屏（Android），iOS 走 CSS rotate fallback。
 * 數據全部由 LiveStreamSection 傳入，自身無請求邏輯。
 */
const LiveRoomView: React.FC<LiveRoomViewProps> = ({ state, mode, identity, isAdmin, onLeave }) => {
  const { t } = useLocalization();
  const rootRef = useRef<HTMLDivElement>(null);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [drawer, setDrawer] = useState<DrawerKind>('none');
  const hideTimerRef = useRef<number | null>(null);

  // 房間打開期間鎖定頁面滾動，關閉時恢復
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // 進房嘗試全屏 + 鎖橫屏；退房解鎖並退出全屏。全部 best-effort（iOS 靜默失敗）。
  useEffect(() => {
    const root = rootRef.current;
    void (async () => {
      try { await root?.requestFullscreen?.(); } catch { /* ignore */ }
      try {
        await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape');
      } catch { /* ignore */ }
    })();
    return () => {
      try { (screen.orientation as unknown as { unlock?: () => void }).unlock?.(); } catch { /* ignore */ }
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => { /* ignore */ });
    };
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), CHROME_HIDE_MS);
  }, []);

  const showChrome = useCallback(() => {
    setChromeVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // 進房數秒後隱藏 chrome；卸載時清定時器
  useEffect(() => {
    scheduleHide();
    return () => { if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current); };
  }, [scheduleHide]);

  // 抽屜開着時 chrome 常顯（操作中不隱藏）；關閉後重新計時
  useEffect(() => {
    if (drawer !== 'none') {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      setChromeVisible(true);
    } else {
      scheduleHide();
    }
  }, [drawer, scheduleHide]);

  // 直播中途結束切回放：在線列表失效，若正開着則收起
  useEffect(() => {
    if (mode !== 'live') setDrawer((d) => (d === 'members' ? 'none' : d));
  }, [mode]);

  const toggleDrawer = useCallback((kind: Exclude<DrawerKind, 'none'>) => {
    setDrawer((prev) => (prev === kind ? 'none' : kind));
  }, []);

  const roundButton = (active: boolean) =>
    `flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition-colors ${
      active ? 'bg-white/30 ring-2 ring-white/70' : 'bg-white/15 hover:bg-white/25'
    }`;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <style>{roomStyles}</style>
      <div ref={rootRef} className="live-room-root relative h-full w-full overflow-hidden bg-black text-gray-100">
        {/* 視頻鋪滿 */}
        <div className="absolute inset-0">
          <LivePlayer videoId={state.videoId ?? ''} />
        </div>

        {/* chrome 隱藏時的透明點擊層：點屏喚出；可見時不存在，不遮擋 YouTube 控件 */}
        {!chromeVisible && (
          <div className="absolute inset-0 z-10" onClick={showChrome} />
        )}

        {/* Header：品牌 + 徽章 + 在線數，隨 chrome 顯隱 */}
        <header
          className={`absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 pb-8 pt-3 transition-all duration-300 ${
            chromeVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-3 opacity-0'
          }`}
        >
          <span className="truncate text-base font-bold">{t('liveChat.roomBrand')}</span>
          <div className="flex shrink-0 items-center gap-3">
            {mode === 'live' ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-red-500">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-600" />
                {t('sermonsPage.liveBadge')}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                {t('sermonsPage.replayBadge')}
              </span>
            )}
            {mode === 'live' && (
              <span className="flex items-center gap-1.5 text-sm text-gray-300">
                <Users size={15} />
                {state.websiteTotal}
              </span>
            )}
          </div>
        </header>

        {/* 底部控制條：在線列表（僅直播）/ 聊天 / 掛斷 */}
        <div
          className={`absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-5 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10 transition-all duration-300 ${
            chromeVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
          }`}
        >
          {mode === 'live' && (
            <button
              type="button"
              onClick={() => toggleDrawer('members')}
              aria-label={t('liveChat.membersLabel')}
              title={t('liveChat.membersLabel')}
              className={roundButton(drawer === 'members')}
            >
              <Users size={22} />
            </button>
          )}
          <button
            type="button"
            onClick={() => toggleDrawer('chat')}
            aria-label={t('liveChat.chatLabel')}
            title={t('liveChat.chatLabel')}
            className={roundButton(drawer === 'chat')}
          >
            <MessageCircle size={22} />
          </button>
          <button
            type="button"
            onClick={onLeave}
            aria-label={t('liveChat.hangUpLabel')}
            title={t('liveChat.hangUpLabel')}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 transition-colors hover:bg-red-700"
          >
            <PhoneOff size={22} />
          </button>
        </div>

        {/* 右側抽屜：在線列表與聊天互斥，寬 1/5（min 200px） */}
        {drawer !== 'none' && (
          <aside className="absolute inset-y-0 right-0 z-20 flex w-1/5 min-w-[200px] flex-col overflow-hidden border-l border-white/10 bg-gray-900/95">
            <div className="shrink-0 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {drawer === 'members' ? t('liveChat.membersLabel') : t('liveChat.chatLabel')}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-white text-gray-900">
              {drawer === 'members' ? (
                <div className="h-full overflow-y-auto">
                  <LiveViewerList viewers={state.viewerList} myDisplayName={identity?.displayName} />
                </div>
              ) : (
                <LiveChatPanel
                  videoId={state.videoId}
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
    </div>
  );
};

export default LiveRoomView;

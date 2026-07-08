import React, { useEffect } from 'react';
import { ChevronLeft, Users } from 'lucide-react';
import { useLocalization } from '../hooks/useLocalization';
import type { LiveStreamPublicState } from '../types';
import LivePlayer from './LivePlayer';
import LiveViewerList from './LiveViewerList';
import LiveChatPanel from './LiveChatPanel';

interface LiveRoomViewProps {
  state: LiveStreamPublicState;
  identity: { sessionId: string; displayName: string };
  isAdmin: boolean;
  /** 由父组件格式化好的开播时间文案（含前缀），空串则不显示。 */
  startedAtLabel: string;
  onLeave: () => void;
}

/**
 * 主日直播全屏房间：仿 MeetingRoomView 的深色壳（顶栏 + 主区 + 右栏），
 * 主区放 YouTube 直播，右栏复用直播页的名单 + 聊天（保持浅色，装在白底卡片里）。
 * 不接 LiveKit，纯观看。数据全部由 LiveStreamSection 传入，自身无请求逻辑。
 */
const LiveRoomView: React.FC<LiveRoomViewProps> = ({ state, identity, isAdmin, startedAtLabel, onLeave }) => {
  const { t } = useLocalization();

  // 房间打开期间锁定页面滚动，关闭时恢复
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-gray-100">
      {/* 顶栏 */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-gray-900/80 px-4 py-3">
        <button
          type="button"
          onClick={onLeave}
          className="flex min-w-0 items-center gap-1 text-sm font-semibold text-gray-300 hover:text-white"
        >
          <ChevronLeft size={18} className="shrink-0" />
          <span className="truncate">{t('liveChat.leaveRoom')}</span>
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate font-bold">{t('sermonsPage.navLiveStream')}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-red-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-600" />
            {t('sermonsPage.liveBadge')}
          </span>
          {startedAtLabel && (
            <span className="hidden shrink-0 text-sm text-gray-400 sm:inline">{startedAtLabel}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-sm text-gray-400">
          <Users size={16} />
          {state.websiteTotal}
        </div>
      </header>

      {/* 主体：桌面左右分栏，移动端上下堆叠 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:flex-row lg:overflow-visible">
        <main className="min-h-0 min-w-0 flex-none lg:flex-1">
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black lg:aspect-auto lg:h-full">
            <LivePlayer videoId={state.videoId ?? ''} />
          </div>
        </main>

        {/* 右栏：名单(上, ~1/6) + 聊天(下, 其余)。组件保持浅色，白底卡片容器 */}
        <aside className="flex min-h-[240px] flex-1 flex-col overflow-hidden rounded-xl bg-white text-gray-900 shadow-lg lg:min-h-0 lg:w-[320px] lg:flex-none">
          <div className="flex h-1/6 min-h-[72px] shrink-0 flex-col border-b border-gray-200 bg-gray-50/50">
            <div className="bg-gray-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('liveChat.onlineHeader')}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <LiveViewerList viewers={state.viewerList} myDisplayName={identity.displayName} />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <LiveChatPanel
              videoId={state.videoId}
              sessionId={identity.sessionId}
              displayName={identity.displayName}
              isAdmin={isAdmin}
              enabled
            />
          </div>
        </aside>
      </div>
    </div>
  );
};

export default LiveRoomView;

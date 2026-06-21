import React from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { Language } from '../types';
import type { LiveStreamViewer } from '../types';

interface LiveViewerListProps {
  viewers: LiveStreamViewer[];
  myDisplayName?: string;
}

// 把伺服器存的「游客N」根據介面語言渲染成 "Guest N" / "游客 N"
function localizeName(name: string, isGuest: boolean, guestNumber: number | null, language: Language): string {
  if (isGuest && guestNumber != null && language !== Language.ZH) {
    return `Guest ${guestNumber}`;
  }
  return name;
}

const LiveViewerList: React.FC<LiveViewerListProps> = ({ viewers, myDisplayName }) => {
  const { t, language } = useLocalization();

  if (!viewers || viewers.length === 0) {
    return <div className="p-3 text-xs text-gray-500">{t('liveChat.noViewers')}</div>;
  }
  return (
    <div className="flex flex-wrap gap-1.5 p-3 overflow-y-auto">
      {viewers.map(v => {
        const isMe = v.displayName === myDisplayName;
        const cls = v.isAdmin
          ? 'bg-red-100 text-red-700 border border-red-200'
          : v.isGuest
            ? 'bg-gray-100 text-gray-600 border border-gray-200'
            : 'bg-blue-50 text-blue-700 border border-blue-200';
        const titleText = v.isAdmin
          ? t('liveChat.roleAdmin')
          : v.isGuest
            ? t('liveChat.roleGuest')
            : t('liveChat.roleMember');
        const displayed = localizeName(v.displayName, v.isGuest, v.guestNumber, language as Language);
        return (
          <span
            key={`${v.displayName}-${v.guestNumber ?? ''}`}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls} ${isMe ? 'ring-2 ring-offset-1 ring-blue-400' : ''}`}
            title={titleText}
          >
            {v.isAdmin && <span className="mr-1">👑</span>}
            {displayed}
          </span>
        );
      })}
    </div>
  );
};

export default LiveViewerList;

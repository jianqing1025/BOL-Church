import React from 'react';
import { Mic, MicOff, UserMinus } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';
import type { PresenceUser } from '../../meeting/chatProtocol';

interface MemberListProps {
  users: PresenceUser[];
  /** Whether the viewer is a host, and so may mute or remove the others. */
  isHost?: boolean;
  ownUserId?: string | null;
  /**
   * Who has their microphone on, by presence id. A missing entry means not
   * known yet — someone still connecting should not be drawn as silenced.
   */
  micOn?: Map<string, boolean>;
  onMute?: (userId: string) => void;
  onUnmute?: (userId: string) => void;
  onRemove?: (userId: string) => void;
}

export const MemberList: React.FC<MemberListProps> = ({ users, isHost, ownUserId, micOn, onMute, onUnmute, onRemove }) => {
  const { t } = useLocalization();
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-4 py-3 text-sm font-bold text-gray-200">
        {t('meeting.members')} ({users.length})
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {users.map((u) => {
          // A host's controls apply to the others, never to a host themselves.
          const controllable = isHost && u.id !== ownUserId && !u.isHost;
          const muted = micOn?.get(u.id) === false;
          return (
            <li key={u.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-300">
              <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
              <span className="truncate">{u.name}</span>
              {muted && <MicOff size={14} className="shrink-0 text-red-400" aria-label={t('meeting.mutedNow')} />}
              {u.isHost && (
                <span className="shrink-0 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  {t('meeting.host')}
                </span>
              )}
              {controllable && (
                <span className="ml-auto flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => (muted ? onUnmute?.(u.id) : onMute?.(u.id))}
                    aria-label={t(muted ? 'meeting.hostUnmute' : 'meeting.hostMute')}
                    title={t(muted ? 'meeting.hostUnmute' : 'meeting.hostMute')}
                    className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-white/10 hover:text-white"
                  >
                    {muted ? <Mic size={15} /> : <MicOff size={15} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove?.(u.id)}
                    aria-label={t('meeting.hostRemove')}
                    title={t('meeting.hostRemove')}
                    className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-600/80 hover:text-white"
                  >
                    <UserMinus size={15} />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default MemberList;

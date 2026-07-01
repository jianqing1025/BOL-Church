import React, { useEffect, useState } from 'react';
import { ChevronLeft, Users } from 'lucide-react';
import type { MeetingRoom } from '../../constants/meetingRooms';
import { useLiveKit } from '../../hooks/useLiveKit';
import { useLocalization } from '../../hooks/useLocalization';
import { VideoStage } from './VideoStage';
import { MeetingControlBar } from './MeetingControlBar';
import { MessageList, type DisplayMessage } from './MessageList';
import { ChatInput } from './ChatInput';
import { MemberList } from './MemberList';

interface MeetingRoomViewProps {
  room: MeetingRoom;
  name: string;
  password: string;
  messages: DisplayMessage[];
  members: { id: string; name: string }[];
  ownUserId: string | null;
  onSend: (text: string) => void;
  onLeave: () => void;
}

const formatElapsed = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

export const MeetingRoomView: React.FC<MeetingRoomViewProps> = ({
  room, name, password, messages, members, ownUserId, onSend, onLeave,
}) => {
  const { t } = useLocalization();
  const lk = useLiveKit(room, name, password);
  const [chatOpen, setChatOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [room.id]);

  const anyDrawer = chatOpen || membersOpen;

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-950 text-gray-100">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-gray-900/80 px-4 py-3">
        <button
          type="button"
          onClick={onLeave}
          className="flex items-center gap-1 text-sm font-semibold text-gray-300 hover:text-white"
        >
          <ChevronLeft size={18} />
          {t('meeting.changeRoom')}
        </button>
        <div className="flex items-center gap-3 truncate">
          <span className="truncate font-bold">{room.name}</span>
          <span className="tabular-nums text-sm text-gray-400">{formatElapsed(elapsed)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-400">
          <Users size={16} />
          {members.length}
        </div>
      </header>

      {/* Body: stage + optional right drawer */}
      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 flex-1 p-3">
          {room.hasVideo ? (
            <VideoStage
              participants={lk.participants}
              connecting={lk.connecting}
              error={lk.error}
              onRetry={() => void lk.join()}
            />
          ) : (
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-gray-900">
              <MessageList messages={messages} ownUserId={ownUserId} />
              <ChatInput onSend={onSend} />
            </div>
          )}
        </main>

        {anyDrawer && (
          <aside className="flex w-full max-w-full shrink-0 flex-col overflow-hidden border-l border-white/10 bg-gray-900 sm:w-80">
            {chatOpen && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <MessageList messages={messages} ownUserId={ownUserId} />
                <ChatInput onSend={onSend} />
              </div>
            )}
            {membersOpen && (
              <div className={`min-h-0 ${chatOpen ? 'shrink-0 border-t border-white/10' : 'flex-1'}`}>
                <MemberList users={members} />
              </div>
            )}
          </aside>
        )}
      </div>

      <MeetingControlBar
        hasVideo={room.hasVideo}
        micOn={lk.micOn}
        camOn={lk.camOn}
        chatOpen={chatOpen}
        membersOpen={membersOpen}
        onToggleMic={() => void lk.toggleMic()}
        onToggleCamera={() => void lk.toggleCamera()}
        onToggleScreenShare={() => void lk.toggleScreenShare()}
        onToggleChat={() => setChatOpen((v) => !v)}
        onToggleMembers={() => setMembersOpen((v) => !v)}
        onLeave={onLeave}
      />
    </div>
  );
};

export default MeetingRoomView;

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, Users, ScreenShareOff } from 'lucide-react';
import { localizeMeetingRoomText, type MeetingRoom } from '../../constants/meetingRooms';
import { useLiveKit } from '../../hooks/useLiveKit';
import { useLocalization } from '../../hooks/useLocalization';
import { LiveKitService } from '../../services/livekitService';
import { VideoStage, type ViewMode } from './VideoStage';
import { MeetingControlBar } from './MeetingControlBar';
import { MessageList, type DisplayMessage } from './MessageList';
import { ChatInput } from './ChatInput';
import { ChatPanel } from './ChatPanel';
import { MemberList } from './MemberList';
import type { BibleSync } from '../../hooks/useBibleSync';
import type { HostMessage, PresenceUser } from '../../meeting/chatProtocol';
import { BiblePanel } from './BiblePanel';
import { VideoBroadcastBar } from './VideoBroadcastBar';

interface MeetingRoomViewProps {
  room: MeetingRoom;
  name: string;
  password: string;
  messages: DisplayMessage[];
  members: PresenceUser[];
  ownUserId: string | null;
  /** Whether this participant ticked Host on the room card. */
  isHost: boolean;
  /** The room's shared position in the Bible. */
  bible: BibleSync;
  /** Latest command from a host; the seq makes an identical repeat re-fire. */
  hostCommand: { message: HostMessage; seq: number } | null;
  onHostCommand: (message: HostMessage) => void;
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
  room, name, password, messages, members, ownUserId, isHost,
  bible, hostCommand, onHostCommand, onSend, onLeave,
}) => {
  const { language, t } = useLocalization();
  const lk = useLiveKit(room, name, password, isHost);
  const screenActive = lk.participants.some((p) => LiveKitService.isScreenSharing(p));
  const localSharing = lk.participants.some((p) => p.isLocal && LiveKitService.isScreenSharing(p));
  const [chatOpen, setChatOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [bibleExpanded, setBibleExpanded] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const filePickerRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [elapsed, setElapsed] = useState(0);
  const [unread, setUnread] = useState(0);
  const prevLenRef = useRef(messages.length);

  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [room.id]);

  // Count incoming messages from others while the chat is closed → badge.
  useEffect(() => {
    const prev = prevLenRef.current;
    prevLenRef.current = messages.length;
    if (!room.hasVideo || chatOpen) return; // chat surface already visible
    if (prev === 0) return;                  // initial history load is not "new"
    const added = messages.slice(prev)
      .filter((m) => m.type === 'message' && m.userId !== ownUserId).length;
    if (added > 0) setUnread((u) => u + added);
  }, [messages, chatOpen, ownUserId, room.hasVideo]);

  const stopVideoFile = useCallback(() => {
    setVideoFile(null);
    void lk.stopVideoFile();
  }, [lk]);

  // Carry out a host's command. Everything a host does lands on the target's
  // own client, which is what actually turns off its microphone or leaves —
  // there is no server-side enforcement over the media tracks.
  const seq = hostCommand?.seq;
  useEffect(() => {
    const command = hostCommand?.message;
    if (!command || isHost) return;

    if (command.action === 'claimShare') {
      if (videoFile) { setVideoFile(null); void lk.stopVideoFile(); }
      if (lk.screenOn) void lk.toggleScreenShare();
      return;
    }
    if (command.targetUserId !== ownUserId) return;
    if (command.action === 'mute') {
      if (lk.micOn) void lk.toggleMic();
    } else if (command.action === 'remove') {
      onLeave();
    }
    // `seq` is the trigger: it changes on every command, including a repeat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  const toggleVideoFile = useCallback(() => {
    if (videoFile) { stopVideoFile(); return; }
    if (isHost) onHostCommand({ type: 'host', action: 'claimShare' });
    // Reset the value so re-picking the same file still fires onChange.
    if (filePickerRef.current) filePickerRef.current.value = '';
    filePickerRef.current?.click();
  }, [videoFile, stopVideoFile, isHost, onHostCommand]);

  // Clear the badge when the chat is opened.
  useEffect(() => { if (chatOpen) setUnread(0); }, [chatOpen]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-950 text-gray-100">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-gray-900/80 px-4 py-3">
        <button
          type="button"
          onClick={onLeave}
          className="flex min-w-0 items-center gap-1 text-sm font-semibold text-gray-300 hover:text-white"
        >
          <ChevronLeft size={18} className="shrink-0" />
          <span className="truncate">{t('meeting.brandTitle')}</span>
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate font-bold">{localizeMeetingRoomText(room.name, language)}</span>
          <span className="shrink-0 tabular-nums text-sm text-gray-400">{formatElapsed(elapsed)}</span>
          {localSharing && (
            <button
              type="button"
              onClick={() => void lk.toggleScreenShare()}
              className="hidden shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700 md:flex"
            >
              <ScreenShareOff size={14} />
              {t('meeting.stopShare')}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-400">
          <Users size={16} />
          {members.length}
        </div>
      </header>

      {/* Body: stage + optional right drawer */}
      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 min-w-0 flex-1 p-3">
          {room.hasVideo ? (
            <VideoStage
              participants={lk.participants}
              activeSpeakerIds={lk.activeSpeakerIds}
              viewMode={viewMode}
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

        {room.hasVideo && chatOpen && (
          <ChatPanel
            messages={messages}
            ownUserId={ownUserId}
            onSend={onSend}
            onClose={() => setChatOpen(false)}
          />
        )}

        {bible.open && (
          <BiblePanel
            view={bible.view}
            bookId={bible.bookId}
            chapter={bible.chapter}
            canLead={bible.canLead}
            hostScroll={bible.hostScroll}
            onReportScroll={bible.reportScroll}
            expanded={bibleExpanded}
            onShowContents={bible.showContents}
            onSelectBook={bible.selectBook}
            onSelectChapter={bible.selectChapter}
            onToggleExpanded={() => setBibleExpanded((v) => !v)}
            onClose={() => { bible.close(); setBibleExpanded(false); }}
          />
        )}

        {membersOpen && (
          <aside className="flex w-1/3 shrink-0 flex-col overflow-hidden border-l border-white/10 bg-gray-900 sm:w-80">
            <MemberList
              users={members}
              isHost={isHost}
              ownUserId={ownUserId}
              onMute={(userId) => onHostCommand({ type: 'host', action: 'mute', targetUserId: userId })}
              onRemove={(userId) => onHostCommand({ type: 'host', action: 'remove', targetUserId: userId })}
            />
          </aside>
        )}
      </div>

      {videoFile && (
        <VideoBroadcastBar
          file={videoFile}
          onReady={lk.startVideoFile}
          onStop={stopVideoFile}
        />
      )}

      <input
        ref={filePickerRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) setVideoFile(picked);
        }}
      />

      <MeetingControlBar
        hasVideo={room.hasVideo}
        micOn={lk.micOn}
        camOn={lk.camOn}
        screenOn={lk.screenOn}
        chatOpen={chatOpen}
        chatBadge={unread}
        membersOpen={membersOpen}
        bibleOpen={bible.open}
        videoFileOn={!!videoFile}
        showViewToggle={room.hasVideo && !screenActive}
        viewMode={viewMode}
        onToggleView={() => setViewMode((v) => (v === 'gallery' ? 'speaker' : 'gallery'))}
        onToggleMic={() => void lk.toggleMic()}
        onToggleCamera={() => void lk.toggleCamera()}
        onToggleScreenShare={() => {
          if (isHost && !lk.screenOn) onHostCommand({ type: 'host', action: 'claimShare' });
          void lk.toggleScreenShare();
        }}
        onToggleChat={() => setChatOpen((v) => !v)}
        onToggleMembers={() => setMembersOpen((v) => !v)}
        onToggleBible={bible.toggle}
        onToggleVideoFile={toggleVideoFile}
        onLeave={onLeave}
      />
    </div>
  );
};

export default MeetingRoomView;

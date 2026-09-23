import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, MessageSquare, Users, ScreenShareOff } from 'lucide-react';
import { localizeMeetingRoomText, type MeetingRoom } from '../../constants/meetingRooms';
import { useLiveKit } from '../../hooks/useLiveKit';
import { useLocalization } from '../../hooks/useLocalization';
import { LiveKitService } from '../../services/livekitService';
import { raisedHandCount } from '../../meeting/raisedHands';
import { microphoneStates } from '../../meeting/participantFlags';
import { troubleByUserId } from '../../meeting/connectionQuality';
import { VideoStage, type ViewMode } from './VideoStage';
import { MeetingControlBar } from './MeetingControlBar';
import { MessageList, type DisplayMessage } from './MessageList';
import { ChatInput } from './ChatInput';
import { ChatPanel } from './ChatPanel';
import { MemberList } from './MemberList';
import type { BibleSync } from '../../hooks/useBibleSync';
import type { RoomVideo } from '../../hooks/useRoomVideo';
import type { JoinMedia } from '../../meeting/joinDefaults';
import type { HostMessage, PresenceUser } from '../../meeting/chatProtocol';
import { BiblePanel } from './BiblePanel';
import { churchAlert, churchConfirm } from '../ChurchDialog';
import { YouTubePromptDialog } from './YouTubePromptDialog';
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
  /** Which devices this person chose to arrive with. */
  joinMedia: JoinMedia;
  /** The room's shared position in the Bible. */
  bible: BibleSync;
  /** The YouTube video the room is watching together. */
  roomVideo: RoomVideo;
  /** Latest command from a host; the seq makes an identical repeat re-fire. */
  hostCommand: { message: HostMessage; seq: number } | null;
  onHostCommand: (message: HostMessage) => void;
  onSend: (text: string) => void;
  onReact: (messageId: string, emoji: string) => void;
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
  room, name, password, messages, members, ownUserId, isHost, joinMedia,
  bible, roomVideo, hostCommand, onHostCommand, onSend, onReact, onLeave,
}) => {
  const { language, t } = useLocalization();
  const lk = useLiveKit(room, name, password, isHost, ownUserId, joinMedia);
  const screenActive = lk.participants.some((p) => LiveKitService.isScreenSharing(p));
  const raisedHands = raisedHandCount(lk.participants);
  // The member list is presence; microphones belong to LiveKit participants.
  const micOn = microphoneStates(lk.participants);
  const connectionTrouble = troubleByUserId(lk.participants);
  /**
   * Sharing an actual screen — not playing a video.
   *
   * A broadcast video goes out on the screen-share source on purpose, so that
   * every viewer's stage promotes it without a second concept. The cost is
   * that isScreenSharing() cannot tell the two apart, and treating a playing
   * video as a screen share sent the stop button down the wrong path: it
   * unpublished the track while the player stayed mounted, which then tried to
   * publish again and was told somebody else was sharing.
   */
  const localSharing = lk.participants.some(
    (p) => p.isLocal && LiveKitService.isScreenSharing(p) && !LiveKitService.isPlayingVideoFile(p),
  );

  /**
   * Somebody else is holding the room's one shared picture.
   *
   * Three things can hold it and only two of them are LiveKit tracks: a screen
   * share, a broadcast video file, and a YouTube video — which travels over the
   * chat socket and so is invisible to shareSlotTaken. A host may take the slot
   * from whoever has it; everybody else waits.
   */
  const slotHeldByOther = lk.shareSlotTaken || (roomVideo.videoId !== null && !roomVideo.canLead);
  const videoDisabled = slotHeldByOther && !isHost;
  const [chatOpen, setChatOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [youtubeOpen, setYoutubeOpen] = useState(false);
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

  // Hanging up always asks first. For a host that question is much heavier —
  // it ends the study for everyone — so it is worded and labelled differently
  // rather than sharing one vague "are you sure".
  const leaveRoom = useCallback(async () => {
    if (!isHost) {
      const confirmed = await churchConfirm(t('meeting.leaveConfirm'), {
        title: t('meeting.leaveTitle'),
        confirmLabel: t('meeting.leaveAction'),
        cancelLabel: t('meeting.cancel'),
      });
      if (confirmed) onLeave();
      return;
    }
    const confirmed = await churchConfirm(t('meeting.endMeetingConfirm'), {
      title: t('meeting.endMeetingTitle'),
      confirmLabel: t('meeting.endMeetingAction'),
      cancelLabel: t('meeting.cancel'),
    });
    if (!confirmed) return;
    onHostCommand({ type: 'host', action: 'endMeeting' });
    onLeave();
  }, [isHost, onHostCommand, onLeave, t]);

  /**
   * Removing somebody is one tap next to a mute button, on a row that shifts
   * as people come and go — exactly the shape of thing that gets pressed by
   * mistake, and the one host command the person cannot undo themselves.
   */
  const removeMember = useCallback(async (userId: string, memberName: string) => {
    const confirmed = await churchConfirm(t('meeting.hostRemoveConfirm').replace('{name}', memberName), {
      title: t('meeting.hostRemoveTitle'),
      confirmLabel: t('meeting.hostRemoveAction'),
      cancelLabel: t('meeting.cancel'),
    });
    if (!confirmed) return;
    onHostCommand({ type: 'host', action: 'remove', targetUserId: userId });
  }, [onHostCommand, t]);

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
    if (command.action === 'endMeeting') {
      onLeave();
      void churchAlert(t('meeting.meetingEndedNotice'), {
        title: t('meeting.meetingEndedTitle'),
        confirmLabel: t('meeting.gotIt'),
      });
      return;
    }
    if (command.action === 'muteAll') {
      if (lk.micOn) void lk.toggleMic();
      return;
    }
    if (command.targetUserId !== ownUserId) return;
    if (command.action === 'mute') {
      if (lk.micOn) void lk.toggleMic();
    } else if (command.action === 'unmute') {
      if (!lk.micOn) void lk.toggleMic();
    } else if (command.action === 'remove') {
      onLeave();
    }
    // `seq` is the trigger: it changes on every command, including a repeat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  const pickLocalVideo = useCallback(() => {
    if (isHost) onHostCommand({ type: 'host', action: 'claimShare' });
    // Reset the value so re-picking the same file still fires onChange.
    if (filePickerRef.current) filePickerRef.current.value = '';
    filePickerRef.current?.click();
  }, [isHost, onHostCommand]);

  const pickYouTubeVideo = useCallback(async () => {
    // Same condition the button is greyed out by: a disabled control and the
    // check behind it must not disagree about who may share.
    if (videoDisabled) { await churchAlert(t('meeting.screenShareBusy')); return; }
    setYoutubeOpen(true);
  }, [videoDisabled, t]);

  const playYouTubeVideo = useCallback((videoId: string, startSeconds?: number) => {
    setYoutubeOpen(false);
    if (isHost) onHostCommand({ type: 'host', action: 'claimShare' });
    roomVideo.open(videoId, startSeconds);
  }, [isHost, onHostCommand, roomVideo]);

  // One button for the shared picture: it stops whatever is playing, or offers
  // the two ways to start something when nothing is.
  const stopSharedVideo = useCallback(() => {
    if (videoFile) { stopVideoFile(); return; }
    roomVideo.close();
  }, [videoFile, stopVideoFile, roomVideo]);

  /**
   * What this person is putting on the room's screen, if anything.
   *
   * One red button covers all three, because from the sharer's side they are
   * one situation — "everyone is looking at something of mine" — and hunting
   * for a different control depending on which kind it is, while the room
   * waits, is the wrong thing to ask of someone mid-sentence.
   */
  const sharing = (videoFile || (roomVideo.videoId !== null && (roomVideo.canLead || isHost)))
    ? { label: t('meeting.videoFileStop'), stop: stopSharedVideo }
    : localSharing
      ? { label: t('meeting.stopShare'), stop: () => void lk.toggleScreenShare() }
      : null;

  // Clear the badge when the chat is opened.
  useEffect(() => { if (chatOpen) setUnread(0); }, [chatOpen]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-950 text-gray-100">
      {/* Top bar */}
      {/*
        Two groups, not three: everything that describes the room on the left,
        the two buttons on the right. The church's name is the first thing to
        go when there is no room for it — on a phone, or on any screen whose
        owner has set a large system font, which no breakpoint can see. What is
        left is what someone in a meeting actually needs: which room, how long,
        and the way to the chat and the member list.
      */}
      <header className="relative flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-gray-900/80 px-3 py-3 sm:gap-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => void leaveRoom()}
            aria-label={t('meeting.brandTitle')}
            className="flex min-w-0 shrink-0 items-center gap-1 text-sm font-semibold text-gray-300 hover:text-white"
          >
            <ChevronLeft size={18} className="shrink-0" />
            <span className="hidden truncate md:inline">{t('meeting.brandTitle')}</span>
          </button>

          {/* In the flow on a phone, where the church's name is hidden and this
              is the first thing you read; centred on anything wider. */}
          <span className="truncate font-bold md:absolute md:left-1/2 md:max-w-[38%] md:-translate-x-1/2 md:-translate-y-1/2 md:top-1/2">
            {localizeMeetingRoomText(room.name, language)}
          </span>
          <span className="shrink-0 tabular-nums text-sm text-gray-400">{formatElapsed(elapsed)}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {sharing && (
            <button
              type="button"
              onClick={sharing.stop}
              aria-label={sharing.label}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700"
            >
              <ScreenShareOff size={14} strokeWidth={1.5} />
              <span className="hidden sm:inline">{sharing.label}</span>
            </button>
          )}

          {room.hasVideo && (
            <button
              type="button"
              onClick={() => setChatOpen((v) => !v)}
              aria-label={t('meeting.chat')}
              aria-pressed={chatOpen}
              className={`relative flex shrink-0 items-center rounded-full px-2 py-1 transition-colors ${
                chatOpen ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <MessageSquare size={16} strokeWidth={1.5} />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-gray-900">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setMembersOpen((v) => !v)}
            aria-label={t('meeting.members')}
            aria-pressed={membersOpen}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-sm transition-colors ${
              membersOpen ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Users size={16} />
            {members.length}
          </button>
        </div>
      </header>

      {/* Body: stage + optional right drawer */}
      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 min-w-0 flex-1 p-2 sm:p-3">
          {room.hasVideo ? (
            <VideoStage
              participants={lk.participants}
              activeSpeakerIds={lk.activeSpeakerIds}
              viewMode={viewMode}
              isHost={isHost}
              onLowerHand={(identity) => void lk.lowerHandOf(identity)}
              roomVideo={roomVideo}
              connecting={lk.connecting}
              error={lk.error}
              errorSeq={lk.errorSeq}
              onRetry={() => void lk.join()}
              onRetryMedia={() => void lk.retryLocalMedia()}
            />
          ) : (
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-gray-900">
              <MessageList messages={messages} ownUserId={ownUserId} onReact={onReact} />
              <ChatInput onSend={onSend} />
            </div>
          )}
        </main>

        {room.hasVideo && chatOpen && (
          <ChatPanel
            messages={messages}
            ownUserId={ownUserId}
            onSend={onSend}
            onReact={onReact}
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
            expanded={bible.expanded}
            onShowContents={bible.showContents}
            onSelectBook={bible.selectBook}
            onSelectChapter={bible.selectChapter}
            onToggleExpanded={bible.toggleExpanded}
            onClose={bible.close}
          />
        )}

        {membersOpen && (
          <aside className="flex w-1/3 shrink-0 flex-col overflow-hidden border-l border-white/10 bg-gray-900 sm:w-80">
            <MemberList
              users={members}
              isHost={isHost}
              ownUserId={ownUserId}
              micOn={micOn}
              connectionTrouble={connectionTrouble}
              onMute={(userId) => onHostCommand({ type: 'host', action: 'mute', targetUserId: userId })}
              onUnmute={(userId) => onHostCommand({ type: 'host', action: 'unmute', targetUserId: userId })}
              onRemove={(userId, memberName) => void removeMember(userId, memberName)}
            />
          </aside>
        )}
      </div>

      {youtubeOpen && (
        <YouTubePromptDialog onCancel={() => setYoutubeOpen(false)} onPlay={playYouTubeVideo} />
      )}

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
        videoFileOn={!!videoFile || roomVideo.videoId !== null}
        canStopSharedVideo={!!videoFile || (roomVideo.videoId !== null && (roomVideo.canLead || isHost))}
        onStopSharedVideo={stopSharedVideo}
        onPickLocalVideo={pickLocalVideo}
        onPickYouTubeVideo={() => void pickYouTubeVideo()}
        videoDisabled={videoDisabled}
        handRaised={lk.handRaised}
        isHost={isHost}
        raisedHands={raisedHands}
        showViewToggle={room.hasVideo && !screenActive}
        viewMode={viewMode}
        onToggleView={() => setViewMode((v) => (v === 'gallery' ? 'speaker' : 'gallery'))}
        onToggleMic={() => void lk.toggleMic()}
        onToggleCamera={() => void lk.toggleCamera()}
        onToggleHand={() => void lk.toggleHand()}
        onLowerAllHands={() => void lk.lowerAllHands()}
        onMuteAll={() => onHostCommand({ type: 'host', action: 'muteAll' })}
        onToggleScreenShare={() => {
          if (isHost && !lk.screenOn) onHostCommand({ type: 'host', action: 'claimShare' });
          void lk.toggleScreenShare();
        }}
        onToggleChat={() => setChatOpen((v) => !v)}
        onToggleMembers={() => setMembersOpen((v) => !v)}
        onToggleBible={bible.toggle}
        onLeave={() => void leaveRoom()}
      />
    </div>
  );
};

export default MeetingRoomView;

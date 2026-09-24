import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';
import { localizeMeetingRoomText, MEETING_ROOMS, type MeetingRoom } from '../../constants/meetingRooms';
import {
  forgetEveryone,
  forgetPassword,
  isValidDisplayName,
  normalizeDisplayName,
  readRemembered,
  remember,
} from './meetingAuth';
import { MeetingSocket } from '../../services/meetingSocket';
import type { BibleMessage, HostMessage, PresenceUser, RoomVideoMessage, ServerMessage } from '../../meeting/chatProtocol';
import { applyReactionToMessages } from '../../meeting/reactions';
import { useBibleSync } from '../../hooks/useBibleSync';
import { useRoomVideo } from '../../hooks/useRoomVideo';
import type { DisplayMessage } from './MessageList';
import { MeetingRoomView } from './MeetingRoomView';
import { MeetingSignIn } from './MeetingSignIn';
import { MeetingJoinDialog } from './MeetingJoinDialog';
import { DesktopRoomPicker } from './DesktopRoomPicker';
import { openAgendaStore } from '../../meeting/agenda/agendaStore';
import { AgendaEditor } from './agenda/AgendaEditor';
import { MeetingDesktopDownload } from './MeetingDesktopDownload';
import { defaultJoinMedia, type JoinMedia } from '../../meeting/joinDefaults';
import PageHeader from '../PageHeader';
import MinistrySecondaryNav from '../MinistrySecondaryNav';
import { MeetingBrowserGuide } from './MeetingBrowserGuide';
import { detectMeetingInAppBrowser } from '../../meeting/inAppBrowser';

export type Stage = 'auth' | 'pick' | 'room';
type RoomWithActivity = MeetingRoom & { activeCount?: number };

interface MeetingPageProps {
  /** Reports the current stage so the shell can hide chrome for the in-room view. */
  onStageChange?: (stage: Stage | null) => void;
}

const readName = (): string => readRemembered().name;

export const MeetingPage: React.FC<MeetingPageProps> = (props) => {
  const [guideBrowser] = useState(() => {
    if (typeof navigator === 'undefined') return null;
    return detectMeetingInAppBrowser(navigator.userAgent);
  });

  if (guideBrowser) {
    return <MeetingBrowserGuide browser={guideBrowser} />;
  }
  return <MeetingPageContent {...props} />;
};

const MeetingPageContent: React.FC<MeetingPageProps> = ({ onStageChange }) => {
  const { language, t } = useLocalization();
  const [stage, setStage] = useState<Stage>('auth');
  const [name, setName] = useState(readName);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  /** Signing back in with what was remembered, before anything is shown. */
  const [restoring, setRestoring] = useState(() => readRemembered().password !== '');

  const [room, setRoom] = useState<MeetingRoom | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [members, setMembers] = useState<PresenceUser[]>([]);
  const [ownUserId, setOwnUserId] = useState<string | null>(null);
  const [pickerRooms, setPickerRooms] = useState<readonly RoomWithActivity[]>(MEETING_ROOMS);
  /** Id of the room whose Host box is ticked; you can only host the room you enter. */
  const [hostFor, setHostFor] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  /** Latest host command, with a sequence so an identical repeat still fires. */
  const [hostCommand, setHostCommand] = useState<{ message: HostMessage; seq: number } | null>(null);
  /** The room whose join dialog is open, before anyone has committed to it. */
  const [pendingRoom, setPendingRoom] = useState<RoomWithActivity | null>(null);
  const [joinMedia, setJoinMedia] = useState<JoinMedia>(() => defaultJoinMedia(0));
  const socketRef = useRef<MeetingSocket | null>(null);
  const [agendaEditorOpen, setAgendaEditorOpen] = useState(false);
  const agendaStore = useMemo(() => openAgendaStore(), []);

  const sendBible = useCallback((message: BibleMessage) => socketRef.current?.sendBible(message), []);
  // A host leads the room through the text; with no host present, anyone may.
  const roomHasHost = members.some((m) => m.isHost);
  const bible = useBibleSync(sendBible, isHost || !roomHasHost);
  const sendRoomVideo = useCallback((message: RoomVideoMessage) => socketRef.current?.sendRoomVideo(message), []);
  // Whoever opened the video leads it; the room object says who that is.
  const roomVideo = useRoomVideo(sendRoomVideo, ownUserId);
  const sendHostCommand = useCallback((message: HostMessage) => socketRef.current?.sendHostCommand(message), []);

  // The socket handler below is built once per room, so it reads the applier
  // through a ref rather than capturing a value that changes every render.
  const applyBibleRef = useRef(bible.apply);
  applyBibleRef.current = bible.apply;
  const applyRoomVideoRef = useRef(roomVideo.apply);
  applyRoomVideoRef.current = roomVideo.apply;

  const closeSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  useEffect(() => () => closeSocket(), [closeSocket]);

  // Let the shell know which stage we are in (so it can hide header/footer for
  // the full-screen in-room view) and reset when the page unmounts.
  useEffect(() => { onStageChange?.(stage); window.meetingDesktop?.setStage(stage); }, [stage, onStageChange]);
  useEffect(() => () => onStageChange?.(null), [onStageChange]);

  useEffect(() => {
    if (stage !== 'pick') return;
    let cancelled = false;

    const loadRooms = async () => {
      try {
        const res = await fetch('/api/meeting/rooms');
        if (!res.ok) return;
        const body = await res.json() as { rooms?: RoomWithActivity[] };
        if (!cancelled && Array.isArray(body.rooms)) {
          setPickerRooms(body.rooms);
        }
      } catch {
        // Keep the built-in room list when the API is unavailable locally.
      }
    };

    void loadRooms();
    const interval = window.setInterval(() => void loadRooms(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [stage]);

  /**
   * Signs back in with the remembered password so a member who ticked the box
   * lands on the room list, not on a password box for a password they were
   * given once in a group chat months ago.
   *
   * A rejection means the church changed the password, so the stored one is
   * dropped. A network failure means nothing of the sort — it is kept and
   * filled in, so one tap retries rather than sending someone hunting for it.
   */
  useEffect(() => {
    const saved = readRemembered();
    if (!saved.password || !isValidDisplayName(saved.name)) { setRestoring(false); return; }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/meeting/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: normalizeDisplayName(saved.name), password: saved.password }),
        });
        if (cancelled) return;
        if (res.ok) {
          setPassword(saved.password);
          setStage('pick');
          return;
        }
        forgetPassword();
      } catch {
        if (!cancelled) setPassword(saved.password);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** Hands the device to somebody else: forget the name and the password. */
  const signOut = useCallback(() => {
    forgetEveryone();
    setName('');
    setPassword('');
    setAuthError('');
    setRememberMe(true);
    setStage('auth');
  }, []);

  const submitAuth = async () => {
    if (!isValidDisplayName(name)) { setAuthError(t('meeting.nameRequired')); return; }
    setVerifying(true);
    setAuthError('');
    try {
      const res = await fetch('/api/meeting/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizeDisplayName(name), password }),
      });
      if (!res.ok) { setAuthError(t('meeting.authError')); return; }
      remember({ name: normalizeDisplayName(name), password }, rememberMe);
      setStage('pick');
    } catch {
      setAuthError(t('meeting.authError'));
    } finally {
      setVerifying(false);
    }
  };

  const enterRoom = useCallback((target: MeetingRoom, media: JoinMedia) => {
    setJoinMedia(media);
    setPendingRoom(null);
    closeSocket();
    setMessages([]);
    setMembers([]);
    setOwnUserId(null);
    setHostCommand(null);
    const asHost = hostFor === target.id;
    setIsHost(asHost);
    setRoom(target);
    setStage('room');

    const socket = new MeetingSocket({
      onMessage: (msg: ServerMessage) => {
        if (msg.type === 'welcome') {
          setOwnUserId(msg.userId);
          setMessages(msg.messages);
        } else if (msg.type === 'message' || msg.type === 'system') {
          setMessages((prev) => [...prev, msg]);
        } else if (msg.type === 'presence') {
          setMembers(msg.users);
        } else if (msg.type === 'bible') {
          applyBibleRef.current(msg);
        } else if (msg.type === 'video') {
          applyRoomVideoRef.current(msg);
        } else if (msg.type === 'reaction') {
          setMessages((prev) => applyReactionToMessages(prev, msg));
        } else if (msg.type === 'host') {
          setHostCommand((prev) => ({ message: msg, seq: (prev?.seq ?? 0) + 1 }));
        }
      },
      onClose: ({ authFailed }) => {
        if (authFailed) { setStage('auth'); setAuthError(t('meeting.authError')); }
      },
    });
    socket.connect({ roomId: target.id, name: normalizeDisplayName(name), password, isHost: asHost });
    socketRef.current = socket;
  }, [closeSocket, hostFor, name, password, t]);

  const leaveRoom = () => { closeSocket(); setRoom(null); setStage('pick'); };
  const send = (text: string) => socketRef.current?.send(text);
  const react = (messageId: string, emoji: string) =>
    socketRef.current?.sendReaction({ type: 'reaction', messageId, emoji });

  // Nothing but a quiet page while the remembered password is checked: showing
  // the form first would make it flash up and vanish a moment later.
  if (stage === 'auth' && restoring) {
    return <div className="min-h-screen bg-white" aria-busy="true" />;
  }

  if (stage === 'auth') {
    return (
      <MeetingSignIn
        name={name}
        password={password}
        error={authError}
        verifying={verifying}
        onNameChange={(v) => { setName(v); setAuthError(''); }}
        onPasswordChange={(v) => { setPassword(v); setAuthError(''); }}
        remember={rememberMe}
        onRememberChange={setRememberMe}
        onSubmit={() => void submitAuth()}
      />
    );
  }

  const joinDialog = pendingRoom && (
    <MeetingJoinDialog
      roomName={localizeMeetingRoomText(pendingRoom.name, language)}
      activeCount={pendingRoom.activeCount}
      onCancel={() => setPendingRoom(null)}
      onJoin={(media) => enterRoom(pendingRoom, media)}
    />
  );

  if (stage === 'pick' && window.meetingDesktop) {
    return (
      <>
        <DesktopRoomPicker
          rooms={pickerRooms}
          name={name}
          hostFor={hostFor}
          onHostForChange={setHostFor}
          onJoin={(r) => (r.hasVideo ? setPendingRoom(r) : enterRoom(r, { camOn: false, micOn: false }))}
          onSignOut={signOut}
          onOpenAgenda={() => setAgendaEditorOpen(true)}
        />
        {joinDialog}
        {agendaEditorOpen && <AgendaEditor store={agendaStore} onClose={() => setAgendaEditorOpen(false)} />}
      </>
    );
  }

  if (stage === 'pick') {
    return (
      <div className="min-h-screen bg-white">
        <PageHeader title={t('eventsPage.navOnlineBibleStudy')} subtitle={t('meeting.pickRoom')} />
        <MinistrySecondaryNav active="online-bible-study" />
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-16">
          <div className="relative mb-2 flex items-center justify-center">
            <h2 className="text-center text-2xl font-bold text-gray-800 sm:text-3xl">{t('meeting.pickPrompt')}</h2>
            <button type="button" onClick={() => setAgendaEditorOpen(true)}
              className="absolute right-0 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
              <ClipboardList size={16} />{t('meeting.agendaTitle')}
            </button>
          </div>
          <p className="mb-6 text-center text-sm text-gray-500 sm:mb-10">
            {name}
            <button
              type="button"
              onClick={signOut}
              className="ml-2 font-semibold text-blue-600 underline-offset-2 hover:underline"
            >
              {t('meeting.switchUser')}
            </button>
          </p>
          <div className="grid gap-5 md:grid-cols-2 md:gap-8">
            {pickerRooms.map((r) => (
              <div
                key={r.id}
                className={`relative overflow-hidden rounded-lg border bg-white shadow-lg transition-transform duration-300 hover:-translate-y-1 ${
                  (r.activeCount ?? 0) > 0 ? 'border-blue-500 ring-1 ring-blue-500/20' : 'border-transparent'
                }`}
              >
                {(r.activeCount ?? 0) > 0 && (
                  <div className="absolute right-4 top-4 z-10 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow">
                    {t('meeting.inProgress')}
                  </div>
                )}
                <img src={r.imageUrl} alt={localizeMeetingRoomText(r.name, language)} className="h-36 w-full object-cover sm:h-48" />
                <div className="flex min-h-24 items-center justify-between gap-4 p-4 sm:min-h-28 sm:p-6">
                  <div className="min-w-0">
                    <h3 className="mb-1 text-lg font-bold text-gray-900 sm:mb-2 sm:text-xl">{localizeMeetingRoomText(r.name, language)}</h3>
                    <p className="text-gray-600">{localizeMeetingRoomText(r.schedule, language)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-gray-700">
                      <input
                        type="checkbox"
                        checked={hostFor === r.id}
                        onChange={(e) => setHostFor(e.target.checked ? r.id : null)}
                        className="h-4 w-4 cursor-pointer rounded border-gray-400 text-blue-600 focus:ring-blue-500"
                      />
                      {t('meeting.host')}
                    </label>
                    <button
                      type="button"
                      onClick={() => (r.hasVideo ? setPendingRoom(r) : enterRoom(r, { camOn: false, micOn: false }))}
                      className="rounded-lg bg-gray-800 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      {t('meeting.join')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <MeetingDesktopDownload />
        </div>

        {joinDialog}
        {agendaEditorOpen && <AgendaEditor store={agendaStore} onClose={() => setAgendaEditorOpen(false)} />}
      </div>
    );
  }

  return room ? (
    <div className="fixed inset-0 z-50 bg-gray-950">
      <MeetingRoomView
        key={room.id}
        room={room}
        name={normalizeDisplayName(name)}
        password={password}
        messages={messages}
        members={members}
        ownUserId={ownUserId}
        isHost={isHost}
        joinMedia={joinMedia}
        bible={bible}
        roomVideo={roomVideo}
        hostCommand={hostCommand}
        onHostCommand={sendHostCommand}
        onSend={send}
        onReact={react}
        onLeave={leaveRoom}
      />
    </div>
  ) : null;
};

export default MeetingPage;

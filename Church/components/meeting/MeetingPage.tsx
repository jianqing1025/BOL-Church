import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalization } from '../../hooks/useLocalization';
import { MEETING_ROOMS, type MeetingRoom } from '../../constants/meetingRooms';
import { isValidDisplayName, normalizeDisplayName, MEETING_NAME_KEY } from './meetingAuth';
import { MeetingSocket } from '../../services/meetingSocket';
import type { ServerMessage } from '../../meeting/chatProtocol';
import type { DisplayMessage } from './MessageList';
import { MeetingRoomView } from './MeetingRoomView';
import { MeetingSignIn } from './MeetingSignIn';

export type Stage = 'auth' | 'pick' | 'room';
type RoomWithActivity = MeetingRoom & { activeCount?: number; imageUrl?: string; schedule?: string };

interface MeetingPageProps {
  /** Reports the current stage so the shell can hide chrome for the in-room view. */
  onStageChange?: (stage: Stage | null) => void;
}

const readName = (): string => {
  try { return localStorage.getItem(MEETING_NAME_KEY) || ''; } catch { return ''; }
};

export const MeetingPage: React.FC<MeetingPageProps> = ({ onStageChange }) => {
  const { t } = useLocalization();
  const [stage, setStage] = useState<Stage>('auth');
  const [name, setName] = useState(readName);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const [room, setRoom] = useState<MeetingRoom | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [ownUserId, setOwnUserId] = useState<string | null>(null);
  const [pickerRooms, setPickerRooms] = useState<readonly RoomWithActivity[]>(MEETING_ROOMS);
  const socketRef = useRef<MeetingSocket | null>(null);

  const closeSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  useEffect(() => () => closeSocket(), [closeSocket]);

  // Let the shell know which stage we are in (so it can hide header/footer for
  // the full-screen in-room view) and reset when the page unmounts.
  useEffect(() => { onStageChange?.(stage); }, [stage, onStageChange]);
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
      try { localStorage.setItem(MEETING_NAME_KEY, normalizeDisplayName(name)); } catch { /* ignore */ }
      setStage('pick');
    } catch {
      setAuthError(t('meeting.authError'));
    } finally {
      setVerifying(false);
    }
  };

  const enterRoom = useCallback((target: MeetingRoom) => {
    closeSocket();
    setMessages([]);
    setMembers([]);
    setOwnUserId(null);
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
        }
      },
      onClose: ({ authFailed }) => {
        if (authFailed) { setStage('auth'); setAuthError(t('meeting.authError')); }
      },
    });
    socket.connect({ roomId: target.id, name: normalizeDisplayName(name), password });
    socketRef.current = socket;
  }, [closeSocket, name, password, t]);

  const leaveRoom = () => { closeSocket(); setRoom(null); setStage('pick'); };
  const send = (text: string) => socketRef.current?.send(text);

  if (stage === 'auth') {
    return (
      <MeetingSignIn
        name={name}
        password={password}
        error={authError}
        verifying={verifying}
        onNameChange={(v) => { setName(v); setAuthError(''); }}
        onPasswordChange={(v) => { setPassword(v); setAuthError(''); }}
        onSubmit={() => void submitAuth()}
      />
    );
  }

  if (stage === 'pick') {
    return (
      <div className="min-h-[70vh] bg-white px-4 py-8 sm:px-6 sm:py-16">
        <div className="mx-auto w-full max-w-5xl">
          <h2 className="mb-6 text-center text-2xl font-bold text-gray-800 sm:mb-10 sm:text-3xl">{t('meeting.pickRoom')}</h2>
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
                    正在聚会
                  </div>
                )}
                <img src={r.imageUrl} alt={r.name} className="h-36 w-full object-cover sm:h-48" />
                <div className="flex min-h-24 items-center justify-between gap-4 p-4 sm:min-h-28 sm:p-6">
                  <div className="min-w-0">
                    <h3 className="mb-1 text-lg font-bold text-gray-900 sm:mb-2 sm:text-xl">{r.name}</h3>
                    <p className="text-gray-600">{r.schedule}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => enterRoom(r)}
                    className="shrink-0 rounded-lg bg-gray-800 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    加入
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
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
        onSend={send}
        onLeave={leaveRoom}
      />
    </div>
  ) : null;
};

export default MeetingPage;

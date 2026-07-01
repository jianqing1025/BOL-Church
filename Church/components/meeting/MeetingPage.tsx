import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Video } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';
import { MEETING_ROOMS, type MeetingRoom } from '../../constants/meetingRooms';
import { isValidDisplayName, normalizeDisplayName, MEETING_NAME_KEY } from './meetingAuth';
import { MeetingSocket } from '../../services/meetingSocket';
import type { ServerMessage } from '../../meeting/chatProtocol';
import type { DisplayMessage } from './MessageList';
import { MeetingRoomView } from './MeetingRoomView';

type Stage = 'auth' | 'pick' | 'room';

const readName = (): string => {
  try { return localStorage.getItem(MEETING_NAME_KEY) || ''; } catch { return ''; }
};

export const MeetingPage: React.FC = () => {
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
  const socketRef = useRef<MeetingSocket | null>(null);

  const closeSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  useEffect(() => () => closeSocket(), [closeSocket]);

  // Screen 1: verify name + password with the server.
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

  // Screen 2 → room: open the chat socket.
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

  // ── Screen 1: auth ──
  if (stage === 'auth') {
    return (
      <div className="flex h-full items-center justify-center bg-gray-950 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-gray-900 p-8 shadow-2xl">
          <h1 className="mb-6 text-center text-2xl font-bold text-white">{t('meeting.pageTitle')}</h1>
          <input
            type="text" value={name} maxLength={30}
            onChange={(e) => { setName(e.target.value); setAuthError(''); }}
            placeholder={t('meeting.authName')}
            className="mb-3 w-full rounded-lg border border-white/15 bg-gray-800 px-4 py-3 text-sm text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="password" value={password}
            onChange={(e) => { setPassword(e.target.value); setAuthError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void submitAuth(); }}
            placeholder={t('meeting.authPassword')}
            className="mb-3 w-full rounded-lg border border-white/15 bg-gray-800 px-4 py-3 text-sm text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
          />
          {authError && <div className="mb-3 text-sm font-medium text-red-400">{authError}</div>}
          <button
            type="button" onClick={() => void submitAuth()} disabled={verifying}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {t('meeting.authEnter')}
          </button>
        </div>
      </div>
    );
  }

  // ── Screen 2: room picker ──
  if (stage === 'pick') {
    return (
      <div className="flex h-full items-center justify-center bg-gray-950 px-6">
        <div className="w-full max-w-2xl">
          <h2 className="mb-6 text-center text-xl font-bold text-white">{t('meeting.pickRoom')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {MEETING_ROOMS.map((r) => (
              <button
                key={r.id} type="button" onClick={() => enterRoom(r)}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-gray-900 p-5 text-left transition-colors hover:border-blue-500/60 hover:bg-gray-800"
              >
                <span className="font-bold text-white">{r.name}</span>
                {r.hasVideo && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-green-400">
                    <Video size={14} /> {t('meeting.videoRoom')}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Connected room ──
  return room ? (
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
  ) : null;
};

export default MeetingPage;

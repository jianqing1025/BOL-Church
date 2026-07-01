import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalization } from '../../hooks/useLocalization';
import { MEETING_ROOMS, type MeetingRoom } from '../../constants/meetingRooms';
import { isValidDisplayName, normalizeDisplayName, MEETING_NAME_KEY } from './meetingAuth';
import { MeetingSocket } from '../../services/meetingSocket';
import type { ServerMessage } from '../../meeting/chatProtocol';
import { RoomList } from './RoomList';
import { MessageList, type DisplayMessage } from './MessageList';
import { MemberList } from './MemberList';
import { ChatInput } from './ChatInput';
import { VideoPanel } from './VideoPanel';

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
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
          <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">{t('meeting.pageTitle')}</h1>
          <input
            type="text" value={name} maxLength={30}
            onChange={(e) => { setName(e.target.value); setAuthError(''); }}
            placeholder={t('meeting.authName')}
            className="mb-3 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <input
            type="password" value={password}
            onChange={(e) => { setPassword(e.target.value); setAuthError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void submitAuth(); }}
            placeholder={t('meeting.authPassword')}
            className="mb-3 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          {authError && <div className="mb-3 text-sm font-medium text-red-600">{authError}</div>}
          <button
            type="button" onClick={() => void submitAuth()} disabled={verifying}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
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
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h2 className="mb-6 text-center text-xl font-bold text-gray-900">{t('meeting.pickRoom')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {MEETING_ROOMS.map((r) => (
            <button
              key={r.id} type="button" onClick={() => enterRoom(r)}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm hover:shadow-md"
            >
              <span className="font-bold text-gray-900">{r.name}</span>
              {r.hasVideo && <span className="text-xs font-semibold text-green-600">● 视频</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Connected room ──
  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-6xl flex-col gap-3 p-3 md:flex-row">
      <aside className="md:w-48 md:shrink-0">
        <button type="button" onClick={leaveRoom} className="mb-2 text-sm font-semibold text-blue-600 hover:underline">
          ← {t('meeting.changeRoom')}
        </button>
        <RoomList rooms={MEETING_ROOMS} activeId={room?.id ?? null} onSelect={enterRoom} />
      </aside>

      <section className="flex min-h-0 flex-1 flex-col gap-3">
        {room && <div className="h-56 shrink-0 md:h-72"><VideoPanel room={room} name={normalizeDisplayName(name)} password={password} /></div>}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
          <MessageList messages={messages} ownUserId={ownUserId} />
          <ChatInput onSend={send} />
        </div>
      </section>

      <aside className="rounded-lg border border-gray-200 bg-white md:w-56 md:shrink-0">
        <MemberList users={members} />
      </aside>
    </div>
  );
};

export default MeetingPage;

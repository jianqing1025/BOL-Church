import { useCallback, useEffect, useRef, useState } from 'react';
import type { Participant } from 'livekit-client';
import { LiveKitService } from '../services/livekitService';
import { useLocalization } from './useLocalization';
import type { MeetingRoom } from '../constants/meetingRooms';

export interface UseLiveKit {
  participants: Participant[];
  connecting: boolean;
  joined: boolean;
  error: string;
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  join: () => Promise<void>;
  leave: () => void;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
}

/**
 * Owns a single LiveKitService connection for one meeting room and exposes the
 * React state a control bar needs. Auto-joins video-enabled rooms on mount and
 * disconnects on unmount. Callers should key the consuming component by room id
 * so a room switch remounts and tears the connection down cleanly.
 */
export function useLiveKit(room: MeetingRoom, name: string, password: string): UseLiveKit {
  const { t } = useLocalization();
  const serviceRef = useRef<LiveKitService | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);

  const join = useCallback(async () => {
    if (!room.hasVideo || serviceRef.current) return;
    setConnecting(true);
    setError('');
    const service = new LiveKitService({
      onParticipantsChanged: (p) => setParticipants([...p]),
      onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    });
    serviceRef.current = service;
    try {
      await service.connect({ roomId: room.id, name, password });
      setJoined(true);
      setMicOn(service.localParticipant?.isMicrophoneEnabled ?? true);
      setCamOn(service.localParticipant?.isCameraEnabled ?? true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      service.disconnect();
      serviceRef.current = null;
    } finally {
      setConnecting(false);
    }
  }, [room.hasVideo, room.id, name, password]);

  const leave = useCallback(() => {
    serviceRef.current?.disconnect();
    serviceRef.current = null;
    setJoined(false);
    setParticipants([]);
  }, []);

  const toggleMic = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    try {
      setError('');
      setMicOn(await svc.toggleMic());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMicOn(svc.localParticipant?.isMicrophoneEnabled ?? false);
    }
  }, []);

  const toggleCamera = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    try {
      setError('');
      setCamOn(await svc.toggleCamera());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCamOn(svc.localParticipant?.isCameraEnabled ?? false);
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    const localSharing = svc.localParticipant?.isScreenShareEnabled ?? false;
    // Only one participant may share at a time. Block starting a new share while
    // any remote participant is already sharing.
    if (!localSharing && participants.some((p) => !p.isLocal && LiveKitService.isScreenSharing(p))) {
      setError(t('meeting.screenShareBusy'));
      return;
    }
    try {
      setError('');
      setScreenOn(await svc.toggleScreenShare());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setScreenOn(svc.localParticipant?.isScreenShareEnabled ?? false);
    }
  }, [participants, t]);

  // Auto-join video rooms on mount; always disconnect on unmount / room change.
  useEffect(() => {
    if (room.hasVideo) void join();
    return () => {
      serviceRef.current?.disconnect();
      serviceRef.current = null;
    };
  }, [room.hasVideo, join]);

  return { participants, connecting, joined, error, micOn, camOn, screenOn, join, leave, toggleMic, toggleCamera, toggleScreenShare };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Participant } from 'livekit-client';
import { LiveKitService } from '../services/livekitService';
import { useLocalization } from './useLocalization';
import type { MeetingRoom } from '../constants/meetingRooms';
import { churchPermissionConfirm } from '../components/ChurchDialog';

export interface UseLiveKit {
  participants: Participant[];
  activeSpeakerIds: string[];
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

type BrowserPermissionName = 'camera' | 'microphone';

const permissionState = async (name: BrowserPermissionName): Promise<PermissionState | null> => {
  try {
    const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!permissions?.query) return null;
    const status = await permissions.query({ name: name as PermissionName });
    return status.state;
  } catch {
    return null;
  }
};

const needsPermissionIntro = async (names: BrowserPermissionName[]): Promise<boolean> => {
  const states = await Promise.all(names.map(permissionState));
  return states.some((state) => state !== 'granted');
};

/**
 * Owns a single LiveKitService connection for one meeting room and exposes the
 * React state a control bar needs. Auto-joins video-enabled rooms on mount and
 * disconnects on unmount. Callers should key the consuming component by room id
 * so a room switch remounts and tears the connection down cleanly.
 */
export function useLiveKit(room: MeetingRoom, name: string, password: string): UseLiveKit {
  const { t } = useLocalization();
  const serviceRef = useRef<LiveKitService | null>(null);
  const joiningRef = useRef(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);

  const confirmPermission = useCallback((messageKey: string) => churchPermissionConfirm(t(messageKey), {
    title: t('meeting.permissionTitle'),
    confirmLabel: t('meeting.permissionContinue'),
    cancelLabel: t('meeting.permissionCancel'),
  }), [t]);

  const join = useCallback(async () => {
    // joiningRef blocks re-entry synchronously — before the first await — so the
    // permission dialog (awaited below) can't be enqueued more than once and we
    // never open a second LiveKit connection with the same identity.
    if (!room.hasVideo || serviceRef.current || joiningRef.current) return;
    joiningRef.current = true;
    setConnecting(true);
    setError('');
    try {
      if (await needsPermissionIntro(['microphone', 'camera'])) {
        const allowed = await confirmPermission('meeting.mediaPermissionMessage');
        if (!allowed) return;
      }
      const service = new LiveKitService({
        onParticipantsChanged: (p) => setParticipants([...p]),
        onActiveSpeakersChanged: (ids) => setActiveSpeakerIds(ids),
        onError: (e) => setError(e instanceof Error ? e.message : String(e)),
      });
      serviceRef.current = service;
      await service.connect({ roomId: room.id, name, password });
      setJoined(true);
      setMicOn(service.localParticipant?.isMicrophoneEnabled ?? true);
      setCamOn(service.localParticipant?.isCameraEnabled ?? true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      serviceRef.current?.disconnect();
      serviceRef.current = null;
    } finally {
      joiningRef.current = false;
      setConnecting(false);
    }
  }, [room.hasVideo, room.id, name, password, confirmPermission]);

  const leave = useCallback(() => {
    serviceRef.current?.disconnect();
    serviceRef.current = null;
    setActiveSpeakerIds([]);
    setJoined(false);
    setParticipants([]);
  }, []);

  const toggleMic = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    try {
      setError('');
      if (!svc.localParticipant?.isMicrophoneEnabled && await needsPermissionIntro(['microphone'])) {
        const allowed = await confirmPermission('meeting.microphonePermissionMessage');
        if (!allowed) return;
      }
      setMicOn(await svc.toggleMic());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMicOn(svc.localParticipant?.isMicrophoneEnabled ?? false);
    }
  }, [confirmPermission]);

  const toggleCamera = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    try {
      setError('');
      if (!svc.localParticipant?.isCameraEnabled && await needsPermissionIntro(['camera'])) {
        const allowed = await confirmPermission('meeting.cameraPermissionMessage');
        if (!allowed) return;
      }
      setCamOn(await svc.toggleCamera());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCamOn(svc.localParticipant?.isCameraEnabled ?? false);
    }
  }, [confirmPermission]);

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
      if (!localSharing) {
        const allowed = await confirmPermission('meeting.screenPermissionMessage');
        if (!allowed) return;
      }
      setScreenOn(await svc.toggleScreenShare());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setScreenOn(svc.localParticipant?.isScreenShareEnabled ?? false);
    }
  }, [participants, t, confirmPermission]);

  // Keep a live ref to join so the auto-join effect need not depend on its
  // (intentionally unstable) identity — depending on `join` would re-run the
  // effect every render and spawn duplicate connections.
  const joinRef = useRef(join);
  joinRef.current = join;

  // Auto-join video rooms once on mount; disconnect on unmount / room change.
  useEffect(() => {
    if (room.hasVideo) void joinRef.current();
    return () => {
      serviceRef.current?.disconnect();
      serviceRef.current = null;
    };
  }, [room.hasVideo]);

  return { participants, activeSpeakerIds, connecting, joined, error, micOn, camOn, screenOn, join, leave, toggleMic, toggleCamera, toggleScreenShare };
}

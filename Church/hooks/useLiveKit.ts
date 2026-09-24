import { useCallback, useEffect, useRef, useState } from 'react';
import type { Participant } from 'livekit-client';
import { LiveKitJoinError, LiveKitService } from '../services/livekitService';
import { handRaisedAt } from '../meeting/raisedHands';
import { useLocalization } from './useLocalization';
import type { MeetingRoom } from '../constants/meetingRooms';
import { churchPermissionConfirm } from '../components/ChurchDialog';
import { classifyCameraError, classifyMediaError } from '../services/mediaErrors';
import { needsPermissionIntro } from '../meeting/mediaPermission';
import type { JoinMedia } from '../meeting/joinDefaults';

export interface UseLiveKit {
  participants: Participant[];
  activeSpeakerIds: string[];
  connecting: boolean;
  /** The meeting dropped and is being rejoined; the stage keeps its picture meanwhile. */
  reconnecting: boolean;
  joined: boolean;
  error: string;
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  /** True while this participant is broadcasting a video file to the room. */
  videoFileOn: boolean;
  /** Changes on every error report, so a repeat of the same words still shows. */
  errorSeq: number;
  /** True while this participant has a hand up. */
  handRaised: boolean;
  join: (options?: { rejoin?: boolean }) => Promise<void>;
  leave: () => void;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  /** Ask for the camera and mic again, straight from a button press. */
  retryLocalMedia: () => Promise<void>;
  toggleHand: () => Promise<void>;
  /** Host: ask one participant to put their hand down. */
  lowerHandOf: (identity: string) => Promise<void>;
  /** Host: ask the whole room to put their hands down. */
  lowerAllHands: () => Promise<void>;
  /** Publish a playing <video> element to the room. Resolves false if blocked. */
  startVideoFile: (element: HTMLVideoElement) => Promise<boolean>;
  stopVideoFile: () => Promise<void>;
  /** True when someone else already holds the shared-picture slot. */
  shareSlotTaken: boolean;
}

/**
 * Owns a single LiveKitService connection for one meeting room and exposes the
 * React state a control bar needs. Auto-joins video-enabled rooms on mount and
 * disconnects on unmount. Callers should key the consuming component by room id
 * so a room switch remounts and tears the connection down cleanly.
 *
 * A host is allowed to take the shared-picture slot from whoever holds it; for
 * everyone else it stays first-come, first-served.
 */
export function useLiveKit(
  room: MeetingRoom,
  name: string,
  password: string,
  isHost = false,
  ownUserId: string | null = null,
  media: JoinMedia = { camOn: true, micOn: true },
): UseLiveKit {
  const { t } = useLocalization();
  const serviceRef = useRef<LiveKitService | null>(null);
  const joiningRef = useRef(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  /** Set on unmount, so a retry sleeping in the background does not join a room nobody is in. */
  const disposedRef = useRef(false);
  const [joined, setJoined] = useState(false);
  /**
   * Kept with a sequence because the banner showing it hides itself after a
   * few seconds: a second failure worded exactly like the first still has to
   * bring it back, and identical state alone would not re-render anything.
   */
  const [errorState, setErrorState] = useState({ text: '', seq: 0 });
  const error = errorState.text;
  const setError = useCallback((text: string) => {
    setErrorState((prev) => ({ text, seq: prev.seq + 1 }));
  }, []);
  const [micOn, setMicOn] = useState(window.meetingDesktop ? media.micOn : true);
  const [camOn, setCamOn] = useState(window.meetingDesktop ? media.camOn : true);

  const [videoFileOn, setVideoFileOn] = useState(false);

  // The shared-picture slot holds either a screen share or a broadcast video —
  // one at a time, room-wide — so both features consult the same check.
  const shareSlotTaken = participants.some((p) => !p.isLocal && LiveKitService.isScreenSharing(p));

  // Derived rather than stored: a host can lower this hand from the other side
  // of the room, and a separate piece of state would quietly fall out of step.
  const handRaised = participants.some((p) => p.isLocal && handRaisedAt(p) !== null);

  /**
   * Also derived, and for a sharper reason: the browser puts its own "Stop
   * sharing" bar on screen whenever a page captures the display, and a page
   * cannot remove it. Somebody who stops there leaves stored state saying the
   * share is still on — and the next press of our own button, computed from
   * that stale value, would start a second share instead of ending one.
   */
  const screenOn = participants.some((p) => p.isLocal && LiveKitService.isScreenSharing(p));
  const desktopSharing = screenOn && !participants.some((p) => p.isLocal && LiveKitService.isPlayingVideoFile(p));
  useEffect(() => { window.meetingDesktop?.setSharing(desktopSharing); }, [desktopSharing]);
  useEffect(() => () => { window.meetingDesktop?.setSharing(false); }, []);

  const confirmPermission = useCallback((messageKey: string) => churchPermissionConfirm(t(messageKey), {
    title: t('meeting.permissionTitle'),
    confirmLabel: t('meeting.permissionContinue'),
    cancelLabel: t('meeting.permissionCancel'),
  }), [t]);

  // Read at rejoin time, when the closure that scheduled it is long stale.
  const devicesRef = useRef({ micOn, camOn });
  devicesRef.current = { micOn, camOn };
  const connectionLostRef = useRef<() => void>(() => undefined);

  /**
   * Joins the room's video, trying up to three times before saying anything.
   *
   * Each attempt asks for a new token, and so a new identity. That is the
   * point: LiveKit's own recovery reuses the old identity, and the server
   * refuses a second session under a name it still holds ("could not restart
   * participant") — which is what people saw as "could not establish signal
   * connection". A fresh identity is never refused that way.
   *
   * `rejoin` is the meeting coming back after a dropped connection: no device
   * capture up front (nobody tapped anything), the devices that were on are
   * turned back on after connecting, and the stage keeps showing the room.
   */
  const join = useCallback(async ({ rejoin = false }: { rejoin?: boolean } = {}) => {
    // joiningRef blocks re-entry synchronously — before the first await — so the
    // permission dialog (awaited below) can't be enqueued more than once and we
    // never open a second LiveKit connection with the same identity.
    if (!room.hasVideo || serviceRef.current || joiningRef.current) return;
    joiningRef.current = true;
    if (!rejoin) setConnecting(true);
    setError('');
    const devices = rejoin ? devicesRef.current : null;
    let stream: MediaStream | null = null;
    try {
      // Capture before any network call. Safari on iOS grants the camera only
      // while the tap that got us here still counts, and the token fetch plus
      // the WebRTC connect below would spend that window. A failure here is
      // reported but must not stop the join — joining muted beats not joining.
      if (!rejoin) {
        try {
          stream = await LiveKitService.captureLocalMedia(
            window.meetingDesktop ? media : undefined,
            (e) => setError(t(classifyCameraError(e))),
          );
          if (window.meetingDesktop && media.micOn && stream && stream.getAudioTracks().length === 0) setError(t('meeting.microphoneNotFound'));
        } catch (e) {
          setError(t(classifyCameraError(e)));
          setMicOn(false);
          setCamOn(false);
        }
      }

      for (let attempt = 0; ; attempt++) {
        const service = new LiveKitService({
          onParticipantsChanged: (p) => setParticipants([...p]),
          onActiveSpeakersChanged: (ids) => setActiveSpeakerIds(ids),
          onError: (e) => setError(e instanceof Error ? e.message : String(e)),
          onReconnecting: setReconnecting,
          onConnectionLost: () => connectionLostRef.current(),
        });
        serviceRef.current = service;
        // A capture whose tracks died with a failed attempt cannot be published again.
        const usable = stream && stream.getTracks().every((track) => track.readyState === 'live') ? stream : null;
        try {
          await service.connect({ roomId: room.id, name, password, stream: usable, isHost, media: devices ?? media });
          if (devices) await service.restoreDevices(devices);
          break;
        } catch (e) {
          service.disconnect();
          serviceRef.current = null;
          const retryable = !(e instanceof LiveKitJoinError) || e.retryable;
          if (disposedRef.current) return;
          if (!retryable || attempt >= 2) throw e;
          await new Promise((resolve) => window.setTimeout(resolve, 1000 * 2 ** attempt));
          if (disposedRef.current) return;
        }
      }
      setJoined(true);
      setMicOn(serviceRef.current?.localParticipant?.isMicrophoneEnabled ?? false);
      setCamOn(serviceRef.current?.localParticipant?.isCameraEnabled ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      serviceRef.current?.disconnect();
      serviceRef.current = null;
      // Never published, so nothing else will ever stop it: left running, our
      // own capture is what would keep the camera "in use" for the next try.
      stream?.getTracks().forEach((track) => track.stop());
      // Back to "not joined", so the stage offers the join button again.
      setParticipants([]);
      setJoined(false);
    } finally {
      joiningRef.current = false;
      setConnecting(false);
      if (rejoin) setReconnecting(false);
    }
    // media is read once, at the join it belongs to; a later change to the
    // boxes on the picker must not reach back into a meeting already running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.hasVideo, room.id, name, password, isHost, confirmPermission, t]);

  // A dropped meeting rejoins by itself, as a new participant.
  connectionLostRef.current = () => {
    if (disposedRef.current) return;
    const lost = serviceRef.current;
    serviceRef.current = null;
    lost?.disconnect();
    setReconnecting(true);
    void join({ rejoin: true });
  };

  const retryLocalMedia = useCallback(async () => {
    const svc = serviceRef.current;
    // No connection at all: the only useful retry is joining.
    if (!svc) { await joinRef.current(); return; }
    try {
      setError('');
      const stream = await LiveKitService.captureLocalMedia(undefined, (e) => setError(t(classifyCameraError(e))));
      if (stream) await svc.publishLocalMedia(stream);
      setMicOn(svc.localParticipant?.isMicrophoneEnabled ?? false);
      setCamOn(svc.localParticipant?.isCameraEnabled ?? false);
    } catch (e) {
      setError(t(classifyMediaError(e)));
    }
  }, [t]);

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
      if (!window.meetingDesktop && !svc.localParticipant?.isMicrophoneEnabled && await needsPermissionIntro(['microphone'])) {
        const allowed = await confirmPermission('meeting.microphonePermissionMessage');
        if (!allowed) return;
      }
      setMicOn(await svc.toggleMic());
    } catch (e) {
      setError(t(classifyMediaError(e) === 'meeting.mediaNotFound' ? 'meeting.microphoneNotFound' : classifyMediaError(e)));
      setMicOn(svc.localParticipant?.isMicrophoneEnabled ?? false);
    }
  }, [confirmPermission, t]);

  const toggleCamera = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    try {
      setError('');
      if (!window.meetingDesktop && !svc.localParticipant?.isCameraEnabled && await needsPermissionIntro(['camera'])) {
        const allowed = await confirmPermission('meeting.cameraPermissionMessage');
        if (!allowed) return;
      }
      setCamOn(await svc.toggleCamera());
    } catch (e) {
      setError(t(classifyCameraError(e)));
      setCamOn(svc.localParticipant?.isCameraEnabled ?? false);
    }
  }, [confirmPermission, t]);

  const runOnService = useCallback(async (action: (svc: LiveKitService) => Promise<unknown>) => {
    const svc = serviceRef.current;
    if (!svc) return;
    try {
      setError('');
      await action(svc);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const toggleHand = useCallback(() => runOnService((svc) => svc.toggleHand()), [runOnService]);
  const lowerHandOf = useCallback(
    (identity: string) => runOnService((svc) => svc.lowerHandOf(identity)),
    [runOnService],
  );
  const lowerAllHands = useCallback(() => runOnService((svc) => svc.lowerAllHands()), [runOnService]);

  const toggleScreenShare = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    const localSharing = svc.localParticipant?.isScreenShareEnabled ?? false;
    // Only one participant may share at a time. Block starting a new share while
    // any remote participant is already sharing.
    if (!localSharing && shareSlotTaken && !isHost) {
      setError(t('meeting.screenShareBusy'));
      return;
    }
    try {
      setError('');
      if (!localSharing && !window.meetingDesktop) {
        const allowed = await confirmPermission('meeting.screenPermissionMessage');
        if (!allowed) return;
      }
      await svc.toggleScreenShare();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [shareSlotTaken, isHost, t, confirmPermission]);

  const startVideoFile = useCallback(async (element: HTMLVideoElement): Promise<boolean> => {
    const svc = serviceRef.current;
    if (!svc) return false;
    if ((shareSlotTaken && !isHost) || (svc.localParticipant?.isScreenShareEnabled ?? false)) {
      setError(t('meeting.screenShareBusy'));
      return false;
    }
    try {
      setError('');
      await svc.publishVideoFile(element);
      setVideoFileOn(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setVideoFileOn(false);
      return false;
    }
  }, [shareSlotTaken, isHost, t]);

  const stopVideoFile = useCallback(async () => {
    const svc = serviceRef.current;
    setVideoFileOn(false);
    if (!svc) return;
    try {
      await svc.unpublishVideoFile();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // The chat socket's welcome may arrive before or after the video connects,
  // so publish the presence id whenever both exist rather than at one moment.
  useEffect(() => {
    if (!joined || !ownUserId) return;
    void serviceRef.current?.setUserId(ownUserId).catch(() => undefined);
  }, [joined, ownUserId]);

  // Keep a live ref to join so the auto-join effect need not depend on its
  // (intentionally unstable) identity — depending on `join` would re-run the
  // effect every render and spawn duplicate connections.
  const joinRef = useRef(join);
  joinRef.current = join;

  // Auto-join video rooms once on mount; disconnect on unmount / room change.
  useEffect(() => {
    disposedRef.current = false;
    if (room.hasVideo) void joinRef.current();
    return () => {
      disposedRef.current = true;
      serviceRef.current?.disconnect();
      serviceRef.current = null;
    };
  }, [room.hasVideo]);

  return {
    participants, activeSpeakerIds, connecting, reconnecting, joined, error, errorSeq: errorState.seq,
    micOn, camOn, screenOn, videoFileOn, handRaised, shareSlotTaken,
    join, leave, toggleMic, toggleCamera, toggleScreenShare, startVideoFile, stopVideoFile, retryLocalMedia,
    toggleHand, lowerHandOf, lowerAllHands,
  };
}

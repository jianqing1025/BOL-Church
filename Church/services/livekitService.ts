import { Room, RoomEvent, Track, type RemoteParticipant, type LocalParticipant, type Participant } from 'livekit-client';

export interface LiveKitHandlers {
  onParticipantsChanged: (participants: Participant[]) => void;
  onError?: (error: unknown) => void;
}

export interface LiveKitConnectParams {
  roomId: string;
  name: string;
  password: string;
}

/** Wraps a single LiveKit Room connection and the local track toggles. */
export class LiveKitService {
  private room: Room | null = null;
  constructor(private handlers: LiveKitHandlers) {}

  get localParticipant(): LocalParticipant | undefined {
    return this.room?.localParticipant;
  }

  private emit(): void {
    if (!this.room) return;
    const remote: RemoteParticipant[] = [...this.room.remoteParticipants.values()];
    this.handlers.onParticipantsChanged([this.room.localParticipant, ...remote]);
  }

  async connect(params: LiveKitConnectParams): Promise<void> {
    const res = await fetch('/api/meeting/livekit-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const info = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(info.error || `Token request failed (${res.status})`);
    }
    const { url, token } = await res.json() as { url: string; token: string };

    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.room = room;
    room
      .on(RoomEvent.ParticipantConnected, () => this.emit())
      .on(RoomEvent.ParticipantDisconnected, () => this.emit())
      .on(RoomEvent.TrackSubscribed, () => this.emit())
      .on(RoomEvent.TrackUnsubscribed, () => this.emit())
      .on(RoomEvent.TrackMuted, () => this.emit())
      .on(RoomEvent.TrackUnmuted, () => this.emit())
      .on(RoomEvent.LocalTrackPublished, () => this.emit())
      .on(RoomEvent.LocalTrackUnpublished, () => this.emit())
      .on(RoomEvent.Disconnected, () => this.emit());

    await room.connect(url, token);
    // Browsers block autoplay of remote audio until a gesture; the click that
    // brought the user into the room usually satisfies it. Best-effort resume.
    await room.startAudio().catch(() => undefined);
    await room.localParticipant.setCameraEnabled(true).catch(() => undefined);
    await room.localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
    this.emit();
  }

  async toggleMic(): Promise<boolean> {
    const p = this.room?.localParticipant;
    if (!p) return false;
    const enabled = !p.isMicrophoneEnabled;
    await p.setMicrophoneEnabled(enabled);
    this.emit();
    return enabled;
  }

  async toggleCamera(): Promise<boolean> {
    const p = this.room?.localParticipant;
    if (!p) return false;
    const enabled = !p.isCameraEnabled;
    await p.setCameraEnabled(enabled);
    this.emit();
    return enabled;
  }

  async toggleScreenShare(): Promise<boolean> {
    const p = this.room?.localParticipant;
    if (!p) return false;
    const enabled = !p.isScreenShareEnabled;
    await p.setScreenShareEnabled(enabled);
    this.emit();
    return enabled;
  }

  disconnect(): void {
    try { this.room?.disconnect(); } catch { /* ignore */ }
    this.room = null;
  }

  /** The video track to display for a participant: screen share wins over camera. */
  static videoTrack(participant: Participant): Track | undefined {
    const pubs = [...participant.videoTrackPublications.values()];
    const pub = pubs.find((p) => p.track && !p.isMuted && p.source === Track.Source.ScreenShare)
      || pubs.find((p) => p.track && !p.isMuted && p.source === Track.Source.Camera)
      || pubs.find((p) => p.track && !p.isMuted);
    return pub?.track ?? undefined;
  }

  /** Whether a participant currently has an active (unmuted) screen-share track. */
  static isScreenSharing(participant: Participant): boolean {
    return [...participant.videoTrackPublications.values()]
      .some((p) => p.track && !p.isMuted && p.source === Track.Source.ScreenShare);
  }

  /** The audio track to play for a participant (undefined for local, to avoid echo). */
  static audioTrack(participant: Participant): Track | undefined {
    if (participant.isLocal) return undefined;
    const pubs = [...participant.audioTrackPublications.values()];
    const pub = pubs.find((p) => p.track && p.source === Track.Source.Microphone)
      || pubs.find((p) => p.track);
    return pub?.track ?? undefined;
  }
}

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
      .on(RoomEvent.LocalTrackPublished, () => this.emit())
      .on(RoomEvent.LocalTrackUnpublished, () => this.emit())
      .on(RoomEvent.Disconnected, () => this.emit());

    await room.connect(url, token);
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

  /** Attach a participant's first video track to an element; returns cleanup. */
  static attachVideo(participant: Participant, el: HTMLVideoElement): () => void {
    const pub = [...participant.videoTrackPublications.values()].find((p) => p.track && p.source === Track.Source.Camera)
      || [...participant.videoTrackPublications.values()].find((p) => p.track);
    const track = pub?.track;
    if (track) track.attach(el);
    return () => { try { track?.detach(el); } catch { /* ignore */ } };
  }
}

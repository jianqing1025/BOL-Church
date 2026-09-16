import { Room, RoomEvent, Track, type RemoteParticipant, type LocalParticipant, type Participant } from 'livekit-client';

const MEDIA_UNSUPPORTED_MESSAGE = '目前的微信瀏覽器不支援開啟麥克風／鏡頭，請改用 iPhone Safari 開啟本頁，或升級微信後再試。';
const SCREEN_SHARE_UNSUPPORTED_MESSAGE = '目前的瀏覽器不支援分享螢幕。';
const VIDEO_FILE_UNSUPPORTED_MESSAGE = '目前的瀏覽器不支援把影片播給大家看，請改用電腦的 Chrome 或 Edge。';

/** Track name for a broadcast video file, to tell it apart from a real screen share. */
export const VIDEO_FILE_TRACK_NAME = 'meeting-video-file';

export interface LiveKitHandlers {
  onParticipantsChanged: (participants: Participant[]) => void;
  /** Dominant-speaker order from LiveKit (identities, loudest first). */
  onActiveSpeakersChanged?: (identities: string[]) => void;
  onError?: (error: unknown) => void;
}

export interface LiveKitConnectParams {
  roomId: string;
  name: string;
  password: string;
  /** Camera/mic captured up front by the caller (see captureLocalMedia). */
  stream?: MediaStream | null;
}

/** Wraps a single LiveKit Room connection and the local track toggles. */
export class LiveKitService {
  private room: Room | null = null;
  private videoFileTracks: MediaStreamTrack[] = [];
  constructor(private handlers: LiveKitHandlers) {}

  get localParticipant(): LocalParticipant | undefined {
    return this.room?.localParticipant;
  }

  private emit(): void {
    if (!this.room) return;
    const remote: RemoteParticipant[] = [...this.room.remoteParticipants.values()];
    this.handlers.onParticipantsChanged([this.room.localParticipant, ...remote]);
  }

  private hasUserMedia(): boolean {
    return typeof navigator !== 'undefined'
      && Boolean(navigator.mediaDevices?.getUserMedia);
  }

  private hasDisplayMedia(): boolean {
    return typeof navigator !== 'undefined'
      && Boolean(navigator.mediaDevices?.getDisplayMedia);
  }

  /**
   * Asks for the camera and microphone in a SINGLE getUserMedia call.
   *
   * Call this straight from the user's tap. Safari on iOS only grants capture
   * while the tap still counts as user activation, which a token fetch and a
   * WebRTC connect would use up — and it allows one capture at a time, so
   * asking for camera and microphone separately makes the second request stop
   * the first one's tracks. One call, up front, avoids both.
   *
   * Falls back to audio only when the camera is unavailable, so a device
   * without a working camera still joins with sound.
   */
  static async captureLocalMedia(): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error(MEDIA_UNSUPPORTED_MESSAGE);
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')) {
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      throw error;
    }
  }

  /** Publishes an already-captured camera/mic stream. */
  async publishLocalMedia(stream: MediaStream): Promise<void> {
    const p = this.room?.localParticipant;
    if (!p) return;
    const [audio] = stream.getAudioTracks();
    const [video] = stream.getVideoTracks();
    if (audio) await p.publishTrack(audio, { source: Track.Source.Microphone });
    if (video) await p.publishTrack(video, { source: Track.Source.Camera });
    this.emit();
  }

  /**
   * Publishes what the caller captured before connecting. A null stream means
   * capture was already tried and failed — the room is joined without media
   * and the caller has reported why, so there is deliberately no retry here:
   * asking again from outside a user gesture is what iOS Safari refuses.
   */
  private async enableInitialLocalMedia(stream: MediaStream | null | undefined): Promise<void> {
    if (!stream) return;
    try {
      await this.publishLocalMedia(stream);
    } catch (error) {
      this.handlers.onError?.(error);
    }
  }

  async connect(params: LiveKitConnectParams): Promise<void> {
    const res = await fetch('/api/meeting/livekit-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: params.roomId, name: params.name, password: params.password }),
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
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        this.handlers.onActiveSpeakersChanged?.(speakers.map((s) => s.identity));
        this.emit();
      })
      .on(RoomEvent.Disconnected, () => this.emit());

    await room.connect(url, token);
    // Browsers block autoplay of remote audio until a gesture; the click that
    // brought the user into the room usually satisfies it. Best-effort resume.
    await room.startAudio().catch(() => undefined);
    await this.enableInitialLocalMedia(params.stream);
    this.emit();
  }

  async toggleMic(): Promise<boolean> {
    const p = this.room?.localParticipant;
    if (!p) return false;
    if (!this.hasUserMedia()) throw new Error(MEDIA_UNSUPPORTED_MESSAGE);
    const enabled = !p.isMicrophoneEnabled;
    await p.setMicrophoneEnabled(enabled);
    this.emit();
    return enabled;
  }

  async toggleCamera(): Promise<boolean> {
    const p = this.room?.localParticipant;
    if (!p) return false;
    if (!this.hasUserMedia()) throw new Error(MEDIA_UNSUPPORTED_MESSAGE);
    const enabled = !p.isCameraEnabled;
    await p.setCameraEnabled(enabled);
    this.emit();
    return enabled;
  }

  async toggleScreenShare(): Promise<boolean> {
    const p = this.room?.localParticipant;
    if (!p) return false;
    if (!this.hasDisplayMedia()) throw new Error(SCREEN_SHARE_UNSUPPORTED_MESSAGE);
    const enabled = !p.isScreenShareEnabled;
    await p.setScreenShareEnabled(enabled);
    this.emit();
    return enabled;
  }

  /**
   * Publishes a playing <video> element's picture and sound to the room.
   *
   * The tracks go out on the ScreenShare sources on purpose: every viewer's
   * stage already promotes a screen share to the main area, so a broadcast
   * video needs no layout of its own, and the existing "only one at a time"
   * rule covers both without a second concept.
   */
  async publishVideoFile(element: HTMLVideoElement): Promise<void> {
    const p = this.room?.localParticipant;
    if (!p) return;
    if (!LiveKitService.canCaptureVideoFile(element)) throw new Error(VIDEO_FILE_UNSUPPORTED_MESSAGE);

    const capture = element.captureStream ?? element.mozCaptureStream;
    const stream = capture.call(element);
    const [video] = stream.getVideoTracks();
    if (!video) throw new Error(VIDEO_FILE_UNSUPPORTED_MESSAGE);

    this.videoFileTracks = [video];
    await p.publishTrack(video, { source: Track.Source.ScreenShare, name: VIDEO_FILE_TRACK_NAME });

    // Sound is a separate track and may be absent (a silent clip); a video
    // without audio should still broadcast rather than fail.
    const [audio] = stream.getAudioTracks();
    if (audio) {
      this.videoFileTracks.push(audio);
      await p.publishTrack(audio, { source: Track.Source.ScreenShareAudio, name: VIDEO_FILE_TRACK_NAME });
    }
    this.emit();
  }

  async unpublishVideoFile(): Promise<void> {
    const p = this.room?.localParticipant;
    const tracks = this.videoFileTracks;
    this.videoFileTracks = [];
    if (!p || tracks.length === 0) return;
    for (const track of tracks) {
      try { await p.unpublishTrack(track, true); } catch { /* already gone */ }
    }
    this.emit();
  }

  /** Whether this browser can turn a video element into a publishable stream. */
  static canCaptureVideoFile(element: HTMLVideoElement | null): boolean {
    if (!element) return false;
    return typeof element.captureStream === 'function' || typeof element.mozCaptureStream === 'function';
  }

  disconnect(): void {
    this.videoFileTracks = [];
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

  /**
   * Every audio track to play for a participant (none for the local one, to
   * avoid echo). A participant broadcasting a video file has two — their
   * microphone and the film's soundtrack — and both have to be heard, so this
   * deliberately returns all of them rather than picking one.
   */
  static audioTracks(participant: Participant): Track[] {
    if (participant.isLocal) return [];
    return [...participant.audioTrackPublications.values()]
      .map((p) => p.track)
      .filter((t): t is Track => Boolean(t));
  }

  /** Whether a participant's screen share is a broadcast video file. */
  static isPlayingVideoFile(participant: Participant): boolean {
    return [...participant.videoTrackPublications.values()]
      .some((p) => p.track && !p.isMuted && p.source === Track.Source.ScreenShare && p.trackName === VIDEO_FILE_TRACK_NAME);
  }
}

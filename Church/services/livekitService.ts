import { LocalVideoTrack, Room, RoomEvent, Track, type RemoteParticipant, type LocalParticipant, type Participant } from 'livekit-client';
import { HAND_ATTRIBUTE, handRaisedAt } from '../meeting/raisedHands';
import { HOST_ATTRIBUTE, USER_ID_ATTRIBUTE } from '../meeting/participantFlags';

const MEDIA_UNSUPPORTED_MESSAGE = '目前的微信瀏覽器不支援開啟麥克風／鏡頭，請改用 iPhone Safari 開啟本頁，或升級微信後再試。';
const SCREEN_SHARE_UNSUPPORTED_MESSAGE = '目前的瀏覽器不支援分享螢幕。';
const VIDEO_FILE_UNSUPPORTED_MESSAGE = '目前的瀏覽器不支援把影片播給大家看，請改用電腦的 Chrome 或 Edge。';

/** Data-channel topic carrying "put your hand down" from a host. */
const HAND_TOPIC = 'meeting-hand';

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
  /** Whether this participant ticked Host, so their tile can say so. */
  isHost?: boolean;
  /** Which devices to arrive with; both are captured either way (see below). */
  media?: { camOn: boolean; micOn: boolean };
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

  /**
   * Wraps a raw camera track so the SDK, not us, owns the device.
   *
   * publishTrack() on a bare MediaStreamTrack marks it "user provided", and
   * LocalVideoTrack.mute() then skips stopping the hardware on purpose —
   * which is why turning the camera off muted the picture for the room but
   * left the device running and its indicator light on. Handing LiveKit a
   * track it manages restores the normal pair: mute stops the camera, unmute
   * re-acquires it. The constraints come along so it can be re-acquired from
   * the same device.
   */
  static managedCameraTrack(track: MediaStreamTrack): LocalVideoTrack {
    const constraints = typeof track.getConstraints === 'function' ? track.getConstraints() : undefined;
    return new LocalVideoTrack(track, constraints, false);
  }

  /** Drops whatever is already published on a source, device and all. */
  private static async retireSource(p: LocalParticipant, source: Track.Source): Promise<void> {
    const existing = p.getTrackPublication(source)?.track;
    if (existing) await p.unpublishTrack(existing, true);
  }

  /**
   * Publishes an already-captured camera/mic stream, replacing any capture
   * already published on those sources.
   *
   * Replacing rather than adding matters: a second capture (what the "retry
   * camera/mic" button does) used to leave the first one published as well,
   * and muting afterwards only reached the first of the two — the button read
   * off while the room still heard the microphone and saw the camera.
   */
  async publishLocalMedia(stream: MediaStream): Promise<void> {
    const p = this.room?.localParticipant;
    if (!p) return;
    const [audio] = stream.getAudioTracks();
    const [video] = stream.getVideoTracks();
    if (audio) await LiveKitService.retireSource(p, Track.Source.Microphone);
    if (video) await LiveKitService.retireSource(p, Track.Source.Camera);
    if (audio) await p.publishTrack(audio, { source: Track.Source.Microphone });
    if (video) await p.publishTrack(LiveKitService.managedCameraTrack(video), { source: Track.Source.Camera });
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
      .on(RoomEvent.ParticipantAttributesChanged, () => this.emit())
      .on(RoomEvent.ConnectionQualityChanged, () => this.emit())
      .on(RoomEvent.DataReceived, (payload, _from, _kind, topic) => {
        if (topic === HAND_TOPIC) void this.lowerOwnHand();
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        this.handlers.onActiveSpeakersChanged?.(speakers.map((s) => s.identity));
        this.emit();
      })
      .on(RoomEvent.Disconnected, () => this.emit());

    await room.connect(url, token);
    // Browsers block autoplay of remote audio until a gesture; the click that
    // brought the user into the room usually satisfies it. Best-effort resume.
    await room.startAudio().catch(() => undefined);
    // The tiles are LiveKit participants and the host flag lives in presence,
    // which shares no id with them — so the marker goes on the participant.
    if (params.isHost) await room.localParticipant.setAttributes({ [HOST_ATTRIBUTE]: '1' }).catch(() => undefined);
    await this.enableInitialLocalMedia(params.stream);
    await this.applyInitialMedia(params.media);
    this.emit();
  }

  /**
   * Closes whichever device the joiner did not ask for.
   *
   * Both are captured regardless, in the one getUserMedia call iOS allows —
   * asking for them separately makes the second request stop the first one's
   * tracks, so somebody who joined with only a microphone would lose it the
   * moment they turned their camera on. Muting instead costs nothing: the
   * camera track is SDK-managed, so muting it stops the device and puts the
   * indicator light out, and turning it on later is the path that already
   * works rather than a fresh capture outside a tap.
   */
  private async applyInitialMedia(media?: { camOn: boolean; micOn: boolean }): Promise<void> {
    const p = this.room?.localParticipant;
    if (!p || !media) return;
    try {
      if (!media.micOn) await p.setMicrophoneEnabled(false);
      if (!media.camOn) await p.setCameraEnabled(false);
    } catch (error) {
      this.handlers.onError?.(error);
    }
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

  /**
   * Tells the room which presence user this participant is.
   *
   * The two ids are handed out by different systems and arrive at different
   * moments — the chat socket's welcome can land after the video is already
   * connected — so this is set whenever the id turns up rather than at connect.
   */
  async setUserId(userId: string): Promise<void> {
    const p = this.room?.localParticipant;
    if (!p) return;
    await p.setAttributes({ [USER_ID_ATTRIBUTE]: userId });
    this.emit();
  }

  /** Whether this participant currently has a hand up. */
  get handRaised(): boolean {
    const p = this.room?.localParticipant;
    return p ? handRaisedAt(p) !== null : false;
  }

  /** Raises or lowers this participant's own hand; returns the new state. */
  async toggleHand(): Promise<boolean> {
    const p = this.room?.localParticipant;
    if (!p) return false;
    const raised = handRaisedAt(p) !== null;
    // setAttributes merges, so an empty string is how a key is "removed".
    await p.setAttributes({ [HAND_ATTRIBUTE]: raised ? '' : String(Date.now()) });
    this.emit();
    return !raised;
  }

  /**
   * Asks one participant to put their hand down.
   *
   * Only a participant may change their own attributes, so this cannot reach
   * in and clear it — it sends them a note and their own client does it. The
   * note is addressed, so nobody else's hand moves.
   */
  async lowerHandOf(identity: string): Promise<void> {
    await this.sendLowerHand([identity]);
  }

  /** Asks the whole room to put their hands down. */
  async lowerAllHands(): Promise<void> {
    await this.sendLowerHand(undefined);
  }

  private async sendLowerHand(destinationIdentities: string[] | undefined): Promise<void> {
    const p = this.room?.localParticipant;
    if (!p) return;
    const payload = new TextEncoder().encode(JSON.stringify({ type: 'lowerHand' }));
    await p.publishData(payload, { reliable: true, topic: HAND_TOPIC, destinationIdentities });
    // Data messages reach everyone but the sender, so a host lowering the whole
    // room would otherwise be left as the only hand still up.
    if (!destinationIdentities || destinationIdentities.includes(p.identity)) await this.lowerOwnHand();
  }

  private async lowerOwnHand(): Promise<void> {
    const p = this.room?.localParticipant;
    if (!p || handRaisedAt(p) === null) return;
    await p.setAttributes({ [HAND_ATTRIBUTE]: '' });
    this.emit();
  }

  async toggleScreenShare(): Promise<boolean> {
    const p = this.room?.localParticipant;
    if (!p) return false;
    if (!this.hasDisplayMedia()) throw new Error(SCREEN_SHARE_UNSUPPORTED_MESSAGE);
    const enabled = !p.isScreenShareEnabled;
    // Asking for audio is what puts the "also share audio" tick box in the
    // browser's own picker — there is no other way to offer it, since that
    // dialog belongs to the browser and a page may not touch it. Whether the
    // box appears at all is the browser's call: Chrome and Edge offer it for a
    // tab everywhere and for a whole screen on Windows, Safari not at all.
    await p.setScreenShareEnabled(enabled, { audio: true });
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

  /**
   * Every remote audio track in the room, in participant order, each one once.
   *
   * Playback deliberately reads the whole room rather than one participant:
   * tying it to a participant meant tying it to that participant's tile, and a
   * gallery page or a screen-share rail that left someone off screen left them
   * inaudible too. Hearing everyone must not depend on seeing everyone.
   */
  static roomAudioTracks(participants: Participant[]): Track[] {
    const seen = new Set<Track>();
    for (const participant of participants) {
      for (const track of LiveKitService.audioTracks(participant)) seen.add(track);
    }
    return [...seen];
  }

  /** Whether a participant's screen share is a broadcast video file. */
  static isPlayingVideoFile(participant: Participant): boolean {
    return [...participant.videoTrackPublications.values()]
      .some((p) => p.track && !p.isMuted && p.source === Track.Source.ScreenShare && p.trackName === VIDEO_FILE_TRACK_NAME);
  }
}

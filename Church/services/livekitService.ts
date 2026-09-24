import { DisconnectReason, LocalVideoTrack, Room, RoomEvent, Track, type RemoteParticipant, type LocalParticipant, type Participant } from 'livekit-client';
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
  /**
   * The connection is gone and LiveKit has given up on it. Not called when we
   * hung up ourselves or the host removed us — only for the kind of loss a
   * fresh join can fix (a dropped network, a phone that slept).
   */
  onConnectionLost?: () => void;
  /** LiveKit is trying to resume a wobbling connection by itself. */
  onReconnecting?: (reconnecting: boolean) => void;
}

/**
 * A join that failed. `retryable` is false when trying again cannot help —
 * a wrong password or a room that does not exist — so the caller asks the
 * person instead of looping.
 */
export class LiveKitJoinError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'LiveKitJoinError';
  }
}

const CAMERA_STORAGE_KEY = 'meeting.cameraDeviceId';
/** Windows Hello's infrared sensor: listed as a camera, held by Windows, never a picture. */
const INFRARED = /\bIR\b|infrared|紅外|红外/i;
/** getUserMedia failures that mean "this device would not start", as opposed to "not allowed". */
const START_FAILURES = new Set(['NotReadableError', 'TrackStartError', 'AbortError', 'OverconstrainedError', 'ConstraintNotSatisfiedError']);
const isStartFailure = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && START_FAILURES.has((error as { name?: string }).name ?? '');

/** Disconnects that a new join must not undo. */
const FINAL_DISCONNECTS = new Set<DisconnectReason | undefined>([
  DisconnectReason.CLIENT_INITIATED,
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.ROOM_DELETED,
  DisconnectReason.DUPLICATE_IDENTITY,
]);

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
  /** Set once we hang up, so our own disconnect is not mistaken for a loss. */
  private closed = false;
  private connected = false;
  private videoFileTracks: MediaStreamTrack[] = [];
  constructor(private handlers: LiveKitHandlers) {}

  get localParticipant(): LocalParticipant | undefined {
    return this.room?.localParticipant;
  }

  // Nothing until joined, nothing after hanging up: a failed connect used to
  // report the local participant alone, which made the page think it was in
  // the meeting and hid the button that would actually join.
  private emit(): void {
    if (!this.room || !this.connected || this.closed) return;
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
  /**
   * A bare `video: true` gets 640×480 from Chrome, which is most of why faces
   * looked soft next to Zoom. Ideal (not exact) values, so a camera that
   * cannot do 720p still opens at whatever it can.
   */
  static readonly CAMERA_CONSTRAINTS: MediaTrackConstraints = {
    width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
  };

  /** The camera that last started, so the next start tries it first. */
  static preferredCameraId(): string | undefined {
    try { return localStorage.getItem(CAMERA_STORAGE_KEY) || undefined; } catch { return undefined; }
  }

  static rememberCamera(track: MediaStreamTrack | undefined): void {
    const id = track?.getSettings?.().deviceId;
    if (!id) return;
    try { localStorage.setItem(CAMERA_STORAGE_KEY, id); } catch { /* private mode */ }
  }

  /** 720p, from the camera that worked last time if there was one. */
  static cameraConstraints(): MediaTrackConstraints {
    const id = LiveKitService.preferredCameraId();
    return id ? { ...LiveKitService.CAMERA_CONSTRAINTS, deviceId: { ideal: id } } : LiveKitService.CAMERA_CONSTRAINTS;
  }

  /**
   * Opens a camera that will actually start, trying progressively plainer
   * requests before giving up.
   *
   * "Could not start video source" (NotReadableError) on Windows is rarely
   * another app. Far more often it is the infrared Windows Hello camera picked
   * as the default and held by Windows itself, a driver that refuses the
   * 720p/30 fps request, or the "let desktop apps use the camera" privacy
   * switch — none of which a restart fixes. So: the same request with no
   * resolution, then each camera in turn, infrared ones last. Anything that is
   * not a start failure (a denied permission) stops at once.
   *
   * `skipPreferred` when the caller has just tried the 720p request itself.
   */
  static async openCamera(skipPreferred = false): Promise<MediaStreamTrack> {
    const devices = navigator.mediaDevices;
    const start = async (video: MediaTrackConstraints | true): Promise<MediaStreamTrack> => {
      const [track] = (await devices.getUserMedia({ video })).getVideoTracks();
      LiveKitService.rememberCamera(track);
      return track;
    };
    let lastError: unknown = null;
    const attempts: (MediaTrackConstraints | true)[] = skipPreferred ? [true] : [LiveKitService.cameraConstraints(), true];
    for (const video of attempts) {
      try { return await start(video); } catch (error) {
        if (!isStartFailure(error)) throw error;
        lastError = error;
      }
    }
    const cameras = (await devices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]))
      .filter((d) => d.kind === 'videoinput' && d.deviceId && d.deviceId !== 'default')
      .sort((a, b) => Number(INFRARED.test(a.label)) - Number(INFRARED.test(b.label)));
    for (const camera of cameras) {
      try { return await start({ deviceId: { exact: camera.deviceId } }); } catch (error) {
        if (!isStartFailure(error)) throw error;
        lastError = error;
      }
    }
    throw lastError ?? new DOMException('No camera would start', 'NotReadableError');
  }

  /**
   * `onPartialFailure` hears about a device that would not start when the
   * other one did — joining with the microphone alone beats not joining.
   */
  static async captureLocalMedia(
    media?: { micOn: boolean; camOn: boolean },
    onPartialFailure?: (error: unknown) => void,
  ): Promise<MediaStream | null> {
    if (media && !media.micOn && !media.camOn) return null;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error(MEDIA_UNSUPPORTED_MESSAGE);
    }
    const devices = navigator.mediaDevices;
    if (media && !media.camOn) return devices.getUserMedia({ audio: true, video: false });
    if (media && !media.micOn) {
      try {
        return await devices.getUserMedia({ audio: false, video: LiveKitService.cameraConstraints() });
      } catch (error) {
        if (!isStartFailure(error)) throw error;
        return new MediaStream([await LiveKitService.openCamera(true)]);
      }
    }
    try {
      const stream = await devices.getUserMedia({ audio: true, video: LiveKitService.cameraConstraints() });
      LiveKitService.rememberCamera(stream.getVideoTracks()[0]);
      return stream;
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')) {
        try {
          return await devices.getUserMedia({ audio: true });
        } catch (audioError) {
          if (typeof window !== 'undefined' && window.meetingDesktop && audioError instanceof DOMException && audioError.name === 'NotFoundError') {
            return await devices.getUserMedia({ video: LiveKitService.CAMERA_CONSTRAINTS });
          }
          throw audioError;
        }
      }
      if (!isStartFailure(error)) throw error;
      // One of the two would not start. Taken apart, a stuck camera no longer
      // costs the microphone as well.
      const tracks: MediaStreamTrack[] = [];
      let micError: unknown = null;
      try { tracks.push(...(await devices.getUserMedia({ audio: true })).getAudioTracks()); } catch (e) { micError = e; }
      try { tracks.push(await LiveKitService.openCamera(true)); } catch (e) {
        if (!tracks.length) throw micError ?? e;
        onPartialFailure?.(e);
      }
      if (!tracks.length) throw micError ?? error;
      if (micError) onPartialFailure?.(micError);
      return new MediaStream(tracks);
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
      // 4xx is the request itself (password, room); 5xx and 429 may pass.
      const retryable = res.status >= 500 || res.status === 429;
      throw new LiveKitJoinError(info.error || `Token request failed (${res.status})`, retryable);
    }
    const { url, token } = await res.json() as { url: string; token: string };

    // pixelDensity 'screen': LiveKit otherwise sizes the stream it sends each
    // viewer by CSS pixels, so on a laptop at 150% scaling a full-window share
    // arrived at two thirds of the resolution the screen could show.
    const room = new Room({ adaptiveStream: { pixelDensity: 'screen' }, dynacast: true });
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
      .on(RoomEvent.Reconnecting, () => this.handlers.onReconnecting?.(true))
      .on(RoomEvent.Reconnected, () => this.handlers.onReconnecting?.(false))
      .on(RoomEvent.Disconnected, (reason) => {
        this.handlers.onReconnecting?.(false);
        // Only a loss that happens after joining; a failed connect() throws
        // to its caller instead, which does its own retrying.
        if (this.closed || !this.connected || FINAL_DISCONNECTS.has(reason)) return;
        this.handlers.onConnectionLost?.();
      });

    try {
      await room.connect(url, token);
    } catch (error) {
      // Which server matters when reading a report: the church's own or a cloud project.
      console.warn(`LiveKit connect to ${new URL(url).host} failed`, error);
      throw error;
    }
    this.connected = true;
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

  /**
   * Turns devices back on after rejoining a lost meeting. No capture up front
   * there — nobody pressed anything — so LiveKit opens them itself.
   */
  async restoreDevices(media: { camOn: boolean; micOn: boolean }): Promise<void> {
    const p = this.room?.localParticipant;
    if (!p) return;
    try {
      if (media.micOn) await p.setMicrophoneEnabled(true);
      if (media.camOn) await this.enableCamera(p);
    } catch (error) {
      this.handlers.onError?.(error);
    }
    this.emit();
  }

  /**
   * LiveKit's own start first; if the camera will not start that way, the
   * fallback chain in openCamera, published in place of whatever was there.
   */
  private async enableCamera(p: LocalParticipant): Promise<void> {
    const preferred = LiveKitService.preferredCameraId();
    try {
      await p.setCameraEnabled(true, {
        resolution: { width: 1280, height: 720, frameRate: 30 },
        ...(preferred ? { deviceId: { ideal: preferred } } : {}),
      });
    } catch (error) {
      if (!isStartFailure(error)) throw error;
      const track = await LiveKitService.openCamera(true);
      await LiveKitService.retireSource(p, Track.Source.Camera);
      await p.publishTrack(LiveKitService.managedCameraTrack(track), { source: Track.Source.Camera });
    }
    LiveKitService.rememberCamera(p.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack);
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
    if (enabled) await this.enableCamera(p);
    else await p.setCameraEnabled(false);
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
    //
    // Tuned for what a Bible study shares — text and slides — the way Zoom
    // does: full resolution always, and when the uplink is short it is the
    // frame rate that drops, never the sharpness ("maintain-resolution").
    // Capture goes up to 1440p so a high-DPI laptop's text is not shrunk to
    // 1080p first, and there is a single layer: a lower simulcast layer is
    // what LiveKit hands a viewer whose tile is "small enough", and for text
    // that meant a blurry picture on an ordinary window.
    await p.setScreenShareEnabled(
      enabled,
      {
        audio: true,
        contentHint: 'detail',
        // Native size, capped: an "ideal" resolution (LiveKit's own option)
        // would let Chrome scale a 1080p screen up. Width 0 = LiveKit leaves
        // the constraints below alone. The SDK types `video` narrower than
        // Chrome accepts, hence the cast.
        resolution: { width: 0, height: 0 },
        video: { width: { max: 2560 }, height: { max: 1440 }, frameRate: { ideal: 30, max: 30 } } as unknown as true,
      },
      {
        screenShareEncoding: { maxBitrate: 5_000_000, maxFramerate: 30 },
        simulcast: false,
        degradationPreference: 'maintain-resolution',
      },
    );
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
    this.closed = true;
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

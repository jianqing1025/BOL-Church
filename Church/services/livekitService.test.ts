import { describe, it, expect } from 'vitest';
import { Track, type Participant } from 'livekit-client';
import { LiveKitService, VIDEO_FILE_TRACK_NAME } from './livekitService';

type FakePub = { track: object | undefined; source: Track.Source; isMuted?: boolean; trackName?: string };

function participant(opts: { isLocal?: boolean; video?: FakePub[]; audio?: FakePub[] }): Participant {
  return {
    isLocal: opts.isLocal ?? false,
    videoTrackPublications: new Map((opts.video ?? []).map((p, i) => [String(i), p])),
    audioTrackPublications: new Map((opts.audio ?? []).map((p, i) => [String(i), p])),
  } as unknown as Participant;
}

describe('LiveKitService.videoTrack', () => {
  it('prefers screen share over camera', () => {
    const cam = {}; const screen = {};
    const p = participant({ video: [
      { track: cam, source: Track.Source.Camera },
      { track: screen, source: Track.Source.ScreenShare },
    ] });
    expect(LiveKitService.videoTrack(p)).toBe(screen);
  });

  it('returns the camera track when there is no screen share', () => {
    const cam = {};
    const p = participant({ video: [{ track: cam, source: Track.Source.Camera }] });
    expect(LiveKitService.videoTrack(p)).toBe(cam);
  });

  it('ignores muted and track-less publications', () => {
    const p = participant({ video: [
      { track: undefined, source: Track.Source.Camera },
      { track: {}, source: Track.Source.Camera, isMuted: true },
    ] });
    expect(LiveKitService.videoTrack(p)).toBeUndefined();
  });
});

describe('LiveKitService.isScreenSharing', () => {
  it('is true when an unmuted screen-share track is present', () => {
    const p = participant({ video: [{ track: {}, source: Track.Source.ScreenShare }] });
    expect(LiveKitService.isScreenSharing(p)).toBe(true);
  });

  it('is false for a camera-only participant', () => {
    const p = participant({ video: [{ track: {}, source: Track.Source.Camera }] });
    expect(LiveKitService.isScreenSharing(p)).toBe(false);
  });

  it('is false when the screen-share track is muted', () => {
    const p = participant({ video: [{ track: {}, source: Track.Source.ScreenShare, isMuted: true }] });
    expect(LiveKitService.isScreenSharing(p)).toBe(false);
  });
});

describe('LiveKitService.audioTracks', () => {
  it('returns the remote microphone track', () => {
    const mic = {};
    const p = participant({ audio: [{ track: mic, source: Track.Source.Microphone }] });
    expect(LiveKitService.audioTracks(p)).toEqual([mic]);
  });

  it('returns both the microphone and a broadcast video soundtrack', () => {
    // The regression this guards: picking only the microphone left everyone
    // watching a broadcast video with a picture and no sound.
    const mic = {}; const film = {};
    const p = participant({ audio: [
      { track: mic, source: Track.Source.Microphone },
      { track: film, source: Track.Source.ScreenShareAudio, trackName: VIDEO_FILE_TRACK_NAME },
    ] });
    expect(LiveKitService.audioTracks(p)).toEqual([mic, film]);
  });

  it('skips publications with no track', () => {
    const mic = {};
    const p = participant({ audio: [
      { track: undefined, source: Track.Source.ScreenShareAudio },
      { track: mic, source: Track.Source.Microphone },
    ] });
    expect(LiveKitService.audioTracks(p)).toEqual([mic]);
  });

  it('returns nothing for the local participant (no echo)', () => {
    const mic = {};
    const p = participant({ isLocal: true, audio: [{ track: mic, source: Track.Source.Microphone }] });
    expect(LiveKitService.audioTracks(p)).toEqual([]);
  });
});

describe('LiveKitService.isPlayingVideoFile', () => {
  it('is true for a screen share published as a broadcast video file', () => {
    const p = participant({ video: [{ track: {}, source: Track.Source.ScreenShare, trackName: VIDEO_FILE_TRACK_NAME }] });
    expect(LiveKitService.isPlayingVideoFile(p)).toBe(true);
    // It still counts as a screen share, so the one-at-a-time rule covers both.
    expect(LiveKitService.isScreenSharing(p)).toBe(true);
  });

  it('is false for a real screen share', () => {
    const p = participant({ video: [{ track: {}, source: Track.Source.ScreenShare, trackName: 'screen' }] });
    expect(LiveKitService.isPlayingVideoFile(p)).toBe(false);
  });
});

describe('LiveKitService.canCaptureVideoFile', () => {
  it('accepts either the standard or the Firefox-prefixed capture method', () => {
    expect(LiveKitService.canCaptureVideoFile({ captureStream: () => null } as unknown as HTMLVideoElement)).toBe(true);
    expect(LiveKitService.canCaptureVideoFile({ mozCaptureStream: () => null } as unknown as HTMLVideoElement)).toBe(true);
  });

  it('rejects a browser without it, so the user gets told instead of nothing happening', () => {
    expect(LiveKitService.canCaptureVideoFile({} as HTMLVideoElement)).toBe(false);
    expect(LiveKitService.canCaptureVideoFile(null)).toBe(false);
  });
});

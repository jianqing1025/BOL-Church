import { describe, it, expect } from 'vitest';
import { Track, type Participant } from 'livekit-client';
import { LiveKitService } from './livekitService';

type FakePub = { track: object | undefined; source: Track.Source; isMuted?: boolean };

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

describe('LiveKitService.audioTrack', () => {
  it('returns the remote microphone track', () => {
    const mic = {};
    const p = participant({ audio: [{ track: mic, source: Track.Source.Microphone }] });
    expect(LiveKitService.audioTrack(p)).toBe(mic);
  });

  it('returns undefined for the local participant (no echo)', () => {
    const mic = {};
    const p = participant({ isLocal: true, audio: [{ track: mic, source: Track.Source.Microphone }] });
    expect(LiveKitService.audioTrack(p)).toBeUndefined();
  });
});

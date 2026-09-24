import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveKitService } from './livekitService';
import { classifyCameraError } from './mediaErrors';

const track = (kind: 'audio' | 'video', deviceId = '') => ({ kind, readyState: 'live', getSettings: () => ({ deviceId }), stop: vi.fn() });
const stream = (...tracks: ReturnType<typeof track>[]) => ({
  getTracks: () => tracks,
  getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
});
const notReadable = () => new DOMException('Could not start video source', 'NotReadableError');

function stubDevices(getUserMedia: ReturnType<typeof vi.fn>, cameras: { deviceId: string; label: string }[] = []) {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
  vi.stubGlobal('MediaStream', class { constructor(public tracks: unknown[]) {} });
  vi.stubGlobal('navigator', {
    userAgent: 'Windows',
    mediaDevices: {
      getUserMedia,
      enumerateDevices: vi.fn().mockResolvedValue(cameras.map((c) => ({ ...c, kind: 'videoinput' }))),
    },
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe('a camera that will not start', () => {
  it('skips the busy infrared camera and remembers the one that worked', async () => {
    const getUserMedia = vi.fn(async ({ video }: { video: MediaTrackConstraints | true }) => {
      const id = video !== true && typeof video.deviceId === 'object' ? (video.deviceId as { exact?: string }).exact : undefined;
      if (id === 'usb-cam') return stream(track('video', 'usb-cam'));
      throw notReadable();
    });
    // Windows lists the infrared sensor first; it must be tried last.
    const store = stubDevices(getUserMedia, [{ deviceId: 'hello-ir', label: 'Integrated IR Camera' }, { deviceId: 'usb-cam', label: 'USB Camera' }]);
    const opened = await LiveKitService.openCamera();
    expect(opened.getSettings().deviceId).toBe('usb-cam');
    const exactIds = getUserMedia.mock.calls.map(([c]) => (c.video as { deviceId?: { exact?: string } }).deviceId?.exact).filter(Boolean);
    expect(exactIds).toEqual(['usb-cam']);
    expect(store.get('meeting.cameraDeviceId')).toBe('usb-cam');
    expect(LiveKitService.cameraConstraints().deviceId).toEqual({ ideal: 'usb-cam' });
  });

  it('keeps the microphone when only the camera is stuck', async () => {
    const mic = track('audio');
    const getUserMedia = vi.fn(async ({ audio, video }: { audio?: boolean; video?: unknown }) => {
      if (audio && !video) return stream(mic);
      throw notReadable();
    });
    stubDevices(getUserMedia);
    const onPartialFailure = vi.fn();
    const result = await LiveKitService.captureLocalMedia(undefined, onPartialFailure) as unknown as { tracks: unknown[] };
    expect(result.tracks).toEqual([mic]);
    expect(onPartialFailure).toHaveBeenCalledOnce();
    expect(classifyCameraError(onPartialFailure.mock.calls[0][0], 'Windows NT 10.0')).toBe('meeting.cameraWontStartWindows');
  });

  it('stops at a denied permission instead of trying every camera', async () => {
    const denied = new DOMException('denied', 'NotAllowedError');
    const getUserMedia = vi.fn().mockRejectedValue(denied);
    stubDevices(getUserMedia, [{ deviceId: 'a', label: 'A' }, { deviceId: 'b', label: 'B' }]);
    await expect(LiveKitService.openCamera()).rejects.toBe(denied);
    expect(getUserMedia).toHaveBeenCalledOnce();
  });

  it('says "in use" off Windows, where that is what it means', () => {
    expect(classifyCameraError(notReadable(), 'iPhone OS 18')).toBe('meeting.mediaInUse');
  });
});

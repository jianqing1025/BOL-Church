import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveKitService } from './livekitService';

afterEach(() => vi.unstubAllGlobals());
describe('desktop capture when one device is missing', () => {
  it('joins without touching devices when both are off', async () => {
    const capture = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: capture } });
    expect(await LiveKitService.captureLocalMedia({ micOn: false, camOn: false })).toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });
  it.each([{ micOn: true, camOn: false }, { micOn: false, camOn: true }])('requests only the selected device: %s', async media => {
    const capture = vi.fn().mockResolvedValue({});
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: capture } });
    await LiveKitService.captureLocalMedia(media);
    expect(capture).toHaveBeenCalledExactlyOnceWith({ audio: media.micOn, video: media.camOn && LiveKitService.CAMERA_CONSTRAINTS });
  });
  it('keeps the camera available when Windows exposes no microphone', async () => {
    const camera = {} as MediaStream;
    const capture = vi.fn()
      .mockRejectedValueOnce(new DOMException('missing microphone', 'NotFoundError'))
      .mockRejectedValueOnce(new DOMException('missing microphone', 'NotFoundError'))
      .mockResolvedValueOnce(camera);
    vi.stubGlobal('window', { meetingDesktop: {} });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: capture } });
    expect(await LiveKitService.captureLocalMedia()).toBe(camera);
    const video = LiveKitService.CAMERA_CONSTRAINTS;
    expect(capture.mock.calls).toEqual([[{ audio: true, video }], [{ audio: true }], [{ video }]]);
  });
  it('does not retry a denied permission as another capture', async () => {
    const denied = new DOMException('denied', 'NotAllowedError');
    const capture = vi.fn().mockRejectedValue(denied);
    vi.stubGlobal('window', { meetingDesktop: {} });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: capture } });
    await expect(LiveKitService.captureLocalMedia()).rejects.toBe(denied);
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

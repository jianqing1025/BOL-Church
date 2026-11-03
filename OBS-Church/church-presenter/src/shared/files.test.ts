import { expect, it } from 'vitest';
import { fileUrl } from './files';

it('never sends empty or root-only media to the native local-file root', () => {
  for (const path of ['', ' ', '\n', '/', '//', '\\', '\\\\']) expect(fileUrl(path)).toBe('about:blank');
});

it('keeps actual local and remote video URLs intact', () => {
  expect(fileUrl('C:\\Media\\Sunday message.mp4')).toBe('http://absolute/C:/Media/Sunday%20message.mp4');
  expect(fileUrl('https://example.com/video.mp4')).toBe('https://example.com/video.mp4');
  expect(fileUrl('blob:https://example.com/video')).toBe('blob:https://example.com/video');
});

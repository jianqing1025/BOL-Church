import { afterEach, expect, it, vi } from 'vitest';
import { slidesOf } from './slides';
import { DEFAULT_LOOK } from './model';

vi.mock('./render', () => ({ makeMeasure: () => (text: string) => text.length * 20, openDeck: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it('attaches media to only the specified card of a paginated item', async () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({}) }) });
  const media = { id: 'audio', kind: 'audio' as const, url: 'music.mp3', x: 0, y: 0, w: 0, h: 0, volume: 1, loop: false, startSeconds: 0 };
  const slides = await slidesOf({
    id: 'song', kind: 'text', name: 'Song', title: '', body: 'First card\n\nSecond card', cardMedia: { '1': [media] },
  }, DEFAULT_LOOK);
  expect(slides).toHaveLength(2);
  expect(slides[0].spec.media).toBeUndefined();
  expect(slides[1].spec.media).toEqual([media]);
});

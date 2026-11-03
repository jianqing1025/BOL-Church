import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaRect, mountCardMedia } from './cardMedia';
import type { CardMedia } from './model';

const track = (patch: Partial<CardMedia> = {}): CardMedia => ({
  id: 'track', kind: 'video', url: 'D:/video.mp4', x: .2, y: .3, w: .4, h: .5,
  volume: .6, startSeconds: 12, loop: false, ...patch,
});

class Media {
  style: Record<string, string> = {};
  src = ''; volume = 1; loop = false; duration = 5; currentTime = 0;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn(); load = vi.fn(); remove = vi.fn(); removeAttribute = vi.fn();
  listeners: Record<string, () => void> = {};
  addEventListener(name: string, callback: () => void) { this.listeners[name] = callback; }
}

afterEach(() => vi.unstubAllGlobals());

describe('card media playback', () => {
  function setup() {
    const created: Media[] = [];
    vi.stubGlobal('HTMLVideoElement', Media);
    vi.stubGlobal('document', { createElement: () => { const media = new Media(); created.push(media); return media; } });
    const container = { appendChild: vi.fn() } as unknown as HTMLElement;
    return { created, container };
  }

  it('keeps a zero-size video playing sound and stops it on card changes', () => {
    const { created, container } = setup();
    const stop = mountCardMedia(container, [track({ w: 0, h: 0 })], true);
    expect(created[0].style.width).toBe('0%');
    expect(created[0].style.opacity).toBe('0');
    expect(created[0].volume).toBe(.6);
    expect(created[0].play).toHaveBeenCalledOnce();
    stop();
    expect(created[0].pause).toHaveBeenCalledOnce();
    expect(created[0].removeAttribute).toHaveBeenCalledWith('src');
    expect(created[0].remove).toHaveBeenCalledOnce();
  });

  it('waits for the play cue and clamps a seek past the end of the file', () => {
    const { created, container } = setup();
    mountCardMedia(container, [track()], false);
    expect(created[0].play).not.toHaveBeenCalled();
    created[0].listeners.loadedmetadata();
    expect(created[0].currentTime).toBe(4.99);
  });

  it('can play audio and video together with independent volume and looping', () => {
    const { created, container } = setup();
    mountCardMedia(container, [track({ kind: 'audio', volume: 0, loop: true }), track()], true);
    expect(created).toHaveLength(2);
    expect(created[0].volume).toBe(0);
    expect(created[0].loop).toBe(true);
    expect(created[0].style.opacity).toBe('0');
    expect(created[1].style.left).toBe('20%');
    expect(created.every((media) => media.play.mock.calls.length === 1)).toBe(true);
  });

  it('allows off-canvas placement and clamps negative sizes', () => {
    expect(mediaRect(track({ x: -2, y: 3, w: -1, h: 0 }))).toEqual({ x: -2, y: 3, w: 0, h: 0 });
  });
});

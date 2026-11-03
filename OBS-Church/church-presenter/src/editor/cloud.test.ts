import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('sessionStorage', { getItem: () => 'test-token' });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const content = () => ({ version: 1, defaultLook: { themeId: 'navy', layout: 'center' }, scenes: [], settings: { autoSwitch: true, captionOpacity: 70 } });

it('serializes saves and keeps edits made while a previous save is in flight', async () => {
  const bodies: { baseRev: number; content: ReturnType<typeof content> }[] = [];
  let finishFirst!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method !== 'PUT') return Response.json({ rev: 1, content: content() });
    bodies.push(JSON.parse(init.body as string));
    if (bodies.length === 1) return new Promise<Response>((resolve) => { finishFirst = resolve; });
    return Response.json({ rev: 3 });
  }));
  const cloud = await import('./cloud');
  await cloud.load();
  cloud.addScene('First');
  await vi.advanceTimersByTimeAsync(800);
  cloud.addScene('Second');
  await vi.advanceTimersByTimeAsync(800);
  expect(bodies).toHaveLength(1);
  finishFirst(Response.json({ rev: 2 }));
  await vi.advanceTimersByTimeAsync(800);
  expect(bodies).toHaveLength(2);
  expect(bodies[1].baseRev).toBe(2);
  expect(bodies[1].content.scenes).toHaveLength(2);
  expect(bodies[1].content.settings).toEqual(content().settings);
  expect(cloud.getState().rev).toBe(3);
});

it('preserves local edits on a cloud conflict until the user chooses a version', async () => {
  const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'PUT'
    ? Response.json({ rev: 5 }, { status: 409 }) : Response.json({ rev: 1, content: content() }));
  vi.stubGlobal('fetch', mockFetch);
  const cloud = await import('./cloud');
  await cloud.load();
  cloud.addScene('Unsaved local scene');
  await vi.advanceTimersByTimeAsync(800);
  expect(cloud.getState().save).toBe('conflict');
  expect(cloud.getState().content.scenes[0].name).toBe('Unsaved local scene');
  expect(mockFetch).toHaveBeenCalledTimes(2);
  await cloud.resolveConflict(false);
  expect(cloud.getState().content.scenes).toHaveLength(0);
});

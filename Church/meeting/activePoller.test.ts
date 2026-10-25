import { describe, expect, it } from 'vitest';
import { startActivePoller, type PollerEnv } from './activePoller';

/** A fake clock and page: `advance` runs due timers, the rest flips state. */
function fakeEnv() {
  let now = 0;
  let visible = true;
  let nextId = 1;
  const timers = new Map<number, { fn: () => void; ms: number; due: number }>();
  const visibility = new Set<() => void>();
  const activity = new Set<() => void>();
  const env: PollerEnv = {
    now: () => now,
    setInterval: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms, due: now + ms }); return id; },
    clearInterval: (id) => { timers.delete(id as number); },
    isVisible: () => visible,
    onVisibilityChange: (fn) => { visibility.add(fn); return () => visibility.delete(fn); },
    onActivity: (fn) => { activity.add(fn); return () => activity.delete(fn); },
  };
  return {
    env,
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
        if (!next || next[1].due > end) break;
        now = next[1].due;
        next[1].due += next[1].ms;
        next[1].fn();
      }
      now = end;
    },
    setVisible(v: boolean) { visible = v; visibility.forEach((fn) => fn()); },
    touch() { activity.forEach((fn) => fn()); },
    running: () => timers.size,
  };
}

const MIN = 60_000;

describe('startActivePoller', () => {
  it('refreshes at once and then on the interval while someone is around', () => {
    const page = fakeEnv();
    let calls = 0;
    startActivePoller(() => calls++, { intervalMs: 30_000, idleMs: 5 * MIN }, page.env);
    expect(calls).toBe(1);
    page.advance(2 * MIN);
    expect(calls).toBe(5);
  });

  it('stops once nobody has touched the page for the idle time, and a touch brings it back', () => {
    const page = fakeEnv();
    let calls = 0;
    startActivePoller(() => calls++, { intervalMs: 30_000, idleMs: 5 * MIN }, page.env);
    page.advance(60 * MIN);
    // An hour left alone costs only the first five minutes.
    expect(calls).toBe(10);
    expect(page.running()).toBe(0);
    page.touch();
    expect(calls).toBe(11);
    page.advance(MIN);
    expect(calls).toBe(13);
  });

  it('does not refresh while the page is hidden, and catches up when it is shown', () => {
    const page = fakeEnv();
    let calls = 0;
    startActivePoller(() => calls++, { intervalMs: 30_000, idleMs: 5 * MIN }, page.env);
    page.setVisible(false);
    page.touch();
    page.advance(30 * MIN);
    expect(calls).toBe(1);
    page.setVisible(true);
    expect(calls).toBe(2);
  });

  it('lets go of its timer and listeners when stopped', () => {
    const page = fakeEnv();
    let calls = 0;
    const stop = startActivePoller(() => calls++, { intervalMs: 30_000, idleMs: 5 * MIN }, page.env);
    stop();
    page.touch();
    page.advance(10 * MIN);
    expect(calls).toBe(1);
    expect(page.running()).toBe(0);
  });
});

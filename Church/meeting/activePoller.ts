/**
 * Refreshes something on a timer only while a person is plausibly looking.
 *
 * The room list's head-counts cost a Durable Object request per room per
 * refresh, and the daily allowance is shared by the whole account. A window
 * left open on the room list — the desktop app never slows its timers in the
 * background — used to refresh every 10 seconds all day and night, which on
 * its own spent half the allowance. So: not while the page is hidden, and not
 * once nobody has touched it for a while; any touch brings it straight back.
 */

export interface PollerEnv {
  now: () => number;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  isVisible: () => boolean;
  /** Subscribes to visibility changes and to signs of a person (pointer, keys, focus). */
  onVisibilityChange: (fn: () => void) => () => void;
  onActivity: (fn: () => void) => () => void;
}

export interface PollerOptions { intervalMs: number; idleMs: number }

export function startActivePoller(refresh: () => void, { intervalMs, idleMs }: PollerOptions, env: PollerEnv): () => void {
  let lastActivity = env.now();
  let timer: unknown = null;

  const stop = () => {
    if (timer === null) return;
    env.clearInterval(timer);
    timer = null;
  };
  const tick = () => {
    if (!env.isVisible() || env.now() - lastActivity >= idleMs) { stop(); return; }
    refresh();
  };
  const start = () => { if (timer === null) timer = env.setInterval(tick, intervalMs); };
  /** A person is here: refresh now if we had stopped, and keep going. */
  const wake = () => {
    lastActivity = env.now();
    if (timer !== null || !env.isVisible()) return;
    refresh();
    start();
  };

  const offVisibility = env.onVisibilityChange(() => { if (env.isVisible()) wake(); else stop(); });
  const offActivity = env.onActivity(wake);
  if (env.isVisible()) { refresh(); start(); }
  return () => { stop(); offVisibility(); offActivity(); };
}

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel', 'focus'] as const;

/** The browser's own clock, timers and events. */
export function browserPollerEnv(): PollerEnv {
  return {
    now: () => Date.now(),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id as number),
    isVisible: () => document.visibilityState !== 'hidden',
    onVisibilityChange: (fn) => {
      document.addEventListener('visibilitychange', fn);
      return () => document.removeEventListener('visibilitychange', fn);
    },
    onActivity: (fn) => {
      for (const type of ACTIVITY_EVENTS) window.addEventListener(type, fn, { passive: true });
      return () => { for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, fn); };
    },
  };
}

import { sendToHost } from './host';

/**
 * Where the playing video or audio is — the video slide's, or a card's own — reported from the
 * output page to OBS for the progress bar under the preview; and seeking from that bar.
 * YouTube players tell where they are through their postMessage API (their link has enablejsapi=1).
 */

export interface Progress { current: number; duration: number; playing: boolean }

const youtube = new Map<MessageEventSource, Progress>();
const hostOf = (origin: string) => { try { return new URL(origin).hostname; } catch { return ''; } };

window.addEventListener('message', (event) => {
  if (!event.source || !/(^|\.)youtube(-nocookie)?\.com$/.test(hostOf(event.origin))) return;
  let data: { info?: { currentTime?: unknown; duration?: unknown; playerState?: unknown } } | null;
  try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
  const info = data?.info;
  if (!info || typeof info !== 'object') return;
  const known = youtube.get(event.source) ?? { current: 0, duration: 0, playing: false };
  if (typeof info.currentTime === 'number') known.current = info.currentTime;
  if (typeof info.duration === 'number') known.duration = info.duration;
  if (typeof info.playerState === 'number') known.playing = info.playerState === 1;
  youtube.set(event.source, known);
});

type Player = HTMLMediaElement | HTMLIFrameElement;

/** A player's position; a YouTube player not heard from yet is asked to start reporting. */
function progressOf(player: Player): Progress | null {
  if (player instanceof HTMLMediaElement) {
    return { current: player.currentTime, duration: Number.isFinite(player.duration) ? player.duration : 0, playing: !player.paused };
  }
  const target = player.contentWindow;
  if (!target || !/youtube/.test(player.src)) return null;
  const known = youtube.get(target);
  if (!known) target.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
  return known ?? null;
}

/** The player the bar is about: the one playing, else the first one with a length. */
function current(stage: HTMLElement): { player: Player; progress: Progress } | null {
  const found = [...stage.querySelectorAll<Player>('video, audio, iframe')]
    .filter((player) => !player.dataset.leaving)
    .map((player) => ({ player, progress: progressOf(player) }))
    .filter((entry): entry is { player: Player; progress: Progress } => !!entry.progress && entry.progress.duration > 0);
  return found.find((entry) => entry.progress.playing) ?? found[0] ?? null;
}

export function trackProgress(stage: HTMLElement) {
  let last = '';
  window.setInterval(() => {
    const now = current(stage)?.progress ?? { current: 0, duration: 0, playing: false };
    const key = `${Math.round(now.current * 4)}|${Math.round(now.duration)}|${now.playing}`;
    if (key === last) return;
    last = key;
    sendToHost({ type: 'media-progress', ...now });
  }, 250);

  window.addEventListener('church-seek', (event) => {
    const seconds = Number((event as CustomEvent<{ seconds?: unknown }>).detail?.seconds);
    const target = current(stage);
    if (!target || !Number.isFinite(seconds)) return;
    const to = Math.max(0, Math.min(seconds, target.progress.duration - 0.1));
    if (target.player instanceof HTMLMediaElement) target.player.currentTime = to;
    else target.player.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [to, true] }), '*');
  });
}

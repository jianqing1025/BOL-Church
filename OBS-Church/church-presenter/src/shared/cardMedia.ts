import { fileUrl, youTubeId } from './files';
import type { CardMedia } from './model';

export function mediaRect(media: CardMedia) {
  const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
  return { x: finite(media.x, 0), y: finite(media.y, 0), w: Math.max(0, finite(media.w, 1)), h: Math.max(0, finite(media.h, 1)) };
}

/** Mounted once per cue; cleanup stops sound immediately, including hidden videos. */
export function mountCardMedia(container: HTMLElement, tracks: readonly CardMedia[], playing: boolean, onError?: (message: string) => void) {
  const disposers: (() => void)[] = [];
  for (const track of tracks) {
    if (!track.url.trim()) continue;
    const rect = mediaRect(track);
    const youtube = track.kind === 'video' ? youTubeId(track.url) : null;
    let element: HTMLElement;
    if (youtube) {
      const frame = document.createElement('iframe');
      const params = new URLSearchParams({ autoplay: playing ? '1' : '0', controls: '0', playsinline: '1', rel: '0', enablejsapi: '1', start: String(Math.max(0, Math.floor(track.startSeconds))), loop: track.loop ? '1' : '0', playlist: youtube });
      frame.src = `https://www.youtube.com/embed/${youtube}?${params}`;
      frame.allow = 'autoplay; encrypted-media';
      element = frame;
      disposers.push(() => { frame.src = 'about:blank'; frame.remove(); });
    } else {
      const media = document.createElement(track.kind);
      media.src = fileUrl(track.url);
      media.preload = 'auto';
      media.loop = track.loop;
      media.volume = Math.max(0, Math.min(1, track.volume));
      if (media instanceof HTMLVideoElement) { media.playsInline = true; media.style.objectFit = 'contain'; }
      media.addEventListener('loadedmetadata', () => {
        const start = Math.max(0, track.startSeconds || 0);
        media.currentTime = Number.isFinite(media.duration) ? Math.min(start, Math.max(0, media.duration - .01)) : start;
      }, { once: true });
      media.addEventListener('error', () => onError?.(`Cannot load media: ${track.fileName || track.url}`));
      element = media;
      if (playing) void media.play().catch((error: unknown) => onError?.(String(error)));
      disposers.push(() => { media.pause(); media.removeAttribute('src'); media.load(); media.remove(); });
    }
    Object.assign(element.style, {
      position: 'absolute', left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, right: 'auto', bottom: 'auto',
      width: `${rect.w * 100}%`, height: `${rect.h * 100}%`, border: '0', pointerEvents: 'none',
      // Keep a real media element alive so shrinking a video to zero retains its sound.
      opacity: track.kind === 'audio' || rect.w === 0 || rect.h === 0 ? '0' : '1',
    });
    container.appendChild(element);
  }
  return () => disposers.forEach((dispose) => dispose());
}

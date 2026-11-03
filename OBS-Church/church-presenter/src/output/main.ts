import { mountCardMedia } from '../shared/cardMedia';
import { asCaption } from '../shared/caption';
import { trackProgress } from '../shared/mediaProgress';
import { onShow, sendToHost } from '../shared/host';
import { fileUrl, youTubeId } from '../shared/files';
import type { SlideSpec } from '../shared/model';
import { drawSlide } from '../shared/render';
import { SLIDE_H, SLIDE_W } from '../shared/textLayout';

/**
 * 教會簡報輸出：OBS 裡的瀏覽器來源（1920×1080）。收到「顯示這一張」就畫出來，
 * 兩張畫布交替淡入，影片則直接播放（YouTube 或影片檔）。
 */

const stage = document.getElementById('stage')!;
const FADE_MS = 400;

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SLIDE_W;
  canvas.height = SLIDE_H;
  canvas.className = 'layer';
  canvas.style.opacity = '0';
  stage.appendChild(canvas);
  return canvas;
}

const canvases = [makeCanvas(), makeCanvas()];
let front = 0;
let video: HTMLElement | null = null;
/** Only the latest request may paint: a slow PPT page never lands over a newer slide. */
let ticket = 0;
let stopCardMedia: (() => void) | null = null;

function stopVideo() {
  if (!video) return;
  const old = video;
  video = null;
  old.style.opacity = '0';
  old.dataset.leaving = '1';
  if (old instanceof HTMLVideoElement) old.pause();
  window.setTimeout(() => old.remove(), FADE_MS);
}

function showVideo(spec: Extract<SlideSpec, { kind: 'video' }>) {
  stopVideo();
  const id = youTubeId(spec.url);
  let element: HTMLElement;
  if (id) {
    const frame = document.createElement('iframe');
    const params = new URLSearchParams({ autoplay: '1', controls: '0', rel: '0', modestbranding: '1', playsinline: '1', enablejsapi: '1', start: String(Math.max(0, Math.floor(spec.startSeconds))) });
    frame.src = `https://www.youtube.com/embed/${id}?${params}`;
    frame.allow = 'autoplay; encrypted-media';
    element = frame;
  } else {
    const el = document.createElement('video');
    el.src = fileUrl(spec.url);
    el.autoplay = true;
    el.playsInline = true;
    el.style.background = '#000';
    el.style.objectFit = 'contain';
    el.addEventListener('loadedmetadata', () => { if (spec.startSeconds) el.currentTime = spec.startSeconds; }, { once: true });
    element = el;
  }
  element.className = 'layer';
  element.style.opacity = '0';
  stage.appendChild(element);
  video = element;
  requestAnimationFrame(() => { element.style.opacity = '1'; });
}

async function show(spec: SlideSpec) {
  const mine = ++ticket;
  stopCardMedia?.(); stopCardMedia = null;
  if (spec.kind === 'video') {
    showVideo(spec);
    stopCardMedia = mountCardMedia(stage, spec.media ?? [], spec.mediaPlayback?.playing ?? false, console.error);
    return;
  }
  const back = canvases[1 - front];
  const ctx = back.getContext('2d')!;
  ctx.clearRect(0, 0, SLIDE_W, SLIDE_H);
  try {
    await drawSlide(back, spec);
  } catch (error) {
    console.error(error);
    return;
  }
  if (mine !== ticket) return;
  stopVideo();
  back.style.opacity = '1';
  canvases[front].style.opacity = '0';
  // The new canvas on top while it fades in.
  stage.appendChild(back);
  front = 1 - front;
  stopCardMedia = mountCardMedia(stage, spec.media ?? [], spec.mediaPlayback?.playing ?? false, console.error);
}

/**
 * ?mode=caption — the Camera + lower third feed: whatever a text slide's own layout, its words go
 * centred at the bottom on a see-through background; anything else (pictures, PPT, video) shows nothing.
 */
const captionMode = new URLSearchParams(location.search).get('mode') === 'caption';

onShow((spec) => { void show(captionMode ? asCaption(spec) : spec); });

// The progress bar on the panel's live card (not for the caption feed, which plays nothing).
if (!captionMode) trackProgress(stage);

// Tell OBS this page is ready, so it sends whatever is on screen now.
sendToHost({ type: 'output-ready' });

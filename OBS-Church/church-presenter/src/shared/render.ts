import { PptxDeck } from '@church/meeting/agenda/pptx/pptxDeck';
import { baseName, fileUrl, youTubeId } from './files';
import type { LayoutMode, Look, SlideSpec } from './model';
import { fitText, MODES, SLIDE_H, SLIDE_W } from './textLayout';
import { LANG } from './i18n';
import { themeArt, themeById, type Theme } from './themes';

/**
 * Draws one slide. The panel's thumbnails and the output page call the same
 * code, so what the operator clicks is exactly what goes on screen. The
 * canvas may be any size; drawing is in 1920×1080 slide units, scaled.
 */

export const SLIDE_FONT = '"Microsoft JhengHei", "Noto Sans TC", "PingFang TC", "Microsoft YaHei", sans-serif';

/** Serif themes (ProPresenter-style "classic" text). */
export const SERIF_FONT = '"Noto Serif TC", "PMingLiU", "MingLiU", "Songti TC", Georgia, "Times New Roman", serif';

const fontOf = (theme: Theme) => (theme.font === 'serif' ? SERIF_FONT : SLIDE_FONT);

export const makeMeasure = (ctx: CanvasRenderingContext2D, weight: number, family: string = SLIDE_FONT) =>
  (text: string, px: number) => { ctx.font = `${weight} ${px}px ${family}`; return ctx.measureText(text).width; };

// ---------- files, decoded once ----------

const images = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  let image = images.get(src);
  if (!image) {
    image = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(LANG === 'zh' ? `無法開啟圖片：${src}` : `Cannot open image: ${src}`));
      img.src = src;
    });
    image.catch(() => images.delete(src));
    images.set(src, image);
    // Keep the cache from growing without end.
    if (images.size > 80) images.delete(images.keys().next().value!);
  }
  return image;
}

const decks = new Map<string, Promise<PptxDeck>>();

/** A PowerPoint file, read and parsed once (the last few are kept). */
export function openDeck(path: string): Promise<PptxDeck> {
  let deck = decks.get(path);
  if (!deck) {
    deck = fetch(fileUrl(path)).then(async (res) => {
      if (!res.ok) throw new Error(LANG === 'zh' ? `無法讀取 PPT：${baseName(path)}（${res.status}）` : `Cannot read PPT: ${baseName(path)} (${res.status})`);
      return PptxDeck.fromBlob(await res.blob());
    });
    deck.catch(() => decks.delete(path));
    decks.set(path, deck);
    while (decks.size > 4) decks.delete(decks.keys().next().value!);
  }
  return deck;
}

// ---------- drawing ----------

async function paintBackground(ctx: CanvasRenderingContext2D, theme: Theme) {
  if (theme.overlay) {
    ctx.clearRect(0, 0, SLIDE_W, SLIDE_H);
    return;
  }
  const art = themeArt(theme);
  if (art) {
    ctx.drawImage(await art, 0, 0, SLIDE_W, SLIDE_H);
    if (theme.dim) {
      ctx.fillStyle = `rgba(0, 0, 0, ${theme.dim})`;
      ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
    }
    return;
  }
  const stops = theme.stops ?? ['#000', '#000'];
  const gradient = ctx.createLinearGradient(0, 0, SLIDE_W, SLIDE_H);
  stops.forEach((color, i) => gradient.addColorStop(stops.length > 1 ? i / (stops.length - 1) : 0, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
  if (theme.glow) {
    const glow = ctx.createRadialGradient(SLIDE_W * 0.15, SLIDE_H * 0.1, 0, SLIDE_W * 0.15, SLIDE_H * 0.1, SLIDE_W * 0.7);
    glow.addColorStop(0, theme.glow);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
  }
}

function withShadow(ctx: CanvasRenderingContext2D, theme: Theme, px: number, draw: () => void) {
  ctx.save();
  if (theme.shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = Math.max(4, px * 0.18);
    ctx.shadowOffsetY = Math.max(2, px * 0.04);
  }
  draw();
  ctx.restore();
}

function drawTextSlide(ctx: CanvasRenderingContext2D, theme: Theme, mode: LayoutMode, title: string, paragraphs: readonly string[], bandOpacity = 0.7, textBox?: { x: number; y: number; w: number; h: number }) {
  const spec = MODES[mode];
  const family = fontOf(theme);
  const laid = fitText(mode, title, paragraphs, makeMeasure(ctx, 400, family), makeMeasure(ctx, 700, family));
  /* ProPresenter's stroke: an outline under the letters. */
  const draw = (line: string, x: number, y: number, px: number) => {
    if (theme.stroke) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, px * 0.09);
      ctx.strokeStyle = theme.stroke;
      ctx.strokeText(line, x, y);
      ctx.restore();
    }
    ctx.fillText(line, x, y);
  };

  if (spec.band) {
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, bandOpacity))})`;
    ctx.fillRect(spec.band.x, spec.band.y, spec.band.w, spec.band.h);
  }

  if (textBox) {
    const original = spec.box;
    ctx.translate(textBox.x * SLIDE_W, textBox.y * SLIDE_H);
    ctx.scale(textBox.w * SLIDE_W / original.w, textBox.h * SLIDE_H / original.h);
    ctx.translate(-original.x, -original.y);
  }
  const { box } = spec;
  // Main slides may contain much more text than a caption. Keep every line inside the lower third.
  if (mode === 'lowerThird' && laid.height > box.h) {
    const fit = box.h / laid.height;
    ctx.translate(box.x + box.w * (1 - fit) / 2, box.y);
    ctx.scale(fit, fit);
    ctx.translate(-box.x, -box.y);
  }
  let y = box.y + Math.max(0, (box.h - laid.height) / 2);
  const x = spec.align === 'center' ? box.x + box.w / 2 : box.x;
  ctx.textAlign = spec.align;
  ctx.textBaseline = 'top';

  ctx.font = `700 ${laid.titlePx}px ${family}`;
  ctx.fillStyle = theme.title;
  for (const line of laid.titleLines) {
    withShadow(ctx, theme, laid.titlePx, () => draw(line, x, y, laid.titlePx));
    y += laid.titlePx * 1.25;
  }
  if (laid.titleLines.length) y += spec.gap;

  const step = laid.bodyPx * spec.lineHeight;
  ctx.font = `400 ${laid.bodyPx}px ${family}`;
  ctx.fillStyle = theme.body;
  for (const line of laid.bodyLines) {
    withShadow(ctx, theme, laid.bodyPx, () => draw(line, x, y + (step - laid.bodyPx) / 2, laid.bodyPx));
    y += step;
  }
  ctx.textAlign = 'left';
}

function drawCaption(ctx: CanvasRenderingContext2D, theme: Theme, text: string, y: number) {
  if (!text.trim()) return;
  ctx.font = `500 46px ${SLIDE_FONT}`;
  ctx.fillStyle = theme.overlay ? '#ffffff' : theme.body;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  withShadow(ctx, theme, 46, () => ctx.fillText(text.trim(), SLIDE_W / 2, y, SLIDE_W - 300));
  ctx.textAlign = 'left';
}

async function drawImageSlide(ctx: CanvasRenderingContext2D, theme: Theme, path: string, fill: boolean, caption: string) {
  const image = await loadImage(fileUrl(path));
  if (fill) {
    const scale = Math.max(SLIDE_W / image.width, SLIDE_H / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, (SLIDE_W - w) / 2, (SLIDE_H - h) / 2, w, h);
    if (caption.trim()) drawCaption(ctx, { ...theme, shadow: true }, caption, SLIDE_H - 130);
    return;
  }
  const captionSpace = caption.trim() ? 100 : 0;
  const boxW = SLIDE_W - 160;
  const boxH = SLIDE_H - 140 - captionSpace;
  const scale = Math.min(boxW / image.width, boxH / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  const x = (SLIDE_W - w) / 2;
  const y = 70 + (boxH - h) / 2;
  ctx.drawImage(image, x, y, w, h);
  drawCaption(ctx, theme, caption, y + h + 28);
}

/** A video's stand-in on a thumbnail: its picture (YouTube's), a play mark and its name. */
/** One frame of a video file (a second in, or a tenth of the way for short ones), for its card. */
const videoFrames = new Map<string, Promise<HTMLCanvasElement>>();
function videoFrame(url: string): Promise<HTMLCanvasElement> {
  let frame = videoFrames.get(url);
  if (!frame) {
    frame = new Promise<HTMLCanvasElement>((resolve, reject) => {
      const video = document.createElement('video');
      const done = (error?: unknown) => {
        window.clearTimeout(timer);
        video.removeAttribute('src');
        video.load();
        if (error) reject(error);
      };
      const timer = window.setTimeout(() => done(new Error('video frame timeout')), 15000);
      video.muted = true;
      video.preload = 'auto';
      video.playsInline = true;
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = Number.isFinite(video.duration) ? Math.min(1, video.duration / 10) : 0;
      }, { once: true });
      video.addEventListener('seeked', () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas);
        done();
      }, { once: true });
      video.addEventListener('error', () => done(new Error('video frame unavailable')), { once: true });
      video.src = fileUrl(url);
    });
    // A failure is not kept: the file may arrive later (a sync still downloading it).
    frame.catch(() => videoFrames.delete(url));
    videoFrames.set(url, frame);
  }
  return frame;
}

async function drawVideoCard(ctx: CanvasRenderingContext2D, theme: Theme, url: string, title: string) {
  const id = youTubeId(url);
  if (url.trim()) {
    try {
      // A YouTube video's own thumbnail; a video file's picture a second in.
      const thumb: HTMLImageElement | HTMLCanvasElement = id
        ? await loadImage(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)
        : await videoFrame(url);
      const scale = Math.max(SLIDE_W / thumb.width, SLIDE_H / thumb.height);
      ctx.drawImage(thumb, (SLIDE_W - thumb.width * scale) / 2, (SLIDE_H - thumb.height * scale) / 2, thumb.width * scale, thumb.height * scale);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
    } catch { /* offline, or the file not here (yet): the theme's background stays */ }
  }
  ctx.beginPath();
  ctx.arc(SLIDE_W / 2, SLIDE_H / 2 - 40, 130, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(SLIDE_W / 2 - 40, SLIDE_H / 2 - 115);
  ctx.lineTo(SLIDE_W / 2 + 70, SLIDE_H / 2 - 40);
  ctx.lineTo(SLIDE_W / 2 - 40, SLIDE_H / 2 + 35);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  drawCaption(ctx, { ...theme, shadow: true }, title || (id ? 'YouTube' : baseName(url)), SLIDE_H / 2 + 140);
}

export interface DrawOptions {
  /** Thumbnails stand a video's card in for the video itself. */
  thumbnail?: boolean;
}

/** Draws `spec` over the whole canvas. Resolves once everything it needs has loaded. */
export async function drawSlide(canvas: HTMLCanvasElement, spec: SlideSpec, options: DrawOptions = {}): Promise<void> {
  const ctx = canvas.getContext('2d')!;
  if (spec.kind === 'ppt') {
    const deck = await openDeck(spec.path);
    await deck.renderPage(canvas, spec.page);
    return;
  }
  ctx.save();
  ctx.setTransform(canvas.width / SLIDE_W, 0, 0, canvas.height / SLIDE_H, 0, 0);
  try {
    if (spec.kind === 'black') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
      return;
    }
    if (spec.kind === 'blank') {
      // On screen: see-through, so a blanked slide never hides what is layered beneath it
      // (on its own it reads as black). On a thumbnail: black.
      if (options.thumbnail) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
      } else {
        ctx.clearRect(0, 0, SLIDE_W, SLIDE_H);
      }
      return;
    }
    const theme = themeById(spec.look.themeId);
    await paintBackground(ctx, theme);
    switch (spec.kind) {
      case 'background':
        return;
      case 'text':
        drawTextSlide(ctx, theme, spec.look.layout, spec.title + spec.pageLabel, spec.paragraphs, spec.look.bandOpacity, spec.look.textBox);
        return;
      case 'image':
        await drawImageSlide(ctx, theme, spec.path, spec.fill, spec.caption);
        return;
      case 'video':
        if (options.thumbnail) await drawVideoCard(ctx, theme, spec.url, spec.title);
        return;
    }
  } finally {
    ctx.restore();
  }
}

/** The look a theme picker preview uses: a sample slide in that theme. */
export function sampleSpec(look: Look): SlideSpec {
  return LANG === 'zh'
    ? { kind: 'text', look, title: '約翰福音 3:16', paragraphs: ['神愛世人，甚至將他的獨生子賜給他們，叫一切信他的，不至滅亡，反得永生。'], pageLabel: '' }
    : { kind: 'text', look, title: 'John 3:16', paragraphs: ['For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'], pageLabel: '' };
}

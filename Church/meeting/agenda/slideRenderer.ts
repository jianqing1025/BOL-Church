import { slideTheme, type SlideTheme } from './slideThemes';
import {
  FOOTER_SPACE, MARGIN_X, MARGIN_Y, SCRIPTURE_LINE_HEIGHT, SLIDE_HEIGHT, SLIDE_WIDTH, TITLE_GAP, TITLE_PX,
  type Measure, type ScripturePage,
} from './slideLayout';

export const SLIDE_FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';

export function createSlideCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SLIDE_WIDTH;
  canvas.height = SLIDE_HEIGHT;
  return canvas;
}

export function canvasMeasure(ctx: CanvasRenderingContext2D, weight = 400): Measure {
  return (text, px) => { ctx.font = `${weight} ${px}px ${SLIDE_FONT}`; return ctx.measureText(text).width; };
}

/**
 * Text in the theme's color. The overlay theme has no background of its own,
 * so its text is outlined and shadowed like a subtitle, readable over anything.
 */
function paintText(ctx: CanvasRenderingContext2D, theme: SlideTheme, text: string, x: number, y: number, px: number, maxWidth?: number) {
  if (theme.overlay) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, px * 0.09);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = px * 0.12;
    ctx.strokeText(text, x, y, maxWidth);
    ctx.restore();
  }
  ctx.fillText(text, x, y, maxWidth);
}

function paintFooter(ctx: CanvasRenderingContext2D, footer: string, theme: SlideTheme) {
  ctx.font = `400 26px ${SLIDE_FONT}`;
  ctx.fillStyle = theme.footer;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  paintText(ctx, theme, footer, SLIDE_WIDTH - MARGIN_X, SLIDE_HEIGHT - 50, 26);
  ctx.textAlign = 'left';
}

/**
 * The theme's background: its gradient corner to corner, with a soft glow in
 * the top left. The overlay theme is black here — a shared video has no
 * transparency — and has no background at all in an exported PowerPoint.
 */
export function paintBackground(ctx: CanvasRenderingContext2D, theme: SlideTheme = slideTheme(undefined), seeThrough = false) {
  if (theme.overlay || !theme.stops.length) {
    // A preview may show what is behind it; a shared slide is solid black.
    if (seeThrough) ctx.clearRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
    else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT); }
    return;
  }
  const gradient = ctx.createLinearGradient(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  theme.stops.forEach((color, i) => gradient.addColorStop(theme.stops.length > 1 ? i / (theme.stops.length - 1) : 0, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  if (theme.glow) {
    const glow = ctx.createRadialGradient(SLIDE_WIDTH * 0.15, SLIDE_HEIGHT * 0.1, 0, SLIDE_WIDTH * 0.15, SLIDE_HEIGHT * 0.1, SLIDE_WIDTH * 0.7);
    glow.addColorStop(0, theme.glow);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  }
}

/**
 * 一頁經文或文字（見 layoutScripturePages、layoutTextPages），用這份查經資料的模板；
 * 字比標題大、行距較緊。內容短時置中，滿頁時從上邊界開始。
 */
export function drawScripturePage(
  canvas: HTMLCanvasElement, page: ScripturePage, footer: string, align?: 'center', theme: SlideTheme = slideTheme(undefined), seeThrough = false,
): void {
  const ctx = canvas.getContext('2d')!;
  paintBackground(ctx, theme, seeThrough);
  const titleHeight = page.titleLines.length ? page.titleLines.length * TITLE_PX * 1.3 + TITLE_GAP : 0;
  const lineStep = page.bodyPx * SCRIPTURE_LINE_HEIGHT;
  const area = SLIDE_HEIGHT - 2 * MARGIN_Y - FOOTER_SPACE;
  let y = MARGIN_Y + Math.max(0, (area - titleHeight - page.bodyLines.length * lineStep) / 2);
  const centered = align === 'center';
  const x = centered ? SLIDE_WIDTH / 2 : MARGIN_X;
  ctx.textBaseline = 'top';
  ctx.textAlign = centered ? 'center' : 'left';
  ctx.font = `700 ${TITLE_PX}px ${SLIDE_FONT}`;
  ctx.fillStyle = theme.title;
  for (const line of page.titleLines) { paintText(ctx, theme, line, x, y, TITLE_PX); y += TITLE_PX * 1.3; }
  if (page.titleLines.length) y += TITLE_GAP;
  ctx.font = `400 ${page.bodyPx}px ${SLIDE_FONT}`;
  ctx.fillStyle = theme.body;
  for (const line of page.bodyLines) {
    paintText(ctx, theme, line, x, y + (lineStep - page.bodyPx) / 2, page.bodyPx);
    y += lineStep;
  }
  ctx.textAlign = 'left';
  paintFooter(ctx, footer, theme);
}

export function drawImageSlide(
  canvas: HTMLCanvasElement,
  slide: { image: CanvasImageSource & { width: number; height: number }; caption: string; footer: string },
  theme: SlideTheme = slideTheme(undefined),
): void {
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = theme.picture;
  ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  const captionSpace = slide.caption.trim() ? 90 : 0;
  const boxW = SLIDE_WIDTH - 120;
  const boxH = SLIDE_HEIGHT - 120 - captionSpace - FOOTER_SPACE / 2;
  const scale = Math.min(boxW / slide.image.width, boxH / slide.image.height);
  const w = slide.image.width * scale;
  const h = slide.image.height * scale;
  const x = (SLIDE_WIDTH - w) / 2;
  const y = 60 + (boxH - h) / 2;
  ctx.drawImage(slide.image, x, y, w, h);
  if (captionSpace) {
    ctx.font = `500 44px ${SLIDE_FONT}`;
    ctx.fillStyle = theme.body;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    paintText(ctx, theme, slide.caption.trim(), SLIDE_WIDTH / 2, y + h + 26, 44, SLIDE_WIDTH - 2 * MARGIN_X);
    ctx.textAlign = 'left';
  }
  paintFooter(ctx, slide.footer, theme);
}

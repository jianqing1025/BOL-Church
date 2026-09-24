import {
  FOOTER_SPACE, LINE_HEIGHT, MARGIN_X, MARGIN_Y, SLIDE_HEIGHT, SLIDE_WIDTH, TITLE_GAP, TITLE_PX,
  layoutTextSlide, type Measure, type TextSlideLayout,
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

function paintFooter(ctx: CanvasRenderingContext2D, footer: string) {
  ctx.font = `400 26px ${SLIDE_FONT}`;
  ctx.fillStyle = 'rgba(241, 245, 249, 0.55)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(footer, SLIDE_WIDTH - MARGIN_X, SLIDE_HEIGHT - 50);
  ctx.textAlign = 'left';
}

/** Deep blue, like a sanctuary screen. Returns the layout so a caller can warn on overflow. */
export function drawTextSlide(canvas: HTMLCanvasElement, slide: { title: string; body: string; footer: string }): TextSlideLayout {
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  gradient.addColorStop(0, '#0f2a5c');
  gradient.addColorStop(1, '#1e3a8a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);

  const layout = layoutTextSlide(slide.title, slide.body, canvasMeasure(ctx));
  const titleHeight = layout.titleLines.length ? layout.titleLines.length * TITLE_PX * 1.3 + TITLE_GAP : 0;
  const bodyHeight = layout.bodyLines.length * layout.bodyPx * LINE_HEIGHT;
  const area = SLIDE_HEIGHT - 2 * MARGIN_Y - FOOTER_SPACE;
  // Short slides sit in the middle; full ones start at the top margin.
  let y = MARGIN_Y + Math.max(0, (area - titleHeight - bodyHeight) / 2);
  ctx.textBaseline = 'top';

  ctx.font = `700 ${TITLE_PX}px ${SLIDE_FONT}`;
  ctx.fillStyle = '#fde68a';
  for (const line of layout.titleLines) { ctx.fillText(line, MARGIN_X, y); y += TITLE_PX * 1.3; }
  if (layout.titleLines.length) y += TITLE_GAP;

  ctx.font = `400 ${layout.bodyPx}px ${SLIDE_FONT}`;
  ctx.fillStyle = '#f1f5f9';
  const lineStep = layout.bodyPx * LINE_HEIGHT;
  for (const line of layout.bodyLines) {
    if (y + lineStep > SLIDE_HEIGHT - MARGIN_Y) break;
    ctx.fillText(line, MARGIN_X, y + (lineStep - layout.bodyPx) / 2);
    y += lineStep;
  }
  paintFooter(ctx, slide.footer);
  return layout;
}

export function drawImageSlide(
  canvas: HTMLCanvasElement,
  slide: { image: CanvasImageSource & { width: number; height: number }; caption: string; footer: string },
): void {
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0b1220';
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
    ctx.fillStyle = '#f1f5f9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(slide.caption.trim(), SLIDE_WIDTH / 2, y + h + 26, SLIDE_WIDTH - 2 * MARGIN_X);
    ctx.textAlign = 'left';
  }
  paintFooter(ctx, slide.footer);
}

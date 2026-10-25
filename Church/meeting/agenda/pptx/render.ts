import { cssColor, type Rgba } from './color';
import { layoutText, type FontMeasure } from './layoutText';
import type { CustomPath, Deck, Fill, Geometry, GroupElement, Line, PictureElement, ShapeElement, Slide, SlideElement, SlideStep, TableElement, TextBody, Xfrm } from './model';

export type DrawableImage = CanvasImageSource & { width: number; height: number };
/** Decoded pictures by part name; null when the picture cannot be shown (EMF, say). */
export type ImageLookup = (part: string) => DrawableImage | null | undefined;

type Ctx = CanvasRenderingContext2D;

const LINE_PRESETS = new Set(['line', 'straightConnector1', 'bentConnector2', 'bentConnector3', 'bentConnector4', 'bentConnector5', 'curvedConnector2', 'curvedConnector3', 'curvedConnector4', 'curvedConnector5', 'lineInv']);

/** Where the deck's slide sits on the canvas: centred, as large as fits. */
export function slideViewport(deck: Pick<Deck, 'width' | 'height'>, width: number, height: number) {
  const scale = Math.min(width / deck.width, height / deck.height);
  return { scale, x: (width - deck.width * scale) / 2, y: (height - deck.height * scale) / 2, w: deck.width * scale, h: deck.height * scale };
}

/** Traces a preset shape's outline in the box (x, y, w, h). */
function tracePreset(ctx: Ctx, name: string, adj: Record<string, number>, x: number, y: number, w: number, h: number): boolean {
  const ss = Math.min(w, h);
  const a = (key: string, fallback: number) => (adj[key] ?? fallback) / 100000;
  const poly = (pts: [number, number][]) => { ctx.moveTo(x + pts[0][0], y + pts[0][1]); for (const [px, py] of pts.slice(1)) ctx.lineTo(x + px, y + py); ctx.closePath(); };
  switch (name) {
    case 'ellipse': case 'flowChartConnector': case 'cloud': case 'donut':
      ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      return true;
    case 'roundRect': case 'flowChartAlternateProcess': case 'round1Rect': case 'round2SameRect': case 'round2DiagRect': case 'flowChartTerminator': {
      const r = name === 'flowChartTerminator' ? ss / 2 : Math.min(ss / 2, ss * a('adj', 16667));
      ctx.roundRect(x, y, w, h, r);
      return true;
    }
    case 'triangle': { const ax = w * a('adj', 50000); poly([[ax, 0], [w, h], [0, h]]); return true; }
    case 'rtTriangle': poly([[0, 0], [w, h], [0, h]]); return true;
    case 'diamond': case 'flowChartDecision': poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]); return true;
    case 'parallelogram': case 'flowChartInputOutput': { const o = ss * a('adj', 25000); poly([[o, 0], [w, 0], [w - o, h], [0, h]]); return true; }
    case 'trapezoid': { const o = ss * a('adj', 25000); poly([[o, 0], [w - o, 0], [w, h], [0, h]]); return true; }
    case 'hexagon': { const o = ss * a('adj', 25000); poly([[o, 0], [w - o, 0], [w, h / 2], [w - o, h], [o, h], [0, h / 2]]); return true; }
    case 'octagon': { const o = ss * a('adj', 29289); poly([[o, 0], [w - o, 0], [w, o], [w, h - o], [w - o, h], [o, h], [0, h - o], [0, o]]); return true; }
    case 'pentagon': poly([[w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]]); return true;
    case 'homePlate': { const o = ss * a('adj', 50000); poly([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h]]); return true; }
    case 'chevron': { const o = ss * a('adj', 50000); poly([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h], [o, h / 2]]); return true; }
    case 'plus': { const o = ss * a('adj', 25000); poly([[o, 0], [w - o, 0], [w - o, o], [w, o], [w, h - o], [w - o, h - o], [w - o, h], [o, h], [o, h - o], [0, h - o], [0, o], [o, o]]); return true; }
    case 'rightArrow': case 'leftArrow': case 'upArrow': case 'downArrow': {
      const horizontal = name === 'rightArrow' || name === 'leftArrow';
      const len = horizontal ? w : h;
      const thick = horizontal ? h : w;
      const shaft = thick * a('adj1', 50000);
      const head = Math.min(len, ss * a('adj2', 50000));
      const s0 = (thick - shaft) / 2;
      // Drawn pointing right/down, mirrored for left/up.
      let pts: [number, number][] = [[0, s0], [len - head, s0], [len - head, 0], [len, thick / 2], [len - head, thick], [len - head, s0 + shaft], [0, s0 + shaft]];
      if (name === 'leftArrow' || name === 'upArrow') pts = pts.map(([px, py]) => [len - px, py]);
      if (!horizontal) pts = pts.map(([px, py]) => [py, px]);
      poly(pts);
      return true;
    }
    case 'star5': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.38 : 1;
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push([w / 2 + (Math.cos(ang) * w * r) / 2, h / 2 + (Math.sin(ang) * h * r) / 2 + h * 0.05]);
      }
      poly(pts);
      return true;
    }
    default:
      if (LINE_PRESETS.has(name)) { ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); return false; }
      ctx.rect(x, y, w, h);
      return true;
  }
}

function traceCustom(ctx: Ctx, p: CustomPath, x: number, y: number, w: number, h: number) {
  const sx = p.w ? w / p.w : 1;
  const sy = p.h ? h / p.h : 1;
  let cx = x;
  let cy = y;
  for (const c of p.commands) {
    switch (c.op) {
      case 'M': cx = x + c.x * sx; cy = y + c.y * sy; ctx.moveTo(cx, cy); break;
      case 'L': cx = x + c.x * sx; cy = y + c.y * sy; ctx.lineTo(cx, cy); break;
      case 'C': ctx.bezierCurveTo(x + c.x1 * sx, y + c.y1 * sy, x + c.x2 * sx, y + c.y2 * sy, x + c.x * sx, y + c.y * sy); cx = x + c.x * sx; cy = y + c.y * sy; break;
      case 'Q': ctx.quadraticCurveTo(x + c.x1 * sx, y + c.y1 * sy, x + c.x * sx, y + c.y * sy); cx = x + c.x * sx; cy = y + c.y * sy; break;
      case 'A': {
        const rx = c.wR * sx;
        const ry = c.hR * sy;
        const st = (c.stAng * Math.PI) / 180;
        const sw = (c.swAng * Math.PI) / 180;
        const ox = cx - rx * Math.cos(st);
        const oy = cy - ry * Math.sin(st);
        if (rx > 0 && ry > 0) ctx.ellipse(ox, oy, rx, ry, 0, st, st + sw, sw < 0);
        cx = ox + rx * Math.cos(st + sw);
        cy = oy + ry * Math.sin(st + sw);
        break;
      }
      case 'Z': ctx.closePath(); break;
    }
  }
}

function paint(ctx: Ctx, fill: Fill, x: number, y: number, w: number, h: number, images: ImageLookup, s: number) {
  if (fill.kind === 'solid') { ctx.fillStyle = cssColor(fill.color); ctx.fill(); return; }
  if (fill.kind === 'gradient') {
    let gradient: CanvasGradient;
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (fill.radial) {
      gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) / 2);
    } else {
      const t = (fill.angle * Math.PI) / 180;
      const dx = Math.cos(t);
      const dy = Math.sin(t);
      const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
      gradient = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
    }
    for (const stop of fill.stops) gradient.addColorStop(Math.min(1, Math.max(0, stop.pos)), cssColor(stop.color));
    ctx.fillStyle = gradient;
    ctx.fill();
    return;
  }
  const image = images(fill.part);
  if (!image) return;
  ctx.save();
  ctx.clip();
  ctx.globalAlpha *= fill.alpha;
  if (fill.tile) {
    const pattern = ctx.createPattern(image, 'repeat');
    if (pattern) {
      // Office tiles a picture at its size on a 96-dpi screen.
      const k = 9525 * s;
      pattern.setTransform(new DOMMatrix([k, 0, 0, k, x, y]));
      ctx.fillStyle = pattern;
      ctx.fillRect(x, y, w, h);
    }
  } else {
    drawCropped(ctx, image, fill.crop, x, y, w, h);
  }
  ctx.restore();
}

/** Draws the picture so its cropped part fills the box (a negative crop pads it). */
function drawCropped(ctx: Ctx, image: DrawableImage, crop: { l: number; t: number; r: number; b: number }, x: number, y: number, w: number, h: number) {
  const fw = 1 - crop.l - crop.r;
  const fh = 1 - crop.t - crop.b;
  if (fw <= 0 || fh <= 0) return;
  const tw = w / fw;
  const th = h / fh;
  ctx.drawImage(image, x - crop.l * tw, y - crop.t * th, tw, th);
}

function strokeLine(ctx: Ctx, line: Line, s: number) {
  const width = Math.max(1, line.width * s);
  ctx.lineWidth = width;
  ctx.strokeStyle = cssColor(line.color);
  ctx.lineJoin = 'round';
  ctx.setLineDash(line.dash === 'dash' ? [width * 4, width * 3] : line.dash === 'dot' ? [width, width * 2] : line.dash === 'dashDot' ? [width * 4, width * 2, width, width * 2] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}

function arrowHead(ctx: Ctx, fromX: number, fromY: number, toX: number, toY: number, line: Line, s: number) {
  const width = Math.max(1, line.width * s);
  const size = Math.max(6, width * 3);
  const ang = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size * Math.cos(ang - 0.45), toY - size * Math.sin(ang - 0.45));
  ctx.lineTo(toX - size * Math.cos(ang + 0.45), toY - size * Math.sin(ang + 0.45));
  ctx.closePath();
  ctx.fillStyle = cssColor(line.color);
  ctx.fill();
}

/** The element's box in pixels within its parent's space, transformed so (0,0) is its centre. */
function enterBox(ctx: Ctx, xfrm: Xfrm, s: number, flip = true) {
  const w = xfrm.w * s;
  const h = xfrm.h * s;
  ctx.translate(xfrm.x * s + w / 2, xfrm.y * s + h / 2);
  if (xfrm.rot) ctx.rotate((xfrm.rot * Math.PI) / 180);
  if (flip && (xfrm.flipH || xfrm.flipV)) ctx.scale(xfrm.flipH ? -1 : 1, xfrm.flipV ? -1 : 1);
  return { w, h };
}

function drawText(ctx: Ctx, body: TextBody, w: number, h: number, s: number, measure: FontMeasure, hiddenParagraphs?: ReadonlySet<number>) {
  const laid = layoutText(body, w, h, s, measure);
  const x0 = -w / 2;
  const y0 = -h / 2;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const line of laid.lines) {
    if (hiddenParagraphs?.has(line.paragraph)) continue;
    for (const f of line.bullet ? [line.bullet, ...line.fragments] : line.fragments) {
      if (!f.text) continue;
      ctx.font = f.font;
      ctx.fillStyle = cssColor(f.color);
      const by = y0 + line.baseline - f.rise;
      ctx.fillText(f.text, x0 + f.x, by);
      if (f.underline || f.strike) {
        ctx.fillRect(x0 + f.x, f.underline ? by + f.px * 0.1 : by - f.px * 0.3, f.width, Math.max(1, f.px / 16));
      }
    }
  }
}

interface DrawEnv { s: number; images: ImageLookup; measure: FontMeasure; step: SlideStep }

function shapePath(ctx: Ctx, geometry: Geometry, w: number, h: number): { closed: boolean; strokeOnly: CustomPath[] } {
  ctx.beginPath();
  if (geometry.kind === 'preset') return { closed: tracePreset(ctx, geometry.name, geometry.adj, -w / 2, -h / 2, w, h), strokeOnly: [] };
  const strokeOnly: CustomPath[] = [];
  for (const p of geometry.paths) {
    if (p.fill) traceCustom(ctx, p, -w / 2, -h / 2, w, h);
    else strokeOnly.push(p);
  }
  return { closed: true, strokeOnly };
}

function drawShape(ctx: Ctx, el: ShapeElement, env: DrawEnv) {
  const { s } = env;
  ctx.save();
  const { w, h } = enterBox(ctx, el.xfrm, s);
  const { closed, strokeOnly } = shapePath(ctx, el.geometry, w, h);
  if (closed && el.fill) paint(ctx, el.fill, -w / 2, -h / 2, w, h, env.images, s);
  if (el.line) {
    strokeLine(ctx, el.line, s);
    if (!closed && (el.line.headEnd || el.line.tailEnd)) {
      if (el.line.tailEnd) arrowHead(ctx, -w / 2, -h / 2, w / 2, h / 2, el.line, s);
      if (el.line.headEnd) arrowHead(ctx, w / 2, h / 2, -w / 2, -h / 2, el.line, s);
    }
    if (strokeOnly.length) {
      ctx.beginPath();
      for (const p of strokeOnly) traceCustom(ctx, p, -w / 2, -h / 2, w, h);
      strokeLine(ctx, el.line, s);
    }
  }
  ctx.restore();

  if (el.text && el.text.paragraphs.some((p) => p.runs.length)) {
    ctx.save();
    // Text is never mirrored; a vertical flip turns it upside down, as in PowerPoint.
    const box = el.textXfrm ?? el.xfrm;
    const { w: tw, h: th } = enterBox(ctx, box, s, false);
    if (!el.textXfrm && el.xfrm.flipV) ctx.rotate(Math.PI);
    drawText(ctx, el.text, tw, th, s, env.measure, env.step.hiddenParagraphs.get(el.id));
    ctx.restore();
  }
}

function drawPicture(ctx: Ctx, el: PictureElement, env: DrawEnv) {
  const image = el.part ? env.images(el.part) : null;
  ctx.save();
  const { w, h } = enterBox(ctx, el.xfrm, env.s);
  shapePath(ctx, el.geometry, w, h);
  if (image) {
    ctx.save();
    ctx.clip();
    ctx.globalAlpha *= el.alpha;
    drawCropped(ctx, image, el.crop, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  if (el.line) strokeLine(ctx, el.line, env.s);
  ctx.restore();
}

function drawGroup(ctx: Ctx, el: GroupElement, env: DrawEnv) {
  ctx.save();
  const { w, h } = enterBox(ctx, el.xfrm, env.s);
  // From the group's box to its children's coordinate space.
  const kx = el.childExtent.w ? el.xfrm.w / el.childExtent.w : 1;
  const ky = el.childExtent.h ? el.xfrm.h / el.childExtent.h : 1;
  ctx.translate(-w / 2, -h / 2);
  ctx.scale(kx, ky);
  ctx.translate(-el.childOffset.x * env.s, -el.childOffset.y * env.s);
  for (const c of el.children) drawElement(ctx, c, env);
  ctx.restore();
}

function drawTable(ctx: Ctx, el: TableElement, env: DrawEnv) {
  const { s } = env;
  ctx.save();
  const { w, h } = enterBox(ctx, el.xfrm, s, false);
  ctx.translate(-w / 2, -h / 2);
  const colX = [0];
  for (const c of el.columns) colX.push(colX[colX.length - 1] + c * s);
  // A row is as tall as it says, or as its text needs, whichever is more.
  const rowY = [0];
  el.rows.forEach((row) => {
    let need = row.h * s;
    row.cells.forEach((cell, c) => {
      if (cell.merged || cell.rowSpan > 1 || !cell.text || c >= el.columns.length) return;
      const cw = colX[Math.min(el.columns.length, c + cell.gridSpan)] - colX[c];
      const { t, b } = cell.text.insets;
      need = Math.max(need, layoutText(cell.text, cw, 0, s, env.measure).height + (t + b) * s);
    });
    rowY.push(rowY[rowY.length - 1] + need);
  });
  const edges: { line: Line; x1: number; y1: number; x2: number; y2: number }[] = [];
  el.rows.forEach((row, r) => {
    row.cells.forEach((cell, c) => {
      if (cell.merged || c >= el.columns.length) return;
      const x = colX[c];
      const y = rowY[r];
      const cw = colX[Math.min(el.columns.length, c + cell.gridSpan)] - x;
      const ch = rowY[Math.min(el.rows.length, r + cell.rowSpan)] - y;
      if (cell.fill) {
        ctx.beginPath();
        ctx.rect(x, y, cw, ch);
        paint(ctx, cell.fill, x, y, cw, ch, env.images, s);
      }
      if (cell.text) {
        ctx.save();
        ctx.translate(x + cw / 2, y + ch / 2);
        drawText(ctx, cell.text, cw, ch, s, env.measure);
        ctx.restore();
      }
      const b = cell.borders;
      if (b.t) edges.push({ line: b.t, x1: x, y1: y, x2: x + cw, y2: y });
      if (b.b) edges.push({ line: b.b, x1: x, y1: y + ch, x2: x + cw, y2: y + ch });
      if (b.l) edges.push({ line: b.l, x1: x, y1: y, x2: x, y2: y + ch });
      if (b.r) edges.push({ line: b.r, x1: x + cw, y1: y, x2: x + cw, y2: y + ch });
    });
  });
  for (const e of edges) {
    ctx.beginPath();
    ctx.moveTo(e.x1, e.y1);
    ctx.lineTo(e.x2, e.y2);
    strokeLine(ctx, e.line, s);
  }
  ctx.restore();
}

function drawElement(ctx: Ctx, el: SlideElement, env: DrawEnv) {
  if (env.step.hidden.has(el.id)) return;
  switch (el.type) {
    case 'shape': drawShape(ctx, el, env); break;
    case 'picture': drawPicture(ctx, el, env); break;
    case 'group': drawGroup(ctx, el, env); break;
    case 'table': drawTable(ctx, el, env); break;
  }
}

/** Every picture a slide needs, background included. */
export function slideImageParts(slide: Slide): string[] {
  const parts = new Set<string>();
  const fillPart = (f: Fill | null | undefined) => { if (f?.kind === 'image') parts.add(f.part); };
  fillPart(slide.background);
  const walk = (els: SlideElement[]) => {
    for (const el of els) {
      if (el.type === 'picture' && el.part) parts.add(el.part);
      else if (el.type === 'shape') fillPart(el.fill);
      else if (el.type === 'group') walk(el.children);
      else if (el.type === 'table') for (const row of el.rows) for (const cell of row.cells) fillPart(cell.fill);
    }
  };
  walk(slide.elements);
  return [...parts];
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/**
 * Draws one slide at one of its steps onto the whole canvas: black bars where
 * the deck's shape differs from the canvas (a 4:3 deck on a 16:9 screen).
 */
export function renderSlide(canvas: HTMLCanvasElement | OffscreenCanvas, deck: Deck, slide: Slide, stepIndex: number, images: ImageLookup) {
  const ctx = canvas.getContext('2d') as Ctx;
  const view = slideViewport(deck, canvas.width, canvas.height);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(view.x, view.y);
  ctx.beginPath();
  ctx.rect(0, 0, view.w, view.h);
  ctx.clip();
  ctx.fillStyle = cssColor(WHITE);
  ctx.fillRect(0, 0, view.w, view.h);
  if (slide.background) {
    ctx.beginPath();
    ctx.rect(0, 0, view.w, view.h);
    paint(ctx, slide.background, 0, 0, view.w, view.h, images, view.scale);
  }
  const measure: FontMeasure = (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
  const step = slide.steps[Math.min(stepIndex, slide.steps.length - 1)] ?? { hidden: new Set(), hiddenParagraphs: new Map() };
  const env: DrawEnv = { s: view.scale, images, measure, step };
  for (const el of slide.elements) drawElement(ctx, el, env);
  ctx.restore();
}

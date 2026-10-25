import { readColor, type ColorContext, type Rgba } from './color';
import type { Crop, CustomPath, Fill, Geometry, Line, PathCommand, Xfrm } from './model';
import type { PptxPackage } from './pptxPackage';
import { bool, child, children, num, path, relAttr, type XmlNode } from './xml';

export interface FontSet { latin: string; ea: string }

export interface Theme {
  scheme: Record<string, string>;
  fillStyles: XmlNode[];
  lineStyles: XmlNode[];
  backgroundStyles: XmlNode[];
  major: FontSet;
  minor: FontSet;
}

/** Where an element lives: its part (for image links), colors and theme. */
export interface PartContext {
  pkg: PptxPackage;
  part: string;
  colors: ColorContext;
  theme: Theme;
  /** The enclosing group's fill, for `a:grpFill`. */
  groupFill?: Fill | null;
}

export function readTheme(node: XmlNode | null): Theme {
  const elements = path(node ?? undefined, 'themeElements');
  const scheme: Record<string, string> = {};
  for (const c of children(child(elements, 'clrScheme'))) {
    const color = c.children[0];
    if (!color) continue;
    scheme[c.name] = color.name === 'sysClr' ? (color.attrs.lastClr ?? '000000') : (color.attrs.val ?? '000000');
  }
  const fmt = child(elements, 'fmtScheme');
  const fontSet = (name: string): FontSet => {
    const font = path(elements, 'fontScheme', name);
    const hant = children(font, 'font').find((f) => f.attrs.script === 'Hant')?.attrs.typeface;
    return { latin: path(font, 'latin')?.attrs.typeface ?? '', ea: path(font, 'ea')?.attrs.typeface || hant || '' };
  };
  return {
    scheme,
    fillStyles: children(child(fmt, 'fillStyleLst')),
    lineStyles: children(child(fmt, 'lnStyleLst')),
    backgroundStyles: children(child(fmt, 'bgFillStyleLst')),
    major: fontSet('majorFont'),
    minor: fontSet('minorFont'),
  };
}

export function readXfrm(node: XmlNode | undefined): Xfrm | undefined {
  const off = child(node, 'off');
  const ext = child(node, 'ext');
  if (!off || !ext) return undefined;
  return {
    x: num(off, 'x', 0), y: num(off, 'y', 0), w: num(ext, 'cx', 0), h: num(ext, 'cy', 0),
    rot: num(node, 'rot', 0) / 60000, flipH: bool(node, 'flipH') ?? false, flipV: bool(node, 'flipV') ?? false,
  };
}

const FILL_NAMES = new Set(['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill']);

/** The fill element among `parent`'s children, if any. */
export const fillElement = (parent: XmlNode | undefined) => children(parent).find((c) => FILL_NAMES.has(c.name));

function readCrop(node: XmlNode | undefined): Crop {
  return { l: num(node, 'l', 0) / 100000, t: num(node, 't', 0) / 100000, r: num(node, 'r', 0) / 100000, b: num(node, 'b', 0) / 100000 };
}

/**
 * A fill element as a Fill: null for `noFill`, undefined when it cannot be
 * drawn. `ctx.colors.placeholder` stands in for `phClr` in theme styles.
 */
export function readFill(el: XmlNode | undefined, ctx: PartContext): Fill | null | undefined {
  if (!el) return undefined;
  switch (el.name) {
    case 'noFill': return null;
    case 'solidFill': {
      const color = readColor(el, ctx.colors);
      return color ? { kind: 'solid', color } : undefined;
    }
    case 'gradFill': {
      const stops = children(child(el, 'gsLst'), 'gs')
        .map((gs) => ({ pos: num(gs, 'pos', 0) / 100000, color: readColor(gs, ctx.colors) }))
        .filter((s): s is { pos: number; color: Rgba } => !!s.color)
        .sort((a, b) => a.pos - b.pos);
      if (!stops.length) return undefined;
      const lin = child(el, 'lin');
      // Without `a:lin` the gradient is a path (radial) one, or top to bottom.
      return { kind: 'gradient', stops, angle: lin ? num(lin, 'ang', 0) / 60000 : 90, radial: !lin && !!child(el, 'path') };
    }
    case 'blipFill': {
      const blip = child(el, 'blip');
      const part = ctx.pkg.target(ctx.part, relAttr(blip, 'embed'));
      if (!part) return undefined;
      const alphaMod = child(blip, 'alphaModFix');
      return { kind: 'image', part, crop: readCrop(child(el, 'srcRect')), tile: !!child(el, 'tile'), alpha: alphaMod ? num(alphaMod, 'amt', 100000) / 100000 : 1 };
    }
    case 'pattFill': {
      // A pattern reads, from across the room, as its foreground over its background.
      const fg = readColor(child(el, 'fgClr'), ctx.colors);
      const bg = readColor(child(el, 'bgClr'), ctx.colors);
      const color = fg && bg ? { r: (fg.r + bg.r) / 2, g: (fg.g + bg.g) / 2, b: (fg.b + bg.b) / 2, a: (fg.a + bg.a) / 2 } : fg ?? bg;
      return color ? { kind: 'solid', color } : undefined;
    }
    case 'grpFill': return ctx.groupFill ?? undefined;
    default: return undefined;
  }
}

/** A theme style (`a:fillRef`, `a:lnRef`, `a:bgRef`), with its color as `phClr`. */
function styleEntry(ref: XmlNode | undefined, ctx: PartContext): { node: XmlNode; ctx: PartContext } | undefined {
  if (!ref) return undefined;
  const idx = num(ref, 'idx', 0);
  const list = ref.name === 'lnRef' ? ctx.theme.lineStyles
    : idx >= 1001 ? ctx.theme.backgroundStyles : ctx.theme.fillStyles;
  const node = list[(idx >= 1001 ? idx - 1001 : idx - 1)];
  if (!node) return undefined;
  const placeholder = readColor(ref, ctx.colors);
  return { node, ctx: { ...ctx, colors: { ...ctx.colors, placeholder } } };
}

export function readStyleFill(ref: XmlNode | undefined, ctx: PartContext): Fill | null | undefined {
  const entry = styleEntry(ref, ctx);
  return entry ? readFill(entry.node, entry.ctx) : undefined;
}

const DASH: Record<string, Line['dash']> = { dash: 'dash', lgDash: 'dash', sysDash: 'dash', dot: 'dot', sysDot: 'dot', dashDot: 'dashDot', lgDashDot: 'dashDot', lgDashDotDot: 'dashDot', sysDashDot: 'dashDot', sysDashDotDot: 'dashDot' };

/** A shape's outline: its own `a:ln` over the theme's line style. null for none. */
export function readLine(ln: XmlNode | undefined, styleRef: XmlNode | undefined, ctx: PartContext): Line | null {
  const style = styleEntry(styleRef, ctx);
  const layers = [style ? { node: style.node, ctx: style.ctx } : undefined, ln ? { node: ln, ctx } : undefined].filter((l): l is { node: XmlNode; ctx: PartContext } => !!l);
  if (!layers.length) return null;
  let width = 9525;
  let color: Rgba | null | undefined;
  let dash: Line['dash'] = 'solid';
  let headEnd = false;
  let tailEnd = false;
  for (const { node, ctx: c } of layers) {
    width = num(node, 'w', width);
    const fillEl = fillElement(node);
    if (fillEl) {
      const fill = readFill(fillEl, c);
      color = fill === null ? null : fill?.kind === 'solid' ? fill.color : fill?.kind === 'gradient' ? fill.stops[0].color : color;
    }
    const prstDash = child(node, 'prstDash')?.attrs.val;
    if (prstDash) dash = DASH[prstDash] ?? 'solid';
    const head = child(node, 'headEnd')?.attrs.type;
    const tail = child(node, 'tailEnd')?.attrs.type;
    if (head) headEnd = head !== 'none';
    if (tail) tailEnd = tail !== 'none';
  }
  if (!color) return null;
  return { width, color, dash, headEnd, tailEnd };
}

/** A shape's fill: its own over the theme's style; undefined means none. */
export function readShapeFill(spPr: XmlNode | undefined, styleRef: XmlNode | undefined, ctx: PartContext): Fill | null {
  const own = fillElement(spPr);
  if (own) return readFill(own, ctx) ?? null;
  return readStyleFill(styleRef, ctx) ?? null;
}

const pathCommands = (node: XmlNode): PathCommand[] => {
  const pts = (n: XmlNode) => children(n, 'pt').map((p) => ({ x: num(p, 'x', 0), y: num(p, 'y', 0) }));
  const out: PathCommand[] = [];
  for (const c of node.children) {
    const p = pts(c);
    if (c.name === 'moveTo' && p[0]) out.push({ op: 'M', ...p[0] });
    else if (c.name === 'lnTo' && p[0]) out.push({ op: 'L', ...p[0] });
    else if (c.name === 'cubicBezTo' && p.length === 3) out.push({ op: 'C', x1: p[0].x, y1: p[0].y, x2: p[1].x, y2: p[1].y, x: p[2].x, y: p[2].y });
    else if (c.name === 'quadBezTo' && p.length === 2) out.push({ op: 'Q', x1: p[0].x, y1: p[0].y, x: p[1].x, y: p[1].y });
    else if (c.name === 'arcTo') out.push({ op: 'A', wR: num(c, 'wR', 0), hR: num(c, 'hR', 0), stAng: num(c, 'stAng', 0) / 60000, swAng: num(c, 'swAng', 0) / 60000 });
    else if (c.name === 'close') out.push({ op: 'Z' });
  }
  return out;
};

export function readGeometry(spPr: XmlNode | undefined): Geometry {
  const custom = child(spPr, 'custGeom');
  if (custom) {
    const paths: CustomPath[] = children(child(custom, 'pathLst'), 'path').map((p) => ({
      w: num(p, 'w', 0), h: num(p, 'h', 0),
      fill: p.attrs.fill !== 'none', stroke: p.attrs.stroke !== '0' && p.attrs.stroke !== 'false',
      commands: pathCommands(p),
    }));
    return { kind: 'custom', paths };
  }
  const preset = child(spPr, 'prstGeom');
  const adj: Record<string, number> = {};
  for (const gd of children(child(preset, 'avLst'), 'gd')) {
    const m = /^val\s+(-?\d+)/.exec(gd.attrs.fmla ?? '');
    if (m && gd.attrs.name) adj[gd.attrs.name] = Number(m[1]);
  }
  return { kind: 'preset', name: preset?.attrs.prst ?? 'rect', adj };
}

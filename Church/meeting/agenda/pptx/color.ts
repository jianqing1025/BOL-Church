import { children, num, type XmlNode } from './xml';

/** 0–255 channels, alpha 0–1. */
export interface Rgba { r: number; g: number; b: number; a: number }

export interface ColorContext {
  /** Theme colors by scheme name (dk1, lt1, accent1 …), as 'RRGGBB'. */
  scheme: Record<string, string>;
  /** The color map: bg1 → lt1, tx1 → dk1 … */
  map: Record<string, string>;
  /** What `phClr` stands for inside a theme style. */
  placeholder?: Rgba;
}

const COLOR_ELEMENTS = new Set(['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr']);

const PRESET: Record<string, string> = {
  black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00',
  gray: '808080', grey: '808080', darkGray: 'A9A9A9', lightGray: 'D3D3D3', orange: 'FFA500', purple: '800080',
  navy: '000080', maroon: '800000', teal: '008080', silver: 'C0C0C0', cyan: '00FFFF', magenta: 'FF00FF',
  gold: 'FFD700', brown: 'A52A2A', pink: 'FFC0CB', darkBlue: '00008B', darkRed: '8B0000', darkGreen: '006400',
};

const DEFAULT_MAP: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };

export const hexToRgba = (hex: string, a = 1): Rgba => {
  const v = parseInt(hex.replace('#', '').padStart(6, '0').slice(0, 6), 16) || 0;
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255, a };
};

export const cssColor = (c: Rgba): string => `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Math.round(c.a * 1000) / 1000})`;

function toHsl({ r, g, b }: Rgba): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number, a: number): Rgba {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255, a };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255, a };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function applyModifiers(base: Rgba, mods: XmlNode[]): Rgba {
  let c = { ...base };
  for (const mod of mods) {
    const v = num(mod, 'val', 0) / 100000;
    switch (mod.name) {
      case 'alpha': c.a = clamp01(v); break;
      case 'alphaMod': c.a = clamp01(c.a * v); break;
      case 'alphaOff': c.a = clamp01(c.a + v); break;
      case 'tint': c = { r: c.r + (255 - c.r) * (1 - v), g: c.g + (255 - c.g) * (1 - v), b: c.b + (255 - c.b) * (1 - v), a: c.a }; break;
      case 'shade': c = { r: c.r * v, g: c.g * v, b: c.b * v, a: c.a }; break;
      case 'lumMod': case 'lumOff': case 'satMod': case 'satOff': case 'hueMod': case 'hueOff': {
        let [h, s, l] = toHsl(c);
        if (mod.name === 'lumMod') l = clamp01(l * v);
        else if (mod.name === 'lumOff') l = clamp01(l + v);
        else if (mod.name === 'satMod') s = clamp01(s * v);
        else if (mod.name === 'satOff') s = clamp01(s + v);
        else if (mod.name === 'hueMod') h = (h * v) % 1;
        else h = (h + num(mod, 'val', 0) / 21600000) % 1;
        c = fromHsl(h, s, l, c.a);
        break;
      }
      case 'comp': { const [h, s, l] = toHsl(c); c = fromHsl((h + 0.5) % 1, s, l, c.a); break; }
      case 'inv': c = { r: 255 - c.r, g: 255 - c.g, b: 255 - c.b, a: c.a }; break;
      case 'gray': { const y = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; c = { r: y, g: y, b: y, a: c.a }; break; }
      default: break;
    }
  }
  return c;
}

/** The color named by a color element (`a:srgbClr` …), or undefined. */
export function readColorElement(el: XmlNode, ctx: ColorContext): Rgba | undefined {
  let base: Rgba | undefined;
  switch (el.name) {
    case 'srgbClr': base = hexToRgba(el.attrs.val ?? '000000'); break;
    case 'sysClr': base = hexToRgba(el.attrs.lastClr ?? (el.attrs.val === 'window' ? 'FFFFFF' : '000000')); break;
    case 'prstClr': base = hexToRgba(PRESET[el.attrs.val ?? ''] ?? '000000'); break;
    case 'scrgbClr': {
      // Linear percentages → sRGB.
      const ch = (v: number) => { const x = clamp01(v / 100000); return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055); };
      base = { r: ch(num(el, 'r', 0)), g: ch(num(el, 'g', 0)), b: ch(num(el, 'b', 0)), a: 1 };
      break;
    }
    case 'hslClr': base = fromHsl(num(el, 'hue', 0) / 21600000, num(el, 'sat', 0) / 100000, num(el, 'lum', 0) / 100000, 1); break;
    case 'schemeClr': {
      const val = el.attrs.val ?? '';
      if (val === 'phClr') { base = ctx.placeholder ?? hexToRgba('000000'); break; }
      const mapped = ctx.map[val] ?? DEFAULT_MAP[val] ?? val;
      const hex = ctx.scheme[mapped];
      base = hex ? hexToRgba(hex) : hexToRgba('000000');
      break;
    }
    default: return undefined;
  }
  return applyModifiers(base, el.children);
}

/** The color inside a fill-like element (`a:solidFill`, `a:fillRef`, `a:buClr` …). */
export function readColor(parent: XmlNode | undefined, ctx: ColorContext): Rgba | undefined {
  const el = children(parent).find((c) => COLOR_ELEMENTS.has(c.name));
  return el ? readColorElement(el, ctx) : undefined;
}

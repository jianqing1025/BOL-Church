import { hexToRgba, readColor, type Rgba } from './color';
import { fillElement, readFill, type FontSet, type PartContext } from './fills';
import type { Bullet, Paragraph, Run, Spacing, TextBody } from './model';
import { bool, child, children, num, type XmlNode } from './xml';

/** The slide font as a last resort, so Chinese always has a face that has it. */
export const FALLBACK_FONTS = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';

/** Chinese face names as Office writes them, with the names browsers know them by. */
const FONT_ALIASES: Record<string, string> = {
  微軟正黑體: 'Microsoft JhengHei', 新細明體: 'PMingLiU', 細明體: 'MingLiU', 標楷體: 'DFKai-SB',
  微软雅黑: 'Microsoft YaHei', 宋体: 'SimSun', 新宋体: 'NSimSun', 黑体: 'SimHei', 楷体: 'KaiTi', 仿宋: 'FangSong',
  等线: 'DengXian', 'ＭＳ ゴシック': 'MS Gothic', 'ＭＳ 明朝': 'MS Mincho', 游ゴシック: 'Yu Gothic', メイリオ: 'Meiryo',
};

export interface RunProps {
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: Rgba;
  latin?: string;
  ea?: string;
  baseline?: number;
  caps?: boolean;
}

type BulletKind = { kind: 'none' } | { kind: 'char'; char: string } | { kind: 'num'; scheme: string; startAt: number };

interface ParaProps {
  align?: Paragraph['align'];
  marL?: number;
  indent?: number;
  lineSpacing?: Spacing;
  spaceBefore?: Spacing;
  spaceAfter?: Spacing;
  bullet?: BulletKind;
  bulletFont?: string | null;
  bulletColor?: Rgba | null;
  bulletSize?: number;
  run: RunProps;
}

function readSpacing(node: XmlNode | undefined): Spacing | undefined {
  if (!node) return undefined;
  const pct = child(node, 'spcPct');
  if (pct) return { pct: num(pct, 'val', 100000) / 100000 };
  const pts = child(node, 'spcPts');
  if (pts) return { pts: num(pts, 'val', 0) / 100 };
  return undefined;
}

export function readRunProps(node: XmlNode | undefined, ctx: PartContext): RunProps {
  if (!node) return {};
  const props: RunProps = {};
  const sz = num(node, 'sz');
  if (sz !== undefined) props.size = sz / 100;
  const b = bool(node, 'b'); if (b !== undefined) props.bold = b;
  const i = bool(node, 'i'); if (i !== undefined) props.italic = i;
  if (node.attrs.u !== undefined) props.underline = node.attrs.u !== 'none';
  if (node.attrs.strike !== undefined) props.strike = node.attrs.strike !== 'noStrike';
  const baseline = num(node, 'baseline');
  if (baseline !== undefined) props.baseline = baseline / 1000;
  if (node.attrs.cap !== undefined) props.caps = node.attrs.cap !== 'none';
  const fill = fillElement(node);
  if (fill) {
    const f = readFill(fill, ctx);
    if (f?.kind === 'solid') props.color = f.color;
    else if (f?.kind === 'gradient') props.color = f.stops[0].color;
  }
  const latin = child(node, 'latin')?.attrs.typeface;
  if (latin) props.latin = latin;
  const ea = child(node, 'ea')?.attrs.typeface;
  if (ea) props.ea = ea;
  return props;
}

function readParaProps(node: XmlNode | undefined, ctx: PartContext): ParaProps {
  const props: ParaProps = { run: readRunProps(child(node, 'defRPr'), ctx) };
  if (!node) return props;
  const algn = node.attrs.algn;
  if (algn) props.align = (['l', 'ctr', 'r', 'just', 'dist'].includes(algn) ? algn : algn === 'justLow' || algn === 'thaiDist' ? 'just' : 'l') as Paragraph['align'];
  const marL = num(node, 'marL'); if (marL !== undefined) props.marL = marL;
  const indent = num(node, 'indent'); if (indent !== undefined) props.indent = indent;
  props.lineSpacing = readSpacing(child(node, 'lnSpc'));
  props.spaceBefore = readSpacing(child(node, 'spcBef'));
  props.spaceAfter = readSpacing(child(node, 'spcAft'));
  if (child(node, 'buNone')) props.bullet = { kind: 'none' };
  const buChar = child(node, 'buChar');
  if (buChar) props.bullet = { kind: 'char', char: buChar.attrs.char ?? '•' };
  const buNum = child(node, 'buAutoNum');
  if (buNum) props.bullet = { kind: 'num', scheme: buNum.attrs.type ?? 'arabicPeriod', startAt: num(buNum, 'startAt', 1) };
  if (child(node, 'buFontTx')) props.bulletFont = null;
  const buFont = child(node, 'buFont')?.attrs.typeface;
  if (buFont) props.bulletFont = buFont;
  if (child(node, 'buClrTx')) props.bulletColor = null;
  const buClr = readColor(child(node, 'buClr'), ctx.colors);
  if (buClr) props.bulletColor = buClr;
  const buSz = child(node, 'buSzPct');
  if (buSz) props.bulletSize = num(buSz, 'val', 100000) / 100000;
  return props;
}

const defined = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

function mergePara(base: ParaProps, over: ParaProps): ParaProps {
  return { ...base, ...defined({ ...over, run: undefined }), run: { ...base.run, ...defined(over.run) } };
}

/** `+mn-lt` and friends → the theme's face; aliases added for Chinese names. */
export function fontFamily(latin: string | undefined, ea: string | undefined, theme: { major: FontSet; minor: FontSet }): string {
  const resolve = (face: string | undefined, script: 'latin' | 'ea') => {
    if (!face) return '';
    const m = /^\+(mj|mn)-(lt|ea|cs)$/.exec(face);
    if (!m) return face;
    const set = m[1] === 'mj' ? theme.major : theme.minor;
    return m[2] === 'ea' || script === 'ea' ? set.ea : set.latin;
  };
  const faces: string[] = [];
  for (const face of [resolve(latin ?? '+mn-lt', 'latin'), resolve(ea ?? '+mn-ea', 'ea')]) {
    if (!face || face.startsWith('+')) continue;
    for (const name of [face, FONT_ALIASES[face]]) if (name && !faces.includes(name)) faces.push(name);
  }
  return [...faces.map((f) => `"${f.replace(/"/g, '')}"`), FALLBACK_FONTS].join(', ');
}

const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman = (n: number) => { let out = ''; for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; } return out; };
const alpha = (n: number) => { let out = ''; while (n > 0) { n--; out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26); } return out; };
const CJK_DIGITS = '〇一二三四五六七八九';
const cjk = (n: number): string => {
  if (n < 10) return CJK_DIGITS[n];
  if (n < 20) return `十${n % 10 ? CJK_DIGITS[n % 10] : ''}`;
  if (n < 100) return `${CJK_DIGITS[Math.floor(n / 10)]}十${n % 10 ? CJK_DIGITS[n % 10] : ''}`;
  return String(n);
};
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

/** "3" in a PowerPoint numbering scheme: arabicPeriod → "3.", alphaLcParenR → "c)" … */
export function formatAutoNumber(scheme: string, n: number): string {
  const body = scheme.startsWith('roman') ? roman(n)
    : scheme.startsWith('alpha') ? alpha(n)
    : scheme.startsWith('ea1') || scheme.startsWith('ea2') ? cjk(n)
    : scheme.startsWith('circleNum') ? (CIRCLED[n - 1] ?? String(n))
    : String(n);
  const cased = /Lc/.test(scheme) ? body.toLowerCase() : body;
  if (scheme.startsWith('circleNum')) return cased;
  if (scheme.startsWith('ea')) return /Period/.test(scheme) ? `${cased}、` : cased;
  if (scheme.endsWith('ParenBoth')) return `(${cased})`;
  if (scheme.endsWith('ParenR')) return `${cased})`;
  if (scheme.endsWith('Plain')) return cased;
  if (scheme.endsWith('Minus')) return `- ${cased} -`;
  return `${cased}.`;
}

export interface TextSources {
  /** List styles from weakest to strongest (`a:lstStyle`-like nodes holding lvlNpPr). */
  listStyles: (XmlNode | undefined)[];
  /** `a:bodyPr` from weakest to strongest. */
  bodyProps: (XmlNode | undefined)[];
  /** The shape's theme font and color (`a:fontRef`). */
  fontRef?: XmlNode;
  /** Run defaults laid over the list styles (a table style's text). */
  runDefaults?: RunProps;
}

const BLACK = hexToRgba('000000');

const paragraph = (props: ParaProps, level: number, bullet: Bullet | null, runs: Run[], endSize: number): Paragraph => ({
  align: props.align ?? 'l',
  level,
  marL: props.marL ?? 0,
  indent: props.indent ?? 0,
  lineSpacing: props.lineSpacing ?? { pct: 1 },
  spaceBefore: props.spaceBefore ?? {},
  spaceAfter: props.spaceAfter ?? {},
  bullet,
  runs,
  endSize,
});

export function readTextBody(txBody: XmlNode | undefined, sources: TextSources, ctx: PartContext): TextBody | null {
  if (!txBody) return null;
  const bodyPrs = [...sources.bodyProps, child(txBody, 'bodyPr')].filter((b): b is XmlNode => !!b);
  const attr = (name: string) => { let v: string | undefined; for (const b of bodyPrs) if (b.attrs[name] !== undefined) v = b.attrs[name]; return v; };
  const inset = (name: string, fallback: number) => { const v = attr(name); return v === undefined ? fallback : Number(v) || 0; };
  let fontScale = 1;
  let lineReduction = 0;
  for (const b of bodyPrs) {
    const norm = child(b, 'normAutofit');
    if (norm) { fontScale = num(norm, 'fontScale', 100000) / 100000; lineReduction = num(norm, 'lnSpcReduction', 0) / 100000; }
    else if (child(b, 'noAutofit') || child(b, 'spAutoFit')) { fontScale = 1; lineReduction = 0; }
  }
  const anchor = attr('anchor');

  const listLevels = [...sources.listStyles, child(txBody, 'lstStyle')];
  const fontRefProps: RunProps = {};
  if (sources.fontRef) {
    const color = readColor(sources.fontRef, ctx.colors);
    if (color) fontRefProps.color = color;
    const idx = sources.fontRef.attrs.idx;
    if (idx === 'major') { fontRefProps.latin = '+mj-lt'; fontRefProps.ea = '+mj-ea'; }
    else if (idx === 'minor') { fontRefProps.latin = '+mn-lt'; fontRefProps.ea = '+mn-ea'; }
  }

  const counters: { scheme: string; n: number }[] = [];
  const paragraphs: Paragraph[] = [];
  for (const p of children(txBody, 'p')) {
    const pPr = child(p, 'pPr');
    const level = Math.min(8, Math.max(0, num(pPr, 'lvl', 0)));
    let props: ParaProps = { run: {} };
    for (const list of listLevels) {
      if (!list) continue;
      props = mergePara(props, readParaProps(child(list, 'defPPr'), ctx));
      props = mergePara(props, readParaProps(child(list, `lvl${level + 1}pPr`), ctx));
    }
    props = mergePara(props, { run: { ...fontRefProps, ...defined(sources.runDefaults ?? {}) } });
    props = mergePara(props, readParaProps(pPr, ctx));

    const runs: Run[] = [];
    const makeRun = (text: string, rPr: XmlNode | undefined): Run => {
      const r = { ...props.run, ...defined(readRunProps(rPr, ctx)) };
      return {
        text,
        size: r.size ?? 18,
        bold: r.bold ?? false,
        italic: r.italic ?? false,
        underline: r.underline ?? false,
        strike: r.strike ?? false,
        color: r.color ?? BLACK,
        font: fontFamily(r.latin, r.ea, ctx.theme),
        baseline: r.baseline ?? 0,
        caps: r.caps ?? false,
      };
    };
    for (const c of p.children) {
      if (c.name === 'r' || c.name === 'fld') {
        const text = (child(c, 't')?.text ?? '').replace(/_x000B_|\v/g, '\n');
        const parts = text.split('\n');
        parts.forEach((part, i) => {
          if (i > 0) runs.push(makeRun('\n', child(c, 'rPr')));
          if (part) runs.push(makeRun(part, child(c, 'rPr')));
        });
      } else if (c.name === 'br') {
        runs.push(makeRun('\n', child(c, 'rPr')));
      }
    }
    const endSize = readRunProps(child(p, 'endParaRPr'), ctx).size ?? props.run.size ?? 18;
    const hasText = runs.some((r) => r.text.trim() && r.text !== '\n');

    // Numbering runs on through a level's consecutive numbered paragraphs.
    counters.length = Math.min(counters.length, level + 1);
    let bullet: Bullet | null = null;
    const kind = props.bullet;
    if (kind?.kind === 'num') {
      // An empty line shows no number and takes none.
      if (!hasText) { paragraphs.push(paragraph(props, level, null, runs, endSize)); continue; }
      const prev = counters[level];
      const n = prev && prev.scheme === kind.scheme ? prev.n + 1 : kind.startAt;
      counters[level] = { scheme: kind.scheme, n };
      bullet = { text: formatAutoNumber(kind.scheme, n), sizePct: props.bulletSize ?? 1 };
    } else {
      counters.length = Math.min(counters.length, level);
      if (kind?.kind === 'char' && hasText) bullet = { text: kind.char, sizePct: props.bulletSize ?? 1 };
    }
    if (bullet) {
      if (props.bulletFont) bullet.font = fontFamily(props.bulletFont, props.bulletFont, ctx.theme);
      if (props.bulletColor) bullet.color = props.bulletColor;
    }

    paragraphs.push(paragraph(props, level, bullet, runs, endSize));
  }

  return {
    anchor: anchor === 'ctr' || anchor === 'b' ? anchor : 't',
    anchorCtr: attr('anchorCtr') === '1',
    insets: { l: inset('lIns', 91440), t: inset('tIns', 45720), r: inset('rIns', 91440), b: inset('bIns', 45720) },
    wrap: attr('wrap') !== 'none',
    fontScale,
    lineReduction,
    paragraphs,
  };
}

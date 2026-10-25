import type { Rgba } from './color';
import type { Paragraph, Run, Spacing, TextBody } from './model';

/** Width in pixels of `text` drawn with the CSS `font`. */
export type FontMeasure = (text: string, font: string) => number;

export const EMU_PER_PT = 12700;

export interface Fragment {
  text: string;
  x: number;
  width: number;
  /** CSS font, already scaled to pixels. */
  font: string;
  px: number;
  color: Rgba;
  underline: boolean;
  strike: boolean;
  /** Pixels to raise the text (superscript) or lower it (negative). */
  rise: number;
}

export interface LaidLine {
  paragraph: number;
  /** Baseline, from the top of the text box. */
  baseline: number;
  fragments: Fragment[];
  bullet?: Fragment;
}

export interface LaidText { lines: LaidLine[]; height: number }

/** Office stores Wingdings and Symbol bullets as letters; these are what they draw. */
const SYMBOL_BULLETS: Record<string, string> = {
  'Ø': '➢', '§': '■', 'ü': '✔', 'n': '■', 'l': '●', 'q': '❑', 'v': '❖', 'Ÿ': '•', 'w': '◆', 'u': '◆', 'ð': '➔', 'à': '➔', 'è': '➔', 'o': '□', 'p': '▫', '·': '•', 'F': '☞',
};

export function bulletGlyph(text: string, font: string | undefined): { text: string; symbolFont: boolean } {
  const symbolFont = !!font && /Wingdings|Symbol|Webdings/i.test(font);
  return symbolFont ? { text: SYMBOL_BULLETS[text] ?? '•', symbolFont } : { text, symbolFont: false };
}

const CJK = '\\u2e80-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef\\u3000-\\u303f\\u{20000}-\\u{2fa1f}';
const TOKEN = new RegExp(`[${CJK}]|[^\\s${CJK}]+\\s*|\\s+`, 'gu');
const CLOSING = /^[，。、；：！？）」』》〉,.;:!?)\]]/;

export const cssFont = (run: Pick<Run, 'bold' | 'italic' | 'font'>, px: number) =>
  `${run.italic ? 'italic ' : ''}${run.bold ? 700 : 400} ${Math.max(1, Math.round(px * 100) / 100)}px ${run.font}`;

interface Token { text: string; run: Run; px: number; font: string; width: number; br: boolean }

const spacingPx = (s: Spacing, linePx: number, scale: number) => (s.pts !== undefined ? s.pts * EMU_PER_PT * scale : (s.pct ?? 0) * linePx * 1.2);

/**
 * Lays a text body out in a box `width`×`height` pixels: lines broken where
 * PowerPoint would roughly break them (Chinese between any two characters,
 * other text between words), placed per paragraph alignment and the box's
 * vertical anchor. `scale` is pixels per EMU.
 */
export function layoutText(body: TextBody, width: number, height: number, scale: number, measure: FontMeasure): LaidText {
  const inner = {
    l: body.insets.l * scale, r: body.insets.r * scale, t: body.insets.t * scale, b: body.insets.b * scale,
  };
  const innerWidth = Math.max(1, width - inner.l - inner.r);
  const lines: LaidLine[] = [];
  let y = 0;

  body.paragraphs.forEach((paragraph: Paragraph, pIndex) => {
    const sizePx = (pt: number, baseline = 0) => pt * EMU_PER_PT * scale * body.fontScale * (baseline ? 2 / 3 : 1);
    const firstPx = sizePx(paragraph.runs.find((r) => r.text !== '\n')?.size ?? paragraph.endSize);
    const marL = paragraph.marL * scale;
    const indent = paragraph.indent * scale;

    const tokens: Token[] = [];
    for (const run of paragraph.runs) {
      const px = sizePx(run.size, run.baseline);
      const font = cssFont(run, px);
      if (run.text === '\n') { tokens.push({ text: '', run, px, font, width: 0, br: true }); continue; }
      const text = run.caps ? run.text.toUpperCase() : run.text;
      for (const t of text.replace(/\t/g, '    ').match(TOKEN) ?? []) tokens.push({ text: t, run, px, font, width: measure(t, font), br: false });
    }

    // The bullet, and where the first line's text begins.
    let bullet: Fragment | undefined;
    let firstStart = marL + indent;
    if (paragraph.bullet) {
      const firstRun = paragraph.runs.find((r) => r.text !== '\n');
      const glyph = bulletGlyph(paragraph.bullet.text, paragraph.bullet.font);
      const px = firstPx * paragraph.bullet.sizePct;
      const font = cssFont({ bold: false, italic: false, font: glyph.symbolFont || !paragraph.bullet.font ? (firstRun?.font ?? 'sans-serif') : paragraph.bullet.font }, px);
      const w = measure(glyph.text, font);
      bullet = { text: glyph.text, x: marL + indent, width: w, font, px, color: paragraph.bullet.color ?? firstRun?.color ?? { r: 0, g: 0, b: 0, a: 1 }, underline: false, strike: false, rise: 0 };
      firstStart = indent < 0 ? Math.max(marL, marL + indent + w + px * 0.25) : marL + indent + w + px * 0.4;
    }

    // Greedy fill.
    const built: { tokens: Token[]; start: number }[] = [];
    let current: Token[] = [];
    let lineWidth = 0;
    let start = firstStart;
    const avail = () => (body.wrap ? innerWidth - start : Infinity);
    const flush = () => { built.push({ tokens: current, start }); current = []; lineWidth = 0; start = marL; };
    for (const token of tokens) {
      if (token.br) { current.push(token); flush(); continue; }
      const trimmed = token.text.trimEnd() === token.text ? token.width : measure(token.text.trimEnd(), token.font);
      if (current.length && lineWidth + trimmed > avail() && !CLOSING.test(token.text) && token.text.trim()) {
        flush();
        if (!token.text.trim()) continue;
      }
      // A word longer than the whole line is cut into characters.
      if (!current.length && trimmed > avail() && Array.from(token.text).length > 1) {
        for (const ch of Array.from(token.text)) {
          const w = measure(ch, token.font);
          if (current.length && lineWidth + w > avail()) flush();
          current.push({ ...token, text: ch, width: w });
          lineWidth += w;
        }
        continue;
      }
      current.push(token);
      lineWidth += token.width;
    }
    if (current.length || !built.length || tokens[tokens.length - 1]?.br) flush();

    const pct = Math.max(0.1, (paragraph.lineSpacing.pct ?? 1) - body.lineReduction);
    if (pIndex > 0) y += spacingPx(paragraph.spaceBefore, firstPx, scale);
    built.forEach((line, lineIndex) => {
      const visible = line.tokens.filter((t) => !t.br);
      const maxPx = visible.length ? Math.max(...visible.map((t) => t.px)) : (line.tokens[0]?.px ?? sizePx(paragraph.endSize));
      const lineHeight = paragraph.lineSpacing.pts !== undefined ? paragraph.lineSpacing.pts * EMU_PER_PT * scale : maxPx * 1.2 * pct;
      const baseline = y + lineHeight - maxPx * 0.25;
      // Trailing spaces neither count toward alignment nor are drawn.
      while (visible.length && !visible[visible.length - 1].text.trim()) visible.pop();
      const last = visible[visible.length - 1];
      const widths = visible.map((t) => (t === last ? measure(t.text.trimEnd(), t.font) : t.width));
      const total = widths.reduce((a, b) => a + b, 0);
      const room = innerWidth - line.start;
      let x = inner.l + line.start + (paragraph.align === 'ctr' ? (room - total) / 2 : paragraph.align === 'r' ? room - total : 0);
      const fragments: Fragment[] = visible.map((t, i) => {
        const f: Fragment = {
          text: t === last ? t.text.trimEnd() : t.text, x, width: widths[i], font: t.font, px: t.px, color: t.run.color,
          underline: t.run.underline, strike: t.run.strike, rise: t.run.baseline ? (t.run.baseline / 100) * t.px * 1.5 : 0,
        };
        x += widths[i];
        return f;
      });
      lines.push({
        paragraph: pIndex,
        baseline,
        fragments,
        bullet: lineIndex === 0 && bullet ? { ...bullet, x: inner.l + bullet.x } : undefined,
      });
      y += lineHeight;
    });
    y += spacingPx(paragraph.spaceAfter, firstPx, scale);
  });

  const innerHeight = height - inner.t - inner.b;
  const offset = inner.t + (body.anchor === 'ctr' ? (innerHeight - y) / 2 : body.anchor === 'b' ? innerHeight - y : 0);
  for (const line of lines) line.baseline += offset;
  return { lines, height: y };
}

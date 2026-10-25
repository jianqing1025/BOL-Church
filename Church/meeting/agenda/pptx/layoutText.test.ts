import { describe, expect, it } from 'vitest';
import { bulletGlyph, EMU_PER_PT, layoutText, type FontMeasure } from './layoutText';
import type { Paragraph, Run, TextBody } from './model';

// Every character as wide as the font's pixel size: easy to reason about.
const measure: FontMeasure = (text, font) => Array.from(text).length * Number(/(\d+(?:\.\d+)?)px/.exec(font)![1]);

// One pixel per EMU-point, so a 10pt run is 10px.
const SCALE = 1 / EMU_PER_PT;
const black = { r: 0, g: 0, b: 0, a: 1 };
const run = (text: string, size = 10): Run => ({ text, size, bold: false, italic: false, underline: false, strike: false, color: black, font: 'sans-serif', baseline: 0, caps: false });
const paragraph = (runs: Run[], extra: Partial<Paragraph> = {}): Paragraph => ({
  align: 'l', level: 0, marL: 0, indent: 0, lineSpacing: { pct: 1 }, spaceBefore: {}, spaceAfter: {}, bullet: null, runs, endSize: 10, ...extra,
});
const body = (paragraphs: Paragraph[], extra: Partial<TextBody> = {}): TextBody => ({
  anchor: 't', anchorCtr: false, insets: { l: 0, t: 0, r: 0, b: 0 }, wrap: true, fontScale: 1, lineReduction: 0, paragraphs, ...extra,
});
const lineTexts = (laid: ReturnType<typeof layoutText>) => laid.lines.map((l) => l.fragments.map((f) => f.text).join(''));

describe('layoutText', () => {
  it('wraps Chinese between characters and English between words', () => {
    const laid = layoutText(body([paragraph([run('神愛世人甚至將他的獨生子')]), paragraph([run('for God so loved')])]), 50, 500, SCALE, measure);
    expect(lineTexts(laid)).toEqual(['神愛世人甚', '至將他的獨', '生子', 'for', 'God', 'so', 'loved']);
  });

  it('keeps closing punctuation off the start of a line', () => {
    const laid = layoutText(body([paragraph([run('一二三四，五')])]), 40, 500, SCALE, measure);
    expect(lineTexts(laid)).toEqual(['一二三四，', '五']);
  });

  it('places lines by alignment and the body by its anchor', () => {
    const centred = layoutText(body([paragraph([run('中')], { align: 'ctr' })], { anchor: 'ctr' }), 100, 100, SCALE, measure);
    expect(centred.lines[0].fragments[0].x).toBe(45);
    // One 12px line, centred in 100px.
    expect(centred.height).toBeCloseTo(12);
    expect(centred.lines[0].baseline).toBeCloseTo(44 + 12 - 2.5);
    const right = layoutText(body([paragraph([run('右')], { align: 'r' })]), 100, 100, SCALE, measure);
    expect(right.lines[0].fragments[0].x).toBe(90);
  });

  it('hangs the bullet in the indent and starts the text at the margin', () => {
    const laid = layoutText(body([paragraph([run('要點')], { marL: 20 * EMU_PER_PT, indent: -20 * EMU_PER_PT, bullet: { text: '•', sizePct: 1 } })]), 200, 100, SCALE, measure);
    expect(laid.lines[0].bullet?.x).toBe(0);
    expect(laid.lines[0].fragments[0].x).toBe(20);
  });

  it('honours forced breaks, autofit scaling and no-wrap', () => {
    const laid = layoutText(body([paragraph([run('上'), run('\n'), run('下')])], { fontScale: 0.5 }), 100, 100, SCALE, measure);
    expect(lineTexts(laid)).toEqual(['上', '下']);
    expect(laid.lines[0].fragments[0].px).toBe(5);
    const long = layoutText(body([paragraph([run('一二三四五六')])], { wrap: false }), 20, 100, SCALE, measure);
    expect(lineTexts(long)).toEqual(['一二三四五六']);
  });

  it('draws Wingdings bullets as the symbols they stand for', () => {
    expect(bulletGlyph('Ø', '"Wingdings", sans-serif').text).toBe('➢');
    expect(bulletGlyph('•', '"Arial"').text).toBe('•');
  });
});

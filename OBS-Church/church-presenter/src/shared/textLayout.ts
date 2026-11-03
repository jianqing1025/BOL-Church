import { wrapText, type Measure } from '@church/meeting/agenda/slideLayout';
import type { LayoutMode } from './model';

/**
 * 文字自動排版：每種版式有自己的區域、字級範圍與行距。內容放得下就用最大的字，
 * 放不下先縮小，到最小還放不下就分頁（以段落為單位；單一段落本身太長才切開它）。
 * 斷行沿用 bolccop meeting 的 wrapText：中文逐字可斷、英文以詞為單位，標點不放行首。
 */

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

export interface Box { x: number; y: number; w: number; h: number }

export interface ModeSpec {
  box: Box;
  /** Title size; 0 for no title. */
  titlePx: number;
  bodyMax: number;
  bodyMin: number;
  lineHeight: number;
  align: 'left' | 'center';
  /** Space between the title and the text. */
  gap: number;
  /** Lower thirds sit on a band; the rest fill the slide. */
  band?: Box;
}

const MARGIN_X = 150;

export const MODES: Record<LayoutMode, ModeSpec> = {
  center: { box: { x: MARGIN_X, y: 110, w: SLIDE_W - 2 * MARGIN_X, h: 860 }, titlePx: 76, bodyMax: 96, bodyMin: 56, lineHeight: 1.45, align: 'center', gap: 44 },
  left: { box: { x: MARGIN_X, y: 110, w: SLIDE_W - 2 * MARGIN_X, h: 860 }, titlePx: 72, bodyMax: 80, bodyMin: 48, lineHeight: 1.5, align: 'left', gap: 40 },
  lyrics: { box: { x: 120, y: 90, w: SLIDE_W - 240, h: 900 }, titlePx: 0, bodyMax: 120, bodyMin: 64, lineHeight: 1.4, align: 'center', gap: 0 },
  // Same sizes as the meeting's scripture slides: never below the title size plus a step.
  scripture: { box: { x: MARGIN_X, y: 110, w: SLIDE_W - 2 * MARGIN_X, h: 830 }, titlePx: 64, bodyMax: 96, bodyMin: 80, lineHeight: 1.5, align: 'left', gap: 40 },
  lowerThird: {
    box: { x: 200, y: 790, w: SLIDE_W - 400, h: 230 },
    band: { x: 0, y: 760, w: SLIDE_W, h: 320 },
    titlePx: 40, bodyMax: 64, bodyMin: 44, lineHeight: 1.35, align: 'center', gap: 14,
  },
};

export interface Laid {
  titleLines: string[];
  titlePx: number;
  bodyLines: string[];
  bodyPx: number;
  /** Total height of title, gap and text, for centring. */
  height: number;
  /** True when even the smallest size ran out of room (only for a single unsplittable line run). */
  overflow: boolean;
}

const titleHeight = (spec: ModeSpec, lines: string[]) => (lines.length ? lines.length * spec.titlePx * 1.25 + spec.gap : 0);

function wrapParagraphs(paragraphs: readonly string[], width: number, px: number, measure: Measure): string[] {
  return paragraphs.flatMap((p) => (p.trim() ? wrapText(p.trim(), width, px, measure) : ['']));
}

/** The largest text that fits the mode's box. */
export function fitText(mode: LayoutMode, title: string, paragraphs: readonly string[], measure: Measure, titleMeasure: Measure = measure): Laid {
  const spec = MODES[mode];
  const titleLines = spec.titlePx && title.trim() ? wrapText(title.trim(), spec.box.w, spec.titlePx, titleMeasure) : [];
  const th = titleHeight(spec, titleLines);
  for (let px = spec.bodyMax; px >= spec.bodyMin; px -= 4) {
    const bodyLines = wrapParagraphs(paragraphs, spec.box.w, px, measure);
    const height = th + bodyLines.length * px * spec.lineHeight;
    if (height <= spec.box.h) return { titleLines, titlePx: spec.titlePx, bodyLines, bodyPx: px, height, overflow: false };
  }
  const bodyLines = wrapParagraphs(paragraphs, spec.box.w, spec.bodyMin, measure);
  return {
    titleLines, titlePx: spec.titlePx, bodyLines, bodyPx: spec.bodyMin,
    height: th + bodyLines.length * spec.bodyMin * spec.lineHeight, overflow: true,
  };
}

/**
 * Splits text into slides that each fit at the mode's smallest size (or larger).
 * Whole paragraphs stay together; a paragraph longer than a slide is cut by line.
 * The title is measured with room for a page number, 「（9/9）」.
 */
export function paginate(mode: LayoutMode, title: string, paragraphs: readonly string[], measure: Measure, titleMeasure: Measure = measure): string[][] {
  const spec = MODES[mode];
  const titleLines = spec.titlePx && title.trim() ? wrapText(`${title.trim()}（9/9）`, spec.box.w, spec.titlePx, titleMeasure) : [];
  const capacity = Math.max(1, Math.floor((spec.box.h - titleHeight(spec, titleLines)) / (spec.bodyMin * spec.lineHeight)));
  const linesOf = (p: string) => (p.trim() ? wrapText(p.trim(), spec.box.w, spec.bodyMin, measure) : ['']);

  const pages: string[][] = [];
  let page: string[] = [];
  let used = 0;
  for (const paragraph of paragraphs) {
    const lines = linesOf(paragraph);
    if (used + lines.length > capacity && page.length) {
      pages.push(page);
      page = [];
      used = 0;
    }
    if (lines.length > capacity) {
      // Too long for any slide: cut it into slide-sized runs of lines.
      for (let i = 0; i < lines.length; i += capacity) {
        const run = joinLines(lines.slice(i, i + capacity));
        if (i + capacity < lines.length) pages.push([run]);
        else { page = [run]; used = Math.min(capacity, lines.length - i); }
      }
      continue;
    }
    page.push(paragraph);
    used += lines.length;
  }
  if (page.length || !pages.length) pages.push(page);
  // A blank line opening or closing a slide is only spacing.
  return pages.map((p) => trimBlank(p));
}

/** Wrapped lines back into one paragraph; a space only where two Latin words meet. */
function joinLines(lines: readonly string[]): string {
  return lines.reduce((out, line) => (out && /[A-Za-z0-9,.;:!?)]$/.test(out) && /^[A-Za-z0-9(]/.test(line) ? `${out} ${line}` : out + line), '');
}

function trimBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}

/** Text with blank lines between groups, as slides: each group its own slide (ProPresenter's way). */
export function splitGroups(body: string): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim()) current.push(line);
    else if (current.length) { groups.push(current); current = []; }
  }
  if (current.length) groups.push(current);
  return groups;
}

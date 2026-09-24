/** A 1080p slide, sized for being read on a phone after it is scaled down. */
export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;
export const MARGIN_X = 154; // 8%
export const MARGIN_Y = 110;
export const FOOTER_SPACE = 70;
export const TITLE_PX = 72;
export const BODY_MAX_PX = 48;
export const BODY_MIN_PX = 32;
export const LINE_HEIGHT = 1.7;
export const TITLE_GAP = 44;

/** Width of `text` at `px` pixels. The canvas supplies the real one. */
export type Measure = (text: string, px: number) => number;

const CJK = '\\u2e80-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef\\u3000-\\u303f';
const TOKEN = new RegExp(`[${CJK}]|[^\\s${CJK}]+\\s*|\\s+`, 'g');
/** Punctuation that may not begin a line (禁則). */
const CLOSING = /^[，。、；：！？）」』》〉,.;:!?)\]]/;

export function wrapText(text: string, maxWidth: number, px: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const token of paragraph.match(TOKEN) ?? []) {
      const candidate = line + token;
      if (line && measure(candidate.trimEnd(), px) > maxWidth && !CLOSING.test(token)) {
        lines.push(line.trimEnd());
        line = token.trimStart();
      } else {
        line = candidate;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export interface TextSlideLayout {
  titleLines: string[];
  bodyLines: string[];
  bodyPx: number;
  /** True when even the smallest size runs off the slide — suggest splitting. */
  overflow: boolean;
}

export function layoutTextSlide(title: string, body: string, measure: Measure): TextSlideLayout {
  const width = SLIDE_WIDTH - 2 * MARGIN_X;
  const available = SLIDE_HEIGHT - 2 * MARGIN_Y - FOOTER_SPACE;
  const titleLines = title.trim() ? wrapText(title.trim(), width, TITLE_PX, measure) : [];
  const titleHeight = titleLines.length ? titleLines.length * TITLE_PX * 1.3 + TITLE_GAP : 0;
  const trimmed = body.trim();
  for (let px = BODY_MAX_PX; px >= BODY_MIN_PX; px -= 2) {
    const bodyLines = trimmed ? wrapText(trimmed, width, px, measure) : [];
    if (titleHeight + bodyLines.length * px * LINE_HEIGHT <= available) {
      return { titleLines, bodyLines, bodyPx: px, overflow: false };
    }
  }
  return { titleLines, bodyLines: wrapText(trimmed, width, BODY_MIN_PX, measure), bodyPx: BODY_MIN_PX, overflow: true };
}

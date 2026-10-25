/** A 1080p slide, sized for being read on a phone after it is scaled down. */
export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;
export const MARGIN_X = 154; // 8%
export const MARGIN_Y = 110;
export const FOOTER_SPACE = 70;
export const TITLE_PX = 72;
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

// 經文與文字投影片：字要大到坐在後排、或手機縮小後都看得清楚——最小比標題
// （TITLE_PX）再大一號，放不下時分頁，而不是再縮小或被截掉。
export const SCRIPTURE_STEP_PX = 8;
export const SCRIPTURE_MIN_PX = TITLE_PX + SCRIPTURE_STEP_PX;
export const SCRIPTURE_MAX_PX = SCRIPTURE_MIN_PX + 2 * SCRIPTURE_STEP_PX;
export const SCRIPTURE_LINE_HEIGHT = 1.5;

export interface ScripturePage {
  titleLines: string[];
  bodyLines: string[];
  bodyPx: number;
  /**
   * The same text as whole paragraphs (verses), for a reader that wraps on its
   * own — an exported PowerPoint. A verse cut across pages is split with it.
   */
  paragraphs: string[];
}

interface Line { text: string; /** Begins a verse rather than continuing one. */ start: boolean }

/** Wrapped lines back into their paragraphs; a space only where Latin words met. */
function joinParagraphs(lines: readonly Line[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.start || !out.length) { out.push(line.text); continue; }
    const prev = out[out.length - 1];
    out[out.length - 1] = prev + (/[A-Za-z0-9,.;:!?)]$/.test(prev) && /^[A-Za-z0-9(]/.test(line.text) ? ' ' : '') + line.text;
  }
  return out;
}

const page = (titleLines: string[], lines: Line[], bodyPx: number): ScripturePage =>
  ({ titleLines, bodyLines: lines.map((l) => l.text), bodyPx, paragraphs: joinParagraphs(lines) });

/**
 * 一段經文的投影片（可能多頁）。整段放得下就用最大的字；放不下先縮到最小，
 * 再放不下就按節分頁，標題加「（1/3）」。只有單一節本身長過一頁時才會切開那一節。
 */
export function layoutScripturePages(title: string, verses: readonly string[], measure: Measure): ScripturePage[] {
  const width = SLIDE_WIDTH - 2 * MARGIN_X;
  const available = SLIDE_HEIGHT - 2 * MARGIN_Y - FOOTER_SPACE;
  const titleLinesFor = (text: string) => (text.trim() ? wrapText(text.trim(), width, TITLE_PX, measure) : []);
  const titleHeight = (lines: string[]) => (lines.length ? lines.length * TITLE_PX * 1.3 + TITLE_GAP : 0);
  const wrapVerse = (verse: string, px: number): Line[] => wrapText(verse, width, px, measure).map((text, i) => ({ text, start: i === 0 }));

  const titleLines = titleLinesFor(title);
  for (let px = SCRIPTURE_MAX_PX; px >= SCRIPTURE_MIN_PX; px -= SCRIPTURE_STEP_PX) {
    const bodyLines = verses.flatMap(verse => wrapVerse(verse, px));
    if (titleHeight(titleLines) + bodyLines.length * px * SCRIPTURE_LINE_HEIGHT <= available) {
      return [page(titleLines, bodyLines, px)];
    }
  }

  // 分頁：每頁容量以最寬的頁碼（99/99）估，確保加上頁碼後的標題也放得下
  const px = SCRIPTURE_MIN_PX;
  const capacity = Math.max(1, Math.floor((available - titleHeight(titleLinesFor(`${title}（99/99）`))) / (px * SCRIPTURE_LINE_HEIGHT)));
  const pages: Line[][] = [];
  let current: Line[] = [];
  for (const verse of verses) {
    let lines = wrapVerse(verse, px);
    if (current.length + lines.length > capacity && current.length) {
      pages.push(current);
      current = [];
    }
    while (lines.length > capacity) {
      pages.push(lines.slice(0, capacity));
      lines = lines.slice(capacity);
    }
    current.push(...lines);
  }
  if (current.length) pages.push(current);
  return pages.map((lines, i) => page(titleLinesFor(`${title}（${i + 1}/${pages.length}）`), lines, px));
}

/** 一張文字投影片：和經文一樣大的字，放不下時在段落之間分頁。 */
export function layoutTextPages(title: string, body: string, measure: Measure): ScripturePage[] {
  const trimmed = body.trim();
  return layoutScripturePages(title, trimmed ? trimmed.split('\n') : [], measure);
}

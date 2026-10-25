import type { Language } from '../../types';
import { scriptureLabel, scriptureVerseLines } from './agendaModel';
import {
  FOOTER_SPACE, MARGIN_X, MARGIN_Y, SCRIPTURE_LINE_HEIGHT, SLIDE_HEIGHT, SLIDE_WIDTH, TITLE_GAP, TITLE_PX,
  layoutScripturePages, layoutTextPages, type Measure, type ScripturePage,
} from './slideLayout';
import type { SlideTheme } from './slideThemes';
import type { Agenda } from './types';

/**
 * 匯出為 PPTX: an agenda as a PowerPoint, laid out like the meeting's own
 * slides. Text and passages stay editable text; pictures go in as pictures; an
 * imported deck goes in as one picture per slide, each with all its clicks done.
 * A video cannot travel inside the file, so its slide says where to find it.
 */

export type ExportSlide =
  | { kind: 'text'; title: string; paragraphs: string[]; bodyPx: number; align?: 'center'; footer: string }
  | { kind: 'image'; data: string; width: number; height: number; caption: string; footer: string }
  | { kind: 'full'; data: string }
  | { kind: 'note'; title: string; lines: { text: string; url?: string }[]; footer: string };

export interface ExportSources {
  language: Language;
  footer: string;
  /** Text width on the slide, for paging text as the meeting does. */
  measure: Measure;
  loadChapter: (bookId: number, chapter: number) => Promise<string[]>;
  /** A stored picture as a data URL, with its size; null when it is gone. */
  loadImage: (fileId: string) => Promise<{ data: string; width: number; height: number } | null>;
  /** Each slide of a stored deck, all clicks done, as data URLs. */
  loadDeckSlides: (fileId: string) => Promise<string[]>;
  labels: { video: string; youtube: string };
}

const pagedTitle = (title: string, i: number, count: number) => (count > 1 ? `${title}（${i + 1}/${count}）` : title);

function textSlides(title: string, pages: ScripturePage[], footer: string, align?: 'center'): ExportSlide[] {
  return pages.map((page, i) => ({ kind: 'text', title: pagedTitle(title.trim(), i, pages.length), paragraphs: page.paragraphs, bodyPx: page.bodyPx, align, footer }));
}

export async function planSlides(agenda: Agenda, src: ExportSources): Promise<ExportSlide[]> {
  const slides: ExportSlide[] = [];
  for (const item of agenda.items) {
    switch (item.kind) {
      case 'text':
        slides.push(...textSlides(item.title, layoutTextPages(item.title, item.body, src.measure), src.footer, item.align));
        break;
      case 'scripture': {
        const label = scriptureLabel(item, src.language);
        const verses = scriptureVerseLines(item, await src.loadChapter(item.bookId, item.chapter));
        slides.push(...textSlides(label, layoutScripturePages(label, verses, src.measure), src.footer));
        break;
      }
      case 'image': {
        const image = await src.loadImage(item.fileId);
        if (image) slides.push({ kind: 'image', ...image, caption: item.title.trim(), footer: src.footer });
        break;
      }
      case 'ppt':
        for (const data of await src.loadDeckSlides(item.fileId)) slides.push({ kind: 'full', data });
        break;
      case 'youtube': {
        const url = item.url?.trim() || `https://www.youtube.com/watch?v=${item.videoId}${item.startSeconds ? `&t=${item.startSeconds}s` : ''}`;
        slides.push({ kind: 'note', title: item.title.trim() || 'YouTube', lines: [{ text: `${src.labels.youtube}：${url}`, url }], footer: src.footer });
        break;
      }
      case 'localVideo':
        slides.push({ kind: 'note', title: item.title.trim() || item.fileName, lines: [{ text: `${src.labels.video}：${item.fileName}` }], footer: src.footer });
        break;
    }
  }
  return slides;
}

/** pptxgenjs wants 'image/png;base64,…' — no 'data:' in front. */
const bare = (dataUrl: string) => dataUrl.replace(/^data:/, '');
/** Slide pixels (1920 wide) → inches (13.33 wide); half of a pixel is a point. */
const inch = (px: number) => px / 144;
const pt = (px: number) => px / 2;

const FONT = 'Microsoft JhengHei';

/** A CSS color ('#rrggbb' or 'rgba(r, g, b, a)') as PowerPoint wants it: hex, and transparency 0–100. */
export function pptColor(css: string): { color: string; transparency: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(css.trim());
  if (hex) return { color: hex[1].toUpperCase(), transparency: 0 };
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/i.exec(css);
  if (!m) return { color: 'FFFFFF', transparency: 0 };
  const color = [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  return { color, transparency: Math.round((1 - (m[4] === undefined ? 1 : Number(m[4]))) * 100) };
}

/** The overlay theme's text is outlined and shadowed, like a subtitle. */
const textEffects = (theme: SlideTheme) => (theme.overlay
  ? { outline: { color: '000000', size: 1.5 }, shadow: { type: 'outer' as const, color: '000000', blur: 4, offset: 2, angle: 45, opacity: 0.6 } }
  : {});
const CONTENT = { x: inch(MARGIN_X), y: inch(MARGIN_Y), w: inch(SLIDE_WIDTH - 2 * MARGIN_X), h: inch(SLIDE_HEIGHT - 2 * MARGIN_Y - FOOTER_SPACE) };

type Pptx = import('pptxgenjs').default;
type PptxSlide = ReturnType<Pptx['addSlide']>;

function addFooter(slide: PptxSlide, footer: string, theme: SlideTheme) {
  if (!footer) return;
  slide.addText(footer, {
    x: 0, y: inch(SLIDE_HEIGHT - 50 - 30), w: inch(SLIDE_WIDTH - MARGIN_X), h: inch(40),
    align: 'right', valign: 'bottom', fontSize: 13, fontFace: FONT, ...pptColor(theme.footer), margin: 0, ...textEffects(theme),
  });
}

export async function writePptx<T extends 'blob' | 'uint8array'>(
  slides: readonly ExportSlide[],
  /** `background` is the theme's, drawn; null for the overlay theme, which has none. */
  meta: { title: string; background: string | null; theme: SlideTheme },
  outputType: T,
): Promise<T extends 'blob' ? Blob : Uint8Array> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = meta.title;
  pptx.company = 'BOLCCOP';
  // The blue background is kept once, on a master, rather than once per slide.
  const { theme } = meta;
  const title = pptColor(theme.title).color;
  const body = pptColor(theme.body).color;
  const effects = textEffects(theme);
  // The background is kept once, on a master, rather than once per slide.
  // pptxgenjs names a background picture by `path`, PNG unless told otherwise.
  pptx.defineSlideMaster({
    title: 'BOLCCOP',
    background: meta.background
      ? { data: bare(meta.background), path: /^(data:)?image\/jpeg/.test(meta.background) ? 'background.jpg' : 'background.png' }
      : { color: 'FFFFFF', transparency: 100 },
    objects: [],
  });

  for (const spec of slides) {
    const slide = spec.kind === 'text' || spec.kind === 'note' ? pptx.addSlide({ masterName: 'BOLCCOP' }) : pptx.addSlide();
    switch (spec.kind) {
      case 'text': {
        const runs: { text: string; options: Record<string, unknown> }[] = [];
        if (spec.title) {
          runs.push({ text: spec.title, options: { fontSize: pt(TITLE_PX), bold: true, color: title, ...effects, breakLine: spec.paragraphs.length > 0, lineSpacing: pt(TITLE_PX * 1.3), paraSpaceAfter: pt(TITLE_GAP) } });
        }
        spec.paragraphs.forEach((text, i) => runs.push({
          text: text || ' ',
          options: { fontSize: pt(spec.bodyPx), color: body, ...effects, lineSpacing: pt(spec.bodyPx * SCRIPTURE_LINE_HEIGHT), breakLine: i < spec.paragraphs.length - 1 },
        }));
        if (runs.length) {
          slide.addText(runs as never, { ...CONTENT, valign: 'middle', align: spec.align === 'center' ? 'center' : 'left', fontFace: FONT, margin: 0, fit: 'none' });
        }
        addFooter(slide, spec.footer, theme);
        break;
      }
      case 'image': {
        // Placed as the meeting's picture slide places it.
        slide.background = { color: pptColor(theme.picture).color };
        const captionSpace = spec.caption ? 90 : 0;
        const boxW = SLIDE_WIDTH - 120;
        const boxH = SLIDE_HEIGHT - 120 - captionSpace - FOOTER_SPACE / 2;
        const scale = Math.min(boxW / spec.width, boxH / spec.height);
        const w = spec.width * scale;
        const h = spec.height * scale;
        const x = (SLIDE_WIDTH - w) / 2;
        const y = 60 + (boxH - h) / 2;
        slide.addImage({ data: bare(spec.data), x: inch(x), y: inch(y), w: inch(w), h: inch(h) });
        if (spec.caption) {
          slide.addText(spec.caption, { x: CONTENT.x, y: inch(y + h + 16), w: CONTENT.w, h: inch(64), align: 'center', fontSize: 22, fontFace: FONT, color: body, ...effects, margin: 0 });
        }
        addFooter(slide, spec.footer, theme);
        break;
      }
      case 'full':
        slide.background = { color: '000000' };
        slide.addImage({ data: bare(spec.data), x: 0, y: 0, w: inch(SLIDE_WIDTH), h: inch(SLIDE_HEIGHT) });
        break;
      case 'note': {
        slide.addText([
          { text: spec.title, options: { fontSize: pt(TITLE_PX), bold: true, color: title, ...effects, breakLine: true, paraSpaceAfter: pt(TITLE_GAP) } },
          ...spec.lines.map((line, i) => ({
            text: line.text,
            options: { fontSize: 24, color: body, ...effects, breakLine: i < spec.lines.length - 1, ...(line.url ? { hyperlink: { url: line.url } } : {}) },
          })),
        ] as never, { ...CONTENT, valign: 'middle', align: 'center', fontFace: FONT, margin: 0 });
        addFooter(slide, spec.footer, theme);
        break;
      }
    }
  }
  return pptx.write({ outputType }) as Promise<T extends 'blob' ? Blob : Uint8Array>;
}

/** A file name for the agenda: its title and date, without characters Windows refuses. */
export function exportFileName(agenda: Pick<Agenda, 'title' | 'date'>): string {
  const base = `${agenda.title.trim() || 'BOLCCOP'} ${agenda.date}`.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${base}.pptx`;
}

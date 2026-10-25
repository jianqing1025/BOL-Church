import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { exportFileName, planSlides, pptColor, writePptx, type ExportSources } from './exportPptx';
import { slideTheme, SLIDE_THEMES } from './slideThemes';
import type { Agenda } from './types';
import { Language } from '../../types';

// A 1×1 PNG.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const sources = (overrides: Partial<ExportSources> = {}): ExportSources => ({
  language: Language.ZH,
  footer: '信望愛靈糧堂',
  measure: (text, px) => text.length * px,
  loadChapter: async () => ['起初，神創造天地。', '地是空虛混沌。', '神說：要有光，就有了光。'],
  loadImage: async () => ({ data: PIXEL, width: 400, height: 300 }),
  loadDeckSlides: async () => [PIXEL, PIXEL],
  labels: { video: '影片', youtube: 'YouTube' },
  ...overrides,
});

const agenda: Agenda = {
  id: 'a', title: '週二查經', date: '2026-10-20', note: '', updatedAt: 0,
  items: [
    { id: '1', kind: 'text', title: '開場', body: '歡迎大家\n一同禱告', align: 'center' },
    { id: '2', kind: 'scripture', bookId: 1, chapter: 1, fromVerse: 1, toVerse: 3 },
    { id: '3', kind: 'image', title: '合照', fileId: 'img' },
    { id: '4', kind: 'ppt', title: '講義', fileId: 'deck', fileName: '講義.pptx', size: 1, pages: 3 },
    { id: '5', kind: 'youtube', title: '詩歌', videoId: 'abc123', startSeconds: 30 },
    { id: '6', kind: 'localVideo', title: '見證', fileId: '', fileName: 'story.mp4', size: 1, path: 'C:/v/story.mp4' },
  ],
};

describe('planSlides', () => {
  it('turns each item into the slides the meeting shows, in order', async () => {
    const slides = await planSlides(agenda, sources());
    expect(slides.map((s) => s.kind)).toEqual(['text', 'text', 'image', 'full', 'full', 'note', 'note']);
    expect(slides[0]).toMatchObject({ title: '開場', paragraphs: ['歡迎大家', '一同禱告'], align: 'center', footer: '信望愛靈糧堂' });
    expect(slides[1]).toMatchObject({ title: '創世記 1:1–3' });
    expect(slides[1].kind === 'text' && slides[1].paragraphs[0]).toBe('1　起初，神創造天地。');
    expect(slides[5]).toMatchObject({ title: '詩歌', lines: [{ text: 'YouTube：https://www.youtube.com/watch?v=abc123&t=30s', url: 'https://www.youtube.com/watch?v=abc123&t=30s' }] });
    expect(slides[6]).toMatchObject({ title: '見證', lines: [{ text: '影片：story.mp4' }] });
  });

  it('pages a long text the way the meeting pages it, numbering the titles', async () => {
    const long: Agenda = { ...agenda, items: [{ id: '1', kind: 'text', title: '講義', body: Array.from({ length: 30 }, (_, i) => `第${i + 1}點`).join('\n') }] };
    const slides = await planSlides(long, sources());
    expect(slides.length).toBeGreaterThan(1);
    slides.forEach((s, i) => expect(s.kind === 'text' && s.title).toBe(`講義（${i + 1}/${slides.length}）`));
    expect(slides.flatMap((s) => (s.kind === 'text' ? s.paragraphs : []))).toHaveLength(30);
  });

  it('leaves out a picture whose file is gone', async () => {
    const slides = await planSlides({ ...agenda, items: [agenda.items[2]] }, sources({ loadImage: async () => null }));
    expect(slides).toEqual([]);
  });
});

describe('writePptx', () => {
  it('writes a PowerPoint with one slide per planned slide, text kept as text', async () => {
    const slides = await planSlides(agenda, sources());
    const bytes = await writePptx(slides, { title: agenda.title, background: PIXEL, theme: slideTheme(undefined) }, 'uint8array');
    const files = unzipSync(bytes);
    const slideFiles = Object.keys(files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    expect(slideFiles).toHaveLength(slides.length);
    const first = strFromU8(files['ppt/slides/slide1.xml']);
    expect(first).toContain('開場');
    expect(first).toContain('歡迎大家');
    expect(first).toContain('信望愛靈糧堂');
    const link = strFromU8(files['ppt/slides/_rels/slide6.xml.rels']);
    expect(link).toContain('https://www.youtube.com/watch?v=abc123&amp;t=30s');
  });
  it('writes the overlay theme without a background, its text outlined', async () => {
    const slides = await planSlides({ ...agenda, items: [agenda.items[0]] }, sources());
    const files = unzipSync(await writePptx(slides, { title: 't', background: null, theme: slideTheme('overlay') }, 'uint8array'));
    expect(Object.keys(files).filter((f) => /^ppt\/media\/.+/.test(f))).toEqual([]);
    const slide = strFromU8(files['ppt/slides/slide1.xml']);
    expect(slide).toContain('<a:ln');
    expect(slide).toContain('FFFFFF');
  });

  it('colors the text with the agenda’s theme', async () => {
    const slides = await planSlides({ ...agenda, items: [agenda.items[0]] }, sources());
    const slide = strFromU8(unzipSync(await writePptx(slides, { title: 't', background: PIXEL, theme: slideTheme('emerald') }, 'uint8array'))['ppt/slides/slide1.xml']);
    expect(slide).toContain('A7F3D0');
  });
});

it('reads CSS colors as PowerPoint colors', () => {
  expect(pptColor('#fde68a')).toEqual({ color: 'FDE68A', transparency: 0 });
  expect(pptColor('rgba(241, 245, 249, 0.55)')).toEqual({ color: 'F1F5F9', transparency: 45 });
});

it('offers ten colour themes and a transparent one, each with readable colours', () => {
  expect(SLIDE_THEMES.filter((t) => !t.overlay)).toHaveLength(10);
  expect(SLIDE_THEMES.filter((t) => t.overlay)).toHaveLength(1);
  expect(new Set(SLIDE_THEMES.map((t) => t.id)).size).toBe(SLIDE_THEMES.length);
  // An unknown or unset theme is the original deep blue.
  expect(slideTheme(undefined).id).toBe('navy');
  expect(slideTheme('gone').id).toBe('navy');
});

it('names the file after the agenda, without characters Windows refuses', () => {
  expect(exportFileName({ title: '查經: 約翰/3', date: '2026-10-20' })).toBe('查經 約翰 3 2026-10-20.pptx');
});

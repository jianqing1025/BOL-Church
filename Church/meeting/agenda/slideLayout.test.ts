import { describe, expect, it } from 'vitest';
import { SCRIPTURE_MAX_PX, SCRIPTURE_MIN_PX, TITLE_PX, layoutScripturePages, layoutTextPages, wrapText, type Measure } from './slideLayout';

// Every character one em wide: easy to reason about, close enough to CJK.
const measure: Measure = (text, px) => text.length * px;

describe('wrapText', () => {
  it('breaks Chinese anywhere and English between words', () => {
    expect(wrapText('神愛世人甚至將他的獨生子', 5 * 10, 10, measure)).toEqual(['神愛世人甚', '至將他的獨', '生子']);
    expect(wrapText('for God so loved', 9 * 10, 10, measure)).toEqual(['for God', 'so loved']);
  });

  it('keeps paragraph breaks and never starts a line with closing punctuation', () => {
    expect(wrapText('第一行\n\n第三行', 100, 10, measure)).toEqual(['第一行', '', '第三行']);
    expect(wrapText('一二三四，五', 4 * 10, 10, measure)).toEqual(['一二三四，', '五']);
  });
});

describe('layoutTextPages', () => {
  it('shows short text at the same large size as a passage', () => {
    const pages = layoutTextPages('本週代禱事項', '王弟兄的母親週四手術', measure);
    expect(pages).toHaveLength(1);
    expect(pages[0].bodyPx).toBe(SCRIPTURE_MAX_PX);
    expect(pages[0].titleLines).toEqual(['本週代禱事項']);
  });

  it('splits long text into numbered pages between paragraphs, keeping every line', () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `${i + 1}. ${'字'.repeat(20)}`);
    const pages = layoutTextPages('查經', paragraphs.join('\n'), measure);
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((page, i) => {
      expect(page.bodyPx).toBe(SCRIPTURE_MIN_PX);
      expect(page.titleLines.join('')).toContain(`（${i + 1}/${pages.length}）`);
      expect(page.bodyLines[0]).toMatch(/^\d+\. /);
    });
    expect(pages.flatMap(p => p.bodyLines).join('')).toBe(paragraphs.join(''));
  });

  it('keeps the page text as whole paragraphs for an exported deck', () => {
    const pages = layoutTextPages('', `${'字'.repeat(40)}\nfor God so loved the world`, (text, px) => text.length * px * 0.5);
    expect(pages).toHaveLength(1);
    expect(pages[0].bodyLines.length).toBeGreaterThan(2);
    expect(pages[0].paragraphs).toEqual(['字'.repeat(40), 'for God so loved the world']);
  });

  it('has no body lines for an empty body', () => {
    expect(layoutTextPages('只有標題', '  ', measure)[0].bodyLines).toEqual([]);
  });
});

describe('layoutScripturePages', () => {
  const verse = (n: number, len: number) => `${n}　${'經'.repeat(len)}`;

  it('shows a short passage whole at the largest size', () => {
    const pages = layoutScripturePages('約翰福音 3:16', [verse(16, 30)], measure);
    expect(pages).toHaveLength(1);
    expect(pages[0].bodyPx).toBe(SCRIPTURE_MAX_PX);
    expect(pages[0].titleLines).toEqual(['約翰福音 3:16']);
  });

  it('never goes below the old title size plus one step', () => {
    expect(SCRIPTURE_MIN_PX).toBe(TITLE_PX + 8);
    const pages = layoutScripturePages('詩篇 23', [1, 2, 3, 4].map(n => verse(n, 20)), measure);
    for (const page of pages) expect(page.bodyPx).toBeGreaterThanOrEqual(SCRIPTURE_MIN_PX);
  });

  it('splits a long passage into pages on verse boundaries, keeping every verse once and in order', () => {
    const verses = Array.from({ length: 12 }, (_, i) => verse(i + 1, 25));
    const pages = layoutScripturePages('羅馬書 8:28-39', verses, measure);
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((page, i) => {
      expect(page.bodyPx).toBe(SCRIPTURE_MIN_PX);
      expect(page.titleLines.join('')).toContain(`（${i + 1}/${pages.length}）`);
      // a page starts with a verse number: no verse was cut in two
      expect(page.bodyLines[0]).toMatch(/^\d+　/);
    });
    const text = pages.flatMap(p => p.bodyLines).join('');
    expect(text).toBe(verses.join(''));
  });

  it('cuts a single verse only when it alone is longer than a page', () => {
    const pages = layoutScripturePages('長經文', [verse(1, 400)], measure);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap(p => p.bodyLines).join('')).toBe(verse(1, 400));
  });
});

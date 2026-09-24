import { describe, expect, it } from 'vitest';
import { BODY_MAX_PX, BODY_MIN_PX, layoutTextSlide, wrapText, type Measure } from './slideLayout';

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

describe('layoutTextSlide', () => {
  it('uses the full body size when the text fits', () => {
    const layout = layoutTextSlide('本週代禱事項', '王弟兄的母親週四手術', measure);
    expect(layout.bodyPx).toBe(BODY_MAX_PX);
    expect(layout.overflow).toBe(false);
  });

  it('shrinks long text, and says so when even the smallest size overflows', () => {
    const medium = layoutTextSlide('', '字'.repeat(400), measure);
    expect(medium.bodyPx).toBeLessThan(BODY_MAX_PX);
    expect(medium.overflow).toBe(false);
    const huge = layoutTextSlide('', '字'.repeat(4000), measure);
    expect(huge.bodyPx).toBe(BODY_MIN_PX);
    expect(huge.overflow).toBe(true);
  });
});

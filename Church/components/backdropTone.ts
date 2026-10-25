/**
 * Whether what lies behind a floating element is light or dark, so the element
 * can take the opposite glass: dark glass over a white section, light glass
 * over the hero photo.
 */
export type Tone = 'light' | 'dark';

/** The part of a computed style that decides how a surface looks. */
export interface SurfaceStyle {
  tagName: string;
  backgroundColor: string;
  backgroundImage: string;
}

/** Light or dark for a CSS colour; null when it is mostly see-through. */
export function toneOfColor(color: string): Tone | null {
  const m = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  if (alpha < 0.5) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? 'light' : 'dark';
}

/**
 * The tone of the topmost surface that paints, walking down from the top of
 * the stack. Photos count as dark — the hero is one; a gradient is looked past,
 * since it can go either way and is usually an overlay on something else.
 */
export function toneBehind(stack: readonly SurfaceStyle[]): Tone {
  for (const surface of stack) {
    if (surface.tagName === 'IMG' || surface.tagName === 'VIDEO') return 'dark';
    if (surface.backgroundImage.includes('url(')) return 'dark';
    const tone = toneOfColor(surface.backgroundColor);
    if (tone) return tone;
  }
  return 'light';
}

/** What is under the point (x, y), ignoring `self` and everything inside it. */
export function sampleToneAt(x: number, y: number, self: Element): Tone {
  const stack = document.elementsFromPoint(x, y)
    .filter((el) => !self.contains(el))
    .map((el) => {
      const style = getComputedStyle(el);
      return { tagName: el.tagName, backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage };
    });
  return toneBehind(stack);
}

/**
 * One tone for a backdrop sampled at several points. Light glass only works
 * where everything behind it is dark; dark glass with white text reads on
 * anything, so any light part wins.
 */
export function combineTones(tones: readonly Tone[]): Tone {
  return tones.length > 0 && tones.every((tone) => tone === 'dark') ? 'dark' : 'light';
}

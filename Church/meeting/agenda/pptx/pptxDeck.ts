import { openDeck } from './deck';
import { deckPages, type Deck, type DeckPage } from './model';
import { mediaType, type PptxPackage } from './pptxPackage';
import { renderSlide, slideImageParts, type DrawableImage } from './render';

export { PptxError } from './pptxPackage';

/** Pictures kept decoded: the slides around the one on screen, not the whole deck. */
const KEEP_SLIDES = 3;

async function decode(bytes: Uint8Array, type: string): Promise<DrawableImage | null> {
  const blob = new Blob([bytes as BlobPart], { type });
  try {
    return await createImageBitmap(blob);
  } catch {
    if (type !== 'image/svg+xml' || typeof Image === 'undefined') return null;
    // An SVG decodes through an <img>, not createImageBitmap.
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch { return null; } finally { URL.revokeObjectURL(url); }
  }
}

/**
 * An imported PowerPoint, ready to show page by page — a page being one
 * slide at one of its clicks. Pictures are decoded as their slide comes up.
 */
export class PptxDeck {
  readonly pages: DeckPage[];
  private readonly images = new Map<string, DrawableImage | null>();
  private readonly recentSlides: number[] = [];
  /** The latest page asked of each canvas: a slower earlier one never paints over it. */
  private readonly latest = new WeakMap<object, number>();

  private constructor(readonly deck: Deck, private readonly pkg: PptxPackage) {
    this.pages = deckPages(deck);
  }

  static fromBytes(bytes: Uint8Array): PptxDeck {
    const { deck, pkg } = openDeck(bytes);
    return new PptxDeck(deck, pkg);
  }

  static async fromBlob(blob: Blob): Promise<PptxDeck> {
    return PptxDeck.fromBytes(new Uint8Array(await blob.arrayBuffer()));
  }

  /** Decodes what slide `index` needs, letting go of slides long past. */
  async prepareSlide(index: number): Promise<void> {
    const slide = this.deck.slides[index];
    if (!slide) return;
    const parts = slideImageParts(slide);
    await Promise.all(parts.filter((p) => !this.images.has(p)).map(async (part) => {
      const bytes = this.pkg.bytes(part);
      this.images.set(part, bytes ? await decode(bytes, mediaType(part)) : null);
    }));
    const at = this.recentSlides.indexOf(index);
    if (at >= 0) this.recentSlides.splice(at, 1);
    this.recentSlides.push(index);
    while (this.recentSlides.length > KEEP_SLIDES) {
      this.recentSlides.shift();
      const keep = new Set(this.recentSlides.flatMap((i) => slideImageParts(this.deck.slides[i])));
      for (const [part, image] of this.images) {
        if (keep.has(part)) continue;
        if (image && 'close' in image && typeof image.close === 'function') image.close();
        this.images.delete(part);
      }
    }
  }

  /** Draws page `index` (see `pages`) onto the canvas. */
  async renderPage(canvas: HTMLCanvasElement | OffscreenCanvas, index: number): Promise<void> {
    const page = this.pages[Math.max(0, Math.min(index, this.pages.length - 1))];
    if (!page) return;
    const ticket = (this.latest.get(canvas) ?? 0) + 1;
    this.latest.set(canvas, ticket);
    await this.prepareSlide(page.slide);
    if (this.latest.get(canvas) !== ticket) return;
    renderSlide(canvas, this.deck, this.deck.slides[page.slide], page.step, (part) => this.images.get(part));
    // The next slide's pictures, ready before they are asked for.
    void this.prepareSlide(page.slide + 1).catch(() => undefined);
  }

  /** The last page of each slide: the slide with all its clicks done. */
  finalPages(): number[] {
    const out: number[] = [];
    this.pages.forEach((p, i) => { if (this.pages[i + 1]?.slide !== p.slide) out.push(i); });
    return out;
  }
}

/** Decks opened recently, by stored file id: turning pages never re-reads the file. */
const opened = new Map<string, Promise<PptxDeck>>();

export function openStoredDeck(fileId: string, load: () => Promise<Blob | undefined>): Promise<PptxDeck> {
  let deck = opened.get(fileId);
  if (!deck) {
    deck = load().then((blob) => {
      if (!blob) throw new Error('missing');
      return PptxDeck.fromBlob(blob);
    });
    deck.catch(() => opened.delete(fileId));
    opened.set(fileId, deck);
    while (opened.size > 2) opened.delete(opened.keys().next().value!);
  }
  return deck;
}

import { loadChapter, scriptureLabel, verseParagraphs } from './bible';
import { baseName } from './files';
import { LANG, t } from './i18n';
import type { LibraryItem, Look, SlideRef, SlideSpec } from './model';
import { makeMeasure, openDeck } from './render';
import { paginate, splitGroups } from './textLayout';

/** One slide of an item: where it is, what it shows, and a short label for its thumbnail. */
export interface SlideEntry { ref: SlideRef; spec: SlideSpec; label: string }

let measureCanvas: HTMLCanvasElement | null = null;
const measures = () => {
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d')!;
  return { body: makeMeasure(ctx, 400), title: makeMeasure(ctx, 700) };
};

export const lookOf = (item: LibraryItem, defaultLook: Look): Look =>
  item.look ?? (item.kind === 'scripture' ? { themeId: defaultLook.themeId, layout: 'scripture' } : defaultLook);

/** "(2/3)" — full-width brackets for Chinese text. */
const pageLabel = (i: number, n: number, chinese: boolean) => (n > 1 ? (chinese ? `（${i + 1}/${n}）` : ` (${i + 1}/${n})`) : '');

/** An item, opened into its slides. */
export async function slidesOf(item: LibraryItem, defaultLook: Look, sceneId?: string): Promise<SlideEntry[]> {
  const look = lookOf(item, defaultLook);
  const at = (index: number): SlideRef => ({ itemId: item.id, index, sceneId });
  switch (item.kind) {
    case 'text': {
      const m = measures();
      const showTitle = look.layout !== 'lyrics';
      const title = showTitle ? item.title.trim() : '';
      const chinese = /[㐀-鿿]/.test(item.title + item.body) || LANG === 'zh';
      const groups = splitGroups(item.body);
      if (!groups.length) return [{ ref: at(0), spec: { kind: 'text', look, title, paragraphs: [], pageLabel: '' }, label: title || item.name }];
      const out: SlideEntry[] = [];
      for (const group of groups) {
        const pages = paginate(look.layout, title, group, m.body, m.title);
        pages.forEach((paragraphs, i) => {
          out.push({ ref: at(out.length), spec: { kind: 'text', look, title, paragraphs, pageLabel: pageLabel(i, pages.length, chinese) }, label: paragraphs[0] ?? '' });
        });
      }
      return out;
    }
    case 'scripture': {
      const m = measures();
      const version = item.version ?? 'cuv';
      const label = scriptureLabel(item.bookId, item.chapter, item.fromVerse, item.toVerse, version);
      const verses = verseParagraphs(await loadChapter(item.bookId, item.chapter, version), item.fromVerse, item.toVerse, version);
      const layout = look.layout === 'lyrics' ? 'scripture' : look.layout;
      const pages = paginate(layout, label, verses, m.body, m.title);
      return pages.map((paragraphs, i) => {
        const first = paragraphs[0]?.match(/^(\d+)/)?.[1];
        return {
          ref: at(i),
          spec: { kind: 'text', look: { ...look, layout }, title: label, paragraphs, pageLabel: pageLabel(i, pages.length, version === 'cuv') },
          label: first ? `${item.chapter}:${first}` : label,
        };
      });
    }
    case 'image':
      return [{ ref: at(0), spec: { kind: 'image', look, path: item.path, fill: item.fill, caption: '' }, label: baseName(item.path) }];
    case 'video':
      return [{ ref: at(0), spec: { kind: 'video', look, url: item.url, startSeconds: item.startSeconds, title: item.name }, label: item.name }];
    case 'ppt': {
      const deck = await openDeck(item.path);
      return deck.pages.map((page, i) => {
        const n = deck.deck.slides[page.slide].number;
        return {
          ref: at(i),
          spec: { kind: 'ppt', path: item.path, page: i },
          label: page.step > 0 ? t('slide.click', { n, k: page.step }) : t('slide.page', { n }),
        };
      });
    }
  }
}

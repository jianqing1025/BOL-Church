import { LANG, t } from './i18n';

/**
 * What the slide area shows. The items live in OBS: each is a "Church Slides"
 * source in a scene (its settings hold the item below), so they appear in the
 * Sources list, save with the scene collection and sync with the account.
 * OBS sends the whole picture as a Deck: the scenes in order, each with its
 * items in order. What one slide looks like on screen is a SlideSpec:
 * everything the output page needs to draw it, and nothing it would have to look up.
 */

export type LayoutMode = 'center' | 'left' | 'lyrics' | 'scripture' | 'lowerThird';

const LAYOUT_TEXT: Record<LayoutMode, { en: [string, string]; zh: [string, string] }> = {
  center: { en: ['Centered', 'Title on top, text centered — for topics and declarations'], zh: ['置中', '標題在上、內文置中，適合講題與宣告'] },
  left: { en: ['Outline', 'Left aligned — for outlines and key points'], zh: ['講義', '靠左排列，適合大綱與重點'] },
  lyrics: { en: ['Lyrics', 'No title, the largest centered text'], zh: ['歌詞', '不顯示標題，字最大、置中'] },
  scripture: { en: ['Scripture', 'Reference on top, large left-aligned verses (as in bolccop meeting)'], zh: ['經文', '出處在上，經文靠左大字，與 bolccop meeting 一致'] },
  lowerThird: { en: ['Lower third', 'Text only at the bottom, transparent background — overlays video'], zh: ['下方字幕', '只在畫面下方顯示文字，背景透明，可疊在影像上'] },
};

export const LAYOUTS: readonly { id: LayoutMode; name: string; hint: string }[] = (Object.keys(LAYOUT_TEXT) as LayoutMode[]).map((id) => {
  const [name, hint] = LAYOUT_TEXT[id][LANG];
  return { id, name, hint };
});

/** How an item's slides look: a background theme and a way of laying out text. */
export interface Look { themeId: string; layout: LayoutMode }

interface ItemBase {
  /** The OBS source's UUID (or a temporary id before OBS has created it). */
  id: string;
  name: string;
  /** Unset: the default look. */
  look?: Look;
}

/** Text; a blank line starts a new slide, and a long slide is split onto more. */
export interface TextItem extends ItemBase { kind: 'text'; title: string; body: string }
/** cuv: 和合本 (Chinese Union Version); kjv: King James Version. */
export type BibleVersion = 'cuv' | 'kjv';
export interface ScriptureItem extends ItemBase {
  kind: 'scripture'; bookId: number; chapter: number; fromVerse: number; toVerse: number;
  /** Unset: 和合本. */
  version?: BibleVersion;
}
/** A picture on this computer, shown whole on the theme's background (or filling the screen). */
export interface ImageItem extends ItemBase { kind: 'image'; path: string; fill: boolean; fileHash?: string }
/** A YouTube link, a video link, or a video file on this computer. */
export interface VideoItem extends ItemBase { kind: 'video'; url: string; startSeconds: number; fileHash?: string }
/** A PowerPoint file on this computer; each click of its animations is one slide. */
export interface PptItem extends ItemBase { kind: 'ppt'; path: string; pages: number; fileHash?: string }

export type LibraryItem = TextItem | ScriptureItem | ImageItem | VideoItem | PptItem;
export type ItemKind = LibraryItem['kind'];

/** One scene: a part of the service, with its items in Sources-list order. */
export interface DeckScene { id: string; name: string; items: LibraryItem[] }

export interface Deck {
  scenes: DeckScene[];
  defaultLook: Look;
  /** The scene on the main screen now. */
  currentScene: string | null;
}

export const DEFAULT_LOOK: Look = { themeId: 'navy', layout: 'center' };

export const emptyDeck = (): Deck => ({ scenes: [], defaultLook: DEFAULT_LOOK, currentScene: null });

/** One slide, ready to draw. */
export type SlideSpec =
  | { kind: 'text'; look: Look; title: string; paragraphs: string[]; /** A paged item's own title, e.g. "(2/3)". */ pageLabel: string }
  | { kind: 'image'; look: Look; path: string; fill: boolean; caption: string }
  | { kind: 'video'; look: Look; url: string; startSeconds: number; title: string }
  | { kind: 'ppt'; path: string; page: number }
  /** Just the theme's background: clear text. */
  | { kind: 'background'; look: Look }
  /** No slide: see-through, so only the live video beneath (or above) it shows — "Clear". */
  | { kind: 'blank' }
  /** Solid black over everything — "Black". */
  | { kind: 'black' };

/** Where a slide sits, so the next and previous slides can be found. */
export interface SlideRef { itemId: string; index: number; sceneId?: string }

export const newId = (): string => (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const kindName = (kind: ItemKind): string => t(`kind.${kind}`);

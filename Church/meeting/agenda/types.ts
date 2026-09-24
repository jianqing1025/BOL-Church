/**
 * 聚會內容 — what a host prepares before a meeting, kept only on their own
 * device (see agendaStore). Nothing here is ever sent to the server.
 */
/** `align: 'center'` suits a title or closing slide; the default reads like notes. */
export interface TextItem { id: string; kind: 'text'; title: string; body: string; align?: 'center' }
export interface ImageItem { id: string; kind: 'image'; title: string; fileId: string }
export interface ScriptureItem { id: string; kind: 'scripture'; bookId: number; chapter: number; fromVerse: number; toVerse: number }
/** `url` is the link as the host pasted it, shown back to them for editing. */
export interface YouTubeItem { id: string; kind: 'youtube'; title: string; videoId: string; startSeconds: number; url?: string }
/**
 * The browser stores the film itself (`fileId`); the desktop app keeps only the
 * `path` the host picked, and `fileId` is then ''.
 */
export interface LocalVideoItem { id: string; kind: 'localVideo'; title: string; fileId: string; fileName: string; size: number; path?: string }

export type AgendaItem = TextItem | ImageItem | ScriptureItem | YouTubeItem | LocalVideoItem;
export type AgendaItemKind = AgendaItem['kind'];

export interface Agenda {
  id: string;
  title: string;
  /** 'YYYY-MM-DD', the meeting's date. */
  date: string;
  note: string;
  items: AgendaItem[];
  updatedAt: number;
  /** A host's own template (保存為範本): listed under 新增一份, not with the agendas. */
  template?: boolean;
}

/** An image or video body, stored apart so opening a list never loads a film. */
export interface StoredFile {
  id: string;
  blob: Blob;
  type: string;
  size: number;
}

export const MAX_VIDEO_BYTES = 2 * 1024 ** 3;
export const MAX_IMAGE_EDGE = 3840;

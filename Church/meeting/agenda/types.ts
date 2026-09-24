/**
 * 聚會內容 — what a host prepares before a meeting, kept only on their own
 * device (see agendaStore). Nothing here is ever sent to the server.
 */
export interface TextItem { id: string; kind: 'text'; title: string; body: string }
export interface ImageItem { id: string; kind: 'image'; title: string; fileId: string }
export interface ScriptureItem { id: string; kind: 'scripture'; bookId: number; chapter: number; fromVerse: number; toVerse: number }
export interface YouTubeItem { id: string; kind: 'youtube'; title: string; videoId: string; startSeconds: number }
export interface LocalVideoItem { id: string; kind: 'localVideo'; title: string; fileId: string; fileName: string; size: number }

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

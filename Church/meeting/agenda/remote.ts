import { newId } from './agendaModel';
import { prepareImage } from './imageFile';
import type { AgendaStore } from './agendaStore';
import { buildRoomTemplate } from './templates';
import type { Agenda } from './types';

/** A video's title from YouTube's oEmbed (which allows this site to ask), or null. */
export async function fetchYouTubeTitle(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`);
    if (!res.ok) return null;
    const data = await res.json() as { title?: unknown };
    return typeof data.title === 'string' ? data.title : null;
  } catch {
    return null;
  }
}

export class ImageFetchError extends Error {
  constructor() { super('The image could not be downloaded'); this.name = 'ImageFetchError'; }
}

/**
 * Downloads an online picture once, so it is stored like one from disk. A
 * picture drawn straight from another site would taint the slide canvas —
 * after which the browser refuses to stream it — so it is never used live.
 * Sites that do not allow this fail here, with a message, not mid-meeting.
 */
export async function fetchImageFile(url: string): Promise<File> {
  let res: Response;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new ImageFetchError();
    res = await fetch(parsed.href, { mode: 'cors' });
  } catch { throw new ImageFetchError(); }
  const blob = await res.blob().catch(() => null);
  if (!res.ok || !blob || !blob.type.startsWith('image/')) throw new ImageFetchError();
  const name = decodeURIComponent(new URL(res.url || url).pathname.split('/').pop() || 'image') || 'image';
  return new File([blob], name, { type: blob.type });
}

/**
 * Creates and saves a room's template agenda. Its picture is downloaded and
 * stored first; if that fails the picture slide is left out rather than the
 * whole template.
 */
export async function createRoomTemplate(store: AgendaStore, roomId: string, now = new Date()): Promise<Agenda> {
  const { agenda, images } = buildRoomTemplate(roomId, now);
  let items = agenda.items;
  for (const image of images) {
    try {
      const fileId = await store.putFile(await prepareImage(await fetchImageFile(image.url)));
      items = items.map((item) => (item.id === image.itemId && item.kind === 'image' ? { ...item, fileId } : item));
    } catch {
      items = items.filter((item) => item.id !== image.itemId);
    }
  }
  return store.save({ ...agenda, id: agenda.id || newId(), items });
}

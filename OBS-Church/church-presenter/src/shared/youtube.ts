import { youTubeId } from './files';

/**
 * YouTube lookups for video items: a video's title (oEmbed, which allows any page to ask)
 * and a playlist's videos — YouTube does not let a page read those itself, so the sync
 * server reads the playlist for us.
 */

const PLAYLIST_API = 'https://obs-sync.bolccop.org/api/youtube-playlist';

/** A link's playlist id (`list=`), or null. Mixes (RD…) and Watch later are personal and can't be read. */
export function youTubeListId(url: string): string | null {
  const m = url.match(/[?&]list=([\w-]{10,})/);
  return m && !/^(RD|WL|LL)/.test(m[1]) ? m[1] : null;
}

/** A link to the playlist itself (not to one of its videos). */
export const isPlaylistLink = (url: string) => !!youTubeListId(url) && !youTubeId(url);

export interface Playlist { title: string; videos: { id: string; title: string }[] }

export async function fetchPlaylist(listId: string): Promise<Playlist> {
  const res = await fetch(`${PLAYLIST_API}?list=${encodeURIComponent(listId)}`);
  const body = (await res.json().catch(() => ({}))) as Partial<Playlist> & { error?: string };
  if (!res.ok || !body.videos) throw new Error(body.error ?? `HTTP ${res.status}`);
  return { title: body.title ?? '', videos: body.videos };
}

export async function fetchVideoTitle(url: string): Promise<string | null> {
  const id = youTubeId(url);
  if (!id) return null;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`);
    return res.ok ? ((await res.json()) as { title?: string }).title ?? null : null;
  } catch {
    return null;
  }
}

export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

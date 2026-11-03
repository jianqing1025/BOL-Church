/**
 * Files on this computer, as the pages may read them. Inside OBS both pages are
 * served from http://absolute/<path> (obs-browser's local-file address), where
 * any absolute path can be fetched from the same origin.
 */
const localPreviews = new Map<string, string>();
export function registerFilePreview(path: string, url: string) { localPreviews.set(path, url); }

export function fileUrl(path: string): string {
  // A root-only absolute URL crashes older OBS browser scheme handlers.
  if (!path.trim() || /^[\\/]+$/.test(path)) return 'about:blank';
  const preview = localPreviews.get(path);
  if (preview) return preview;
  if (/^(https?|data|blob):/i.test(path)) return path;
  const normal = path.replace(/\\/g, '/').replace(/^\/+/, '');
  return `http://absolute/${normal.split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`;
}

/** The file name, without folders. */
export const baseName = (path: string) => path.replace(/\\/g, '/').split('/').pop() ?? path;

/** A YouTube link's video id, or null. */
export function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  return m ? m[1] : null;
}

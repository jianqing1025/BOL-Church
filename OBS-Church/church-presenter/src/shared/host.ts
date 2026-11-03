import type { Deck, ItemKind, LibraryItem, Look, SlideRef, SlideSpec } from './model';

/**
 * Talking to OBS. Inside OBS a page calls window.obsstudio.sendToHost(json)
 * (added in OBS Church's obs-browser); OBS answers the panel through
 * window.churchHost.receive(message), and the output page through DOM events
 * (`church-show`). Outside OBS — developing in a browser — the panel answers
 * itself (see panel/store.ts) and talks to the output page over a BroadcastChannel.
 */

export type PanelToHost =
  | { type: 'panel-ready' }
  /** The panel gained or lost the keyboard. */
  | { type: 'focus'; focused: boolean }
  | { type: 'show'; spec: SlideSpec; ref: SlideRef | null }
  | { type: 'pick-file'; requestId: string; kind: 'ppt' | 'image' | 'video' | 'audio' }
  /** Create (no matching source yet) or update an item; new items go into `sceneId` (or the current scene). */
  | { type: 'save-items'; items: LibraryItem[]; sceneId: string | null; afterId?: string | null }
  | { type: 'remove-item'; id: string }
  /** A slide item dragged into `sceneId`, just before `beforeId` (null: at the end). */
  | { type: 'move-item'; id: string; sceneId: string; beforeId: string | null }
  | { type: 'set-default-look'; look: Look }
  /** The profile icon on the Slides bar: OBS shows the account menu (sign in, sync, sign out). */
  | { type: 'account-menu' };

export type HostToPanel =
  | { type: 'deck'; deck: Deck }
  | { type: 'file-picked'; requestId: string; path: string | null }
  /** The presenter remote (or a hotkey) asks for the next or previous slide. */
  | { type: 'nav'; delta: 1 | -1 }
  | { type: 'clear'; what: 'text' | 'all' }
  /** The buttons under the Sources list. */
  | { type: 'add'; kind: ItemKind }
  | { type: 'edit-item'; id: string }
  | { type: 'edit-look'; id: string | null }
  /** Who is signed in to sync (empty: nobody). */
  | { type: 'account'; email: string };

export type OutputToHost =
  | { type: 'output-ready' }
  | { type: 'media-progress'; current: number; duration: number; playing: boolean };

declare global {
  interface Window {
    obsstudio?: { sendToHost?: (json: string) => void; pluginVersion?: string };
    churchHost?: { receive: (message: HostToPanel) => void };
  }
}

const dev = typeof BroadcastChannel !== 'undefined' && !window.obsstudio ? new BroadcastChannel('church-presenter-dev') : null;

export const insideObs = () => typeof window.obsstudio?.sendToHost === 'function';

/** Outside OBS the panel plays the host itself; it registers here. */
let devHost: ((message: PanelToHost) => void) | null = null;
export const setDevHost = (handler: (message: PanelToHost) => void) => { devHost = handler; };

export function sendToHost(message: PanelToHost | OutputToHost): void {
  if (insideObs()) {
    window.obsstudio!.sendToHost!(JSON.stringify(message));
    return;
  }
  if (message.type === 'show') dev?.postMessage(message);
  if (devHost && message.type !== 'output-ready' && message.type !== 'media-progress') devHost(message);
}

/** The panel's inbox. */
export function onHostMessage(handler: (message: HostToPanel) => void): () => void {
  window.churchHost = { receive: handler };
  return () => { if (window.churchHost?.receive === handler) delete window.churchHost; };
}

/** The output page's inbox: what to show. */
export function onShow(handler: (spec: SlideSpec) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<SlideSpec>).detail);
  window.addEventListener('church-show', listener);
  const devListener = (event: MessageEvent) => { if (event.data?.type === 'show') handler(event.data.spec); };
  dev?.addEventListener('message', devListener);
  return () => {
    window.removeEventListener('church-show', listener);
    dev?.removeEventListener('message', devListener);
  };
}

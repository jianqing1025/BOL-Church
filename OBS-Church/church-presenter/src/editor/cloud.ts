import { registerFilePreview } from '../shared/files';
import { t } from '../shared/i18n';
import type { HostToPanel, PanelToHost } from '../shared/host';
import { DEFAULT_LOOK, newId, type Deck, type LibraryItem, type Look, type VideoEntry } from '../shared/model';

/**
 * The web editor's data: the church content kept in the account (what OBS Church
 * syncs), edited here and saved back. OBS picks the changes up at its next sync.
 *
 * Content: { version, defaultLook, scenes: [{ name, syncId, items: [item + syncId (+ fileHash, fileName)] }] }
 * An item's syncId is its id everywhere: in this page, in every OBS that syncs.
 */

const API = '/api';
const TOKEN_KEY = 'obs-church-editor.token';

type StoredItem = Omit<LibraryItem, 'id'> & { syncId: string; fileHash?: string; fileName?: string };
interface StoredScene { name: string; syncId: string; items: StoredItem[] }
interface Content { version: 1; defaultLook: Look; scenes: StoredScene[]; settings?: Record<string, unknown> }

export type SaveState = 'loading' | 'saved' | 'saving' | 'error' | 'reloaded' | 'conflict';

interface State {
  content: Content;
  rev: number;
  scene: string | null;
  item: string | null;
  save: SaveState;
  error: string | null;
}

let state: State = {
  content: { version: 1, defaultLook: DEFAULT_LOOK, scenes: [] },
  rev: 0,
  scene: null,
  item: null,
  save: 'loading',
  error: null,
};

const listeners = new Set<() => void>();
let deliverToPanel: ((message: HostToPanel) => void) | null = null;

export const getState = () => state;
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function set(patch: Partial<State>, { save = false } = {}) {
  state = { ...state, ...patch };
  if (save) scheduleSave();
  publish();
  listeners.forEach((l) => l());
}

// ---------- the account ----------

export const token = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };

export async function login(password: string): Promise<string | null> {
  try {
  const res = await fetch(`${API}/editor/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token) return body.error ?? 'failed';
  try { sessionStorage.setItem(TOKEN_KEY, body.token); } catch { /* private window */ }
  return null;
  } catch { return 'offline'; }
}

export function logout() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  location.reload();
}

const auth = () => ({ authorization: `Bearer ${token()}` });

export async function load(): Promise<void> {
  try {
  const res = await fetch(`${API}/content`, { headers: auth() });
  if (res.status === 401) { logout(); return; }
  if (!res.ok) { set({ save: 'error', error: `HTTP ${res.status}` }); return; }
  const body = (await res.json()) as { rev: number; content: Content | null };
  const content: Content = body.content ?? { version: 1, defaultLook: DEFAULT_LOOK, scenes: [] };
  content.scenes ??= [];
  for (const scene of content.scenes) scene.syncId ||= newId();
  set({
    content,
    rev: body.rev,
    save: 'saved',
    error: null,
    scene: content.scenes.some((s) => s.syncId === state.scene) ? state.scene : content.scenes[0]?.syncId ?? null,
  });
  } catch (error: unknown) { set({ save: 'error', error: String(error) }); }
}

let saveTimer: number | null = null;
let saving = false;
let saveAgain = false;
let conflictRev: number | null = null;
function scheduleSave() {
  if (conflictRev !== null) return;
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { void saveNow(); }, 800);
}

async function saveNow() {
  saveTimer = null;
  if (saving) { saveAgain = true; return; }
  if (conflictRev !== null) return;
  saving = true;
  saveAgain = false;
  const snapshot = state.content;
  set({ save: 'saving' });
  try {
    const res = await fetch(`${API}/content`, {
      method: 'PUT', headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ baseRev: state.rev, content: snapshot }),
    });
    if (res.status === 409) {
      const remote = await res.json() as { rev: number };
      conflictRev = remote.rev;
      set({ save: 'conflict' });
      return;
    }
    if (!res.ok) { set({ save: 'error', error: `HTTP ${res.status}` }); return; }
    const body = await res.json() as { rev: number };
    set({ rev: body.rev, save: 'saved', error: null });
    if (state.content !== snapshot) saveAgain = true;
  } catch (error: unknown) { set({ save: 'error', error: String(error) }); }
  finally {
    saving = false;
    if (saveAgain && conflictRev === null) { saveAgain = false; scheduleSave(); }
  }
}

export async function resolveConflict(keepLocal: boolean) {
  const rev = conflictRev;
  if (rev === null || saving) return;
  conflictRev = null;
  if (keepLocal) { set({ rev }); await saveNow(); }
  else { await load(); }
}

// ---------- files: previews of the account's files, uploads of new ones ----------

const blobs = new Map<string, string>();
const loadingBlobs = new Set<string>();

function fileUrlFor(hash: string): string | null {
  const ready = blobs.get(hash);
  if (ready) return ready;
  if (!loadingBlobs.has(hash)) {
    loadingBlobs.add(hash);
    fetch(`${API}/files/${hash}`, { headers: auth() })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (blob) { blobs.set(hash, URL.createObjectURL(blob)); publish(); }
      })
      .catch(() => undefined);
  }
  return null;
}

const UPLOAD = 'web-upload://';
/** The account keeps files of at most 100 MB (the server refuses bigger ones). */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The web editor's file picker: choose a file, upload it to the account, and hand back a marker. */
export function pickAndUpload(kind: 'ppt' | 'image' | 'video' | 'audio'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = kind === 'ppt' ? '.pptx' : kind === 'image' ? 'image/*' : kind === 'audio' ? 'audio/*' : 'video/mp4,video/webm,video/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      if (file.size > MAX_UPLOAD_BYTES) {
        const mb = (file.size / 1024 / 1024).toFixed(0);
        set({ save: 'error', error: t('editor.web.tooLarge', { name: file.name, mb }) });
        window.alert(t('editor.web.tooLarge', { name: file.name, mb }));
        resolve(null);
        return;
      }
      set({ save: 'saving' });
      const buffer = await file.arrayBuffer();
      const hash = await sha256(buffer);
      // Already in the account (the same file uploaded before): no need to send it again.
      const known = await fetch(`${API}/files/${hash}`, { method: 'HEAD', headers: auth() });
      const res = known.ok ? known : await fetch(`${API}/files/${hash}`, { method: 'PUT', headers: auth(), body: buffer });
      if (!res.ok) { set({ save: 'error', error: `upload HTTP ${res.status}` }); resolve(null); return; }
      blobs.set(hash, URL.createObjectURL(new Blob([buffer], { type: file.type })));
      set({ save: 'saved' });
      const marker = `${UPLOAD}${hash}/${file.name}`;
      registerFilePreview(marker, blobs.get(hash)!);
      resolve(marker);
    };
    input.click();
  });
}

// ---------- the deck the slide area shows ----------

function display(item: StoredItem): LibraryItem {
  const { syncId, ...rest } = item;
  const shown = { ...rest, id: syncId } as LibraryItem & { fileHash?: string };
  if (item.fileHash) {
    // The account's copy (the path is on the OBS computer, not here); nothing until it has arrived.
    const url = fileUrlFor(item.fileHash) ?? '';
    if (shown.kind === 'video') shown.url = url;
    else if (shown.kind === 'image' || shown.kind === 'ppt') shown.path = url;
  }
  if (shown.kind === 'video' && shown.playlist) shown.playlist = shown.playlist.map((video) =>
    ({ ...video, url: video.fileHash ? fileUrlFor(video.fileHash) ?? '' : video.url }));
  if (shown.cardMedia) shown.cardMedia = Object.fromEntries(Object.entries(shown.cardMedia).map(([index, tracks]) => [index,
    tracks.map((track) => ({ ...track, url: track.fileHash ? fileUrlFor(track.fileHash) ?? '' : track.url }))]));
  return shown;
}

function deck(): Deck {
  return {
    scenes: state.content.scenes.map((scene) => ({ id: scene.syncId, name: scene.name, items: scene.items.map(display) })),
    defaultLook: state.content.defaultLook ?? DEFAULT_LOOK,
    currentScene: state.scene,
  };
}

function publish() {
  deliverToPanel?.({ type: 'deck', deck: deck() });
}

/** The slide area's host (store.ts' setHostFactory): its requests change the content here. */
export function cloudHost(deliver: (message: HostToPanel) => void) {
  deliverToPanel = deliver;
  return (message: PanelToHost) => {
    switch (message.type) {
      case 'panel-ready':
        publish();
        break;
      case 'save-items':
        saveItems(message.items, message.sceneId, message.afterId);
        break;
      case 'remove-item':
        removeItem(message.id);
        break;
      case 'move-item':
        moveItemTo(message.id, message.sceneId, message.beforeId);
        break;
      case 'set-default-look':
        set({ content: { ...state.content, defaultLook: message.look } }, { save: true });
        break;
      case 'show':
        window.dispatchEvent(new CustomEvent('church-web-preview', { detail: message.spec }));
        if (message.ref?.sceneId) set({ scene: message.ref.sceneId, item: message.ref.itemId });
        break;
      default:
        break;
    }
  };
}

/** The stored form of an item from the slide area: blob previews back to the real paths, uploads to hashes. */
function toStored(item: LibraryItem, previous?: StoredItem): StoredItem {
  const { id, ...rest } = item;
  const stored = { ...rest, syncId: previous?.syncId ?? (id.startsWith('new-') ? newId() : id) } as StoredItem & {
    path?: string; url?: string;
  };
  const field = stored.kind === 'video' ? 'url' : stored.kind === 'image' || stored.kind === 'ppt' ? 'path' : null;
  if (field) {
    const value = stored[field] ?? '';
    if (value.startsWith(UPLOAD)) {
      const [hash, ...name] = value.slice(UPLOAD.length).split('/');
      stored.fileHash = hash;
      stored.fileName = name.join('/');
      stored[field] = stored.fileName;
    } else if (value.startsWith('blob:') && previous) {
      stored[field] = (previous as StoredItem & Record<string, string>)[field];
      stored.fileHash = previous.fileHash;
      stored.fileName = previous.fileName;
    } else if (previous && value !== (previous as StoredItem & Record<string, string>)[field]) {
      // Typed in by hand (a link): no file of ours any more.
      delete stored.fileHash;
      delete stored.fileName;
    }
  }
  const videos = stored as { playlist?: VideoEntry[] };
  if (videos.playlist) {
    const before = (previous as { playlist?: VideoEntry[] } | undefined)?.playlist ?? [];
    videos.playlist = videos.playlist.map((video, index) => {
      if (video.url.startsWith(UPLOAD)) {
        const [fileHash, ...name] = video.url.slice(UPLOAD.length).split('/');
        return { ...video, fileHash, fileName: name.join('/'), url: name.join('/') };
      }
      // A blob preview is the account's file: keep what was stored for it.
      const old = before.find((entry) => entry.fileHash && entry.fileHash === video.fileHash) ?? before[index];
      if (video.url.startsWith('blob:') && old) return { ...video, url: old.url, fileHash: old.fileHash, fileName: old.fileName };
      return { ...video };
    });
  }
  if (stored.cardMedia) stored.cardMedia = Object.fromEntries(Object.entries(stored.cardMedia).map(([index, tracks]) => [index,
    tracks.map((track) => {
      const old = previous?.cardMedia?.[index]?.find((candidate) => candidate.id === track.id);
      if (track.url.startsWith(UPLOAD)) {
        const [fileHash, ...name] = track.url.slice(UPLOAD.length).split('/');
        return { ...track, fileHash, fileName: name.join('/'), url: name.join('/') };
      }
      if (track.url.startsWith('blob:') && old) return { ...track, url: old.url, fileHash: old.fileHash, fileName: old.fileName };
      return { ...track };
    })]));
  return stored;
}

function saveItems(items: LibraryItem[], sceneId: string | null, afterId?: string | null) {
  const scenes = state.content.scenes.map((s) => ({ ...s, items: [...s.items] }));
  if (!scenes.length) scenes.push({ name: 'Scene', syncId: newId(), items: [] });
  const target = scenes.find((s) => s.syncId === (sceneId ?? state.scene)) ?? scenes[0];
  // New items follow the selected item (and each other).
  let after = target.items.findIndex((i) => i.syncId === (afterId ?? state.item));
  let lastNew: string | null = null;
  for (const item of items) {
    const home = scenes.find((s) => s.items.some((i) => i.syncId === item.id));
    if (home) {
      home.items = home.items.map((i) => (i.syncId === item.id ? toStored(item, i) : i));
      continue;
    }
    const stored = toStored(item);
    if (after >= 0) target.items.splice(++after, 0, stored);
    else target.items.push(stored);
    lastNew = stored.syncId;
  }
  set({ content: { ...state.content, scenes }, item: lastNew ?? state.item, scene: target.syncId }, { save: true });
}

/** An item dragged in the slide area: into `sceneId`, before `beforeId` (null: at the end). */
function moveItemTo(id: string, sceneId: string, beforeId: string | null) {
  const moving = state.content.scenes.flatMap((s) => s.items).find((i) => i.syncId === id);
  if (!moving || id === beforeId) return;
  const scenes = state.content.scenes.map((s) => ({ ...s, items: s.items.filter((i) => i.syncId !== id) }));
  const target = scenes.find((s) => s.syncId === sceneId);
  if (!target) return;
  const at = beforeId ? target.items.findIndex((i) => i.syncId === beforeId) : -1;
  target.items.splice(at >= 0 ? at : target.items.length, 0, moving);
  set({ content: { ...state.content, scenes }, scene: sceneId, item: id }, { save: true });
}

export function removeItem(id: string) {
  const scenes = state.content.scenes.map((s) => ({ ...s, items: s.items.filter((i) => i.syncId !== id) }));
  set({ content: { ...state.content, scenes }, item: state.item === id ? null : state.item }, { save: true });
}

// ---------- the Scenes and Sources lists ----------

export function selectScene(syncId: string) { set({ scene: syncId, item: null }); }
export function selectItem(syncId: string | null) {
  set({ item: syncId });
  void previewSelection();
}

async function previewSelection() {
  const selected = state.item;
  const current = deck();
  const item = current.scenes.flatMap((scene) => scene.items).find((item) => item.id === selected);
  if (!item) {
    window.dispatchEvent(new CustomEvent('church-web-preview', { detail: { kind: 'blank' } }));
    return;
  }
  try {
    const { slidesOf } = await import('../shared/slides');
    const slides = await slidesOf(item, current.defaultLook);
    if (state.item === selected) window.dispatchEvent(new CustomEvent('church-web-preview', {
      detail: slides[0]?.spec ?? { kind: 'blank' },
    }));
  } catch {
    if (state.item === selected) window.dispatchEvent(new CustomEvent('church-web-preview', { detail: { kind: 'blank' } }));
  }
}

export function addScene(name: string) {
  const scene: StoredScene = { name: uniqueSceneName(name), syncId: newId(), items: [] };
  set({ content: { ...state.content, scenes: [...state.content.scenes, scene] }, scene: scene.syncId, item: null }, { save: true });
}

export function renameScene(syncId: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  const scenes = state.content.scenes.map((s) => (s.syncId === syncId ? { ...s, name: uniqueSceneName(clean, syncId) } : s));
  set({ content: { ...state.content, scenes } }, { save: true });
}

export function deleteScene(syncId: string) {
  if (state.content.scenes.length <= 1) return;
  const scenes = state.content.scenes.filter((s) => s.syncId !== syncId);
  set({ content: { ...state.content, scenes }, scene: scenes[0]?.syncId ?? null, item: null }, { save: true });
}

export function moveScene(syncId: string, delta: -1 | 1) {
  const scenes = [...state.content.scenes];
  const at = scenes.findIndex((s) => s.syncId === syncId);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= scenes.length) return;
  [scenes[at], scenes[to]] = [scenes[to], scenes[at]];
  set({ content: { ...state.content, scenes } }, { save: true });
}

export function moveItem(syncId: string, delta: -1 | 1) {
  const scenes = state.content.scenes.map((s) => {
    const at = s.items.findIndex((i) => i.syncId === syncId);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= s.items.length) return s;
    const items = [...s.items];
    [items[at], items[to]] = [items[to], items[at]];
    return { ...s, items };
  });
  set({ content: { ...state.content, scenes } }, { save: true });
}

function uniqueSceneName(wanted: string, self?: string): string {
  const taken = new Set(state.content.scenes.filter((s) => s.syncId !== self).map((s) => s.name));
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; ; n++) if (!taken.has(`${wanted} ${n}`)) return `${wanted} ${n}`;
}

// ---------- templates: whole setups (scenes and their sources) saved in the account ----------

export interface TemplateInfo { id: string; name: string; updatedAt: number; scenes: number; items: number }

export async function listTemplates(): Promise<TemplateInfo[]> {
  const res = await fetch(`${API}/templates`, { headers: auth() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { templates: TemplateInfo[] }).templates;
}

/** Saves the current scenes and sources under `name` (over `id`, or as a new template). */
export async function saveTemplate(name: string, id = newId()): Promise<void> {
  const { scenes, defaultLook } = state.content;
  const res = await fetch(`${API}/templates/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { ...auth(), 'content-type': 'application/json' },
    body: JSON.stringify({ name, content: { version: 1, defaultLook, scenes } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** Replaces the whole setup with the template's scenes and sources; OBS follows at its next sync. */
export async function loadTemplate(id: string): Promise<void> {
  const res = await fetch(`${API}/templates/${encodeURIComponent(id)}`, { headers: auth() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { content } = (await res.json()) as { content: Content };
  const scenes = (content.scenes ?? []).map((scene) => ({ ...scene, syncId: scene.syncId || newId() }));
  set({
    content: { ...state.content, scenes, defaultLook: content.defaultLook ?? state.content.defaultLook },
    scene: scenes[0]?.syncId ?? null,
    item: null,
  }, { save: true });
  void previewSelection();
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${API}/templates/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

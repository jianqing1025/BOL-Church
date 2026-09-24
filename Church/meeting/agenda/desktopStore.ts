import { referencedFileIds, sortAgendas } from './agendaModel';
import { AgendaStoreError, openAgendaStore, type AgendaStore } from './agendaStore';
import type { Agenda } from './types';

const wrap = (error: unknown) => (error instanceof AgendaStoreError ? error : new AgendaStoreError(/ENOSPC/.test(String(error)) ? 'quota' : 'failed', error));

/**
 * 聚會內容 in the desktop app's BOLCCOP folder, through the shell's bridge. The
 * same contract as the browser store, so nothing above it can tell them apart.
 */
export function openDesktopAgendaStore(bridge: DesktopAgendaBridge): AgendaStore {
  const save = async (agenda: Agenda): Promise<Agenda> => {
    const next = { ...agenda, updatedAt: Date.now() };
    try { await bridge.save(next); } catch (error) { throw wrap(error); }
    return next;
  };
  const putFile = async (blob: Blob): Promise<string> => {
    try { return await bridge.putFile(await blob.arrayBuffer(), blob.type); } catch (error) { throw wrap(error); }
  };
  return {
    list: async () => sortAgendas(await bridge.list()),
    save,
    putFile,
    async remove(agendaId) { await bridge.remove(agendaId); },
    async removeItem(agenda, itemId) {
      const saved = await save({ ...agenda, items: agenda.items.filter((item) => item.id !== itemId) });
      await bridge.prune();
      return saved;
    },
    async addFileItem(agenda, blob, build) {
      const fileId = await putFile(blob);
      try {
        return await save({ ...agenda, items: [...agenda.items, build(fileId)] });
      } catch (error) {
        await bridge.deleteFile(fileId).catch(() => undefined);
        throw wrap(error);
      }
    },
    async getFile(fileId) {
      const file = await bridge.getFile(fileId);
      return file ? { id: fileId, blob: new Blob([file.bytes], { type: file.type }), type: file.type, size: file.size } : undefined;
    },
    describe: () => bridge.describe(),
  };
}

const MIGRATED_KEY = 'meeting.agenda.migratedToFolder';

/**
 * Moves what an earlier version kept in the browser into the folder, once.
 * The browser copy is left in place: nothing is lost if the move is cut short.
 */
export async function migrateBrowserAgendas(from: AgendaStore, to: AgendaStore): Promise<number> {
  let moved = 0;
  for (const agenda of await from.list()) {
    const files = new Map<string, string>();
    for (const fileId of referencedFileIds([agenda])) {
      const file = await from.getFile(fileId);
      if (file) files.set(fileId, await to.putFile(file.blob));
    }
    const items = agenda.items
      .map((item) => ((item.kind === 'image' || item.kind === 'localVideo') && item.fileId ? { ...item, fileId: files.get(item.fileId) ?? '' } : item))
      // A picture or film whose file did not make it across is dropped, not left pointing nowhere.
      .filter((item) => !((item.kind === 'image' || (item.kind === 'localVideo' && !item.path)) && !item.fileId));
    await to.save({ ...agenda, items });
    moved++;
  }
  return moved;
}

/** The store this page should use: the folder in the desktop app, the browser otherwise. */
export function openMeetingAgendaStore(): AgendaStore {
  const bridge = typeof window !== 'undefined' ? window.meetingDesktop?.agenda : undefined;
  if (!bridge) return openAgendaStore();
  const folder = openDesktopAgendaStore(bridge);
  let migration: Promise<void> | null = null;
  const migrateOnce = () => (migration ??= (async () => {
    let done = false;
    try { done = localStorage.getItem(MIGRATED_KEY) === '1'; } catch { /* treat as not done */ }
    if (done) return;
    try {
      if ((await folder.list()).length === 0) await migrateBrowserAgendas(openAgendaStore(), folder);
      try { localStorage.setItem(MIGRATED_KEY, '1'); } catch { /* retried next launch */ }
    } catch { /* the browser copy is untouched; try again next launch */ }
  })());
  return { ...folder, list: async () => { await migrateOnce(); return folder.list(); } };
}

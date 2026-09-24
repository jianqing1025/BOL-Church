import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { migrateBrowserAgendas, openDesktopAgendaStore } from './desktopStore';
import { AgendaStoreError, openAgendaStore } from './agendaStore';
import { newAgenda } from './agendaModel';
import type { Agenda } from './types';

/** An in-memory stand-in for the shell's folder. */
function fakeBridge(options: { failSave?: boolean } = {}) {
  const agendas = new Map<string, Agenda>();
  const files = new Map<string, { bytes: Uint8Array; type: string; size: number }>();
  let n = 0;
  const bridge: DesktopAgendaBridge = {
    describe: async () => ({ dir: 'X:/BOLCCOP', bytes: 0 }),
    list: async () => [...agendas.values()],
    save: async (a) => { if (options.failSave) throw new Error('ENOSPC: no space left'); agendas.set(a.id, structuredClone(a)); },
    remove: async (id) => { agendas.delete(id); },
    prune: async () => undefined,
    putFile: async (bytes, type) => { const id = `f${++n}`; files.set(id, { bytes: new Uint8Array(bytes), type, size: bytes.byteLength }); return id; },
    getFile: async (id) => files.get(id) ?? null,
    deleteFile: async (id) => { files.delete(id); },
    pickVideo: async () => null,
    videoExists: async () => true,
    videoUrl: (p) => `meeting-file://video/?p=${encodeURIComponent(p)}`,
  };
  return { bridge, agendas, files };
}

describe('desktop agenda store', () => {
  it('stores pictures in the folder and reads them back as blobs', async () => {
    const { bridge } = fakeBridge();
    const store = openDesktopAgendaStore(bridge);
    const saved = await store.addFileItem(newAgenda(new Date(), 'A'), new Blob(['pic'], { type: 'image/png' }),
      (fileId) => ({ id: 'i', kind: 'image', title: '', fileId }));
    const item = saved.items[0];
    const file = await store.getFile(item.kind === 'image' ? item.fileId : '');
    expect(await file?.blob.text()).toBe('pic');
    expect(file?.type).toBe('image/png');
  });

  it('takes the picture back out when the agenda cannot be written, and reports a full disk', async () => {
    const { bridge, files } = fakeBridge({ failSave: true });
    const store = openDesktopAgendaStore(bridge);
    const attempt = store.addFileItem(newAgenda(new Date(), 'A'), new Blob(['x']), (fileId) => ({ id: 'i', kind: 'image', title: '', fileId }));
    await expect(attempt).rejects.toBeInstanceOf(AgendaStoreError);
    await expect(attempt).rejects.toMatchObject({ reason: 'quota' });
    expect(files.size).toBe(0);
  });
});

describe('migrateBrowserAgendas', () => {
  it('copies agendas and their files from the browser into the folder', async () => {
    const browser = openAgendaStore(new IDBFactory());
    await browser.addFileItem(newAgenda(new Date(), '舊的'), new Blob(['pic'], { type: 'image/jpeg' }),
      (fileId) => ({ id: 'i', kind: 'image', title: '', fileId }));
    const { bridge, agendas } = fakeBridge();
    const folder = openDesktopAgendaStore(bridge);
    expect(await migrateBrowserAgendas(browser, folder)).toBe(1);
    const [moved] = [...agendas.values()];
    expect(moved.title).toBe('舊的');
    const item = moved.items[0];
    expect(await (await folder.getFile(item.kind === 'image' ? item.fileId : ''))?.blob.text()).toBe('pic');
  });
});

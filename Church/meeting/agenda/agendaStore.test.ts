import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { AgendaStoreError, openAgendaStore } from './agendaStore';
import { newAgenda } from './agendaModel';

const fresh = () => openAgendaStore(new IDBFactory());
const blob = (text: string) => new Blob([text], { type: 'text/plain' });

describe('agendaStore', () => {
  it('saves and lists agendas, latest meeting first', async () => {
    const store = fresh();
    const a = { ...newAgenda(new Date(2026, 8, 30), 'A') };
    const b = { ...newAgenda(new Date(2026, 9, 7), 'B') };
    await store.save(a);
    await store.save(b);
    expect((await store.list()).map((x) => x.title)).toEqual(['B', 'A']);
  });

  it('stores a file with its item and reads it back', async () => {
    const store = fresh();
    const saved = await store.addFileItem(newAgenda(new Date(), 'A'), blob('picture'),
      (fileId) => ({ id: 'i1', kind: 'image', title: 'p', fileId }));
    const item = saved.items[0];
    expect(item.kind).toBe('image');
    const file = await store.getFile(item.kind === 'image' ? item.fileId : '');
    expect(await file?.blob.text()).toBe('picture');
    expect(file?.size).toBe(7);
  });

  it('removes a file only once no agenda uses it', async () => {
    const store = fresh();
    const a = await store.addFileItem(newAgenda(new Date(), 'A'), blob('x'), (fileId) => ({ id: 'i', kind: 'image', title: 'p', fileId }));
    const fileId = a.items[0].kind === 'image' ? a.items[0].fileId : '';
    const copy = { ...a, id: 'copy', items: a.items.map((i) => ({ ...i, id: 'j' })) };
    await store.save(copy);

    await store.remove(a.id);
    expect(await store.getFile(fileId)).toBeDefined();
    await store.removeItem(copy, 'j');
    expect(await store.getFile(fileId)).toBeUndefined();
  });

  it('rolls the file back when the agenda cannot be written', async () => {
    const store = fresh();
    // A function cannot be stored, so the agenda write fails after the file went in.
    const broken = { ...newAgenda(new Date(), 'A'), note: (() => 1) as unknown as string };
    let fileId = '';
    await expect(store.addFileItem(broken, blob('x'), (id) => { fileId = id; return { id: 'i', kind: 'image', title: 'p', fileId: id }; }))
      .rejects.toBeInstanceOf(AgendaStoreError);
    expect(await store.getFile(fileId)).toBeUndefined();
  });

  it('stores a lone file for an agenda saved just after, and sweeps it if none ever is', async () => {
    const store = fresh();
    const kept = await store.putFile(blob('kept'));
    const orphan = await store.putFile(blob('orphan'));
    const a = await store.save({ ...newAgenda(new Date(), 'A'), items: [{ id: 'i', kind: 'image', title: 'p', fileId: kept }] });
    await store.removeItem({ ...a, items: [...a.items, { id: 'x', kind: 'text', title: '', body: '' }] }, 'x');
    expect(await (await store.getFile(kept))?.blob.text()).toBe('kept');
    expect(await store.getFile(orphan)).toBeUndefined();
  });
});

import { newId, referencedFileIds, sortAgendas } from './agendaModel';
import type { Agenda, AgendaItem, StoredFile } from './types';

const DB_NAME = 'meeting-agenda';
const AGENDAS = 'agendas';
const FILES = 'files';

/** 'quota' is a full disk — worth its own message; anything else is 'failed'. */
export class AgendaStoreError extends Error {
  constructor(readonly reason: 'quota' | 'failed', cause?: unknown) {
    super(reason === 'quota' ? 'Storage is full' : 'Could not save', { cause });
    this.name = 'AgendaStoreError';
  }
}

const wrap = (error: unknown): AgendaStoreError =>
  error instanceof AgendaStoreError ? error
    : new AgendaStoreError((error as { name?: string })?.name === 'QuotaExceededError' ? 'quota' : 'failed', error);

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });

export interface AgendaStore {
  list(): Promise<Agenda[]>;
  /** Writes the agenda as given, stamping `updatedAt`. */
  save(agenda: Agenda): Promise<Agenda>;
  /** Deletes an agenda and any file no other agenda still uses. */
  remove(agendaId: string): Promise<void>;
  removeItem(agenda: Agenda, itemId: string): Promise<Agenda>;
  /**
   * Stores a file and appends the item that refers to it — file first, then
   * the agenda, and the file is taken back out if the agenda write fails, so a
   * full disk never leaves a half-saved item behind.
   */
  addFileItem(agenda: Agenda, blob: Blob, build: (fileId: string) => AgendaItem): Promise<Agenda>;
  getFile(fileId: string): Promise<StoredFile | undefined>;
}

export function openAgendaStore(factory: IDBFactory = indexedDB): AgendaStore {
  let opening: Promise<IDBDatabase> | null = null;
  const db = () => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(AGENDAS, { keyPath: 'id' });
        req.result.createObjectStore(FILES, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { opening = null; reject(req.error); };
    });
    return opening;
  };

  const list = async (): Promise<Agenda[]> => {
    const tx = (await db()).transaction(AGENDAS);
    return sortAgendas(await request(tx.objectStore(AGENDAS).getAll() as IDBRequest<Agenda[]>));
  };

  const save = async (agenda: Agenda): Promise<Agenda> => {
    const next = { ...agenda, updatedAt: Date.now() };
    try {
      const tx = (await db()).transaction(AGENDAS, 'readwrite');
      tx.objectStore(AGENDAS).put(next);
      await finished(tx);
    } catch (error) { throw wrap(error); }
    return next;
  };

  const deleteFiles = async (ids: Iterable<string>) => {
    const tx = (await db()).transaction(FILES, 'readwrite');
    for (const id of ids) tx.objectStore(FILES).delete(id);
    await finished(tx);
  };

  /** Deletes stored files no agenda refers to any more. */
  const prune = async () => {
    const used = referencedFileIds(await list());
    const tx = (await db()).transaction(FILES);
    const keys = await request(tx.objectStore(FILES).getAllKeys()) as string[];
    const unused = keys.filter((key) => !used.has(key));
    if (unused.length) await deleteFiles(unused);
  };

  return {
    list,
    save,
    async remove(agendaId) {
      const tx = (await db()).transaction(AGENDAS, 'readwrite');
      tx.objectStore(AGENDAS).delete(agendaId);
      await finished(tx);
      await prune();
    },
    async removeItem(agenda, itemId) {
      const saved = await save({ ...agenda, items: agenda.items.filter((item) => item.id !== itemId) });
      await prune();
      return saved;
    },
    async addFileItem(agenda, blob, build) {
      const fileId = newId();
      try {
        const tx = (await db()).transaction(FILES, 'readwrite');
        tx.objectStore(FILES).put({ id: fileId, blob, type: blob.type, size: blob.size } satisfies StoredFile);
        await finished(tx);
      } catch (error) { throw wrap(error); }
      try {
        return await save({ ...agenda, items: [...agenda.items, build(fileId)] });
      } catch (error) {
        await deleteFiles([fileId]).catch(() => undefined);
        throw wrap(error);
      }
    },
    async getFile(fileId) {
      const tx = (await db()).transaction(FILES);
      return request(tx.objectStore(FILES).get(fileId) as IDBRequest<StoredFile | undefined>);
    },
  };
}

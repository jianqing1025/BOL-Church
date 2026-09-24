import { useCallback, useEffect, useRef } from 'react';
import { AgendaStoreError, type AgendaStore } from '../../../meeting/agenda/agendaStore';
import type { Agenda } from '../../../meeting/agenda/types';

/** The translation key for a failed write. */
export function storeErrorKey(error: unknown): string {
  return error instanceof AgendaStoreError && error.reason === 'quota' ? 'meeting.agendaStorageFull' : 'meeting.agendaSaveFailed';
}

/**
 * Saves an agenda 400ms after the last change, so typing is not a write per
 * key — and writes whatever is still pending when the editor goes away, so
 * closing mid-sentence loses nothing.
 */
export function useAgendaSaver(store: AgendaStore, onError: (error: unknown) => void) {
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<Agenda | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const flush = useCallback((): Promise<void> => {
    window.clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    return next ? store.save(next).then(() => undefined, (e) => onErrorRef.current(e)) : Promise.resolve();
  }, [store]);

  const queue = useCallback((next: Agenda) => {
    pending.current = next;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, 400);
  }, [flush]);

  /** Drops a pending write that a direct store call is about to supersede. */
  const discard = useCallback(() => {
    window.clearTimeout(timer.current);
    pending.current = null;
  }, []);

  useEffect(() => () => { void flush(); }, [flush]);

  return { queue, flush, discard };
}

export type AgendaSaver = ReturnType<typeof useAgendaSaver>;

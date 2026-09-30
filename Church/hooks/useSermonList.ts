import { useEffect } from 'react';
import { useAdmin } from './useAdmin';
import type { Sermon, SermonKind } from '../data';
import type { ListStatus } from '../context/AdminContext';

/**
 * 一種講道的完整清單。第一次用到才下載（瀏覽器會依版本號快取），
 * enabled 為 false 時不觸發下載，例如首頁只有在搜尋時才需要。
 */
export function useSermonList(kind: SermonKind, enabled = true): { items: Sermon[]; status: ListStatus; retry: () => void } {
  const { sermons, dailyManna, listStatus, ensureList } = useAdmin();
  useEffect(() => {
    if (enabled) void ensureList(kind);
  }, [kind, enabled, ensureList]);
  return {
    items: kind === 'sermon' ? sermons : dailyManna,
    status: listStatus[kind],
    retry: () => void ensureList(kind, true),
  };
}

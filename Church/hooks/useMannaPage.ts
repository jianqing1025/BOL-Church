import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type MannaPage } from '../api';
import { withRetry } from '../services/siteCache';
import { useAdmin } from './useAdmin';
import type { ListStatus } from '../context/AdminContext';

/**
 * 公開每日天言頁的一頁。只下載這一頁（50 筆），換頁才要下一頁，不再先下載三千多筆的完整清單。
 * 換頁時先留著上一頁的內容，新的一頁回來再換，畫面不會閃成空白。
 * enabled 為 false 時不下載，例如正在搜尋、改用完整清單時。
 */
export function useMannaPage(page: number, year: string | null, enabled = true): {
  data: MannaPage | null;
  status: ListStatus;
  retry: () => void;
} {
  const { version } = useAdmin();
  const [data, setData] = useState<MannaPage | null>(null);
  const [status, setStatus] = useState<ListStatus>('idle');
  const [attempt, setAttempt] = useState(0);
  // 只採用最後一次請求的結果：快速連點換頁時，先送出的請求可能比較晚回來
  const latestRequest = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const requestId = ++latestRequest.current;
    setStatus('loading');
    withRetry(() => api.mannaPage(page, year, version))
      .then(result => {
        if (requestId !== latestRequest.current) return;
        setData(result);
        setStatus('ready');
      })
      .catch(error => {
        if (requestId !== latestRequest.current) return;
        console.error('Failed to load daily manna page', error);
        setStatus('error');
      });
  }, [page, year, version, enabled, attempt]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);
  return { data, status, retry };
}

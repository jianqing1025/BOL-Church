import React, { useCallback, useEffect, useState } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { api, ApiError } from '../api';
import { renderRichText } from '../utils/richText';
import type { WeeklyReport, WeeklyReportSummary } from '../data';

const formatWeek = (weekOf: string) => {
  const [y, m, d] = weekOf.split('-').map(Number);
  return `${y}/${m}/${d}`;
};

export const formatBytes = (size: number) => (size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`);

/** 搜尋引擎不要收錄內部頁面。 */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);
}

/** 同工週報：密碼解鎖後依週次閱讀。所有資料都由伺服器驗證通行證後才給。 */
const WeeklyReportPage: React.FC = () => {
  const { t } = useLocalization();
  useNoIndex();
  const [state, setState] = useState<'checking' | 'locked' | 'open'>('checking');
  const [items, setItems] = useState<WeeklyReportSummary[]>([]);
  const [selected, setSelected] = useState<WeeklyReport | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const open = useCallback(async (id: string) => {
    setError('');
    try {
      setSelected(await api.weeklyGet(id));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setState('locked');
      else setError(t('weekly.loadFailed'));
    }
  }, [t]);

  const loadList = useCallback(async () => {
    try {
      const result = await api.weeklyList();
      setItems(result.items);
      setState('open');
      if (result.items[0]) await open(result.items[0].id);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setState('locked');
      else { setState('locked'); setError(t('weekly.loadFailed')); }
    }
  }, [open, t]);

  useEffect(() => { void loadList(); }, [loadList]);

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !password.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.weeklyUnlock(password.trim());
      setPassword('');
      await loadList();
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 429 ? t('weekly.tooMany') : t('weekly.wrong'));
    } finally {
      setBusy(false);
    }
  };

  const lock = async () => {
    await api.weeklyLock().catch(() => undefined);
    setItems([]);
    setSelected(null);
    setState('locked');
  };

  return (
    <div>
      <PageHeader title={t('weekly.title')} subtitle={t('weekly.subtitle')} />
      <div className="container mx-auto max-w-6xl px-6 py-12">
        {state === 'checking' && <div className="mx-auto h-40 max-w-sm animate-pulse rounded-2xl bg-gray-100" aria-busy="true" />}

        {state === 'locked' && (
          <form onSubmit={unlock} className="mx-auto max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <label className="block text-sm font-semibold text-gray-700" htmlFor="weekly-password">{t('weekly.password')}</label>
            <input id="weekly-password" type="password" inputMode="numeric" autoComplete="current-password" value={password}
              onChange={event => setPassword(event.target.value)} autoFocus
              className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
            <button type="submit" disabled={busy || !password.trim()}
              className="mt-4 w-full rounded-xl bg-blue-600 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              {t('weekly.enter')}
            </button>
          </form>
        )}

        {state === 'open' && (
          items.length === 0 ? (
            <div className="text-center">
              <p className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 py-16 text-gray-500">{t('weekly.empty')}</p>
              <button type="button" onClick={lock} className="mt-4 text-sm text-gray-500 underline">{t('weekly.lock')}</button>
            </div>
          ) : (
            <div className="gap-8 md:grid md:grid-cols-[16rem_1fr]">
              <nav className="mb-6 md:mb-0">
                <ul className="flex gap-2 overflow-x-auto pb-2 md:block md:space-y-1 md:overflow-visible md:pb-0">
                  {items.map(item => (
                    <li key={item.id} className="shrink-0">
                      <button type="button" onClick={() => void open(item.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected?.id === item.id ? 'bg-blue-600 font-semibold text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'}`}>
                        <span className="block tabular-nums">{t('weekly.weekOf').replace('{date}', formatWeek(item.weekOf))}</span>
                        <span className={`block truncate text-xs ${selected?.id === item.id ? 'text-blue-100' : 'text-gray-500'}`}>{item.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
              <article className="min-w-0 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-500 tabular-nums">{selected && t('weekly.weekOf').replace('{date}', formatWeek(selected.weekOf))}</p>
                    <h2 className="mt-1 text-2xl font-bold text-gray-900">{selected?.title}</h2>
                  </div>
                  <button type="button" onClick={lock} className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">{t('weekly.lock')}</button>
                </div>
                {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
                {selected?.bodyHtml && <div className="rich-text mt-5 leading-relaxed text-gray-800">{renderRichText(selected.bodyHtml)}</div>}
                {selected && selected.attachments.length > 0 && (
                  <div className="mt-6 border-t border-gray-100 pt-4">
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">{t('weekly.attachments')}</h3>
                    <ul className="space-y-2">
                      {selected.attachments.map(file => (
                        <li key={file.key}>
                          <a href={api.weeklyFileUrl(file)} target="_blank" rel="noopener"
                            className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm hover:bg-blue-50">
                            <span className="min-w-0 flex-1 truncate font-medium text-blue-700">{file.name}</span>
                            <span className="shrink-0 text-xs text-gray-500">{formatBytes(file.size)}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default WeeklyReportPage;

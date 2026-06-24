import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { produce } from 'immer';
import { useAdmin } from '../hooks/useAdmin';
import { useLocalization } from '../hooks/useLocalization';
import { api } from '../api';
import type { Sermon, SermonCategory } from '../data';
import { buildPaginationNumbers } from '../utils/pagination';

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const buildEmptyEntry = (entryType: Sermon['type'], category: SermonCategory = 'sunday-worship'): Omit<Sermon, 'id'> => ({
  title: { en: '', zh: '' },
  speaker: { en: '', zh: '' },
  date: new Date().toISOString().split('T')[0],
  series: { en: '', zh: '' },
  passage: { en: '', zh: '' },
  youtubeId: '',
  imageUrl: '',
  type: entryType,
  category,
});

const SERMON_CATEGORIES: { key: SermonCategory; labelKey: string }[] = [
  { key: 'sunday-worship', labelKey: 'sermonsPage.navSundayWorship' },
  { key: 'worship-praise', labelKey: 'sermonsPage.navWorshipPraise' },
  { key: 'healing-prayer', labelKey: 'sermonsPage.navHealingPrayer' },
  { key: 'testimony', labelKey: 'sermonsPage.navTestimony' },
  { key: 'live-broadcast', labelKey: 'admin.liveBroadcast' },
];

const SPEAKER_OPTIONS = {
  en: ['Pastor Andy Yu', 'Sister LingLing', 'Pastor Rainbow'],
  zh: ['余大器 牧師', '琳琳师母', 'Rainbow 牧師'],
};

interface SpeakerComboboxProps {
  placeholder: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

const SpeakerCombobox: React.FC<SpeakerComboboxProps> = ({ placeholder, value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  // 用 fixed + portal 渲染 dropdown：避開模態框祖先 overflow-y-auto 的裁剪
  useEffect(() => {
    if (!isOpen) return;
    const updatePos = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({ top: r.bottom, left: r.left, width: r.width });
    };
    updatePos();
    // 捕獲階段監聽 scroll 是為了抓到祖先元素的 scroll 事件（modal body 可能在滾動）
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [isOpen]);

  // 點外面 → 關閉。portal 的選單在 DOM 結構上不是 wrapper 子孫，所以走全域 mousedown 判斷
  useEffect(() => {
    if (!isOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (wrapperRef.current?.contains(target)) return;
      if (target.closest('[data-combobox-panel]')) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [isOpen]);

  return (
    <div ref={wrapperRef} className="relative">
      <div ref={anchorRef} className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setIsOpen(true);
          }}
          className="w-full p-2 pr-10 border rounded"
        />
        <button
          type="button"
          onClick={() => setIsOpen(open => !open)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-600 hover:text-gray-900"
          aria-label={`Show ${placeholder} options`}
        >
          ▾
        </button>
      </div>
      {isOpen && coords && createPortal(
        <div
          data-combobox-panel
          style={{ position: 'fixed', top: coords.top + 4, left: coords.left, width: coords.width, zIndex: 100 }}
          className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
        >
          {options.map(option => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              className="block w-full px-3 py-3 text-left text-sm font-semibold text-gray-900 hover:bg-blue-50"
            >
              {option}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

interface SermonManagerProps {
  entryType?: Sermon['type'];
  // 只在 entryType='sermon' 時生效：限制本頁只顯示/新建指定 category 的條目
  category?: SermonCategory;
}

const SermonManager: React.FC<SermonManagerProps> = ({ entryType = 'sermon', category }) => {
  const { t } = useLocalization();
  const normalizedEntryType = entryType as Sermon['type'];
  const defaultCategory: SermonCategory = category ?? 'sunday-worship';
  const {
    sermons,
    dailyManna,
    createSermon,
    updateSermonRecord,
    deleteSermonRecord,
    createDailyManna,
    updateDailyMannaRecord,
    deleteDailyMannaRecord,
    refreshBootstrap,
  } = useAdmin();
  const [isAdding, setIsAdding] = useState(false);
  const [editingSermonId, setEditingSermonId] = useState<string | null>(null);
  const [sermonData, setSermonData] = useState<Omit<Sermon, 'id'>>(buildEmptyEntry(normalizedEntryType, defaultCategory));
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ inserted: number; updated: number; skipped: number; errors: string[]; pages: number; hasMore: boolean } | null>(null);
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState(1);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ updated: number; batches: number; errors: string[]; hasMore: boolean } | null>(null);
  // ⋮ menu state: 同時只允許一個卡片的菜單打開；submenu='move' 進入移動子菜單
  const [openMenu, setOpenMenu] = useState<{ id: string; submenu: 'root' | 'move' } | null>(null);
  // 預覽彈窗：點擊卡片內容（除 ⋮ 區）→ 用 modal 播放
  const [previewSermon, setPreviewSermon] = useState<Sermon | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 批量操作 state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  // 退出 select mode 時清空已選
  useEffect(() => {
    if (!selectMode) {
      setSelectedIds(new Set());
      setBulkMoveOpen(false);
      setBulkEditOpen(false);
    }
  }, [selectMode]);

  // 點擊菜單外面 → 關閉
  useEffect(() => {
    if (!openMenu) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [openMenu]);

  // Esc 關閉預覽
  useEffect(() => {
    if (!previewSermon) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewSermon(null); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [previewSermon]);

  // Esc 關閉編輯/新增彈窗
  const isFormOpen = isAdding || editingSermonId !== null;
  useEffect(() => {
    if (!isFormOpen) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') resetForm(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFormOpen]);

  const handleBackfillMetadata = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await api.backfillSermonMetadata();
      setBackfillResult(res);
      if (res.updated > 0) {
        try { await refreshBootstrap(); } catch { /* ignore */ }
      }
    } catch (err) {
      setBackfillResult({
        updated: 0, batches: 0, hasMore: false,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    } finally {
      setBackfilling(false);
    }
  };

  const handleSyncYoutube = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.sermonsSyncYoutube(normalizedEntryType);
      setSyncResult(res);
      // 拉一次 bootstrap 把新同步的條目灌進 context，下方列表自動刷新
      if (res.inserted > 0) {
        try { await refreshBootstrap(); } catch { /* ignore */ }
      }
    } catch (err) {
      setSyncResult({
        inserted: 0, updated: 0, skipped: 0, pages: 0, hasMore: false,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    } finally {
      setSyncing(false);
    }
  };

  const isManna = normalizedEntryType === 'daily-manna';
  // 只有主日信息（sunday-worship）的條目顯示/可編輯講員；其它分類都不設講員
  const showSpeakerFields = !isManna && category === 'sunday-worship';

  // 年份篩選：'all' 表示全部，否則為 'YYYY'
  const [yearFilter, setYearFilter] = useState<string>('all');

  // 在切換分類 tab 時把年份重置（避免比如從「敬拜讚美」選了 2024 切到「醫治禱告」還停在 2024 但沒結果）
  useEffect(() => {
    setYearFilter('all');
  }, [normalizedEntryType, category]);

  // 此分類下所有條目（未過濾年份）→ 用於計算可用年份列表
  const categoryEntries = useMemo(() => {
    const entries = isManna ? dailyManna : sermons;
    const filtered = !isManna && category
      ? entries.filter(e => (e.category ?? 'sunday-worship') === category)
      : entries;
    return [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  }, [isManna, dailyManna, sermons, category]);

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    for (const item of categoryEntries) {
      const y = (item.date || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) set.add(y);
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [categoryEntries]);

  const visibleEntries = useMemo(() => {
    if (yearFilter === 'all') return categoryEntries;
    return categoryEntries.filter(e => (e.date || '').slice(0, 4) === yearFilter);
  }, [categoryEntries, yearFilter]);

  // 只在「上下文切換」時 reset 到第 1 頁：分類 tab / pageSize / sermon vs manna / 年份。
  // 不要因為 visibleEntries.length 變化 reset —— move/hide/delete 後條目數變了，
  // 但用戶仍應停在當前頁（safePage 的 Math.min 會處理「最後一頁僅剩條目被移走」的邊界）。
  useEffect(() => {
    setPage(1);
  }, [normalizedEntryType, category, pageSize, yearFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleEntries.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageEntries = visibleEntries.slice((safePage - 1) * pageSize, safePage * pageSize);
  // 分頁：前 5、中間 3、後 5，當前頁 ±1，自動補省略符
  const paginationNumbers = useMemo<(number | 'gap')[]>(
    () => buildPaginationNumbers(totalPages, safePage),
    [totalPages, safePage]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>, lang?: 'en' | 'zh', field?: 'title' | 'speaker' | 'series' | 'passage') => {
    const { name, value } = e.target;
    if (lang && field) {
      setSermonData(produce(draft => {
        draft[field][lang] = value;
      }));
    } else {
      setSermonData(produce(draft => {
        (draft as any)[name] = value;
      }));
    }
  };

  const handleLocalizedChange = (value: string, lang: 'en' | 'zh', field: 'title' | 'speaker' | 'series' | 'passage') => {
    setSermonData(produce(draft => {
      draft[field][lang] = value;
    }));
  };

  const handleSave = async () => {
    try {
      if (isAdding) {
        if (isManna) {
          await createDailyManna({ ...sermonData, type: 'daily-manna' });
        } else {
          await createSermon({ ...sermonData, type: 'sermon' });
        }
      } else if (editingSermonId) {
        if (isManna) {
          await updateDailyMannaRecord(editingSermonId, { ...sermonData, type: 'daily-manna' });
        } else {
          await updateSermonRecord(editingSermonId, { ...sermonData, type: 'sermon' });
        }
      }
      resetForm();
    } catch (error) {
      console.error(error);
      alert(t('admin.saveFailed'));
    }
  };

  const handleEdit = (sermon: Sermon) => {
    setEditingSermonId(sermon.id);
    const { id, ...data } = sermon;
    setSermonData({ ...data, type: normalizedEntryType });
    setIsAdding(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('admin.deleteSermonConfirm'))) {
      return;
    }
    if (isManna) {
      await deleteDailyMannaRecord(id);
    } else {
      await deleteSermonRecord(id);
    }
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingSermonId(null);
    setSermonData(buildEmptyEntry(normalizedEntryType, defaultCategory));
  };

  const handleMoveSermon = async (id: string, to: SermonCategory | 'daily-manna' | 'live-override') => {
    if (to === 'daily-manna' && !window.confirm(t('admin.confirmMoveToManna'))) return;
    if (to === 'live-override' && !window.confirm(t('admin.confirmMoveToLive'))) return;
    try {
      await api.moveSermon(id, to);
      await refreshBootstrap();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleMoveDailyManna = async (id: string, to: SermonCategory) => {
    if (!window.confirm(t('admin.confirmMoveToSermon'))) return;
    try {
      await api.moveDailyManna(id, to);
      await refreshBootstrap();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleVisibility = async (id: string, hidden: boolean) => {
    try {
      if (isManna) {
        await api.setDailyMannaVisibility(id, hidden);
      } else {
        await api.setSermonVisibility(id, hidden);
      }
      await refreshBootstrap();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  // ============================================================================
  // 批量操作 helpers
  // ============================================================================

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllOnPage = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const e of pageEntries) next.add(e.id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // 批量編輯 patch state
  type BulkEditPatch = {
    applyCategory: boolean;
    category: SermonCategory;
    applySpeakerEn: boolean;
    speakerEn: string;
    applySpeakerZh: boolean;
    speakerZh: string;
  };
  const [bulkEdit, setBulkEdit] = useState<BulkEditPatch>({
    applyCategory: false,
    category: 'sunday-worship',
    applySpeakerEn: false,
    speakerEn: '',
    applySpeakerZh: false,
    speakerZh: '',
  });

  const openBulkEdit = () => {
    if (selectedIds.size === 0) { window.alert(t('admin.bulkSelectFirst')); return; }
    setBulkEdit({
      applyCategory: false,
      category: defaultCategory,
      applySpeakerEn: false,
      speakerEn: '',
      applySpeakerZh: false,
      speakerZh: '',
    });
    setBulkEditOpen(true);
  };

  const applyBulkEdit = async () => {
    if (!bulkEdit.applyCategory && !bulkEdit.applySpeakerEn && !bulkEdit.applySpeakerZh) {
      window.alert(t('admin.bulkEditNoChange'));
      return;
    }
    const ids = Array.from(selectedIds);
    setBulkEditOpen(false);
    // 對每個 id 找到本地的完整數據，merge patch，逐條更新
    const sourceList = isManna ? dailyManna : sermons;
    const updates = ids.map(async id => {
      const current = sourceList.find(s => s.id === id);
      if (!current) return;
      const next: Omit<Sermon, 'id'> = {
        title: current.title,
        speaker: {
          en: bulkEdit.applySpeakerEn ? bulkEdit.speakerEn : current.speaker.en,
          zh: bulkEdit.applySpeakerZh ? bulkEdit.speakerZh : current.speaker.zh,
        },
        date: current.date,
        series: current.series,
        passage: current.passage,
        youtubeId: current.youtubeId,
        imageUrl: current.imageUrl,
        type: current.type,
        category: bulkEdit.applyCategory && !isManna ? bulkEdit.category : current.category,
      };
      if (isManna) {
        await updateDailyMannaRecord(id, { ...next, type: 'daily-manna' });
      } else {
        await updateSermonRecord(id, { ...next, type: 'sermon' });
      }
    });
    const results = await Promise.allSettled(updates);
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) window.alert(t('admin.bulkPartialFail').replace('{failed}', String(failed)).replace('{total}', String(ids.length)));
    clearSelection();
    setSelectMode(false);
  };

  const applyBulkMove = async (to: SermonCategory | 'daily-manna' | 'live-override') => {
    if (selectedIds.size === 0) { window.alert(t('admin.bulkSelectFirst')); return; }
    if (!window.confirm(t('admin.bulkConfirmMove').replace('{count}', String(selectedIds.size)))) return;
    setBulkMoveOpen(false);
    const ids = Array.from(selectedIds);
    const ops = ids.map(async id => {
      if (isManna) {
        if (to === 'daily-manna' || to === 'live-override') return; // 不適用於 manna
        await api.moveDailyManna(id, to as SermonCategory);
      } else {
        await api.moveSermon(id, to);
      }
    });
    const results = await Promise.allSettled(ops);
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) window.alert(t('admin.bulkPartialFail').replace('{failed}', String(failed)).replace('{total}', String(ids.length)));
    try { await refreshBootstrap(); } catch { /* ignore */ }
    clearSelection();
    setSelectMode(false);
  };

  const applyBulkHide = async () => {
    if (selectedIds.size === 0) { window.alert(t('admin.bulkSelectFirst')); return; }
    if (!window.confirm(t('admin.bulkConfirmHide').replace('{count}', String(selectedIds.size)))) return;
    const ids = Array.from(selectedIds);
    const ops = ids.map(id => isManna
      ? api.setDailyMannaVisibility(id, true)
      : api.setSermonVisibility(id, true));
    const results = await Promise.allSettled(ops);
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) window.alert(t('admin.bulkPartialFail').replace('{failed}', String(failed)).replace('{total}', String(ids.length)));
    try { await refreshBootstrap(); } catch { /* ignore */ }
    clearSelection();
    setSelectMode(false);
  };

  const applyBulkDelete = async () => {
    if (selectedIds.size === 0) { window.alert(t('admin.bulkSelectFirst')); return; }
    if (!window.confirm(t('admin.bulkConfirmDelete').replace('{count}', String(selectedIds.size)))) return;
    const ids = Array.from(selectedIds);
    const ops = ids.map(id => isManna ? deleteDailyMannaRecord(id) : deleteSermonRecord(id));
    const results = await Promise.allSettled(ops);
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) window.alert(t('admin.bulkPartialFail').replace('{failed}', String(failed)).replace('{total}', String(ids.length)));
    clearSelection();
    setSelectMode(false);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setIsAdding(true)} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-green-700 transition-colors">
          {isManna ? t('admin.addDailyManna') : t('admin.addSundayMessage')}
        </button>
        <button
          type="button"
          onClick={handleSyncYoutube}
          disabled={syncing}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg font-bold shadow hover:bg-blue-700 transition-colors disabled:opacity-60"
        >
          {syncing ? t('admin.syncing') : t('admin.youtubeSync')}
        </button>
        <button
          type="button"
          onClick={handleBackfillMetadata}
          disabled={backfilling}
          className="bg-amber-500 text-white px-5 py-2 rounded-lg font-bold shadow hover:bg-amber-600 transition-colors disabled:opacity-60"
          title={t('admin.backfillMetadataHint')}
        >
          {backfilling ? t('admin.backfilling') : t('admin.backfillMetadata')}
        </button>
        <div className="ml-auto flex items-center gap-2 text-sm text-gray-700">
          <label htmlFor="sermon-page-size">{t('admin.perPageLabel')}</label>
          <select
            id="sermon-page-size"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm font-semibold"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
          <span className="text-gray-500">{t('admin.perPageUnit')}</span>
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="ml-2 rounded-md bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-slate-800"
          >
            {t('admin.bulkActions')}
          </button>
        </div>
      </div>

      {/* 批量操作 action bar：只在 selectMode 開時顯示 */}
      {selectMode && !isAdding && editingSermonId === null && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 shadow-sm">
          <span className="text-sm font-bold text-slate-700">
            {t('admin.bulkSelectedCount').replace('{count}', String(selectedIds.size))}
          </span>
          <button
            type="button"
            onClick={selectAllOnPage}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            {t('admin.bulkSelectPage')}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={selectedIds.size === 0}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            {t('admin.bulkClear')}
          </button>
          <span className="mx-1 text-slate-300">|</span>
          <button
            type="button"
            onClick={openBulkEdit}
            disabled={selectedIds.size === 0}
            className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
          >
            {t('admin.bulkEdit')}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setBulkMoveOpen(o => !o)}
              disabled={selectedIds.size === 0}
              className="rounded bg-indigo-500 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-40"
              aria-haspopup="menu"
              aria-expanded={bulkMoveOpen}
            >
              {t('admin.bulkMove')} ▾
            </button>
            {bulkMoveOpen && selectedIds.size > 0 && (
              <div
                className="absolute left-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-xl"
                onMouseLeave={() => setBulkMoveOpen(false)}
              >
                {isManna ? (
                  SERMON_CATEGORIES.map(c => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => applyBulkMove(c.key)}
                      className="block w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-50"
                    >
                      {t(c.labelKey)}
                    </button>
                  ))
                ) : (
                  <>
                    {SERMON_CATEGORIES.filter(c => c.key !== category).map(c => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => applyBulkMove(c.key)}
                        className="block w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-50"
                      >
                        {t(c.labelKey)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => applyBulkMove('daily-manna')}
                      className="block w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-50"
                    >
                      {t('admin.moveToManna')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={applyBulkHide}
            disabled={selectedIds.size === 0}
            className="rounded bg-gray-500 px-3 py-1 text-xs font-semibold text-white hover:bg-gray-600 disabled:opacity-40"
          >
            {t('admin.bulkHide')}
          </button>
          <button
            type="button"
            onClick={applyBulkDelete}
            disabled={selectedIds.size === 0}
            className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
          >
            {t('admin.bulkDelete')}
          </button>
          <button
            type="button"
            onClick={() => setSelectMode(false)}
            className="ml-auto rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            {t('admin.cancel')}
          </button>
        </div>
      )}

      {syncResult && (
        <div className="mb-3 text-sm text-gray-800">
          <strong>{t('admin.syncInserted')}</strong> {syncResult.inserted}
          {' · '}<strong>{t('admin.syncSkipped')}</strong> {syncResult.skipped}
          {' · '}<strong>{t('admin.syncPages')}</strong> {syncResult.pages}
          {syncResult.hasMore && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {t('admin.syncHasMore')}
            </span>
          )}
          {syncResult.errors.length > 0 && (
            <div className="mt-1 text-xs text-red-700">{syncResult.errors.slice(0, 3).join('； ')}</div>
          )}
        </div>
      )}

      {/* 年份篩選列：'all' + 每個有條目的年份（倒序） */}
      {availableYears.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setYearFilter('all')}
            className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
              yearFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-blue-50'
            }`}
          >
            {t('sermonArchive.filterAllYears')}
          </button>
          {availableYears.map(y => (
            <button
              key={y}
              type="button"
              onClick={() => setYearFilter(y)}
              className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
                yearFilter === y
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-blue-50'
              }`}
            >
              {y}
            </button>
          ))}
          <span className="ml-2 text-xs text-gray-500">
            {visibleEntries.length} {t('admin.perPageUnit')}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {pageEntries.map(sermon => {
          const isHidden = Boolean(sermon.hidden);
          const title = sermon.title.zh || sermon.title.en || t('admin.untitledVideo');
          const entryCategory: SermonCategory = sermon.category ?? 'sunday-worship';
          const categoryLabel = isManna
            ? t('admin.dailyManna')
            : t(SERMON_CATEGORIES.find(item => item.key === entryCategory)?.labelKey ?? 'sermonsPage.navSundayWorship');
          const thumbnail = sermon.imageUrl || (sermon.youtubeId ? `https://img.youtube.com/vi/${sermon.youtubeId}/hqdefault.jpg` : '');
          const duration = formatDuration(sermon.durationSeconds);
          const menuOpen = openMenu?.id === sermon.id;
          const inMoveSubmenu = menuOpen && openMenu?.submenu === 'move';

          const moveTargets = isManna
            ? SERMON_CATEGORIES.map(c => ({ key: c.key as SermonCategory | 'daily-manna' | 'live-override', label: t(c.labelKey), handler: () => handleMoveDailyManna(sermon.id, c.key) }))
            : [
                ...SERMON_CATEGORIES
                  .filter(c => c.key !== entryCategory)
                  .map(c => ({ key: c.key as SermonCategory | 'daily-manna' | 'live-override', label: t(c.labelKey), handler: () => handleMoveSermon(sermon.id, c.key) })),
                { key: 'daily-manna' as const, label: t('admin.moveToManna'), handler: () => handleMoveSermon(sermon.id, 'daily-manna') },
                { key: 'live-override' as const, label: t('admin.moveToLive'), handler: () => handleMoveSermon(sermon.id, 'live-override') },
              ];

          const isSelected = selectedIds.has(sermon.id);
          return (
            <article
              key={sermon.id}
              className={`relative rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md ${
                isHidden
                  ? 'border-dashed border-gray-400 bg-gray-100 opacity-50'
                  : isSelected
                    ? 'border-blue-500 ring-2 ring-blue-300'
                    : 'border-gray-200'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (selectMode) toggleSelect(sermon.id);
                  else setPreviewSermon(sermon);
                }}
                className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                aria-label={`${t('sermonArchive.watch')} ${title}`}
              >
                <div className="relative aspect-video overflow-hidden rounded-t-lg bg-gray-100">
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={title}
                      className={`h-full w-full rounded-t-lg object-cover ${isHidden ? 'grayscale brightness-90' : ''}`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-gray-400">
                      {t('admin.noThumbnail')}
                    </div>
                  )}
                  {duration && (
                    <span className="absolute bottom-1.5 right-1.5 z-10 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white tabular-nums">
                      {duration}
                    </span>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity hover:bg-black/30 hover:opacity-100">
                    <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-gray-900">▶ {t('sermonArchive.watch')}</span>
                  </div>
                </div>
                <div className="space-y-1 p-2.5">
                  <h3 className={`line-clamp-2 text-sm font-bold leading-tight text-gray-900 ${isHidden ? 'line-through' : ''}`}>
                    {title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                    <span>{sermon.date}</span>
                    {showSpeakerFields && (sermon.speaker.zh || sermon.speaker.en) && (
                      <span className="truncate text-teal-700 font-medium">
                        {sermon.speaker.zh || sermon.speaker.en}
                      </span>
                    )}
                  </div>
                </div>
              </button>

              {/* 批量選擇：在 selectMode 時顯示一個大尺寸 checkbox */}
              {selectMode && (
                <label
                  className="absolute left-2 top-2 z-20 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-2 border-white bg-white/95 shadow"
                  onClick={(e) => { e.stopPropagation(); toggleSelect(sermon.id); }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => { /* handled by label onClick */ }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 cursor-pointer accent-blue-600"
                    aria-label={t('admin.bulkSelectThis')}
                  />
                </label>
              )}

              {/* 分類 + hidden badge (absolute；不阻擋預覽點擊也沒關係) */}
              <div className={`absolute ${selectMode ? 'left-10' : 'left-2'} top-2 flex flex-wrap gap-1.5 pointer-events-none`}>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isManna ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                  {categoryLabel}
                </span>
                {isHidden && (
                  <span className="rounded-full bg-gray-900/80 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    {t('admin.hiddenBadge')}
                  </span>
                )}
              </div>

              {/* ⋮ 菜單（state-controlled，含 Move 子菜單） */}
              <div className="absolute right-2 top-2" onMouseDown={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenu(menuOpen ? null : { id: sermon.id, submenu: 'root' });
                  }}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/95 text-xl font-bold leading-none text-gray-800 shadow ring-1 ring-black/10 hover:bg-white"
                  aria-label={t('admin.actions')}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  ⋮
                </button>
                {menuOpen && (
                  <div
                    ref={menuRef}
                    role="menu"
                    className="absolute right-0 top-10 z-30 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!inMoveSubmenu ? (
                      <>
                        <button
                          type="button"
                          onClick={() => { setOpenMenu(null); handleEdit(sermon); }}
                          className="block w-full px-3 py-2 text-left font-semibold text-gray-800 hover:bg-gray-50"
                        >
                          {t('admin.edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenMenu({ id: sermon.id, submenu: 'move' })}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-gray-800 hover:bg-gray-50"
                          aria-haspopup="menu"
                        >
                          <span>{t('admin.move')}</span>
                          <span className="text-gray-400">▸</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setOpenMenu(null); handleToggleVisibility(sermon.id, !isHidden); }}
                          className="block w-full border-t border-gray-100 px-3 py-2 text-left text-gray-700 hover:bg-gray-50"
                        >
                          {isHidden ? t('admin.show') : t('admin.hide')}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setOpenMenu(null); handleDelete(sermon.id); }}
                          className="block w-full px-3 py-2 text-left font-semibold text-red-600 hover:bg-red-50"
                        >
                          {t('admin.delete')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setOpenMenu({ id: sermon.id, submenu: 'root' })}
                          className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 hover:bg-gray-50"
                        >
                          <span>◂</span>
                          <span>{t('admin.move')}</span>
                        </button>
                        {moveTargets.map(target => (
                          <button
                            key={target.key}
                            type="button"
                            onClick={() => { setOpenMenu(null); target.handler(); }}
                            className="block w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-50"
                          >
                            {target.label}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {totalPages > 1 && (
        <nav className="mt-6 flex flex-wrap items-center justify-center gap-1.5" aria-label="pagination">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, safePage - 1))}
            disabled={safePage <= 1}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ‹ {t('admin.prev')}
          </button>
          {paginationNumbers.map((n, idx) => n === 'gap' ? (
            <span key={`gap-${idx}`} className="px-2 text-gray-400">…</span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              aria-current={n === safePage ? 'page' : undefined}
              className={`min-w-[2.25rem] rounded-md px-2 py-1.5 text-sm font-semibold ${
                n === safePage
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage(Math.min(totalPages, safePage + 1))}
            disabled={safePage >= totalPages}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('admin.next')} ›
          </button>
          <span className="ml-3 text-xs text-gray-500">
            {t('admin.pageInfo').replace('{page}', String(safePage)).replace('{total}', String(totalPages)).replace('{count}', String(visibleEntries.length))}
          </span>
        </nav>
      )}

      {/* 新增 / 編輯 彈窗（替代之前頂部 inline 表單） */}
      {isFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h3 className="text-lg font-bold text-gray-900">
                {isAdding
                  ? (isManna ? t('admin.addDailyManna') : t('admin.addSundayMessage'))
                  : t('admin.edit')}
              </h3>
              <button
                type="button"
                onClick={resetForm}
                aria-label={t('admin.cancel')}
                className="flex h-8 w-8 items-center justify-center rounded-full text-xl font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 max-h-[70vh] overflow-y-auto">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-700">{t('admin.titleEn')}</span>
                <input
                  type="text"
                  placeholder={t('admin.titleEn')}
                  value={sermonData.title.en}
                  onChange={(e) => handleInputChange(e, 'en', 'title')}
                  className="p-2 border rounded"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-700">{t('admin.titleZh')}</span>
                <input
                  type="text"
                  placeholder={t('admin.titleZh')}
                  value={sermonData.title.zh}
                  onChange={(e) => handleInputChange(e, 'zh', 'title')}
                  className="p-2 border rounded"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-700">{t('admin.fieldDate')}</span>
                <input
                  type="date"
                  name="date"
                  value={sermonData.date}
                  onChange={handleInputChange}
                  className="p-2 border rounded"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-700">{t('admin.youtubeId')}</span>
                <input
                  type="text"
                  name="youtubeId"
                  placeholder="e.g. kYm9S2v7Y7U"
                  value={sermonData.youtubeId}
                  onChange={handleInputChange}
                  className="p-2 border rounded"
                />
              </label>
              {!isManna && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-700">{t('admin.fieldCategory')}</span>
                  <select
                    name="category"
                    value={sermonData.category ?? 'sunday-worship'}
                    onChange={handleInputChange}
                    className="p-2 border rounded bg-white"
                  >
                    {SERMON_CATEGORIES.map(cat => (
                      <option key={cat.key} value={cat.key}>{t(cat.labelKey)}</option>
                    ))}
                  </select>
                </label>
              )}
              {/* 講員只在主日信息（sunday-worship）顯示；其它分類不設講員 */}
              {!isManna && (sermonData.category ?? 'sunday-worship') === 'sunday-worship' && (
                <>
                  <div className="hidden md:block" />
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-gray-700">{t('admin.speakerEn')}</span>
                    <SpeakerCombobox
                      placeholder={t('admin.speakerEn')}
                      value={sermonData.speaker.en}
                      options={SPEAKER_OPTIONS.en}
                      onChange={(value) => handleLocalizedChange(value, 'en', 'speaker')}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-gray-700">{t('admin.speakerZh')}</span>
                    <SpeakerCombobox
                      placeholder={t('admin.speakerZh')}
                      value={sermonData.speaker.zh}
                      options={SPEAKER_OPTIONS.zh}
                      onChange={(value) => handleLocalizedChange(value, 'zh', 'speaker')}
                    />
                  </label>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
              <button
                type="button"
                onClick={resetForm}
                className="rounded border border-gray-300 bg-white px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {t('admin.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-blue-700"
              >
                {t('admin.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量編輯彈窗 */}
      {bulkEditOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setBulkEditOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-200 px-5 py-3">
              <h3 className="text-lg font-bold text-gray-900">{t('admin.bulkEdit')}</h3>
              <p className="text-xs text-gray-500">
                {t('admin.bulkSelectedCount').replace('{count}', String(selectedIds.size))} · {t('admin.bulkEditHint')}
              </p>
            </div>
            <div className="space-y-4 px-5 py-4 text-sm">
              {!isManna && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={bulkEdit.applyCategory}
                      onChange={(e) => setBulkEdit(p => ({ ...p, applyCategory: e.target.checked }))}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <span className="font-semibold text-gray-700 w-24">{t('admin.bulkFieldCategory')}</span>
                  </label>
                  <select
                    disabled={!bulkEdit.applyCategory}
                    value={bulkEdit.category}
                    onChange={(e) => setBulkEdit(p => ({ ...p, category: e.target.value as SermonCategory }))}
                    className="flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    {SERMON_CATEGORIES.map(c => (
                      <option key={c.key} value={c.key}>{t(c.labelKey)}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* 講員只在主日信息（sunday-worship）section 顯示；其它分類不允許批量改講員 */}
              {showSpeakerFields && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={bulkEdit.applySpeakerEn}
                    onChange={(e) => setBulkEdit(p => ({ ...p, applySpeakerEn: e.target.checked }))}
                    className="h-4 w-4 accent-blue-600"
                  />
                  <span className="font-semibold text-gray-700 w-24">{t('admin.bulkFieldSpeakerEn')}</span>
                </label>
                <input
                  type="text"
                  disabled={!bulkEdit.applySpeakerEn}
                  value={bulkEdit.speakerEn}
                  onChange={(e) => setBulkEdit(p => ({ ...p, speakerEn: e.target.value }))}
                  placeholder="e.g. Pastor Andy Yu"
                  className="flex-1 rounded border border-gray-300 px-2 py-1.5 disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
              )}
              {showSpeakerFields && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={bulkEdit.applySpeakerZh}
                    onChange={(e) => setBulkEdit(p => ({ ...p, applySpeakerZh: e.target.checked }))}
                    className="h-4 w-4 accent-blue-600"
                  />
                  <span className="font-semibold text-gray-700 w-24">{t('admin.bulkFieldSpeakerZh')}</span>
                </label>
                <input
                  type="text"
                  disabled={!bulkEdit.applySpeakerZh}
                  value={bulkEdit.speakerZh}
                  onChange={(e) => setBulkEdit(p => ({ ...p, speakerZh: e.target.value }))}
                  placeholder="例：余大器 牧師"
                  className="flex-1 rounded border border-gray-300 px-2 py-1.5 disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
              <button
                type="button"
                onClick={() => setBulkEditOpen(false)}
                className="rounded border border-gray-300 bg-white px-4 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {t('admin.cancel')}
              </button>
              <button
                type="button"
                onClick={applyBulkEdit}
                className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {t('admin.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 預覽彈窗：點擊卡片 → 在 modal 中播放 */}
      {previewSermon && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewSermon(null)}
        >
          <div
            className="relative w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewSermon(null)}
              className="absolute -top-10 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-white text-xl font-bold text-gray-800 shadow hover:bg-gray-100"
              aria-label={t('admin.exit')}
            >
              ✕
            </button>
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black shadow-2xl">
              {previewSermon.youtubeId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${previewSermon.youtubeId}?autoplay=1&rel=0`}
                  title={previewSermon.title.zh || previewSermon.title.en}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-white">
                  {t('admin.noThumbnail')}
                </div>
              )}
            </div>
            <div className="mt-3 text-white">
              <h3 className="text-lg font-bold">{previewSermon.title.zh || previewSermon.title.en}</h3>
              <p className="text-sm text-white/70">{previewSermon.date}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SermonManager;

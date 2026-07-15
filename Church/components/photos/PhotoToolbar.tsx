import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowUpDown, CheckSquare, ChevronDown, Download, Expand, Film, FolderInput,
  Grid2X2, Heart, Image as ImageIcon, LayoutDashboard, LayoutTemplate,
  MoreVertical, Shrink, Trash2, Waves, X,
} from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import type { GridDisplayMode, SlideshowMode, SortDir, SortField, ViewMode } from './types';

const GridModeIcon: React.FC<{ mode: GridDisplayMode; size?: number; className?: string }> = ({ mode, size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
    {mode === 'fill'
      ? [1.5, 6.25, 11].flatMap((x) => [1.5, 6.25, 11].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="3.5" height="3.5" rx="0.9" fill="currentColor" />))
      : [0.75, 5.5, 10.25].flatMap((x) => [0.75, 5.5, 10.25].map((y) => <rect key={`f-${x}-${y}`} x={x} y={y} width="5" height="5" rx="1.1" stroke="currentColor" strokeWidth="1" opacity="0.45" />))}
  </svg>
);

export const SLIDESHOW_MODES: { id: SlideshowMode; label: string; Icon: typeof Film }[] = [
  { id: 'cascade', label: 'Cascade', Icon: Film },
  { id: 'tiles-shifting', label: 'Tiles Shifting', Icon: Grid2X2 },
  { id: 'sliding-tiles', label: 'Sliding Tiles', Icon: Grid2X2 },
  { id: 'wings', label: 'Cinema Wings', Icon: LayoutTemplate },
  { id: 'flow-drift', label: 'Flow Drift', Icon: Waves },
];

export interface PhotoToolbarProps {
  collections: string[];
  selectedCollection: string;
  onSetCollection: (c: string) => void;
  albums: string[];
  filter: string;
  onSetFilter: (f: string) => void;
  albumCount: number;
  viewMode: ViewMode;
  onSetViewMode: (m: ViewMode) => void;
  gridDisplayMode: GridDisplayMode;
  onSetGridDisplayMode: (m: GridDisplayMode) => void;
  columns: number;
  onSetColumns: (n: number) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSetSortField: (f: SortField) => void;
  onSetSortDir: (d: SortDir) => void;
  isSelectMode: boolean;
  selectedCount: number;
  totalSelectable: number;
  onToggleSelectMode: () => void;
  onSelectAll: () => void;
  isDeleteMode: boolean;
  onToggleDeleteMode: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onExportOrDownload: () => void;
  onBulkDelete: () => void;
  onMoveSelected: () => void;
}

const iconBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-md transition-all';

interface ChipRenderOpts { onClick: () => void; hidden?: boolean; key: string }

interface OverflowChipBarProps {
  items: string[];
  renderChip: (item: string, opts: ChipRenderOpts) => React.ReactNode;
  onSelect: (item: string) => void;
  label: string;
  trailing?: React.ReactNode;
}

/**
 * 單行 chip 栏 + 溢出浮層（桌面/移動統一）：
 * 用 ref 逐個測量 chip 右緣是否超出容器,得出可見數量,其餘隱藏;
 * 僅在有隱藏項時於末尾顯示無竖線圓框 ▼ 按鈕(展開翻轉 ▲ 並高亮);
 * 點擊彈絕對定位浮層蓋在下方網格上(網格不移動),以多行展示隱藏 chips;
 * 點浮層內任一 chip(選中即收)、再點箭頭、Esc、點外部皆收起。
 */
const OverflowChipBar: React.FC<OverflowChipBarProps> = ({ items, renderChip, onSelect, label, trailing }) => {
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(999);
  const measureRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      const base = el.getBoundingClientRect().left;
      const kids = Array.from(el.children) as HTMLElement[];
      let count = kids.length;
      for (let i = 0; i < kids.length; i++) {
        if (kids[i].getBoundingClientRect().right - base > w + 1) { count = i; break; }
      }
      setVisibleCount(Math.max(1, count));
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [items.join('|')]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current && !popRef.current.contains(target) && !(btnRef.current && btnRef.current.contains(target))) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const hasOverflow = visibleCount < items.length;

  return (
    <div className="relative flex min-w-0 flex-1 items-center gap-1.5">
      <div ref={measureRef} className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden" style={{ flexWrap: 'nowrap' }}>
        {items.map((it, i) => renderChip(it, { onClick: () => onSelect(it), hidden: i >= visibleCount, key: it }))}
      </div>
      {hasOverflow && (
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title={label}
          className={`inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border transition-all ${open ? 'border-rose-500 bg-rose-500 text-white shadow-md' : 'border-gray-200 bg-white text-gray-500 hover:border-rose-300 hover:text-rose-500'}`}
        >
          <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
      {trailing}
      {open && (
        <div ref={popRef} className="absolute left-0 right-0 top-full z-50 mt-1 flex flex-wrap gap-1.5 rounded-xl border border-gray-100 bg-white p-2.5 shadow-xl">
          {items.slice(visibleCount).map((it) => renderChip(it, { onClick: () => { onSelect(it); setOpen(false); }, hidden: false, key: `pop-${it}` }))}
        </div>
      )}
    </div>
  );
};

export const PhotoToolbar: React.FC<PhotoToolbarProps> = (props) => {
  const { t } = useLocalization();
  const isCompact = useBreakpoint();
  const [sortOpen, setSortOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  const collectionFilters = ['All', ...props.collections];
  const albumFilters = ['All', 'Favorites', ...props.albums];
  const hasSelection = props.isSelectMode && props.selectedCount > 0;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    document.body.style.overflow = moreOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [moreOpen]);

  // chip 渲染工廠（供 OverflowChipBar 的行內與浮層共用）。hidden 時保留佈局供測量、視覺隱藏、不可 focus。
  const collectionChip = (compact: boolean) => (c: string, o: ChipRenderOpts) => (
    <button
      type="button"
      key={o.key}
      onClick={o.onClick}
      style={o.hidden ? { visibility: 'hidden' } : undefined}
      aria-hidden={o.hidden}
      tabIndex={o.hidden ? -1 : undefined}
      className={`flex-shrink-0 rounded-md px-2.5 py-1 ${compact ? 'text-[11px]' : 'text-xs'} font-bold uppercase tracking-wide whitespace-nowrap transition-all ${props.selectedCollection === c ? 'bg-rose-500 text-white shadow-md' : 'border border-gray-200 bg-white text-gray-500 hover:border-rose-200'}`}
    >
      {c === 'All' ? t('photosPage.all') : c}
    </button>
  );

  const albumChip = (compact: boolean) => (a: string, o: ChipRenderOpts) => a === 'Favorites' ? (
    <button
      type="button"
      key={o.key}
      onClick={o.onClick}
      style={o.hidden ? { visibility: 'hidden' } : undefined}
      aria-hidden={o.hidden}
      tabIndex={o.hidden ? -1 : undefined}
      title={t('photosPage.favorite')}
      className={`flex flex-shrink-0 items-center justify-center rounded-md ${compact ? 'px-2' : 'px-2.5'} py-1 transition-all ${props.filter === 'Favorites' ? 'bg-rose-500 text-white shadow-md' : 'border border-rose-200 bg-rose-50 text-rose-400 hover:bg-rose-100'}`}
    >
      <Heart size={compact ? 13 : 14} className={props.filter === 'Favorites' ? 'fill-current' : ''} />
    </button>
  ) : (
    <button
      type="button"
      key={o.key}
      onClick={o.onClick}
      style={o.hidden ? { visibility: 'hidden' } : undefined}
      aria-hidden={o.hidden}
      tabIndex={o.hidden ? -1 : undefined}
      className={`flex-shrink-0 rounded-md ${compact ? 'px-2.5 text-[11px]' : 'px-3 text-xs'} py-1 font-bold uppercase tracking-wide whitespace-nowrap transition-all ${props.filter === a ? 'bg-rose-500 text-white shadow-md' : 'border border-gray-200 bg-white text-gray-500 hover:border-rose-200'}`}
    >
      {a === 'All' ? t('photosPage.all') : a}
    </button>
  );

  const countBadge = (
    <div className="flex-shrink-0 rounded-md border border-rose-100 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-600 shadow-sm">
      {props.albumCount}
    </div>
  );

  const sortMenu = (
    <div ref={sortRef} className="relative">
      <button type="button" onClick={() => setSortOpen((o) => !o)} title="Sort" className={`${iconBtn} border ${sortOpen ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100'}`}><ArrowUpDown size={18} /></button>
      {sortOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-gray-100 bg-white py-1.5 shadow-xl">
          <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Sort By</div>
          {([['shotAt', 'Shot Date'], ['uploadedAt', 'Upload Date'], ['sizeBytes', 'File Size'], ['title', 'Title']] as [SortField, string][]).map(([f, label]) => (
            <button key={f} type="button" onClick={() => props.onSetSortField(f)} className="flex w-full items-center px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50">
              <span className="w-5 text-xs font-bold text-indigo-500">{props.sortField === f ? '*' : ''}</span>{label}
            </button>
          ))}
          <div className="my-1 border-t border-gray-100" />
          {([['desc', 'Descending'], ['asc', 'Ascending']] as [SortDir, string][]).map(([d, label]) => (
            <button key={d} type="button" onClick={() => props.onSetSortDir(d)} className="flex w-full items-center px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50">
              <span className="w-5 text-xs font-bold text-indigo-500">{props.sortDir === d ? '*' : ''}</span>{label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // Desktop toolbar
  const desktop = (
    <>
      <div className="flex min-h-[48px] flex-wrap items-center gap-3 px-4 py-1.5">
        <div className="flex flex-shrink-0 items-center gap-2">
          <ImageIcon size={20} className="text-rose-500" />
          <h1 className="text-lg font-extrabold text-gray-800">{t('photosPage.title')}</h1>
        </div>
        <OverflowChipBar
          items={collectionFilters}
          renderChip={collectionChip(false)}
          onSelect={props.onSetCollection}
          label="Years"
        />
        <div className="ml-auto flex flex-shrink-0 flex-wrap items-center justify-end gap-1">
          <div className="flex items-center rounded-md bg-gray-100 p-0.5">
            <button type="button" onClick={() => props.onSetColumns(Math.max(1, props.columns - 1))} className={`${iconBtn} font-bold text-gray-500 hover:bg-white hover:text-rose-500 hover:shadow-sm`} title="Zoom In">+</button>
            <button type="button" onClick={() => props.onSetColumns(Math.min(40, props.columns + 1))} className={`${iconBtn} font-bold text-gray-500 hover:bg-white hover:text-rose-500 hover:shadow-sm`} title="Zoom Out">-</button>
          </div>
          <div className="flex items-center rounded-md bg-gray-100 p-0.5">
            <button type="button" onClick={() => props.viewMode === 'square' ? props.onSetGridDisplayMode(props.gridDisplayMode === 'fill' ? 'ratio' : 'fill') : props.onSetViewMode('square')} className={`${iconBtn} ${props.viewMode === 'square' ? 'bg-white text-rose-500 shadow-sm' : 'text-gray-400'}`} title="Grid"><GridModeIcon mode={props.viewMode === 'square' ? props.gridDisplayMode : 'fill'} /></button>
            <button type="button" onClick={() => props.onSetViewMode('masonry')} className={`${iconBtn} ${props.viewMode === 'masonry' ? 'bg-white text-rose-500 shadow-sm' : 'text-gray-400'}`} title="Masonry"><LayoutDashboard size={16} /></button>
          </div>
          {sortMenu}
          <button type="button" onClick={props.onExportOrDownload} className={`${iconBtn} border ${hasSelection ? 'border-green-500 bg-green-500 text-white' : 'border-gray-200 bg-white text-gray-500 hover:text-rose-500'}`} title={hasSelection ? 'Download selected' : 'Export'}><Download size={18} /></button>
          <button type="button" onClick={hasSelection ? props.onBulkDelete : props.onToggleDeleteMode} className={`${iconBtn} border ${hasSelection || props.isDeleteMode ? 'border-red-500 bg-red-500 text-white' : 'border-gray-200 bg-white text-gray-500 hover:text-red-500'}`} title={hasSelection ? 'Delete selected' : 'Delete mode'}><Trash2 size={18} /></button>
          {hasSelection && <button type="button" onClick={props.onMoveSelected} className={`${iconBtn} border border-orange-500 bg-orange-500 text-white`} title="Move selected"><FolderInput size={18} /></button>}
          <button type="button" onClick={() => props.isSelectMode && props.selectedCount < props.totalSelectable ? props.onSelectAll() : props.onToggleSelectMode()} className={`${iconBtn} border ${props.isSelectMode ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-gray-200 bg-white text-gray-500 hover:text-indigo-500'}`} title="Select"><CheckSquare size={18} /></button>
          <button type="button" onClick={props.onToggleFullscreen} className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gray-800 text-white shadow-sm hover:bg-black" title="Fullscreen">{props.isFullscreen ? <Shrink size={16} /> : <Expand size={16} />}</button>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-gray-100 px-4 py-1.5">
        <OverflowChipBar
          items={albumFilters}
          renderChip={albumChip(false)}
          onSelect={props.onSetFilter}
          label={t('photosPage.albums')}
          trailing={countBadge}
        />
      </div>
    </>
  );

  // Compact toolbar (mobile / tablet)
  const compact = (
    <>
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <ImageIcon size={17} className="text-rose-500" />
          <h1 className="text-sm font-bold text-gray-800">{t('photosPage.title')}</h1>
        </div>
        <OverflowChipBar
          items={collectionFilters}
          renderChip={collectionChip(true)}
          onSelect={props.onSetCollection}
          label="Years"
        />
        <div className="ml-auto flex flex-shrink-0 items-center gap-0.5">
          {props.isDeleteMode && <span className="mr-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-500">DEL</span>}
          {props.isSelectMode && <span className="mr-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-500">{props.selectedCount > 0 ? `${props.selectedCount} selected` : 'SEL'}</span>}
          <button type="button" onClick={() => props.onSetColumns(Math.max(1, props.columns - 1))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-base font-bold leading-none text-gray-600 shadow-sm hover:bg-rose-50 hover:text-rose-500" title="Zoom In">+</button>
          <button type="button" onClick={() => props.onSetColumns(Math.min(40, props.columns + 1))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-base font-bold leading-none text-gray-600 shadow-sm hover:bg-rose-50 hover:text-rose-500" title="Zoom Out">-</button>
          <button type="button" onClick={() => setMoreOpen(true)} className={`rounded-lg p-2 ${moreOpen ? 'bg-rose-50 text-rose-500' : 'text-gray-600 hover:bg-gray-100'}`} title="More"><MoreVertical size={18} /></button>
        </div>
      </div>
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-1.5">
        <OverflowChipBar
          items={albumFilters}
          renderChip={albumChip(true)}
          onSelect={props.onSetFilter}
          label={t('photosPage.albums')}
          trailing={countBadge}
        />
      </div>
    </>
  );

  const sheetRow = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-gray-700 transition-colors hover:bg-gray-50';

  return (
    <>
      <section className="sticky top-[var(--site-header-height,80px)] z-30 border-b border-gray-200 bg-white/85 shadow-sm backdrop-blur-md">
        {isCompact ? compact : desktop}
      </section>

      {/* More bottom sheet (compact) */}
      {moreOpen && isCompact && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[201] flex max-h-[80vh] flex-col rounded-t-2xl bg-white shadow-2xl">
            <div className="flex justify-center pt-3"><div className="h-1 w-10 rounded-full bg-gray-200" /></div>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
              <span className="text-sm font-bold text-gray-800">{t('photosPage.photosOptions')}</span>
              <button type="button" onClick={() => setMoreOpen(false)} className="rounded-lg p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 pb-8">
              <div className="mb-1 border-t border-gray-100 pt-3 text-[10px] font-bold uppercase tracking-wide text-gray-400">View</div>
              <button type="button" onClick={() => { props.viewMode === 'square' ? props.onSetGridDisplayMode(props.gridDisplayMode === 'fill' ? 'ratio' : 'fill') : props.onSetViewMode('square'); setMoreOpen(false); }} className={sheetRow}><GridModeIcon mode={props.viewMode === 'square' ? (props.gridDisplayMode === 'fill' ? 'ratio' : 'fill') : 'fill'} size={18} className="text-rose-500" /><span>{props.viewMode === 'square' ? `Grid: ${props.gridDisplayMode === 'fill' ? 'Ratio' : 'Fill'}` : 'Square Grid'}</span></button>
              <button type="button" onClick={() => { props.onSetViewMode('masonry'); setMoreOpen(false); }} className={sheetRow}><LayoutDashboard size={18} className="text-rose-500" /><span>Masonry</span></button>

              <div className="mb-1 border-t border-gray-100 pt-3 text-[10px] font-bold uppercase tracking-wide text-gray-400">Sort</div>
              {([['shotAt', 'Shot Date'], ['uploadedAt', 'Upload Date'], ['sizeBytes', 'File Size'], ['title', 'Title']] as [SortField, string][]).map(([f, label]) => (
                <button key={f} type="button" onClick={() => props.onSetSortField(f)} className={sheetRow}><span className="w-4 text-xs font-bold text-indigo-500">{props.sortField === f ? '*' : ''}</span><span>{label}</span></button>
              ))}
              <button type="button" onClick={() => props.onSetSortDir(props.sortDir === 'desc' ? 'asc' : 'desc')} className={sheetRow}><ArrowUpDown size={18} className="text-indigo-500" /><span>{props.sortDir === 'desc' ? 'Descending' : 'Ascending'}</span></button>

              <div className="mb-1 border-t border-gray-100 pt-3 text-[10px] font-bold uppercase tracking-wide text-gray-400">Actions</div>
              <button type="button" onClick={() => { props.onExportOrDownload(); setMoreOpen(false); }} className={sheetRow}><Download size={18} className="text-green-500" /><span>{hasSelection ? 'Download Selected' : 'Export'}</span></button>
              {hasSelection && <button type="button" onClick={() => { props.onMoveSelected(); setMoreOpen(false); }} className={sheetRow}><FolderInput size={18} className="text-orange-500" /><span>{t('photosPage.moveSelected')}</span></button>}
              <button type="button" onClick={() => { props.onToggleDeleteMode(); setMoreOpen(false); }} className={sheetRow}><Trash2 size={18} className="text-red-500" /><span>{props.isDeleteMode ? 'Exit Delete Mode' : 'Delete Mode'}</span></button>
              <button type="button" onClick={() => { props.isSelectMode ? props.onToggleSelectMode() : props.onToggleSelectMode(); setMoreOpen(false); }} className={sheetRow}><CheckSquare size={18} className="text-indigo-500" /><span>{props.isSelectMode ? 'Exit Select Mode' : 'Select Mode'}</span></button>

              <div className="mb-1 border-t border-gray-100 pt-3 text-[10px] font-bold uppercase tracking-wide text-gray-400">Display</div>
              <button type="button" onClick={() => { props.onToggleFullscreen(); setMoreOpen(false); }} className={sheetRow}><Expand size={18} className="text-gray-600" /><span>{props.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span></button>
            </div>
          </div>
        </>
      )}

    </>
  );
};

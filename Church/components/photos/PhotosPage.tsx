import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, FolderInput, Loader2, RefreshCw, Trash2, X } from 'lucide-react';
import { api } from '../../api';
import type { ChurchPhoto } from '../../data';
import { useLocalization } from '../../hooks/useLocalization';
import { PhotoToolbar } from './PhotoToolbar';
import { PhotoGrid } from './PhotoGrid';
import { UploadModal } from './UploadModal';
import { MovePhotosModal } from './MovePhotosModal';
import { Lightbox } from './Lightbox';
import { ContextMenu, type ContextMenuState } from './ContextMenu';
import { SlideshowOverlay } from './slideshows/SlideshowOverlay';
import type { GridDisplayMode, SlideshowMode, SortDir, SortField, ViewMode } from './types';
import { churchConfirm } from '../ChurchDialog';
import { buildPaginationNumbers } from '../../utils/pagination';
import { useAdmin } from '../../hooks/useAdmin';

const FAVORITES_KEY = 'bolccop-photo-favorites';
const UPLOADER_KEY = 'bolccop-photo-uploader-id';
const YEAR_PATTERN = /^\d{4}$/;
const defaultPhotoColumns = () => {
  if (typeof window === 'undefined') return 6;
  return window.matchMedia?.('(max-width: 767px)').matches ? 4 : 6;
};

const createBrowserId = (): string => {
  const cryptoApi = globalThis.crypto;
  const randomUUID = cryptoApi?.randomUUID;
  if (typeof randomUUID === 'function') return randomUUID.call(cryptoApi).replace(/-/g, '');
  const randomPart = Math.random().toString(36).slice(2);
  const timePart = Date.now().toString(36);
  return `${timePart}${randomPart}`;
};

const getUploaderId = (): string => {
  const next = createBrowserId();
  try {
    const existing = localStorage.getItem(UPLOADER_KEY);
    if (existing) return existing;
    localStorage.setItem(UPLOADER_KEY, next);
  } catch {
    return next;
  }
  return next;
};

const normalizeLabel = (v: string) => v.trim() || 'General';
const uniqueLabels = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.reduce<string[]>((labels, value) => {
    const label = normalizeLabel(value);
    const key = label.toLowerCase();
    if (!seen.has(key)) { seen.add(key); labels.push(label); }
    return labels;
  }, []);
};
const fileBaseName = (url: string) => decodeURIComponent(url.split('/').pop() || 'photo.jpg').replace(/\?.*$/, '');

const PhotosPage: React.FC = () => {
  const { t } = useLocalization();
  const { currentUser } = useAdmin();
  const [uploaderId] = useState(getUploaderId);

  const [photos, setPhotos] = useState<ChurchPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [selectedCollection, setSelectedCollection] = useState('All');
  const [selectedAlbum, setSelectedAlbum] = useState('All');
  const [viewMode, setViewMode] = useState<ViewMode>('square');
  const [gridDisplayMode, setGridDisplayMode] = useState<GridDisplayMode>('fill');
  const [columns, setColumns] = useState(defaultPhotoColumns);
  const [sortField, setSortField] = useState<SortField>('uploadedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [slideshowMode, setSlideshowMode] = useState<SlideshowMode | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [page, setPage] = useState(1);

  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')); } catch { return new Set(); }
  });
  const [uploadSettings, setUploadSettings] = useState<{ maxLongEdge: number; jpegQuality: number; defaultYear: string; defaultAlbum: string; pageSize: number }>({ maxLongEdge: 1600, jpegQuality: 0.82, defaultYear: '', defaultAlbum: '', pageSize: 100 });

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.photos();
      setPhotos(res.photos);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPhotos(); }, [loadPhotos]);
  useEffect(() => {
    api.photoSettings().then(setUploadSettings).catch(() => undefined);
  }, []);
  useEffect(() => {
    const open = () => setUploadOpen(true);
    window.addEventListener('bolccop:open-photo-upload', open);
    return () => window.removeEventListener('bolccop:open-photo-upload', open);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
    } catch {
      /* ignore unavailable storage */
    }
  }, [favorites]);

  // ── Derived filters ──────────────────────────────────────────────────────
  const collections = useMemo(
    () => uniqueLabels(photos.map((p) => p.collection)).filter((l) => YEAR_PATTERN.test(l)).sort((a, b) => Number(b) - Number(a)),
    [photos],
  );
  const collectionPhotos = useMemo(() => {
    if (selectedCollection === 'All') return photos;
    return photos.filter((p) => normalizeLabel(p.collection).toLowerCase() === selectedCollection.toLowerCase());
  }, [photos, selectedCollection]);
  const albums = useMemo(() => uniqueLabels(collectionPhotos.map((p) => p.album)).filter(Boolean), [collectionPhotos]);

  const filteredPhotos = useMemo(() => {
    const base = selectedAlbum === 'Favorites'
      ? collectionPhotos.filter((p) => favorites.has(p.id))
      : selectedAlbum === 'All'
        ? collectionPhotos
        : collectionPhotos.filter((p) => normalizeLabel(p.album).toLowerCase() === selectedAlbum.toLowerCase());

    return [...base].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortField === 'sizeBytes') { av = a.sizeBytes ?? 0; bv = b.sizeBytes ?? 0; }
      else if (sortField === 'title') { av = a.title || fileBaseName(a.src); bv = b.title || fileBaseName(b.src); }
      else if (sortField === 'shotAt') { av = a.shotAt ? Date.parse(a.shotAt) || 0 : 0; bv = b.shotAt ? Date.parse(b.shotAt) || 0 : 0; }
      else { av = a.createdAt; bv = b.createdAt; }
      const result = typeof av === 'string' || typeof bv === 'string' ? String(av).localeCompare(String(bv)) : Number(av) - Number(bv);
      return sortDir === 'asc' ? result : -result;
    });
  }, [collectionPhotos, favorites, selectedAlbum, sortField, sortDir]);

  const pageSize = uploadSettings.pageSize || 100;
  const totalPages = Math.max(1, Math.ceil(filteredPhotos.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginationNumbers = useMemo(() => buildPaginationNumbers(totalPages, safePage), [totalPages, safePage]);
  const visiblePhotos = useMemo(
    () => filteredPhotos.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredPhotos, pageSize, safePage],
  );

  useEffect(() => { setPage(1); }, [selectedCollection, selectedAlbum, sortField, sortDir, pageSize]);

  const selectedPhotos = useMemo(() => filteredPhotos.filter((p) => selectedIds.has(p.id)), [filteredPhotos, selectedIds]);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3500);
  }, []);

  // ── Selection ────────────────────────────────────────────────────────────
  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const addToSelection = useCallback((ids: string[]) => {
    setSelectedIds((prev) => { const n = new Set(prev); ids.forEach((id) => n.add(id)); return n; });
  }, []);
  const selectAll = useCallback(() => setSelectedIds(new Set(filteredPhotos.map((p) => p.id))), [filteredPhotos]);
  const clearSelection = useCallback(() => { setSelectedIds(new Set()); setIsSelectMode(false); }, []);
  const toggleSelectMode = useCallback(() => {
    setIsSelectMode((on) => { if (on) setSelectedIds(new Set()); return !on; });
  }, []);

  // ── Mutations ────────────────────────────────────────────────────────────
  const deleteOwnPhoto = useCallback(async (photo: ChurchPhoto) => {
    if (!currentUser && photo.uploaderId !== uploaderId) { showNotice(t('photosPage.deleteMine')); return; }
    setDeletingId(photo.id);
    try {
      if (currentUser) {
        await api.adminDeletePhoto(photo.id);
      } else {
        await api.deleteOwnPhoto(photo.id, uploaderId);
      }
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(photo.id); return n; });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId('');
    }
  }, [currentUser, uploaderId, showNotice, t]);

  const bulkDelete = useCallback(async () => {
    const deletable = currentUser ? selectedPhotos : selectedPhotos.filter((p) => p.uploaderId === uploaderId);
    if (deletable.length === 0) { showNotice(t('photosPage.deleteMine')); return; }
    if (!await churchConfirm(t('photosPage.deleteSelectedConfirm').replace('{count}', String(deletable.length)))) return;
    for (const p of deletable) await deleteOwnPhoto(p);
    showNotice(`${deletable.length} ${t('photosPage.uploadedSuffix')}`);
  }, [currentUser, selectedPhotos, uploaderId, deleteOwnPhoto, showNotice, t]);

  const openMoveSelected = useCallback(() => {
    const movable = currentUser ? selectedPhotos : selectedPhotos.filter((p) => p.uploaderId === uploaderId);
    if (movable.length === 0) { showNotice(t('photosPage.moveMine')); return; }
    setMoveOpen(true);
  }, [currentUser, selectedPhotos, uploaderId, showNotice, t]);

  const moveSelected = useCallback(async ({ collection, album }: { collection: string; album: string }) => {
    const movable = currentUser ? selectedPhotos : selectedPhotos.filter((p) => p.uploaderId === uploaderId);
    if (movable.length === 0) { showNotice(t('photosPage.moveMine')); return; }
    setMoving(true);
    const updated: ChurchPhoto[] = [];
    try {
      for (const p of movable) {
        const res = currentUser
          ? await api.adminUpdatePhoto(p.id, { collection, album })
          : await api.updateOwnPhoto(p.id, uploaderId, { collection, album });
        updated.push(res.photo);
      }
      setPhotos((prev) => prev.map((p) => updated.find((u) => u.id === p.id) || p));
      setSelectedIds(new Set());
      setIsSelectMode(false);
      setMoveOpen(false);
      showNotice(`${updated.length} ${t('photosPage.movedSuffix')}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMoving(false);
    }
  }, [currentUser, selectedPhotos, uploaderId, showNotice, t]);

  const downloadPhotos = useCallback((items: ChurchPhoto[]) => {
    items.forEach((photo, i) => window.setTimeout(() => {
      const link = document.createElement('a');
      link.href = photo.src;
      link.download = photo.title || fileBaseName(photo.src);
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }, i * 150));
  }, []);

  const exportMetadata = useCallback(() => {
    const blob = new Blob([JSON.stringify(filteredPhotos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'church-photos.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredPhotos]);

  const scanDuplicates = useCallback(() => {
    const groups = new Map<string, ChurchPhoto[]>();
    filteredPhotos.forEach((p) => {
      const key = `${(p.title || fileBaseName(p.src)).toLowerCase()}|${p.sizeBytes ?? ''}`;
      groups.set(key, [...(groups.get(key) || []), p]);
    });
    const dupes = [...groups.values()].flatMap((g) => (g.length > 1 ? g.slice(1) : []));
    setSelectedIds(new Set(dupes.map((p) => p.id)));
    setIsSelectMode(dupes.length > 0);
    showNotice(`${dupes.length}`);
  }, [filteredPhotos, showNotice]);

  const copyLinks = useCallback(async () => {
    const links = selectedPhotos.map((p) => new URL(p.src, window.location.origin).toString()).join('\n');
    if (!links) return;
    await navigator.clipboard.writeText(links);
    showNotice('✓');
  }, [selectedPhotos, showNotice]);

  // ── Slideshow / Lightbox ─────────────────────────────────────────────────
  const startSlideshow = useCallback((mode: SlideshowMode) => {
    if (filteredPhotos.length === 0) { showNotice(t('photosPage.empty')); return; }
    setSlideshowMode(mode);
  }, [filteredPhotos.length, showNotice, t]);

  const handleItemClick = useCallback((_idx: number, id: string) => {
    const index = filteredPhotos.findIndex((photo) => photo.id === id);
    if (index >= 0) setLightboxIndex(index);
  }, [filteredPhotos]);

  const onUploaded = useCallback((created: ChurchPhoto[]) => {
    setPhotos((prev) => [...created, ...prev]);
    showNotice(`${created.length} ${t('photosPage.uploadedSuffix')}`);
  }, [showNotice, t]);

  // ── Context menu ─────────────────────────────────────────────────────────
  const contextPhoto = contextMenu ? photos.find((p) => p.id === contextMenu.id) : undefined;

  const labels = {
    photoAlt: t('photosPage.photoAlt'),
    favorite: t('photosPage.favorite'),
    deleteMine: t('photosPage.deleteMine'),
    uploadedBy: t('photosPage.uploadedBy'),
    add: t('photosPage.add'),
    empty: t('photosPage.empty'),
  };

  return (
    <div className={`min-h-screen bg-white ${isFullscreen ? 'fixed inset-0 z-40 overflow-y-auto' : ''}`}>
      <PhotoToolbar
        collections={collections}
        selectedCollection={selectedCollection}
        onSetCollection={(c) => { setSelectedCollection(c); setSelectedAlbum('All'); }}
        albums={albums}
        filter={selectedAlbum}
        onSetFilter={setSelectedAlbum}
        albumCount={filteredPhotos.length}
        viewMode={viewMode}
        onSetViewMode={setViewMode}
        gridDisplayMode={gridDisplayMode}
        onSetGridDisplayMode={setGridDisplayMode}
        columns={columns}
        onSetColumns={setColumns}
        sortField={sortField}
        sortDir={sortDir}
        onSetSortField={setSortField}
        onSetSortDir={setSortDir}
        isSelectMode={isSelectMode}
        selectedCount={selectedIds.size}
        totalSelectable={filteredPhotos.length}
        onToggleSelectMode={toggleSelectMode}
        onSelectAll={selectAll}
        isDeleteMode={isDeleteMode}
        onToggleDeleteMode={() => setIsDeleteMode((v) => !v)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen((v) => !v)}
        isRefreshing={loading}
        onRefresh={loadPhotos}
        onScanDuplicates={scanDuplicates}
        onExportOrDownload={() => (isSelectMode && selectedIds.size > 0 ? downloadPhotos(selectedPhotos) : exportMetadata())}
        onBulkDelete={bulkDelete}
        onMoveSelected={openMoveSelected}
        onUpload={() => setUploadOpen(true)}
        onInfo={() => showNotice(`${selectedCollection} / ${selectedAlbum}: ${filteredPhotos.length}`)}
        onSlideshow={startSlideshow}
      />

      {(notice || error) && (
        <div className={`mx-auto max-w-3xl px-6 py-3 text-center text-sm font-semibold ${error ? 'text-red-600' : 'text-emerald-700'}`}>
          {error || notice}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-gray-500">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />{t('photosPage.loading')}
        </div>
      ) : (
        <PhotoGrid
          items={visiblePhotos}
          viewMode={viewMode}
          gridDisplayMode={gridDisplayMode}
          columns={columns}
          filter={selectedAlbum}
          isSelectMode={isSelectMode}
          selectedIds={selectedIds}
          isDeleteMode={isDeleteMode}
          favorites={favorites}
          uploaderId={uploaderId}
          isAdminUser={Boolean(currentUser)}
          deletingId={deletingId}
          labels={labels}
          onToggleSelection={toggleSelection}
          onAddToSelection={addToSelection}
          onItemClick={handleItemClick}
          onToggleFavorite={toggleFavorite}
          onDelete={deleteOwnPhoto}
          onContextMenu={(id, x, y) => setContextMenu({ id, x, y })}
          onAddTile={() => setUploadOpen(true)}
          hasMore={false}
        />
      )}

      {!loading && totalPages > 1 && (
        <nav className="mx-auto mt-6 flex max-w-5xl flex-wrap items-center justify-center gap-1.5 px-4 pb-8" aria-label="pagination">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, safePage - 1))}
            disabled={safePage <= 1}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('admin.prev')}
          </button>
          {paginationNumbers.map((n, idx) => n === 'gap' ? (
            <span key={`gap-${idx}`} className="px-2 text-gray-400">...</span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              aria-current={n === safePage ? 'page' : undefined}
              className={`min-w-[2.25rem] rounded-md px-2 py-1.5 text-sm font-semibold ${n === safePage ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage(Math.min(totalPages, safePage + 1))}
            disabled={safePage >= totalPages}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('admin.next')}
          </button>
          <span className="ml-2 text-xs text-gray-500">
            {t('admin.pageInfo').replace('{page}', String(safePage)).replace('{total}', String(totalPages)).replace('{count}', String(filteredPhotos.length))}
          </span>
        </nav>
      )}

      {/* Floating selection action bar */}
      {isSelectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-gray-200 bg-white/95 p-2 shadow-2xl backdrop-blur-md">
          <div className="mr-1 border-r border-gray-200 px-3 text-sm font-bold text-gray-600">{selectedIds.size}</div>
          <button type="button" onClick={() => void copyLinks()} className="flex min-w-[56px] flex-col items-center gap-1 rounded-lg p-2 text-gray-600 hover:bg-blue-50 hover:text-blue-600"><Copy size={18} /><span className="text-[9px] font-bold uppercase">Copy</span></button>
          <button type="button" onClick={openMoveSelected} className="flex min-w-[56px] flex-col items-center gap-1 rounded-lg p-2 text-gray-600 hover:bg-orange-50 hover:text-orange-600"><FolderInput size={18} /><span className="text-[9px] font-bold uppercase">{t('photosPage.moveSelected')}</span></button>
          <button type="button" onClick={() => downloadPhotos(selectedPhotos)} className="flex min-w-[56px] flex-col items-center gap-1 rounded-lg p-2 text-gray-600 hover:bg-green-50 hover:text-green-600"><Download size={18} /><span className="text-[9px] font-bold uppercase">{t('photosPage.download')}</span></button>
          <button type="button" onClick={() => void bulkDelete()} className="flex min-w-[56px] flex-col items-center gap-1 rounded-lg p-2 text-gray-600 hover:bg-red-50 hover:text-red-600"><Trash2 size={18} /><span className="text-[9px] font-bold uppercase">Delete</span></button>
          <button type="button" onClick={clearSelection} className="ml-1 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"><X size={18} /></button>
        </div>
      )}

      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        collections={collections}
        albums={albums}
        uploaderId={uploaderId}
        defaultYear={selectedCollection !== 'All' ? selectedCollection : uploadSettings.defaultYear}
        defaultAlbum={selectedAlbum !== 'All' && selectedAlbum !== 'Favorites' ? selectedAlbum : uploadSettings.defaultAlbum}
        defaultMaxLongEdge={uploadSettings.maxLongEdge}
        defaultJpegQuality={uploadSettings.jpegQuality}
        onUploaded={onUploaded}
      />

      <MovePhotosModal
        isOpen={moveOpen}
        count={(currentUser ? selectedPhotos : selectedPhotos.filter((p) => p.uploaderId === uploaderId)).length}
        collections={collections}
        albums={albums}
        defaultYear={selectedCollection}
        defaultAlbum={selectedAlbum}
        isMoving={moving}
        onClose={() => setMoveOpen(false)}
        onMove={moveSelected}
      />

      {lightboxIndex != null && filteredPhotos[lightboxIndex] && (
        <Lightbox
          photos={filteredPhotos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          isFavorite={(id) => favorites.has(id)}
          onToggleFavorite={toggleFavorite}
          onDownload={(p) => downloadPhotos([p])}
        />
      )}

      {slideshowMode && (
        <SlideshowOverlay mode={slideshowMode} photos={filteredPhotos} onClose={() => setSlideshowMode(null)} />
      )}

      {contextMenu && contextPhoto && (
        <ContextMenu
          state={contextMenu}
          isFavorite={favorites.has(contextMenu.id)}
          canDelete={Boolean(currentUser) || contextPhoto.uploaderId === uploaderId}
          labels={{ favorite: t('photosPage.favorite'), download: t('photosPage.download'), deleteMine: t('photosPage.deleteMine'), select: t('photosPage.add') }}
          onClose={() => setContextMenu(null)}
          onFavorite={() => toggleFavorite(contextMenu.id)}
          onDownload={() => contextPhoto && downloadPhotos([contextPhoto])}
          onDelete={() => contextPhoto && void deleteOwnPhoto(contextPhoto)}
          onSelect={() => { setIsSelectMode(true); toggleSelection(contextMenu.id); }}
        />
      )}
    </div>
  );
};

export default PhotosPage;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, FolderInput, Loader2, RefreshCw, Trash2, X } from 'lucide-react';
import { zipSync } from 'fflate';
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
import { churchConfirm, churchPermissionConfirm } from '../ChurchDialog';
import { buildPaginationNumbers } from '../../utils/pagination';
import { useAdmin } from '../../hooks/useAdmin';
import { buildMediaSlots } from '../../media';
import { PhotoGate, PHOTO_UNLOCK_KEY } from './PhotoGate';

const UPLOADER_KEY = 'bolccop-photo-uploader-id';
const PHOTO_VIEWED_KEY = 'bolccop-photo-viewed-ids';
const YEAR_PATTERN = /^\d{4}$/;
const SLIDESHOW_WINDOW_PARAM = 'photoSlideshowWindow';
const SLIDESHOW_TOKEN_PARAM = 'photoSlideshowToken';
const SLIDESHOW_PAYLOAD_PREFIX = 'bolccop-photo-slideshow:';

// Diagnostic logger — multi-monitor placement can only be debugged from the
// real machine, so trace every step on both the opener and the popup.
const slideshowLog = (...args: unknown[]) => {
  try { console.info('[slideshow]', ...args); } catch { /* ignore */ }
};

type SlideshowSelection = {
  type: 'photo';
  mode: SlideshowMode;
  data: ChurchPhoto[];
};

type BrowserDisplay = {
  id: number;
  label: string;
  isPrimary: boolean;
  isCurrent: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  screen?: Screen;
};

type ScreenDetailsLike = {
  screens: Screen[];
  currentScreen?: Screen;
};

declare global {
  interface Window {
    getScreenDetails?: () => Promise<ScreenDetailsLike>;
  }
}

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

const loadViewedPhotoIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(PHOTO_VIEWED_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0) : []);
  } catch {
    return new Set();
  }
};

const saveViewedPhotoIds = (ids: Set<string>): void => {
  try {
    localStorage.setItem(PHOTO_VIEWED_KEY, JSON.stringify([...ids]));
  } catch {
    /* Best-effort: local browser dedupe should not interrupt the gallery. */
  }
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

const safeDownloadName = (name: string): string => name
  .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
  .replace(/[. ]+$/g, '')
  .trim() || 'photo.jpg';

const extensionForType = (contentType: string): string => ({
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
}[contentType.split(';')[0].toLowerCase()] || '');

const downloadName = (photo: ChurchPhoto, response: Response): string => {
  const disposition = response.headers.get('Content-Disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return safeDownloadName(decodeURIComponent(encoded)); } catch { /* use metadata below */ }
  }
  const sourceName = fileBaseName(photo.src);
  const sourceExtension = sourceName.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0] || extensionForType(response.headers.get('Content-Type') || '');
  const title = safeDownloadName(photo.title || sourceName);
  return /\.[a-zA-Z0-9]{1,10}$/.test(title) ? title : `${title}${sourceExtension || '.jpg'}`;
};

const saveBlob = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const screenNumber = (screen: Screen, index: number, isCurrent: boolean): BrowserDisplay => {
  // ScreenDetailed exposes full-screen origin via left/top; availLeft/availTop are
  // the work area. For a fullscreen slideshow window we want the FULL screen origin,
  // so prefer left/top and fall back to availLeft/availTop.
  const s = screen as Screen & { left?: number; top?: number; availLeft?: number; availTop?: number; isPrimary?: boolean };
  const width = Math.round(screen.width || window.screen.width || window.innerWidth);
  const height = Math.round(screen.height || window.screen.height || window.innerHeight);
  const x = Math.round(s.left ?? s.availLeft ?? 0);
  const y = Math.round(s.top ?? s.availTop ?? 0);
  const isPrimary = typeof s.isPrimary === 'boolean' ? s.isPrimary : (x === 0 && y === 0);
  return {
    id: index + 1,
    label: `Display ${index + 1}${isPrimary ? ' (Primary)' : ''} - ${width}x${height}`,
    isPrimary,
    isCurrent,
    bounds: { x, y, width, height },
    screen,
  };
};

const listBrowserDisplays = async (): Promise<BrowserDisplay[]> => {
  if (!window.getScreenDetails) {
    slideshowLog('getScreenDetails unavailable (non-Chromium or unsupported) — single-window only');
    return [];
  }
  // Surface the window-management permission state so a denied/prompt case is visible.
  try {
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (perms?.query) {
      const status = await perms.query({ name: 'window-management' as PermissionName }).catch(() => null);
      if (status) slideshowLog('window-management permission:', status.state);
    }
  } catch { /* permission name may be unknown in some browsers */ }
  try {
    const details = await window.getScreenDetails();
    const current = details.currentScreen;
    const displays = details.screens.map((screen, index) => screenNumber(screen, index, screen === current));
    slideshowLog('getScreenDetails ok — screens:', displays.map(d => ({ id: d.id, bounds: d.bounds, isPrimary: d.isPrimary, isCurrent: d.isCurrent })));
    return displays;
  } catch (error) {
    slideshowLog('getScreenDetails failed/denied:', error);
    return [];
  }
};

const windowManagementPermissionState = async (): Promise<PermissionState | null> => {
  try {
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!perms?.query) return null;
    const status = await perms.query({ name: 'window-management' as PermissionName });
    return status.state;
  } catch {
    return null;
  }
};

const PhotosPage: React.FC<{ onGateChange?: (active: boolean) => void }> = ({ onGateChange }) => {
  const { t } = useLocalization();
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const slideshowWindowToken = searchParams.get(SLIDESHOW_TOKEN_PARAM);
  const isStandaloneSlideshowWindow = searchParams.get(SLIDESHOW_WINDOW_PARAM) === '1' && Boolean(slideshowWindowToken);
  const { currentUser, images } = useAdmin();
  const [uploaderId] = useState(getUploaderId);

  const [photos, setPhotos] = useState<ChurchPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [selectedCollection, setSelectedCollection] = useState('All');
  const [selectedAlbum, setSelectedAlbum] = useState('Favorites');
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
  const [activeSlideshow, setActiveSlideshow] = useState<SlideshowSelection | null>(null);
  const [standaloneSlideshow, setStandaloneSlideshow] = useState<SlideshowSelection | null>(null);
  const [standaloneSlideshowLoading, setStandaloneSlideshowLoading] = useState(isStandaloneSlideshowWindow);
  const [slideshowDisplayPicker, setSlideshowDisplayPicker] = useState<{
    open: boolean;
    displays: BrowserDisplay[];
    pending: SlideshowSelection | null;
  }>({ open: false, displays: [], pending: null });
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lastPageViewKeyRef = useRef('');
  const lastLightboxViewIdRef = useRef('');
  const viewedPhotoIdsRef = useRef<Set<string> | null>(null);
  const pendingPhotoViewIdsRef = useRef(new Set<string>());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [page, setPage] = useState(1);

  const [uploadSettings, setUploadSettings] = useState<{ maxLongEdge: number; jpegQuality: number; defaultYear: string; defaultAlbum: string; pageSize: number; accessRequired?: boolean }>({ maxLongEdge: 1600, jpegQuality: 0.82, defaultYear: '', defaultAlbum: '', pageSize: 100 });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    try { return localStorage.getItem(PHOTO_UNLOCK_KEY) === '1'; } catch { return false; }
  });
  const heroUrl = useMemo(() => {
    const slot = buildMediaSlots('hero', images)[0];
    return slot ? (images[slot.key] || slot.placeholder) : '';
  }, [images]);

  // Soft gate is shown to non-admin visitors when a password is set and they
  // haven't unlocked this browser yet. Notify App so it can switch the header to
  // homepage (transparent) style for a seamless header+hero background.
  const showGate = !isStandaloneSlideshowWindow && !currentUser && settingsLoaded && uploadSettings.accessRequired === true && !unlocked;
  useEffect(() => {
    onGateChange?.(showGate);
    return () => onGateChange?.(false);
  }, [showGate, onGateChange]);

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

  useEffect(() => {
    if (isStandaloneSlideshowWindow) {
      setLoading(false);
      return;
    }
    void loadPhotos();
  }, [isStandaloneSlideshowWindow, loadPhotos]);
  useEffect(() => {
    slideshowLog('popup mount — standalone?', isStandaloneSlideshowWindow, 'token:', slideshowWindowToken, 'search:', window.location.search);
    if (!isStandaloneSlideshowWindow || !slideshowWindowToken) {
      setStandaloneSlideshowLoading(false);
      return;
    }

    try {
      const raw = localStorage.getItem(`${SLIDESHOW_PAYLOAD_PREFIX}${slideshowWindowToken}`);
      const parsed = raw ? JSON.parse(raw) as SlideshowSelection : null;
      slideshowLog('payload from localStorage:', raw ? `found (${parsed?.data?.length ?? 0} items, mode=${parsed?.mode})` : 'MISSING');
      setStandaloneSlideshow(parsed);
    } catch (error) {
      slideshowLog('payload parse failed:', error);
      setStandaloneSlideshow(null);
    } finally {
      setStandaloneSlideshowLoading(false);
    }
  }, [isStandaloneSlideshowWindow, slideshowWindowToken]);
  useEffect(() => {
    api.photoSettings()
      .then(setUploadSettings)
      .catch(() => undefined)
      .finally(() => setSettingsLoaded(true));
  }, []);
  useEffect(() => {
    const open = () => setUploadOpen(true);
    window.addEventListener('bolccop:open-photo-upload', open);
    return () => window.removeEventListener('bolccop:open-photo-upload', open);
  }, []);
  // ── Derived filters ──────────────────────────────────────────────────────
  const favorites = useMemo(() => new Set(photos.filter((photo) => photo.isFavorite).map((photo) => photo.id)), [photos]);

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

  const incrementLocalViewCounts = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setPhotos((prev) => prev.map((photo) => (
      idSet.has(photo.id) ? { ...photo, viewCount: (photo.viewCount ?? 0) + 1 } : photo
    )));
  }, []);

  const getViewedPhotoIds = useCallback(() => {
    if (!viewedPhotoIdsRef.current) {
      viewedPhotoIdsRef.current = loadViewedPhotoIds();
    }
    return viewedPhotoIdsRef.current;
  }, []);

  const markPhotoIdsViewed = useCallback((ids: string[]) => {
    const viewed = getViewedPhotoIds();
    ids.forEach((id) => viewed.add(id));
    saveViewedPhotoIds(viewed);
  }, [getViewedPhotoIds]);

  const reportPhotoViews = useCallback(async (ids: string[]) => {
    const viewed = getViewedPhotoIds();
    const pending = pendingPhotoViewIdsRef.current;
    const uniqueIds = [...new Set(ids)].filter((id) => Boolean(id) && !viewed.has(id) && !pending.has(id));
    if (uniqueIds.length === 0) return;
    uniqueIds.forEach((id) => pending.add(id));
    try {
      const res = await api.incrementPhotoViews(uniqueIds);
      markPhotoIdsViewed(res.ids);
      incrementLocalViewCounts(res.ids);
    } catch {
      /* View counts are best-effort and should never interrupt the gallery. */
    } finally {
      uniqueIds.forEach((id) => pending.delete(id));
    }
  }, [getViewedPhotoIds, incrementLocalViewCounts, markPhotoIdsViewed]);

  useEffect(() => {
    if (loading) return;
    const ids = visiblePhotos.map((photo) => photo.id);
    if (ids.length === 0) return;
    const key = `${selectedCollection}|${selectedAlbum}|${sortField}|${sortDir}|${safePage}|${ids.join(',')}`;
    if (lastPageViewKeyRef.current === key) return;
    lastPageViewKeyRef.current = key;
    const timer = window.setTimeout(() => { void reportPhotoViews(ids); }, 250);
    return () => window.clearTimeout(timer);
  }, [loading, reportPhotoViews, safePage, selectedAlbum, selectedCollection, sortDir, sortField, visiblePhotos]);

  useEffect(() => {
    if (lightboxIndex == null) return;
    const id = filteredPhotos[lightboxIndex]?.id;
    if (!id || lastLightboxViewIdRef.current === id) return;
    lastLightboxViewIdRef.current = id;
    void reportPhotoViews([id]);
  }, [filteredPhotos, lightboxIndex, reportPhotoViews]);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3500);
  }, []);

  // ── Selection ────────────────────────────────────────────────────────────
  const toggleFavorite = useCallback((id: string) => {
    const current = photos.find((photo) => photo.id === id);
    if (!current) return;
    const nextFavorite = !current.isFavorite;
    const previous = current;
    setPhotos((prev) => prev.map((photo) => photo.id === id
      ? {
          ...photo,
          isFavorite: nextFavorite,
          favoriteCount: nextFavorite ? 1 : 0,
        }
      : photo
    ));
    api.setPhotoFavorite(id, nextFavorite)
      .then((res) => {
        setPhotos((prev) => prev.map((photo) => photo.id === id
          ? { ...photo, isFavorite: res.isFavorite, favoriteCount: res.isFavorite ? 1 : 0 }
          : photo
        ));
      })
      .catch((err) => {
        setPhotos((prev) => prev.map((photo) => photo.id === id ? previous : photo));
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [photos]);
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

  const downloadPhotos = useCallback(async (items: ChurchPhoto[]) => {
    if (items.length === 0) return;
    setError('');
    const files: Record<string, Uint8Array> = {};
    const usedNames = new Set<string>();

    try {
      for (let index = 0; index < items.length; index++) {
        setNotice(t('photosPage.downloadingPhotos')
          .replace('{current}', String(index + 1))
          .replace('{total}', String(items.length)));
        const photo = items[index];
        const response = await fetch(`/api/photos/${encodeURIComponent(photo.id)}/download`, { credentials: 'same-origin' });
        const contentType = response.headers.get('Content-Type') || '';
        if (!response.ok || /(?:text\/html|application\/json)/i.test(contentType)) {
          throw new Error(`Download failed (${response.status})`);
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        let name = downloadName(photo, response);
        const dot = name.lastIndexOf('.');
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const extension = dot > 0 ? name.slice(dot) : '';
        let copy = 2;
        while (usedNames.has(name.toLowerCase())) name = `${stem} (${copy++})${extension}`;
        usedNames.add(name.toLowerCase());
        files[name] = bytes;
      }

      if (items.length === 1) {
        const [name, bytes] = Object.entries(files)[0];
        saveBlob(new Blob([bytes.buffer as ArrayBuffer]), name);
      } else {
        const archive = zipSync(files, { level: 0 });
        const date = new Date().toISOString().slice(0, 10);
        saveBlob(new Blob([archive.buffer as ArrayBuffer], { type: 'application/zip' }), `church-photos-${date}.zip`);
      }
      showNotice(t('photosPage.downloadComplete'));
    } catch (err) {
      setNotice('');
      console.error('[photos] download failed', err);
      setError(t('photosPage.downloadFailed'));
    }
  }, [showNotice, t]);

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
  const startSlideshow = useCallback(async (mode: SlideshowMode) => {
    if (filteredPhotos.length === 0) { showNotice(t('photosPage.empty')); return; }
    const nextSelection: SlideshowSelection = { type: 'photo', mode, data: filteredPhotos };

    try {
      if (window.getScreenDetails && await windowManagementPermissionState() !== 'granted') {
        const allowed = await churchPermissionConfirm(t('photosPage.windowPermissionMessage'), {
          title: t('photosPage.windowPermissionTitle'),
          confirmLabel: t('meeting.permissionContinue'),
          cancelLabel: t('meeting.permissionCancel'),
        });
        if (!allowed) {
          setActiveSlideshow(nextSelection);
          return;
        }
      }
      const displays = await listBrowserDisplays();
      if (displays.length > 1) {
        setSlideshowDisplayPicker({ open: true, displays, pending: nextSelection });
        return;
      }
    } catch (error) {
      console.warn('[slideshow] Failed to list displays:', error);
    }

    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch((error) => {
        console.warn('[slideshow] Failed to enter fullscreen:', error);
      });
    }
    setActiveSlideshow(nextSelection);
  }, [filteredPhotos, showNotice, t]);

  useEffect(() => {
    const open = (event: Event) => {
      const mode = (event as CustomEvent<SlideshowMode>).detail;
      void startSlideshow(mode || 'cascade');
    };
    window.addEventListener('bolccop:start-photo-slideshow', open);
    return () => window.removeEventListener('bolccop:start-photo-slideshow', open);
  }, [startSlideshow]);

  const handleCloseSlideshow = useCallback(() => {
    setActiveSlideshow(null);
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch((error) => {
        console.warn('[slideshow] Failed to exit fullscreen:', error);
      });
    }
  }, []);

  const handleCloseStandaloneSlideshow = useCallback(() => {
    if (slideshowWindowToken) {
      localStorage.removeItem(`${SLIDESHOW_PAYLOAD_PREFIX}${slideshowWindowToken}`);
    }
    window.close();
  }, [slideshowWindowToken]);

  const handleLaunchSlideshowOnCurrentScreen = useCallback(() => {
    const pending = slideshowDisplayPicker.pending;
    if (!pending) return;

    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch((error) => {
        console.warn('[slideshow] Failed to enter fullscreen:', error);
      });
    }
    setActiveSlideshow(pending);
    setSlideshowDisplayPicker({ open: false, displays: [], pending: null });
  }, [slideshowDisplayPicker.pending]);

  const handleLaunchSlideshowOnDisplay = useCallback(async (displayId: number) => {
    const pending = slideshowDisplayPicker.pending;
    if (!pending) return;
    const display = slideshowDisplayPicker.displays.find((item) => item.id === displayId);
    if (!display) return;

    // Fullscreen the CURRENT window onto the chosen screen using the Window
    // Management API (FullscreenOptions.screen). This runs inside the click
    // gesture, so it reliably enters real fullscreen on that display — unlike a
    // programmatically-opened popup, which browsers refuse to auto-fullscreen.
    try {
      const target = display.screen;
      slideshowLog('requestFullscreen on display', display.label, 'screen?', !!target);
      await document.documentElement.requestFullscreen?.(
        target ? ({ screen: target } as unknown as FullscreenOptions) : undefined,
      );
    } catch (error) {
      slideshowLog('requestFullscreen({screen}) failed:', error);
      showNotice('Could not enter fullscreen on that display. Allow fullscreen for this site and retry.');
    }
    setActiveSlideshow(pending);
    setSlideshowDisplayPicker({ open: false, displays: [], pending: null });
  }, [showNotice, slideshowDisplayPicker.displays, slideshowDisplayPicker.pending]);

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

  if (isStandaloneSlideshowWindow) {
    if (standaloneSlideshowLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-black text-sm font-semibold text-white">
          Loading slideshow...
        </div>
      );
    }

    if (!standaloneSlideshow) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
          <div className="text-lg font-semibold">Slideshow Payload Unavailable</div>
          <button
            type="button"
            onClick={() => window.close()}
            className="rounded-md bg-white px-4 py-2 text-sm font-bold text-gray-900 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      );
    }

    return (
      <SlideshowOverlay
        mode={standaloneSlideshow.mode}
        photos={standaloneSlideshow.data}
        onClose={handleCloseStandaloneSlideshow}
      />
    );
  }

  // Soft access gate: blurred Hero background + floating password card, rendered
  // within the normal layout (header/footer preserved). Admins bypass it.
  if (showGate) {
    return <PhotoGate heroUrl={heroUrl} onUnlocked={() => setUnlocked(true)} />;
  }

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
        onExportOrDownload={() => { if (isSelectMode && selectedIds.size > 0) void downloadPhotos(selectedPhotos); else exportMetadata(); }}
        onBulkDelete={bulkDelete}
        onMoveSelected={openMoveSelected}
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
          <button type="button" onClick={() => void downloadPhotos(selectedPhotos)} className="flex min-w-[56px] flex-col items-center gap-1 rounded-lg p-2 text-gray-600 hover:bg-green-50 hover:text-green-600"><Download size={18} /><span className="text-[9px] font-bold uppercase">{t('photosPage.download')}</span></button>
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
          onDownload={(p) => { void downloadPhotos([p]); }}
        />
      )}

      {activeSlideshow && (
        <SlideshowOverlay
          mode={activeSlideshow.mode}
          photos={activeSlideshow.data}
          onClose={handleCloseSlideshow}
        />
      )}

      {slideshowDisplayPicker.open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <div className="text-lg font-bold text-gray-900">Choose Slideshow Screen</div>
                <div className="text-sm text-gray-500">Multi-monitor detected. Pick where the slideshow should open.</div>
              </div>
              <button
                type="button"
                onClick={() => setSlideshowDisplayPicker({ open: false, displays: [], pending: null })}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <button
                type="button"
                onClick={handleLaunchSlideshowOnCurrentScreen}
                className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left hover:border-blue-400 hover:bg-blue-100"
              >
                <div className="font-bold text-blue-900">Current Window</div>
                <div className="text-sm text-blue-700">Use this browser tab and enter fullscreen.</div>
              </button>
              {slideshowDisplayPicker.displays.filter((display: BrowserDisplay) => !display.isCurrent).map((display: BrowserDisplay) => (
                <button
                  key={display.id}
                  type="button"
                  onClick={() => handleLaunchSlideshowOnDisplay(display.id)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-gray-400 hover:bg-gray-50"
                >
                  <div className="font-bold text-gray-900">{display.label}</div>
                  <div className="text-sm text-gray-500">
                    {display.bounds.width}x{display.bounds.height} at {display.bounds.x}, {display.bounds.y}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {contextMenu && contextPhoto && (
        <ContextMenu
          state={contextMenu}
          isFavorite={favorites.has(contextMenu.id)}
          canDelete={Boolean(currentUser) || contextPhoto.uploaderId === uploaderId}
          labels={{ favorite: t('photosPage.favorite'), download: t('photosPage.download'), deleteMine: t('photosPage.deleteMine'), select: t('photosPage.add') }}
          onClose={() => setContextMenu(null)}
          onFavorite={() => toggleFavorite(contextMenu.id)}
          onDownload={() => { if (contextPhoto) void downloadPhotos([contextPhoto]); }}
          onDelete={() => contextPhoto && void deleteOwnPhoto(contextPhoto)}
          onSelect={() => { setIsSelectMode(true); toggleSelection(contextMenu.id); }}
        />
      )}
    </div>
  );
};

export default PhotosPage;

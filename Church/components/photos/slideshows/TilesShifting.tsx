import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Volume2, VolumeX, Loader2 } from 'lucide-react';
import type { ChurchPhoto } from '../../../data';
import { imgUrl, shuffle, knownAspect, SLIDESHOW_AUDIO, type AspectKind } from './util';
import { StaticTile } from './StaticTile';

type TileKind = 'single' | 'double' | 'wide';
type ShiftDirection = -1 | 1;

interface ATile {
  id: string;
  type: 'single' | 'double' | 'wide' | 'ghost';
  top: ChurchPhoto | null;
  bottom?: ChurchPhoto | null;
  status: string;
  travelUnits?: number;
  travelDirection?: ShiftDirection;
  delayMs?: number;
}

const GRID_COLUMNS = 5;
const GRID_GAP_PX = 8;
const ANIMATION_MS = 520;

const EXIT_EFFECTS = ['exit-fade-out', 'exit-scale-down', 'exit-slide-left', 'exit-slide-right', 'exit-slide-top', 'exit-slide-bottom', 'exit-soft-push'];

const isTemplatePortraitCandidate = (item: ChurchPhoto): boolean => {
  if (typeof item.width === 'number' && typeof item.height === 'number' && item.width > 0 && item.height > 0) {
    return (item.height / item.width) <= 1.75;
  }
  return true;
};

const detectAspect = (item: ChurchPhoto): Promise<AspectKind | null> => {
  const known = knownAspect(item);
  if (known) return Promise.resolve(known);
  return new Promise((resolve) => {
    const img = new Image();
    img.src = item.src;
    img.onload = () => resolve(img.naturalWidth >= img.naturalHeight ? 'landscape' : 'portrait');
    img.onerror = () => resolve(null);
  });
};

async function classifyMedia(data: ChurchPhoto[]): Promise<{ portrait: ChurchPhoto[]; landscape: ChurchPhoto[] }> {
  const portrait: ChurchPhoto[] = [];
  const landscape: ChurchPhoto[] = [];
  const settled = await Promise.all(data.map(async (item) => ({ item, aspect: await detectAspect(item) })));
  for (const entry of settled) {
    if (entry.aspect === 'landscape') landscape.push(entry.item); else portrait.push(entry.item);
  }
  return { portrait, landscape };
}

const getOnScreenUrls = (rows: ATile[][]): Set<string> => {
  const set = new Set<string>();
  rows.forEach((row) => row.forEach((tile) => {
    if (tile.top) set.add(tile.top.src);
    if (tile.bottom) set.add(tile.bottom.src);
  }));
  return set;
};

const sharedStyles = `
    .tile-transition { transition: all 0.52s cubic-bezier(0.22, 1, 0.36, 1); }
    .exit-fade-out { opacity: 0; filter: blur(6px); }
    .exit-scale-down { opacity: 0; transform: scale(0.84); filter: blur(6px); }
    .exit-slide-left { opacity: 0; transform: translateX(-12%); filter: blur(4px); }
    .exit-slide-right { opacity: 0; transform: translateX(12%); filter: blur(4px); }
    .exit-slide-top { opacity: 0; transform: translateY(-10%); filter: blur(4px); }
    .exit-slide-bottom { opacity: 0; transform: translateY(10%); filter: blur(4px); }
    .exit-soft-push { opacity: 0; transform: scale(1.04); filter: blur(8px); }
    .shift-bounce { animation: shiftBounce ${ANIMATION_MS}ms cubic-bezier(0.2, 0.82, 0.24, 1) forwards; animation-delay: var(--impact-delay, 0ms); z-index: 25; }
    .entering { animation: tileEnter ${ANIMATION_MS}ms cubic-bezier(0.2, 0.82, 0.24, 1) forwards; }
    @keyframes shiftBounce {
        0% { transform: translate3d(0, 0, 0) scaleX(1); }
        58% { transform: translate3d(calc(var(--travel-px) * var(--travel-dir)), 0, 0) scaleX(0.988); }
        78% { transform: translate3d(calc(var(--travel-px) * var(--travel-dir) - (6px * var(--travel-dir))), 0, 0) scaleX(1.003); }
        100% { transform: translate3d(calc(var(--travel-px) * var(--travel-dir)), 0, 0) scaleX(1); }
    }
    @keyframes tileEnter {
        0% { opacity: 0; transform: translate3d(calc(var(--entry-px) * var(--travel-dir)), 0, 0) scale(1.018) scaleX(1.012); filter: blur(8px); }
        62% { opacity: 1; transform: translate3d(calc(-5px * var(--travel-dir)), 0, 0) scale(0.997) scaleX(0.992); filter: blur(0); }
        100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) scaleX(1); filter: blur(0); }
    }
`;

/** Faithful port of OurStoryHub ShiftingTilesSlideshow (photo path). */
export const TilesShiftingSlideshow = ({ photos, onClose }: { photos: ChurchPhoto[]; onClose: () => void }) => {
  const data = photos;
  const [rows, setRows] = useState<ATile[][]>([]);
  const [ready, setReady] = useState(false);
  const [focalContent, setFocalContent] = useState<string | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pools = useRef({ portrait: [] as ChurchPhoto[], landscape: [] as ChurchPhoto[] });
  const portraitTemplatePool = useRef([] as ChurchPhoto[]);
  const decks = useRef({ portrait: [] as ChurchPhoto[], landscape: [] as ChurchPhoto[] });
  const portraitTemplateDeck = useRef([] as ChurchPhoto[]);
  const usedHistory = useRef<string[]>([]);
  const isAnimating = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setRows([]);
    usedHistory.current = [];

    void classifyMedia(data).then(({ portrait, landscape }) => {
      if (cancelled) return;
      const nextPortrait = portrait.length > 0 ? portrait : data.filter((_, idx) => idx % 2 === 0);
      const nextLandscape = landscape.length > 0 ? landscape : data.filter((_, idx) => idx % 2 !== 0);
      pools.current = { portrait: nextPortrait, landscape: nextLandscape };
      portraitTemplatePool.current = nextPortrait.filter((item) => isTemplatePortraitCandidate(item));
      decks.current = { portrait: shuffle([...nextPortrait]), landscape: shuffle([...nextLandscape]) };
      portraitTemplateDeck.current = shuffle([...portraitTemplatePool.current]);
      const focalItem = nextLandscape[0] || nextPortrait[0] || data[0] || null;
      setFocalContent(focalItem ? focalItem.src : null);
      setReady(true);
    });

    return () => { cancelled = true; };
  }, [data]);

  useEffect(() => {
    if (audioRef.current) { audioRef.current.volume = 0.6; audioRef.current.play().catch(() => {}); }
  }, [ready]);

  const rememberUsage = useCallback((url: string) => {
    usedHistory.current.push(url);
    const maxHistory = Math.max(12, Math.min(data.length - 1, Math.floor(data.length * 0.45)));
    while (usedHistory.current.length > maxHistory) usedHistory.current.shift();
  }, [data.length]);

  const getNextItem = useCallback((
    aspect: AspectKind,
    options: { templateOnly?: boolean } = {},
    currentRows: ATile[][] = [],
    batchExclusions: Set<string> = new Set(),
  ): ChurchPhoto => {
    const wantsTemplate = aspect === 'portrait' && options.templateOnly;
    const primaryPool = wantsTemplate ? portraitTemplatePool.current : aspect === 'portrait' ? pools.current.portrait : pools.current.landscape;
    const secondaryPool = aspect === 'portrait' ? pools.current.landscape : pools.current.portrait;
    const activePool = primaryPool.length > 0 ? primaryPool : secondaryPool.length > 0 ? secondaryPool : data;
    const useTemplateDeck = wantsTemplate && primaryPool.length > 0;
    const deckKey: AspectKind = primaryPool.length > 0 ? aspect : secondaryPool.length > 0 ? (aspect === 'portrait' ? 'landscape' : 'portrait') : aspect;
    const activeDeck = useTemplateDeck ? portraitTemplateDeck.current : decks.current[deckKey];

    const onScreen = getOnScreenUrls(currentRows);
    const blocked = (item: ChurchPhoto) => onScreen.has(item.src) || batchExclusions.has(item.src);

    if (useTemplateDeck && portraitTemplateDeck.current.length === 0) portraitTemplateDeck.current = shuffle([...activePool]);
    else if (!useTemplateDeck && decks.current[deckKey].length === 0) decks.current[deckKey] = shuffle([...activePool]);

    let candidates = activeDeck.filter((item) => !blocked(item) && !usedHistory.current.includes(item.src));
    if (candidates.length === 0) candidates = activeDeck.filter((item) => !blocked(item));
    if (candidates.length === 0) {
      if (useTemplateDeck) { portraitTemplateDeck.current = shuffle([...activePool]); candidates = portraitTemplateDeck.current.filter((item) => !blocked(item)); }
      else { decks.current[deckKey] = shuffle([...activePool]); candidates = decks.current[deckKey].filter((item) => !blocked(item)); }
    }

    const nextDeck = useTemplateDeck ? portraitTemplateDeck.current : decks.current[deckKey];
    const selection = candidates[0] || nextDeck[0] || activePool[0] || data[0];
    const selectedUrl = selection.src;
    if (useTemplateDeck) portraitTemplateDeck.current = portraitTemplateDeck.current.filter((item) => item.src !== selectedUrl);
    else decks.current[deckKey] = decks.current[deckKey].filter((item) => item.src !== selectedUrl);
    rememberUsage(selectedUrl);
    return selection;
  }, [data, rememberUsage]);

  const createTile = useCallback((type: 'single' | 'double' | 'wide' | 'ghost', currentRows: ATile[][], batchExclusions: Set<string>): ATile => {
    if (type === 'ghost') return { id: Math.random().toString(36).slice(2, 11), type, top: null, status: 'idle', travelUnits: 1, travelDirection: -1, delayMs: 0 };
    if (type === 'wide') {
      const top = getNextItem('landscape', {}, currentRows, batchExclusions);
      batchExclusions.add(top.src);
      return { id: Math.random().toString(36).slice(2, 11), type, top, status: 'idle', travelUnits: 1, travelDirection: -1, delayMs: 0 };
    }
    if (type === 'double') {
      const top = getNextItem('portrait', { templateOnly: true }, currentRows, batchExclusions);
      batchExclusions.add(top.src);
      const bottom = getNextItem('portrait', { templateOnly: true }, currentRows, batchExclusions);
      batchExclusions.add(bottom.src);
      return { id: Math.random().toString(36).slice(2, 11), type, top, bottom, status: 'idle', travelUnits: 1, travelDirection: -1, delayMs: 0 };
    }
    const top = getNextItem('portrait', { templateOnly: true }, currentRows, batchExclusions);
    batchExclusions.add(top.src);
    return { id: Math.random().toString(36).slice(2, 11), type, top, status: 'idle', travelUnits: 1, travelDirection: -1, delayMs: 0 };
  }, [getNextItem]);

  const buildRow = useCallback((existingRows: ATile[][], pattern: TileKind[]): ATile[] => {
    const batchExclusions = new Set<string>();
    const row: ATile[] = [];
    for (const tileType of pattern) {
      row.push(createTile(tileType, [...existingRows, row], batchExclusions));
      if (tileType === 'wide') row.push(createTile('ghost', [...existingRows, row], batchExclusions));
    }
    return row;
  }, [createTile]);

  const generateLayout = useCallback(() => {
    const templates: [TileKind[], TileKind[]][] = [
      [['wide', 'single', 'single', 'single'], ['double', 'single', 'single', 'wide']],
      [['single', 'double', 'single', 'single', 'double'], ['wide', 'single', 'single', 'single']],
      [['wide', 'single', 'single', 'double'], ['single', 'single', 'single', 'wide']],
      [['double', 'single', 'single', 'wide'], ['single', 'single', 'single', 'single', 'double']],
      [['wide', 'single', 'single', 'double'], ['double', 'single', 'single', 'wide']],
    ];
    const [firstPattern, secondPattern] = templates[Math.floor(Math.random() * templates.length)];
    const firstRow = buildRow([], firstPattern);
    const secondRow = buildRow([firstRow], secondPattern);
    return [firstRow, secondRow];
  }, [buildRow]);

  const finishRefresh = useCallback((r: number, c: number) => {
    setRows((prevRows) => {
      const nextRows = prevRows.map((row) => [...row]);
      const oldTile = nextRows[r]?.[c];
      if (!oldTile || oldTile.type === 'ghost') return prevRows;
      const nextTile = createTile(oldTile.type, nextRows, new Set());
      nextTile.status = 'entering';
      nextTile.travelUnits = 1;
      nextTile.travelDirection = -1;
      nextRows[r][c] = nextTile;
      isAnimating.current = false;
      return nextRows;
    });
  }, [createTile]);

  const settleRow = useCallback((r: number) => {
    setRows((prevRows) => {
      const nextRows = prevRows.map((row) => [...row]);
      const row = nextRows[r];
      if (!row) return prevRows;
      nextRows[r] = row.map((tile) => ({ ...tile, status: 'idle', travelUnits: 1, travelDirection: -1, delayMs: 0 }));
      return nextRows;
    });
  }, []);

  const triggerSwitch = useCallback((r: number, c: number) => {
    setRows((prevRows) => {
      const nextRows = prevRows.map((row) => [...row]);
      const tile = nextRows[r]?.[c];
      if (!tile || tile.type === 'ghost') return prevRows;
      if (tile.status !== 'idle' && tile.status !== 'entering') return prevRows;
      if (tile.top) setFocalContent(tile.top.src);
      nextRows[r][c] = { ...tile, status: EXIT_EFFECTS[Math.floor(Math.random() * EXIT_EFFECTS.length)] };
      return nextRows;
    });
    window.setTimeout(() => finishRefresh(r, c), 520);
  }, [finishRefresh]);

  const getSpan = useCallback((tile: ATile | undefined) => (tile?.type === 'wide' ? 2 : 1), []);

  const mutateRow = useCallback((rowIndex: number) => {
    if (isAnimating.current) return;
    setRows((prevRows) => {
      const row = prevRows[rowIndex];
      if (!row) return prevRows;
      const candidates = row.map((tile, idx) => (tile.type !== 'ghost' ? idx : -1)).filter((idx) => idx >= 0);
      if (candidates.length === 0) return prevRows;
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      const nextRows = prevRows.map((currentRow) => [...currentRow]);
      const tile = nextRows[rowIndex][target];
      const span = getSpan(tile);
      const legalDirections: ShiftDirection[] = [];
      if (target + span < row.length) legalDirections.push(-1);
      if (target > 0) legalDirections.push(1);
      if (!legalDirections.length) return prevRows;
      const direction = legalDirections[Math.floor(Math.random() * legalDirections.length)];

      if (tile.top) setFocalContent(tile.top.src);
      for (let offset = 0; offset < span; offset++) {
        const slotIndex = target + offset;
        if (!nextRows[rowIndex][slotIndex]) continue;
        nextRows[rowIndex][slotIndex] = { ...nextRows[rowIndex][slotIndex], status: EXIT_EFFECTS[Math.floor(Math.random() * EXIT_EFFECTS.length)], travelUnits: span, travelDirection: direction, delayMs: 0 };
      }
      if (direction === -1) {
        for (let idx = target + span; idx < row.length; idx++) {
          if (row[idx]?.type === 'ghost') continue;
          nextRows[rowIndex][idx] = { ...nextRows[rowIndex][idx], status: 'shift-bounce', travelUnits: span, travelDirection: -1, delayMs: Math.min(64, Math.floor((idx - (target + span)) / 1) * 18) };
        }
      } else {
        for (let idx = target - 1; idx >= 0; idx--) {
          if (row[idx]?.type === 'ghost') continue;
          nextRows[rowIndex][idx] = { ...nextRows[rowIndex][idx], status: 'shift-bounce', travelUnits: span, travelDirection: 1, delayMs: Math.min(64, Math.floor(((target - 1) - idx) / 1) * 18) };
        }
      }

      isAnimating.current = true;
      window.setTimeout(() => {
        setRows((currentRows) => {
          const updatedRows = currentRows.map((currentRow) => [...currentRow]);
          const currentRow = updatedRows[rowIndex];
          if (!currentRow) return currentRows;
          const withoutRemoved = currentRow.filter((_, idx) => idx < target || idx >= target + span);
          const newTile = createTile(tile.type as 'single' | 'double' | 'wide', updatedRows, new Set());
          newTile.status = 'entering';
          newTile.travelUnits = span;
          newTile.travelDirection = direction === -1 ? 1 : -1;
          newTile.delayMs = 0;
          const insertion = newTile.type === 'wide' ? [newTile, createTile('ghost', updatedRows, new Set())] : [newTile];
          updatedRows[rowIndex] = direction === -1 ? [...withoutRemoved, ...insertion] : [...insertion, ...withoutRemoved];
          return updatedRows;
        });
        window.setTimeout(() => { settleRow(rowIndex); isAnimating.current = false; }, ANIMATION_MS - 20);
      }, ANIMATION_MS - 30);
      return nextRows;
    });
  }, [createTile, getSpan, settleRow]);

  useEffect(() => { if (ready) setRows(generateLayout()); }, [ready, generateLayout]);

  useEffect(() => {
    if (!rows.length) return;
    const interval = window.setInterval(() => { if (!isAnimating.current && rows.length) mutateRow(Math.floor(Math.random() * rows.length)); }, 5000);
    return () => window.clearInterval(interval);
  }, [mutateRow, rows.length]);

  useEffect(() => {
    const node = gridRef.current;
    if (!node) return;
    const update = () => setGridWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [rows.length]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-black font-sans animate-fadeIn">
      {focalContent && (
        <div className="absolute inset-0 z-0 scale-110 transition-all duration-1000" style={{ backgroundImage: `url(${imgUrl({ src: focalContent } as ChurchPhoto, 'blog')})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) brightness(0.4)' }} />
      )}
      <style>{sharedStyles}</style>
      <audio ref={audioRef} src={SLIDESHOW_AUDIO} loop />

      <div className="absolute right-6 top-6 z-[110] flex gap-4">
        <button onClick={toggleMute} className="rounded-full border border-white/20 bg-white/10 p-2 text-white shadow-xl backdrop-blur-lg transition-colors hover:bg-rose-500">{isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}</button>
        <button onClick={onClose} className="rounded-full border border-white/20 bg-white/10 p-2 text-white shadow-xl backdrop-blur-lg transition-colors hover:bg-rose-500"><X size={24} /></button>
      </div>

      {!ready || !rows.length ? (
        <div className="z-10 flex flex-1 flex-col items-center justify-center">
          <Loader2 className="mb-4 animate-spin text-rose-500" size={48} />
          <div className="animate-pulse text-xl font-light uppercase tracking-widest text-white">Preparing Tiles Shifting...</div>
        </div>
      ) : (
        <div ref={gridRef} className="z-10 grid h-full w-full flex-1 grid-cols-5 grid-rows-2 gap-2 bg-transparent p-4">
          {rows.flatMap((row, rIdx) => row.map((tile, cIdx) => {
            if (tile.type === 'ghost') return null;
            const slotWidth = gridWidth > 0 ? (gridWidth - GRID_GAP_PX * (GRID_COLUMNS - 1)) / GRID_COLUMNS : 0;
            const travelUnits = tile.travelUnits || 1;
            const travelPx = Math.max(0, slotWidth * travelUnits + GRID_GAP_PX * travelUnits);
            return (
              <div
                key={tile.id}
                onClick={() => triggerSwitch(rIdx, cIdx)}
                className={`group/tile tile-transition relative h-full w-full cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md ${tile.status}`}
                style={{
                  gridRow: rIdx + 1,
                  gridColumn: cIdx + 1,
                  ...(tile.type === 'wide' ? { gridColumn: `${cIdx + 1} / span 2` } : {}),
                  ['--travel-px' as string]: `${travelPx}px`,
                  ['--travel-dir' as string]: `${tile.travelDirection || -1}`,
                  ['--entry-px' as string]: `${Math.max(20, Math.min(42, travelPx * 0.42))}px`,
                  ['--impact-delay' as string]: `${tile.delayMs || 0}ms`,
                }}
              >
                <div className="absolute inset-0 z-20 bg-gradient-to-br from-white/10 to-transparent opacity-0 transition-opacity duration-500 group-hover/tile:opacity-100" />
                {tile.type === 'double' ? (
                  <div className="flex h-full w-full flex-col gap-2">
                    <div className="relative flex-1 overflow-hidden"><StaticTile src={imgUrl(tile.top as ChurchPhoto, 'portrait')} imageStyle={{ objectPosition: 'center 18%' }} /></div>
                    <div className="relative flex-1 overflow-hidden">{tile.bottom && <StaticTile src={imgUrl(tile.bottom, 'portrait')} imageStyle={{ objectPosition: 'center 18%' }} />}</div>
                  </div>
                ) : (
                  <StaticTile
                    src={imgUrl(tile.top as ChurchPhoto, tile.type === 'wide' ? 'landscape' : 'portrait')}
                    className="transition-transform duration-1000 group-hover/tile:scale-105"
                    imageStyle={tile.type === 'wide' ? undefined : { objectPosition: 'center 18%' }}
                  />
                )}
              </div>
            );
          }))}
        </div>
      )}
    </div>
  );
};

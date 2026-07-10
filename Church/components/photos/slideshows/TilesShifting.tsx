import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { ChurchPhoto } from '../../../data';
import { imgUrl, shuffle, knownAspect, type AspectKind } from './util';
import { StaticTile } from './StaticTile';
import {
  markRowForShift,
  handoffRow,
  markTileExit,
  replaceTileAt,
  settleRowTiles,
  handoffDelayMs,
  VANISH_MS,
  SHIFT_MS,
  POP_MS,
  SETTLE_AFTER_HANDOFF_MS,
  ROW_END_POP_AT_MS,
} from './tilesShiftingPlan';

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

const removeFromDecks = (
  item: ChurchPhoto,
  decksRef: React.MutableRefObject<{ portrait: ChurchPhoto[]; landscape: ChurchPhoto[] }>,
  portraitTemplateDeckRef: React.MutableRefObject<ChurchPhoto[]>,
) => {
  decksRef.current.portrait = decksRef.current.portrait.filter((entry) => entry.src !== item.src);
  decksRef.current.landscape = decksRef.current.landscape.filter((entry) => entry.src !== item.src);
  portraitTemplateDeckRef.current = portraitTemplateDeckRef.current.filter((entry) => entry.src !== item.src);
};

const sharedStyles = `
    .exit-vanish { animation: tileVanish ${VANISH_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards; }
    .shift-bounce { animation: shiftBounce ${SHIFT_MS}ms cubic-bezier(0.33, 1, 0.68, 1) forwards; animation-delay: var(--impact-delay, 0ms); z-index: 25; }
    .pop-in { animation: tilePop ${POP_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards; z-index: 30; }
    @keyframes tileVanish {
        0% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(0.72); }
    }
    @keyframes shiftBounce {
        0%   { transform: translate3d(0, 0, 0) scaleX(1); }
        58%  { transform: translate3d(calc(var(--travel-px) * var(--travel-dir) * 1.05), 0, 0) scaleX(0.96); }
        76%  { transform: translate3d(calc(var(--travel-px) * var(--travel-dir) * 0.98), 0, 0) scaleX(1.015); }
        100% { transform: translate3d(calc(var(--travel-px) * var(--travel-dir)), 0, 0) scaleX(1); }
    }
    @keyframes tilePop {
        0% { opacity: 0; transform: scale(0.25); }
        100% { opacity: 1; transform: scale(1); }
    }
`;

/** Faithful port of OurStoryHub ShiftingTilesSlideshow (photo path). */
export const TilesShiftingSlideshow = ({ photos, onClose }: { photos: ChurchPhoto[]; onClose: () => void }) => {
  const data = photos;
  const [rows, setRows] = useState<ATile[][]>([]);
  const [ready, setReady] = useState(false);
  const [focalContent, setFocalContent] = useState<string | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const pools = useRef({ portrait: [] as ChurchPhoto[], landscape: [] as ChurchPhoto[] });
  const portraitTemplatePool = useRef([] as ChurchPhoto[]);
  const decks = useRef({ portrait: [] as ChurchPhoto[], landscape: [] as ChurchPhoto[] });
  const portraitTemplateDeck = useRef([] as ChurchPhoto[]);
  const usedHistory = useRef<string[]>([]);
  const isAnimating = useRef(false);

  // 與 state 同步的最新佈局，供定時器回調讀取（避免閉包舊 state / StrictMode 雙執行問題）
  const rowsRef = useRef<ATile[][]>([]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // 所有動畫定時器統一登記，數據源變化/卸載時全部清掉，防止殘留回調打在新佈局上
  const timersRef = useRef<number[]>([]);
  const schedule = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);
  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    let cancelled = false;
    clearTimers();
    isAnimating.current = false;
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
  }, [data, clearTimers]);

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

    const fallbackPools = [
      activePool,
      primaryPool,
      secondaryPool,
      aspect === 'landscape' ? pools.current.landscape : pools.current.portrait,
      aspect === 'landscape' ? pools.current.portrait : pools.current.landscape,
      data,
    ];
    const uniqueFallback = fallbackPools
      .flat()
      .find((item) => item && !blocked(item) && !usedHistory.current.includes(item.src))
      || fallbackPools.flat().find((item) => item && !blocked(item));
    const nextDeck = useTemplateDeck ? portraitTemplateDeck.current : decks.current[deckKey];
    const selection = candidates[0] || uniqueFallback || nextDeck.find((item) => !batchExclusions.has(item.src)) || activePool.find((item) => !batchExclusions.has(item.src)) || data[0];
    removeFromDecks(selection, decks, portraitTemplateDeck);
    rememberUsage(selection.src);
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

  const settleRow = useCallback((r: number) => {
    setRows((prevRows) => prevRows.map((row, idx) => (idx === r ? settleRowTiles(row) : row)));
  }, []);

  const triggerSwitch = useCallback((r: number, c: number) => {
    if (isAnimating.current) return;
    const row = rowsRef.current[r];
    const tile = row?.[c];
    if (!tile || tile.type === 'ghost' || tile.status !== 'idle') return;
    isAnimating.current = true;
    if (tile.top) setFocalContent(tile.top.src);

    const marked = markTileExit(row, c);
    setRows((prevRows) => prevRows.map((cur, idx) => (idx === r ? marked : cur)));

    schedule(() => {
      // createTile 消耗牌堆 ref，必須在 updater 外只執行一次
      const newTile = createTile(tile.type as TileKind, rowsRef.current, new Set());
      newTile.status = 'pop-in';
      const replaced = replaceTileAt(rowsRef.current[r] ?? marked, c, newTile);
      setRows((prevRows) => prevRows.map((cur, idx) => (idx === r ? replaced : cur)));
      schedule(() => {
        settleRow(r);
        isAnimating.current = false;
      }, SETTLE_AFTER_HANDOFF_MS);
    }, ROW_END_POP_AT_MS);
  }, [createTile, schedule, settleRow]);

  const mutateRow = useCallback((rowIndex: number) => {
    if (isAnimating.current) return;
    const row = rowsRef.current[rowIndex];
    if (!row) return;
    const candidates = row.map((tile, idx) => (tile.type !== 'ghost' ? idx : -1)).filter((idx) => idx >= 0);
    if (candidates.length === 0) return;

    // 選目標、標記三拍——全部在 updater 外決定，updater 只做純數組替換
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const tile = row[target];
    isAnimating.current = true;
    if (tile.top) setFocalContent(tile.top.src);

    const { row: marked, shifterCount, maxDelayMs } = markRowForShift(row, target);
    setRows((prevRows) => prevRows.map((cur, idx) => (idx === rowIndex ? marked : cur)));

    schedule(() => {
      const newTile = createTile(tile.type as TileKind, rowsRef.current, new Set());
      newTile.status = 'pop-in';
      const incoming: ATile[] = newTile.type === 'wide'
        ? [newTile, createTile('ghost', rowsRef.current, new Set())]
        : [newTile];
      const next = handoffRow(rowsRef.current[rowIndex] ?? marked, target, incoming);
      setRows((prevRows) => prevRows.map((cur, idx) => (idx === rowIndex ? next : cur)));
      schedule(() => {
        settleRow(rowIndex);
        isAnimating.current = false;
      }, SETTLE_AFTER_HANDOFF_MS);
    }, handoffDelayMs(shifterCount, maxDelayMs));
  }, [createTile, schedule, settleRow]);

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
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [rows.length]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-black font-sans animate-fadeIn">
      {focalContent && (
        <div className="absolute inset-0 z-0 scale-110 transition-all duration-1000" style={{ backgroundImage: `url(${imgUrl({ src: focalContent } as ChurchPhoto, 'blog')})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) brightness(0.4)' }} />
      )}
      <style>{sharedStyles}</style>

      <div className="absolute right-6 top-6 z-[110] flex gap-4">
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
                className={`group/tile relative h-full w-full cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md ${tile.status}`}
                style={{
                  gridRow: rIdx + 1,
                  gridColumn: cIdx + 1,
                  ...(tile.type === 'wide' ? { gridColumn: `${cIdx + 1} / span 2` } : {}),
                  ['--travel-px' as string]: `${travelPx}px`,
                  ['--travel-dir' as string]: `${tile.travelDirection || -1}`,
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

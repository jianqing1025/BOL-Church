import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { ChurchPhoto } from '../../../data';
import { imgUrl, shuffle } from './util';
import { StaticTile } from './StaticTile';

type TileType = 'single' | 'double' | 'wide' | 'ghost' | 'wing' | 'wide-3';
interface TileData {
  id: string;
  type: TileType;
  top: ChurchPhoto | null;
  bottom?: ChurchPhoto | null;
  status: string;
}

const EXIT_EFFECTS = ['exit-fade-out'];

const getOnScreenUrls = (rows: TileData[][]): Set<string> => {
  const set = new Set<string>();
  rows.forEach((row) => row.forEach((tile) => {
    if (tile.top) set.add(tile.top.src);
    if (tile.bottom) set.add(tile.bottom.src);
  }));
  return set;
};

const WINGS_COORDS = [
  { r: 0, c: 0 }, // Left wing
  { r: 0, c: 2 }, // Top single
  { r: 0, c: 3 }, // Right wing
  { r: 1, c: 2 }, // Bottom single
];

/** Faithful port of OurStoryHub PhotoCinemaWingsSlideshow. */
export const CinemaWingsSlideshow = ({ photos, onClose }: { photos: ChurchPhoto[]; onClose: () => void }) => {
  const galleryData = photos;
  const [rows, setRows] = useState<TileData[][]>([]);
  const [pools, setPools] = useState({ portrait: [] as ChurchPhoto[], landscape: [] as ChurchPhoto[] });
  const portraitDeck = useRef<ChurchPhoto[]>([]);
  const landscapeDeck = useRef<ChurchPhoto[]>([]);
  const [ready, setReady] = useState(false);
  const [focalSrc, setFocalSrc] = useState<string | null>(null);
  const updateQueue = useRef<number[]>([]);

  useEffect(() => {
    let mounted = true;
    const items = [...galleryData];
    if (!items.length) return;
    const hP = items.filter((_, i) => i % 2 === 0);
    const hL = items.filter((_, i) => i % 2 !== 0);
    setPools({ portrait: hP, landscape: hL });
    portraitDeck.current = shuffle([...hP]);
    landscapeDeck.current = shuffle([...hL]);

    let loadedCount = 0;
    let readySet = false;
    const initLoad = items.slice(0, 15);
    initLoad.forEach((item) => {
      const img = new Image();
      img.src = item.src;
      const check = () => {
        if (!mounted) return;
        loadedCount++;
        if (!readySet && loadedCount >= Math.min(5, initLoad.length)) {
          setReady(true);
          setFocalSrc(items[0].src);
          readySet = true;
        }
      };
      img.onload = check;
      img.onerror = check;
    });
    return () => { mounted = false; };
  }, [galleryData]);

  const getNextImage = useCallback((t: 'portrait' | 'landscape', currentRows: TileData[][] = [], temporaryExclusions: Set<string> = new Set()): ChurchPhoto => {
    const sourcePool = t === 'portrait' ? pools.portrait : pools.landscape;
    const deckRef = t === 'portrait' ? portraitDeck : landscapeDeck;
    if (!sourcePool || sourcePool.length === 0) return galleryData[Math.floor(Math.random() * galleryData.length)];
    const onScreen = getOnScreenUrls(currentRows);
    const candidateIndex = deckRef.current.findIndex((item) => !onScreen.has(item.src) && !temporaryExclusions.has(item.src));
    if (candidateIndex !== -1) { const [selection] = deckRef.current.splice(candidateIndex, 1); return selection; }
    const isBlocked = (item: ChurchPhoto) => onScreen.has(item.src) || temporaryExclusions.has(item.src);
    const available = sourcePool.filter((item) => !isBlocked(item));
    const busy = sourcePool.filter((item) => isBlocked(item));
    deckRef.current = [...shuffle(available), ...busy];
    const [selection] = deckRef.current.splice(0, 1);
    return selection || sourcePool[Math.floor(Math.random() * sourcePool.length)];
  }, [pools, galleryData]);

  const createTile = useCallback((type: TileType = 'single', currentRows: TileData[][] = []): TileData => {
    const localExclusions = new Set<string>();
    const poolType = (type === 'wide' || type === 'wing' || type === 'double' || type === 'wide-3') ? 'landscape' : 'portrait';
    const top = type !== 'ghost' ? getNextImage(poolType, currentRows, localExclusions) : null;
    if (top) localExclusions.add(top.src);
    const bottom = type === 'double' ? getNextImage('landscape', currentRows, localExclusions) : null;
    return { id: Math.random().toString(36).slice(2, 11), type, top, bottom, status: 'idle' };
  }, [getNextImage]);

  const generateWingsGrid = useCallback(() => {
    const r0: TileData[] = [createTile('wing'), createTile('ghost'), createTile('single'), createTile('wing'), createTile('ghost')];
    const r1: TileData[] = [createTile('ghost'), createTile('ghost'), createTile('single'), createTile('ghost'), createTile('ghost')];
    return [r0, r1];
  }, [createTile]);

  const triggerSwitch = useCallback((r: number, c: number) => {
    setRows((prevRows) => {
      if (!prevRows.length) return prevRows;
      const nextRows = prevRows.map((row) => [...row]);
      if (!nextRows[r] || !nextRows[r][c]) return prevRows;
      if (nextRows[r][c].type === 'ghost') return prevRows;
      if (nextRows[r][c].status !== 'idle' && nextRows[r][c].status !== 'entering') return prevRows;
      const imgContent = nextRows[r][c].top;
      if (imgContent) setFocalSrc(imgContent.src);
      nextRows[r][c] = { ...nextRows[r][c], status: 'exit-fade-out' };
      return nextRows;
    });
    setTimeout(() => {
      setRows((prevRows) => {
        if (!prevRows.length) return prevRows;
        const nextRows = prevRows.map((row) => [...row]);
        const tileToReplace = nextRows[r][c];
        if (!EXIT_EFFECTS.includes(tileToReplace.status)) return prevRows;
        const typeNeeded = tileToReplace.type;
        const tempGrid = nextRows.map((row, rIdx) => row.map((tt, cIdx) => (rIdx === r && cIdx === c) ? { ...tt, top: null } : tt));
        const newTile = createTile(typeNeeded, tempGrid);
        newTile.status = 'entering';
        nextRows[r][c] = newTile;
        return nextRows;
      });
    }, 500);
  }, [createTile]);

  useEffect(() => { if (ready && rows.length === 0) setRows(generateWingsGrid()); }, [ready, generateWingsGrid, rows.length]);

  useEffect(() => {
    if (rows.length === 0) return;
    const processRotation = () => {
      if (updateQueue.current.length < 2) {
        const indices = [0, 1, 2, 3];
        for (let i = indices.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [indices[i], indices[j]] = [indices[j], indices[i]]; }
        updateQueue.current = indices;
      }
      const idx1 = updateQueue.current.pop();
      const idx2 = updateQueue.current.pop();
      if (idx1 !== undefined) { const c1 = WINGS_COORDS[idx1]; triggerSwitch(c1.r, c1.c); }
      if (idx2 !== undefined) { const c2 = WINGS_COORDS[idx2]; setTimeout(() => triggerSwitch(c2.r, c2.c), 200); }
    };
    const interval = setInterval(processRotation, 6000);
    return () => clearInterval(interval);
  }, [rows.length, triggerSwitch]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-black font-sans animate-fadeIn">
      {focalSrc && <div className="absolute inset-0 z-0 scale-110 transition-all duration-1000" style={{ backgroundImage: `url(${imgUrl({ src: focalSrc } as ChurchPhoto, 'blog')})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) brightness(0.3)' }} />}
      <style>{`
        .tile-transition { transition: all 0.5s cubic-bezier(0.25, 1, 0.5, 1); }
        .exit-fade-out { opacity: 0; filter: blur(5px); }
        .entering { animation: cwTileEnter 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        @keyframes cwTileEnter { 0% { opacity: 0; transform: scale(0.8) translateY(30px); filter: blur(15px); } 100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); } }
      `}</style>
      <div className="absolute right-4 top-4 z-[110] flex gap-4">
        <button onClick={onClose} className="rounded-full border border-white/20 bg-white/10 p-2 text-white shadow-xl backdrop-blur-lg transition-colors hover:bg-rose-500"><X size={24} /></button>
      </div>

      {!ready ? (
        <div className="z-10 flex flex-1 flex-col items-center justify-center">
          <Loader2 className="mb-4 animate-spin text-rose-500" size={48} />
          <div className="animate-pulse text-xl font-light tracking-widest text-white">PREPARING CINEMATIC VIEW...</div>
        </div>
      ) : (
        <div className="z-10 grid h-full w-full flex-1 grid-cols-5 grid-rows-2 gap-2 bg-transparent p-4">
          {rows.flatMap((row, rIdx) => row.map((tile, cIdx) => {
            if (tile.type === 'ghost') return null;
            const spanStyle: React.CSSProperties = tile.type === 'wing' ? { gridColumn: 'span 2', gridRow: 'span 2' } : {};
            return (
              <div
                key={tile.id}
                onClick={() => triggerSwitch(rIdx, cIdx)}
                className={`group/tile tile-transition relative h-full w-full cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md ${tile.status}`}
                style={{ gridRowStart: rIdx + 1, gridColumnStart: cIdx + 1, ...spanStyle }}
              >
                <div className="absolute inset-0 z-20 bg-gradient-to-br from-white/20 to-transparent opacity-0 transition-opacity duration-500 group-hover/tile:opacity-100" />
                {tile.type === 'double' ? (
                  <div className="flex h-full w-full flex-col gap-2">
                    <div className="relative flex-1 overflow-hidden"><StaticTile src={imgUrl(tile.top as ChurchPhoto, 'landscape')} /></div>
                    <div className="relative flex-1 overflow-hidden">{tile.bottom && <StaticTile src={imgUrl(tile.bottom, 'landscape')} />}</div>
                  </div>
                ) : (
                  <StaticTile src={imgUrl(tile.top as ChurchPhoto, 'portrait')} className="transition-transform duration-1000 group-hover/tile:scale-105" />
                )}
              </div>
            );
          }))}
        </div>
      )}
    </div>
  );
};

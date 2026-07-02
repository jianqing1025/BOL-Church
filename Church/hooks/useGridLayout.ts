import { useEffect, useState, type RefObject } from 'react';

const GAP = 12;
const ASPECT = 16 / 9;

/**
 * Returns the column count that maximises tile area for `count` equal 16:9 tiles
 * inside the referenced container — the same idea Google Meet uses to keep every
 * participant as large as possible. Recomputes on container resize.
 */
export function useGridLayout(ref: RefObject<HTMLElement>, count: number): number {
  const [cols, setCols] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el || count <= 0) { setCols(1); return; }

    const compute = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      let best = 1;
      let bestArea = 0;
      for (let c = 1; c <= count; c++) {
        const r = Math.ceil(count / c);
        let tw = (w - GAP * (c - 1)) / c;
        let th = (h - GAP * (r - 1)) / r;
        if (tw <= 0 || th <= 0) continue;
        if (tw / th > ASPECT) tw = th * ASPECT; else th = tw / ASPECT;
        const area = tw * th;
        if (area > bestArea) { bestArea = area; best = c; }
      }
      setCols(best);
    };

    compute();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(compute) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [ref, count]);

  return cols;
}

import { useEffect, useRef, useState } from 'react';

// 給 secondary navigation 用的 sticky 狀態偵測。
// 在 sticky element 「上方」放一個 1px 的 sentinel；用 IntersectionObserver +
// 動態 rootMargin（= header 高度）偵測 sentinel 是否被 header 蓋住 → sticky 已經貼合。
// 用法：const { sentinelRef, isStuck } = useStickyNavState();
//      <div ref={sentinelRef} aria-hidden className="h-px" />
//      <nav className={isStuck ? '<frosted>' : '<solid>'} style={{ top: 'var(--site-header-height, 64px)' }} />
export function useStickyNavState() {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const readHeaderHeight = (): number => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--site-header-height').trim();
      const n = parseFloat(raw);
      return Number.isFinite(n) && n > 0 ? n : 64;
    };

    let obs: IntersectionObserver | null = null;
    const attach = () => {
      if (obs) obs.disconnect();
      const h = readHeaderHeight();
      obs = new IntersectionObserver(
        entries => {
          const entry = entries[0];
          if (!entry) return;
          // sentinel 仍在 viewport 內 → 還沒滾到貼合位置
          // sentinel 被 header 蓋住（intersecting=false）→ sticky 已貼合
          setIsStuck(!entry.isIntersecting);
        },
        { rootMargin: `-${h}px 0px 0px 0px`, threshold: [0, 1] }
      );
      obs.observe(sentinel);
    };

    attach();
    const onResize = () => attach();
    window.addEventListener('resize', onResize);
    return () => {
      if (obs) obs.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return { sentinelRef, isStuck };
}

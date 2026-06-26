import { useEffect, useState } from 'react';

/** Returns true when the viewport is below the lg breakpoint (1024px). */
export function useBreakpoint(query = 1024): boolean {
  const [isCompact, setIsCompact] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < query : false
  );
  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth < query);
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, [query]);
  return isCompact;
}

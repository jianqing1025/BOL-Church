import type { ChurchPhoto } from '../../../data';

export const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Distribute photos round-robin into `cols` columns. */
export const intoColumns = (photos: ChurchPhoto[], cols: number): ChurchPhoto[][] => {
  const out: ChurchPhoto[][] = Array.from({ length: cols }, () => []);
  photos.forEach((p, i) => out[i % cols].push(p));
  return out;
};

export const photoSrc = (p: ChurchPhoto): string => p.src;

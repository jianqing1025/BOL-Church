import type { ChurchPhoto } from '../../../data';

export const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export type AspectKind = 'portrait' | 'landscape';

/** Background music used by every OurStoryHub slideshow engine. */
export const SLIDESHOW_AUDIO = 'https://res.cloudinary.com/drtve7qyt/video/upload/v1765372845/xqx_mpn0kc.ogg';

/**
 * Replacement for OurStoryHub's getOptimizedUrl. Church serves originals from
 * R2 (no Cloudinary transforms), so grid/thumbnail contexts use thumbSrc when
 * available and everything else uses the full image.
 */
export const imgUrl = (
  photo: ChurchPhoto,
  kind: 'grid' | 'portrait' | 'landscape' | 'blog' | 'masonry' | 'full' = 'full',
): string => {
  if (!photo) return '';
  if (kind === 'grid') return photo.thumbSrc || photo.src;
  return photo.src;
};

/** Aspect from stored dimensions (null when unknown — caller falls back to decoding). */
export const knownAspect = (photo: ChurchPhoto): AspectKind | null => {
  if (typeof photo.width === 'number' && typeof photo.height === 'number' && photo.width > 0 && photo.height > 0) {
    return photo.width >= photo.height ? 'landscape' : 'portrait';
  }
  return null;
};

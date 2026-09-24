import { MAX_IMAGE_EDGE } from './types';

export class ImageDecodeError extends Error {
  constructor() { super('This file is not an image the browser can open'); this.name = 'ImageDecodeError'; }
}

/**
 * The image as it will be stored: decoded once to prove it opens, and scaled
 * down when its longest side is over 3840px — a phone photo is several times
 * what a 1080p slide can show, and would only slow the slide down.
 */
export async function prepareImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new ImageDecodeError(); }
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= MAX_IMAGE_EDGE) return file;
    const scale = MAX_IMAGE_EDGE / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
    if (!blob) throw new ImageDecodeError();
    return blob;
  } finally {
    bitmap.close();
  }
}

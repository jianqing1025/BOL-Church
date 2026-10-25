import { unzipSync } from 'fflate';
import { parseXml, type XmlNode } from './xml';

/** Media a slide never draws: left in the zip, so a deck with a film does not fill memory. */
const SKIPPED_MEDIA = /\.(mp4|m4v|mov|wmv|avi|mpe?g|mkv|webm|mp3|wav|m4a|wma|aac|ogg)$/i;

export class PptxError extends Error {
  constructor(readonly reason: 'legacy' | 'invalid', message: string = reason) { super(message); this.name = 'PptxError'; }
}

export interface Relationship { id: string; type: string; target: string; external: boolean }

/** The zip of a .pptx, with its parts' XML read once and kept. */
export class PptxPackage {
  private readonly xmlCache = new Map<string, XmlNode | null>();
  private readonly relsCache = new Map<string, Map<string, Relationship>>();

  constructor(private readonly files: Record<string, Uint8Array>) {}

  static open(bytes: Uint8Array): PptxPackage {
    // An old binary .ppt is an OLE compound file, not a zip.
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) throw new PptxError('legacy');
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes, { filter: (file) => !SKIPPED_MEDIA.test(file.name) });
    } catch (error) {
      throw new PptxError('invalid', String(error));
    }
    if (!files['ppt/presentation.xml']) throw new PptxError('invalid', 'No ppt/presentation.xml');
    return new PptxPackage(files);
  }

  has(part: string): boolean { return part in this.files; }

  bytes(part: string): Uint8Array | undefined { return this.files[part]; }

  xml(part: string): XmlNode | null {
    if (!this.xmlCache.has(part)) {
      const data = this.files[part];
      let node: XmlNode | null = null;
      if (data) {
        try { node = parseXml(new TextDecoder().decode(data)); } catch { node = null; }
      }
      this.xmlCache.set(part, node);
    }
    return this.xmlCache.get(part)!;
  }

  /** The relationships of `part`, by id, with targets resolved to part names. */
  rels(part: string): Map<string, Relationship> {
    let rels = this.relsCache.get(part);
    if (rels) return rels;
    rels = new Map();
    const slash = part.lastIndexOf('/');
    const dir = part.slice(0, slash + 1);
    const doc = this.xml(`${dir}_rels/${part.slice(slash + 1)}.rels`);
    for (const rel of doc?.children ?? []) {
      if (rel.name !== 'Relationship') continue;
      const external = rel.attrs.TargetMode === 'External';
      const target = rel.attrs.Target ?? '';
      rels.set(rel.attrs.Id, {
        id: rel.attrs.Id,
        type: rel.attrs.Type ?? '',
        target: external ? target : resolvePart(dir, target),
        external,
      });
    }
    this.relsCache.set(part, rels);
    return rels;
  }

  /** The part a relationship id points to, or undefined. */
  target(part: string, relId: string | undefined): string | undefined {
    if (!relId) return undefined;
    const rel = this.rels(part).get(relId);
    return rel && !rel.external ? rel.target : undefined;
  }

  /** The first related part of a type ending in `typeSuffix` (e.g. '/slideLayout'). */
  related(part: string, typeSuffix: string): string | undefined {
    for (const rel of this.rels(part).values()) if (!rel.external && rel.type.endsWith(typeSuffix)) return rel.target;
    return undefined;
  }
}

/** `../media/image1.png` from `ppt/slides/` → `ppt/media/image1.png`. */
export function resolvePart(dir: string, target: string): string {
  const decoded = (() => { try { return decodeURI(target); } catch { return target; } })();
  const segments = decoded.startsWith('/') ? [] : dir.split('/').filter(Boolean);
  for (const segment of decoded.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return segments.join('/');
}

export function mediaType(part: string): string {
  const ext = part.slice(part.lastIndexOf('.') + 1).toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff' } as Record<string, string>)[ext] ?? 'application/octet-stream';
}

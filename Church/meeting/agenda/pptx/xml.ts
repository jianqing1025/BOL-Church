/**
 * A small XML reader for the parts of a .pptx — elements, attributes and text,
 * no DTDs. Our own so the deck reads the same in the browser, the desktop app
 * and the tests (Node has no DOMParser).
 *
 * Elements are looked up by local name: `a:solidFill`, `dsp:spPr` and a default
 * namespace all read alike, so SmartArt drawings parse with the slide's code.
 */
export interface XmlNode {
  /** Local name, without the prefix. */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Text directly inside this element (entities decoded). */
  text: string;
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITY[body] ?? whole;
  });
}

const localName = (qname: string) => qname.slice(qname.indexOf(':') + 1);
const ATTR = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export class XmlError extends Error {
  constructor(message: string) { super(message); this.name = 'XmlError'; }
}

export function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  let i = 0;
  const n = source.length;
  while (i < n) {
    const lt = source.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) stack[stack.length - 1].text += decodeEntities(source.slice(i, lt));
    if (source.startsWith('<!--', lt)) { i = source.indexOf('-->', lt) + 3; if (i < 3) break; continue; }
    if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt);
      stack[stack.length - 1].text += source.slice(lt + 9, end < 0 ? n : end);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (source[lt + 1] === '?' || source[lt + 1] === '!') { i = source.indexOf('>', lt) + 1; if (i <= 0) break; continue; }
    const gt = source.indexOf('>', lt);
    if (gt < 0) throw new XmlError('Unterminated tag');
    if (source[lt + 1] === '/') {
      if (stack.length > 1) stack.pop();
      i = gt + 1;
      continue;
    }
    const selfClosing = source[gt - 1] === '/';
    const inner = source.slice(lt + 1, selfClosing ? gt - 1 : gt);
    const space = inner.search(/[\s/]/);
    const qname = space < 0 ? inner : inner.slice(0, space);
    const attrs: Record<string, string> = {};
    if (space >= 0) {
      // `id` and `r:id` can sit on one element: a plain name keeps its own
      // place; a prefixed one fills a free local name and keeps its full name.
      const prefixed: [string, string][] = [];
      for (const m of inner.slice(space).matchAll(ATTR)) {
        const value = decodeEntities(m[3] ?? m[4] ?? '');
        if (m[1].includes(':')) { attrs[m[1]] = value; prefixed.push([localName(m[1]), value]); }
        else attrs[m[1]] = value;
      }
      for (const [local, value] of prefixed) if (!(local in attrs)) attrs[local] = value;
    }
    const node: XmlNode = { name: localName(qname), attrs, children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
    i = gt + 1;
  }
  const top = root.children[0];
  if (!top) throw new XmlError('Empty document');
  return top;
}

/** The first direct child called `name`. */
export const child = (node: XmlNode | undefined, name: string): XmlNode | undefined => node?.children.find((c) => c.name === name);

/** Follows a path of direct children: `path(sp, 'spPr', 'xfrm', 'off')`. */
export function path(node: XmlNode | undefined, ...names: string[]): XmlNode | undefined {
  let at = node;
  for (const name of names) at = child(at, name);
  return at;
}

export const children = (node: XmlNode | undefined, name?: string): XmlNode[] =>
  node ? (name ? node.children.filter((c) => c.name === name) : node.children) : [];

/** Every descendant called `name`, in document order. */
export function descendants(node: XmlNode | undefined, name: string, out: XmlNode[] = []): XmlNode[] {
  if (!node) return out;
  for (const c of node.children) {
    if (c.name === name) out.push(c);
    descendants(c, name, out);
  }
  return out;
}

/** A relationship-id attribute (`r:id`, `r:embed` …), whatever its prefix. */
export function relAttr(node: XmlNode | undefined, local: string): string | undefined {
  if (!node) return undefined;
  const key = Object.keys(node.attrs).find((k) => k.endsWith(`:${local}`) && !k.startsWith('xmlns'));
  return key ? node.attrs[key] : undefined;
}

export function num(node: XmlNode | undefined, attr: string): number | undefined;
export function num(node: XmlNode | undefined, attr: string, fallback: number): number;
export function num(node: XmlNode | undefined, attr: string, fallback?: number): number | undefined {
  const raw = node?.attrs[attr];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** OOXML booleans: "1"/"true" or "0"/"false"; undefined when absent. */
export function bool(node: XmlNode | undefined, attr: string): boolean | undefined {
  const raw = node?.attrs[attr];
  if (raw === undefined) return undefined;
  return raw === '1' || raw === 'true';
}

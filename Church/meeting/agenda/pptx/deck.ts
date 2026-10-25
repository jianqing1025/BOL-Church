import { slideSteps } from './animation';
import { readColor } from './color';
import {
  fillElement, readFill, readGeometry, readLine, readShapeFill, readStyleFill, readTheme, readXfrm, type PartContext, type Theme,
} from './fills';
import type { Deck, Fill, GroupElement, Line, PictureElement, ShapeElement, Slide, SlideElement, TableCell, TableElement, Xfrm } from './model';
import { PptxError, PptxPackage } from './pptxPackage';
import { readTextBody, type RunProps } from './text';
import { bool, child, children, descendants, num, path, relAttr, type XmlNode } from './xml';

const PRESENTATION = 'ppt/presentation.xml';

interface Placeholder { type: string; idx?: string; node: XmlNode; part: string }

/** The slide's master and layout, as a slide's placeholders inherit from them. */
interface Inheritance {
  layout: Placeholder[];
  master: Placeholder[];
  textStyles: { title?: XmlNode; body?: XmlNode; other?: XmlNode };
}

interface Env {
  ctx: PartContext;
  idPrefix: string;
  /** Present for a slide's own shapes; masters and layouts draw only their non-placeholder shapes. */
  inherit?: Inheritance;
  defaultTextStyle?: XmlNode;
}

const nvOf = (el: XmlNode) => el.children.find((c) => c.name.startsWith('nv'));
const placeholderOf = (el: XmlNode) => path(nvOf(el), 'nvPr', 'ph');
const normalType = (type: string) => (type === 'ctrTitle' ? 'title' : type === 'subTitle' || type === 'obj' ? 'body' : type);

function collectPlaceholders(root: XmlNode | null, part: string): Placeholder[] {
  const out: Placeholder[] = [];
  const walk = (tree: XmlNode | undefined) => {
    for (const el of children(tree)) {
      if (el.name === 'grpSp') { walk(el); continue; }
      const ph = placeholderOf(el);
      if (ph) out.push({ type: ph.attrs.type ?? 'obj', idx: ph.attrs.idx, node: el, part });
    }
  };
  walk(path(root ?? undefined, 'cSld', 'spTree'));
  return out;
}

function matchLayout(ph: XmlNode, list: Placeholder[]): Placeholder | undefined {
  const type = ph.attrs.type ?? 'obj';
  if (ph.attrs.idx !== undefined) {
    const byIdx = list.find((p) => p.idx === ph.attrs.idx);
    if (byIdx) return byIdx;
  }
  return list.find((p) => p.type === type) ?? list.find((p) => normalType(p.type) === normalType(type));
}

function matchMaster(ph: XmlNode, list: Placeholder[]): Placeholder | undefined {
  const type = normalType(ph.attrs.type ?? 'obj');
  return list.find((p) => normalType(p.type) === type);
}

function textCategory(type: string): 'title' | 'body' | 'other' {
  const t = normalType(type);
  return t === 'title' ? 'title' : t === 'body' ? 'body' : 'other';
}

const shapeProps = (el: XmlNode | undefined) => (el ? child(el, 'spPr') : undefined);

function readShape(sp: XmlNode, env: Env): ShapeElement | null {
  const cNvPr = child(nvOf(sp), 'cNvPr');
  if (bool(cNvPr, 'hidden')) return null;
  const { ctx } = env;
  const ph = placeholderOf(sp);
  if (ph && !env.inherit) return null;
  const layout = ph && env.inherit ? matchLayout(ph, env.inherit.layout) : undefined;
  const master = ph && env.inherit ? matchMaster(ph, env.inherit.master) : undefined;
  const spPr = child(sp, 'spPr');
  const xfrm = readXfrm(child(spPr, 'xfrm')) ?? readXfrm(child(shapeProps(layout?.node), 'xfrm')) ?? readXfrm(child(shapeProps(master?.node), 'xfrm'));
  if (!xfrm) return null;
  const style = child(sp, 'style');

  const geometry = child(spPr, 'prstGeom') || child(spPr, 'custGeom') ? readGeometry(spPr)
    : readGeometry(shapeProps(layout?.node) ?? shapeProps(master?.node));

  // A placeholder's fill and outline may come from its layout or master.
  let fill: Fill | null;
  const ownFill = fillElement(spPr);
  if (ownFill) fill = readFill(ownFill, ctx) ?? null;
  else {
    const inheritedFrom = [layout, master].find((p) => fillElement(shapeProps(p?.node)));
    fill = inheritedFrom
      ? readFill(fillElement(shapeProps(inheritedFrom.node)), { ...ctx, part: inheritedFrom.part }) ?? null
      : readStyleFill(child(style, 'fillRef'), ctx) ?? null;
  }
  const ln = child(spPr, 'ln') ?? child(shapeProps(layout?.node), 'ln') ?? child(shapeProps(master?.node), 'ln');
  const line = readLine(ln, child(style, 'lnRef'), ctx);

  const category = ph ? textCategory(ph.attrs.type ?? 'obj') : null;
  const txBodyOf = (p?: Placeholder) => (p ? child(p.node, 'txBody') : undefined);
  const text = readTextBody(child(sp, 'txBody'), {
    listStyles: category && env.inherit
      ? [env.defaultTextStyle, env.inherit.textStyles[category], child(txBodyOf(master), 'lstStyle'), child(txBodyOf(layout), 'lstStyle')]
      : [env.defaultTextStyle],
    bodyProps: [child(txBodyOf(master), 'bodyPr'), child(txBodyOf(layout), 'bodyPr')],
    fontRef: child(style, 'fontRef'),
  }, ctx);

  return {
    type: 'shape',
    id: env.idPrefix + (cNvPr?.attrs.id ?? ''),
    xfrm,
    geometry,
    fill,
    line,
    text,
    textXfrm: readXfrm(child(sp, 'txXfrm')),
  };
}

function readPicture(pic: XmlNode, env: Env, frame?: Xfrm, id?: string): PictureElement | null {
  const cNvPr = child(nvOf(pic), 'cNvPr');
  if (bool(cNvPr, 'hidden')) return null;
  const ph = placeholderOf(pic);
  const layout = ph && env.inherit ? matchLayout(ph, env.inherit.layout) : undefined;
  const master = ph && env.inherit ? matchMaster(ph, env.inherit.master) : undefined;
  const spPr = child(pic, 'spPr');
  const xfrm = frame ?? readXfrm(child(spPr, 'xfrm')) ?? readXfrm(child(shapeProps(layout?.node), 'xfrm')) ?? readXfrm(child(shapeProps(master?.node), 'xfrm'));
  if (!xfrm) return null;
  const blipFill = child(pic, 'blipFill');
  const blip = child(blipFill, 'blip');
  const src = child(blipFill, 'srcRect');
  const alphaMod = child(blip, 'alphaModFix');
  return {
    type: 'picture',
    id: id ?? env.idPrefix + (cNvPr?.attrs.id ?? ''),
    xfrm,
    part: env.ctx.pkg.target(env.ctx.part, relAttr(blip, 'embed')) ?? null,
    crop: { l: num(src, 'l', 0) / 100000, t: num(src, 't', 0) / 100000, r: num(src, 'r', 0) / 100000, b: num(src, 'b', 0) / 100000 },
    alpha: alphaMod ? num(alphaMod, 'amt', 100000) / 100000 : 1,
    geometry: readGeometry(spPr),
    line: readLine(child(spPr, 'ln'), child(child(pic, 'style'), 'lnRef'), env.ctx),
  };
}

function readGroup(grp: XmlNode, env: Env): GroupElement | null {
  const cNvPr = child(nvOf(grp), 'cNvPr');
  if (bool(cNvPr, 'hidden')) return null;
  const grpSpPr = child(grp, 'grpSpPr');
  const xfrmNode = child(grpSpPr, 'xfrm');
  const xfrm = readXfrm(xfrmNode);
  if (!xfrm) return null;
  const chOff = child(xfrmNode, 'chOff');
  const chExt = child(xfrmNode, 'chExt');
  const groupFill = readFill(fillElement(grpSpPr), env.ctx);
  return {
    type: 'group',
    id: env.idPrefix + (cNvPr?.attrs.id ?? ''),
    xfrm,
    childOffset: { x: num(chOff, 'x', xfrm.x), y: num(chOff, 'y', xfrm.y) },
    childExtent: { w: num(chExt, 'cx', xfrm.w) || xfrm.w, h: num(chExt, 'cy', xfrm.h) || xfrm.h },
    children: readElements(grp, { ...env, ctx: { ...env.ctx, groupFill: groupFill === undefined ? env.ctx.groupFill : groupFill } }),
  };
}

const onOff = (v: string | undefined) => (v === undefined ? undefined : v === 'on' || v === '1' || v === 'true');

/** One part of a table style (`a:wholeTbl`, `a:firstRow` …). */
interface TablePart { fill?: Fill | null; borders: Partial<Record<'left' | 'right' | 'top' | 'bottom' | 'insideH' | 'insideV', Line | null>>; text: RunProps }

function readTablePart(node: XmlNode | undefined, ctx: PartContext): TablePart | undefined {
  if (!node) return undefined;
  const tcStyle = child(node, 'tcStyle');
  const fillNode = child(tcStyle, 'fill');
  const fill = fillNode ? readFill(fillElement(fillNode), ctx) : child(tcStyle, 'fillRef') ? readStyleFill(child(tcStyle, 'fillRef'), ctx) : undefined;
  const borders: TablePart['borders'] = {};
  for (const side of children(child(tcStyle, 'tcBdr'))) {
    const ln = child(side, 'ln');
    const ref = child(side, 'lnRef');
    if (ln || ref) borders[side.name as keyof TablePart['borders']] = readLine(ln, ref, ctx);
  }
  const tx = child(node, 'tcTxStyle');
  const text: RunProps = {};
  if (tx) {
    const bold = onOff(tx.attrs.b);
    if (bold !== undefined) text.bold = bold;
    const color = readColor(tx, ctx.colors);
    if (color) text.color = color;
  }
  return { fill, borders, text };
}

function readTable(frame: XmlNode, tbl: XmlNode, xfrm: Xfrm, env: Env): TableElement {
  const { ctx } = env;
  const tblPr = child(tbl, 'tblPr');
  const styleId = child(tblPr, 'tableStyleId')?.text.trim();
  const styleNode = styleId ? children(ctx.pkg.xml('ppt/tableStyles.xml') ?? undefined, 'tblStyle').find((s) => s.attrs.styleId === styleId) : undefined;
  const part = (name: string) => readTablePart(child(styleNode, name), ctx);
  const whole = part('wholeTbl');
  const flags = { firstRow: bool(tblPr, 'firstRow'), lastRow: bool(tblPr, 'lastRow'), firstCol: bool(tblPr, 'firstCol'), lastCol: bool(tblPr, 'lastCol'), bandRow: bool(tblPr, 'bandRow'), bandCol: bool(tblPr, 'bandCol') };
  const tableFill = readFill(fillElement(tblPr), ctx);

  const columns = children(child(tbl, 'tblGrid'), 'gridCol').map((c) => num(c, 'w', 0));
  const rowNodes = children(tbl, 'tr');
  const rows = rowNodes.map((tr, r) => {
    const cells: TableCell[] = children(tr, 'tc').map((tc, c) => {
      const parts: (TablePart | undefined)[] = [whole];
      const bodyRow = flags.firstRow ? r - 1 : r;
      if (flags.bandRow && bodyRow >= 0 && !(flags.lastRow && r === rowNodes.length - 1)) parts.push(part(bodyRow % 2 === 0 ? 'band1H' : 'band2H'));
      if (flags.bandCol) parts.push(part((flags.firstCol ? c - 1 : c) % 2 === 0 ? 'band1V' : 'band2V'));
      if (flags.firstCol && c === 0) parts.push(part('firstCol'));
      if (flags.lastCol && c === columns.length - 1) parts.push(part('lastCol'));
      if (flags.firstRow && r === 0) parts.push(part('firstRow'));
      if (flags.lastRow && r === rowNodes.length - 1) parts.push(part('lastRow'));

      let fill: Fill | null = tableFill ?? null;
      const borders: TableCell['borders'] = { l: null, r: null, t: null, b: null };
      let text: RunProps = {};
      for (const p of parts) {
        if (!p) continue;
        if (p.fill !== undefined) fill = p.fill;
        const b = p.borders;
        if (b.left !== undefined && c === 0) borders.l = b.left;
        if (b.right !== undefined && c === columns.length - 1) borders.r = b.right;
        if (b.top !== undefined && r === 0) borders.t = b.top;
        if (b.bottom !== undefined && r === rowNodes.length - 1) borders.b = b.bottom;
        if (b.insideV !== undefined) { if (c > 0) borders.l = b.insideV; if (c < columns.length - 1) borders.r = b.insideV; }
        if (b.insideH !== undefined) { if (r > 0) borders.t = b.insideH; if (r < rowNodes.length - 1) borders.b = b.insideH; }
        // A part's own outer edges apply where it borders the table.
        if (p !== whole) {
          if (b.left !== undefined) borders.l = b.left;
          if (b.right !== undefined) borders.r = b.right;
          if (b.top !== undefined) borders.t = b.top;
          if (b.bottom !== undefined) borders.b = b.bottom;
        }
        text = { ...text, ...p.text };
      }

      const tcPr = child(tc, 'tcPr');
      const ownFill = fillElement(tcPr);
      if (ownFill) fill = readFill(ownFill, ctx) ?? null;
      for (const [side, name] of [['l', 'lnL'], ['r', 'lnR'], ['t', 'lnT'], ['b', 'lnB']] as const) {
        const ln = child(tcPr, name);
        if (ln) borders[side] = readLine(ln, undefined, ctx);
      }
      const bodyPr: XmlNode = {
        name: 'bodyPr', children: [], text: '',
        attrs: {
          lIns: tcPr?.attrs.marL ?? '91440', rIns: tcPr?.attrs.marR ?? '91440', tIns: tcPr?.attrs.marT ?? '45720', bIns: tcPr?.attrs.marB ?? '45720',
          anchor: tcPr?.attrs.anchor ?? 't',
        },
      };
      return {
        text: readTextBody(child(tc, 'txBody'), { listStyles: [env.defaultTextStyle], bodyProps: [bodyPr], runDefaults: text }, ctx),
        fill,
        borders,
        gridSpan: num(tc, 'gridSpan', 1),
        rowSpan: num(tc, 'rowSpan', 1),
        merged: bool(tc, 'hMerge') === true || bool(tc, 'vMerge') === true,
      };
    });
    return { h: num(tr, 'h', 0), cells };
  });
  return { type: 'table', id: env.idPrefix + (child(nvOf(frame), 'cNvPr')?.attrs.id ?? ''), xfrm, columns, rows };
}

function readGraphicFrame(frame: XmlNode, env: Env): SlideElement | null {
  const cNvPr = child(nvOf(frame), 'cNvPr');
  if (bool(cNvPr, 'hidden')) return null;
  const xfrm = readXfrm(child(frame, 'xfrm'));
  if (!xfrm) return null;
  const id = env.idPrefix + (cNvPr?.attrs.id ?? '');
  const data = path(frame, 'graphic', 'graphicData');
  const tbl = child(data, 'tbl');
  if (tbl) return readTable(frame, tbl, xfrm, env);

  // SmartArt keeps a drawn copy of itself: its shapes, placed in the frame.
  const relIds = child(data, 'relIds');
  if (relIds) {
    const { pkg, part } = env.ctx;
    const dataPart = pkg.target(part, relAttr(relIds, 'dm'));
    const ext = descendants(dataPart ? pkg.xml(dataPart) ?? undefined : undefined, 'dataModelExt')[0];
    const drawingPart = pkg.target(part, ext?.attrs.relId)
      ?? [...pkg.rels(part).values()].find((r) => r.type.endsWith('/diagramDrawing'))?.target;
    const drawing = drawingPart ? pkg.xml(drawingPart) : null;
    if (!drawing || !drawingPart) return null;
    return {
      type: 'group', id, xfrm,
      childOffset: { x: 0, y: 0 },
      childExtent: { w: xfrm.w, h: xfrm.h },
      children: readElements(child(drawing, 'spTree'), { ...env, ctx: { ...env.ctx, part: drawingPart }, idPrefix: `${id}/`, inherit: undefined }),
    };
  }

  // An embedded object (an Excel sheet, say) shows the picture Office saved of it.
  const pic = descendants(data, 'pic')[0];
  if (pic) return readPicture(pic, env, xfrm, id);
  return null;
}

/** Drawable elements among `tree`'s children, back to front. */
function readElements(tree: XmlNode | undefined, env: Env): SlideElement[] {
  const out: SlideElement[] = [];
  for (const el of children(tree)) {
    let read: SlideElement | null = null;
    switch (el.name) {
      case 'sp': case 'cxnSp': read = readShape(el, env); break;
      case 'pic': read = readPicture(el, env); break;
      case 'grpSp': read = readGroup(el, env); break;
      case 'graphicFrame': read = readGraphicFrame(el, env); break;
      case 'AlternateContent': {
        // The fallback is what any reader can show — usually a picture.
        const pick = child(el, 'Fallback') ?? child(el, 'Choice');
        out.push(...readElements(pick, env));
        break;
      }
      default: break;
    }
    if (read) out.push(read);
  }
  return out;
}

function readColorMap(node: XmlNode | undefined): Record<string, string> | undefined {
  if (!node) return undefined;
  const { ...attrs } = node.attrs;
  return Object.keys(attrs).length ? attrs : undefined;
}

function readBackground(root: XmlNode | null, ctx: PartContext): Fill | null | undefined {
  const bg = path(root ?? undefined, 'cSld', 'bg');
  if (!bg) return undefined;
  const bgPr = child(bg, 'bgPr');
  if (bgPr) return readFill(fillElement(bgPr), ctx);
  const bgRef = child(bg, 'bgRef');
  return bgRef ? readStyleFill(bgRef, ctx) : undefined;
}

export function readDeck(pkg: PptxPackage): Deck {
  const pres = pkg.xml(PRESENTATION);
  if (!pres) throw new PptxError('invalid', 'Unreadable presentation.xml');
  const size = child(pres, 'sldSz');
  const width = num(size, 'cx', 12192000);
  const height = num(size, 'cy', 6858000);
  const defaultTextStyle = child(pres, 'defaultTextStyle');
  const themes = new Map<string, Theme>();
  const themeOf = (masterPart: string) => {
    const part = pkg.related(masterPart, '/theme') ?? '';
    if (!themes.has(part)) themes.set(part, readTheme(pkg.xml(part)));
    return themes.get(part)!;
  };

  const slides: Slide[] = [];
  children(child(pres, 'sldIdLst'), 'sldId').forEach((sldId, index) => {
    const slidePart = pkg.target(PRESENTATION, relAttr(sldId, 'id'));
    const slide = slidePart ? pkg.xml(slidePart) : null;
    if (!slidePart || !slide || slide.attrs.show === '0' || slide.attrs.show === 'false') return;
    const layoutPart = pkg.related(slidePart, '/slideLayout');
    const layout = layoutPart ? pkg.xml(layoutPart) : null;
    const masterPart = layoutPart ? pkg.related(layoutPart, '/slideMaster') : undefined;
    const master = masterPart ? pkg.xml(masterPart) : null;
    const theme = masterPart ? themeOf(masterPart) : readTheme(null);

    const masterMap = readColorMap(child(master ?? undefined, 'clrMap')) ?? {};
    const override = (root: XmlNode | null) => readColorMap(path(root ?? undefined, 'clrMapOvr', 'overrideClrMapping'));
    const colors = { scheme: theme.scheme, map: override(slide) ?? override(layout) ?? masterMap };
    const ctxFor = (part: string): PartContext => ({ pkg, part, colors, theme });

    const txStyles = child(master ?? undefined, 'txStyles');
    const inherit: Inheritance = {
      layout: layoutPart ? collectPlaceholders(layout, layoutPart) : [],
      master: masterPart ? collectPlaceholders(master, masterPart) : [],
      textStyles: { title: child(txStyles, 'titleStyle'), body: child(txStyles, 'bodyStyle'), other: child(txStyles, 'otherStyle') },
    };

    const elements: SlideElement[] = [];
    const showMaster = (root: XmlNode | null) => root?.attrs.showMasterSp !== '0' && root?.attrs.showMasterSp !== 'false';
    if (showMaster(slide)) {
      if (master && masterPart && showMaster(layout)) {
        elements.push(...readElements(path(master, 'cSld', 'spTree'), { ctx: ctxFor(masterPart), idPrefix: 'm:', defaultTextStyle }));
      }
      if (layout && layoutPart) {
        elements.push(...readElements(path(layout, 'cSld', 'spTree'), { ctx: ctxFor(layoutPart), idPrefix: 'l:', defaultTextStyle }));
      }
    }
    elements.push(...readElements(path(slide, 'cSld', 'spTree'), { ctx: ctxFor(slidePart), idPrefix: '', inherit, defaultTextStyle }));

    let background = readBackground(slide, ctxFor(slidePart));
    if (background === undefined && layoutPart) background = readBackground(layout, ctxFor(layoutPart));
    if (background === undefined && masterPart) background = readBackground(master, ctxFor(masterPart));

    slides.push({ number: index + 1, background: background ?? null, elements, steps: slideSteps(slide) });
  });
  return { width, height, slides };
}

/** Opens a .pptx's bytes as a deck; throws PptxError when it is not one. */
export function openDeck(bytes: Uint8Array): { deck: Deck; pkg: PptxPackage } {
  const pkg = PptxPackage.open(bytes);
  try {
    return { deck: readDeck(pkg), pkg };
  } catch (error) {
    if (error instanceof PptxError) throw error;
    throw new PptxError('invalid', String(error));
  }
}

import type { Rgba } from './color';

/**
 * A deck as the renderer needs it: every inherited style already resolved, so
 * drawing never looks back at layouts, masters or themes. Lengths are EMU
 * (914400 per inch) unless named otherwise; font sizes are points.
 */

export interface Xfrm { x: number; y: number; w: number; h: number; /** Degrees, clockwise. */ rot: number; flipH: boolean; flipV: boolean }

/** Fractions (0–1) cut from each side of a picture. */
export interface Crop { l: number; t: number; r: number; b: number }

export type Fill =
  | { kind: 'solid'; color: Rgba }
  | { kind: 'gradient'; stops: { pos: number; color: Rgba }[]; /** Degrees, 0 = left → right. */ angle: number; radial: boolean }
  | { kind: 'image'; part: string; crop: Crop; tile: boolean; alpha: number };

export interface Line {
  width: number;
  color: Rgba;
  dash: 'solid' | 'dash' | 'dot' | 'dashDot';
  headEnd: boolean;
  tailEnd: boolean;
}

export type PathCommand =
  | { op: 'M' | 'L'; x: number; y: number }
  | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: 'Q'; x1: number; y1: number; x: number; y: number }
  | { op: 'A'; wR: number; hR: number; stAng: number; swAng: number }
  | { op: 'Z' };

export interface CustomPath { w: number; h: number; fill: boolean; stroke: boolean; commands: PathCommand[] }

export type Geometry =
  | { kind: 'preset'; name: string; adj: Record<string, number> }
  | { kind: 'custom'; paths: CustomPath[] };

export interface Run {
  text: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: Rgba;
  /** A CSS font-family list. */
  font: string;
  /** Percent of the font size; positive raises (superscript). */
  baseline: number;
  caps: boolean;
}

export interface Spacing { pct?: number; pts?: number }

export interface Bullet { text: string; font?: string; color?: Rgba; sizePct: number }

export interface Paragraph {
  align: 'l' | 'ctr' | 'r' | 'just' | 'dist';
  level: number;
  marL: number;
  indent: number;
  lineSpacing: Spacing;
  spaceBefore: Spacing;
  spaceAfter: Spacing;
  bullet: Bullet | null;
  /** A run whose text is '\n' is a line break. */
  runs: Run[];
  /** Size of an empty paragraph's line. */
  endSize: number;
}

export interface TextBody {
  anchor: 't' | 'ctr' | 'b';
  anchorCtr: boolean;
  insets: { l: number; t: number; r: number; b: number };
  wrap: boolean;
  /** normAutofit: fonts scaled by this, line spacing reduced by `lineReduction`. */
  fontScale: number;
  lineReduction: number;
  paragraphs: Paragraph[];
}

interface ElementBase {
  /** cNvPr id on the slide; masters' and layouts' ids are prefixed so they never collide. */
  id: string;
  xfrm: Xfrm;
}

export interface ShapeElement extends ElementBase {
  type: 'shape';
  geometry: Geometry;
  fill: Fill | null;
  line: Line | null;
  text: TextBody | null;
  /** SmartArt sets the text apart from the shape. */
  textXfrm?: Xfrm;
}

export interface PictureElement extends ElementBase {
  type: 'picture';
  part: string | null;
  crop: Crop;
  alpha: number;
  geometry: Geometry;
  line: Line | null;
}

export interface GroupElement extends ElementBase {
  type: 'group';
  childOffset: { x: number; y: number };
  childExtent: { w: number; h: number };
  children: SlideElement[];
}

export interface TableCell {
  text: TextBody | null;
  fill: Fill | null;
  borders: { l: Line | null; r: Line | null; t: Line | null; b: Line | null };
  gridSpan: number;
  rowSpan: number;
  /** Covered by a merged neighbour; not drawn. */
  merged: boolean;
}

export interface TableElement extends ElementBase {
  type: 'table';
  columns: number[];
  rows: { h: number; cells: TableCell[] }[];
}

export type SlideElement = ShapeElement | PictureElement | GroupElement | TableElement;

/** What one click of the slide leaves showing: everything except these. */
export interface SlideStep {
  hidden: ReadonlySet<string>;
  /** Paragraphs hidden within a shape's text, by shape id. */
  hiddenParagraphs: ReadonlyMap<string, ReadonlySet<number>>;
}

export interface Slide {
  /** 1-based number in the original deck, hidden slides counted. */
  number: number;
  background: Fill | null;
  elements: SlideElement[];
  /** steps[0] is the slide as it opens; each further one is a click. */
  steps: SlideStep[];
}

export interface Deck {
  width: number;
  height: number;
  slides: Slide[];
}

/** One right-arrow press: a slide, at one of its clicks. */
export interface DeckPage { slide: number; step: number }

export function deckPages(deck: Deck): DeckPage[] {
  return deck.slides.flatMap((slide, i) => slide.steps.map((_, step) => ({ slide: i, step })));
}

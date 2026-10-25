import { describe, expect, it } from 'vitest';
import { readColor } from './color';
import { openDeck } from './deck';
import { deckPages, type ShapeElement, type TableElement } from './model';
import { PptxError, resolvePart } from './pptxPackage';
import { buildPptx, clickGroup, para, shape, slideXml, timing } from './pptxFixture';
import { formatAutoNumber } from './text';
import { parseXml, relAttr } from './xml';

const hex = (c: { r: number; g: number; b: number }) => [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const shapeById = (els: readonly { id: string }[], id: string) => els.find((e) => e.id === id) as ShapeElement;

describe('parseXml', () => {
  it('keeps a plain id and a relationship id apart, and decodes entities', () => {
    const node = parseXml('<p:sldId id="256" r:id="rId2"><a:t>A &amp; B &#x795E;</a:t></p:sldId>');
    expect(node.name).toBe('sldId');
    expect(node.attrs.id).toBe('256');
    expect(relAttr(node, 'id')).toBe('rId2');
    expect(node.children[0].text).toBe('A & B 神');
  });

  it('reads self-closing tags, comments and CDATA', () => {
    const node = parseXml('<?xml version="1.0"?><root><!-- note --><a x=\'1\'/><b><![CDATA[<raw>]]></b></root>');
    expect(node.children.map((c) => c.name)).toEqual(['a', 'b']);
    expect(node.children[0].attrs.x).toBe('1');
    expect(node.children[1].text).toBe('<raw>');
  });
});

it('resolves relationship targets against the part folder', () => {
  expect(resolvePart('ppt/slides/', '../media/image1.png')).toBe('ppt/media/image1.png');
  expect(resolvePart('ppt/slides/', '/ppt/media/a%20b.png')).toBe('ppt/media/a b.png');
});

it('applies color modifiers through the color map', () => {
  const ctx = { scheme: { lt1: 'FFFFFF', dk1: '000000', accent1: '4F81BD' }, map: { tx1: 'dk1', bg1: 'lt1' } };
  expect(hex(readColor(parseXml('<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>'), ctx)!)).toBe('000000');
  // 4F81BD at 50% luminance is Office's "darker 50%", #243F60, give or take rounding.
  const dark = readColor(parseXml('<a:solidFill><a:schemeClr val="accent1"><a:lumMod val="50000"/></a:schemeClr></a:solidFill>'), ctx)!;
  for (const [got, want] of [[dark.r, 0x24], [dark.g, 0x3f], [dark.b, 0x60]]) expect(Math.abs(got - want)).toBeLessThanOrEqual(1.5);
  const half = readColor(parseXml('<a:solidFill><a:srgbClr val="FF0000"><a:alpha val="50000"/></a:srgbClr></a:solidFill>'), ctx)!;
  expect(half.a).toBeCloseTo(0.5);
});

it('numbers paragraphs in PowerPoint’s schemes', () => {
  expect(formatAutoNumber('arabicPeriod', 3)).toBe('3.');
  expect(formatAutoNumber('alphaLcParenR', 2)).toBe('b)');
  expect(formatAutoNumber('romanUcPeriod', 4)).toBe('IV.');
  expect(formatAutoNumber('ea1ChtPeriod', 12)).toBe('十二、');
  expect(formatAutoNumber('circleNumDbPlain', 2)).toBe('②');
});

describe('openDeck', () => {
  it('refuses an old .ppt and a file that is not a deck', () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(() => openDeck(ole)).toThrowError(PptxError);
    try { openDeck(ole); } catch (e) { expect((e as PptxError).reason).toBe('legacy'); }
    expect(() => openDeck(new Uint8Array([1, 2, 3]))).toThrowError(PptxError);
  });

  it('inherits a placeholder’s place from the master and its style through the layout', () => {
    const bytes = buildPptx([{ xml: slideXml(shape(2, { ph: '<p:ph type="title"/>', paragraphs: para('神愛世人') })) }]);
    const { deck } = openDeck(bytes);
    expect(deck.slides).toHaveLength(1);
    const title = shapeById(deck.slides[0].elements, '2');
    expect(title.xfrm).toMatchObject({ x: 838200, y: 365125, w: 10515600, h: 1325563 });
    const run = title.text!.paragraphs[0].runs[0];
    expect(run.text).toBe('神愛世人');
    expect(run.size).toBe(44);
    // Layout's accent2 overrides the master's tx1.
    expect(hex(run.color)).toBe('C0504D');
    // The theme's heading face, with its Chinese face and the slide fallback.
    expect(run.font).toContain('"Calibri Light"');
    expect(run.font).toContain('"微軟正黑體"');
    expect(run.font).toContain('"Microsoft JhengHei"');
    expect(title.text!.anchor).toBe('ctr');
  });

  it('gives body placeholders the master’s bullets and the layout’s place, matched by idx', () => {
    const bytes = buildPptx([{
      xml: slideXml(shape(3, { ph: '<p:ph idx="1"/>', paragraphs: para('第一點') + para('細節', '<a:pPr lvl="1"/>') + '<a:p><a:endParaRPr sz="2000"/></a:p>' })),
    }]);
    const body = shapeById(openDeck(bytes).deck.slides[0].elements, '3');
    expect(body.xfrm).toMatchObject({ x: 1000000, y: 2000000 });
    const [first, second, empty] = body.text!.paragraphs;
    expect(first.bullet?.text).toBe('•');
    expect(first.marL).toBe(228600);
    expect(first.lineSpacing.pct).toBeCloseTo(0.9);
    expect(first.runs[0].size).toBe(28);
    expect(second.bullet?.text).toBe('–');
    expect(second.runs[0].size).toBe(24);
    // An empty paragraph shows no bullet.
    expect(empty.bullet).toBeNull();
    expect(empty.endSize).toBe(20);
  });

  it('numbers consecutive paragraphs and restarts after an unnumbered one', () => {
    const num = '<a:pPr marL="342900" indent="-342900"><a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/></a:pPr>';
    const bytes = buildPptx([{
      xml: slideXml(shape(3, { ph: '<p:ph idx="1"/>', paragraphs: para('一', num) + para('二', num) + para('間隔', '<a:pPr><a:buNone/></a:pPr>') + para('三', num) })),
    }]);
    const paragraphs = shapeById(openDeck(bytes).deck.slides[0].elements, '3').text!.paragraphs;
    expect(paragraphs.map((p) => p.bullet?.text ?? null)).toEqual(['1.', '2.', null, '1.']);
  });

  it('draws the master’s own shapes behind the slide, and skips hidden slides', () => {
    const bytes = buildPptx([
      { xml: slideXml('') },
      { xml: slideXml(shape(4, { xfrm: [0, 0, 100, 100], paragraphs: para('hidden') }), '', 'show="0"') },
      { xml: slideXml('', '', 'showMasterSp="0"') },
    ]);
    const { deck } = openDeck(bytes);
    expect(deck.slides.map((s) => s.number)).toEqual([1, 3]);
    const bar = deck.slides[0].elements.find((e) => e.id === 'm:9') as ShapeElement;
    expect(bar.fill).toMatchObject({ kind: 'solid' });
    expect(hex((bar.fill as { color: { r: number; g: number; b: number } }).color)).toBe('4F81BD');
    // Placeholders of the master are prompts, never drawn.
    expect(deck.slides[0].elements.some((e) => e.id === 'm:2')).toBe(false);
    expect(deck.slides[1].elements).toEqual([]);
    // The master's background style, in bg1.
    expect(deck.slides[0].background).toMatchObject({ kind: 'solid', color: { r: 255, g: 255, b: 255 } });
  });

  it('reads a solid background and a picture on the slide', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const pic = '<p:pic><p:nvPicPr><p:cNvPr id="5" name="Picture"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImg1"/><a:srcRect l="10000"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="1" y="2"/><a:ext cx="3" cy="4"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
    const bg = '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="102030"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>';
    const xml = slideXml(pic).replace('<p:cSld>', `<p:cSld>${bg}`);
    const { deck } = openDeck(buildPptx([{ xml, media: { 'image1.png': png } }]));
    expect(deck.slides[0].background).toMatchObject({ kind: 'solid', color: { r: 16, g: 32, b: 48 } });
    const picture = deck.slides[0].elements.find((e) => e.id === '5');
    expect(picture).toMatchObject({ type: 'picture', part: 'ppt/media/image1.png', crop: { l: 0.1 } });
  });

  it('reads a table with its cell text, spans and borders', () => {
    const cell = (text: string, extra = '') => `<a:tc${extra}><a:txBody><a:bodyPr/><a:lstStyle/>${para(text)}</a:txBody><a:tcPr><a:lnB w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:lnB><a:solidFill><a:srgbClr val="FFFF00"/></a:solidFill></a:tcPr></a:tc>`;
    const table = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="6" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="2000" cy="1000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid><a:gridCol w="1000"/><a:gridCol w="1000"/></a:tblGrid>
<a:tr h="500">${cell('合併', ' gridSpan="2"')}${cell('', ' hMerge="1"')}</a:tr><a:tr h="500">${cell('左')}${cell('右')}</a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
    const t = openDeck(buildPptx([{ xml: slideXml(table) }])).deck.slides[0].elements.find((e) => e.id === '6') as TableElement;
    expect(t.type).toBe('table');
    expect(t.columns).toEqual([1000, 1000]);
    expect(t.rows[0].cells[0]).toMatchObject({ gridSpan: 2, merged: false });
    expect(t.rows[0].cells[1].merged).toBe(true);
    expect(t.rows[1].cells[1].text!.paragraphs[0].runs[0].text).toBe('右');
    expect(t.rows[1].cells[0].borders.b).toMatchObject({ width: 12700 });
    expect(t.rows[1].cells[0].fill).toMatchObject({ kind: 'solid', color: { r: 255, g: 255, b: 0 } });
  });

  it('places a group’s children in its own coordinate space', () => {
    const group = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="7" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="200" cy="200"/><a:chOff x="0" y="0"/><a:chExt cx="100" cy="100"/></a:xfrm></p:grpSpPr>${shape(8, { xfrm: [0, 0, 50, 50], paragraphs: para('子') })}</p:grpSp>`;
    const g = openDeck(buildPptx([{ xml: slideXml(group) }])).deck.slides[0].elements.find((e) => e.id === '7')!;
    expect(g).toMatchObject({ type: 'group', childOffset: { x: 0, y: 0 }, childExtent: { w: 100, h: 100 } });
    expect(g.type === 'group' && g.children[0].id).toBe('8');
  });
});

describe('click animations', () => {
  const box = (id: number, text = '文字') => shape(id, { xfrm: [0, 0, 1000, 1000], paragraphs: para(text) });

  it('makes each click one page: entrances start hidden and appear in order', () => {
    const xml = slideXml(box(2) + box(3) + box(4), timing([clickGroup([['entr', 2]]), clickGroup([['entr', 3], ['entr', 4]])]));
    const { deck } = openDeck(buildPptx([{ xml }, { xml: slideXml(box(2)) }]));
    const steps = deck.slides[0].steps;
    expect(steps).toHaveLength(3);
    expect([...steps[0].hidden].sort()).toEqual(['2', '3', '4']);
    expect([...steps[1].hidden].sort()).toEqual(['3', '4']);
    expect([...steps[2].hidden]).toEqual([]);
    // Two pages-worth of clicks plus the opening, then the next slide.
    expect(deckPages(deck)).toEqual([{ slide: 0, step: 0 }, { slide: 0, step: 1 }, { slide: 0, step: 2 }, { slide: 1, step: 0 }]);
  });

  it('plays a first group that starts with the slide without a click', () => {
    const xml = slideXml(box(2) + box(3), timing([clickGroup([['entr', 2, undefined, 'afterEffect']], true), clickGroup([['entr', 3]])]));
    const steps = openDeck(buildPptx([{ xml }])).deck.slides[0].steps;
    expect(steps).toHaveLength(2);
    expect([...steps[0].hidden]).toEqual(['3']);
  });

  it('builds a list one paragraph per click, and hides what exits', () => {
    const list = shape(2, { xfrm: [0, 0, 1000, 1000], paragraphs: para('一') + para('二') + para('三') });
    const xml = slideXml(list + box(3), timing([
      clickGroup([['entr', 2, [0, 0]]]),
      clickGroup([['entr', 2, [1, 1]]]),
      clickGroup([['entr', 2, [2, 2]]]),
      clickGroup([['exit', 3]]),
      clickGroup([['emph', 2]]),
    ]));
    const steps = openDeck(buildPptx([{ xml }])).deck.slides[0].steps;
    expect(steps).toHaveLength(6);
    expect([...steps[0].hiddenParagraphs.get('2')!].sort()).toEqual([0, 1, 2]);
    expect([...steps[2].hiddenParagraphs.get('2')!]).toEqual([2]);
    expect(steps[3].hiddenParagraphs.has('2')).toBe(false);
    expect(steps[3].hidden.has('3')).toBe(false);
    expect(steps[4].hidden.has('3')).toBe(true);
    // An emphasis click changes nothing on screen but is still a click.
    expect(steps[5]).toEqual(steps[4]);
  });
});

import { strToU8, zipSync } from 'fflate';

/** Builds small but complete .pptx files for the tests. */

export const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const THEME = `<?xml version="1.0" encoding="UTF-8"?><a:theme ${NS} name="Test"><a:themeElements>
<a:clrScheme name="Test"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2>
<a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6>
<a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Test"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Hant" typeface="微軟正黑體"/></a:majorFont>
<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Hant" typeface="新細明體"/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Test"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="50000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"><a:shade val="50000"/></a:schemeClr></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst/><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
</a:themeElements></a:theme>`;

const MASTER = `<?xml version="1.0" encoding="UTF-8"?><p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title Placeholder 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Text Placeholder 2"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="838200" y="1825625"/><a:ext cx="10515600" cy="4351338"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Body</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="9" name="Logo bar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="0" y="6500000"/><a:ext cx="12192000" cy="358000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>
</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
<p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="4400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/></a:defRPr></a:lvl1pPr></p:titleStyle>
<p:bodyStyle><a:lvl1pPr marL="228600" indent="-228600"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:buFont typeface="Arial"/><a:buChar char="•"/><a:defRPr sz="2800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/></a:defRPr></a:lvl1pPr>
<a:lvl2pPr marL="685800" indent="-228600"><a:buChar char="–"/><a:defRPr sz="2400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:lvl2pPr></p:bodyStyle><p:otherStyle/></p:txStyles></p:sldMaster>`;

const LAYOUT = `<?xml version="1.0" encoding="UTF-8"?><p:sldLayout ${NS} type="obj"><p:cSld name="Title and Content"><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/>
<p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr><a:defRPr><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle><a:p><a:r><a:rPr lang="en-US"/><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content 2"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="1000000" y="2000000"/><a:ext cx="9000000" cy="4000000"/></a:xfrm></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Content</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const rels = (entries: [string, string, string][]) =>
  `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`;

/** A slide's XML around its shapes (`spTree` content) and optional timing. */
export function slideXml(shapes: string, extra = '', attrs = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?><p:sld ${NS} ${attrs}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${extra}</p:sld>`;
}

export interface FixtureSlide { xml: string; media?: Record<string, Uint8Array> }

export function buildPptx(slides: FixtureSlide[], options: { width?: number; height?: number } = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    '_rels/.rels': strToU8(rels([['rId1', 'officeDocument', 'ppt/presentation.xml']])),
    'ppt/presentation.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst>
<p:sldSz cx="${options.width ?? 12192000}" cy="${options.height ?? 6858000}"/><p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:defaultTextStyle></p:presentation>`),
    'ppt/_rels/presentation.xml.rels': strToU8(rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ...slides.map((_, i): [string, string, string] => [`rId${i + 2}`, 'slide', `slides/slide${i + 1}.xml`])])),
    'ppt/slideMasters/slideMaster1.xml': strToU8(MASTER),
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': strToU8(rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']])),
    'ppt/slideLayouts/slideLayout1.xml': strToU8(LAYOUT),
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': strToU8(rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']])),
    'ppt/theme/theme1.xml': strToU8(THEME),
  };
  slides.forEach((slide, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = strToU8(slide.xml);
    const media = Object.entries(slide.media ?? {});
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = strToU8(rels([
      ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
      ...media.map(([name], m): [string, string, string] => [`rIdImg${m + 1}`, 'image', `../media/${name}`]),
    ]));
    for (const [name, bytes] of media) files[`ppt/media/${name}`] = bytes;
  });
  return zipSync(files);
}

/** A placeholder or text box with paragraphs given as XML. */
export const shape = (id: number, opts: { ph?: string; xfrm?: [number, number, number, number]; paragraphs: string; fill?: string; geom?: string; bodyPr?: string }) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr>${opts.ph ?? ''}</p:nvPr></p:nvSpPr><p:spPr>${opts.xfrm ? `<a:xfrm><a:off x="${opts.xfrm[0]}" y="${opts.xfrm[1]}"/><a:ext cx="${opts.xfrm[2]}" cy="${opts.xfrm[3]}"/></a:xfrm>` : ''}${opts.geom ?? ''}${opts.fill ?? ''}</p:spPr><p:txBody>${opts.bodyPr ?? '<a:bodyPr/>'}<a:lstStyle/>${opts.paragraphs}</p:txBody></p:sp>`;

export const para = (text: string, pPr = '', rPr = '<a:rPr lang="zh-TW"/>') => `<a:p>${pPr}<a:r>${rPr}<a:t>${text}</a:t></a:r></a:p>`;

/** A main-sequence click group: `effects` are [presetClass, spid, paragraph range?, nodeType?]. */
export function clickGroup(effects: [string, number, [number, number]?, string?][], onBegin = false): string {
  const effect = ([cls, spid, range, nodeType]: [string, number, [number, number]?, string?], i: number) =>
    `<p:par><p:cTn id="${100 + i}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${200 + i}" presetID="10" presetClass="${cls}" presetSubtype="0" fill="hold" nodeType="${nodeType ?? (i === 0 ? 'clickEffect' : 'withEffect')}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="${300 + i}" dur="1" fill="hold"/><p:tgtEl><p:spTgt spid="${spid}">${range ? `<p:txEl><p:pRg st="${range[0]}" end="${range[1]}"/></p:txEl>` : ''}</p:spTgt></p:tgtEl></p:cBhvr></p:set></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
  return `<p:par><p:cTn id="50" fill="hold"><p:stCondLst><p:cond delay="indefinite"/>${onBegin ? '<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : ''}</p:stCondLst><p:childTnLst>${effects.map(effect).join('')}</p:childTnLst></p:cTn></p:par>`;
}

export const timing = (groups: string[]) =>
  `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${groups.join('')}</p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;

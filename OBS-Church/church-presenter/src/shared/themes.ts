import { LANG } from './i18n';

/**
 * 投影片背景主題：純漸層、基督教主題畫面（全部以 SVG 向量繪製，不用外部圖片，
 * 沒有版權問題、放大不糊），以及透明（疊在影像上的字幕）。
 * 每個主題也決定標題與內文的顏色；畫面較花的主題加一層暗化並給文字陰影，確保看得清楚。
 */

export type ThemeGroup = 'gradient' | 'art' | 'overlay';

export interface Theme {
  id: string;
  /** Traditional Chinese name; see themeName() for the one to show. */
  name: string;
  nameEn: string;
  group: ThemeGroup;
  /** Gradient colours, top-left to bottom-right. */
  stops?: string[];
  /** A soft light in the top left (rgba). */
  glow?: string;
  /** Full-bleed artwork (an SVG document, 1920×1080). */
  svg?: string;
  /** Darkening laid over the artwork so text stays readable (0–1). */
  dim?: number;
  title: string;
  body: string;
  /** Text shadow, for artwork backgrounds. */
  shadow?: boolean;
  /** No background: the slide is laid over whatever is beneath it. */
  overlay?: boolean;
}

// ---------- helpers for the artwork ----------

/** A small, repeatable random sequence, so the same stars land in the same places every time. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const svg = (body: string, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080"><defs>${defs}</defs>${body}</svg>`;

/** Light rays fanning out from (cx, cy). */
function rays(cx: number, cy: number, count: number, spread: number, from: number, length: number, color: string, opacity: number) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = ((from + (i * spread) / (count - 1)) * Math.PI) / 180;
    const w = 0.035;
    const x1 = cx + Math.cos(a - w) * length;
    const y1 = cy + Math.sin(a - w) * length;
    const x2 = cx + Math.cos(a + w) * length;
    const y2 = cy + Math.sin(a + w) * length;
    out += `<polygon points="${cx},${cy} ${x1.toFixed(0)},${y1.toFixed(0)} ${x2.toFixed(0)},${y2.toFixed(0)}" fill="${color}" opacity="${(opacity * (0.6 + 0.4 * Math.sin(i * 1.7) ** 2)).toFixed(3)}"/>`;
  }
  return out;
}

/** An annular sector, for the rose window. */
function sector(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number) {
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  const large = a2 - a1 > Math.PI ? 1 : 0;
  return `M${p(r2, a1)} A${r2},${r2} 0 ${large} 1 ${p(r2, a2)} L${p(r1, a2)} A${r1},${r1} 0 ${large} 0 ${p(r1, a1)} Z`;
}

/** Rolling hills along the bottom. */
function hills(y: number, amp: number, seed: number, color: string) {
  const rnd = seeded(seed);
  let d = `M0,${y}`;
  for (let x = 0; x <= 1920; x += 240) {
    const cy = y + (rnd() - 0.5) * amp;
    d += ` Q${x + 120},${(cy - amp * 0.6).toFixed(0)} ${x + 240},${cy.toFixed(0)}`;
  }
  return `<path d="${d} L1920,1080 L0,1080 Z" fill="${color}"/>`;
}

const cross = (x: number, y: number, h: number, color: string) => {
  const w = h * 0.075;
  const arm = h * 0.5;
  return `<rect x="${x - w / 2}" y="${y}" width="${w}" height="${h}" rx="${w * 0.15}" fill="${color}"/>` +
    `<rect x="${x - arm / 2}" y="${y + h * 0.24}" width="${arm}" height="${w * 0.95}" rx="${w * 0.15}" fill="${color}"/>`;
};

// ---------- the artwork ----------

const ART_DAWN_CROSS = svg(
  `<rect width="1920" height="1080" fill="url(#sky)"/>
   <circle cx="1420" cy="800" r="620" fill="url(#sun)"/>
   ${rays(1420, 800, 18, 150, 195, 1500, '#ffe8b0', 0.07)}
   ${hills(880, 70, 7, '#2a2448')}
   ${cross(1420, 470, 420, '#120f24')}
   ${hills(960, 60, 3, '#120f24')}`,
  `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
     <stop offset="0" stop-color="#0a1a36"/><stop offset=".5" stop-color="#36376e"/>
     <stop offset=".78" stop-color="#c76f5c"/><stop offset="1" stop-color="#f4b56c"/></linearGradient>
   <radialGradient id="sun" cx="1420" cy="800" r="620" gradientUnits="userSpaceOnUse">
     <stop offset="0" stop-color="#fff6d6" stop-opacity=".95"/><stop offset=".22" stop-color="#ffd590" stop-opacity=".55"/>
     <stop offset="1" stop-color="#ffb46b" stop-opacity="0"/></radialGradient>`,
);

const ART_GLORY = svg(
  `<rect width="1920" height="1080" fill="url(#bg)"/>
   ${rays(960, -120, 26, 160, 10, 1700, '#ffd98a', 0.09)}
   <rect width="1920" height="1080" fill="url(#halo)"/>`,
  `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1640"/><stop offset="1" stop-color="#070612"/></linearGradient>
   <radialGradient id="halo" cx="960" cy="-60" r="900" gradientUnits="userSpaceOnUse">
     <stop offset="0" stop-color="#fff2c2" stop-opacity=".55"/><stop offset=".4" stop-color="#f3c35b" stop-opacity=".18"/>
     <stop offset="1" stop-color="#f3c35b" stop-opacity="0"/></radialGradient>`,
);

const DOVE = `<g fill="#ffffff">
  <path d="M0 70 C60 40 120 38 170 58 C215 76 245 64 285 40 C265 82 228 108 178 114 C118 120 60 104 0 70 Z"/>
  <path d="M90 62 C78 2 128 -72 214 -110 C190 -50 186 -2 150 56 Z" opacity=".95"/>
  <path d="M124 66 C156 18 240 -18 330 -16 C282 22 244 56 182 80 Z" opacity=".85"/>
  <path d="M282 44 L312 50 L282 58 Z"/>
  <path d="M0 70 C-30 60 -60 70 -84 92 C-52 86 -24 88 8 82 Z" opacity=".9"/>
</g>`;

const ART_DOVE = svg(
  `<rect width="1920" height="1080" fill="url(#bg)"/>
   <circle cx="1440" cy="330" r="420" fill="url(#light)"/>
   ${rays(1440, 330, 16, 360, 0, 900, '#ffffff', 0.05)}
   <g transform="translate(1290 330) scale(1.35)" opacity=".92">${DOVE}</g>`,
  `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d2c54"/><stop offset=".55" stop-color="#1d5a8c"/><stop offset="1" stop-color="#6fa8d6"/></linearGradient>
   <radialGradient id="light" cx="1440" cy="330" r="420" gradientUnits="userSpaceOnUse">
     <stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`,
);

function roseWindow() {
  const colors = ['#1d4ed8', '#b91c1c', '#15803d', '#a16207', '#7e22ce', '#0e7490'];
  const cx = 1500, cy = 540;
  let parts = '';
  const rings: [number, number, number][] = [[0, 70, 1], [70, 170, 8], [170, 300, 16], [300, 430, 24], [430, 470, 48]];
  rings.forEach(([r1, r2, n], ring) => {
    for (let i = 0; i < n; i++) {
      const a1 = (i / n) * Math.PI * 2 - Math.PI / 2;
      const a2 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
      const color = colors[(i + ring * 2) % colors.length];
      const d = r1 === 0 ? `M${cx},${cy} ${sector(cx, cy, 0.01, r2, a1, a2).slice(1)}` : sector(cx, cy, r1, r2, a1, a2);
      parts += `<path d="${d}" fill="${color}" stroke="#0b0b10" stroke-width="7" opacity=".9"/>`;
    }
  });
  return parts;
}

const ART_STAINED_GLASS = svg(
  `<rect width="1920" height="1080" fill="#0b0b12"/>
   <circle cx="1500" cy="540" r="520" fill="url(#glow)"/>
   ${roseWindow()}
   <circle cx="1500" cy="540" r="470" fill="none" stroke="#0b0b10" stroke-width="14"/>
   <rect width="1920" height="1080" fill="url(#fade)"/>`,
  `<radialGradient id="glow" cx="1500" cy="540" r="560" gradientUnits="userSpaceOnUse"><stop offset=".8" stop-color="#f59e0b" stop-opacity=".25"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/></radialGradient>
   <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0b0b12"/><stop offset=".45" stop-color="#0b0b12" stop-opacity=".92"/><stop offset=".75" stop-color="#0b0b12" stop-opacity=".2"/><stop offset="1" stop-color="#0b0b12" stop-opacity=".35"/></linearGradient>`,
);

function wheat() {
  const rnd = seeded(11);
  let out = '';
  for (let s = 0; s < 14; s++) {
    const baseX = 1180 + s * 52 + rnd() * 30;
    const lean = (rnd() - 0.3) * 0.35;
    const h = 520 + rnd() * 260;
    const topX = baseX + lean * h;
    const topY = 1080 - h;
    out += `<path d="M${baseX.toFixed(0)},1090 Q${(baseX + lean * h * 0.4).toFixed(0)},${(1080 - h * 0.5).toFixed(0)} ${topX.toFixed(0)},${topY.toFixed(0)}" stroke="#7a4a12" stroke-width="5" fill="none" opacity=".85"/>`;
    for (let g = 0; g < 9; g++) {
      const t = g / 9;
      const gx = topX - lean * 60 * t;
      const gy = topY + t * 150;
      for (const side of [-1, 1]) {
        const rot = (lean * 57 + side * 28).toFixed(0);
        out += `<ellipse cx="${(gx + side * 11).toFixed(0)}" cy="${gy.toFixed(0)}" rx="9" ry="20" transform="rotate(${rot} ${(gx + side * 11).toFixed(0)} ${gy.toFixed(0)})" fill="#e6a531" opacity=".92"/>`;
      }
    }
  }
  return out;
}

const ART_HARVEST = svg(
  `<rect width="1920" height="1080" fill="url(#bg)"/>
   <circle cx="1560" cy="300" r="300" fill="url(#sun)"/>
   ${wheat()}
   <rect width="1920" height="1080" fill="url(#fade)"/>`,
  `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b1d06"/><stop offset=".6" stop-color="#7c3f0c"/><stop offset="1" stop-color="#c2741a"/></linearGradient>
   <radialGradient id="sun" cx="1560" cy="300" r="300" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe7a8" stop-opacity=".8"/><stop offset="1" stop-color="#ffcf6e" stop-opacity="0"/></radialGradient>
   <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a1404" stop-opacity=".75"/><stop offset=".55" stop-color="#2a1404" stop-opacity=".35"/><stop offset="1" stop-color="#2a1404" stop-opacity="0"/></linearGradient>`,
);

function stars() {
  const rnd = seeded(23);
  let out = '';
  for (let i = 0; i < 230; i++) {
    const x = rnd() * 1920;
    const y = rnd() * 780;
    const r = rnd() < 0.08 ? 2.6 : 0.8 + rnd() * 1.4;
    out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="#ffffff" opacity="${(0.35 + rnd() * 0.6).toFixed(2)}"/>`;
  }
  return out;
}

const STAR_OF_BETHLEHEM = `<g transform="translate(1480 230)">
  <circle r="150" fill="url(#starGlow)"/>
  <path d="M0,-150 L14,-14 L150,0 L14,14 L0,150 L-14,14 L-150,0 L-14,-14 Z" fill="#fffbe6"/>
  <path d="M0,-70 L8,-8 L70,0 L8,8 L0,70 L-8,8 L-70,0 L-8,-8 Z" fill="#ffffff" transform="rotate(45)" opacity=".8"/>
</g>`;

const ART_STARRY_NIGHT = svg(
  `<rect width="1920" height="1080" fill="url(#bg)"/>
   ${stars()}
   ${STAR_OF_BETHLEHEM}
   ${rays(1480, 230, 3, 30, 98, 900, '#fff6c8', 0.07)}
   ${hills(900, 90, 5, '#0d1328')}
   ${hills(960, 60, 9, '#070b19')}`,
  `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050816"/><stop offset=".7" stop-color="#16214a"/><stop offset="1" stop-color="#2b3a6b"/></linearGradient>
   <radialGradient id="starGlow"><stop offset="0" stop-color="#fff7d1" stop-opacity=".9"/><stop offset="1" stop-color="#fff7d1" stop-opacity="0"/></radialGradient>`,
);

function waves() {
  const layers = [
    { y: 760, amp: 34, len: 380, color: '#0e7490', o: 0.55 },
    { y: 830, amp: 28, len: 300, color: '#0891b2', o: 0.6 },
    { y: 900, amp: 24, len: 260, color: '#155e75', o: 0.8 },
    { y: 970, amp: 20, len: 220, color: '#083344', o: 0.95 },
  ];
  return layers.map((l) => {
    let d = `M0,${l.y}`;
    for (let x = 0; x <= 1920; x += l.len) {
      d += ` q${l.len / 4},${-l.amp} ${l.len / 2},0 t${l.len / 2},0`;
    }
    return `<path d="${d} L1920,1080 L0,1080 Z" fill="${l.color}" opacity="${l.o}"/>`;
  }).join('');
}

const ART_LIVING_WATER = svg(
  `<rect width="1920" height="1080" fill="url(#bg)"/>
   <ellipse cx="1300" cy="380" rx="700" ry="260" fill="url(#shine)"/>
   ${waves()}`,
  `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#022c3a"/><stop offset=".65" stop-color="#0c5a70"/><stop offset="1" stop-color="#4fb3c9"/></linearGradient>
   <radialGradient id="shine" cx="1300" cy="380" r="700" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#a5f3fc" stop-opacity=".3"/><stop offset="1" stop-color="#a5f3fc" stop-opacity="0"/></radialGradient>`,
);

function olive() {
  const rnd = seeded(31);
  let leaves = '';
  const stem = 'M1180,1080 C1300,880 1500,780 1860,640';
  const point = (t: number) => {
    // The stem's cubic, sampled.
    const p0 = [1180, 1080], p1 = [1300, 880], p2 = [1500, 780], p3 = [1860, 640];
    const u = 1 - t;
    const x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0];
    const y = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1];
    return [x, y];
  };
  for (let i = 1; i < 16; i++) {
    const t = i / 16;
    const [x, y] = point(t);
    for (const side of [-1, 1]) {
      const angle = -35 + side * 48 + (rnd() - 0.5) * 18;
      leaves += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="62" ry="15" fill="${side > 0 ? '#6b7f4a' : '#86996a'}" opacity=".85" transform="rotate(${angle.toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)}) translate(${side * 52} 0)"/>`;
    }
    if (i % 4 === 2) leaves += `<ellipse cx="${(x + 10).toFixed(0)}" cy="${(y + 34).toFixed(0)}" rx="15" ry="20" fill="#3f4a26" opacity=".9"/>`;
  }
  return `<path d="${stem}" stroke="#5b5130" stroke-width="7" fill="none"/>${leaves}`;
}

const ART_OLIVE = svg(
  `<rect width="1920" height="1080" fill="url(#bg)"/>
   <circle cx="1680" cy="180" r="420" fill="url(#warm)"/>
   ${olive()}`,
  `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf8f0"/><stop offset="1" stop-color="#ece4d2"/></linearGradient>
   <radialGradient id="warm" cx="1680" cy="180" r="420" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff3d6" stop-opacity=".9"/><stop offset="1" stop-color="#fff3d6" stop-opacity="0"/></radialGradient>`,
);

const ART_MOUNTAIN_CROSS = svg(
  `<rect width="1920" height="1080" fill="url(#sky)"/>
   <circle cx="1460" cy="420" r="380" fill="url(#light)"/>
   <polygon points="820,1080 1180,620 1300,700 1460,470 1640,690 1760,620 2050,1080" fill="#3b5378"/>
   ${cross(1460, 330, 150, '#1b2740')}
   <polygon points="560,1080 980,760 1120,820 1330,690 1560,860 1700,800 1980,1080" fill="#26395a"/>
   <polygon points="-40,1080 300,860 520,940 760,840 1040,1000 1200,1080" fill="#1b2740"/>
   <polygon points="900,1080 1260,930 1500,990 1700,920 1960,1080" fill="#121b2f"/>`,
  `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1b33"/><stop offset=".6" stop-color="#3b5f8a"/><stop offset="1" stop-color="#9fbad6"/></linearGradient>
   <radialGradient id="light" cx="1460" cy="420" r="380" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff4d1" stop-opacity=".75"/><stop offset="1" stop-color="#fff4d1" stop-opacity="0"/></radialGradient>`,
);

const OPEN_BIBLE = `<g transform="translate(1440 820)">
  <path d="M-330,0 C-220,-60 -90,-62 0,-20 C90,-62 220,-60 330,0 L330,60 C220,8 90,10 0,46 C-90,10 -220,8 -330,60 Z" fill="#2a1a0c"/>
  <path d="M-310,-6 C-210,-58 -90,-58 -6,-22 L-6,36 C-90,2 -210,2 -310,48 Z" fill="#f3e6c8"/>
  <path d="M310,-6 C210,-58 90,-58 6,-22 L6,36 C90,2 210,2 310,48 Z" fill="#efe0bd"/>
  ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M-280,${i * 7 - 4} C-200,${i * 6 - 38} -100,${i * 6 - 38} -30,${i * 8 - 12}" stroke="#c9b48a" stroke-width="3" fill="none"/><path d="M280,${i * 7 - 4} C200,${i * 6 - 38} 100,${i * 6 - 38} 30,${i * 8 - 12}" stroke="#c9b48a" stroke-width="3" fill="none"/>`).join('')}
</g>`;

const ART_BIBLE_LIGHT = svg(
  `<rect width="1920" height="1080" fill="url(#bg)"/>
   ${rays(1440, 780, 22, 150, 195, 1300, '#ffe2a3', 0.08)}
   <ellipse cx="1440" cy="780" rx="520" ry="360" fill="url(#glow)"/>
   ${OPEN_BIBLE}`,
  `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140d07"/><stop offset=".7" stop-color="#3b2410"/><stop offset="1" stop-color="#5a3615"/></linearGradient>
   <radialGradient id="glow" cx="1440" cy="780" r="520" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe7b0" stop-opacity=".6"/><stop offset="1" stop-color="#ffe7b0" stop-opacity="0"/></radialGradient>`,
);

const ART_QUIET_CROSS = svg(
  `<rect width="1920" height="1080" fill="url(#bg)"/>
   <g opacity=".14">${cross(1500, 140, 820, '#e2e8f0')}</g>
   <circle cx="1500" cy="390" r="520" fill="url(#halo)"/>`,
  `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#111827"/><stop offset="1" stop-color="#1f2a44"/></linearGradient>
   <radialGradient id="halo" cx="1500" cy="390" r="520" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#93c5fd" stop-opacity=".18"/><stop offset="1" stop-color="#93c5fd" stop-opacity="0"/></radialGradient>`,
);

// ---------- the list ----------

const DARK_TEXT = { title: '#fde68a', body: '#f8fafc' };

export const THEMES: readonly Theme[] = [
  // 純漸層（前十套與 bolccop meeting 一致）
  { id: 'navy', nameEn: 'Temple Blue', name: '聖殿藍', group: 'gradient', stops: ['#0f2a5c', '#1e3a8a'], glow: 'rgba(147,197,253,0.10)', ...DARK_TEXT },
  { id: 'midnight-gold', nameEn: 'Midnight Gold', name: '午夜金', group: 'gradient', stops: ['#0c0a09', '#1c1917', '#292524'], glow: 'rgba(212,175,55,0.14)', title: '#e7c873', body: '#f5f5f4' },
  { id: 'emerald', nameEn: 'Emerald', name: '翡翠綠', group: 'gradient', stops: ['#022c22', '#064e3b', '#065f46'], glow: 'rgba(110,231,183,0.12)', title: '#a7f3d0', body: '#ecfdf5' },
  { id: 'burgundy', nameEn: 'Burgundy', name: '酒紅', group: 'gradient', stops: ['#2a0710', '#4c0519', '#7f1d1d'], glow: 'rgba(253,186,116,0.12)', title: '#fcd9b6', body: '#fff1f2' },
  { id: 'royal-purple', nameEn: 'Royal Purple', name: '皇家紫', group: 'gradient', stops: ['#1a0b2e', '#2e1065', '#4c1d95'], glow: 'rgba(216,180,254,0.14)', title: '#e9d5ff', body: '#faf5ff' },
  { id: 'ocean', nameEn: 'Deep Ocean', name: '深海青', group: 'gradient', stops: ['#042f2e', '#0c4a6e', '#155e75'], glow: 'rgba(103,232,249,0.12)', title: '#fef08a', body: '#ecfeff' },
  { id: 'graphite', nameEn: 'Graphite', name: '石墨灰', group: 'gradient', stops: ['#0f1115', '#1f2937', '#374151'], glow: 'rgba(148,163,184,0.12)', title: '#93c5fd', body: '#f8fafc' },
  { id: 'sunset', nameEn: 'Sunset', name: '暮光', group: 'gradient', stops: ['#2b0f2a', '#7c2d12', '#c2410c'], glow: 'rgba(253,224,71,0.14)', ...DARK_TEXT },
  { id: 'ivory', nameEn: 'Ivory', name: '象牙白', group: 'gradient', stops: ['#fdfbf6', '#f3ece0'], glow: 'rgba(255,255,255,0.35)', title: '#7c2d12', body: '#1f2937' },
  { id: 'dawn', nameEn: 'Dawn', name: '晨曦', group: 'gradient', stops: ['#fff7ed', '#ffe4e6', '#e0e7ff'], glow: 'rgba(255,255,255,0.3)', title: '#1e3a8a', body: '#1c1917' },
  { id: 'aurora', nameEn: 'Aurora', name: '極光', group: 'gradient', stops: ['#0b1026', '#134e4a', '#3730a3'], glow: 'rgba(94,234,212,0.16)', title: '#a5f3fc', body: '#f8fafc' },
  { id: 'rose-gold', nameEn: 'Rose Gold', name: '玫瑰金', group: 'gradient', stops: ['#3b0d2a', '#831843', '#d97706'], glow: 'rgba(254,215,170,0.16)', title: '#fed7aa', body: '#fff7ed' },
  { id: 'forest', nameEn: 'Forest', name: '森林', group: 'gradient', stops: ['#03140c', '#14532d', '#3f6212'], glow: 'rgba(190,242,100,0.12)', title: '#d9f99d', body: '#f7fee7' },
  { id: 'sky', nameEn: 'Clear Sky', name: '晴空', group: 'gradient', stops: ['#e0f2fe', '#bae6fd', '#c7d2fe'], glow: 'rgba(255,255,255,0.45)', title: '#1e3a8a', body: '#0f172a' },
  { id: 'lavender', nameEn: 'Lavender', name: '薰衣草', group: 'gradient', stops: ['#faf5ff', '#ede9fe', '#fce7f3'], glow: 'rgba(255,255,255,0.4)', title: '#6b21a8', body: '#1e1b2e' },
  { id: 'black', nameEn: 'Black', name: '純黑', group: 'gradient', stops: ['#000000', '#000000'], title: '#fde68a', body: '#ffffff' },
  // 基督教主題畫面（向量繪製）
  { id: 'art-dawn-cross', nameEn: 'Cross at Dawn', name: '晨光十字架', group: 'art', svg: ART_DAWN_CROSS, dim: 0.12, shadow: true, ...DARK_TEXT },
  { id: 'art-glory', nameEn: 'Glory', name: '榮光', group: 'art', svg: ART_GLORY, dim: 0, shadow: true, ...DARK_TEXT },
  { id: 'art-dove', nameEn: 'Holy Spirit Dove', name: '聖靈鴿子', group: 'art', svg: ART_DOVE, dim: 0.1, shadow: true, title: '#fef9c3', body: '#ffffff' },
  { id: 'art-stained-glass', nameEn: 'Stained Glass', name: '彩色玻璃', group: 'art', svg: ART_STAINED_GLASS, dim: 0, shadow: true, title: '#fcd34d', body: '#f8fafc' },
  { id: 'art-harvest', nameEn: 'Harvest Wheat', name: '豐收麥穗', group: 'art', svg: ART_HARVEST, dim: 0.05, shadow: true, title: '#fde68a', body: '#fff7ed' },
  { id: 'art-starry-night', nameEn: 'Star of Bethlehem', name: '伯利恆之星', group: 'art', svg: ART_STARRY_NIGHT, dim: 0, shadow: true, title: '#fef3c7', body: '#f8fafc' },
  { id: 'art-living-water', nameEn: 'Living Water', name: '活水', group: 'art', svg: ART_LIVING_WATER, dim: 0.08, shadow: true, title: '#cffafe', body: '#ffffff' },
  { id: 'art-olive', nameEn: 'Olive Branch', name: '橄欖枝', group: 'art', svg: ART_OLIVE, dim: 0, shadow: false, title: '#4d5b2b', body: '#1f2316' },
  { id: 'art-mountain-cross', nameEn: 'Mountains and Cross', name: '群山與十字架', group: 'art', svg: ART_MOUNTAIN_CROSS, dim: 0.12, shadow: true, title: '#fef3c7', body: '#ffffff' },
  { id: 'art-bible-light', nameEn: 'Light of the Word', name: '聖經之光', group: 'art', svg: ART_BIBLE_LIGHT, dim: 0.1, shadow: true, ...DARK_TEXT },
  { id: 'art-quiet-cross', nameEn: 'Quiet Cross', name: '靜默十字架', group: 'art', svg: ART_QUIET_CROSS, dim: 0, shadow: false, title: '#bfdbfe', body: '#f1f5f9' },
  // 透明：疊在影像上的字幕
  { id: 'overlay', nameEn: 'Transparent (overlay)', name: '透明（疊加字幕）', group: 'overlay', overlay: true, shadow: true, title: '#fde68a', body: '#ffffff' },
];

export const THEME_GROUPS: readonly { id: ThemeGroup; name: string }[] = [
  { id: 'gradient', name: LANG === 'zh' ? '純漸層' : 'Gradients' },
  { id: 'art', name: LANG === 'zh' ? '基督教主題' : 'Christian artwork' },
  { id: 'overlay', name: LANG === 'zh' ? '透明' : 'Transparent' },
];

/** The theme's name in the interface language. */
export const themeName = (theme: Theme): string => (LANG === 'zh' ? theme.name : theme.nameEn);

export function themeById(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

const artImages = new Map<string, Promise<HTMLImageElement>>();

/** A theme's artwork as an image, decoded once. */
export function themeArt(theme: Theme): Promise<HTMLImageElement> | null {
  if (!theme.svg) return null;
  let image = artImages.get(theme.id);
  if (!image) {
    image = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`theme ${theme.id} artwork failed to load`));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(theme.svg!)}`;
    });
    artImages.set(theme.id, image);
  }
  return image;
}

/** A CSS background for the theme's swatch in the picker. */
export function themeSwatchCss(theme: Theme): string {
  if (theme.overlay) return 'repeating-conic-gradient(#cbd5e1 0% 25%, #f8fafc 0% 50%) 50% / 14px 14px';
  if (theme.svg) return `center / cover no-repeat url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(theme.svg)}")`;
  const glow = theme.glow ? `radial-gradient(ellipse at 15% 10%, ${theme.glow}, transparent 60%), ` : '';
  return `${glow}linear-gradient(135deg, ${theme.stops!.join(', ')})`;
}

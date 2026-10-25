import { Language } from '../../types';

/**
 * 投影片模板：一份查經資料的文字、經文投影片長什麼樣子。每套是一個色系——
 * 底色的漸層、左上角一道柔光、標題與內文的顏色。`overlay` 是「透明」：
 * 沒有底色，字加深色描邊，像字幕一樣疊在任何畫面上都清楚。
 */
export interface SlideTheme {
  id: string;
  name: { zh: string; en: string };
  /** 漸層色，從左上到右下；overlay 沒有。 */
  stops: string[];
  /** 左上角的柔光（rgba）。 */
  glow?: string;
  title: string;
  body: string;
  footer: string;
  /** 圖片投影片的底色。 */
  picture: string;
  /** 透明：不畫底色，字加描邊。 */
  overlay?: boolean;
}

export const SLIDE_THEMES: readonly SlideTheme[] = [
  {
    id: 'navy', name: { zh: '聖殿藍', en: 'Sanctuary Blue' },
    stops: ['#0f2a5c', '#1e3a8a'], glow: 'rgba(147, 197, 253, 0.10)',
    title: '#fde68a', body: '#f1f5f9', footer: 'rgba(241, 245, 249, 0.55)', picture: '#0b1220',
  },
  {
    id: 'midnight-gold', name: { zh: '午夜金', en: 'Midnight Gold' },
    stops: ['#0c0a09', '#1c1917', '#292524'], glow: 'rgba(212, 175, 55, 0.14)',
    title: '#e7c873', body: '#f5f5f4', footer: 'rgba(231, 200, 115, 0.55)', picture: '#0c0a09',
  },
  {
    id: 'emerald', name: { zh: '翡翠綠', en: 'Emerald' },
    stops: ['#022c22', '#064e3b', '#065f46'], glow: 'rgba(110, 231, 183, 0.12)',
    title: '#a7f3d0', body: '#ecfdf5', footer: 'rgba(236, 253, 245, 0.5)', picture: '#011c16',
  },
  {
    id: 'burgundy', name: { zh: '酒紅', en: 'Burgundy' },
    stops: ['#2a0710', '#4c0519', '#7f1d1d'], glow: 'rgba(253, 186, 116, 0.12)',
    title: '#fcd9b6', body: '#fff1f2', footer: 'rgba(255, 241, 242, 0.5)', picture: '#1f050c',
  },
  {
    id: 'royal-purple', name: { zh: '皇家紫', en: 'Royal Purple' },
    stops: ['#1a0b2e', '#2e1065', '#4c1d95'], glow: 'rgba(216, 180, 254, 0.14)',
    title: '#e9d5ff', body: '#faf5ff', footer: 'rgba(250, 245, 255, 0.5)', picture: '#12071f',
  },
  {
    id: 'ocean', name: { zh: '深海青', en: 'Deep Ocean' },
    stops: ['#042f2e', '#0c4a6e', '#155e75'], glow: 'rgba(103, 232, 249, 0.12)',
    title: '#fef08a', body: '#ecfeff', footer: 'rgba(236, 254, 255, 0.5)', picture: '#03222a',
  },
  {
    id: 'graphite', name: { zh: '石墨灰', en: 'Graphite' },
    stops: ['#0f1115', '#1f2937', '#374151'], glow: 'rgba(148, 163, 184, 0.12)',
    title: '#93c5fd', body: '#f8fafc', footer: 'rgba(248, 250, 252, 0.5)', picture: '#0b0d11',
  },
  {
    id: 'sunset', name: { zh: '暮光', en: 'Dusk' },
    stops: ['#2b0f2a', '#7c2d12', '#c2410c'], glow: 'rgba(253, 224, 71, 0.14)',
    title: '#fde68a', body: '#fff7ed', footer: 'rgba(255, 247, 237, 0.55)', picture: '#1f0a1e',
  },
  {
    id: 'ivory', name: { zh: '象牙白', en: 'Ivory' },
    stops: ['#fdfbf6', '#f3ece0'], glow: 'rgba(255, 255, 255, 0.35)',
    title: '#7c2d12', body: '#1f2937', footer: 'rgba(31, 41, 55, 0.5)', picture: '#f3ece0',
  },
  {
    id: 'dawn', name: { zh: '晨曦', en: 'Dawn' },
    stops: ['#fff7ed', '#ffe4e6', '#e0e7ff'], glow: 'rgba(255, 255, 255, 0.3)',
    title: '#1e3a8a', body: '#1c1917', footer: 'rgba(28, 25, 23, 0.5)', picture: '#f5f3ff',
  },
  {
    id: 'overlay', name: { zh: '透明（疊加字幕）', en: 'Transparent (overlay)' },
    stops: [], overlay: true,
    title: '#fde68a', body: '#ffffff', footer: 'rgba(255, 255, 255, 0.7)', picture: '#000000',
  },
];

export const DEFAULT_THEME_ID = 'navy';

export function slideTheme(id: string | undefined): SlideTheme {
  return SLIDE_THEMES.find((t) => t.id === id) ?? SLIDE_THEMES[0];
}

export const themeName = (theme: SlideTheme, language: Language) => (language === Language.ZH ? theme.name.zh : theme.name.en);

/** The theme's background as CSS, for its swatch in the picker; overlay shows a checkerboard. */
export function themeCss(theme: SlideTheme): string {
  if (theme.overlay) return 'repeating-conic-gradient(#d1d5db 0% 25%, #f9fafb 0% 50%) 50% / 16px 16px';
  const glow = theme.glow ? `radial-gradient(ellipse at 15% 10%, ${theme.glow}, transparent 60%), ` : '';
  return `${glow}linear-gradient(135deg, ${theme.stops.join(', ')})`;
}

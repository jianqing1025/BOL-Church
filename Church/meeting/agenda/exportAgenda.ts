import { BibleService } from '../../services/bibleService';
import type { Language } from '../../types';
import type { AgendaStore } from './agendaStore';
import { exportFileName, planSlides, writePptx } from './exportPptx';
import { openStoredDeck } from './pptx/pptxDeck';
import { canvasMeasure, createSlideCanvas, paintBackground } from './slideRenderer';
import { slideTheme } from './slideThemes';
import type { Agenda } from './types';

/**
 * Builds an agenda's PowerPoint in the browser and hands it to the host as a
 * download (the desktop app asks where to save it).
 */
export async function exportAgendaPptx(agenda: Agenda, deps: {
  store: AgendaStore;
  language: Language;
  footer: string;
  labels: { video: string; youtube: string };
}): Promise<void> {
  const theme = slideTheme(agenda.theme);
  const canvas = createSlideCanvas();
  const ctx = canvas.getContext('2d')!;
  paintBackground(ctx, theme);
  // A gradient compresses poorly as PNG; as JPEG it is a few dozen KB. The overlay theme has none.
  const background = theme.overlay ? null : canvas.toDataURL('image/jpeg', 0.92);

  const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const slides = await planSlides(agenda, {
    language: deps.language,
    footer: deps.footer,
    measure: canvasMeasure(ctx),
    loadChapter: (bookId, chapter) => BibleService.loadChapter(bookId, chapter),
    async loadImage(fileId) {
      const file = await deps.store.getFile(fileId);
      if (!file) return null;
      const bitmap = await createImageBitmap(file.blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      // PowerPoint takes PNG, JPEG and GIF; anything else is redrawn as PNG.
      if (/^image\/(png|jpeg|gif)$/.test(file.type)) return { data: await blobToDataUrl(file.blob), ...size };
      const redraw = document.createElement('canvas');
      redraw.width = size.width;
      redraw.height = size.height;
      const image = await createImageBitmap(file.blob);
      redraw.getContext('2d')!.drawImage(image, 0, 0);
      image.close();
      return { data: redraw.toDataURL('image/png'), ...size };
    },
    async loadDeckSlides(fileId) {
      const deck = await openStoredDeck(fileId, async () => (await deps.store.getFile(fileId))?.blob);
      const out: string[] = [];
      const page = createSlideCanvas();
      for (const index of deck.finalPages()) {
        await deck.renderPage(page, index);
        out.push(page.toDataURL('image/jpeg', 0.9));
      }
      return out;
    },
    labels: deps.labels,
  });

  const blob = await writePptx(slides, { title: agenda.title, background, theme }, 'blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(agenda);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

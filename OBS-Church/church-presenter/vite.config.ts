import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const church = resolve(here, '../../Church');

/** The Bibles shipped beside the pages: 和合本 from the church website, and the KJV. */
function bible(): Plugin {
  return {
    name: 'church-bible',
    writeBundle(options) {
      const out = resolve(options.dir!, 'bible');
      if (!existsSync(out)) mkdirSync(out, { recursive: true });
      cpSync(resolve(church, 'public/bible'), out, { recursive: true });
      // King James Version (public domain), kept in this project.
      cpSync(resolve(here, 'bible-en'), resolve(options.dir!, 'bible-en'), { recursive: true });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), bible()],
  resolve: {
    alias: {
      // Shared with the church website: the PPT reader, scripture paging, Bible book list.
      '@church': church,
      // OBS's own typeface (Open Sans), so the panel's text matches the rest of OBS.
      '@obs-fonts': resolve(here, '../frontend/forms/fonts'),
      // Code under Church/ imports these; resolve them here, not from Church/node_modules.
      fflate: resolve(here, 'node_modules/fflate'),
    },
  },
  server: {
    fs: { allow: [resolve(here, '../..')] },
    // During development the Bible files are served from the website's copy.
    proxy: {},
  },
  build: {
    // Installed with the OBS frontend's data (data/obs-studio/church-presenter).
    outDir: resolve(here, '../frontend/data/church-presenter'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        panel: resolve(here, 'panel.html'),
        output: resolve(here, 'output.html'),
      },
    },
  },
});

/**
 * One-off importer for the online Bible reader.
 *
 * Downloads 和合本 (Chinese Union Version, 1919 — public domain) from bolls.life
 * and splits it into one file per book under public/bible/, so the reader ships
 * with the site and never depends on a third party at meeting time.
 *
 * Run once (or to refresh):  node ./scripts/fetch-bible.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://bolls.life/static/translations/CUV.json';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../public/bible');

/**
 * 和合本 is stored with a space between every character. Strip the ASCII
 * spaces but keep the ideographic space (U+3000) that precedes 神 — that
 * blank is the translation's deliberate mark of reverence, not padding.
 */
const clean = (text) =>
  text.replace(/<[^>]*>/g, '').replace(/ +/g, '').trim();

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
const verses = await response.json();
if (!Array.isArray(verses) || verses.length === 0) throw new Error('Unexpected payload: expected a non-empty array of verses.');

// book -> chapter -> verse[] (verse numbers are 1-based and contiguous in this source).
const books = new Map();
for (const { book, chapter, verse, text } of verses) {
  if (!books.has(book)) books.set(book, new Map());
  const chapters = books.get(book);
  if (!chapters.has(chapter)) chapters.set(chapter, []);
  chapters.get(chapter)[verse - 1] = clean(text);
}

await mkdir(outDir, { recursive: true });

let chapterCount = 0;
for (const [book, chapters] of [...books].sort((a, b) => a[0] - b[0])) {
  const payload = {};
  for (const [chapter, list] of [...chapters].sort((a, b) => a[0] - b[0])) {
    if (list.some((v) => v === undefined)) throw new Error(`Gap in verses: book ${book} chapter ${chapter}`);
    payload[chapter] = list;
    chapterCount += 1;
  }
  const name = String(book).padStart(2, '0');
  await writeFile(path.join(outDir, `${name}.json`), JSON.stringify(payload), 'utf8');
}

console.log(`Wrote ${books.size} books / ${chapterCount} chapters / ${verses.length} verses to public/bible/`);

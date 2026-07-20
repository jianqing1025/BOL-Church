// 每次部署自動把 src/version.ts 的 patch 版本 +1（例如 1.0.13 -> 1.0.14）。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'src', 'version.ts');
const src = readFileSync(file, 'utf8');

const match = src.match(/APP_VERSION = '(\d+)\.(\d+)\.(\d+)'/);
if (!match) {
  console.error('bump-version: 找不到 APP_VERSION，跳過。');
  process.exit(1);
}
const [, major, minor, patch] = match;
const next = `${major}.${minor}.${Number(patch) + 1}`;
writeFileSync(file, src.replace(/APP_VERSION = '\d+\.\d+\.\d+'/, `APP_VERSION = '${next}'`));
console.log(`bump-version: ${major}.${minor}.${patch} -> ${next}`);

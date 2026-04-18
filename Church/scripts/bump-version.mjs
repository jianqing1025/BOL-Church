import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const versionPath = path.resolve(__dirname, '../constants/appVersion.ts');
const source = await readFile(versionPath, 'utf8');
const match = source.match(/APP_VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'/);

if (!match) {
  throw new Error(`Could not find APP_VERSION in ${versionPath}`);
}

let major = Number(match[1]);
let minor = Number(match[2]);
let patch = Number(match[3]);

patch += 1;
if (patch > 9) {
  patch = 0;
  minor += 1;
}
if (minor > 9) {
  minor = 0;
  major += 1;
}

const nextVersion = `${major}.${minor}.${patch}`;
await writeFile(versionPath, source.replace(match[0], `APP_VERSION = '${nextVersion}'`), 'utf8');

console.log(`Version bumped to V${nextVersion}`);

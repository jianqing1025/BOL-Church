// Builds the unpacked app, then zips it into release/ as one top-level folder.
//
// A folder in a zip, not the portable single-file exe: that one unpacks itself
// to a temp directory on every launch (slow) and doubles the download. The
// build goes to the temp directory because Windows Defender holds files under
// release/ long enough to break electron-builder's final rename.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { version, build } = require('./package.json');

const out = path.join(os.tmpdir(), `bolccop-meeting-build-${version}`);
fs.rmSync(out, { recursive: true, force: true });
const builder = path.join(__dirname, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');
fs.mkdirSync(path.join(__dirname, 'release'), { recursive: true });

// `--exe`: a single portable .exe instead of the zip. Smaller to download
// (7z inside), but it unpacks itself to a temp folder on every launch.
if (process.argv.includes('--exe')) {
  execFileSync(builder, ['--win', 'portable', '--x64', `-c.directories.output=${out}`, `-c.artifactName=BOLCCOP-Meeting-${version}-x64.exe`], { stdio: 'inherit', shell: true });
  const exe = path.join(__dirname, 'release', `BOLCCOP-Meeting-${version}-x64.exe`);
  fs.copyFileSync(path.join(out, `BOLCCOP-Meeting-${version}-x64.exe`), exe);
  console.log(`${exe}  ${(fs.statSync(exe).size / 1024 / 1024).toFixed(1)} MB`);
  process.exit(0);
}
execFileSync(builder, ['--win', 'dir', '--x64', `-c.directories.output=${out}`], { stdio: 'inherit', shell: true });

const folder = path.join(out, 'BOLCCOP Meeting');
fs.renameSync(path.join(out, 'win-unpacked'), folder);
fs.writeFileSync(path.join(folder, '使用說明.txt'), [
  `${build.productName} ${version}`,
  '',
  '1. 把整個資料夾解壓縮到電腦上（例如「文件」），不要直接在壓縮檔裡開啟。',
  `2. 開啟資料夾，按兩下「${build.productName}.exe」。`,
  '3. 若出現「Windows 已保護您的電腦」：按「其他資訊」→「仍要執行」。只有第一次需要。',
  `4. 想放到桌面：在「${build.productName}.exe」上按右鍵 →「顯示其他選項」→「傳送到」→「桌面 (建立捷徑)」。`,
  '',
].join('\r\n'), 'utf8');

const zip = path.join(__dirname, 'release', `BOLCCOP-Meeting-${version}-win-x64.zip`);
fs.rmSync(zip, { force: true });
execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${folder}' -DestinationPath '${zip}' -CompressionLevel Optimal`], { stdio: 'inherit' });
console.log(`${zip}  ${(fs.statSync(zip).size / 1024 / 1024).toFixed(1)} MB`);

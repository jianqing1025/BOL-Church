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

/** Zips one file into release/ next to it — how both installers are offered for download. */
const WINDOWS_TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');

function zipOne(file) {
  const zip = file.replace(/\.exe$/, '.zip');
  fs.rmSync(zip, { force: true });
  // Windows' own tar (bsdtar) writes zips and, unlike Compress-Archive, fails loudly.
  // Named by full path: under npm the PATH can find Git's GNU tar first, which
  // ignores -a and writes a plain tar that Windows refuses to open as a zip.
  // (Compress-Archive printed an error for a file the virus scanner still held
  // and exited 0, leaving no zip behind).
  // A freshly written exe is held by the virus scanner for a few seconds.
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync(WINDOWS_TAR, ['--format', 'zip', '-c', '-f', path.basename(zip), path.basename(file)], { cwd: path.dirname(file), stdio: 'pipe' });
      const magic = Buffer.alloc(2);
      const fd = fs.openSync(zip, 'r'); fs.readSync(fd, magic, 0, 2, 0); fs.closeSync(fd);
      if (magic.toString() !== 'PK') throw new Error(`${zip} is not a zip`);
      break;
    } catch (error) {
      fs.rmSync(zip, { force: true });
      if (attempt >= 10) throw error;
      execFileSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 3']);
    }
  }
  for (const f of [file, zip]) console.log(`${f}  ${(fs.statSync(f).size / 1024 / 1024).toFixed(1)} MB`);
}

// `--exe`: a single portable .exe (plus its zip). Smaller to download (7z
// inside), but it unpacks itself to a temp folder on every launch.
// `--setup`: an installer (plus its zip) — per-user, no admin rights, with
// desktop and Start menu shortcuts.
for (const [flag, target, name] of [['--exe', 'portable', `BOLCCOP-Meeting-Client-${version}-x64.exe`], ['--setup', 'nsis', `BOLCCOP-Meeting-Client-Setup-${version}-x64.exe`]]) {
  if (!process.argv.includes(flag)) continue;
  execFileSync(builder, ['--win', target, '--x64', `-c.directories.output=${out}`, `-c.artifactName=${name}`], { stdio: 'inherit', shell: true });
  const exe = path.join(__dirname, 'release', name);
  fs.copyFileSync(path.join(out, name), exe);
  zipOne(exe);
  process.exit(0);
}
execFileSync(builder, ['--win', 'dir', '--x64', `-c.directories.output=${out}`], { stdio: 'inherit', shell: true });

const folder = path.join(out, 'BOLCCOP Meeting Client');
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

const zip = path.join(__dirname, 'release', `BOLCCOP-Meeting-Client-${version}-win-x64.zip`);
fs.rmSync(zip, { force: true });
execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${folder}' -DestinationPath '${zip}' -CompressionLevel Optimal`], { stdio: 'inherit' });
console.log(`${zip}  ${(fs.statSync(zip).size / 1024 / 1024).toFixed(1)} MB`);

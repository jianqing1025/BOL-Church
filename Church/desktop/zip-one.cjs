// Shared by the Meeting Client and Admin builds.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

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

module.exports = { zipOne };

// Builds the Windows installer and zips it into release/ (the zip is what the site offers).
// The build goes to the temp directory because Windows Defender holds files under
// release/ long enough to break electron-builder's final rename (same as Church/desktop).
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { version } = require('./package.json');

const name = `BOLCCOP-Finance-Setup-${version}-x64.exe`;
const out = path.join(os.tmpdir(), `bolccop-finance-build-${version}`);
fs.rmSync(out, { recursive: true, force: true });
const builder = path.join(__dirname, 'node_modules', '.bin', 'electron-builder.cmd');
execFileSync(builder, ['--win', 'nsis', '--x64', `-c.directories.output=${out}`, `-c.artifactName=${name}`], { stdio: 'inherit', shell: true });

const release = path.join(__dirname, 'release');
fs.mkdirSync(release, { recursive: true });
const exe = path.join(release, name);
fs.copyFileSync(path.join(out, name), exe);

// Windows' own tar writes real zips (Git's GNU tar on PATH does not). A fresh exe is
// held by the virus scanner for a few seconds, so retry.
const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const zip = exe.replace(/\.exe$/, '.zip');
for (let attempt = 1; ; attempt++) {
  try {
    fs.rmSync(zip, { force: true });
    execFileSync(tar, ['--format', 'zip', '-c', '-f', path.basename(zip), path.basename(exe)], { cwd: release, stdio: 'pipe' });
    if (fs.readFileSync(zip).subarray(0, 2).toString() !== 'PK') throw new Error(`${zip} is not a zip`);
    break;
  } catch (error) {
    if (attempt >= 10) throw error;
    execFileSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 3']);
  }
}
for (const f of [exe, zip]) console.log(`${f}  ${(fs.statSync(f).size / 1024 / 1024).toFixed(1)} MB`);

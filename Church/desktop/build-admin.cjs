// Builds the BOLCCOP Admin installer and its zip into release/.
// Builds in the temp folder (Windows Defender holds files under release/ long
// enough to break electron-builder's final rename), then copies it over.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ADMIN_VERSION = require('./admin-builder.cjs').extraMetadata.version;
const { zipOne } = require('./zip-one.cjs');

const out = path.join(os.tmpdir(), `bolccop-admin-build-${ADMIN_VERSION}`);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(__dirname, 'release'), { recursive: true });
const builder = path.join(__dirname, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');
const name = `BOLCCOP-Admin-Setup-${ADMIN_VERSION}-x64.exe`;

execFileSync(builder, ['--config', 'admin-builder.cjs', '--win', 'nsis', '--x64', `-c.directories.output=${out}`, `-c.artifactName=${name}`], { stdio: 'inherit', shell: true, cwd: __dirname });
const exe = path.join(__dirname, 'release', name);
fs.copyFileSync(path.join(out, name), exe);
zipOne(exe);

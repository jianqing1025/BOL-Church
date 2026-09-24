// 聚會內容 on disk for the desktop app: a BOLCCOP folder next to the exe, with
// the agendas in one JSON file and pictures under files/. Local videos are not
// copied — an item keeps the path the host picked.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif', 'video/mp4': '.mp4', 'video/webm': '.webm' };
const TYPE = Object.fromEntries(Object.entries(EXT).map(([type, ext]) => [ext, type]));
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function writable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.write-test');
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return true;
  } catch { return false; }
}

/**
 * Where the content lives. A portable exe runs from a temp copy of itself; its
 * launcher names the real folder in PORTABLE_EXECUTABLE_DIR. An installed copy
 * keeps it in Documents instead: its uninstaller — which an upgrade also runs —
 * deletes the whole install folder. An exe somewhere read-only (Program Files)
 * falls back to Documents rather than failing.
 */
function resolveContentDir({ portableDir, exePath, isPackaged, devDir, documentsDir }) {
  const exeDir = path.dirname(exePath || '.');
  const installed = !portableDir && isPackaged
    && fs.existsSync(exeDir) && fs.readdirSync(exeDir).some((name) => /^Uninstall .*\.exe$/i.test(name));
  const base = portableDir || (isPackaged ? exeDir : devDir);
  const primary = path.join(installed ? documentsDir : base, 'BOLCCOP');
  if (writable(primary)) return primary;
  const fallback = path.join(documentsDir, 'BOLCCOP');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

/** Windows paths compare without regard to case or slash direction. */
function sameFile(a, b) {
  const norm = (p) => path.resolve(p).toLowerCase();
  return norm(a) === norm(b);
}

class AgendaFolder {
  constructor(dir) {
    this.dir = dir;
    this.filesDir = path.join(dir, 'files');
    this.file = path.join(dir, '聚會內容.json');
    fs.mkdirSync(this.filesDir, { recursive: true });
  }

  list() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(data.agendas) ? data.agendas : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  /** Written to a temp file and renamed, so a crash mid-write never leaves half a file. */
  writeAll(agendas) {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, agendas }, null, 2));
    fs.renameSync(tmp, this.file);
  }

  save(agenda) {
    if (!agenda || typeof agenda.id !== 'string' || !Array.isArray(agenda.items)) throw new Error('Not an agenda');
    this.writeAll([...this.list().filter((a) => a.id !== agenda.id), agenda]);
  }

  remove(id) {
    this.writeAll(this.list().filter((a) => a.id !== id));
    this.prune();
  }

  putFile(bytes, type) {
    const id = crypto.randomUUID();
    fs.writeFileSync(path.join(this.filesDir, id + (EXT[type] || '')), Buffer.from(bytes));
    return id;
  }

  /** Only a well-formed id is ever turned into a path. */
  findFile(id) {
    if (typeof id !== 'string' || !ID.test(id)) return null;
    const name = fs.readdirSync(this.filesDir).find((n) => n === id || n.startsWith(`${id}.`));
    return name ? path.join(this.filesDir, name) : null;
  }

  getFile(id) {
    const file = this.findFile(id);
    if (!file) return null;
    const bytes = fs.readFileSync(file);
    return { bytes, type: TYPE[path.extname(file).toLowerCase()] || 'application/octet-stream', size: bytes.length };
  }

  deleteFile(id) {
    const file = this.findFile(id);
    if (file) fs.rmSync(file, { force: true });
  }

  /** Deletes stored files no agenda refers to any more. */
  prune() {
    const used = new Set();
    for (const agenda of this.list()) {
      for (const item of agenda.items) if ((item.kind === 'image' || item.kind === 'localVideo') && item.fileId) used.add(item.fileId);
    }
    for (const name of fs.readdirSync(this.filesDir)) {
      if (!used.has(name.split('.')[0])) fs.rmSync(path.join(this.filesDir, name), { force: true });
    }
  }

  /** Every video path an agenda refers to — the only outside files the app will serve. */
  videoPaths() {
    return this.list().flatMap((a) => a.items).filter((i) => i.kind === 'localVideo' && typeof i.path === 'string' && i.path).map((i) => i.path);
  }

  usage() {
    let bytes = 0;
    for (const name of fs.readdirSync(this.filesDir)) bytes += fs.statSync(path.join(this.filesDir, name)).size;
    try { bytes += fs.statSync(this.file).size; } catch { /* nothing saved yet */ }
    return bytes;
  }
}

module.exports = { AgendaFolder, resolveContentDir, sameFile };

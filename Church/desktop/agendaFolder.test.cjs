const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AgendaFolder, resolveContentDir, sameFile } = require('./agendaFolder.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'agenda-folder-'));
const agenda = (id, items = []) => ({ id, title: id, date: '2026-09-29', note: '', items, updatedAt: 1 });

test('content lives in BOLCCOP next to the real exe, falling back to Documents when that is read-only', () => {
  const exeDir = tmp();
  const docs = tmp();
  // A portable build runs from a temp copy; the launcher names the real folder.
  assert.equal(resolveContentDir({ portableDir: exeDir, exePath: 'C:/Temp/x/app.exe', isPackaged: true, devDir: 'unused', documentsDir: docs }),
    path.join(exeDir, 'BOLCCOP'));
  assert.equal(resolveContentDir({ portableDir: '', exePath: path.join(exeDir, 'app.exe'), isPackaged: true, devDir: 'unused', documentsDir: docs }),
    path.join(exeDir, 'BOLCCOP'));
  // An installed copy: its uninstaller would take the content with it, so Documents.
  const installDir = tmp();
  fs.writeFileSync(path.join(installDir, 'Uninstall BOLCCOP Meeting Dev.exe'), '');
  assert.equal(resolveContentDir({ portableDir: '', exePath: path.join(installDir, 'app.exe'), isPackaged: true, devDir: 'unused', documentsDir: docs }),
    path.join(docs, 'BOLCCOP'));
  const blocked = path.join(exeDir, 'blocked');
  fs.writeFileSync(blocked, 'a file, so BOLCCOP cannot be created inside it');
  assert.equal(resolveContentDir({ portableDir: blocked, exePath: '', isPackaged: true, devDir: '', documentsDir: docs }),
    path.join(docs, 'BOLCCOP'));
});

test('agendas are saved, replaced and removed in one JSON file', () => {
  const folder = new AgendaFolder(tmp());
  folder.save(agenda('a'));
  folder.save(agenda('b'));
  folder.save({ ...agenda('a'), title: 'A2' });
  assert.deepEqual(folder.list().map((a) => a.title).sort(), ['A2', 'b']);
  folder.remove('b');
  assert.deepEqual(folder.list().map((a) => a.id), ['a']);
});

test('stored files round-trip and are swept once no agenda refers to them', () => {
  const folder = new AgendaFolder(tmp());
  const kept = folder.putFile(Buffer.from('kept'), 'image/png');
  const orphan = folder.putFile(Buffer.from('orphan'), 'image/jpeg');
  folder.save(agenda('a', [{ id: 'i', kind: 'image', title: '', fileId: kept }]));
  assert.deepEqual(folder.getFile(kept), { bytes: Buffer.from('kept'), type: 'image/png', size: 4 });
  folder.prune();
  assert.ok(folder.getFile(kept));
  assert.equal(folder.getFile(orphan), null);
  assert.equal(folder.getFile('../../etc/passwd'), null, 'ids never reach the filesystem as paths');
});

test('local videos are referenced by path and only those paths are served', () => {
  const folder = new AgendaFolder(tmp());
  const video = path.join(tmp(), 'sermon.mp4');
  fs.writeFileSync(video, 'x');
  folder.save(agenda('a', [{ id: 'v', kind: 'localVideo', title: '', fileId: '', path: video, fileName: 'sermon.mp4', size: 1 }]));
  assert.ok(folder.videoPaths().some((p) => sameFile(p, video)));
  assert.ok(!folder.videoPaths().some((p) => sameFile(p, 'C:/Windows/win.ini')));
});

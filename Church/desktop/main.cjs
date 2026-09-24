const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, protocol, screen, session, shell } = require('electron');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const { AgendaFolder, resolveContentDir, sameFile } = require('./agendaFolder.cjs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { MEETING_URL, trustedMeeting, externalUrl, windowBounds } = require('./policy.cjs');
app.setName('BOLCCOP Meeting Dev');
// Local videos reach the page through this scheme: standard + secure so a
// https page may load it, CORS so the <video> can be captured for broadcast.
protocol.registerSchemesAsPrivileged([{ scheme: 'meeting-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
let agendaFolder = null;
/** Videos picked in the file dialog this session, before an agenda refers to them. */
const pickedVideos = new Set();
let mainWindow, pickerWindow, pendingCapture, captureType = null;
let stage = 'auth', compact = false, sharing = false, quitting = false, normalBounds, normalMaximized = false;
const smoke = process.env.MEETING_SMOKE === '1';
const pickerUrl = pathToFileURL(path.join(__dirname, 'picker.html')).href;
// Painted behind the page while it resizes, so a stage change never flashes a dark strip.
const STAGE_BACKGROUND = { auth: '#ffffff', pick: '#f6f7fb', room: '#0b0f17' };
const MIN_SIZE = { auth: [380, 500], pick: [760, 560], room: [760, 560] };

function trustedSender(event) {
  return mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame && trustedMeeting(event.senderFrame.url);
}
function workArea() {
  return screen.getDisplayMatching(mainWindow.getBounds()).workArea;
}
function sendWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('meeting:compact-state', compact);
  mainWindow.webContents.send('meeting:window-state', { compact, maximized: mainWindow.isMaximized(), sharing });
}
/** Sizes the window for a stage; the sign-in card is fixed, the rest resize freely. */
function applyStage(value) {
  const area = workArea();
  const [minW, minH] = MIN_SIZE[value];
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  mainWindow.setBackgroundColor(STAGE_BACKGROUND[value]);
  mainWindow.setMinimumSize(Math.min(minW, area.width), Math.min(minH, area.height));
  // A fixed-size card, not a resizable window: min = max. Kept "resizable" so
  // Windows 11 still draws its rounded corners and shadow around the card.
  mainWindow.setMaximumSize(value === 'auth' ? minW : 0, value === 'auth' ? minH : 0);
  mainWindow.setMaximizable(value !== 'auth');
  mainWindow.setBounds(windowBounds(value, area));
}
/**
 * Whole-screen sharing collapses the meeting to a floating bar, like Zoom's
 * share toolbar, so the presenter sees what they are presenting.
 */
function setCompact(value) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const next = Boolean(value && sharing && captureType === 'screen' && stage === 'room');
  if (next === compact) return;
  if (next) { normalMaximized = mainWindow.isMaximized(); if (normalMaximized) mainWindow.unmaximize(); normalBounds = mainWindow.getBounds(); }
  compact = next;
  const area = workArea();
  mainWindow.setMinimumSize(next ? 420 : Math.min(MIN_SIZE.room[0], area.width), next ? 56 : Math.min(MIN_SIZE.room[1], area.height));
  mainWindow.setMaximizable(!next);
  mainWindow.setAlwaysOnTop(next, 'floating');
  mainWindow.setBounds(next ? windowBounds('compact', area) : normalBounds || windowBounds('room', area));
  if (!next && normalMaximized) mainWindow.maximize();
  sendWindowState();
}
/**
 * While anything is shared the meeting window is excluded from capture, so a
 * whole-screen share never shows the meeting inside itself — even when the
 * presenter expands it back to the full view.
 */
function setSharing(value) {
  const started = value && !sharing;
  sharing = value;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setContentProtection(value);
  if (!value) { setCompact(false); captureType = null; }
  else if (started) setCompact(true);
  sendWindowState();
}
function finishCapture(selection) {
  const pending = pendingCapture;
  pendingCapture = null;
  if (pickerWindow && !pickerWindow.isDestroyed()) pickerWindow.close();
  pickerWindow = null;
  if (!pending) return;
  const source = selection && pending.sources.find(item => item.id === selection.id);
  if (!source) { pending.callback(null); return; }
  captureType = source.id.startsWith('screen:') ? 'screen' : 'window';
  pending.callback({ video: source, ...(selection.audio && pending.audioRequested ? { audio: 'loopback' } : {}) });
}

function contentFolder() {
  if (!agendaFolder) {
    const override = process.defaultApp && process.env.MEETING_CONTENT_DIR;
    agendaFolder = new AgendaFolder(override || resolveContentDir({
      portableDir: process.env.PORTABLE_EXECUTABLE_DIR || '',
      exePath: app.getPath('exe'),
      isPackaged: app.isPackaged,
      devDir: __dirname,
      documentsDir: app.getPath('documents'),
    }));
  }
  return agendaFolder;
}
function servableVideo(file) {
  return typeof file === 'string' && ([...pickedVideos].some((p) => sameFile(p, file)) || contentFolder().videoPaths().some((p) => sameFile(p, file)));
}
/** Serves a picked video, honouring Range so the player can seek. */
async function serveVideo(request) {
  const file = new URL(request.url).searchParams.get('p');
  if (!servableVideo(file) || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
  const { size } = fs.statSync(file);
  const type = /\.webm$/i.test(file) ? 'video/webm' : /\.mov$/i.test(file) ? 'video/quicktime' : 'video/mp4';
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  if (!range) return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
    status: 206, headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
  });
}

app.whenReady().then(() => {
  const ses = session.fromPartition('persist:meeting-dev');
  ses.protocol.handle('meeting-file', serveVideo);
  const allowed = ['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write', 'speaker-selection'];
  ses.setPermissionCheckHandler((contents, permission, _origin, details) => {
    if (contents !== mainWindow?.webContents || !trustedMeeting(details.requestingUrl || '')) return false;
    return allowed.includes(permission);
  });
  // Camera and microphone are granted silently: the meeting's own buttons are
  // the consent, as in Zoom. Windows privacy settings still apply.
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (contents !== mainWindow?.webContents || !details.isMainFrame || !trustedMeeting(details.requestingUrl || '') || !allowed.includes(permission)) { callback(false); return; }
    const types = details.mediaTypes || [];
    callback(types.every(type => ['audio', 'video'].includes(type)));
  });
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    if (smoke) console.log('Capture request', request.userGesture, request.frame?.url, request.frame === mainWindow?.webContents.mainFrame);
    if (pendingCapture || request.frame !== mainWindow?.webContents.mainFrame || !trustedMeeting(request.frame.url)) { callback(null); return; }
    let resolved = false;
    const respond = streams => { if (!resolved) { resolved = true; callback(streams); } };
    pendingCapture = { callback: respond, sources: [], audioRequested: request.audioRequested };
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 480, height: 270 }, fetchWindowIcons: true });
      if (!pendingCapture) return;
      // The meeting's own window is never offered: sharing it would show the
      // meeting inside itself. Matched by native handle, not by title.
      const handle = id => id.split(':').slice(0, 2).join(':');
      const own = handle(mainWindow.getMediaSourceId());
      pendingCapture.sources = sources.filter(source => handle(source.id) !== own);
      const area = workArea();
      pickerWindow = new BrowserWindow({
        title: '選擇分享內容', width: Math.min(820, area.width), height: Math.min(600, area.height), parent: mainWindow, modal: true,
        frame: false, resizable: false, minimizable: false, maximizable: false, show: false, backgroundColor: '#ffffff',
        webPreferences: { preload: path.join(__dirname, 'picker-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
      });
      pickerWindow.setMenu(null);
      pickerWindow.on('closed', () => { pickerWindow = null; finishCapture(null); });
      pickerWindow.once('ready-to-show', () => { if (!smoke) pickerWindow?.show(); });
      await pickerWindow.loadFile(path.join(__dirname, 'picker.html'));
    } catch (error) { if (smoke) console.error('Capture error', error); finishCapture(null); respond(null); }
  });
  mainWindow = new BrowserWindow({
    ...windowBounds('auth', screen.getPrimaryDisplay().workArea), title: 'BOLCCOP Meeting Dev', frame: false, backgroundColor: STAGE_BACKGROUND.auth,
    show: false, maximizable: false, autoHideMenuBar: true,
    webPreferences: { partition: 'persist:meeting-dev', preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', spellcheck: false },
  });
  mainWindow.setMenu(null);
  mainWindow.setMaximumSize(...MIN_SIZE.auth);
  mainWindow.webContents.on('page-title-updated', event => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (externalUrl(url)) void shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event) => { if (!trustedMeeting(event.url)) { event.preventDefault(); if (externalUrl(event.url)) void shell.openExternal(event.url); } });
  mainWindow.webContents.on('will-redirect', (event) => { if (!trustedMeeting(event.url)) event.preventDefault(); });
  mainWindow.webContents.on('did-start-navigation', (event) => { if (event.isMainFrame && !event.isSameDocument) { setSharing(false); finishCapture(null); } });
  mainWindow.on('maximize', sendWindowState);
  mainWindow.on('unmaximize', sendWindowState);
  // Closing mid-meeting goes through the meeting's own leave flow (its in-app
  // confirmation and the host's end-meeting choice) instead of a system dialog.
  mainWindow.on('close', event => {
    if (stage === 'room' && !quitting && !smoke) { event.preventDefault(); setCompact(false); mainWindow.webContents.send('meeting:close-request'); }
  });
  mainWindow.on('closed', () => { finishCapture(null); mainWindow = null; });
  mainWindow.once('ready-to-show', () => { if (!smoke) mainWindow.show(); });
  mainWindow.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3 || smoke) return;
    void dialog.showMessageBox(mainWindow, { type: 'error', message: '無法連線至會議服務，請檢查網路。', buttons: ['重試', '關閉'] }).then(({ response }) => { if (response === 0) void mainWindow.loadURL(MEETING_URL); else mainWindow.close(); });
  });
  void mainWindow.loadURL(MEETING_URL);
});

ipcMain.on('meeting:stage', (event, value) => {
  if (!trustedSender(event) || !['auth', 'pick', 'room'].includes(value) || stage === value) return;
  stage = value;
  if (value !== 'room') setSharing(false);
  applyStage(value);
  sendWindowState();
});
ipcMain.on('meeting:sharing', (event, value) => { if (trustedSender(event) && typeof value === 'boolean' && value !== sharing) setSharing(value); });
ipcMain.on('meeting:expand', event => { if (trustedSender(event)) setCompact(false); });
ipcMain.on('meeting:compact', event => { if (trustedSender(event)) setCompact(true); });
// The share bar grows downward for its raised-hands list, then shrinks back.
ipcMain.on('meeting:compact-height', (event, height) => {
  if (!trustedSender(event) || !compact || !Number.isFinite(height)) return;
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds({ ...bounds, height: Math.round(Math.min(Math.max(height, 56), 480, workArea().height)) });
});
ipcMain.on('meeting:minimize', event => { if (trustedSender(event)) mainWindow.minimize(); });
ipcMain.on('meeting:toggle-maximize', event => {
  if (!trustedSender(event) || compact || stage === 'auth') return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
});
ipcMain.on('meeting:close', event => { if (trustedSender(event)) mainWindow.close(); });
// Hidden first, closed a moment later: the page gets to hang up cleanly (and a
// host's end-meeting command gets out) without the room list flashing up.
ipcMain.on('meeting:quit', event => {
  if (!trustedSender(event) || quitting) return;
  quitting = true;
  mainWindow.hide();
  setTimeout(() => mainWindow?.close(), 600);
});
ipcMain.handle('capture:list', event => {
  if (event.sender !== pickerWindow?.webContents || event.senderFrame.url !== pickerUrl || !pendingCapture) return { sources: [], audio: false };
  return {
    audio: Boolean(pendingCapture.audioRequested),
    sources: pendingCapture.sources.map(source => ({
      id: source.id, name: source.name, screen: source.id.startsWith('screen:'),
      thumbnail: source.thumbnail.isEmpty() ? '' : source.thumbnail.toDataURL(),
      icon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : '',
    })),
  };
});
// 聚會內容 on disk. Each channel checks the sender is the meeting page; paths
// never come from the page except ones it was given by the file dialog.
const agendaIpc = (channel, handler) => ipcMain.handle(channel, (event, ...args) => {
  if (!trustedSender(event)) throw new Error('Not allowed');
  return handler(...args);
});
agendaIpc('agenda:describe', () => ({ dir: contentFolder().dir, bytes: contentFolder().usage() }));
agendaIpc('agenda:list', () => contentFolder().list());
agendaIpc('agenda:save', (agenda) => { contentFolder().save(agenda); });
agendaIpc('agenda:remove', (id) => { contentFolder().remove(id); });
agendaIpc('agenda:prune', () => { contentFolder().prune(); });
agendaIpc('agenda:putFile', (bytes, type) => contentFolder().putFile(new Uint8Array(bytes), String(type || '')));
agendaIpc('agenda:getFile', (id) => contentFolder().getFile(id));
agendaIpc('agenda:deleteFile', (id) => { contentFolder().deleteFile(id); });
agendaIpc('agenda:pickVideo', async () => {
  // Tests only: running from source, a preset path stands in for the dialog.
  const preset = process.defaultApp && process.env.MEETING_PICK_VIDEO;
  const result = preset ? { canceled: false, filePaths: [preset] } : await dialog.showOpenDialog(mainWindow, {
    title: '選擇影片', properties: ['openFile'],
    filters: [{ name: '影片', extensions: ['mp4', 'm4v', 'webm', 'mov'] }],
  });
  const file = result.filePaths[0];
  if (result.canceled || !file) return null;
  pickedVideos.add(file);
  return { path: file, name: require('node:path').basename(file), size: fs.statSync(file).size };
});
agendaIpc('agenda:videoExists', (file) => servableVideo(file) && fs.existsSync(file));
ipcMain.on('capture:choose', (event, selection) => { if (event.sender === pickerWindow?.webContents && event.senderFrame.url === pickerUrl) finishCapture(selection); });
app.on('window-all-closed', () => app.quit());

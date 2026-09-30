// 信望愛財務系統 Windows 桌面版：一個只顯示 https://finance.bolccop.org 的視窗。
// 介面與資料都來自正式站，網站部署後重新整理即生效；這裡改了才需要重新打包。
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');

const ORIGIN = 'https://finance.bolccop.org';
const START_URL = `${ORIGIN}/`;

const isOwn = url => { try { return new URL(url).origin === ORIGIN; } catch { return false; } };
const openOutside = url => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); };

const offlinePage = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8">
<title>信望愛財務系統</title>
<body style="margin:0;display:grid;place-items:center;height:100vh;font-family:'Microsoft JhengHei UI',sans-serif;background:#f5f7fb;color:#172033">
<div style="text-align:center"><h2>無法連線到財務系統</h2><p style="color:#68758a">請確認網路連線後再試一次。</p>
<button onclick="location.href='${START_URL}'" style="padding:.6rem 1.6rem;border:0;border-radius:8px;background:#f59e0b;color:#172033;font-weight:700;font-size:1rem;cursor:pointer">重試</button></div>`)}`;

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 620,
    title: '信望愛財務系統',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#f5f7fb',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  // 網站用它判斷是否在桌面版裡（例如不再顯示「下載 Windows 版」）。
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} BOLCCOP-Finance-Desktop/${app.getVersion()}`);

  // 站內連結留在 App 裡開；其他網址（附件、Email 等）交給系統瀏覽器。
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isOwn(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: path.join(__dirname, 'build', 'icon.png') } };
    openOutside(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isOwn(url) || url === offlinePage) return;
    event.preventDefault();
    openOutside(url);
  });
  win.webContents.on('did-fail-load', (_event, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && isOwn(url)) win.loadURL(offlinePage);
  });
  // F5 / Ctrl+R 重新整理，Ctrl +/-/0 縮放。
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (key === 'f5' || (input.control && key === 'r')) { event.preventDefault(); win.webContents.reload(); }
    else if (input.control && (key === '=' || key === '+')) { event.preventDefault(); win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5); }
    else if (input.control && key === '-') { event.preventDefault(); win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5); }
    else if (input.control && key === '0') { event.preventDefault(); win.webContents.setZoomLevel(0); }
  });

  win.loadURL(START_URL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  Menu.setApplicationMenu(null);
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}

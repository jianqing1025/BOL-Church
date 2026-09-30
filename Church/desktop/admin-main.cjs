// BOLCCOP Admin：教會網站後台的桌面版。就是一個開著 www.bolccop.org/admin 的視窗——
// 登入狀態留在本機、記住視窗大小，後台以外的連結交給系統瀏覽器。
const { app, BrowserWindow, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { ADMIN_URL, staysInApp, externalUrl } = require('./admin-policy.cjs');

app.setName('BOLCCOP Admin');
app.setAppUserModelId('org.bolccop.admin');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;
  const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

  const readBounds = () => {
    try {
      const saved = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
      return typeof saved.width === 'number' && typeof saved.height === 'number' ? saved : null;
    } catch {
      return null;
    }
  };
  const saveBounds = () => {
    if (!win || win.isDestroyed()) return;
    try {
      fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
    } catch { /* 存不了只是下次用預設大小 */ }
  };

  const openOutside = url => { if (externalUrl(url)) void shell.openExternal(url); };

  function createWindow() {
    const saved = readBounds();
    win = new BrowserWindow({
      width: saved?.width ?? 1400,
      height: saved?.height ?? 900,
      x: saved?.x,
      y: saved?.y,
      minWidth: 900,
      minHeight: 600,
      title: 'BOLCCOP Admin',
      icon: path.join(__dirname, 'build', 'admin-icon.png'),
      backgroundColor: '#f3f4f6',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        partition: 'persist:bolccop-admin',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    win.setMenuBarVisibility(false);
    if (saved?.maximized) win.maximize();
    win.once('ready-to-show', () => win.show());
    // 工作列上一律顯示「BOLCCOP Admin」，不隨網頁標題變動
    win.on('page-title-updated', event => event.preventDefault());
    win.on('close', saveBounds);

    // 後台以外的頁面（公開網站、YouTube、同工週報分頁…）用系統瀏覽器開
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (staysInApp(url)) {
        void win.loadURL(url);
      } else {
        openOutside(url);
      }
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (staysInApp(url)) return;
      event.preventDefault();
      openOutside(url);
    });

    // F5／Ctrl+R 重新整理、Ctrl+±／0 縮放——沒有選單列時也要能用
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const ctrl = input.control || input.meta;
      if (input.key === 'F5' || (ctrl && input.key.toLowerCase() === 'r')) {
        event.preventDefault();
        win.webContents.reload();
      } else if (ctrl && (input.key === '=' || input.key === '+')) {
        event.preventDefault();
        win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5);
      } else if (ctrl && input.key === '-') {
        event.preventDefault();
        win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5);
      } else if (ctrl && input.key === '0') {
        event.preventDefault();
        win.webContents.setZoomLevel(0);
      }
    });

    void win.loadURL(ADMIN_URL);
  }

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    // 後台用不到相機、麥克風、位置、通知：一律拒絕；只允許剪貼簿寫入（複製按鈕）
    session.fromPartition('persist:bolccop-admin').setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'clipboard-sanitized-write');
    });
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}

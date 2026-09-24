const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const assert = require('node:assert/strict');

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'meeting-desktop-smoke-'));
  // Set MEETING_DESKTOP_URL=http://localhost:2101/meeting to test an undeployed web build.
  const meetingUrl = process.env.MEETING_DESKTOP_URL || 'https://dev.bolccop.org/meeting';
  const env = { ...process.env, MEETING_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [path.resolve(__dirname), `--user-data-dir=${profile}`], env, timeout: 60000 });
  app.process().stdout.on('data', data => process.stdout.write(data));
  app.process().stderr.on('data', data => { if (String(data).includes('Capture')) process.stderr.write(data); });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('input[type="password"]', { timeout: 60000 });
    await page.screenshot({ path: path.join(__dirname, 'artifacts/login.png') });
    assert.equal(await page.locator('header').count(), 0, 'No website header in desktop login');
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    assert.equal(await page.evaluate(() => typeof window.meetingDesktop?.setStage), 'function');
    const loginBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    assert.ok(loginBounds.width <= 380 && loginBounds.height <= 500, 'The sign-in window is just the card');
    assert.equal(await page.getByRole('button', { name: '最小化 / Minimize' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '關閉 / Close' }).count(), 1);
    const loginScroll = await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight);
    assert.ok(loginScroll, 'No login scrollbar');
    // Exercise the UI without using a real meeting password or creating a live participant.
    await page.route('**/api/meeting/verify', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    await page.locator('input[type="text"]').fill('Desktop QA');
    await page.locator('input[type="password"]').fill('smoke-only');
    await page.locator('input[type="checkbox"]').uncheck();
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('h2');
    await page.waitForFunction(() => document.querySelectorAll('img').length >= 4);
    await page.screenshot({ path: path.join(__dirname, 'artifacts/rooms.png') });
    const pickerBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    assert.ok(pickerBounds.width > loginBounds.width, 'Room picker grows the same window');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    assert.equal(await page.locator('header').count(), 1, 'Only the app bar, no website header');
    assert.equal(await page.locator('footer').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), 'No page scrollbar on the room list');
    assert.equal(await page.getByRole('button', { name: '最大化 / Maximize' }).count(), 1);
    await app.evaluate(({ dialog }) => { globalThis.smokePermissionPrompts = 0; dialog.showMessageBox = async () => { globalThis.smokePermissionPrompts++; return { response: 0, checkboxChecked: false }; }; });
    // Chromium requires the requesting document to be focused for display capture.
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); });
    await page.waitForFunction(() => document.hasFocus());
    // The desktop capture chooser must support cancellation without starting a stream.
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'capture-smoke'; button.textContent = 'Capture smoke';
      button.onclick = () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then(s => { s.getTracks().forEach(t => t.stop()); window.captureResult = 'unexpected'; }, error => { window.captureError = String(error); window.captureResult = 'cancelled'; });
      document.body.append(button);
    });
    const opened = app.waitForEvent('window');
    await page.locator('#capture-smoke').click();
    const capture = await opened.catch(async error => { console.log(await page.evaluate(() => ({ result: window.captureResult, error: window.captureError, focus: document.hasFocus() }))); throw error; });
    await capture.waitForSelector('.source');
    assert.equal(await capture.locator('.source.selected').count(), 1, 'First screen is preselected');
    await capture.screenshot({ path: path.join(__dirname, 'artifacts/share-picker.png') });
    await capture.locator('#cancel').click();
    await page.waitForFunction(() => window.captureResult === 'cancelled');
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.focus(); });
    await page.waitForFunction(() => document.hasFocus());
    // Capture briefly without recording or transmitting, to exercise the native window lifecycle.
    await page.evaluate(() => {
      document.getElementById('capture-smoke').onclick = () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then(stream => { window.smokeStream = stream; });
      window.meetingDesktop.onCompact(value => { window.smokeCompact = value; });
    });
    const nextPicker = app.waitForEvent('window');
    await page.locator('#capture-smoke').click();
    const screenPicker = await nextPicker;
    await screenPicker.locator('section').first().locator('.source').first().dblclick();
    await page.waitForFunction(() => Boolean(window.smokeStream));
    await page.evaluate(() => { window.meetingDesktop.setStage('room'); window.meetingDesktop.setSharing(true); });
    await page.waitForFunction(() => window.smokeCompact === true);
    const compactState = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { bounds: w.getBounds(), top: w.isAlwaysOnTop() }; });
    assert.equal(compactState.top, true);
    assert.ok(compactState.bounds.height <= 190);
    await page.evaluate(() => { window.smokeStream.getTracks().forEach(track => track.stop()); window.meetingDesktop.setSharing(false); });
    await page.waitForFunction(() => window.smokeCompact === false);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), false);
    await app.evaluate(async ({ BrowserWindow }) => {
      const target = new BrowserWindow({ width: 480, height: 320, title: 'Meeting QA source', webPreferences: { sandbox: true } });
      await target.loadURL('data:text/html,<h1>Meeting QA source</h1>');
    });
    await app.evaluate(({ BrowserWindow }, url) => { BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith(url)).focus(); }, meetingUrl);
    await page.waitForFunction(() => document.hasFocus());
    await page.evaluate(() => { window.smokeStream = null; });
    const windowPickerEvent = app.waitForEvent('window');
    await page.locator('#capture-smoke').click();
    const windowPicker = await windowPickerEvent;
    await windowPicker.locator('.source').filter({ hasText: 'Meeting QA source' }).click();
    await windowPicker.locator('#share').click();
    await page.waitForFunction(() => Boolean(window.smokeStream));
    await page.evaluate(() => window.meetingDesktop.setSharing(true));
    // A round-trip IPC query follows the one-way share notification.
    assert.equal(await app.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith(url)).isAlwaysOnTop(), meetingUrl), false);
    assert.equal(await page.evaluate(() => window.smokeCompact), false);
    await page.evaluate(() => { window.smokeStream.getTracks().forEach(track => track.stop()); window.meetingDesktop.setSharing(false); });
    assert.equal(await app.evaluate(() => globalThis.smokePermissionPrompts), 0, 'Screen capture does not ask for microphone or camera permission');
    await page.evaluate(() => {
      window.WebSocket = class extends EventTarget {
        static OPEN = 1;
        readyState = 0;
        constructor() {
          super();
          setTimeout(() => {
            this.readyState = 1;
            this.dispatchEvent(new Event('open'));
            this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'welcome', userId: 'smoke', messages: [] }) }));
          }, 0);
        }
        send() {}
        close() { this.readyState = 3; }
      };
    });
    await page.route('**/api/meeting/livekit-token', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Offline UI test"}' }));
    await page.evaluate(() => { window.smokeDeviceRequests = 0; navigator.mediaDevices.getUserMedia = async () => { window.smokeDeviceRequests++; return new MediaStream(); }; document.getElementById('capture-smoke').remove(); });
    await page.getByRole('button', { name: '加入', exact: true }).first().click();
    await page.getByRole('button', { name: '加入', exact: true }).last().click();
    await page.getByRole('button', { name: '分享螢幕', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.smokeDeviceRequests), 0, 'Default desktop join does not open devices');
    const labels = await page.locator('button[aria-label]').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));
    assert.ok(labels.indexOf('分享螢幕') < labels.indexOf('更多'));
    await app.evaluate(({ BrowserWindow }, url) => {
      const main = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith(url));
      main.setMinimumSize(420, 56); main.setSize(600, 68); main.webContents.send('meeting:window-state', { compact: true, maximized: false, sharing: true });
    }, meetingUrl);
    await page.waitForFunction(() => document.querySelector('header')?.offsetParent === null);
    await app.evaluate(({ BrowserWindow }, url) => {
      const main = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith(url));
      main.show(); main.focus(); main.webContents.invalidate();
    }, meetingUrl);
    const controlBounds = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(b => b.textContent === '停止分享' && b.offsetParent);
      const rect = button.getBoundingClientRect();
      return { width: rect.width, bottom: rect.bottom, height: innerHeight };
    });
    assert.ok(controlBounds.width > 0 && controlBounds.bottom <= controlBounds.height);
    await page.waitForTimeout(800);
    const compactImage = await app.evaluate(async ({ BrowserWindow }, url) => {
      const main = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith(url));
      return (await main.webContents.capturePage()).toPNG().toString('base64');
    }, meetingUrl);
    await fs.writeFile(path.join(__dirname, 'artifacts/compact-controls.png'), Buffer.from(compactImage, 'base64'));
    assert.equal(await page.getByRole('button', { name: '關閉 / Close' }).count(), 0);
    console.log('PASS: isolated renderer, frameless login, room-only UI, capture with audio requested, cancellation, whole-screen compact/restoration, window share stays expanded, compact controls and share button order.');
  } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
})().catch(error => { console.error(error); process.exitCode = 1; });

// BOLCCOP Admin desktop app: which pages stay in the window.
// `electron admin-main.cjs` (process.defaultApp) may point at a local server for testing;
// a packaged build always opens the church site's admin.
const DEFAULT_ADMIN_URL = 'https://www.bolccop.org/admin';
const ADMIN_URL = (process.defaultApp && process.env.ADMIN_DESKTOP_URL) || DEFAULT_ADMIN_URL;
const ADMIN_ORIGIN = new URL(ADMIN_URL).origin;

/** Admin pages open in the app; everything else (public site, YouTube, email links) goes to the browser. */
function staysInApp(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === ADMIN_ORIGIN && (parsed.pathname === '/admin' || parsed.pathname.startsWith('/admin/'));
  } catch {
    return false;
  }
}

function externalUrl(url) {
  try { return ['https:', 'http:', 'mailto:'].includes(new URL(url).protocol); } catch { return false; }
}

module.exports = { ADMIN_URL, staysInApp, externalUrl };

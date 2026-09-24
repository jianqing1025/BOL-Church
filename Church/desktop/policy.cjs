const DEFAULT_MEETING_URL = 'https://www.bolccop.org/meeting';
// `electron .` (process.defaultApp) may point at a local Vite server for UI
// work; a packaged build always loads the church site.
const MEETING_URL = (process.defaultApp && process.env.MEETING_DESKTOP_URL) || DEFAULT_MEETING_URL;
const MEETING_ORIGIN = new URL(MEETING_URL).origin;

function trustedMeeting(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === MEETING_ORIGIN && /^\/meeting\/?$/.test(parsed.pathname);
  } catch { return false; }
}
function externalUrl(url) {
  try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch { return false; }
}
/** Window size per stage. The sign-in window is exactly the card; the share bar floats top-centre like Zoom's. */
const STAGE_SIZE = { auth: [380, 500], pick: [1040, 720], room: [1280, 800], compact: [700, 68] };
function windowBounds(stage, area) {
  const [width, height] = STAGE_SIZE[stage] || STAGE_SIZE.room;
  const w = Math.min(width, area.width);
  const h = Math.min(height, area.height);
  return { x: area.x + Math.round((area.width - w) / 2), y: stage === 'compact' ? area.y + 8 : area.y + Math.round((area.height - h) / 2), width: w, height: h };
}
module.exports = { MEETING_URL, trustedMeeting, externalUrl, windowBounds };

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { trustedMeeting, externalUrl, windowBounds } = require('./policy.cjs');
test('only the Dev meeting page can call privileged desktop operations', () => {
  assert.equal(trustedMeeting('https://dev.bolccop.org/meeting?v=1'), true);
  for (const url of ['https://dev.bolccop.org/admin', 'https://dev.bolccop.org.evil.test/meeting', 'http://dev.bolccop.org/meeting', 'file:///meeting', 'https://www.bolccop.org/meeting']) assert.equal(trustedMeeting(url), false);
});
test('external links reject executable protocols', () => {
  assert.equal(externalUrl('https://example.com'), true);
  for (const url of ['javascript:alert(1)', 'file:///C:/Windows', 'ms-settings:']) assert.equal(externalUrl(url), false);
});
test('compact controls stay within a display with negative coordinates', () => {
  const area = { x: -1920, y: 0, width: 1920, height: 1040 };
  const bounds = windowBounds('compact', area);
  assert.equal(bounds.y, area.y + 8, 'Share bar floats at the top, like Zoom');
  assert.ok(bounds.x >= area.x && bounds.x + bounds.width <= 0);
  const small = windowBounds('room', { x: 0, y: 0, width: 800, height: 600 });
  assert.deepEqual(small, { x: 0, y: 0, width: 800, height: 600 });
  assert.deepEqual(windowBounds('auth', { x: 0, y: 0, width: 1920, height: 1040 }), { x: 770, y: 270, width: 380, height: 500 });
});

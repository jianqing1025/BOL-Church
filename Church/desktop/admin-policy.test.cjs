const test = require('node:test');
const assert = require('node:assert');
const { ADMIN_URL, staysInApp, externalUrl } = require('./admin-policy.cjs');

test('opens the church admin by default', () => {
  assert.equal(ADMIN_URL, 'https://www.bolccop.org/admin');
});

test('only admin pages on the same site stay in the window', () => {
  for (const url of ['https://www.bolccop.org/admin', 'https://www.bolccop.org/admin/', 'https://www.bolccop.org/admin/x?y=1']) assert.equal(staysInApp(url), true, url);
  for (const url of ['https://www.bolccop.org/', 'https://www.bolccop.org/weekly', 'https://www.bolccop.org/administrator', 'https://dev.bolccop.org/admin', 'http://www.bolccop.org/admin', 'https://evil.test/admin', 'not a url']) assert.equal(staysInApp(url), false, url);
});

test('only web and mail links are handed to the system', () => {
  assert.equal(externalUrl('https://youtube.com'), true);
  assert.equal(externalUrl('mailto:a@b.c'), true);
  assert.equal(externalUrl('file:///C:/Windows'), false);
  assert.equal(externalUrl('javascript:alert(1)'), false);
});

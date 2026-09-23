import { describe, expect, it } from 'vitest';
import { detectMeetingInAppBrowser } from './inAppBrowser';

describe('meeting in-app browser detection', () => {
  it.each([
    ['Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.50', 'wechat'],
    ['Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile MicroMessenger/8.0.49', 'wechat'],
    ['Mozilla/5.0 (iPhone) Mobile/15E148 Line/14.1.0', 'line'],
    ['Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36 Line/14.1.0', 'line'],
    ['Mozilla/5.0 Mobile line/14.1.0', 'line'],
  ])('detects %s', (ua, expected) => {
    expect(detectMeetingInAppBrowser(ua)).toBe(expected);
  });

  it.each([
    '',
    'Mozilla/5.0 (iPhone) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36',
    'Mozilla/5.0 Chrome/120.0 Edg/120.0',
    'Mozilla/5.0 SomeOtherLine/1.0',
  ])('does not show the guide for %s', ua => {
    expect(detectMeetingInAppBrowser(ua)).toBeNull();
  });
});

export type MeetingInAppBrowser = 'wechat' | 'line';

export function detectMeetingInAppBrowser(userAgent: string): MeetingInAppBrowser | null {
  if (/MicroMessenger\//i.test(userAgent)) return 'wechat';
  if (/\bLine\//i.test(userAgent)) return 'line';
  return null;
}

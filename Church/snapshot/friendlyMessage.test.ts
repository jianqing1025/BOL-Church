import { describe, it, expect } from 'vitest';
import { friendlyMessage } from './friendlyMessage';

const QUOTA = "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details.";

describe('friendlyMessage', () => {
  it('把 D1 每日額度錯誤換成看得懂的一句話', () => {
    expect(friendlyMessage(new Error(QUOTA))).toBe('Database read limit reached. Resets daily.');
  });
  it('其餘 D1 錯誤原樣傳出，排查才有線索', () => {
    expect(friendlyMessage(new Error('D1_ERROR: no such table: sermons')))
      .toBe('D1_ERROR: no such table: sermons');
  });
  it('一般錯誤原樣傳出', () => {
    expect(friendlyMessage(new Error('Forbidden'))).toBe('Forbidden');
  });
  it('丟出非 Error 時給一個安全的預設值', () => {
    expect(friendlyMessage('boom')).toBe('Unexpected server error');
    expect(friendlyMessage(null)).toBe('Unexpected server error');
  });
});

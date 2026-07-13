import { describe, it, expect } from 'vitest';
import {
  threadReplyAddress,
  parseThreadFromRecipients,
  extractInboundBody,
  verifySvixSignature,
} from './inbound';

const DOMAIN = 'reply.bolccop.org';

describe('threadReplyAddress', () => {
  it('message thread → reply+m-<id>@domain', () => {
    expect(threadReplyAddress('message', 'abc-123', DOMAIN)).toBe('reply+m-abc-123@reply.bolccop.org');
  });
  it('prayer thread → reply+p-<id>@domain', () => {
    expect(threadReplyAddress('prayer', 'xyz', DOMAIN)).toBe('reply+p-xyz@reply.bolccop.org');
  });
});

describe('parseThreadFromRecipients', () => {
  it('解析純地址', () => {
    expect(parseThreadFromRecipients(['reply+m-abc-123@reply.bolccop.org']))
      .toEqual({ parentType: 'message', id: 'abc-123' });
  });
  it('解析 "Name <addr>" 形式與大小寫', () => {
    expect(parseThreadFromRecipients(['Church <Reply+P-XYZ@Reply.Bolccop.org>']))
      .toEqual({ parentType: 'prayer', id: 'XYZ' });
  });
  it('多收件人時取第一個匹配', () => {
    expect(parseThreadFromRecipients(['other@x.com', 'reply+m-id9@reply.bolccop.org']))
      .toEqual({ parentType: 'message', id: 'id9' });
  });
  it('接受單一字串輸入', () => {
    expect(parseThreadFromRecipients('reply+m-a@reply.bolccop.org')).toEqual({ parentType: 'message', id: 'a' });
  });
  it('無匹配 → null', () => {
    expect(parseThreadFromRecipients(['someone@gmail.com'])).toBeNull();
    expect(parseThreadFromRecipients([])).toBeNull();
    expect(parseThreadFromRecipients(undefined)).toBeNull();
  });
});

describe('extractInboundBody', () => {
  it('優先取純文字', () => {
    expect(extractInboundBody({ text: ' hello \n', html: '<p>ignored</p>' })).toBe('hello');
  });
  it('無純文字時剝 HTML 標籤', () => {
    expect(extractInboundBody({ html: '<p>Hi <b>there</b></p>' })).toBe('Hi there');
  });
  it('都沒有 → 空字串', () => {
    expect(extractInboundBody({})).toBe('');
  });
});

describe('verifySvixSignature', () => {
  // 用與實現相同的算法在測試裏簽名，驗證往返一致
  const secretBytes = new TextEncoder().encode('test-secret-key');
  const secret = `whsec_${btoa(String.fromCharCode(...secretBytes))}`;
  const id = 'msg_abc';
  const timestamp = '1760000000';
  const payload = '{"type":"email.received"}';

  const sign = async (content: string): Promise<string> => {
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(content));
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
  };

  it('正確簽名 → true', async () => {
    const sig = await sign(`${id}.${timestamp}.${payload}`);
    expect(await verifySvixSignature({
      secret, id, timestamp, payload,
      signatureHeader: `v1,${sig}`,
      nowSec: 1760000010,
    })).toBe(true);
  });
  it('多個簽名裏有一個匹配 → true', async () => {
    const sig = await sign(`${id}.${timestamp}.${payload}`);
    expect(await verifySvixSignature({
      secret, id, timestamp, payload,
      signatureHeader: `v1,AAAA v1,${sig}`,
      nowSec: 1760000010,
    })).toBe(true);
  });
  it('被竄改的 payload → false', async () => {
    const sig = await sign(`${id}.${timestamp}.${payload}`);
    expect(await verifySvixSignature({
      secret, id, timestamp, payload: '{"type":"hacked"}',
      signatureHeader: `v1,${sig}`,
      nowSec: 1760000010,
    })).toBe(false);
  });
  it('時間戳超出容差 → false', async () => {
    const sig = await sign(`${id}.${timestamp}.${payload}`);
    expect(await verifySvixSignature({
      secret, id, timestamp, payload,
      signatureHeader: `v1,${sig}`,
      nowSec: 1760000000 + 3600,
    })).toBe(false);
  });
  it('secret 格式錯誤 → false', async () => {
    expect(await verifySvixSignature({
      secret: 'not-whsec', id, timestamp, payload,
      signatureHeader: 'v1,AAAA',
      nowSec: 1760000010,
    })).toBe(false);
  });
});

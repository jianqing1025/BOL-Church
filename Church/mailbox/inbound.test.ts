import { describe, it, expect } from 'vitest';
import {
  threadReplyAddress,
  parseThreadFromRecipients,
  extractInboundBody,
  stripQuotedReply,
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

describe('stripQuotedReply', () => {
  it('剝掉 Outlook 下劃線分隔線及其後的引用歷史', () => {
    const text = 'test x7\n________________________________\n发件人: Lingling <Lingling@bolccop.org>\n发送时间: 2026年7月13日 3:31\n收件人: a@b.com\n主题: Re: 訊息\n\n親愛的 Gary Li：\n\ntest test x5';
    expect(stripQuotedReply(text)).toBe('test x7');
  });
  it('剝掉 "On ... wrote:" 式引用（Gmail/Apple Mail 英文）', () => {
    expect(stripQuotedReply('Thanks!\n\nOn Mon, Jul 13, 2026 at 3:31 AM Lingling wrote:\n> old content')).toBe('Thanks!');
  });
  it('剝掉中文「在…寫道：」式引用', () => {
    expect(stripQuotedReply('好的，謝謝\n\n在 2026年7月13日，Lingling 写道：\n> 舊內容')).toBe('好的，謝謝');
  });
  it('剝掉 > 開頭的引用行', () => {
    expect(stripQuotedReply('明白了\n\n> 原始訊息第一行\n> 第二行')).toBe('明白了');
  });
  it('剝掉「发件人:」開頭的引用頭（無分隔線時）', () => {
    expect(stripQuotedReply('回覆內容\n\n发件人: Lingling\n主题: Re: x')).toBe('回覆內容');
  });
  it('沒有引用標記時原樣返回', () => {
    expect(stripQuotedReply('純內容\n第二行')).toBe('純內容\n第二行');
  });
  it('整封都是引用（剝完為空）時回退原文，不弄丟內容', () => {
    const onlyQuote = '> 全是引用\n> 沒有新內容';
    expect(stripQuotedReply(onlyQuote)).toBe(onlyQuote);
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

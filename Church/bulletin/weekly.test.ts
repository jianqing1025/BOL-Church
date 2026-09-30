import { describe, expect, it } from 'vitest';
import { attachmentProblem, issueAccessToken, sundayOf, verifyAccessToken, MAX_ATTACHMENT_BYTES } from './weekly';

describe('sundayOf', () => {
  it('回傳當週（週日起）的週日', () => {
    expect(sundayOf('2026-09-30')).toBe('2026-09-27'); // 週三
    expect(sundayOf('2026-09-27')).toBe('2026-09-27'); // 週日本身
    expect(sundayOf('2026-10-03')).toBe('2026-09-27'); // 週六
  });
});

describe('access token', () => {
  const now = new Date('2026-09-30T00:00:00Z');
  it('簽發後可驗證', async () => {
    const token = await issueAccessToken('secret-a', now);
    expect(await verifyAccessToken('secret-a', token, now)).toBe(true);
  });
  it('過期失效', async () => {
    const token = await issueAccessToken('secret-a', now, 30);
    expect(await verifyAccessToken('secret-a', token, new Date('2026-11-01T00:00:00Z'))).toBe(false);
  });
  it('換了金鑰（改密碼）就失效', async () => {
    const token = await issueAccessToken('secret-a', now);
    expect(await verifyAccessToken('secret-b', token, now)).toBe(false);
  });
  it('竄改或格式錯誤都失效', async () => {
    const token = await issueAccessToken('secret-a', now);
    const [exp, sig] = token.split('.');
    expect(await verifyAccessToken('secret-a', `${Number(exp) + 1000}.${sig}`, now)).toBe(false);
    expect(await verifyAccessToken('secret-a', 'garbage', now)).toBe(false);
    expect(await verifyAccessToken('secret-a', '', now)).toBe(false);
  });
});

describe('attachmentProblem', () => {
  it('允許 PDF、Word、圖片，拒絕其他與超過 20 MB', () => {
    expect(attachmentProblem('a.pdf', 'application/pdf', 1000)).toBeNull();
    expect(attachmentProblem('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1000)).toBeNull();
    expect(attachmentProblem('a.doc', 'application/msword', 1000)).toBeNull();
    expect(attachmentProblem('a.jpg', 'image/jpeg', 1000)).toBeNull();
    expect(attachmentProblem('a.exe', 'application/octet-stream', 1000)).toBe('type');
    expect(attachmentProblem('a.pdf', 'application/pdf', MAX_ATTACHMENT_BYTES + 1)).toBe('size');
  });
});

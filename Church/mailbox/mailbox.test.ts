import { describe, it, expect } from 'vitest';
import { extractGeo, escapeHtml, buildReplyEmail } from './mailbox';

describe('extractGeo', () => {
  it('maps country/region/city', () => {
    expect(extractGeo({ country: 'US', region: 'Washington', city: 'Seattle' }))
      .toEqual({ country: 'US', region: 'Washington', city: 'Seattle' });
  });
  it('falls back region -> regionCode', () => {
    expect(extractGeo({ country: 'US', regionCode: 'WA', city: 'Seattle' }).region).toBe('WA');
  });
  it('handles missing cf', () => {
    expect(extractGeo(undefined)).toEqual({ country: null, region: null, city: null });
    expect(extractGeo(null)).toEqual({ country: null, region: null, city: null });
  });
  it('nulls blank / empty strings', () => {
    expect(extractGeo({ country: '  ', city: '' })).toEqual({ country: null, region: null, city: null });
  });
});

describe('escapeHtml', () => {
  it('escapes html special characters', () => {
    expect(escapeHtml(`<b>&"'`)).toBe('&lt;b&gt;&amp;&quot;&#39;');
  });
});

describe('buildReplyEmail', () => {
  const parent = { firstName: 'John', lastName: 'Doe', email: 'j@x.com', message: 'Hi <there>' };
  it('uses the inbox subject', () => {
    expect(buildReplyEmail('inbox', parent, 'Thanks').subject).toBe('Re: 您寄給信望愛靈糧堂的訊息');
  });
  it('uses the prayer subject', () => {
    expect(buildReplyEmail('prayer', parent, 'Praying').subject).toBe('回覆您的代禱請求');
  });
  it('escapes the reply body and quotes the original', () => {
    const { html } = buildReplyEmail('inbox', parent, 'Line1\n<script>');
    expect(html).toContain('Line1<br>&lt;script&gt;');
    expect(html).toContain('Hi &lt;there&gt;');
    expect(html).toContain('John Doe');
  });
  it('falls back to email when no name', () => {
    const { html } = buildReplyEmail('inbox', { firstName: '', lastName: '', email: 'a@b.com', message: '' }, 'x');
    expect(html).toContain('a@b.com');
  });
  it('uses the default greeting and signature when no template given', () => {
    const { html } = buildReplyEmail('inbox', parent, 'x');
    expect(html).toContain('親愛的 John Doe：');
    expect(html).toContain('信望愛靈糧堂 Lingling 敬上');
  });
  it('applies a custom template: {name} placeholder, escaping, multi-line signature', () => {
    const { html } = buildReplyEmail('inbox', parent, 'x', { greeting: '{name} 平安 <3：', signature: '主內\nLingling' });
    expect(html).toContain('John Doe 平安 &lt;3：');
    expect(html).toContain('主內<br>Lingling');
    expect(html).not.toContain('親愛的');
  });
  it('falls back to defaults when template fields are blank', () => {
    const { html } = buildReplyEmail('inbox', parent, 'x', { greeting: '  ', signature: '' });
    expect(html).toContain('親愛的 John Doe：');
    expect(html).toContain('信望愛靈糧堂 Lingling 敬上');
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  checkSelfHostedHealth,
  meetingDayNumber,
  selectLiveKitProject,
  type LiveKitProjectEnv,
} from './livekitProject';

const A: LiveKitProjectEnv = {
  LIVEKIT_URL: 'wss://a.livekit.cloud',
  LIVEKIT_API_KEY: 'key-a',
  LIVEKIT_API_SECRET: 'secret-a',
};
const B = {
  LIVEKIT_URL_B: 'wss://b.livekit.cloud',
  LIVEKIT_API_KEY_B: 'key-b',
  LIVEKIT_API_SECRET_B: 'secret-b',
};
const SELF = {
  LIVEKIT_URL_SELF: 'wss://live.bolccop.org',
  LIVEKIT_API_KEY_SELF: 'key-self',
  LIVEKIT_API_SECRET_SELF: 'secret-self',
};
const BOTH: LiveKitProjectEnv = { ...A, ...B };
const ALL: LiveKitProjectEnv = { ...A, ...B, ...SELF };

/** 7pm Pacific on a given date, as the instant a meeting would be running. */
const meetingEvening = (iso: string) => new Date(`${iso}T19:00:00-07:00`);

/** The church's own server is unreachable, so the cloud rotation is in charge. */
const selfDown = { selfHealthy: false };
const selfUp = { selfHealthy: true };

describe('selectLiveKitProject rotation', () => {
  it('gives everyone in one meeting the same project', () => {
    // Several joins spread across an evening must not land on different servers.
    const joins = ['T18:55:00-07:00', 'T19:00:00-07:00', 'T20:30:00-07:00', 'T21:59:00-07:00']
      .map((time) => selectLiveKitProject(BOTH, new Date(`2026-09-15${time}`), selfDown));
    expect(new Set(joins.map((p) => p!.url)).size).toBe(1);
  });

  it('alternates between consecutive weekly meetings', () => {
    const tuesdays = ['2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06']
      .map((d) => selectLiveKitProject(BOTH, meetingEvening(d), selfDown)!.url);

    expect(tuesdays[0]).not.toBe(tuesdays[1]);
    expect(tuesdays[1]).not.toBe(tuesdays[2]);
    expect(tuesdays[2]).not.toBe(tuesdays[3]);
    // Which means a fortnight comes back around to the same one.
    expect(tuesdays[0]).toBe(tuesdays[2]);
  });

  it('keeps the url with its own key and secret', () => {
    for (const day of ['2026-09-15', '2026-09-16']) {
      const chosen = selectLiveKitProject(BOTH, meetingEvening(day), selfDown)!;
      const suffix = chosen.url.includes('//a.') ? 'a' : 'b';
      expect(chosen.apiKey).toBe(`key-${suffix}`);
      expect(chosen.apiSecret).toBe(`secret-${suffix}`);
    }
  });

  it('spreads Tuesday and Wednesday meetings across both projects', () => {
    const tuesday = selectLiveKitProject(BOTH, meetingEvening('2026-09-15'), selfDown)!;
    const wednesday = selectLiveKitProject(BOTH, meetingEvening('2026-09-16'), selfDown)!;
    expect(tuesday.url).not.toBe(wednesday.url);
  });
});

describe('the 4am day boundary', () => {
  it('keeps a late-running meeting on one project past midnight', () => {
    // Someone joining at 00:30 must still reach the people who joined at 21:00.
    const evening = selectLiveKitProject(BOTH, new Date('2026-09-15T21:00:00-07:00'), selfDown)!;
    const afterMidnight = selectLiveKitProject(BOTH, new Date('2026-09-16T00:30:00-07:00'), selfDown)!;
    expect(afterMidnight.url).toBe(evening.url);
  });

  it('changes over at 4am, not midnight', () => {
    const before = meetingDayNumber(new Date('2026-09-16T03:59:00-07:00'));
    const after = meetingDayNumber(new Date('2026-09-16T04:01:00-07:00'));
    expect(after).toBe(before + 1);
  });

  it('counts consecutive days as consecutive numbers', () => {
    const first = meetingDayNumber(meetingEvening('2026-09-15'));
    expect(meetingDayNumber(meetingEvening('2026-09-16'))).toBe(first + 1);
    expect(meetingDayNumber(meetingEvening('2026-09-17'))).toBe(first + 2);
  });

  it('stays consistent across a daylight-saving change', () => {
    // US DST ends 2026-11-01; the days either side must still be consecutive.
    const before = meetingDayNumber(new Date('2026-10-31T19:00:00-07:00'));
    const after = meetingDayNumber(new Date('2026-11-01T19:00:00-08:00'));
    expect(after).toBe(before + 1);
  });
});

describe('partial configuration', () => {
  it('uses the only project when just one is configured', () => {
    for (const day of ['2026-09-15', '2026-09-16']) {
      expect(selectLiveKitProject(A, meetingEvening(day), selfDown)!.url).toBe('wss://a.livekit.cloud');
      expect(selectLiveKitProject(B, meetingEvening(day), selfDown)!.url).toBe('wss://b.livekit.cloud');
    }
  });

  it('ignores a half-configured second project rather than issuing a broken token', () => {
    const halfB: LiveKitProjectEnv = { ...A, LIVEKIT_URL_B: 'wss://b.livekit.cloud', LIVEKIT_API_KEY_B: 'key-b' };
    for (const day of ['2026-09-15', '2026-09-16']) {
      expect(selectLiveKitProject(halfB, meetingEvening(day), selfDown)!.url).toBe('wss://a.livekit.cloud');
    }
  });

  it('reports nothing configured instead of guessing', () => {
    expect(selectLiveKitProject({}, meetingEvening('2026-09-15'), selfDown)).toBeNull();
    expect(selectLiveKitProject({ LIVEKIT_URL: 'wss://a' }, meetingEvening('2026-09-15'), selfDown)).toBeNull();
  });
});

describe('manual override', () => {
  it('pins every meeting to the self-hosted server when switched over', () => {
    // The point of the switch: the cloud allowance is gone, so the date must
    // stop deciding anything.
    for (const day of ['2026-09-15', '2026-09-16', '2026-09-22']) {
      const chosen = selectLiveKitProject({ ...ALL, LIVEKIT_ACTIVE: 'self' }, meetingEvening(day), selfDown)!;
      expect(chosen.url).toBe('wss://live.bolccop.org');
      expect(chosen.apiKey).toBe('key-self');
    }
  });

  it('can also pin to either cloud project', () => {
    expect(selectLiveKitProject({ ...ALL, LIVEKIT_ACTIVE: 'a' }, meetingEvening('2026-09-16'), selfUp)!.url).toBe('wss://a.livekit.cloud');
    expect(selectLiveKitProject({ ...ALL, LIVEKIT_ACTIVE: 'b' }, meetingEvening('2026-09-15'), selfUp)!.url).toBe('wss://b.livekit.cloud');
  });

  it('ignores blank, unknown and oddly-cased values', () => {
    const rotating = selectLiveKitProject(ALL, meetingEvening('2026-09-15'), selfDown)!.url;
    for (const value of ['', '   ', 'yes', 'cloud']) {
      expect(selectLiveKitProject({ ...ALL, LIVEKIT_ACTIVE: value }, meetingEvening('2026-09-15'), selfDown)!.url).toBe(rotating);
    }
    // Case and stray spaces should not defeat the switch in an emergency.
    expect(selectLiveKitProject({ ...ALL, LIVEKIT_ACTIVE: ' SELF ' }, meetingEvening('2026-09-15'), selfDown)!.url)
      .toBe('wss://live.bolccop.org');
  });

  it('still returns a usable server when the override names one that is not set up', () => {
    // Better a meeting on the wrong server than no meeting at all.
    expect(selectLiveKitProject({ ...A, LIVEKIT_ACTIVE: 'self' }, meetingEvening('2026-09-15'), selfDown)!.url)
      .toBe('wss://a.livekit.cloud');
  });

  it('keeps everyone together while switched over', () => {
    const joins = ['T18:55:00-07:00', 'T20:30:00-07:00', 'T21:59:00-07:00']
      .map((t) => selectLiveKitProject({ ...ALL, LIVEKIT_ACTIVE: 'self' }, new Date(`2026-09-15${t}`), selfDown)!.url);
    expect(new Set(joins).size).toBe(1);
  });
});

describe('the church server is the default', () => {
  it('uses the own machine while it is answering, whatever the date', () => {
    for (const day of ['2026-09-15', '2026-09-16', '2026-09-22', '2026-09-29']) {
      expect(selectLiveKitProject(ALL, meetingEvening(day), selfUp)!.url).toBe('wss://live.bolccop.org');
    }
  });

  it('falls back to the cloud when the own machine is unreachable', () => {
    expect(selectLiveKitProject(ALL, meetingEvening('2026-09-15'), selfDown)!.url).toContain('livekit.cloud');
  });

  it('keeps the original date rotation intact once fallen back', () => {
    const tuesdays = ['2026-09-15', '2026-09-22', '2026-09-29']
      .map((d) => selectLiveKitProject(ALL, meetingEvening(d), selfDown)!.url);
    expect(tuesdays[0]).not.toBe(tuesdays[1]);
    expect(tuesdays[1]).not.toBe(tuesdays[2]);
    expect(tuesdays[0]).toBe(tuesdays[2]);
  });

  it('never hands out a token for a server that is down', () => {
    // The failure this guards: a room nobody can reach, showing no error.
    const chosen = selectLiveKitProject(ALL, meetingEvening('2026-09-15'), selfDown)!;
    expect(chosen.url).not.toBe('wss://live.bolccop.org');
  });

  it('still uses the own machine when no cloud is configured at all', () => {
    expect(selectLiveKitProject(SELF, meetingEvening('2026-09-15'), selfUp)!.url).toBe('wss://live.bolccop.org');
    // Even unreachable it is the only thing left — better than refusing to meet.
    expect(selectLiveKitProject(SELF, meetingEvening('2026-09-15'), selfDown)!.url).toBe('wss://live.bolccop.org');
  });
});

describe('checkSelfHostedHealth', () => {
  it('reports healthy when the server answers', async () => {
    const fetcher = vi.fn(async (_url: string) => new Response('OK', { status: 200 }));
    await expect(checkSelfHostedHealth(SELF, fetcher as unknown as typeof fetch)).resolves.toBe(true);
    // Probed over https, not the wss address the browser uses.
    expect(fetcher.mock.calls[0][0]).toBe('https://live.bolccop.org');
  });

  it('retries once, so one dropped packet cannot split a live meeting', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(new Response('OK', { status: 200 }));
    await expect(checkSelfHostedHealth(SELF, fetcher as unknown as typeof fetch)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reports unhealthy when it stays unreachable, or answers with an error', async () => {
    const dead = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    await expect(checkSelfHostedHealth(SELF, dead as unknown as typeof fetch)).resolves.toBe(false);
    expect(dead).toHaveBeenCalledTimes(2);

    const broken = vi.fn(async () => new Response('bad gateway', { status: 502 }));
    await expect(checkSelfHostedHealth(SELF, broken as unknown as typeof fetch)).resolves.toBe(false);
  });

  it('does not probe at all when the own server is not configured', async () => {
    const fetcher = vi.fn();
    await expect(checkSelfHostedHealth({}, fetcher as unknown as typeof fetch)).resolves.toBe(false);
    // Half-configured counts as unconfigured — never sign a half-valid token.
    await expect(checkSelfHostedHealth({ LIVEKIT_URL_SELF: 'wss://x' }, fetcher as unknown as typeof fetch)).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

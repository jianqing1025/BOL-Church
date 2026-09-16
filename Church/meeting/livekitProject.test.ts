import { describe, it, expect } from 'vitest';
import { meetingDayNumber, selectLiveKitProject, type LiveKitProjectEnv } from './livekitProject';

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

describe('selectLiveKitProject rotation', () => {
  it('gives everyone in one meeting the same project', () => {
    // Several joins spread across an evening must not land on different servers.
    const joins = ['T18:55:00-07:00', 'T19:00:00-07:00', 'T20:30:00-07:00', 'T21:59:00-07:00']
      .map((time) => selectLiveKitProject(BOTH, new Date(`2026-09-15${time}`)));
    expect(new Set(joins.map((p) => p!.url)).size).toBe(1);
  });

  it('alternates between consecutive weekly meetings', () => {
    const tuesdays = ['2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06']
      .map((d) => selectLiveKitProject(BOTH, meetingEvening(d))!.url);

    expect(tuesdays[0]).not.toBe(tuesdays[1]);
    expect(tuesdays[1]).not.toBe(tuesdays[2]);
    expect(tuesdays[2]).not.toBe(tuesdays[3]);
    // Which means a fortnight comes back around to the same one.
    expect(tuesdays[0]).toBe(tuesdays[2]);
  });

  it('keeps the url with its own key and secret', () => {
    for (const day of ['2026-09-15', '2026-09-16']) {
      const chosen = selectLiveKitProject(BOTH, meetingEvening(day))!;
      const suffix = chosen.url.includes('//a.') ? 'a' : 'b';
      expect(chosen.apiKey).toBe(`key-${suffix}`);
      expect(chosen.apiSecret).toBe(`secret-${suffix}`);
    }
  });

  it('spreads Tuesday and Wednesday meetings across both projects', () => {
    const tuesday = selectLiveKitProject(BOTH, meetingEvening('2026-09-15'))!;
    const wednesday = selectLiveKitProject(BOTH, meetingEvening('2026-09-16'))!;
    expect(tuesday.url).not.toBe(wednesday.url);
  });
});

describe('the 4am day boundary', () => {
  it('keeps a late-running meeting on one project past midnight', () => {
    // Someone joining at 00:30 must still reach the people who joined at 21:00.
    const evening = selectLiveKitProject(BOTH, new Date('2026-09-15T21:00:00-07:00'))!;
    const afterMidnight = selectLiveKitProject(BOTH, new Date('2026-09-16T00:30:00-07:00'))!;
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
      expect(selectLiveKitProject(A, meetingEvening(day))!.url).toBe('wss://a.livekit.cloud');
      expect(selectLiveKitProject(B, meetingEvening(day))!.url).toBe('wss://b.livekit.cloud');
    }
  });

  it('ignores a half-configured second project rather than issuing a broken token', () => {
    const halfB: LiveKitProjectEnv = { ...A, LIVEKIT_URL_B: 'wss://b.livekit.cloud', LIVEKIT_API_KEY_B: 'key-b' };
    for (const day of ['2026-09-15', '2026-09-16']) {
      expect(selectLiveKitProject(halfB, meetingEvening(day))!.url).toBe('wss://a.livekit.cloud');
    }
  });

  it('reports nothing configured instead of guessing', () => {
    expect(selectLiveKitProject({}, meetingEvening('2026-09-15'))).toBeNull();
    expect(selectLiveKitProject({ LIVEKIT_URL: 'wss://a' }, meetingEvening('2026-09-15'))).toBeNull();
  });
});

describe('manual override', () => {
  it('pins every meeting to the self-hosted server when switched over', () => {
    // The point of the switch: the cloud allowance is gone, so the date must
    // stop deciding anything.
    for (const day of ['2026-09-15', '2026-09-16', '2026-09-22']) {
      const chosen = selectLiveKitProject({ ...ALL, LIVEKIT_ACTIVE: 'self' }, meetingEvening(day))!;
      expect(chosen.url).toBe('wss://live.bolccop.org');
      expect(chosen.apiKey).toBe('key-self');
    }
  });

  it('can also pin to either cloud project', () => {
    expect(selectLiveKitProject({ ...ALL, LIVEKIT_ACTIVE: 'a' }, meetingEvening('2026-09-16'))!.url).toBe('wss://a.livekit.cloud');
    expect(selectLiveKitProject({ ...ALL, LIVEKIT_ACTIVE: 'b' }, meetingEvening('2026-09-15'))!.url).toBe('wss://b.livekit.cloud');
  });

  it('ignores blank, unknown and oddly-cased values', () => {
    const rotating = selectLiveKitProject(ALL, meetingEvening('2026-09-15'))!.url;
    for (const value of ['', '   ', 'yes', 'cloud']) {
      expect(selectLiveKitProject({ ...ALL, LIVEKIT_ACTIVE: value }, meetingEvening('2026-09-15'))!.url).toBe(rotating);
    }
    // Case and stray spaces should not defeat the switch in an emergency.
    expect(selectLiveKitProject({ ...ALL, LIVEKIT_ACTIVE: ' SELF ' }, meetingEvening('2026-09-15'))!.url)
      .toBe('wss://live.bolccop.org');
  });

  it('still returns a usable server when the override names one that is not set up', () => {
    // Better a meeting on the wrong server than no meeting at all.
    expect(selectLiveKitProject({ ...A, LIVEKIT_ACTIVE: 'self' }, meetingEvening('2026-09-15'))!.url)
      .toBe('wss://a.livekit.cloud');
  });

  it('keeps everyone together while switched over', () => {
    const joins = ['T18:55:00-07:00', 'T20:30:00-07:00', 'T21:59:00-07:00']
      .map((t) => selectLiveKitProject({ ...ALL, LIVEKIT_ACTIVE: 'self' }, new Date(`2026-09-15${t}`))!.url);
    expect(new Set(joins).size).toBe(1);
  });
});

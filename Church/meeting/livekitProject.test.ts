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
const BOTH: LiveKitProjectEnv = { ...A, ...B };

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

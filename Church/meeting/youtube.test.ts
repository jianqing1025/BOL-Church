import { describe, it, expect } from 'vitest';
import { canSetMediaVolume, DRIFT_TOLERANCE_SECONDS, followRoomVideo, needsSoundGesture, parseYouTubeStart, parseYouTubeVideoId } from './youtube';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeVideoId', () => {
  it('reads the id out of every shape of link people actually paste', () => {
    const links = [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://www.youtube.com/watch?v=${ID}&t=90s`,
      `https://www.youtube.com/watch?list=PL123&v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?t=30`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `youtube.com/watch?v=${ID}`,
      `  https://youtu.be/${ID}  `,
    ];
    for (const link of links) expect(parseYouTubeVideoId(link)).toBe(ID);
  });

  it('accepts a bare id, because people paste that too', () => {
    expect(parseYouTubeVideoId(ID)).toBe(ID);
  });

  it('refuses anything that is not a YouTube link', () => {
    for (const bad of [
      'https://vimeo.com/123456',
      `https://example.com/watch?v=${ID}`,
      'https://www.youtube.com/watch?v=tooshort',
      'not a link at all',
      '',
      '   ',
    ]) {
      expect(parseYouTubeVideoId(bad)).toBeNull();
    }
  });

  it('refuses input that is not a string', () => {
    for (const bad of [null, undefined, 42, {}]) expect(parseYouTubeVideoId(bad)).toBeNull();
  });
});

describe('parseYouTubeStart', () => {
  it('reads a plain number of seconds', () => {
    expect(parseYouTubeStart(`https://youtu.be/${ID}?t=90`)).toBe(90);
    expect(parseYouTubeStart(`https://www.youtube.com/watch?v=${ID}&t=90s`)).toBe(90);
    expect(parseYouTubeStart(`https://www.youtube.com/watch?v=${ID}&start=45`)).toBe(45);
  });

  it('reads the minutes-and-seconds form YouTube puts in share links', () => {
    expect(parseYouTubeStart(`https://youtu.be/${ID}?t=1m30s`)).toBe(90);
    expect(parseYouTubeStart(`https://youtu.be/${ID}?t=1h2m3s`)).toBe(3723);
  });

  it('is undefined when the link carries no timestamp', () => {
    expect(parseYouTubeStart(`https://youtu.be/${ID}`)).toBeUndefined();
    expect(parseYouTubeStart('rubbish')).toBeUndefined();
  });
});

describe('followRoomVideo', () => {
  it('does nothing while the follower is close enough', () => {
    const decision = followRoomVideo({ playing: true, seconds: 100 }, { playing: true, seconds: 101 });
    expect(decision).toEqual({ seekTo: null, setPlaying: null });
  });

  it('seeks once the drift is past the tolerance', () => {
    // The tolerance exists so a three-second heartbeat does not make every
    // follower's picture twitch; only a real gap is worth jumping for.
    const past = DRIFT_TOLERANCE_SECONDS + 1;
    expect(followRoomVideo({ playing: true, seconds: 100 }, { playing: true, seconds: 100 + past }).seekTo)
      .toBe(100 + past);
    expect(followRoomVideo({ playing: true, seconds: 100 + past }, { playing: true, seconds: 100 }).seekTo)
      .toBe(100);
  });

  it('follows the leader into pause and back out of it', () => {
    expect(followRoomVideo({ playing: true, seconds: 10 }, { playing: false, seconds: 10 }).setPlaying).toBe(false);
    expect(followRoomVideo({ playing: false, seconds: 10 }, { playing: true, seconds: 10 }).setPlaying).toBe(true);
  });

  it('can seek and change playback in one decision', () => {
    const decision = followRoomVideo({ playing: false, seconds: 0 }, { playing: true, seconds: 300 });
    expect(decision).toEqual({ seekTo: 300, setPlaying: true });
  });
});

describe('canSetMediaVolume', () => {
  it('is false on iPhone and iPad, where the volume is the hardware buttons only', () => {
    // Apple: "the audio level is always under the user's physical control.
    // The volume property is not settable in JavaScript."
    const ios = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
    ];
    for (const ua of ios) expect(canSetMediaVolume(ua)).toBe(false);
  });

  it('is true on desktop and Android, where a slider does something', () => {
    const others = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
    ];
    for (const ua of others) expect(canSetMediaVolume(ua)).toBe(true);
  });

  it('assumes it works when the user agent says nothing useful', () => {
    expect(canSetMediaVolume('')).toBe(true);
  });
});

describe('needsSoundGesture', () => {
  it('is true on phones and tablets, which refuse sound nobody asked for', () => {
    const mobile = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Version/16.6 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
    ];
    for (const ua of mobile) expect(needsSoundGesture(ua)).toBe(true);
  });

  it('is false on desktop, which has already been clicked into the meeting', () => {
    const desktop = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
    ];
    for (const ua of desktop) expect(needsSoundGesture(ua)).toBe(false);
  });
});

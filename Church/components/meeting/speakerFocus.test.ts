import { describe, it, expect } from 'vitest';
import {
  emptySpeakerFocus,
  nextSpeakerFocus,
  SPEAKER_GAP_MS,
  SPEAKER_PROMOTE_MS,
  SPEAKER_TICK_MS,
  type SpeakerFocus,
} from './speakerFocus';

const room = ['anna', 'ben', 'cara'];

interface Clock {
  state: SpeakerFocus;
  at: number;
}

const start = (): Clock => ({ state: emptySpeakerFocus, at: 0 });

/**
 * Runs the rule at the cadence the stage runs it at, which is what the gap
 * tolerance is measured against — feeding it samples further apart than
 * SPEAKER_GAP_MS would read every one of them as a separate turn.
 */
function run(clock: Clock, ms: number, speaking: string | null, present: string[] = room): Clock {
  let { state, at } = clock;
  for (let elapsed = 0; elapsed < ms; elapsed += SPEAKER_TICK_MS) {
    at += SPEAKER_TICK_MS;
    state = nextSpeakerFocus(state, { activeIds: speaking ? [speaking] : [], presentIds: present, now: at });
  }
  return { state, at };
}

describe('nextSpeakerFocus', () => {
  it('shows the first person to speak straight away', () => {
    // Nobody is on the main tile yet, so there is nothing to protect and no
    // reason to make the room stare at an empty stage for three seconds.
    expect(run(start(), SPEAKER_TICK_MS, 'anna').state.featuredId).toBe('anna');
  });

  it('ignores a noise too short to be somebody taking the floor', () => {
    let clock = run(start(), 2000, 'anna');
    clock = run(clock, 600, 'ben');   // a cough
    clock = run(clock, 2000, 'anna');
    expect(clock.state.featuredId).toBe('anna');
  });

  it('hands the floor over once somebody has held it long enough', () => {
    let clock = run(start(), 2000, 'anna');
    clock = run(clock, SPEAKER_PROMOTE_MS + SPEAKER_TICK_MS, 'ben');
    expect(clock.state.featuredId).toBe('ben');
  });

  it('does not hand it over a moment too early', () => {
    let clock = run(start(), 2000, 'anna');
    clock = run(clock, SPEAKER_PROMOTE_MS - SPEAKER_TICK_MS, 'ben');
    expect(clock.state.featuredId).toBe('anna');
  });

  it('keeps the speaker on screen while they pause for breath', () => {
    // Silence is not a reason to change the picture. Somebody turning a page
    // mid-sentence should not lose the tile they are talking from.
    let clock = run(start(), 2000, 'anna');
    clock = run(clock, 30000, null);
    expect(clock.state.featuredId).toBe('anna');
  });

  it('lets the gaps between words count as one turn', () => {
    // Nobody produces three unbroken seconds of detected audio.
    let clock = run(start(), 2000, 'anna');
    for (let i = 0; i < 6; i += 1) {
      clock = run(clock, 1000, 'ben');
      clock = run(clock, SPEAKER_GAP_MS - SPEAKER_TICK_MS, null);
    }
    expect(clock.state.featuredId).toBe('ben');
  });

  it('treats a long silence as the end of that turn', () => {
    // Otherwise two coughs ten seconds apart would add up to a promotion.
    let clock = run(start(), 2000, 'anna');
    clock = run(clock, 2000, 'ben');
    clock = run(clock, 10000, null);
    clock = run(clock, 2000, 'ben');
    expect(clock.state.featuredId).toBe('anna');
  });

  it('starts the clock again when somebody else cuts in', () => {
    let clock = run(start(), 2000, 'anna');
    clock = run(clock, 2000, 'ben');
    clock = run(clock, 2000, 'cara');
    expect(clock.state.featuredId).toBe('anna');
    clock = run(clock, SPEAKER_PROMOTE_MS, 'cara');
    expect(clock.state.featuredId).toBe('cara');
  });

  it('gives up on someone who has left the room', () => {
    let clock = run(start(), 2000, 'anna');
    clock = run(clock, SPEAKER_TICK_MS, null, ['ben', 'cara']);
    expect(clock.state.featuredId).toBeNull();
  });

  it('ignores a speaker who is no longer in the room', () => {
    let clock = run(start(), 2000, 'anna');
    clock = run(clock, 10000, 'ghost');
    expect(clock.state.featuredId).toBe('anna');
  });

  it('gives back the same state when nothing has changed', () => {
    // The stage re-evaluates twice a second; a new object every tick would
    // restart the fade on the main tile over and over.
    const settled = run(start(), 2000, 'anna').state;
    expect(nextSpeakerFocus(settled, { activeIds: ['anna'], presentIds: room, now: 9999 })).toBe(settled);
  });
});

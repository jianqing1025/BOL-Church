import { describe, it, expect } from 'vitest';
import { CROWDED_ROOM_SIZE, defaultJoinMedia } from './joinDefaults';

describe('defaultJoinMedia', () => {
  it('opens the camera and microphone for the first few to arrive', () => {
    for (const count of [0, 1, CROWDED_ROOM_SIZE - 1]) {
      expect(defaultJoinMedia(count)).toEqual({ camOn: true, micOn: true });
    }
  });

  it('arrives quietly once a study is under way', () => {
    // Walking into a discussion with a live microphone puts your kitchen into
    // the middle of it. The boxes are still there to tick.
    for (const count of [CROWDED_ROOM_SIZE, CROWDED_ROOM_SIZE + 9]) {
      expect(defaultJoinMedia(count)).toEqual({ camOn: false, micOn: false });
    }
  });

  it('treats an unknown head count as an empty room', () => {
    // The room list polls every ten seconds; a card that has not heard back
    // yet should not silence somebody for no reason.
    expect(defaultJoinMedia(undefined)).toEqual({ camOn: true, micOn: true });
  });
});

import { describe, it, expect } from 'vitest';
import type { Participant } from 'livekit-client';
import { HOST_ATTRIBUTE, isHostParticipant } from './participantFlags';

const person = (host?: string): Participant => ({
  identity: 'a',
  attributes: host === undefined ? {} : { [HOST_ATTRIBUTE]: host },
} as unknown as Participant);

describe('isHostParticipant', () => {
  it('is true for the participant who joined as host', () => {
    expect(isHostParticipant(person('1'))).toBe(true);
  });

  it('is false for everyone else', () => {
    expect(isHostParticipant(person())).toBe(false);
    expect(isHostParticipant(person(''))).toBe(false);
  });

  it('accepts only the exact marker, since attributes are free-form strings', () => {
    for (const value of ['0', 'true', 'yes', 'host']) {
      expect(isHostParticipant(person(value))).toBe(false);
    }
  });
});

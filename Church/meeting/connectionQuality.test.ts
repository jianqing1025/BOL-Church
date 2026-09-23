import { describe, it, expect } from 'vitest';
import { ConnectionQuality } from 'livekit-client';
import type { Participant } from 'livekit-client';
import { connectionTrouble, troubleByUserId, troubledParticipants } from './connectionQuality';

const person = (identity: string, quality: ConnectionQuality): Participant =>
  ({ identity, name: identity, connectionQuality: quality } as unknown as Participant);

describe('connectionTrouble', () => {
  it('says nothing while a connection is fine', () => {
    // A signal meter on every tile in a healthy room is decoration; the point
    // of this is to name the person whose connection is the problem.
    expect(connectionTrouble(person('a', ConnectionQuality.Excellent))).toBeNull();
    expect(connectionTrouble(person('a', ConnectionQuality.Good))).toBeNull();
  });

  it('says nothing before the server has an opinion', () => {
    expect(connectionTrouble(person('a', ConnectionQuality.Unknown))).toBeNull();
    expect(connectionTrouble({ identity: 'a' } as unknown as Participant)).toBeNull();
  });

  it('marks a poor connection, and a lost one more strongly', () => {
    expect(connectionTrouble(person('a', ConnectionQuality.Poor))).toBe('poor');
    expect(connectionTrouble(person('a', ConnectionQuality.Lost))).toBe('lost');
  });
});

describe('troubledParticipants', () => {
  it('names only the ones in difficulty', () => {
    const people = [
      person('anna', ConnectionQuality.Excellent),
      person('ben', ConnectionQuality.Poor),
      person('cara', ConnectionQuality.Good),
      person('dan', ConnectionQuality.Lost),
    ];
    expect(troubledParticipants(people)).toEqual([
      { identity: 'ben', name: 'ben', trouble: 'poor' },
      { identity: 'dan', name: 'dan', trouble: 'lost' },
    ]);
  });

  it('is empty when the whole room is well', () => {
    expect(troubledParticipants([person('a', ConnectionQuality.Excellent)])).toEqual([]);
    expect(troubledParticipants([])).toEqual([]);
  });

  it('falls back to the identity when someone has no display name', () => {
    const nameless = { identity: 'raw-id', connectionQuality: ConnectionQuality.Poor } as unknown as Participant;
    expect(troubledParticipants([nameless])[0].name).toBe('raw-id');
  });
});

describe('troubleByUserId', () => {
  const withUid = (identity: string, uid: string | null, quality: ConnectionQuality): Participant =>
    ({ identity, name: identity, connectionQuality: quality, attributes: uid ? { uid } : {} } as unknown as Participant);

  it('keys the trouble by the id the member list uses', () => {
    // The list is built from presence uuids and a connection belongs to a
    // LiveKit participant; the uid attribute is what joins the two.
    const map = troubleByUserId([
      withUid('anna-1a2b', 'presence-anna', ConnectionQuality.Poor),
      withUid('ben-3c4d', 'presence-ben', ConnectionQuality.Excellent),
    ]);
    expect(map.get('presence-anna')).toBe('poor');
    expect(map.has('presence-ben')).toBe(false);
  });

  it('skips anyone whose presence id has not arrived yet', () => {
    const map = troubleByUserId([withUid('anna-1a2b', null, ConnectionQuality.Poor)]);
    expect(map.size).toBe(0);
  });
});

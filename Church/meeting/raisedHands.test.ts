import { describe, it, expect } from 'vitest';
import type { Participant } from 'livekit-client';
import { HAND_ATTRIBUTE, handOrders, handRaisedAt, orderByRaisedHand, raisedHandCount } from './raisedHands';

const person = (identity: string, hand?: string): Participant => ({
  identity,
  attributes: hand === undefined ? {} : { [HAND_ATTRIBUTE]: hand },
} as unknown as Participant);

describe('handRaisedAt', () => {
  it('reads the moment the hand went up', () => {
    expect(handRaisedAt(person('a', '1790000000000'))).toBe(1790000000000);
  });

  it('treats an empty attribute as a hand that is down', () => {
    // Lowering a hand clears the attribute rather than deleting it, because
    // setAttributes merges — there is no way to remove a key.
    expect(handRaisedAt(person('a', ''))).toBeNull();
  });

  it('is null for someone who has never raised a hand', () => {
    expect(handRaisedAt(person('a'))).toBeNull();
  });

  it('refuses anything that is not a positive number', () => {
    // Attributes are free-form strings that anyone in the room can set.
    for (const bad of ['yes', 'NaN', '-1', '0', ' ']) {
      expect(handRaisedAt(person('a', bad))).toBeNull();
    }
  });
});

describe('orderByRaisedHand', () => {
  it('brings raised hands to the front, first raised first', () => {
    // The regression this guards: a gallery page holds 6 people on a phone, so
    // a hand raised by anyone further down the list was invisible until you
    // turned the page — which nobody thinks to do.
    const ordered = orderByRaisedHand([
      person('me'), person('anna'), person('ben', '200'), person('cara'),
      person('dan'), person('eve'), person('finn', '100'),
    ]);
    expect(ordered.map((p) => p.identity)).toEqual(['finn', 'ben', 'me', 'anna', 'cara', 'dan', 'eve']);
  });

  it('leaves everyone else in the order they were already in', () => {
    const ordered = orderByRaisedHand([person('a'), person('b', '5'), person('c'), person('d')]);
    expect(ordered.map((p) => p.identity)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('returns the very same list when nobody has a hand up', () => {
    // Same reference, so React does not re-render the stage for nothing.
    const people = [person('a'), person('b')];
    expect(orderByRaisedHand(people)).toBe(people);
  });

  it('keeps the earlier of two hands raised in the same millisecond', () => {
    const ordered = orderByRaisedHand([person('a', '100'), person('b', '100')]);
    expect(ordered.map((p) => p.identity)).toEqual(['a', 'b']);
  });
});

describe('handOrders', () => {
  it('numbers the queue from one, in the order hands went up', () => {
    const orders = handOrders([person('a'), person('b', '300'), person('c', '100'), person('d', '200')]);
    expect(orders.get('c')).toBe(1);
    expect(orders.get('d')).toBe(2);
    expect(orders.get('b')).toBe(3);
  });

  it('leaves out anyone whose hand is down', () => {
    const orders = handOrders([person('a'), person('b', '100')]);
    expect(orders.has('a')).toBe(false);
    expect(orders.size).toBe(1);
  });
});

describe('raisedHandCount', () => {
  it('counts the hands that are up', () => {
    expect(raisedHandCount([person('a', '1'), person('b'), person('c', '2'), person('d', '')])).toBe(2);
  });

  it('is zero for an empty room', () => {
    expect(raisedHandCount([])).toBe(0);
  });
});

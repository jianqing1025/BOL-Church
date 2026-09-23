import { describe, it, expect } from 'vitest';
import { overflowKeys } from './controlBarItems';

const base = { hasVideo: true, showViewToggle: true, isHost: false, raisedHands: 0 };

describe('overflowKeys', () => {
  it('lists the buttons that did not fit on the bar', () => {
    expect(overflowKeys(base)).toEqual(['screenShare', 'chat', 'members', 'view']);
  });

  it('drops the view toggle while someone is sharing their screen', () => {
    // The stage is showing the shared screen; there is no gallery to switch to.
    expect(overflowKeys({ ...base, showViewToggle: false })).toEqual(['screenShare', 'chat', 'members']);
  });

  it('offers a host "lower all hands" only once somebody has one up', () => {
    expect(overflowKeys({ ...base, isHost: true })).not.toContain('lowerAllHands');
    expect(overflowKeys({ ...base, isHost: true, raisedHands: 2 })).toContain('lowerAllHands');
  });

  it('never offers "lower all hands" to a member', () => {
    expect(overflowKeys({ ...base, raisedHands: 3 })).not.toContain('lowerAllHands');
  });

  it('keeps only the members list in a room without video', () => {
    expect(overflowKeys({ ...base, hasVideo: false, showViewToggle: false })).toEqual(['members']);
  });
});

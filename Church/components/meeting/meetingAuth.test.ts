import { describe, it, expect } from 'vitest';
import { normalizeDisplayName, isValidDisplayName, MEETING_NAME_KEY } from './meetingAuth';

describe('normalizeDisplayName', () => {
  it('trims, collapses inner whitespace, caps length at 30', () => {
    expect(normalizeDisplayName('  John   Doe ')).toBe('John Doe');
    expect(normalizeDisplayName('x'.repeat(40)).length).toBe(30);
  });
});
describe('isValidDisplayName', () => {
  it('requires a non-whitespace character', () => {
    expect(isValidDisplayName('Mary')).toBe(true);
    expect(isValidDisplayName('   ')).toBe(false);
  });
});
describe('MEETING_NAME_KEY', () => {
  it('is the stable storage key', () => {
    expect(MEETING_NAME_KEY).toBe('bolccop-meeting-name');
  });
});

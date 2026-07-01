import { describe, it, expect } from 'vitest';
import {
  MEETING_PASSWORD,
  checkMeetingPassword,
  normalizeDisplayName,
  isValidDisplayName,
} from './meetingAuth';

describe('checkMeetingPassword', () => {
  it('accepts the exact code, ignoring surrounding whitespace', () => {
    expect(checkMeetingPassword(MEETING_PASSWORD)).toBe(true);
    expect(checkMeetingPassword('  110550  ')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(checkMeetingPassword('110551')).toBe(false);
    expect(checkMeetingPassword('')).toBe(false);
  });
});

describe('normalizeDisplayName', () => {
  it('trims, collapses inner whitespace, and caps length at 30', () => {
    expect(normalizeDisplayName('  John   Doe ')).toBe('John Doe');
    expect(normalizeDisplayName('x'.repeat(40)).length).toBe(30);
  });
});

describe('isValidDisplayName', () => {
  it('requires at least one non-whitespace character', () => {
    expect(isValidDisplayName('Mary')).toBe(true);
    expect(isValidDisplayName('   ')).toBe(false);
    expect(isValidDisplayName('')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { validateAuth, validateJoin, validateVideo } from './meetingValidation';

const PW = '110550';

describe('validateAuth', () => {
  it('accepts a good name + password', () => {
    expect(validateAuth({ name: 'Andy', password: PW }, PW)).toEqual({ ok: true, name: 'Andy' });
  });
  it('rejects bad password and empty name', () => {
    expect(validateAuth({ name: 'Andy', password: 'x' }, PW).ok).toBe(false);
    expect(validateAuth({ name: '   ', password: PW }, PW).ok).toBe(false);
    expect(validateAuth({ name: 'Andy', password: PW }, undefined).ok).toBe(false);
  });
});

describe('validateJoin', () => {
  it('accepts a known room with good credentials', () => {
    const r = validateJoin({ roomId: 'bible-study-1', name: 'Andy', password: PW }, PW);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.room.id).toBe('bible-study-1'); expect(r.name).toBe('Andy'); }
  });
  it('rejects unknown room / bad password / empty name', () => {
    expect(validateJoin({ roomId: 'nope', name: 'A', password: PW }, PW).ok).toBe(false);
    expect(validateJoin({ roomId: 'bible-study-1', name: 'A', password: 'x' }, PW).ok).toBe(false);
    expect(validateJoin({ roomId: 'bible-study-1', name: '', password: PW }, PW).ok).toBe(false);
  });
});

describe('validateVideo', () => {
  it('accepts a video room', () => {
    expect(validateVideo({ roomId: 'prayer', name: 'A', password: PW }, PW).ok).toBe(true);
  });
  it('rejects removed lobby as an invalid room id', () => {
    const r = validateVideo({ roomId: 'lobby', name: 'A', password: PW }, PW);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.status).toBe(400);
  });
});

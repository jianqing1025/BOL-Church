import { describe, it, expect } from 'vitest';
import { classifyMediaError } from './mediaErrors';

const domError = (name: string): DOMException => {
  const error = new Error(`fake ${name}`) as Error & { name: string };
  error.name = name;
  return error as unknown as DOMException;
};

describe('classifyMediaError', () => {
  it('tells a refused permission apart, since that is the one the user can fix', () => {
    expect(classifyMediaError(domError('NotAllowedError'))).toBe('meeting.mediaDenied');
    expect(classifyMediaError(domError('SecurityError'))).toBe('meeting.mediaDenied');
  });

  it('reports a missing device separately from a refused one', () => {
    expect(classifyMediaError(domError('NotFoundError'))).toBe('meeting.mediaNotFound');
    expect(classifyMediaError(domError('OverconstrainedError'))).toBe('meeting.mediaNotFound');
  });

  it('recognises a camera another app is holding — the common phone case', () => {
    expect(classifyMediaError(domError('NotReadableError'))).toBe('meeting.mediaInUse');
    expect(classifyMediaError(domError('AbortError'))).toBe('meeting.mediaInUse');
  });

  it('recognises a browser with no capture support at all', () => {
    expect(classifyMediaError(new TypeError('navigator.mediaDevices is undefined'))).toBe('meeting.mediaUnsupported');
    expect(classifyMediaError(new Error('目前的微信瀏覽器不支援開啟麥克風／鏡頭'))).toBe('meeting.mediaUnsupported');
  });

  it('falls back to a plain message for anything else', () => {
    expect(classifyMediaError(new Error('something odd'))).toBe('meeting.mediaFailed');
    expect(classifyMediaError('a string')).toBe('meeting.mediaFailed');
    expect(classifyMediaError(null)).toBe('meeting.mediaFailed');
    expect(classifyMediaError(undefined)).toBe('meeting.mediaFailed');
  });
});

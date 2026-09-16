/**
 * Turns a getUserMedia failure into a translation key.
 *
 * The browser's own message ("Permission denied", "Could not start video
 * source") means nothing to someone on a phone in the middle of a Bible study,
 * and each cause needs a different next step — allow it in settings, close the
 * other app, or give up on video. Keys, not text, so the copy stays with the
 * rest of the translations.
 */
export type MediaErrorKey =
  | 'meeting.mediaDenied'
  | 'meeting.mediaNotFound'
  | 'meeting.mediaInUse'
  | 'meeting.mediaUnsupported'
  | 'meeting.mediaFailed';

export function classifyMediaError(error: unknown): MediaErrorKey {
  const name = error instanceof DOMException || error instanceof Error
    ? (error as DOMException).name
    : '';

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'meeting.mediaDenied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'meeting.mediaNotFound';
    // NotReadableError is what a phone reports when another app — a call, the
    // camera, another browser tab — still holds the camera or microphone.
    case 'NotReadableError':
    case 'AbortError':
      return 'meeting.mediaInUse';
    default:
      break;
  }

  // Browsers without mediaDevices at all (in-app webviews) reach here.
  if (error instanceof TypeError || (error instanceof Error && /mediaDevices|getUserMedia|不支援|不支持/.test(error.message))) {
    return 'meeting.mediaUnsupported';
  }
  return 'meeting.mediaFailed';
}

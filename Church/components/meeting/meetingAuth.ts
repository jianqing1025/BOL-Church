/** Shared soft-gate code for the co-worker meeting rooms. This is a low-security
 *  gate meant to be shared among co-workers, so the value lives client-side. */
export const MEETING_PASSWORD = '110550';

/** localStorage keys — mirror the PhotoGate unlock pattern. */
export const MEETING_UNLOCK_KEY = 'bolccop-meeting-unlocked';
export const MEETING_NAME_KEY = 'bolccop-meeting-name';

const MAX_NAME_LENGTH = 30;

export function checkMeetingPassword(input: string): boolean {
  return input.trim() === MEETING_PASSWORD;
}

export function normalizeDisplayName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

export function isValidDisplayName(input: string): boolean {
  return normalizeDisplayName(input).length > 0;
}

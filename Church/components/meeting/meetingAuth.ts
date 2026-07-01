/** Display-name helpers for the meeting entry form. The room password is
 *  validated server-side (CHAT_PASSWORD), so no password logic lives here. */
export const MEETING_NAME_KEY = 'bolccop-meeting-name';

const MAX_NAME_LENGTH = 30;

export function normalizeDisplayName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

export function isValidDisplayName(input: string): boolean {
  return normalizeDisplayName(input).length > 0;
}

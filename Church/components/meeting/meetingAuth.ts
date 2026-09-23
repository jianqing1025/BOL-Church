/** Entry-form helpers. The room password is validated server-side
 *  (CHAT_PASSWORD); what lives here is only what to remember between visits. */
export const MEETING_NAME_KEY = 'bolccop-meeting-name';

/**
 * The room password, kept so a member does not retype it every week.
 *
 * Stored in the clear. Encrypting it would mean keeping the key beside the
 * ciphertext, which protects nobody and only makes the code look careful. What
 * makes this an acceptable trade is the password itself: it is one shared
 * password, the same one handed round the WeChat and LINE groups, not a
 * personal credential. Anyone holding the unlocked phone could read the group
 * message just as easily.
 */
export const MEETING_PASSWORD_KEY = 'bolccop-meeting-password';

export interface RememberedEntry {
  name: string;
  password: string;
}

/** Reads what was remembered. Storage can be unavailable or blocked. */
export function readRemembered(): RememberedEntry {
  try {
    return {
      name: localStorage.getItem(MEETING_NAME_KEY) || '',
      password: localStorage.getItem(MEETING_PASSWORD_KEY) || '',
    };
  } catch {
    return { name: '', password: '' };
  }
}

/** Remembers the name always, the password only when asked to. */
export function remember(entry: RememberedEntry, keepPassword: boolean): void {
  try {
    localStorage.setItem(MEETING_NAME_KEY, entry.name);
    if (keepPassword) localStorage.setItem(MEETING_PASSWORD_KEY, entry.password);
    else localStorage.removeItem(MEETING_PASSWORD_KEY);
  } catch { /* private window, or storage turned off */ }
}

/** Forgets the password but keeps the name — used when it stops working. */
export function forgetPassword(): void {
  try { localStorage.removeItem(MEETING_PASSWORD_KEY); } catch { /* ignore */ }
}

/** Forgets everything, for handing the device to somebody else. */
export function forgetEveryone(): void {
  try {
    localStorage.removeItem(MEETING_NAME_KEY);
    localStorage.removeItem(MEETING_PASSWORD_KEY);
  } catch { /* ignore */ }
}

const MAX_NAME_LENGTH = 30;

export function normalizeDisplayName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

export function isValidDisplayName(input: string): boolean {
  return normalizeDisplayName(input).length > 0;
}

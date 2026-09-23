import { useEffect, useState } from 'react';

/**
 * How long a notice stays before it gets out of the way.
 *
 * Long enough to read a sentence twice, short enough that it is not still
 * covering someone's face when the study has moved on.
 */
export const NOTICE_DURATION_MS = 6000;

/**
 * Shows something for a few seconds, then lets it go.
 *
 * `trigger` is what the notice is about — an error's identity, the video being
 * watched, whether a host is leading. Whenever it changes to something truthy
 * the notice comes back for another few seconds, so a second failure is seen
 * even when it reads exactly like the first.
 */
export function useTimedNotice(trigger: unknown, durationMs = NOTICE_DURATION_MS): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!trigger) { setVisible(false); return; }
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), durationMs);
    return () => window.clearTimeout(id);
  }, [trigger, durationMs]);

  return visible;
}

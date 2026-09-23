export type BrowserPermissionName = 'camera' | 'microphone';

async function permissionState(name: BrowserPermissionName): Promise<PermissionState | null> {
  try {
    const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!permissions?.query) return null;
    const status = await permissions.query({ name: name as PermissionName });
    return status.state;
  } catch {
    return null;
  }
}

/**
 * Whether the browser is still going to ask about these devices.
 *
 * Safari and Firefox do not answer the question at all, which reads here as
 * "yes, it will ask" — explaining a prompt that never comes is a smaller cost
 * than a prompt appearing with no explanation.
 */
export async function needsPermissionIntro(names: BrowserPermissionName[]): Promise<boolean> {
  const states = await Promise.all(names.map(permissionState));
  return states.some((state) => state !== 'granted');
}

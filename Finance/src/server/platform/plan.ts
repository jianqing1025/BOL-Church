/** Churches of up to this many people use everything free. */
export const FREE_CHURCH_SIZE = 100;

export interface Entitlement { status: string; expires_at: string | null }

export interface ChurchPlan {
  /** Declared over the free size. */
  needsSubscription: boolean;
  /** A current 教會專業版 subscription. */
  subscribed: boolean;
  /** May add and change data. Reading and exporting are never blocked. */
  writable: boolean;
}

export function churchPlan(declaredSize: number, entitlement: Entitlement | null, now = new Date()): ChurchPlan {
  const needsSubscription = declaredSize > FREE_CHURCH_SIZE;
  const subscribed = !!entitlement
    && (entitlement.status === 'active' || entitlement.status === 'grace')
    && (!entitlement.expires_at || entitlement.expires_at > now.toISOString());
  return { needsSubscription, subscribed, writable: !needsSubscription || subscribed };
}

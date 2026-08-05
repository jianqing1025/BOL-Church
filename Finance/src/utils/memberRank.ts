import type { Member, Offering } from '../types';

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 上一個星期日（今天為週日則取當天），回傳 yyyy-mm-dd（本地時區） */
export function lastSundayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return toDateStr(d);
}

/** 半年前的月初，回傳 yyyy-mm-dd。先歸到月初再減月份，避免 8/31 減 6 個月溢位成 3/3 */
function halfYearAgoStr(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 6);
  return toDateStr(d);
}

/** 本週新增（週日為週首）：createdAt 落在本週日之後 */
export function isNewMember(member: Member, weekStart = lastSundayStr()): boolean {
  return (member.createdAt || '').slice(0, 10) >= weekStart;
}

export interface MemberRank {
  isNew: (id: string) => boolean;
  isStar: (id: string) => boolean;
  /** isNew 降冪 → isStar 降冪；同組回傳 0，名稱排序由呼叫端自行接在後面 */
  compare: (a: Member, b: Member) => number;
}

/**
 * 成員的星號與 new 標記，全站共用的單一真相來源。
 * isNew  = 本週新增
 * isStar = 手動收藏 或 近半年內有奉獻 或 isNew
 */
export function buildMemberRank(members: Member[], offerings: Offering[]): MemberRank {
  const weekStart = lastSundayStr();
  const since = halfYearAgoStr();

  const recentDonors = new Set<string>();
  for (const o of offerings) {
    if (o.memberId && (o.date || '') >= since) recentDonors.add(o.memberId);
  }

  const newIds = new Set<string>();
  const starIds = new Set<string>();
  for (const m of members) {
    const fresh = isNewMember(m, weekStart);
    if (fresh) newIds.add(m.id);
    if (fresh || m.starred || recentDonors.has(m.id)) starIds.add(m.id);
  }

  const tier = (m: Member) => (newIds.has(m.id) ? 2 : starIds.has(m.id) ? 1 : 0);

  return {
    isNew: id => newIds.has(id),
    isStar: id => starIds.has(id),
    compare: (a, b) => tier(b) - tier(a)
  };
}

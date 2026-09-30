/** 公告欄：一則要公告的事項。日期都是 'YYYY-MM-DD'。 */
export type Announcement = {
  id: string;
  title: string;
  bodyHtml: string;
  /** 活動日期，可空。 */
  eventDate: string | null;
  /** 顯示到這天（含），之後自動下架。 */
  showUntil: string;
  createdAt: string;
  updatedAt: string;
};

/** 到期以教會所在地計算，不隨訪客的時區變動。 */
export const CHURCH_TIME_ZONE = 'America/Los_Angeles';

export function todayInChurch(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CHURCH_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const sortKey = (item: Announcement) => item.eventDate ?? item.showUntil;

/** 未到期的公告，依活動日期（沒有則顯示到）由近到遠。 */
export function currentAnnouncements(list: Announcement[], today: string): Announcement[] {
  return list
    .filter(item => item.showUntil >= today)
    .sort((x, y) => sortKey(x).localeCompare(sortKey(y)) || x.createdAt.localeCompare(y.createdAt));
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function defaultShowUntil(eventDate: string | null, today: string): string {
  return eventDate || addDays(today, 14);
}

/** 首頁小卡：關閉後只有出現新的公告才再顯示；舊公告到期減少不會讓它重新出現。 */
export function shouldShowCard(currentIds: string[], dismissedIds: string[] | null): boolean {
  if (currentIds.length === 0) return false;
  if (!dismissedIds) return true;
  return currentIds.some(id => !dismissedIds.includes(id));
}

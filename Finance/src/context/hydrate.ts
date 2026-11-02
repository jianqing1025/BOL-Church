import type { Expense, LookupData, Member, Offering } from '../types';

// 清單端點不 JOIN（D1 把每次 JOIN 查找都算成讀取一列），名字在前端用已載入的資料補上。
// 結果必須與原本伺服器 JOIN 出來的相同：奉獻的 member/category/method 名、成員的分組名與奉獻合計、
// 支出的分類名與經手人名（經手人以快照文字優先，等同 COALESCE(e.approved_by_text, approved.name)）。

/** 成員 id → 名字。除了已載入的成員清單，也要涵蓋清單外被引用到的成員（見 missingMemberIds）。 */
export type MemberNameOf = (memberId: string) => string | undefined;

export function hydrateOfferings(offerings: Offering[], nameOf: MemberNameOf, lookups: LookupData): Offering[] {
  const categories = new Map(lookups.offeringCategories.map(item => [item.id, item.name]));
  const methods = new Map(lookups.offeringMethods.map(item => [item.id, item.name]));
  return offerings.map(offering => ({
    ...offering,
    memberName: (offering.memberId && nameOf(offering.memberId)) || offering.memberName,
    categoryName: (offering.categoryId && categories.get(offering.categoryId)) || offering.categoryName,
    methodName: (offering.methodId && methods.get(offering.methodId)) || offering.methodName
  }));
}

/** hideTotals：Counter 不得看到任何奉獻金額，合計一律為 0。 */
export function hydrateMembers(members: Member[], offerings: Offering[], lookups: LookupData, hideTotals: boolean): Member[] {
  const groups = new Map(lookups.memberGroups.map(item => [item.id, item.name]));
  // 與原本的 SUM(offerings.amount) 相同：奉獻清單本來就只含同一個測試/正式範圍的資料
  const totals = new Map<string, number>();
  if (!hideTotals) {
    for (const offering of offerings) {
      if (offering.memberId) totals.set(offering.memberId, (totals.get(offering.memberId) ?? 0) + offering.amount);
    }
  }
  return members.map(member => ({
    ...member,
    groupName: (member.groupId && groups.get(member.groupId)) || member.groupName,
    // 四捨五入到分：浮點數依不同順序相加會有 1978.5700000000002 這種尾數（原本伺服器的 SUM 也有）
    totalOffering: Math.round((totals.get(member.id) ?? 0) * 100) / 100
  }));
}

export function hydrateExpenses(expenses: Expense[], nameOf: MemberNameOf, lookups: LookupData): Expense[] {
  const categories = new Map(lookups.expenseCategories.map(item => [item.id, item.name]));
  const name = (memberId: string | null | undefined) => (memberId ? nameOf(memberId) : undefined);
  return expenses.map(expense => ({
    ...expense,
    categoryName: (expense.categoryId && categories.get(expense.categoryId)) || expense.categoryName,
    paidByName: name(expense.paidBy) || expense.paidByName,
    // 經手人以存檔當下的快照文字為準（伺服器已放進 *ByName），沒有快照才用成員現在的名字
    approvedByName: expense.approvedByName || name(expense.approvedBy),
    invoicedByName: expense.invoicedByName || name(expense.invoicedBy),
    accountedByName: expense.accountedByName || name(expense.accountedBy)
  }));
}

/**
 * 奉獻、支出引用了、卻不在成員清單裡的成員 id。成員清單只有目前的測試/正式範圍，
 * 而原本的 JOIN 不分範圍，所以跨範圍引用的名字要另外查（正常資料沒有這種情形，查詢只會是空的）。
 * 指向已刪除成員的舊引用查不到名字，結果與原本 LEFT JOIN 一樣是空的。
 */
export function missingMemberIds(offerings: Offering[], expenses: Expense[], members: Member[]): string[] {
  const known = new Set(members.map(member => member.id));
  const missing = new Set<string>();
  const check = (memberId: string | null | undefined) => { if (memberId && !known.has(memberId)) missing.add(memberId); };
  for (const offering of offerings) check(offering.memberId);
  for (const expense of expenses) {
    check(expense.paidBy);
    // 有快照文字的經手人用不到成員名字
    if (!expense.approvedByName) check(expense.approvedBy);
    if (!expense.invoicedByName) check(expense.invoicedBy);
    if (!expense.accountedByName) check(expense.accountedBy);
  }
  return [...missing];
}

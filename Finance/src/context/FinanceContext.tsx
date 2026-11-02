import React, { createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react';
import type { AppSettings, AuditLog, Expense, ExpenseReceiptSlot, LookupData, Member, Offering } from '../types';
import { api } from '../utils/api';
import { useAuth } from './AuthContext';
import { DEFAULT_TAX_STATEMENT_SETTINGS } from '../shared/taxStatement';
import { hydrateExpenses, hydrateMembers, hydrateOfferings, missingMemberIds } from './hydrate';

// 讀取量的原則（D1 免費方案每天 500 萬列，把 JOIN 查找也算進去）：
//  1. 登入後整份資料只載入一次。看板、報表、報稅、對帳都要全部資料在前端算，
//     與其每個畫面各自向伺服器要彙總，不如載一次、各頁共用。
//  2. 清單端點不 JOIN：名字（成員、分類、方式、分組）與成員的奉獻合計在這裡由已載入的資料補上。
//  3. 寫入後不重抓清單：伺服器回傳存好的那一筆，直接放進本地狀態。以前每存一筆奉獻就重讀
//     奉獻、成員、看板與日誌，約 18,000 列；現在只有寫入本身的幾列。
//  4. 操作日誌只有報表頁用得到：用到才載入，寫入後標記為過期，下次打開報表頁再重抓。

type FinanceState = {
  members: Member[];
  offerings: Offering[];
  expenses: Expense[];
  auditLogs: AuditLog[];
  auditLogsLoaded: boolean;
  /** 奉獻、支出引用到、卻不在本範圍成員清單裡的成員名字（通常是空的）。 */
  extraMemberNames: Record<string, string>;
  lookups: LookupData | null;
  settings: AppSettings;
  loading: boolean;
  error: string | null;
};

type ListKey = 'members' | 'offerings' | 'expenses';
type ListItem = Member | Offering | Expense;

type FinanceContextValue = Omit<FinanceState, 'auditLogsLoaded' | 'extraMemberNames'> & {
  refreshAll: () => Promise<void>;
  /** 操作日誌用到才載入（報表頁、報稅區）；已載入且沒有新的寫入時不重抓。 */
  ensureAuditLogs: () => Promise<void>;
  saveMember: (payload: Partial<Member>, id?: string) => Promise<Member>;
  deleteMember: (id: string, reason: string) => Promise<void>;
  starMember: (id: string) => Promise<void>;
  saveOffering: (payload: Partial<Offering>, id?: string) => Promise<void>;
  deleteOffering: (id: string, reason: string) => Promise<void>;
  saveExpense: (payload: Partial<Expense>, id?: string) => Promise<void>;
  deleteExpense: (id: string, reason: string) => Promise<void>;
  approveExpense: (id: string) => Promise<void>;
  rejectExpense: (id: string) => Promise<void>;
  invoiceExpense: (id: string, payload?: { invoiceNote?: string; invoiceAmount?: number; invoiceReceiptUrls?: string[] }) => Promise<void>;
  accountExpense: (id: string, payload?: { accountReceiptUrls?: string[] }) => Promise<void>;
  saveExpenseReceipts: (id: string, slot: ExpenseReceiptSlot, urls: string[]) => Promise<void>;
  saveSettings: (payload: AppSettings) => Promise<void>;
};

type Action =
  | { type: 'loading'; loading: boolean }
  | { type: 'error'; error: string | null }
  | { type: 'data'; data: Partial<FinanceState> }
  | { type: 'upsert'; key: ListKey; item: ListItem }
  | { type: 'remove'; key: ListKey; id: string }
  | { type: 'auditStale' };

const emptyLookups: LookupData = {
  memberGroups: [],
  offeringCategories: [],
  offeringMethods: [],
  expenseCategories: []
};

const FinanceContext = createContext<FinanceContextValue | undefined>(undefined);

// 與伺服器清單的 ORDER BY date DESC, created_at DESC 相同，新增的一筆才會落在對的位置
const newestFirst = (a: { date: string; createdAt: string }, b: { date: string; createdAt: string }) =>
  (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

function upsertList<T extends { id: string }>(list: T[], item: T, sort?: (a: T, b: T) => number): T[] {
  const index = list.findIndex(existing => existing.id === item.id);
  const next = index >= 0 ? list.map(existing => (existing.id === item.id ? item : existing)) : [...list, item];
  return sort ? next.sort(sort) : next;
}

function reducer(state: FinanceState, action: Action): FinanceState {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: action.loading };
    case 'error':
      return { ...state, error: action.error, loading: false };
    case 'data':
      return { ...state, ...action.data, loading: false, error: null };
    case 'upsert':
      if (action.key === 'members') return { ...state, members: upsertList(state.members, action.item as Member) };
      if (action.key === 'offerings') return { ...state, offerings: upsertList(state.offerings, action.item as Offering, newestFirst) };
      return { ...state, expenses: upsertList(state.expenses, action.item as Expense, newestFirst) };
    case 'remove':
      return { ...state, [action.key]: (state[action.key] as ListItem[]).filter(item => item.id !== action.id) };
    case 'auditStale':
      return { ...state, auditLogsLoaded: false };
    default:
      return state;
  }
}

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, {
    members: [],
    offerings: [],
    expenses: [],
    auditLogs: [],
    auditLogsLoaded: false,
    extraMemberNames: {},
    lookups: emptyLookups,
    settings: { taxStatement: DEFAULT_TAX_STATEMENT_SETTINGS },
    loading: true,
    error: null
  });

  // Counter 只被允許存取 lookups / members / offerings，撈其他端點會拿到 403
  const isCounter = user?.role === 'counter';

  // 跨範圍引用的成員名字：清單外的 id 才查，一般是零筆、不發請求
  const loadExtraMemberNames = async (offerings: Offering[], expenses: Expense[], members: Member[]) => {
    const ids = missingMemberIds(offerings, expenses, members);
    const names: Record<string, string> = {};
    try {
      for (let i = 0; i < ids.length; i += 100) {
        const result = await api.memberNames(ids.slice(i, i + 100));
        for (const item of result.items) names[item.id] = item.name;
      }
    } catch (error) {
      // 只是少幾個名字，不能讓整個載入失敗
      console.error('Failed to load referenced member names', error);
    }
    dispatch({ type: 'data', data: { extraMemberNames: names } });
  };

  const refreshAll = async () => {
    dispatch({ type: 'loading', loading: true });
    try {
      if (isCounter) {
        const [lookups, members, offerings] = await Promise.all([api.lookups(), api.members(), api.offerings()]);
        dispatch({ type: 'data', data: { lookups, members: members.items, offerings: offerings.items } });
        await loadExtraMemberNames(offerings.items, [], members.items);
        return;
      }
      const [settings, lookups, members, offerings, expenses] = await Promise.all([
        api.settings(),
        api.lookups(),
        api.members(),
        api.offerings(),
        api.expenses()
      ]);
      dispatch({
        type: 'data',
        data: {
          settings,
          lookups,
          members: members.items,
          offerings: offerings.items,
          expenses: expenses.items,
          // 重新整理時日誌也視為過期，報表頁打開時再抓
          auditLogsLoaded: false
        }
      });
      await loadExtraMemberNames(offerings.items, expenses.items, members.items);
    } catch (error) {
      dispatch({ type: 'error', error: error instanceof Error ? error.message : '資料載入失敗' });
    }
  };

  // 同時有兩個頁面要日誌時只發一次請求
  const auditRequest = useRef<Promise<void> | null>(null);
  const ensureAuditLogs = useCallback(async () => {
    if (isCounter || state.auditLogsLoaded) return;
    if (!auditRequest.current) {
      auditRequest.current = api.auditLogs()
        .then(result => dispatch({ type: 'data', data: { auditLogs: result.items, auditLogsLoaded: true } }))
        .catch(error => console.error('Failed to load audit logs', error))
        .finally(() => { auditRequest.current = null; });
    }
    await auditRequest.current;
  }, [isCounter, state.auditLogsLoaded]);

  // 每一筆寫入都會記一條操作日誌：日誌過期，下次要用時重抓
  const afterWrite = <T extends ListItem>(key: ListKey, item: T) => {
    dispatch({ type: 'upsert', key, item });
    dispatch({ type: 'auditStale' });
  };
  const afterDelete = (key: ListKey, id: string) => {
    dispatch({ type: 'remove', key, id });
    dispatch({ type: 'auditStale' });
  };

  // 名字由已載入的 lookups 與成員清單補上（清單端點不 JOIN，見伺服器 listMembers 的說明）
  const lookups = state.lookups ?? emptyLookups;
  const nameOf = useMemo(() => {
    const byId = new Map(state.members.map(member => [member.id, member.name]));
    return (memberId: string) => byId.get(memberId) ?? state.extraMemberNames[memberId];
  }, [state.members, state.extraMemberNames]);

  const offerings = useMemo(() => hydrateOfferings(state.offerings, nameOf, lookups), [state.offerings, nameOf, lookups]);
  // Counter 不得看到任何奉獻金額：合計一律為 0
  const members = useMemo(() => hydrateMembers(state.members, state.offerings, lookups, isCounter), [state.members, state.offerings, lookups, isCounter]);
  const expenses = useMemo(() => hydrateExpenses(state.expenses, nameOf, lookups), [state.expenses, nameOf, lookups]);

  const value: FinanceContextValue = {
    members,
    offerings,
    expenses,
    auditLogs: state.auditLogs,
    lookups: state.lookups,
    settings: state.settings,
    loading: state.loading,
    error: state.error,
    refreshAll,
    ensureAuditLogs,
    saveMember: async (payload, id) => {
      const saved = id ? await api.updateMember(id, payload) : await api.createMember(payload);
      // 改名會自動反映在奉獻與支出上：它們的名字是用成員清單補的
      afterWrite('members', saved);
      return saved;
    },
    deleteMember: async (id, reason) => {
      await api.deleteMember(id, reason);
      afterDelete('members', id);
      // 資料庫的外鍵會把這位成員的奉獻、支出經手人設為空：重抓一次才跟資料庫一致（刪除成員很少見）
      if (isCounter) {
        const result = await api.offerings();
        dispatch({ type: 'data', data: { offerings: result.items } });
      } else {
        const [offeringList, expenseList] = await Promise.all([api.offerings(), api.expenses()]);
        dispatch({ type: 'data', data: { offerings: offeringList.items, expenses: expenseList.items } });
      }
    },
    starMember: async id => {
      const updated = await api.starMember(id);
      dispatch({ type: 'upsert', key: 'members', item: updated });
    },
    saveOffering: async (payload, id) => {
      const saved = id ? await api.updateOffering(id, payload) : await api.createOffering(payload);
      afterWrite('offerings', saved);
    },
    deleteOffering: async (id, reason) => {
      await api.deleteOffering(id, reason);
      afterDelete('offerings', id);
    },
    saveExpense: async (payload, id) => {
      const saved = id ? await api.updateExpense(id, payload) : await api.createExpense(payload);
      afterWrite('expenses', saved);
    },
    deleteExpense: async (id, reason) => {
      await api.deleteExpense(id, reason);
      afterDelete('expenses', id);
    },
    approveExpense: async id => {
      afterWrite('expenses', await api.approveExpense(id));
    },
    rejectExpense: async id => {
      afterWrite('expenses', await api.rejectExpense(id));
    },
    invoiceExpense: async (id, payload) => {
      afterWrite('expenses', await api.invoiceExpense(id, payload));
    },
    accountExpense: async (id, payload) => {
      afterWrite('expenses', await api.accountExpense(id, payload));
    },
    saveExpenseReceipts: async (id, slot, urls) => {
      afterWrite('expenses', await api.saveExpenseReceipts(id, slot, urls));
    },
    saveSettings: async payload => {
      const settings = await api.updateSettings(payload);
      dispatch({ type: 'data', data: { settings } });
    }
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const value = useContext(FinanceContext);
  if (!value) throw new Error('useFinance must be used within FinanceProvider');
  return value;
}

import React, { createContext, useContext, useReducer } from 'react';
import type { AppSettings, AuditLog, DashboardStats, Expense, LookupData, Member, Offering } from '../types';
import { api } from '../utils/api';
import { DEFAULT_TAX_STATEMENT_SETTINGS } from '../shared/taxStatement';

type FinanceState = {
  dashboard: DashboardStats | null;
  members: Member[];
  offerings: Offering[];
  expenses: Expense[];
  auditLogs: AuditLog[];
  lookups: LookupData | null;
  settings: AppSettings;
  loading: boolean;
  error: string | null;
};

type FinanceContextValue = FinanceState & {
  refreshAll: () => Promise<void>;
  saveMember: (payload: Partial<Member>, id?: string) => Promise<void>;
  deleteMember: (id: string, reason: string) => Promise<void>;
  starMember: (id: string) => Promise<void>;
  saveOffering: (payload: Partial<Offering>, id?: string) => Promise<void>;
  deleteOffering: (id: string, reason: string) => Promise<void>;
  saveExpense: (payload: Partial<Expense>, id?: string) => Promise<void>;
  deleteExpense: (id: string, reason: string) => Promise<void>;
  approveExpense: (id: string) => Promise<void>;
  rejectExpense: (id: string) => Promise<void>;
  saveSettings: (payload: AppSettings) => Promise<void>;
};

type Action =
  | { type: 'loading'; loading: boolean }
  | { type: 'error'; error: string | null }
  | { type: 'data'; data: Partial<FinanceState> };

const emptyLookups: LookupData = {
  memberGroups: [],
  offeringCategories: [],
  offeringMethods: [],
  expenseCategories: []
};

const FinanceContext = createContext<FinanceContextValue | undefined>(undefined);

function reducer(state: FinanceState, action: Action): FinanceState {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: action.loading };
    case 'error':
      return { ...state, error: action.error, loading: false };
    case 'data':
      return { ...state, ...action.data, loading: false, error: null };
    default:
      return state;
  }
}

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    dashboard: null,
    members: [],
    offerings: [],
    expenses: [],
    auditLogs: [],
    lookups: emptyLookups,
    settings: { taxStatement: DEFAULT_TAX_STATEMENT_SETTINGS },
    loading: true,
    error: null
  });

  const refreshAll = async () => {
    dispatch({ type: 'loading', loading: true });
    try {
      const [dashboard, settings, lookups, members, offerings, expenses, auditLogs] = await Promise.all([
        api.dashboard(),
        api.settings(),
        api.lookups(),
        api.members(),
        api.offerings(),
        api.expenses(),
        api.auditLogs()
      ]);
      dispatch({
        type: 'data',
        data: {
          dashboard,
          settings,
          lookups,
          members: members.items,
          offerings: offerings.items,
          expenses: expenses.items,
          auditLogs: auditLogs.items
        }
      });
    } catch (error) {
      dispatch({ type: 'error', error: error instanceof Error ? error.message : '資料載入失敗' });
    }
  };

  const refreshAfterWrite = async () => {
    const [dashboard, members, offerings, expenses, auditLogs] = await Promise.all([
      api.dashboard(),
      api.members(),
      api.offerings(),
      api.expenses(),
      api.auditLogs()
    ]);
    dispatch({
      type: 'data',
      data: { dashboard, members: members.items, offerings: offerings.items, expenses: expenses.items, auditLogs: auditLogs.items }
    });
  };

  const value: FinanceContextValue = {
    ...state,
    refreshAll,
    saveMember: async (payload, id) => {
      id ? await api.updateMember(id, payload) : await api.createMember(payload);
      await refreshAfterWrite();
    },
    deleteMember: async (id, reason) => {
      await api.deleteMember(id, reason);
      await refreshAfterWrite();
    },
    starMember: async id => {
      const updated = await api.starMember(id);
      const newMembers = state.members.map(m => m.id === id ? updated : m);
      newMembers.sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || a.name.localeCompare(b.name));
      dispatch({ type: 'data', data: { members: newMembers } });
    },
    saveOffering: async (payload, id) => {
      id ? await api.updateOffering(id, payload) : await api.createOffering(payload);
      await refreshAfterWrite();
    },
    deleteOffering: async (id, reason) => {
      await api.deleteOffering(id, reason);
      await refreshAfterWrite();
    },
    saveExpense: async (payload, id) => {
      id ? await api.updateExpense(id, payload) : await api.createExpense(payload);
      await refreshAfterWrite();
    },
    deleteExpense: async (id, reason) => {
      await api.deleteExpense(id, reason);
      await refreshAfterWrite();
    },
    approveExpense: async id => {
      await api.approveExpense(id);
      await refreshAfterWrite();
    },
    rejectExpense: async id => {
      await api.rejectExpense(id);
      await refreshAfterWrite();
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

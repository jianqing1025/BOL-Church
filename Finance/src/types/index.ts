export type Role = 'super_admin' | 'finance_admin' | 'auditor' | 'member';
export type MemberStatus = 'active' | 'inactive' | 'visitor';
export type ExpenseStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  memberId?: string | null;
}

export interface MemberGroup {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface Member {
  id: string;
  importPid?: string | null;
  name: string;
  firstName?: string;
  lastName?: string;
  partner?: string;
  email: string;
  phone: string;
  homePhone?: string;
  groupId: string | null;
  groupName?: string;
  status: MemberStatus;
  joinDate: string;
  address?: string;
  city?: string;
  stateRegion?: string;
  postalCode?: string;
  notes: string;
  avatarUrl?: string | null;
  contactConfirmed?: boolean;
  externalContact?: boolean;
  importSource?: string;
  totalOffering: number;
  createdAt: string;
  updatedAt: string;
}

export interface OfferingCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  createdAt: string;
}

export interface OfferingMethod {
  id: string;
  name: string;
  createdAt: string;
}

export interface Offering {
  id: string;
  memberId: string | null;
  memberName?: string;
  amount: number;
  date: string;
  categoryId: string | null;
  categoryName?: string;
  methodId: string | null;
  methodName?: string;
  notes: string;
  receiptUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  budgetMonthly: number;
  description: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  categoryId: string | null;
  categoryName?: string;
  amount: number;
  date: string;
  description: string;
  paidBy: string | null;
  paidByName?: string;
  approvedBy: string | null;
  approvedByName?: string;
  paymentMethod: string;
  status: ExpenseStatus;
  receiptUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  weekOfferingTotal: number;
  weekOfferingChange: number;
  monthExpenseTotal: number;
  monthBudgetRemaining: number;
  pendingExpenseCount: number;
  newMembersThisMonth: number;
  incomeExpense: Array<{ label: string; offerings: number; expenses: number }>;
  offeringTrend: Array<{ label: string; amount: number }>;
}

export interface LookupData {
  memberGroups: MemberGroup[];
  offeringCategories: OfferingCategory[];
  offeringMethods: OfferingMethod[];
  expenseCategories: ExpenseCategory[];
}

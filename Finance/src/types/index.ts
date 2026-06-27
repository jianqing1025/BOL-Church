export type Role = 'super_admin' | 'finance_admin' | 'auditor' | 'dev';
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
  starred: boolean;
  avatarUrl?: string | null;
  contactConfirmed?: boolean;
  externalContact?: boolean;
  importSource?: string;
  totalOffering: number;
  isTest?: boolean;
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
  groupName?: string;
  sortOrder?: number;
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
  isTest?: boolean;
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
  approvedAt?: string | null;
  invoicedBy?: string | null;
  invoicedByName?: string;
  invoicedAt?: string | null;
  invoiceNote?: string | null;
  invoiceAmount?: number | null;
  invoiceReceiptUrl?: string | null;
  accountedBy?: string | null;
  accountedByName?: string;
  accountedAt?: string | null;
  accountReceiptUrl?: string | null;
  paymentMethod: string;
  status: ExpenseStatus;
  notes: string;
  receiptUrl?: string | null;
  isTest?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: Role;
  memberId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  entitySummary: string;
  reason: string;
  userId: string;
  userName: string;
  createdAt: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
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

export interface TaxStatementTextFields {
  churchNameEn: string;
  churchNameZh: string;
  churchAddress: string;
  churchPhone: string;
  churchWebsite: string;
  appreciation: string;
  notice: string;
  disclosure: string;
  signerName: string;
}

export interface TaxStatementSettings {
  mailFrom: string;
  replyTo: string;
  signatureUrl: string;
  textFields: TaxStatementTextFields;
  htmlTemplate: string;
}

export interface ExpenseNotifySettings {
  enabled: boolean;
  recipients: string[];
  mailFrom: string;
  replyTo: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
  includeActionButtons?: boolean;
}

export interface AppSettings {
  taxStatement: TaxStatementSettings;
  expenseNotify?: ExpenseNotifySettings;
}

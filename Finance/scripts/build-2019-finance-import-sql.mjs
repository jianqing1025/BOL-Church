import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function requireTool(name) {
  for (const root of [path.resolve('.tmp/import-tools/node_modules'), path.resolve('Finance/.tmp/import-tools/node_modules')]) {
    try {
      return require(path.join(root, name));
    } catch {
      // Try the next temp install location.
    }
  }
  throw new Error(`Missing temp dependency ${name}. Run: npm install --prefix .tmp/import-tools ${name}`);
}

const MDBReader = requireTool('mdb-reader').default ?? requireTool('mdb-reader');

const sourcePath = '\\\\rev500\\NAS\\Projects\\Church\\2019BOLCCOP-jIANQING.accdb';
const outDir = fs.existsSync(path.resolve('Finance'))
  ? path.resolve('Finance/.tmp/2019-finance-import')
  : path.resolve('.tmp/2019-finance-import');
fs.mkdirSync(outDir, { recursive: true });

const now = new Date().toISOString();

function sql(value) {
  if (value == null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlText(value) {
  if (value == null) return "''";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function slug(value, fallback) {
  const text = String(value ?? '').trim().toLowerCase();
  const cleaned = text.replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function amount(value) {
  if (value == null || value === '') return 0;
  return Number(String(value).replace(/[,$¥￥\s]/g, '')) || 0;
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function compact(parts) {
  return parts.filter(part => part != null && String(part).trim() !== '').map(part => String(part).trim()).join(' | ');
}

function memberIdSqlByPid(pid) {
  const clean = String(pid ?? '').trim();
  if (!clean || clean === '0') return 'NULL';
  return `(SELECT id FROM members WHERE import_pid = ${sql(clean)} LIMIT 1)`;
}

const reader = new MDBReader(fs.readFileSync(sourcePath));
const table = name => reader.getTable(name).getData();

const accounts = table('T_Accounts');
const offerDetails = table('T_Offer_Detail');
const offerSummaries = new Map(table('T_Offer_Summary').map(row => [String(row.ID), row]));
const offerPurposes = new Map(table('T_Offer_Purpose').map(row => [String(row.ID), row]));
const offerTypes = new Map(table('T_Offer_Currency_Type').map(row => [String(row.ID), row]));
const expenseCategoriesRaw = table('T_Expense_Categories');
const expenseDetails = table('T_Expense_Detail');
const expenseSummaries = new Map(table('T_Expense_Summary').map(row => [String(row.ExpenseID), row]));
const onlineItems = new Map(table('T_Online_Tran_Items').map(row => [String(row.ID), row]));
const bankRows = table('T_Bank_Download');

const lines = [
  '-- Prepared import for 2019 finance data.',
  `-- Generated at ${now}.`,
  `-- Source Access: ${sourcePath}`,
  '-- D1 remote imports reject explicit BEGIN/COMMIT statements, so this file is statement-only.',
];

const groups = new Map();
for (const row of accounts) {
  const name = String(row.Group ?? '').trim();
  if (name) groups.set(`import-2019-group-${slug(name, Buffer.from(name).toString('hex'))}`, name);
}
for (const [id, name] of groups) {
  lines.push(`INSERT INTO member_groups (id, name, description, created_at) VALUES (${sql(id)}, ${sql(name)}, 'Imported from 2019BOLCCOP-jIANQING.accdb T_Accounts', ${sql(now)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description;`);
}

const seenEmails = new Set();
for (const row of accounts) {
  const pid = String(row.PID || row.ID || '').trim();
  if (!pid) continue;
  const id = `access-${pid}`;
  const fullName = String(row.FullName || `${row['First Name'] ?? ''} ${row['Last Name'] ?? ''}`).trim() || `Imported Member ${pid}`;
  const groupName = String(row.Group ?? '').trim();
  const groupId = groupName ? `import-2019-group-${slug(groupName, Buffer.from(groupName).toString('hex'))}` : null;
  const emailRaw = String(row.Email ?? '').trim();
  const emailKey = emailRaw.toLowerCase();
  const email = emailRaw && !seenEmails.has(emailKey) ? emailRaw : null;
  if (email) seenEmails.add(emailKey);
  const phone = String(row['Cell Tel'] || row['Home Tel'] || '').trim() || null;
  const status = row['External contact'] === true ? 'visitor' : 'active';
  const externalContact = row['External contact'] === true ? 1 : 0;
  const contactConfirmed = row['Contact Confirmed'] === true ? 1 : 0;
  lines.push(`INSERT OR IGNORE INTO members (id, import_pid, name, first_name, last_name, partner, email, phone, home_phone, group_id, status, join_date, address, city, state_region, postal_code, notes, contact_confirmed, external_contact, import_source, is_test, created_at, updated_at) VALUES (${sql(id)}, ${sql(pid)}, ${sql(fullName)}, ${sql(row['First Name'])}, ${sql(row['Last Name'])}, ${sql(row.Partner)}, ${sql(email)}, ${sql(phone)}, ${sql(row['Home Tel'])}, ${sql(groupId)}, ${sql(status)}, '2019-01-01', ${sql(row.Address)}, ${sql(row.City)}, ${sql(row.State)}, ${sql(row.Zip)}, ${sqlText(row.Remark)}, ${contactConfirmed}, ${externalContact}, '2019BOLCCOP-jIANQING.accdb:T_Accounts', 0, ${sql(now)}, ${sql(now)});`);
}

const offeringCategories = new Map();
for (const row of offerPurposes.values()) {
  const purpose = String(row.TypeOrPurpose ?? row.ID).trim();
  offeringCategories.set(`import-2019-offering-${slug(purpose, String(row.ID).toLowerCase())}`, purpose);
}
for (const [id, name] of offeringCategories) {
  lines.push(`INSERT INTO offering_categories (id, name, description, icon, created_at) VALUES (${sql(id)}, ${sql(name)}, 'Imported 2019 offering purpose', 'gift', ${sql(now)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description;`);
}

const methods = new Map();
for (const row of offerTypes.values()) {
  const name = String(row.Description || row.OfferType || row.ID).trim();
  methods.set(`import-2019-method-${slug(row.OfferType || row.ID, String(row.ID))}`, name);
}
for (const [id, name] of methods) {
  lines.push(`INSERT INTO offering_methods (id, name, created_at) VALUES (${sql(id)}, ${sql(name)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name;`);
}

let offeringTotal = 0;
let skippedOfferings = 0;
for (const row of offerDetails) {
  const amt = amount(row.AmtUSD);
  if (amt <= 0) {
    skippedOfferings += 1;
    continue;
  }
  offeringTotal += amt;
  const summary = offerSummaries.get(String(row.OfferID));
  const receiveDate = dateOnly(summary?.ReceiveDate) ?? '2019-01-01';
  const purpose = offerPurposes.get(String(row.Purpose));
  const purposeName = String(purpose?.TypeOrPurpose ?? row.Purpose ?? 'General').trim() || 'General';
  const categoryId = `import-2019-offering-${slug(purposeName, String(row.Purpose || 'general').toLowerCase())}`;
  const type = offerTypes.get(String(row.OfferTypeID));
  const methodId = `import-2019-method-${slug(type?.OfferType || row.OfferTypeID, String(row.OfferTypeID))}`;
  const notes = compact([
    `auto_id=${row.AutoID}`,
    row.CheckBank ? `bank=${row.CheckBank}` : null,
    row['Check#'] ? `check=${row['Check#']}` : null,
    row.Remark ? `remark=${row.Remark}` : null,
  ]);
  lines.push(`INSERT INTO offerings (id, member_id, amount, date, category_id, method_id, notes, receipt_url, is_test, created_at, updated_at) VALUES (${sql(`import-2019-offering-${row.AutoID}`)}, ${memberIdSqlByPid(row.PID)}, ${amt.toFixed(2)}, ${sql(receiveDate)}, ${sql(categoryId)}, ${sql(methodId)}, ${sqlText(notes)}, NULL, 0, ${sql(now)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET member_id = excluded.member_id, amount = excluded.amount, date = excluded.date, category_id = excluded.category_id, method_id = excluded.method_id, notes = excluded.notes, is_test = excluded.is_test, updated_at = excluded.updated_at;`);
}

const expenseCategoryNames = new Map();
for (const row of expenseCategoriesRaw) {
  if (!String(row.SubCatID ?? '').trim()) continue;
  expenseCategoryNames.set(String(row.SubCatID).trim(), String(row.Discription ?? row.SubCatID).trim());
}

const usedExpenseCategories = new Map();
function useExpenseCategory(subCatId) {
  const clean = String(subCatId ?? '').trim();
  if (!clean) return null;
  const id = `import-2019-expense-${slug(clean, 'uncategorized')}`;
  usedExpenseCategories.set(id, expenseCategoryNames.get(clean) || clean);
  return id;
}

const detailAmountKeys = new Set();
let expenseTotal = 0;
let expenseDetailRows = 0;
for (const row of expenseDetails) {
  const amt = amount(row.Amt);
  if (amt <= 0) continue;
  expenseTotal += amt;
  expenseDetailRows += 1;
  const summary = expenseSummaries.get(String(row.ExpenseID));
  const date = dateOnly(summary?.ApplyDate) ?? '2019-01-01';
  detailAmountKeys.add(`${date}|${amt.toFixed(2)}`);
  const categoryId = useExpenseCategory(row.SubCatID);
  const paymentMethod = summary?.['Check#'] ? `Check ${summary['Check#']}` : 'Check/Manual';
  const description = compact([row.ExpenseID, row.Remark]).slice(0, 500) || '2019 imported expense';
  const notes = compact([
    'source=2019BOLCCOP-jIANQING.accdb:T_Expense_Detail',
    `auto_id=${row.AutoID}`,
    summary?.CheckPayableTo ? `payable_to=${summary.CheckPayableTo}` : null,
    summary?.Remark ? `summary_remark=${summary.Remark}` : null,
    row.CatID ? `cat=${row.CatID}` : null,
    row.SubCatID ? `subcat=${row.SubCatID}` : null,
    row.Remark ? `detail_remark=${row.Remark}` : null,
  ]);
  lines.push(`INSERT INTO expenses (id, category_id, amount, date, description, paid_by, approved_by, approved_at, invoiced_by, invoiced_at, accounted_by, accounted_at, payment_method, status, notes, receipt_url, is_test, created_at, updated_at) VALUES (${sql(`import-2019-expense-detail-${row.AutoID}`)}, ${sql(categoryId)}, ${amt.toFixed(2)}, ${sql(date)}, ${sql(description)}, NULL, NULL, ${sql(now)}, NULL, NULL, NULL, NULL, ${sql(paymentMethod)}, 'approved', ${sqlText(notes)}, NULL, 0, ${sql(now)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, amount = excluded.amount, date = excluded.date, description = excluded.description, payment_method = excluded.payment_method, status = excluded.status, notes = excluded.notes, is_test = excluded.is_test, updated_at = excluded.updated_at;`);
}

let bankExpenseRows = 0;
let skippedDuplicateBankRows = 0;
for (const row of bankRows) {
  const amt = amount(row.Amt);
  if (amt >= 0 || String(row.ReconLinkType ?? '') !== '3') continue;
  const online = onlineItems.get(String(row.ReconLinkKey));
  if (!online || String(online.IncomeOrExpense).toLowerCase() !== 'expense') continue;
  const absAmt = Math.abs(amt);
  const date = dateOnly(row.Date) ?? '2019-01-01';
  if (detailAmountKeys.has(`${date}|${absAmt.toFixed(2)}`) || detailAmountKeys.has(`2019-03-02|${absAmt.toFixed(2)}`)) {
    skippedDuplicateBankRows += 1;
    continue;
  }
  expenseTotal += absAmt;
  bankExpenseRows += 1;
  const categoryId = useExpenseCategory(online.ExpenseSubCategory);
  const description = compact([`Bank tran ${row.ID}`, online.TranTypeName]).slice(0, 500);
  const notes = compact([
    'source=2019BOLCCOP-jIANQING.accdb:T_Bank_Download',
    `bank_id=${row.ID}`,
    row.Summary ? `summary=${row.Summary}` : null,
    row.Remark ? `remark=${row.Remark}` : null,
    online.ExpenseCategory ? `cat=${online.ExpenseCategory}` : null,
    online.ExpenseSubCategory ? `subcat=${online.ExpenseSubCategory}` : null,
    row.Exclude === true ? 'source_exclude=true' : null,
  ]);
  lines.push(`INSERT INTO expenses (id, category_id, amount, date, description, paid_by, approved_by, approved_at, invoiced_by, invoiced_at, accounted_by, accounted_at, payment_method, status, notes, receipt_url, is_test, created_at, updated_at) VALUES (${sql(`import-2019-expense-bank-${row.ID}`)}, ${sql(categoryId)}, ${absAmt.toFixed(2)}, ${sql(date)}, ${sql(description)}, NULL, NULL, ${sql(now)}, NULL, NULL, NULL, NULL, 'Bank/Online', 'approved', ${sqlText(notes)}, NULL, 0, ${sql(now)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, amount = excluded.amount, date = excluded.date, description = excluded.description, payment_method = excluded.payment_method, status = excluded.status, notes = excluded.notes, is_test = excluded.is_test, updated_at = excluded.updated_at;`);
}

for (const [id, name] of usedExpenseCategories) {
  lines.splice(lines.findIndex(line => line.startsWith('INSERT INTO expenses ')), 0, `INSERT INTO expense_categories (id, name, budget_monthly, description, created_at) VALUES (${sql(id)}, ${sql(name)}, 0, 'Imported 2019 expense category', ${sql(now)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description;`);
}

const sqlPath = path.join(outDir, 'import-2019-finance.sql');
fs.writeFileSync(sqlPath, `${lines.join('\n')}\n`, 'utf8');

const report = {
  generatedAt: now,
  sourcePath,
  sqlPath,
  members: accounts.length,
  memberGroups: groups.size,
  offeringRows: offerDetails.length,
  offeringImportedRows: offerDetails.filter(row => amount(row.AmtUSD) > 0).length,
  offeringTotal: Number(offeringTotal.toFixed(2)),
  skippedOfferings,
  offeringCategories: offeringCategories.size,
  offeringMethods: methods.size,
  expenseDetailRows,
  bankExpenseRows,
  skippedDuplicateBankRows,
  expenseImportedRows: expenseDetailRows + bankExpenseRows,
  expenseTotal: Number(expenseTotal.toFixed(2)),
  expenseCategories: usedExpenseCategories.size,
  note2018: 'No reliable 2018 finance database was found in the provided 2019 Access file; 2018 tax.accdb contains 2017-dated tax detail and was not imported.',
};

fs.writeFileSync(path.join(outDir, 'import-2019-finance-report.json'), JSON.stringify(report, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'import-2019-finance-report.md'), [
  '# 2019 Finance Import Build Report',
  '',
  `Generated: ${report.generatedAt}`,
  `SQL: ${report.sqlPath}`,
  '',
  `Members in source: ${report.members}`,
  `Member groups: ${report.memberGroups}`,
  `Offerings imported: ${report.offeringImportedRows} rows, total ${report.offeringTotal.toFixed(2)}, categories ${report.offeringCategories}`,
  `Offerings skipped: ${report.skippedOfferings} non-positive rows`,
  `Expenses imported: ${report.expenseImportedRows} rows, total ${report.expenseTotal.toFixed(2)}`,
  `Expense detail rows: ${report.expenseDetailRows}`,
  `Bank/online expense rows: ${report.bankExpenseRows}`,
  `Bank duplicate rows skipped: ${report.skippedDuplicateBankRows}`,
  `Expense categories: ${report.expenseCategories}`,
  '',
  report.note2018,
].join('\n'), 'utf8');

console.log(`Wrote ${sqlPath}`);
console.log(JSON.stringify(report, null, 2));

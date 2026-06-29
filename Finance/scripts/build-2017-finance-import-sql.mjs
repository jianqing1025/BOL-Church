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
const XLSX = requireTool('xlsx');

const sourceDir = '\\\\rev500\\NAS\\Projects\\Church\\2017\\BreadofLife';
const outDir = fs.existsSync(path.resolve('Finance'))
  ? path.resolve('Finance/.tmp/2017-finance-import')
  : path.resolve('.tmp/2017-finance-import');
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

function parseMoney(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  const original = String(value);
  const negative = /\(/.test(original) || /-\s*[\d¥￥$]/.test(original) || /[¥￥$]\s*-/.test(original);
  const text = original.replace(/[,$¥￥\s()]/g, '').replace(/-/g, '');
  const amount = Number(text);
  if (negative && Number.isFinite(amount)) return -amount;
  return Number.isFinite(amount) ? amount : 0;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (match) {
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const date = new Date(Date.UTC(year, months[match[2].toLowerCase()], Number(match[1])));
    return date.toISOString().slice(0, 10);
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function compact(parts) {
  return parts.filter(part => part != null && String(part).trim() !== '').map(part => String(part).trim()).join(' | ');
}

function memberId(pid) {
  const clean = String(pid ?? '').trim();
  if (!clean || clean === '0') return null;
  return `access-${clean}`;
}

function memberIdSqlByPid(pid) {
  const clean = String(pid ?? '').trim();
  if (!clean || clean === '0') return 'NULL';
  return `(SELECT id FROM members WHERE import_pid = ${sql(clean)} LIMIT 1)`;
}

function readAccessTable(tableName) {
  const reader = new MDBReader(fs.readFileSync(path.join(sourceDir, '2017bolccop.accdb')));
  return reader.getTable(tableName).getData();
}

function readSheet(sheetName) {
  const workbook = XLSX.readFile(path.join(sourceDir, '2017bolccop.xlsx'), { cellDates: true });
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: false });
}

const accounts = readAccessTable('T_Accounts');
const incomeRows = readSheet('Income Detail');
const expenseRows = readSheet('Expense Detail');

const lines = [
  '-- Prepared import for 2017 finance data.',
  `-- Generated at ${now}.`,
  `-- Source Access: ${sourceDir}\\2017bolccop.accdb (members)`,
  `-- Source workbook: ${sourceDir}\\2017bolccop.xlsx (offerings and expenses)`,
  '-- This file is staged only. Execute it with wrangler d1 execute after approval.',
  '-- D1 remote imports reject explicit BEGIN/COMMIT statements, so this file is statement-only.',
];

const groups = new Map();
for (const row of accounts) {
  const name = String(row.Group ?? '').trim();
  if (name) groups.set(`import-2017-group-${slug(name, Buffer.from(name).toString('hex'))}`, name);
}

for (const [id, name] of groups) {
  lines.push(`INSERT INTO member_groups (id, name, description, created_at) VALUES (${sql(id)}, ${sql(name)}, 'Imported from 2017bolccop.accdb T_Accounts', ${sql(now)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description;`);
}

const seenEmails = new Set();
for (const row of accounts) {
  const pid = String(row.PID || row.ID || '').trim();
  if (!pid) continue;
  const id = memberId(pid);
  const fullName = String(row.FullName || `${row['First Name'] ?? ''} ${row['Last Name'] ?? ''}`).trim() || `Imported Member ${pid}`;
  const groupName = String(row.Group ?? '').trim();
  const groupId = groupName ? `import-2017-group-${slug(groupName, Buffer.from(groupName).toString('hex'))}` : null;
  const emailRaw = String(row.Email ?? '').trim();
  const emailKey = emailRaw.toLowerCase();
  const email = emailRaw && !seenEmails.has(emailKey) ? emailRaw : null;
  if (email) seenEmails.add(emailKey);
  const phone = String(row['Cell Tel'] || row['Home Tel'] || '').trim() || null;
  const status = row['External contact'] === true ? 'visitor' : 'active';
  const externalContact = row['External contact'] === true ? 1 : 0;
  const contactConfirmed = row['Contact Confirmed'] === true ? 1 : 0;
  lines.push(`INSERT OR IGNORE INTO members (id, import_pid, name, first_name, last_name, partner, email, phone, home_phone, group_id, status, join_date, address, city, state_region, postal_code, notes, contact_confirmed, external_contact, import_source, is_test, created_at, updated_at) VALUES (${sql(id)}, ${sql(pid)}, ${sql(fullName)}, ${sql(row['First Name'])}, ${sql(row['Last Name'])}, ${sql(row.Partner)}, ${sql(email)}, ${sql(phone)}, ${sql(row['Home Tel'])}, ${sql(groupId)}, ${sql(status)}, '2017-01-01', ${sql(row.Address)}, ${sql(row.City)}, ${sql(row.State)}, ${sql(row.Zip)}, ${sqlText(row.Remark)}, ${contactConfirmed}, ${externalContact}, '2017bolccop.accdb:T_Accounts', 0, ${sql(now)}, ${sql(now)});`);
}

const offeringCategories = new Map();
const offeringMethods = new Map([
  ['import-2017-method-cash', 'Cash/Unknown'],
  ['import-2017-method-check', 'Check'],
]);
for (const row of incomeRows) {
  const purpose = String(row.TypeOrPurpose ?? 'General').trim() || 'General';
  offeringCategories.set(`import-2017-offering-${slug(purpose, 'general')}`, purpose);
}
for (const [id, name] of offeringCategories) {
  lines.push(`INSERT INTO offering_categories (id, name, description, icon, created_at) VALUES (${sql(id)}, ${sql(name)}, 'Imported 2017 offering purpose', 'gift', ${sql(now)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description;`);
}
for (const [id, name] of offeringMethods) {
  lines.push(`INSERT INTO offering_methods (id, name, created_at) VALUES (${sql(id)}, ${sql(name)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name;`);
}

let offeringTotal = 0;
let sourceOfferingNetTotal = 0;
const skippedOfferings = [];
incomeRows.forEach((row, index) => {
  const amount = parseMoney(row.AmtUSD);
  sourceOfferingNetTotal += amount;
  if (amount <= 0) {
    if (amount < 0) skippedOfferings.push({ row: index + 2, amount, reason: 'negative_amount_not_allowed_by_target_schema', source: row });
    return;
  }
  offeringTotal += amount;
  const date = parseDate(row.ReceiveDate) ?? '2017-01-01';
  const purpose = String(row.TypeOrPurpose ?? 'General').trim() || 'General';
  const categoryId = `import-2017-offering-${slug(purpose, 'general')}`;
  const checkNo = String(row['Check#'] ?? '').trim();
  const methodId = checkNo ? 'import-2017-method-check' : 'import-2017-method-cash';
  const donorId = memberId(row.PID);
  const donorSql = memberIdSqlByPid(row.PID);
  const note = compact([
    'source=2017bolccop.xlsx:Income Detail',
    `row=${index + 2}`,
    donorId ? null : `displayName=${row.FullName ?? ''}`,
    row.CheckBank ? `bank=${row.CheckBank}` : null,
    checkNo ? `check=${checkNo}` : null,
    row.Remark ? `remark=${row.Remark}` : null,
    String(row['External contact'] ?? '') ? `external_contact=${row['External contact']}` : null,
  ]);
  lines.push(`INSERT INTO offerings (id, member_id, amount, date, category_id, method_id, notes, receipt_url, is_test, created_at, updated_at) VALUES (${sql(`import-2017-offering-row-${index + 2}`)}, ${donorSql}, ${amount.toFixed(2)}, ${sql(date)}, ${sql(categoryId)}, ${sql(methodId)}, ${sqlText(note)}, NULL, 0, ${sql(now)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET member_id = excluded.member_id, amount = excluded.amount, date = excluded.date, category_id = excluded.category_id, method_id = excluded.method_id, notes = excluded.notes, is_test = excluded.is_test, updated_at = excluded.updated_at;`);
});

const expenseCategories = new Map();
for (const row of expenseRows) {
  const subCatId = String(row.SubCatID ?? '').trim();
  if (!subCatId) continue;
  const name = String(row['V_Expense_SubCategories.Discription'] ?? subCatId).trim() || subCatId;
  const budget = parseMoney(row['17 Budget']);
  expenseCategories.set(`import-2017-expense-${slug(subCatId, 'uncategorized')}`, { name, budget });
}
for (const [id, category] of expenseCategories) {
  lines.push(`INSERT INTO expense_categories (id, name, budget_monthly, description, created_at) VALUES (${sql(id)}, ${sql(category.name)}, ${category.budget.toFixed(2)}, 'Imported 2017 expense subcategory', ${sql(now)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, budget_monthly = excluded.budget_monthly, description = excluded.description;`);
}

let expenseTotal = 0;
let sourceExpenseNetTotal = 0;
const skippedExpenses = [];
expenseRows.forEach((row, index) => {
  const amount = parseMoney(row.Amt);
  sourceExpenseNetTotal += amount;
  if (amount <= 0) {
    if (amount < 0) skippedExpenses.push({ row: index + 2, amount, reason: 'negative_amount_not_allowed_by_target_schema', source: row });
    return;
  }
  expenseTotal += amount;
  const date = parseDate(row.ApplyDate) ?? '2017-01-01';
  const subCatId = String(row.SubCatID ?? '').trim();
  const categoryId = subCatId ? `import-2017-expense-${slug(subCatId, 'uncategorized')}` : null;
  const checkNo = String(row['Check#'] ?? '').trim();
  const paymentMethod = checkNo ? `Check ${checkNo}` : (String(row.ExpenseID ?? '').includes('tranID') ? 'Bank/Online' : 'Unknown');
  const description = compact([row.ExpenseID, row.Remark]).slice(0, 500) || '2017 imported expense';
  const notes = compact([
    'source=2017bolccop.xlsx:Expense Detail',
    `row=${index + 2}`,
    row.CatID ? `cat=${row.CatID}` : null,
    row['V_Expense_Categories.Discription'] ? `cat_desc=${row['V_Expense_Categories.Discription']}` : null,
    row.SubCatID ? `subcat=${row.SubCatID}` : null,
    row.ClearDate ? `clear_date=${parseDate(row.ClearDate) ?? row.ClearDate}` : null,
    row.Remark ? `remark=${row.Remark}` : null,
  ]);
  lines.push(`INSERT INTO expenses (id, category_id, amount, date, description, paid_by, approved_by, approved_at, invoiced_by, invoiced_at, accounted_by, accounted_at, payment_method, status, notes, receipt_url, is_test, created_at, updated_at) VALUES (${sql(`import-2017-expense-row-${index + 2}`)}, ${sql(categoryId)}, ${amount.toFixed(2)}, ${sql(date)}, ${sql(description)}, NULL, NULL, ${sql(now)}, NULL, NULL, NULL, NULL, ${sql(paymentMethod)}, 'approved', ${sqlText(notes)}, NULL, 0, ${sql(now)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, amount = excluded.amount, date = excluded.date, description = excluded.description, payment_method = excluded.payment_method, status = excluded.status, notes = excluded.notes, is_test = excluded.is_test, updated_at = excluded.updated_at;`);
});

const sqlPath = path.join(outDir, 'import-2017-finance.sql');
fs.writeFileSync(sqlPath, `${lines.join('\n')}\n`, 'utf8');

const report = {
  generatedAt: now,
  sourceDir,
  sqlPath,
  members: accounts.length,
  memberGroups: groups.size,
  offeringRows: incomeRows.length,
  offeringImportedRows: incomeRows.filter(row => parseMoney(row.AmtUSD) > 0).length,
  offeringTotal: Number(offeringTotal.toFixed(2)),
  sourceOfferingNetTotal: Number(sourceOfferingNetTotal.toFixed(2)),
  skippedOfferings,
  offeringCategories: offeringCategories.size,
  expenseRows: expenseRows.length,
  expenseImportedRows: expenseRows.filter(row => parseMoney(row.Amt) > 0).length,
  expenseTotal: Number(expenseTotal.toFixed(2)),
  sourceExpenseNetTotal: Number(sourceExpenseNetTotal.toFixed(2)),
  skippedExpenses,
  expenseCategories: expenseCategories.size,
};
fs.writeFileSync(path.join(outDir, 'import-2017-finance-report.json'), JSON.stringify(report, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'import-2017-finance-report.md'), [
  '# 2017 Finance Import Build Report',
  '',
  `Generated: ${report.generatedAt}`,
  `SQL: ${report.sqlPath}`,
  '',
  `Members: ${report.members}`,
  `Member groups: ${report.memberGroups}`,
  `Offerings imported: ${report.offeringImportedRows} rows, positive total ${report.offeringTotal.toFixed(2)}, source net ${report.sourceOfferingNetTotal.toFixed(2)}, categories ${report.offeringCategories}`,
  `Offerings skipped: ${report.skippedOfferings.length} negative rows`,
  `Expenses imported: ${report.expenseImportedRows} rows, positive total ${report.expenseTotal.toFixed(2)}, source net ${report.sourceExpenseNetTotal.toFixed(2)}, categories ${report.expenseCategories}`,
  `Expenses skipped: ${report.skippedExpenses.length} negative rows`,
  '',
  'Not executed. Run with wrangler d1 execute only after approval.',
].join('\n'), 'utf8');

console.log(`Wrote ${sqlPath}`);
console.log(JSON.stringify(report, null, 2));

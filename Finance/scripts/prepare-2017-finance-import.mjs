import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const toolsRoot = path.resolve('Finance/.tmp/import-tools/node_modules');
const localToolsRoot = path.resolve('.tmp/import-tools/node_modules');

function requireTool(name) {
  for (const root of [localToolsRoot, toolsRoot]) {
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
const outDir = path.resolve('Finance/.tmp/2017-finance-import');
const localOutDir = path.resolve('.tmp/2017-finance-import');
const targetOutDir = fs.existsSync(path.resolve('Finance')) ? outDir : localOutDir;

fs.mkdirSync(targetOutDir, { recursive: true });

function jsonReplacer(_key, value) {
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length}]`;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function cleanCell(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length}]`;
  if (Array.isArray(value)) return `[Array ${value.length}]`;
  if (typeof value === 'object') return `[Object ${Object.keys(value).join('|')}]`;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function summarizeRows(rows, columnNames) {
  return rows.map(row => Object.fromEntries(columnNames.map(column => [column, cleanCell(row[column])])));
}

function writeCsv(fileName, rows) {
  const csv = rows.map(row => row.map(cell => {
    const text = cleanCell(cell);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(',')).join('\r\n');
  fs.writeFileSync(path.join(targetOutDir, fileName), csv, 'utf8');
}

function inspectAccess(fileName) {
  const filePath = path.join(sourceDir, fileName);
  const reader = new MDBReader(fs.readFileSync(filePath));
  const tableNames = reader.getTableNames();
  const tables = [];

  for (const tableName of tableNames) {
    const table = reader.getTable(tableName);
    const columns = table.getColumns().map(column => ({
      name: column.name,
      type: column.type,
      size: column.size,
      nullable: column.nullable,
    }));
    const columnNames = table.getColumnNames();
    const sample = summarizeRows(table.getData({ rowLimit: 5 }), columnNames);
    tables.push({
      name: tableName,
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      columns,
      sample,
    });

    if (table.rowCount > 0) {
      const previewRows = table.getData({ rowLimit: Math.min(50, table.rowCount) });
      writeCsv(`${fileName}.${safeName(tableName)}.preview.csv`, [
        columnNames,
        ...previewRows.map(row => columnNames.map(column => row[column])),
      ]);
    }
  }

  return {
    fileName,
    filePath,
    creationDate: reader.getCreationDate(),
    tableCount: tables.length,
    tables,
  };
}

function inspectWorkbook(fileName) {
  const filePath = path.join(sourceDir, fileName);
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheets = workbook.SheetNames.map(sheetName => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, blankrows: false });
    writeCsv(`${fileName}.${safeName(sheetName)}.preview.csv`, rows.slice(0, 100));
    return {
      name: sheetName,
      rowCount: rows.length,
      columnCount: rows.reduce((max, row) => Math.max(max, row.length), 0),
      header: rows[0] ?? [],
      sample: rows.slice(1, 6),
    };
  });
  return { fileName, filePath, sheetCount: sheets.length, sheets };
}

function safeName(name) {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '') || 'unnamed';
}

const accessFiles = ['2017bolccop.accdb', 'BreadOfLife.accdb'];
const workbookFiles = ['2017bolccop.xlsx'];

const report = {
  generatedAt: new Date().toISOString(),
  sourceDir,
  outputs: targetOutDir,
  access: [],
  workbooks: [],
};

for (const fileName of accessFiles) {
  try {
    report.access.push(inspectAccess(fileName));
  } catch (error) {
    report.access.push({ fileName, error: error.message, stack: error.stack });
  }
}

for (const fileName of workbookFiles) {
  try {
    report.workbooks.push(inspectWorkbook(fileName));
  } catch (error) {
    report.workbooks.push({ fileName, error: error.message, stack: error.stack });
  }
}

fs.writeFileSync(
  path.join(targetOutDir, 'source-profile.json'),
  JSON.stringify(report, jsonReplacer, 2),
  'utf8',
);

const summary = [];
summary.push(`# 2017 Finance Import Source Profile`);
summary.push('');
summary.push(`Generated: ${report.generatedAt}`);
summary.push(`Source: ${sourceDir}`);
summary.push(`Output: ${targetOutDir}`);
summary.push('');
for (const database of report.access) {
  summary.push(`## ${database.fileName}`);
  if (database.error) {
    summary.push(`ERROR: ${database.error}`);
    summary.push('');
    continue;
  }
  summary.push(`Tables: ${database.tableCount}`);
  for (const table of database.tables) {
    summary.push(`- ${table.name}: ${table.rowCount} rows, ${table.columnCount} columns`);
    summary.push(`  Columns: ${table.columns.map(column => `${column.name}:${column.type}`).join(', ')}`);
  }
  summary.push('');
}
for (const workbook of report.workbooks) {
  summary.push(`## ${workbook.fileName}`);
  if (workbook.error) {
    summary.push(`ERROR: ${workbook.error}`);
    summary.push('');
    continue;
  }
  summary.push(`Sheets: ${workbook.sheetCount}`);
  for (const sheet of workbook.sheets) {
    summary.push(`- ${sheet.name}: ${sheet.rowCount} rows, ${sheet.columnCount} columns`);
    summary.push(`  Header: ${sheet.header.join(', ')}`);
  }
  summary.push('');
}

fs.writeFileSync(path.join(targetOutDir, 'source-profile.md'), summary.join('\n'), 'utf8');
console.log(`Wrote source profile to ${targetOutDir}`);

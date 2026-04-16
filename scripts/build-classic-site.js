const fs = require('fs');
const path = require('path');
const chardet = require('jschardet');
const iconv = require('iconv-lite');

const workspaceRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const sourceRoot = path.join(workspaceRoot, 'public_html');
const classicRoot = path.join(workspaceRoot, 'Classic');

const ignoredDirNames = new Set([
  '.git',
  'node_modules',
  '_vti_bin',
  '_private',
  'cgi-bin',
]);

const pageExts = new Set(['.htm', '.html']);
const imageExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.wmf']);
const videoExts = new Set(['.mp4', '.avi', '.mov', '.wmv', '.mpg', '.mpeg', '.flv', '.m4v']);
const pdfExts = new Set(['.pdf']);
const audioExts = new Set(['.mp3', '.wma', '.wav', '.ram']);

const outputRoots = {
  page: path.join(classicRoot, 'pages'),
  picture: path.join(classicRoot, 'pictures'),
  video: path.join(classicRoot, 'video'),
  pdf: path.join(classicRoot, 'PDF'),
  audio: path.join(classicRoot, 'audio'),
  asset: path.join(classicRoot, 'assets'),
};

const stats = {
  pagesScanned: 0,
  pagesCopied: 0,
  referencesFound: 0,
  filesCopied: 0,
  linksUpdated: 0,
  missingReferences: 0,
  encodingConverted: 0,
  metaUpdated: 0,
};

const pageRecords = [];
const pageMap = new Map();
const sourceFileIndex = new Map();
const copiedTargets = new Map();
const missingReferences = [];
const copiedFiles = [];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isIgnoredDir(dirent) {
  if (!dirent.isDirectory()) return false;
  return ignoredDirNames.has(dirent.name) || dirent.name.toLowerCase() === '_vti_cnf';
}

function walk(dir, callback) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isIgnoredDir(entry)) continue;
      walk(fullPath, callback);
      continue;
    }
    callback(fullPath);
  }
}

function normalizeKey(filePath) {
  return path.resolve(filePath).toLowerCase();
}

function readBuffer(filePath) {
  return fs.readFileSync(filePath);
}

function getDeclaredCharset(buffer) {
  const head = buffer.toString('latin1', 0, Math.min(buffer.length, 4096));
  const metaCharset = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([a-zA-Z0-9._-]+)/i);
  if (metaCharset) return metaCharset[1].toLowerCase();
  const contentType = head.match(/content\s*=\s*["'][^"']*charset\s*=\s*([a-zA-Z0-9._-]+)/i);
  if (contentType) return contentType[1].toLowerCase();
  return '';
}

function normalizeEncodingName(name) {
  const value = (name || '').toLowerCase();
  if (!value) return '';
  if (value === 'utf8') return 'utf-8';
  if (value === 'gb2312' || value === 'gbk' || value === 'hz-gb-2312' || value === 'gb18030') return 'gb18030';
  if (value === 'big5-hkscs' || value === 'big5') return 'big5';
  if (value === 'iso-8859-1' || value === 'windows-1252' || value === 'cp1252') return 'windows-1252';
  return value;
}

function detectEncoding(buffer) {
  const declared = normalizeEncodingName(getDeclaredCharset(buffer));
  if (declared && iconv.encodingExists(declared)) {
    return declared;
  }

  const utf8Text = buffer.toString('utf8');
  if (!utf8Text.includes('\uFFFD')) {
    return 'utf-8';
  }

  const guessed = chardet.detect(buffer) || {};
  const normalized = normalizeEncodingName(guessed.encoding);
  if (normalized && iconv.encodingExists(normalized)) {
    return normalized;
  }

  return 'utf-8';
}

function decodeText(buffer) {
  const encoding = detectEncoding(buffer);
  const text = encoding === 'utf-8' ? buffer.toString('utf8') : iconv.decode(buffer, encoding);
  return { encoding, text };
}

function normalizeMetaCharset(text) {
  let updated = false;
  let output = text;

  output = output.replace(/<meta\b[^>]*http-equiv\s*=\s*(?:(["'])content-type\1|content-type)[^>]*>/gi, () => {
    updated = true;
    return '<meta charset="UTF-8">';
  });

  output = output.replace(/<meta\b[^>]*charset\s*=\s*(["']?)\s*[^"'>\s]+\s*\1[^>]*>/gi, () => {
    updated = true;
    return '<meta charset="UTF-8">';
  });

  if (!/<meta\s+charset\s*=\s*(["'])?utf-8\1/i.test(output) && /<head\b[^>]*>/i.test(output)) {
    output = output.replace(/<head\b[^>]*>/i, match => `${match}\n<meta charset="UTF-8">`);
    updated = true;
  }

  return { text: output, updated };
}

function safeDecodeUrl(rawValue) {
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

function stripUrlDecorators(value) {
  let result = value.trim();
  if (!result) return '';
  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
    result = result.slice(1, -1).trim();
  }
  result = result.replace(/^url\(\s*/i, '').replace(/\)\s*$/i, '').trim();
  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

function isExternalRef(value) {
  return /^(?:[a-z]+:|\/\/)/i.test(value) || value.startsWith('#') || value.startsWith('mailto:') || value.startsWith('javascript:') || value.startsWith('data:');
}

function classifyByExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (pageExts.has(ext)) return 'page';
  if (imageExts.has(ext)) return 'picture';
  if (videoExts.has(ext)) return 'video';
  if (pdfExts.has(ext)) return 'pdf';
  if (audioExts.has(ext)) return 'audio';
  return 'asset';
}

function shouldSkipSource(filePath) {
  const rel = path.relative(sourceRoot, filePath);
  if (!rel || rel.startsWith('..')) return true;
  const parts = rel.split(path.sep).map(part => part.toLowerCase());
  if (parts.includes('_vti_cnf')) return true;
  return false;
}

function buildSourceIndex() {
  walk(sourceRoot, filePath => {
    if (shouldSkipSource(filePath)) return;
    sourceFileIndex.set(normalizeKey(filePath), filePath);
  });
}

function sanitizePageRelativePath(relPath) {
  const parsed = path.parse(relPath);
  const safeBase = parsed.base;
  return path.join(parsed.dir, safeBase);
}

function registerPages() {
  walk(sourceRoot, filePath => {
    if (shouldSkipSource(filePath)) return;
    const ext = path.extname(filePath).toLowerCase();
    if (!pageExts.has(ext)) return;

    const rel = sanitizePageRelativePath(path.relative(sourceRoot, filePath));
    const isRootIndex = rel.replace(/\\/g, '/').toLowerCase() === 'index.html';
    const dest = isRootIndex ? path.join(classicRoot, 'index.html') : path.join(outputRoots.page, rel);
    const key = normalizeKey(filePath);
    const record = {
      sourcePath: filePath,
      relativeSourcePath: rel,
      destPath: dest,
      references: [],
      replacements: [],
      encoding: 'utf-8',
    };
    pageRecords.push(record);
    pageMap.set(key, record);
  });
}

function extractReferences(text) {
  const refs = [];
  const seen = new Set();
  const patterns = [
    /\b(?:src|href|background|poster|data|action)\s*=\s*(['"])(.*?)\1/gi,
    /url\(\s*(['"]?)(.*?)\1\s*\)/gi,
    /(['"])([^"'<>]+?\.(?:htm|html|css|js|xml|thmx|jpg|jpeg|png|gif|bmp|webp|svg|wmf|mp4|avi|mov|wmv|mpg|mpeg|flv|m4v|pdf|mp3|wma|wav|ram))\1/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const raw = stripUrlDecorators(match[2] || '');
      if (!raw || isExternalRef(raw)) continue;
      const clean = safeDecodeUrl(raw.split('#')[0].split('?')[0]).replace(/\//g, path.sep);
      if (!clean) continue;
      const key = `${match.index}::${clean}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({
        raw,
        clean,
        index: match.index,
      });
    }
  }

  return refs;
}

function resolveReference(fromPagePath, cleanRef) {
  const candidate = path.resolve(path.dirname(fromPagePath), cleanRef);
  const key = normalizeKey(candidate);
  if (sourceFileIndex.has(key)) return sourceFileIndex.get(key);

  if (cleanRef.startsWith(path.sep)) {
    const rootCandidate = path.resolve(sourceRoot, `.${cleanRef}`);
    const rootKey = normalizeKey(rootCandidate);
    if (sourceFileIndex.has(rootKey)) return sourceFileIndex.get(rootKey);
  }

  const alt = path.resolve(sourceRoot, cleanRef);
  const altKey = normalizeKey(alt);
  if (sourceFileIndex.has(altKey)) return sourceFileIndex.get(altKey);

  return '';
}

function registerReferencedFile(sourcePath) {
  const key = normalizeKey(sourcePath);
  if (copiedTargets.has(key)) return copiedTargets.get(key);

  const rel = path.relative(sourceRoot, sourcePath);
  const kind = classifyByExtension(sourcePath);
  const destRoot = outputRoots[kind];
  const destPath = path.join(destRoot, rel);
  const info = { kind, sourcePath, destPath, relativeSourcePath: rel };
  copiedTargets.set(key, info);
  return info;
}

function analyzePages() {
  for (const record of pageRecords) {
    const { encoding, text } = decodeText(readBuffer(record.sourcePath));
    record.encoding = encoding;
    record.text = text;
    stats.pagesScanned += 1;
    if (encoding !== 'utf-8') stats.encodingConverted += 1;

    const refs = extractReferences(text);
    for (const ref of refs) {
      stats.referencesFound += 1;
      const resolved = resolveReference(record.sourcePath, ref.clean);
      if (!resolved) {
        missingReferences.push({
          page: record.relativeSourcePath,
          reference: ref.raw,
        });
        continue;
      }

      if (shouldSkipSource(resolved)) continue;

      const info = pageMap.get(normalizeKey(resolved)) || registerReferencedFile(resolved);
      record.references.push({
        raw: ref.raw,
        sourcePath: resolved,
        target: info,
      });
    }
  }

  stats.missingReferences = missingReferences.length;
}

function copyBinaryFiles() {
  for (const info of copiedTargets.values()) {
    if (info.kind === 'page') continue;
    ensureDir(path.dirname(info.destPath));
    fs.copyFileSync(info.sourcePath, info.destPath);
    copiedFiles.push({
      type: info.kind,
      source: path.relative(workspaceRoot, info.sourcePath),
      dest: path.relative(workspaceRoot, info.destPath),
    });
    stats.filesCopied += 1;
  }
}

function rewritePageText(record) {
  let output = record.text;
  const uniqueReplacements = new Map();

  for (const ref of record.references) {
    const targetRecord = ref.target.kind === 'page' ? ref.target : ref.target;
    const targetPath = targetRecord.destPath;
    const relative = path.relative(path.dirname(record.destPath), targetPath).replace(/\\/g, '/');
    uniqueReplacements.set(ref.raw, relative);
  }

  for (const [raw, relative] of uniqueReplacements.entries()) {
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    const before = output;
    output = output.replace(regex, relative);
    if (output !== before) {
      stats.linksUpdated += 1;
    }
  }

  const meta = normalizeMetaCharset(output);
  if (meta.updated) stats.metaUpdated += 1;
  return meta.text;
}

function copyPages() {
  for (const record of pageRecords) {
    ensureDir(path.dirname(record.destPath));
    const rewritten = rewritePageText(record);
    fs.writeFileSync(record.destPath, rewritten, 'utf8');
    copiedFiles.push({
      type: 'page',
      source: path.relative(workspaceRoot, record.sourcePath),
      dest: path.relative(workspaceRoot, record.destPath),
    });
    stats.pagesCopied += 1;
  }
}

function generateSummary() {
  ensureDir(classicRoot);

  const structureLines = [];
  for (const rootName of ['pages', 'pictures', 'video', 'PDF', 'audio', 'assets']) {
    structureLines.push(`- ${rootName}/`);
    const rootPath = path.join(classicRoot, rootName);
    if (!fs.existsSync(rootPath)) continue;
    const sample = [];
    walk(rootPath, filePath => {
      if (sample.length < 40) {
        sample.push(`  - ${path.relative(classicRoot, filePath).replace(/\\/g, '/')}`);
      }
    });
    structureLines.push(...sample);
  }

  const missingLines = missingReferences.slice(0, 200).map(item => `- 页面: ${item.page} | 引用: ${item.reference}`);
  const copiedLines = copiedFiles.slice(0, 500).map(item => `- [${item.type}] ${item.source} -> ${item.dest}`);

  const report = [
    '# Classic 迁移报告',
    '',
    '## 统计',
    `- 扫描页面: ${stats.pagesScanned}`,
    `- 复制页面: ${stats.pagesCopied}`,
    `- 发现引用: ${stats.referencesFound}`,
    `- 复制资源文件: ${stats.filesCopied}`,
    `- 更新链接: ${stats.linksUpdated}`,
    `- 编码转换为 UTF-8 的页面: ${stats.encodingConverted}`,
    `- 更新 meta charset 的页面: ${stats.metaUpdated}`,
    `- 缺失引用: ${stats.missingReferences}`,
    '',
    '## 目录结构样例',
    ...structureLines,
    '',
    '## 已复制文件样例',
    ...copiedLines,
    '',
    '## 缺失引用（前 200 条）',
    ...(missingLines.length ? missingLines : ['- 无']),
    '',
  ].join('\n');

  fs.writeFileSync(path.join(classicRoot, 'migration-report.md'), report, 'utf8');
  fs.writeFileSync(
    path.join(classicRoot, 'migration-report.json'),
    JSON.stringify({ stats, copiedFiles, missingReferences }, null, 2),
    'utf8'
  );
}

function cleanClassicRoot() {
  if (fs.existsSync(classicRoot)) {
    for (const entry of fs.readdirSync(classicRoot, { withFileTypes: true })) {
      const fullPath = path.join(classicRoot, entry.name);
      fs.rmSync(fullPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
  for (const outputRoot of Object.values(outputRoots)) {
    ensureDir(outputRoot);
  }
}

function main() {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`找不到源目录: ${sourceRoot}`);
  }

  cleanClassicRoot();
  buildSourceIndex();
  registerPages();

  for (const record of pageRecords) {
    copiedTargets.set(normalizeKey(record.sourcePath), { kind: 'page', sourcePath: record.sourcePath, destPath: record.destPath, relativeSourcePath: record.relativeSourcePath });
  }

  analyzePages();
  copyBinaryFiles();
  copyPages();
  generateSummary();

  console.log(JSON.stringify(stats, null, 2));
  console.log(`报告已生成: ${path.join(classicRoot, 'migration-report.md')}`);
}

main();

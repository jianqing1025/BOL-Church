const fs = require('fs');
const path = require('path');
const chardet = require('jschardet');
const iconv = require('iconv-lite');

const supported = new Set(['.html', '.htm', '.js', '.css', '.json']);
const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();

const stats = {
  scanned: 0,
  converted: 0,
  metaUpdated: 0,
  skipped: 0,
  errors: 0,
};

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.cache') continue;
      walk(fullPath);
    } else if (supported.has(path.extname(entry.name).toLowerCase())) {
      processFile(fullPath);
    }
  }
}

function normalizeHtmlMeta(text) {
  let original = text;
  const hasMetaCharset = /<meta\s+charset\s*=\s*(["']?)utf-8\1/i.test(text);

  text = text.replace(/<meta\s+http-equiv\s*=\s*(["'])content-type\1[^>]*>/gi, '<meta charset="utf-8">');
  text = text.replace(/<meta\s+charset\s*=\s*(["']?)\s*[^"'>\s]+\s*\1\s*\/?>/gi, '<meta charset="utf-8">');
  text = text.replace(/charset\s*=\s*(?:gb2312|gbk|gb18030|GB2312|BIG5|big5|windows-1252|iso-8859-1)/g, 'charset=utf-8');

  if (!hasMetaCharset && /<head\b[^>]*>/i.test(text)) {
    text = text.replace(/<head\b[^>]*>/i, match => `${match}\n    <meta charset="utf-8">`);
  }

  return { text, updated: text !== original };
}

function detectEncoding(buffer) {
  const utf8String = buffer.toString('utf8');
  if (!utf8String.includes('\uFFFD')) {
    return 'utf-8';
  }

  const guess = chardet.detect(buffer) || {};
  let encoding = (guess.encoding || '').toLowerCase();

  if (encoding === 'ascii' || encoding === 'utf-8' || encoding === 'utf8') {
    return 'utf-8';
  }
  if (encoding === 'gb2312' || encoding === 'gbk' || encoding === 'gb18030' || encoding === 'hz') {
    return 'gb18030';
  }
  if (encoding === 'big5') {
    return 'big5';
  }
  if (encoding === 'iso-8859-1' || encoding === 'windows-1252') {
    return 'windows-1252';
  }
  return encoding || 'utf-8';
}

function processFile(filePath) {
  stats.scanned += 1;
  const ext = path.extname(filePath).toLowerCase();
  let buffer;

  try {
    buffer = fs.readFileSync(filePath);
  } catch (err) {
    console.error(`ERROR reading ${filePath}: ${err.message}`);
    stats.errors += 1;
    return;
  }

  const detected = detectEncoding(buffer);
  let text;
  try {
    if (detected === 'utf-8') {
      text = buffer.toString('utf8');
    } else {
      text = iconv.decode(buffer, detected);
    }
  } catch (err) {
    console.error(`ERROR decoding ${filePath} as ${detected}: ${err.message}`);
    stats.errors += 1;
    return;
  }

  const originalText = text;
  let updated = false;

  if (ext === '.html' || ext === '.htm') {
    const result = normalizeHtmlMeta(text);
    text = result.text;
    if (result.updated) {
      stats.metaUpdated += 1;
      updated = true;
    }
  }

  const needWrite = updated || detected !== 'utf-8';
  if (needWrite) {
    try {
      fs.writeFileSync(filePath, text, { encoding: 'utf8' });
      stats.converted += 1;
    } catch (err) {
      console.error(`ERROR writing ${filePath}: ${err.message}`);
      stats.errors += 1;
    }
  } else {
    stats.skipped += 1;
  }
}

function main() {
  console.log(`Scanning ${root}`);
  walk(root);
  console.log('---');
  console.log(`Scanned files: ${stats.scanned}`);
  console.log(`Converted files: ${stats.converted}`);
  console.log(`HTML meta updated: ${stats.metaUpdated}`);
  console.log(`Skipped unchanged: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);
  if (stats.errors > 0) {
    process.exit(1);
  }
}

main();

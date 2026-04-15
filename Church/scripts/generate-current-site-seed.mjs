import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const now = new Date().toISOString();

function sqlString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return sqlString(JSON.stringify(value));
}

function evaluateExportedValue(source, exportName) {
  const exportPattern = new RegExp(`export\\s+const\\s+${exportName}(?:\\s*:[^=]+)?\\s*=`);
  const match = exportPattern.exec(source);
  if (!match) {
    throw new Error(`Could not find export "${exportName}".`);
  }

  const start = match.index + match[0].length;
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{' || char === '[' || char === '(') {
      depth += 1;
    } else if (char === '}' || char === ']' || char === ')') {
      depth -= 1;
    } else if (char === ';' && depth === 0) {
      const expression = source.slice(start, index).trim();
      return vm.runInNewContext(`(${expression})`, {}, { timeout: 1000 });
    }
  }

  throw new Error(`Could not parse export "${exportName}".`);
}

const translationsSource = await fs.readFile(path.join(rootDir, 'constants/translations.ts'), 'utf8');
const dataSource = await fs.readFile(path.join(rootDir, 'data.ts'), 'utf8');

const translations = evaluateExportedValue(translationsSource, 'translations');
const defaultSermons = evaluateExportedValue(dataSource, 'DEFAULT_SERMONS');

const lines = [
  '-- Generated from the current Church source. Do not edit by hand.',
  `-- Generated at ${now}`,
  '',
  `INSERT INTO settings (key, value_json, updated_at)
VALUES ('website_content', ${sqlJson(translations)}, ${sqlString(now)})
ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;`,
  '',
  `INSERT INTO settings (key, value_json, updated_at)
VALUES ('images', '{}', ${sqlString(now)})
ON CONFLICT(key) DO NOTHING;`,
  '',
];

if (defaultSermons.length > 0) {
  const sermonSelects = defaultSermons.map((sermon, index) => {
    const id = `default-${index + 1}`;
    return `SELECT
  ${sqlString(id)} AS id,
  ${sqlString(sermon.title?.en)} AS title_en,
  ${sqlString(sermon.title?.zh)} AS title_zh,
  ${sqlString(sermon.speaker?.en)} AS speaker_en,
  ${sqlString(sermon.speaker?.zh)} AS speaker_zh,
  ${sqlString(sermon.date)} AS date,
  ${sqlString(sermon.series?.en)} AS series_en,
  ${sqlString(sermon.series?.zh)} AS series_zh,
  ${sqlString(sermon.passage?.en)} AS passage_en,
  ${sqlString(sermon.passage?.zh)} AS passage_zh,
  ${sqlString(sermon.youtubeId)} AS youtube_id,
  ${sermon.imageUrl ? sqlString(sermon.imageUrl) : 'NULL'} AS image_url,
  ${sqlString(sermon.type)} AS type,
  ${sqlString(now)} AS created_at,
  ${sqlString(now)} AS updated_at`;
  });

  lines.push(
    `INSERT INTO sermons (
  id, title_en, title_zh, speaker_en, speaker_zh, date,
  series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, type,
  created_at, updated_at
)
SELECT *
FROM (
${sermonSelects.join('\nUNION ALL\n')}
)
WHERE NOT EXISTS (SELECT 1 FROM sermons);`,
    ''
  );
}

const outputPath = process.env.SEED_SQL_PATH
  ? path.resolve(process.env.SEED_SQL_PATH)
  : path.join(rootDir, '.tmp/current-site-seed.sql');

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');

console.log(`Wrote ${outputPath}`);

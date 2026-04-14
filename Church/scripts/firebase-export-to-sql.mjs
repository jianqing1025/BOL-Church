import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exportPath = path.resolve(__dirname, '../firebase-export.json');
const sqlPath = path.resolve(__dirname, '../migrations/0002_seed_from_firebase.sql');

const raw = await fs.readFile(exportPath, 'utf8');
const data = JSON.parse(raw);

const escape = value =>
  String(value ?? '')
    .replace(/'/g, "''")
    .replace(/\r?\n/g, '\\n');

const lines = [];

lines.push(
  `INSERT INTO settings (key, value_json, updated_at) VALUES ('website_content', '${escape(JSON.stringify(data.content ?? {}))}', '${new Date().toISOString()}')
ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;`
);
lines.push(
  `INSERT INTO settings (key, value_json, updated_at) VALUES ('images', '${escape(JSON.stringify(data.images ?? {}))}', '${new Date().toISOString()}')
ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;`
);

for (const sermon of data.sermons ?? []) {
  lines.push(
    `INSERT OR REPLACE INTO sermons (
      id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh,
      passage_en, passage_zh, youtube_id, image_url, type, created_at, updated_at
    ) VALUES (
      '${escape(sermon.id)}',
      '${escape(sermon.title?.en)}',
      '${escape(sermon.title?.zh)}',
      '${escape(sermon.speaker?.en)}',
      '${escape(sermon.speaker?.zh)}',
      '${escape(sermon.date)}',
      '${escape(sermon.series?.en)}',
      '${escape(sermon.series?.zh)}',
      '${escape(sermon.passage?.en)}',
      '${escape(sermon.passage?.zh)}',
      '${escape(sermon.youtubeId)}',
      ${sermon.imageUrl ? `'${escape(sermon.imageUrl)}'` : 'NULL'},
      '${escape(sermon.type)}',
      '${new Date().toISOString()}',
      '${new Date().toISOString()}'
    );`
  );
}

for (const message of data.messages ?? []) {
  lines.push(
    `INSERT OR REPLACE INTO messages (id, date, first_name, last_name, email, phone, message, read) VALUES (
      '${escape(message.id)}',
      '${escape(message.date)}',
      '${escape(message.firstName)}',
      '${escape(message.lastName)}',
      '${escape(message.email)}',
      '${escape(message.phone)}',
      '${escape(message.message)}',
      ${message.read ? 1 : 0}
    );`
  );
}

for (const prayer of data.prayerRequests ?? []) {
  lines.push(
    `INSERT OR REPLACE INTO prayer_requests (id, date, first_name, last_name, email, phone, message, status) VALUES (
      '${escape(prayer.id)}',
      '${escape(prayer.date)}',
      '${escape(prayer.firstName)}',
      '${escape(prayer.lastName)}',
      '${escape(prayer.email)}',
      '${escape(prayer.phone)}',
      '${escape(prayer.message)}',
      '${escape(prayer.status)}'
    );`
  );
}

for (const donation of data.donations ?? []) {
  lines.push(
    `INSERT OR REPLACE INTO donations (id, date, amount, type, status) VALUES (
      '${escape(donation.id)}',
      '${escape(donation.date)}',
      ${Number(donation.amount ?? 0)},
      '${escape(donation.type)}',
      '${escape(donation.status)}'
    );`
  );
}

await fs.writeFile(sqlPath, `${lines.join('\n\n')}\n`, 'utf8');
console.log(`Wrote ${sqlPath}`);

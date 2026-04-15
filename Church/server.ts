/// <reference types="@cloudflare/workers-types" />

import { DEFAULT_SERMONS } from './data';
import { translations } from './constants/translations';

type Env = {
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  ASSETS: Fetcher;
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_ANALYTICS_API_TOKEN?: string;
};

type LocalizedText = { en: string; zh: string };

type SermonRow = {
  id: string;
  title_en: string;
  title_zh: string;
  speaker_en: string;
  speaker_zh: string;
  date: string;
  series_en: string;
  series_zh: string;
  passage_en: string;
  passage_zh: string;
  youtube_id: string;
  image_url: string | null;
  type: 'sermon' | 'daily-manna';
};

type MessageRow = {
  id: string;
  date: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  message: string;
  read: number;
};

type PrayerRequestRow = {
  id: string;
  date: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  message: string;
  status: 'new' | 'prayed';
};

type DonationRow = {
  id: string;
  date: string;
  amount: number;
  type: 'one-time' | 'recurring';
  status: 'completed';
};

type SiteContentRow = {
  path: string;
  en: string;
  zh: string;
};

type CloudflareGraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type CloudflareAnalyticsGraphQLData = {
  viewer?: {
    zones?: Array<{
      totals?: Array<{
        count?: number;
        sum?: {
          visits?: number;
        };
      }>;
      byCountry?: Array<{
        count?: number;
        dimensions?: {
          clientCountryName?: string;
        };
      }>;
      byDay?: Array<{
        count?: number;
        sum?: {
          visits?: number;
        };
        dimensions?: {
          datetimeHour?: string;
        };
      }>;
    }>;
  };
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function notFound(message = 'Not found'): Response {
  return json({ error: message }, 404);
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

function asLocalizedText(en = '', zh = ''): LocalizedText {
  return { en, zh };
}

function startOfUtcDay(date: Date): string {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return utcDate.toISOString();
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function mapSermon(row: SermonRow) {
  return {
    id: row.id,
    title: asLocalizedText(row.title_en, row.title_zh),
    speaker: asLocalizedText(row.speaker_en, row.speaker_zh),
    date: row.date,
    series: asLocalizedText(row.series_en, row.series_zh),
    passage: asLocalizedText(row.passage_en, row.passage_zh),
    youtubeId: row.youtube_id,
    imageUrl: row.image_url ?? undefined,
    type: row.type,
  };
}

function mapMessage(row: MessageRow) {
  return {
    id: row.id,
    date: row.date,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    read: Boolean(row.read),
  };
}

function mapPrayerRequest(row: PrayerRequestRow) {
  return {
    id: row.id,
    date: row.date,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    status: row.status,
  };
}

function mapDonation(row: DonationRow) {
  return {
    id: row.id,
    date: row.date,
    amount: Number(row.amount),
    type: row.type,
    status: row.status,
  };
}

async function getSetting<T>(env: Env, key: string, fallback: T): Promise<T> {
  const row = await env.DB.prepare('SELECT value_json FROM settings WHERE key = ?').bind(key).first<{ value_json: string }>();
  if (!row?.value_json) {
    return fallback;
  }
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

async function putSetting(env: Env, key: string, value: unknown): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at'
  ).bind(key, JSON.stringify(value), new Date().toISOString()).run();
}

function isLocalizedContent(value: unknown): value is LocalizedText {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'en' in value &&
    'zh' in value &&
    typeof (value as { en?: unknown }).en === 'string' &&
    typeof (value as { zh?: unknown }).zh === 'string'
  );
}

function flattenSiteContent(obj: Record<string, unknown>, prefix = ''): SiteContentRow[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (isLocalizedContent(value)) {
      return [{ path, en: value.en, zh: value.zh }];
    }

    if (value && typeof value === 'object') {
      return flattenSiteContent(value as Record<string, unknown>, path);
    }

    return [];
  });
}

function setNestedContentValue(obj: Record<string, any>, path: string, value: LocalizedText): void {
  const keys = path.split('.');
  const lastKey = keys.pop();
  if (!lastKey) {
    return;
  }

  let target = obj;
  for (const key of keys) {
    if (!target[key] || typeof target[key] !== 'object') {
      target[key] = {};
    }
    target = target[key];
  }
  target[lastKey] = value;
}

function expandSiteContent(rows: SiteContentRow[], fallback: typeof translations): typeof translations {
  const expanded = structuredClone(fallback) as Record<string, any>;
  for (const row of rows) {
    setNestedContentValue(expanded, row.path, asLocalizedText(row.en, row.zh));
  }
  return expanded as typeof translations;
}

async function getSiteContent(env: Env): Promise<typeof translations> {
  const result = await env.DB.prepare('SELECT path, en, zh FROM site_content ORDER BY path').all<SiteContentRow>();
  const rows = result.results ?? [];

  if (rows.length > 0) {
    return expandSiteContent(rows, translations);
  }

  return getSetting(env, 'website_content', translations);
}

async function putSiteContent(env: Env, content: typeof translations): Promise<void> {
  const now = new Date().toISOString();
  const rows = flattenSiteContent(content as Record<string, unknown>);

  if (rows.length > 0) {
    const statements = rows.map(row => env.DB.prepare(
      `INSERT INTO site_content (path, en, zh, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         en = excluded.en,
         zh = excluded.zh,
         updated_at = excluded.updated_at`
    ).bind(row.path, row.en, row.zh, now));

    await env.DB.batch(statements);
  }

  await putSetting(env, 'website_content', content);
}

async function ensureSeedData(env: Env): Promise<void> {
  const contentRowCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM site_content').first<{ count: number }>();
  if (!contentRowCount || Number(contentRowCount.count) === 0) {
    const legacyContent = await getSetting(env, 'website_content', translations);
    await putSiteContent(env, legacyContent);
  }

  const imagesExists = await env.DB.prepare('SELECT key FROM settings WHERE key = ?').bind('images').first();
  if (!imagesExists) {
    await putSetting(env, 'images', {});
  }

  const sermonCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM sermons').first<{ count: number }>();
  if (!sermonCount || Number(sermonCount.count) === 0) {
    for (const sermon of DEFAULT_SERMONS) {
      await env.DB.prepare(
        `INSERT INTO sermons (
          id, title_en, title_zh, speaker_en, speaker_zh, date,
          series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, type,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        sermon.title.en,
        sermon.title.zh,
        sermon.speaker.en,
        sermon.speaker.zh,
        sermon.date,
        sermon.series.en,
        sermon.series.zh,
        sermon.passage.en,
        sermon.passage.zh,
        sermon.youtubeId,
        sermon.imageUrl ?? null,
        sermon.type,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
    }
  }
}

async function handleBootstrap(env: Env): Promise<Response> {
  await ensureSeedData(env);

  const [content, images, sermonsResult, messagesResult, prayerResult, donationsResult] = await Promise.all([
    getSiteContent(env),
    getSetting<Record<string, string>>(env, 'images', {}),
    env.DB.prepare('SELECT * FROM sermons ORDER BY date DESC').all<SermonRow>(),
    env.DB.prepare('SELECT * FROM messages ORDER BY date DESC').all<MessageRow>(),
    env.DB.prepare('SELECT * FROM prayer_requests ORDER BY date DESC').all<PrayerRequestRow>(),
    env.DB.prepare('SELECT * FROM donations ORDER BY date DESC').all<DonationRow>(),
  ]);

  return json({
    content,
    images,
    sermons: (sermonsResult.results ?? []).map(mapSermon),
    messages: (messagesResult.results ?? []).map(mapMessage),
    prayerRequests: (prayerResult.results ?? []).map(mapPrayerRequest),
    donations: (donationsResult.results ?? []).map(mapDonation),
  });
}

async function handleAnalyticsSummary(env: Env): Promise<Response> {
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  const apiToken = env.CLOUDFLARE_ANALYTICS_API_TOKEN;

  if (!zoneId || !apiToken) {
    return json({
      configured: false,
      source: 'cloudflare',
      period: '7d',
      pageviews: 0,
      visitors: 0,
      countries: [],
      timeseries: [],
      lastUpdated: new Date().toISOString(),
      error: 'Cloudflare analytics is not configured. Set CLOUDFLARE_ZONE_ID and CLOUDFLARE_ANALYTICS_API_TOKEN in Wrangler.',
    });
  }

  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const since = startOfUtcDay(addUtcDays(now, -6));
  const until = addUtcDays(new Date(todayStart), 1).toISOString();
  const query = `
    query WebsiteAnalyticsSummary($zoneTag: string, $datetimeStart: Time, $datetimeEnd: Time) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          totals: httpRequestsAdaptiveGroups(
            limit: 1
            filter: {
              datetime_geq: $datetimeStart
              datetime_lt: $datetimeEnd
              requestSource: "eyeball"
            }
          ) {
            count
            sum {
              visits
            }
          }
          byCountry: httpRequestsAdaptiveGroups(
            limit: 8
            orderBy: [count_DESC]
            filter: {
              datetime_geq: $datetimeStart
              datetime_lt: $datetimeEnd
              requestSource: "eyeball"
            }
          ) {
            count
            dimensions {
              clientCountryName
            }
          }
          byDay: httpRequestsAdaptiveGroups(
            limit: 168
            orderBy: [datetimeHour_ASC]
            filter: {
              datetime_geq: $datetimeStart
              datetime_lt: $datetimeEnd
              requestSource: "eyeball"
            }
          ) {
            count
            sum {
              visits
            }
            dimensions {
              datetimeHour
            }
          }
        }
      }
    }
  `;

  const dayRanges = Array.from({ length: 7 }, (_, index) => {
    const start = startOfUtcDay(addUtcDays(now, -6 + index));
    const end = addUtcDays(new Date(start), 1).toISOString();
    return { start, end };
  });

  const dayResponses = await Promise.all(dayRanges.map(async ({ start, end }) => {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          zoneTag: zoneId,
          datetimeStart: start,
          datetimeEnd: end,
        },
      }),
    });

    const payload = await response.json<CloudflareGraphQLResponse<CloudflareAnalyticsGraphQLData>>();
    return { response, payload, start };
  }));

  const failedResponse = dayResponses.find(({ response, payload }) => !response.ok || !payload.data?.viewer?.zones?.[0]);
  if (failedResponse) {
    const message = failedResponse.payload.errors?.map(error => error.message).filter(Boolean).join('; ') || 'Failed to load Cloudflare analytics from GraphQL API.';
    return json({
      configured: true,
      source: 'cloudflare',
      period: '7d',
      pageviews: 0,
      visitors: 0,
      countries: [],
      timeseries: [],
      lastUpdated: new Date().toISOString(),
      error: message,
    }, failedResponse.response.ok ? 200 : failedResponse.response.status);
  }

  const countryMap = new Map<string, number>();
  const timeseries = dayResponses.map(({ payload, start }) => {
    const zone = payload.data?.viewer?.zones?.[0];
    const totals = zone?.totals?.[0];
    for (const point of zone?.byCountry ?? []) {
      const country = point.dimensions?.clientCountryName || 'Unknown';
      const requests = Number(point.count ?? 0);
      countryMap.set(country, (countryMap.get(country) ?? 0) + requests);
    }

    return {
      date: start.slice(0, 10),
      pageviews: Number(totals?.count ?? 0),
      visitors: Number(totals?.sum?.visits ?? 0),
    };
  });

  const countries = Array.from(countryMap.entries())
    .sort(([, left], [, right]) => right - left)
    .slice(0, 8)
    .map(([country, requests]) => ({ country, requests }));

  const pageviews = timeseries.reduce((sum, point) => sum + point.pageviews, 0);
  const visitors = timeseries.reduce((sum, point) => sum + point.visitors, 0);

  return json({
    configured: true,
    source: 'cloudflare',
    period: '7d',
    pageviews,
    visitors,
    countries,
    timeseries,
    lastUpdated: new Date().toISOString(),
  });
}

async function readJson<T>(request: Request): Promise<T> {
  return request.json<T>();
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'upload.jpg';
}

function isUploadBlob(value: FormDataEntryValue | null): value is Blob {
  return Boolean(value && typeof value === 'object' && 'arrayBuffer' in value);
}

async function handleImageObject(env: Env, key: string): Promise<Response> {
  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) {
    return notFound('Image not found');
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/bootstrap' && request.method === 'GET') {
      return handleBootstrap(env);
    }

    if (url.pathname === '/api/analytics/summary' && request.method === 'GET') {
      return handleAnalyticsSummary(env);
    }

    if (url.pathname === '/api/content' && request.method === 'PUT') {
      const content = await readJson(request);
      await putSiteContent(env, content as typeof translations);
      return json({ ok: true });
    }

    if (url.pathname === '/api/images' && request.method === 'PUT') {
      const images = await readJson<Record<string, string>>(request);
      await putSetting(env, 'images', images);
      return json(images);
    }

    if (url.pathname === '/api/images/upload' && request.method === 'POST') {
      const imageKey = url.searchParams.get('key');
      if (!imageKey) {
        return badRequest('Missing image key');
      }
      const formData = await request.formData();
      const file = formData.get('file');
      if (!isUploadBlob(file)) {
        return badRequest('Missing upload file');
      }
      const originalName = file instanceof File ? file.name : 'upload.jpg';
      const extension = sanitizeFileName(originalName).split('.').pop() || 'jpg';
      const objectKey = `images/${imageKey.replace(/[^a-zA-Z0-9._/-]+/g, '-')}-${Date.now()}.${extension}`;
      await env.MEDIA_BUCKET.put(objectKey, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || 'image/jpeg' },
      });
      const images = await getSetting<Record<string, string>>(env, 'images', {});
      images[imageKey] = `/api/images/${objectKey}`;
      await putSetting(env, 'images', images);
      return json({ key: imageKey, url: images[imageKey] });
    }

    if (url.pathname.startsWith('/api/images/') && request.method === 'GET') {
      const objectKey = decodeURIComponent(url.pathname.replace('/api/images/', ''));
      return handleImageObject(env, objectKey);
    }

    if (url.pathname === '/api/sermons' && request.method === 'POST') {
      const sermon = await readJson<any>(request);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO sermons (
          id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh,
          passage_en, passage_zh, youtube_id, image_url, type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        sermon.title.en,
        sermon.title.zh,
        sermon.speaker.en,
        sermon.speaker.zh,
        sermon.date,
        sermon.series.en,
        sermon.series.zh,
        sermon.passage.en,
        sermon.passage.zh,
        sermon.youtubeId,
        sermon.imageUrl ?? null,
        sermon.type,
        now,
        now
      ).run();
      const row = await env.DB.prepare('SELECT * FROM sermons WHERE id = ?').bind(id).first<SermonRow>();
      return json(mapSermon(row as SermonRow), 201);
    }

    if (url.pathname.startsWith('/api/sermons/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '');
      if (!id) {
        return badRequest('Missing sermon id');
      }
      if (request.method === 'PUT') {
        const sermon = await readJson<any>(request);
        await env.DB.prepare(
          `UPDATE sermons SET
            title_en = ?, title_zh = ?, speaker_en = ?, speaker_zh = ?, date = ?,
            series_en = ?, series_zh = ?, passage_en = ?, passage_zh = ?,
            youtube_id = ?, image_url = ?, type = ?, updated_at = ?
          WHERE id = ?`
        ).bind(
          sermon.title.en,
          sermon.title.zh,
          sermon.speaker.en,
          sermon.speaker.zh,
          sermon.date,
          sermon.series.en,
          sermon.series.zh,
          sermon.passage.en,
          sermon.passage.zh,
          sermon.youtubeId,
          sermon.imageUrl ?? null,
          sermon.type,
          new Date().toISOString(),
          id
        ).run();
        const row = await env.DB.prepare('SELECT * FROM sermons WHERE id = ?').bind(id).first<SermonRow>();
        return json(mapSermon(row as SermonRow));
      }
      if (request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM sermons WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }
    }

    if (url.pathname === '/api/messages' && request.method === 'POST') {
      const payload = await readJson<any>(request);
      const id = crypto.randomUUID();
      const row = {
        id,
        date: new Date().toISOString(),
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        message: payload.message,
        read: 0,
      };
      await env.DB.prepare(
        'INSERT INTO messages (id, date, first_name, last_name, email, phone, message, read) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(row.id, row.date, row.first_name, row.last_name, row.email, row.phone, row.message, row.read).run();
      return json(mapMessage(row as MessageRow), 201);
    }

    if (url.pathname.endsWith('/read') && request.method === 'PATCH' && url.pathname.startsWith('/api/messages/')) {
      const id = decodeURIComponent(url.pathname.split('/')[3] || '');
      await env.DB.prepare('UPDATE messages SET read = 1 WHERE id = ?').bind(id).run();
      const row = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first<MessageRow>();
      return json(mapMessage(row as MessageRow));
    }

    if (url.pathname.startsWith('/api/messages/') && request.method === 'DELETE') {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '');
      await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    if (url.pathname === '/api/prayer-requests' && request.method === 'POST') {
      const payload = await readJson<any>(request);
      const row = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        message: payload.message,
        status: 'new' as const,
      };
      await env.DB.prepare(
        'INSERT INTO prayer_requests (id, date, first_name, last_name, email, phone, message, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(row.id, row.date, row.first_name, row.last_name, row.email, row.phone, row.message, row.status).run();
      return json(mapPrayerRequest(row as PrayerRequestRow), 201);
    }

    if (url.pathname.endsWith('/prayed') && request.method === 'PATCH' && url.pathname.startsWith('/api/prayer-requests/')) {
      const id = decodeURIComponent(url.pathname.split('/')[3] || '');
      await env.DB.prepare("UPDATE prayer_requests SET status = 'prayed' WHERE id = ?").bind(id).run();
      const row = await env.DB.prepare('SELECT * FROM prayer_requests WHERE id = ?').bind(id).first<PrayerRequestRow>();
      return json(mapPrayerRequest(row as PrayerRequestRow));
    }

    if (url.pathname.startsWith('/api/prayer-requests/') && request.method === 'DELETE') {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '');
      await env.DB.prepare('DELETE FROM prayer_requests WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    if (url.pathname === '/api/donations' && request.method === 'POST') {
      const payload = await readJson<any>(request);
      const row = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        amount: Number(payload.amount),
        type: payload.type,
        status: 'completed' as const,
      };
      await env.DB.prepare(
        'INSERT INTO donations (id, date, amount, type, status) VALUES (?, ?, ?, ?, ?)'
      ).bind(row.id, row.date, row.amount, row.type, row.status).run();
      return json(mapDonation(row as DonationRow), 201);
    }

    if (url.pathname.startsWith('/api/')) {
      return notFound();
    }

    return env.ASSETS.fetch(request);
  },
};

export default worker;

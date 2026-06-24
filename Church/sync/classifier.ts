// 纯函数自学习分类器：从现有已分类标题学习关键词，归类未来视频；硬编码关键词兜底。
// 不依赖 Worker / D1，可单元测试。

export type SermonCategoryDb =
  | 'sunday-worship' | 'worship-praise' | 'healing-prayer' | 'testimony' | 'live-broadcast';
export type EntryType = 'sermon' | 'daily-manna';

// 同步目标：'all' 全收；'sermon' 所有 sermon 类；'daily-manna' 每日天言；其余为 4 个 sermon 细分类
export type SyncTarget =
  | 'all' | 'sermon' | 'daily-manna'
  | 'sunday-worship' | 'worship-praise' | 'healing-prayer' | 'testimony';

export interface TrainingRow {
  title: string;
  category: SermonCategoryDb | 'daily-manna';
}

// category -> (keyword -> weight)
export type ClassifierModel = Map<string, Map<string, number>>;

// 仅对这 4 个 sermon 细分类做学习/打分（live-broadcast 由直播功能写入，不参与）
const LEARNABLE_CATEGORIES: SermonCategoryDb[] = [
  'sunday-worship', 'worship-praise', 'healing-prayer', 'testimony',
];

const MIN_DOC_COUNT = 2;       // 关键词在某类至少出现 2 篇才算特征
const SHARE_THRESHOLD = 0.65;  // 关键词在某类占比 >= 65% 才算该类特征（剔除跨类通用词）

// ---- 硬编码兜底（与 server.ts 原 inferCategoryFromTitle / inferEntryTypeFromTitle 一致）----

export function inferCategoryFromTitle(title: string): SermonCategoryDb {
  const text = title || '';
  if (/\blive\b|直播/i.test(text)) return 'live-broadcast';
  if (/敬拜|讚美|赞美|詩歌|诗歌|praise|worship|hymn/i.test(text)) return 'worship-praise';
  if (/醫治|医治|禱告會|祷告会|healing|prayer\s*meeting/i.test(text)) return 'healing-prayer';
  if (/見證|见证|testimony/i.test(text)) return 'testimony';
  return 'sunday-worship';
}

export function inferEntryTypeFromTitle(title: string): EntryType {
  const text = title || '';
  if (/每日天言|每日一句话|每日一句話|聖卷|圣卷|daily\s*manna/i.test(text)) return 'daily-manna';
  return 'sermon';
}

// ---- 归一化 + 分词 ----

const SPEAKER_NOISE = [/Pastor\s+Andy\s+Yu/gi, /余大器\s*牧師/g, /牧師/g, /牧师/g];

export function normalizeTitle(title: string): string {
  let t = String(title || '');
  t = t.replace(/^\d{4}-\d{2}-\d{2}\s*/, '');   // 去开头日期前缀
  t = t.replace(/https?:\/\/\S+/gi, '');         // 去 URL
  for (const re of SPEAKER_NOISE) t = t.replace(re, ' ');
  return t.trim();
}

export function extractTokens(title: string): string[] {
  const tokens: string[] = [];
  const lower = title.toLowerCase();
  // 英文/数字单词，长度 >= 3
  for (const m of lower.matchAll(/[a-z][a-z0-9]{2,}/g)) tokens.push(m[0]);
  // 中文相邻二字 bigram
  for (const run of title.matchAll(/[一-鿿]+/g)) {
    const s = run[0];
    for (let i = 0; i + 1 < s.length; i++) tokens.push(s.slice(i, i + 2));
  }
  return tokens;
}

function uniqueTokens(title: string): string[] {
  return [...new Set(extractTokens(normalizeTitle(title)))];
}

// ---- 学习 ----

export function buildClassifier(rows: TrainingRow[]): ClassifierModel {
  const catCounts = new Map<string, Map<string, number>>();   // cat -> token -> doc count
  const globalCounts = new Map<string, number>();             // token -> doc count（全类合计）

  for (const row of rows) {
    if (!LEARNABLE_CATEGORIES.includes(row.category as SermonCategoryDb)) continue;
    const cat = row.category;
    let perCat = catCounts.get(cat);
    if (!perCat) { perCat = new Map(); catCounts.set(cat, perCat); }
    for (const token of uniqueTokens(row.title)) {
      perCat.set(token, (perCat.get(token) || 0) + 1);
      globalCounts.set(token, (globalCounts.get(token) || 0) + 1);
    }
  }

  const model: ClassifierModel = new Map();
  for (const [cat, perCat] of catCounts) {
    const kept = new Map<string, number>();
    for (const [token, count] of perCat) {
      const total = globalCounts.get(token) || count;
      const share = count / total;
      if (count >= MIN_DOC_COUNT && share >= SHARE_THRESHOLD) kept.set(token, count);
    }
    model.set(cat, kept);
  }
  return model;
}

// ---- 分类 ----

export function classifySermonCategory(model: ClassifierModel, title: string): SermonCategoryDb {
  const tokens = uniqueTokens(title);
  let bestCat: SermonCategoryDb | null = null;
  let bestScore = 0;
  let tie = false;

  for (const cat of LEARNABLE_CATEGORIES) {
    const weights = model.get(cat);
    if (!weights) continue;
    let score = 0;
    for (const token of tokens) score += weights.get(token) || 0;
    if (score > bestScore) { bestScore = score; bestCat = cat; tie = false; }
    else if (score === bestScore && score > 0) { tie = true; }
  }

  if (bestCat && bestScore > 0 && !tie) return bestCat;
  return inferCategoryFromTitle(title); // 无信号或并列 → 硬编码兜底
}

// ---- 目标匹配 ----

export function matchesTarget(entryType: EntryType, category: SermonCategoryDb, target: SyncTarget): boolean {
  if (target === 'all') return true;
  if (target === 'daily-manna') return entryType === 'daily-manna';
  if (target === 'sermon') return entryType === 'sermon';
  // 4 个细分类
  return entryType === 'sermon' && category === target;
}

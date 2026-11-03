import { BIBLE_BOOKS } from '@church/constants/bibleBooks';

/**
 * 經文出處：把「約3:16-18」「约翰福音 3:16」「John 3:16」「詩23」這類打字輸入讀成
 * 書卷、章、節。可用分號或逗號一次輸入多段（「約3:16; 羅8:28」）。
 */

export interface Reference { bookId: number; chapter: number; fromVerse: number; toVerse: number }

/** 和合本的書卷簡稱，依卷序。 */
const SHORT = [
  '創', '出', '利', '民', '申', '書', '士', '得', '撒上', '撒下', '王上', '王下', '代上', '代下', '拉', '尼', '斯', '伯', '詩', '箴', '傳', '歌',
  '賽', '耶', '哀', '結', '但', '何', '珥', '摩', '俄', '拿', '彌', '鴻', '哈', '番', '該', '亞', '瑪',
  '太', '可', '路', '約', '徒', '羅', '林前', '林後', '加', '弗', '腓', '西', '帖前', '帖後', '提前', '提後', '多', '門', '來', '雅',
  '彼前', '彼後', '約一', '約二', '約三', '猶', '啟',
];

/** 簡體字 → 正體字，只收書卷名用得到的字。 */
const TO_TRADITIONAL: Record<string, string> = {
  约: '約', 创: '創', 记: '記', 书: '書', 数: '數', 亚: '亞', 师: '師', 历: '歷', 诗: '詩', 传: '傳', 赛: '賽', 结: '結',
  弥: '彌', 鸿: '鴻', 该: '該', 玛: '瑪', 马: '馬', 罗: '羅', 门: '門', 来: '來', 犹: '猶', 启: '啟', 录: '錄', 纪: '紀',
  后: '後',
};

const traditional = (text: string) => [...text].map((c) => TO_TRADITIONAL[c] ?? c).join('');

const norm = (text: string) => traditional(text).replace(/\s+/g, '').toLowerCase();

function findBook(name: string): number | null {
  const n = norm(name).replace(/[.。]/g, '');
  if (!n) return null;
  // A whole name, then a 和合本 short name, then the start of a name (「約翰福」, 「Gen」).
  const whole = BIBLE_BOOKS.find((b) => norm(b.zh) === n || norm(b.en) === n);
  if (whole) return whole.id;
  const short = SHORT.indexOf(n);
  if (short >= 0) return short + 1;
  // 「約翰壹書」「約翰1書」
  const numbered = n.match(/^約翰?([一二三壹貳參123])書?$/);
  if (numbered) return 62 + '一二三'.indexOf({ 壹: '一', 貳: '二', 參: '三', 1: '一', 2: '二', 3: '三' }[numbered[1]] ?? numbered[1]);
  const english = n.match(/^([123])(.+)$/);
  const starts = BIBLE_BOOKS.filter((b) => norm(b.zh).startsWith(n)
    || norm(b.en).replace(/\s/g, '').startsWith(english ? `${english[1]}${english[2]}` : n));
  return starts[0]?.id ?? null;
}

/** One reference; null when it cannot be read. */
export function parseReference(text: string): Reference | null {
  const t = traditional(text).replace(/[：]/g, ':').replace(/[－—–~～至到]/g, '-').replace(/\s+/g, ' ').trim();
  // 書卷名，後面是 章[:節[-節]]，或「第3章16節」。
  const m = t.match(/^(.+?)\s*(\d+)\s*(?:[:章]\s*(\d+)\s*節?\s*(?:-\s*(\d+)\s*節?)?)?\s*$/);
  if (!m) return null;
  const bookId = findBook(m[1].replace(/第$/, ''));
  if (!bookId) return null;
  const book = BIBLE_BOOKS[bookId - 1];
  const chapter = Number(m[2]);
  if (chapter < 1 || chapter > book.chapters) return null;
  // No verses given: the whole chapter (trimmed to its real length once loaded).
  const fromVerse = m[3] ? Number(m[3]) : 1;
  const toVerse = m[4] ? Math.max(Number(m[4]), fromVerse) : m[3] ? fromVerse : 999;
  return { bookId, chapter, fromVerse, toVerse };
}

/** Several references, separated by 「;」「；」「,」「，」「、」 or new lines. */
export function parseReferences(text: string): Reference[] {
  const out: Reference[] = [];
  let lastBook: number | null = null;
  for (const part of text.split(/[;；,，、\n]+/)) {
    const piece = part.trim();
    if (!piece) continue;
    let ref = parseReference(piece);
    // 「約3:16, 4:1」: a bare chapter:verse goes with the book before it.
    if (!ref && lastBook && /^\d/.test(piece)) ref = parseReference(`${BIBLE_BOOKS[lastBook - 1].zh}${piece}`);
    if (ref) { out.push(ref); lastBook = ref.bookId; }
  }
  return out;
}

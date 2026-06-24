import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DB_NAME = 'bol-church';
const CHURCH_DIR = fileURLToPath(new URL('..', import.meta.url));
const WRANGLER_JS = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

const query = `
SELECT id, title_en, title_zh, date
FROM sermons
WHERE length(title_zh) >= 19
  AND substr(title_zh,5,1)='-'
  AND substr(title_zh,8,1)='-'
  AND substr(title_zh,11,1)=' '
  AND substr(title_zh,12,8) = replace(substr(title_zh,1,10),'-','')
ORDER BY date DESC
`;

const allSermonsQuery = `
SELECT id, title_en, title_zh, date
FROM sermons
WHERE title_en GLOB '*[一-龥]*'
   OR title_zh LIKE '____-__-__ %'
   OR title_zh LIKE '____-_-__ %'
   OR title_zh LIKE '____-__-_ %'
   OR title_zh LIKE '____-_-_ %'
ORDER BY date DESC
`;

const allMannaQuery = `
SELECT id, title_en, title_zh, date
FROM daily_manna
WHERE title_en GLOB '*[一-龥]*'
ORDER BY date DESC
`;

function runWrangler(args) {
  return execFileSync(process.execPath, [WRANGLER_JS, ...args], {
    cwd: CHURCH_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function cleanRest(title) {
  const date = title.slice(0, 10);
  const rest = title.slice(19).trim();
  return { date, rest };
}

const phraseMap = [
  ['吹角開始主日崇拜', 'Sounding the Shofar to Begin Sunday Worship'],
  ['教會慶生', 'Church Birthday Celebration'],
  ['主日舞旗敬拜', 'Sunday Flag Worship'],
  ['舞旗敬拜-過祝福隧道', 'Flag Worship - Passing Through the Tunnel of Blessing'],
  ['猶太新年敬拜讚美', 'Rosh Hashanah Praise and Worship'],
  ['猶太新年吹角節;祝各位新年蒙福', 'Rosh Hashanah and the Feast of Trumpets; Wishing Everyone a Blessed New Year'],
  ['(以賽亞)受差遣', 'Isaiah: Sent by God'],
  ['天上人間', 'Heavenly Family'],
  ['預備當下', 'Preparing for the Present'],
  ['未識之神', 'The Unknown God'],
  ['真實的敬拜者', 'A True Worshiper'],
  ['感恩的秘訣', 'The Power of Thanksgiving'],
  ['聖經中的女先知', 'Female Prophets in the Bible'],
  ['尊貴的器皿', 'Precious Vessel'],
  ['伊朗及波斯', 'Iran and Persia'],
  ['蒙福人生', 'Blessed Life'],
  ['兩棵樹-生與死的選擇', 'Two Trees - The Choice of Life and Death'],
  ['領受約瑟的恩膏', 'Receiving the Anointing of Joseph'],
  ['屬神的人生', 'A Life Belonging to God'],
  ['再突破困境', 'Break Through Again'],
  ['主的使者', 'The Angel of the Lord'],
  ['父爱如山', "A Father's Love Is Like a Mountain"],
  ['認識聖靈及其工作', 'Knowing the Holy Spirit and His Work'],
  ['賣衣服買刀', 'Sell Your Cloak and Buy a Sword'],
  ['時光隧道', 'Time Tunnel'],
  ['主日見證', 'Sunday Testimonies'],
  ['美國當儆醒', 'America Must Stay Awake'],
  ['入伍須知', 'You Are Enlisted'],
  ['禱告宣告主日', 'Declaration and Proclamation Sunday'],
  ['新的季節', 'A New Season'],
  ['玉英及烈昌婚禮', 'Yuying and Liechang Wedding'],
  ['從守望禱告到復興', 'From Watch Prayer to Revival'],
  ['大洪水及挪亞方舟', "The Great Flood and Noah's Ark"],
  ['敬拜讚美及醫治禱告', 'Praise, Worship, and Healing Prayer'],
  ['敬拜贊美及醫治禱告', 'Praise, Worship, and Healing Prayer'],
  ['敬拜讚美及醫治釋放', 'Praise, Worship, Healing, and Deliverance'],
  ['敬拜贊美及醫治釋放', 'Praise, Worship, Healing, and Deliverance'],
  ['敬拜讚美及醫治', 'Praise, Worship, and Healing'],
  ['敬拜贊美及醫治', 'Praise, Worship, and Healing'],
  ['敬拜讚美及掰餅異象', 'Praise, Worship, Communion, and Vision'],
  ['敬拜贊美及掰餅異象', 'Praise, Worship, Communion, and Vision'],
  ['敬拜讚美及禱告宣告', 'Praise, Worship, and Prayer Declaration'],
  ['敬拜贊美及禱告宣告', 'Praise, Worship, and Prayer Declaration'],
  ['敬拜贊美及見證分享', 'Praise, Worship, and Testimonies'],
  ['敬拜讚美及聖靈更新', 'Praise, Worship, and Renewal by the Holy Spirit'],
  ['敬拜讚美', 'Praise and Worship'],
  ['敬拜贊美', 'Praise and Worship'],
  ['敬拜及掰餅', 'Worship and Communion'],
  ['敬拜及醫治', 'Worship and Healing'],
  ['猶太新年主日預告', 'Rosh Hashanah Sunday Preview'],
  ['猶太新年', 'Rosh Hashanah'],
  ['疫情之後', 'Post Pandemic'],
  ['見證分享主日預告', 'Testimony Sharing Sunday Preview'],
  ['見證分享主日即將開始', 'Testimony Sharing Sunday Is About to Begin'],
  ['見證分享主日', 'Testimony Sharing Sunday'],
  ['見證分享', 'Testimony Sharing'],
  ['分享見證', 'Testimony Sharing'],
  ['醫治釋放主日崇拜', 'Healing and Deliverance Sunday Worship'],
  ['醫治釋放主日預告', 'Healing and Deliverance Sunday Preview'],
  ['醫治釋放主日即將開始', 'Healing and Deliverance Sunday Is About to Begin'],
  ['禱告宣告', 'Prayer Declaration'],
  ['乘上聖靈的浪潮', 'Surf the Wave of the Holy Spirit'],
  ['在神家中', 'In the House of the Lord'],
  ['掰餅異象主日預告', 'Communion and Vision Sunday Preview'],
  ['掰餅異象主日即將開始', 'Communion and Vision Sunday Is About to Begin'],
  ['神的心意與人的意思', "God's Will and Man's Mind"],
  ['面對未來', 'Facing the Future'],
  ['願神國降臨', 'May His Kingdom Come'],
  ['謠言止於真理', 'Rumors End with Truth'],
  ['恩典湧流禱告會', 'Grace Flow Prayer Meeting'],
  ['影響世代的家', 'A Family That Impacts Generations'],
  ['為福音同得獎賞', 'Sharing in the Reward of the Gospel'],
  ['為福音...', 'For the Gospel...'],
  ['今天的恩典', "Today's Grace"],
  ['媽媽在哪裡', 'Where Are the Mothers?'],
  ['天父的愛', "Father's Love"],
  ['神的信實', "God's Faithfulness"],
  ['事奉的人生-為服事而活', 'A Life of Service - Living to Serve'],
  ['新造的人', 'A New Creation'],
  ['活出你的人生標竿', 'Live Out the Purpose of Your Life'],
  ['福音的起頭', 'The Beginning of the Gospel'],
  ['趙姊妹見證', "Sister Zhao's Testimony"],
  ['期盼復興的火', 'Expecting the Fire of Revival'],
  ['與神和好', 'Be Reconciled with God'],
  ['阿米 路哈瑪 - 我民蒙憐憫', 'Ammi Ruhamah - My People Have Received Mercy'],
  ['有寶貝在瓦器裡', 'We Have This Treasure in Jars of Clay'],
  ['主日新聞', 'Sunday News'],
];

function translateRest(rest) {
  const withoutUrl = rest.replace(/https?:\/\/\S+/gi, '').trim();
  const fastPrayer = withoutUrl.match(/^二十一日"復興與醫治"\s*禁食禱告第(.+?)日\s*(.+)$/);
  if (fastPrayer) {
    return `21-Day "Revival and Healing" Fast Prayer - Day ${translateChineseOrdinal(fastPrayer[1])} ${translateScripture(fastPrayer[2])}`.trim();
  }

  let best = null;
  for (const [zh, en] of phraseMap) {
    if (withoutUrl.includes(zh) && (!best || zh.length > best.zh.length)) {
      best = { zh, en };
    }
  }
  if (best) return best.en;

  const asciiRuns = [...withoutUrl.matchAll(/[A-Za-z][A-Za-z0-9 '&.,:;!?()/-]*/g)]
    .map(match => match[0].trim())
    .filter(text => /[A-Za-z]{3}/.test(text) && !/^Live$/i.test(text));
  if (asciiRuns.length > 0) {
    return titleCaseEnglish(asciiRuns.sort((a, b) => b.length - a.length)[0]);
  }
  return 'Sunday Message';
}

function translateChineseOrdinal(value) {
  const map = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
    十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15, 十六: 16, 十七: 17, 十八: 18, 十九: 19, 二十: 20, 二十一: 21,
  };
  return map[value] ?? value;
}

function titleCaseEnglish(value) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\bHealings\b/g, 'Healing')
    .replace(/\bNoahs\b/g, "Noah's")
    .replace(/\bGod Faithfulness\b/g, "God's Faithfulness")
    .trim();
}

function compactDateToIso(value) {
  if (!/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function normalizeIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function dayDistance(a, b) {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Infinity;
  return Math.abs(da - db) / 86400000;
}

function normalizeTitlePrefix(title, rowDate) {
  const source = String(title || '').trim();
  const fallbackDate = normalizeIsoDate(rowDate) || '';
  const duplicate = source.match(/^(\d{4}-\d{1,2}-\d{1,2})\s+(?:[A-Z]{1,4})?(\d{8})\s*(.*)$/i);
  if (duplicate) {
    const compact = compactDateToIso(duplicate[2]);
    const chosen = compact && fallbackDate && dayDistance(compact, fallbackDate) <= 14 ? compact : (fallbackDate || compact || normalizeIsoDate(duplicate[1]));
    return { date: chosen, rest: duplicate[3].trim() };
  }
  const leading = source.match(/^(\d{4}-\d{1,2}-\d{1,2})\s+(.*)$/);
  if (leading) {
    return { date: fallbackDate || normalizeIsoDate(leading[1]), rest: leading[2].trim() };
  }
  return { date: fallbackDate, rest: source };
}

const bibleBooks = [
  ['創世記', 'Genesis'], ['創', 'Genesis'], ['出埃及記', 'Exodus'], ['出', 'Exodus'], ['利未記', 'Leviticus'], ['利', 'Leviticus'], ['民數記', 'Numbers'], ['民', 'Numbers'], ['申命記', 'Deuteronomy'], ['申', 'Deuteronomy'],
  ['書', 'Joshua'], ['士', 'Judges'], ['得', 'Ruth'], ['撒上', '1 Samuel'], ['撒下', '2 Samuel'],
  ['王上', '1 Kings'], ['王下', '2 Kings'], ['代上', '1 Chronicles'], ['代下', '2 Chronicles'],
  ['拉', 'Ezra'], ['尼', 'Nehemiah'], ['斯', 'Esther'], ['約伯記', 'Job'], ['伯', 'Job'], ['詩篇', 'Psalm'], ['詩', 'Psalm'], ['箴言', 'Proverbs'], ['箴', 'Proverbs'],
  ['傳道書', 'Ecclesiastes'], ['傳', 'Ecclesiastes'], ['歌', 'Song of Songs'], ['以賽亞書', 'Isaiah'], ['賽', 'Isaiah'], ['耶利米書', 'Jeremiah'], ['耶', 'Jeremiah'], ['哀', 'Lamentations'],
  ['結', 'Ezekiel'], ['但', 'Daniel'], ['何', 'Hosea'], ['珥', 'Joel'], ['摩', 'Amos'], ['俄', 'Obadiah'],
  ['拿', 'Jonah'], ['彌', 'Micah'], ['鴻', 'Nahum'], ['哈', 'Habakkuk'], ['番', 'Zephaniah'], ['該', 'Haggai'],
  ['亞', 'Zechariah'], ['瑪', 'Malachi'], ['太', 'Matthew'], ['可', 'Mark'], ['路', 'Luke'], ['約', 'John'],
  ['徒', 'Acts'], ['羅', 'Romans'], ['林前', '1 Corinthians'], ['林後', '2 Corinthians'], ['加', 'Galatians'],
  ['弗', 'Ephesians'], ['腓', 'Philippians'], ['西', 'Colossians'], ['帖前', '1 Thessalonians'], ['帖後', '2 Thessalonians'],
  ['提前', '1 Timothy'], ['提後', '2 Timothy'], ['多', 'Titus'], ['門', 'Philemon'], ['來', 'Hebrews'],
  ['雅', 'James'], ['彼前', '1 Peter'], ['彼後', '2 Peter'], ['約壹', '1 John'], ['約貳', '2 John'], ['約參', '3 John'],
  ['猶', 'Jude'], ['啟', 'Revelation'],
].sort((a, b) => b[0].length - a[0].length);

function parseChineseNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = { 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value.startsWith('廿')) return 20 + (digits[value[1]] || 0);
  if (value.startsWith('卅')) return 30 + (digits[value[1]] || 0);
  let total = 0;
  let current = 0;
  for (const ch of value) {
    if (ch === '百') {
      total += (current || 1) * 100;
      current = 0;
    } else if (ch === '十') {
      total += (current || 1) * 10;
      current = 0;
    } else if (ch in digits) {
      current = digits[ch];
    }
  }
  return total + current || value;
}

function translateScripture(ref) {
  const cleaned = String(ref || '').replace(/[﹝﹞\[\]（）()]/g, '').replace(/：/g, ':').replace(/，/g, ',').trim();
  const bookPair = bibleBooks.find(([zh]) => cleaned.includes(zh));
  if (!bookPair) return cleaned;
  const rest = cleaned.slice(cleaned.lastIndexOf(bookPair[0]) + bookPair[0].length).replace(/\s+/g, '');
  const chineseChapter = rest.match(/^([一二兩三四五六七八九十百零廿卅]+)(\d+)?(?:[,，]\s*(\d+))?/);
  const numericChapter = rest.match(/^(\d+)\s*[:：]\s*(\d+(?:-\d+)?)(?:[,，]\s*(\d+))?/);
  const match = chineseChapter || numericChapter;
  if (!match) return `${bookPair[1]} ${rest}`.trim();
  const chapter = chineseChapter ? parseChineseNumber(match[1]) : Number(match[1]);
  if (!match[2]) return `${bookPair[1]} ${chapter}`;
  const verse = match[3] ? `${match[2]}-${match[3]}` : match[2];
  return `${bookPair[1]} ${chapter}:${verse}`;
}

function translateMannaTitle(row) {
  const source = row.title_zh || row.title_en || '';
  const number = source.match(/#(\d+)/)?.[1];
  const monthDay = source.match(/(\d{1,2}\/\d{1,2})/)?.[1];
  const afterMonthDay = monthDay ? source.slice(source.lastIndexOf(monthDay) + monthDay.length).trim() : '';
  const scripture = translateScripture(afterMonthDay);
  const parts = ['"Scripture in Hand, Victory in Hand"', 'Pastor Bingwei Wu', number ? `Daily Manna #${number}` : 'Daily Manna'];
  if (monthDay) parts.push(monthDay);
  if (scripture && !/[\u4e00-\u9fff]/.test(scripture)) parts.push(scripture);
  return parts.join(' - ');
}

function buildSermonUpdate(row) {
  const normalized = normalizeTitlePrefix(row.title_zh || row.title_en, row.date);
  const zh = normalized.date ? `${normalized.date} ${normalized.rest}`.trim() : normalized.rest;
  const en = normalized.date ? `${normalized.date} ${translateRest(normalized.rest)}`.trim() : translateRest(normalized.rest);
  return { id: row.id, title_zh: zh, title_en: en };
}

function buildMannaUpdate(row) {
  return { id: row.id, title_zh: row.title_zh, title_en: translateMannaTitle(row) };
}

function readRows(sql) {
  const raw = runWrangler(['d1', 'execute', DB_NAME, '--remote', '--json', '--command', sql]);
  return JSON.parse(raw)[0]?.results ?? [];
}

function executeUpdates(table, rows) {
  const now = new Date().toISOString();
  const updates = rows.map(row => {
    return `UPDATE ${table} SET title_zh = ${sqlString(row.title_zh)}, title_en = ${sqlString(row.title_en)}, updated_at = ${sqlString(now)} WHERE id = ${sqlString(row.id)};`;
  });
  const chunkSize = 50;
  for (let i = 0; i < updates.length; i += chunkSize) {
    runWrangler(['d1', 'execute', DB_NAME, '--remote', '--command', updates.slice(i, i + chunkSize).join('\n')]);
  }
}

function runAll() {
  const sermonRows = readRows(allSermonsQuery).map(buildSermonUpdate);
  const mannaRows = readRows(allMannaQuery).map(buildMannaUpdate);
  if (process.argv.includes('--apply')) {
    executeUpdates('sermons', sermonRows);
    executeUpdates('daily_manna', mannaRows);
    console.log(`Updated ${sermonRows.length} sermon titles and ${mannaRows.length} daily manna English titles.`);
  } else {
    console.log(`Would update ${sermonRows.length} sermon titles and ${mannaRows.length} daily manna English titles.`);
    for (const row of sermonRows.slice(0, 20)) {
      console.log(`${row.id}\n  zh -> ${row.title_zh}\n  en -> ${row.title_en}\n`);
    }
    for (const row of mannaRows.slice(0, 5)) {
      console.log(`${row.id}\n  en -> ${row.title_en}\n`);
    }
  }
}

if (process.argv.includes('--all')) {
  runAll();
  process.exit(0);
}

const rows = readRows(query);

if (process.argv.includes('--apply')) {
  if (rows.length === 0) {
    console.log('No matching rows.');
    process.exit(0);
  }
  const updates = rows.map(row => {
    const { date, rest } = cleanRest(row.title_zh);
    const titleZh = `${date} ${rest}`;
    const titleEn = `${date} ${translateRest(rest)}`;
    return `UPDATE sermons SET title_zh = ${sqlString(titleZh)}, title_en = ${sqlString(titleEn)}, updated_at = ${sqlString(new Date().toISOString())} WHERE id = ${sqlString(row.id)};`;
  }).join('\n');
  runWrangler(['d1', 'execute', DB_NAME, '--remote', '--command', updates]);
  console.log(`Updated ${rows.length} sermon titles.`);
} else {
  for (const row of rows) {
    const { date, rest } = cleanRest(row.title_zh);
    console.log(`${row.id}\n  zh: ${row.title_zh}\n  -> ${date} ${rest}\n  en: ${date} ${translateRest(rest)}\n`);
  }
  console.log(`Matched ${rows.length} rows. Re-run with --apply to update remote D1.`);
}

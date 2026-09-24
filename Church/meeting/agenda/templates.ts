import { localDateString, newAgenda, newId, nextWeekday, shortTitle } from './agendaModel';
import type { Agenda, AgendaItem } from './types';

/**
 * Ready-made 聚會內容 for each room: opening, a passage, two songs, a picture,
 * a reading, and a closing slide. The passage, the songs and the reading are
 * drawn at random from short curated lists, so two weeks' templates differ.
 */

interface Passage { bookId: number; chapter: number; fromVerse: number; toVerse: number }

interface RoomTemplate {
  name: string;
  /** 0 = Sunday. */
  weekday: number;
  passages: Passage[];
  image: { url: string; caption: string };
}

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?w=1920&q=80&auto=format&fm=jpg`;

const ROOMS: Record<string, RoomTemplate> = {
  'bible-study-1': {
    name: '聯合小組查經',
    weekday: 2,
    passages: [
      { bookId: 43, chapter: 3, fromVerse: 16, toVerse: 17 },   // 約翰福音
      { bookId: 19, chapter: 119, fromVerse: 105, toVerse: 105 }, // 詩篇
      { bookId: 55, chapter: 3, fromVerse: 16, toVerse: 17 },   // 提摩太後書
    ],
    image: { url: unsplash('1529070538774-1843cb3265df'), caption: '一同查考神的話' },
  },
  prayer: {
    name: '禱告會',
    weekday: 3,
    passages: [
      { bookId: 50, chapter: 4, fromVerse: 6, toVerse: 7 },     // 腓立比書
      { bookId: 40, chapter: 7, fromVerse: 7, toVerse: 8 },     // 馬太福音
      { bookId: 52, chapter: 5, fromVerse: 16, toVerse: 18 },   // 帖撒羅尼迦前書
    ],
    image: { url: unsplash('1543702404-38c2035462ad'), caption: '同心合意地禱告' },
  },
  'bible-study-3': {
    name: '姐妹小組查經',
    weekday: 2,
    passages: [
      { bookId: 20, chapter: 31, fromVerse: 25, toVerse: 26 },  // 箴言
      { bookId: 19, chapter: 46, fromVerse: 1, toVerse: 3 },    // 詩篇
      { bookId: 23, chapter: 40, fromVerse: 31, toVerse: 31 },  // 以賽亞書
    ],
    image: { url: unsplash('1445445290350-18a3b86e0b5a'), caption: '在主的話語中得安息' },
  },
  'bible-study-2': {
    name: '弟兄小組查經',
    weekday: 2,
    passages: [
      { bookId: 6, chapter: 1, fromVerse: 9, toVerse: 9 },      // 約書亞記
      { bookId: 46, chapter: 16, fromVerse: 13, toVerse: 14 },  // 哥林多前書
      { bookId: 33, chapter: 6, fromVerse: 8, toVerse: 8 },     // 彌迦書
    ],
    image: { url: unsplash('1504052434569-70ad5836ab65'), caption: '剛強壯膽，信靠主' },
  },
};

export const TEMPLATE_ROOM_IDS = Object.keys(ROOMS);
/** Exposed for the test that checks every verse exists. */
export const TEMPLATE_PASSAGES: readonly Passage[] = Object.values(ROOMS).flatMap((room) => room.passages);

/** Official lyric videos from 讚美之泉 and 約書亞樂團, each confirmed to exist. */
const SONGS = [
  { videoId: 'u2M-zzt1Whc', title: '【何等恩典 How Could It Be】官方歌詞版MV (Official Lyrics MV) - 讚美之泉敬拜讚美 (14)' },
  { videoId: 'tPf7Ig1ebL4', title: '【這一生最美的祝福 The Gift of Knowing You】官方歌詞版MV (Official Lyrics MV) - 讚美之泉敬拜讚美 (8)' },
  { videoId: 'AfWZ-1taIfw', title: '【禱告的力量 The Power of Prayer】官方歌詞版MV (Official Lyrics MV) - 讚美之泉敬拜讚美 (24)' },
  { videoId: 'L04ZzS43PRA', title: "【主禱文 The Lord's Prayer】官方歌詞版MV (Official Lyrics MV) - 讚美之泉敬拜讚美 (7)" },
  { videoId: 'v76-wz1mv8w', title: '【祢的恩典夠我用 Your Grace Is Enough】官方歌詞版MV (Official Lyrics MV) - 讚美之泉敬拜讚美 (23)' },
  { videoId: 'VJTtPXR-pUE', title: '【平安 Peace】官方歌詞版MV (Official Lyrics MV) - 讚美之泉敬拜讚美 (23)' },
  { videoId: '3k1JbhnNdFs', title: '【敬拜的心 / The Heart Of Worship】官方歌詞MV - 約書亞樂團 ft. 趙治德' },
  { videoId: 'kMOg8x7ptz4', title: 'No.24【如祢 / Like You】官方歌詞 MV - 約書亞樂團、璽恩 SiEnVanessa' },
  { videoId: 'FUMrok5yvWo', title: '【最大的福分 The Blessing】官方歌詞版MV (Official Lyrics MV) - 讚美之泉敬拜讚美 (26)' },
  { videoId: 'nJBLeMrhu9w', title: '【在這裡 You Are Here】官方歌詞版MV (Official Lyrics MV) - 讚美之泉敬拜讚美 (22)' },
];

const READINGS = [
  {
    title: '主禱文',
    body: '我們在天上的父：\n願人都尊祢的名為聖。\n願祢的國降臨；願祢的旨意行在地上，如同行在天上。\n我們日用的飲食，今日賜給我們。\n免我們的債，如同我們免了人的債。\n不叫我們遇見試探；救我們脫離兇惡。\n因為國度、權柄、榮耀，全是祢的，直到永遠。阿們！',
  },
  {
    title: '分享時間',
    body: '1. 這段經文中，哪一句最觸動你？為什麼？\n2. 這段話可以如何應用在你這一週的生活中？\n3. 有什麼需要，想請大家一起為你禱告？',
  },
  {
    title: '代禱事項',
    body: '・為彼此的家人與健康代禱\n・為教會的事工與同工代禱\n・為身邊還未認識主的親友代禱\n・為世界的和平與苦難中的人代禱',
  },
  {
    title: '今日默想',
    body: '神的話是我腳前的燈，是我路上的光。\n\n讓我們安靜下來，\n把這一週的重擔交給主，\n在祂面前領受祂為我們預備的話語。',
  },
];

const chineseDate = (date: Date) =>
  `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（週${'日一二三四五六'[date.getDay()]}）`;

export interface TemplatePlan {
  agenda: Agenda;
  /** Pictures to download and store; each fills the `fileId` of the item named. */
  images: { itemId: string; url: string }[];
}

export function buildRoomTemplate(roomId: string, now: Date, random: () => number = Math.random): TemplatePlan {
  const room = ROOMS[roomId];
  if (!room) throw new Error(`No template for room ${roomId}`);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length) % list.length];

  const meeting = nextWeekday(now, room.weekday);
  const following = new Date(meeting.getFullYear(), meeting.getMonth(), meeting.getDate() + 7);
  const first = Math.floor(random() * SONGS.length) % SONGS.length;
  const second = (first + 1 + (Math.floor(random() * (SONGS.length - 1)) % (SONGS.length - 1))) % SONGS.length;
  const song = (index: number): AgendaItem => ({
    id: newId(), kind: 'youtube', title: shortTitle(SONGS[index].title), videoId: SONGS[index].videoId,
    startSeconds: 0, url: `https://www.youtube.com/watch?v=${SONGS[index].videoId}`,
  });
  const reading = pick(READINGS);
  const imageId = newId();

  const agenda: Agenda = {
    ...newAgenda(now, `${room.name} ${meeting.getMonth() + 1}/${meeting.getDate()}`),
    date: localDateString(meeting),
    note: room.name,
    items: [
      { id: newId(), kind: 'text', align: 'center', title: room.name,
        body: `${chineseDate(meeting)}　晚上 7:00\n\n信望愛靈糧堂 · 線上聚會\n歡迎大家！` },
      { id: newId(), kind: 'scripture', ...pick(room.passages) },
      song(first),
      song(second),
      { id: imageId, kind: 'image', title: room.image.caption, fileId: '' },
      { id: newId(), kind: 'text', title: reading.title, body: reading.body },
      { id: newId(), kind: 'text', align: 'center', title: '感謝主 · Thank You',
        body: `謝謝大家今天的參與！\n願主的恩典與平安常與你們同在。\n\n下次聚會：${chineseDate(following)}　晚上 7:00\n信望愛靈糧堂` },
    ],
  };
  return { agenda, images: [{ itemId: imageId, url: room.image.url }] };
}

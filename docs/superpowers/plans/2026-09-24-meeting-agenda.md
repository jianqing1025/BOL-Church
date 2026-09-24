# 線上查經「聚會內容」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Host 會前在本機準備「聚會內容」清單（文字、圖片、經文、YouTube、本機影片），會議中從右側抽屜一鍵分享給全房間。

**Architecture:** 內容只存在 Host 瀏覽器的 IndexedDB（`meeting/agenda/agendaStore.ts`），不經伺服器。可測邏輯全部是純函式，放在 `meeting/agenda/`（vitest 只掃 `meeting/**` 等固定資料夾、Node 環境、只收 `.test.ts`）。分享重用既有通道：經文走聖經同步（新增高亮範圍）、YouTube 走 `useRoomVideo`、本機影片走 `VideoBroadcastBar`；文字與圖片由 canvas 畫成投影片，`captureStream` 後以 `ScreenShare` 來源、軌道名 `meeting-slide` 發佈，觀看端不需改動。

**Tech Stack:** React 19 + Vite、Tailwind（CDN runtime）、livekit-client 2.20、IndexedDB、Canvas 2D、vitest + fake-indexeddb

**設計依據:** `docs/superpowers/specs/2026-09-24-meeting-agenda-design.md`

**工作目錄:** 所有指令都在 `Church/` 下執行。

**型別陷阱：** `Church/tsconfig.json` 沒開 `strict`。可辨識聯合請用字面值比較收斂（`item.kind === 'text'`），不要依賴真假值收斂。

**Commit 策略：** 工作樹中 `MeetingRoomView.tsx`、`MeetingControlBar.tsx`、`livekitService.ts`、`useLiveKit.ts`、`translations.ts` 等檔案帶著尚未提交的桌面版改動，逐任務 commit 會把那些改動一併捲入。因此本計畫的每個任務以「檢查點」（型別檢查＋測試）收尾，**不做 commit**；全部完成後由使用者決定如何提交。

---

## 檔案結構

新增：

| 檔案 | 職責 |
|---|---|
| `meeting/agenda/types.ts` | `Agenda`、`AgendaItem`、`StoredFile` 型別與上限常數 |
| `meeting/agenda/agendaModel.ts` | 純函式：新建、排序、預設挑選、複製、移動、標籤、相鄰項、檔案參照 |
| `meeting/agenda/agendaModel.test.ts` | 上者的測試 |
| `meeting/agenda/agendaStore.ts` | IndexedDB 存取：列表、儲存、刪除、加檔案項目（失敗回滾）、清理無參照檔案 |
| `meeting/agenda/agendaStore.test.ts` | 以 fake-indexeddb 測試 |
| `meeting/agenda/slideLayout.ts` | 純函式：投影片常數、斷行、自動縮字 |
| `meeting/agenda/slideLayout.test.ts` | 上者的測試 |
| `meeting/agenda/slideRenderer.ts` | Canvas 繪製文字／圖片投影片（瀏覽器專用） |
| `meeting/agenda/imageFile.ts` | 圖片解碼與縮到最長邊 3840px（瀏覽器專用） |
| `hooks/useAgendaPresenter.ts` | 會議中的分享狀態：先停再開、上一項／下一項、目前分享中的項目 |
| `components/meeting/agenda/ScripturePicker.tsx` | 書卷／章／起訖節下拉＋預覽 |
| `components/meeting/agenda/AgendaItemEditor.tsx` | 單一項目的就地編輯 |
| `components/meeting/agenda/AgendaEditor.tsx` | 左右兩欄編輯畫面 |
| `components/meeting/agenda/AgendaDrawer.tsx` | 會議中的右側抽屜 |

修改：`meeting/chatProtocol.ts`（+test）、`hooks/useBibleSync.ts`、`components/meeting/BiblePanel.tsx`、`services/livekitService.ts`（+test）、`hooks/useLiveKit.ts`、`components/meeting/MeetingControlBar.tsx`、`components/meeting/MeetingRoomView.tsx`、`components/meeting/MeetingPage.tsx`、`components/meeting/DesktopRoomPicker.tsx`、`constants/translations.ts`、`package.json`（devDependency `fake-indexeddb`，已安裝）、`desktop/smoke.cjs`。

---

### Task 1: 經文高亮 — 同步協定

**Files:**
- Modify: `meeting/chatProtocol.ts`（`BibleMessage` 的 passage 分支、`sanitizeBibleMessage`）
- Test: `meeting/chatProtocol.test.ts`

- [ ] **Step 1: 寫失敗的測試**（加在 `describe('sanitizeBibleMessage'` 區塊內）

```ts
  it('keeps a highlighted verse range on a passage', () => {
    expect(sanitizeBibleMessage({ type: 'bible', action: 'passage', bookId: 43, chapter: 3, highlight: { from: 16, to: 17 } }))
      .toEqual({ type: 'bible', action: 'passage', bookId: 43, chapter: 3, highlight: { from: 16, to: 17 } });
  });

  it('drops a highlight that is not a sane verse range, but keeps the passage', () => {
    for (const highlight of [{ from: 0, to: 3 }, { from: 5, to: 4 }, { from: 1, to: 201 }, { from: '1', to: 2 }, 'x']) {
      expect(sanitizeBibleMessage({ type: 'bible', action: 'passage', bookId: 43, chapter: 3, highlight }))
        .toEqual({ type: 'bible', action: 'passage', bookId: 43, chapter: 3 });
    }
  });
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run meeting/chatProtocol.test.ts`
Expected: FAIL — 第一個測試的輸出少了 `highlight`。

- [ ] **Step 3: 實作**

`BibleMessage` 的 passage 分支改成：

```ts
  /**
   * `highlight` marks the verses a host is presenting (聚會內容). Optional, so
   * an older client simply opens the chapter and ignores it.
   */
  | { type: 'bible'; action: 'passage'; bookId: number; chapter: number; highlight?: { from: number; to: number } }
```

`sanitizeBibleMessage` 中，把 `if (msg.action === 'passage') return { type: 'bible', action: 'passage', bookId: book.id, chapter };` 換成：

```ts
    if (msg.action === 'passage') {
      const highlight = sanitizeVerseRange((msg as { highlight?: unknown }).highlight);
      return highlight
        ? { type: 'bible', action: 'passage', bookId: book.id, chapter, highlight }
        : { type: 'bible', action: 'passage', bookId: book.id, chapter };
    }
```

並在 `sanitizeBibleMessage` 之前新增：

```ts
/** A verse range, bounded like `scroll` below (詩篇 119 has 176 verses). */
function sanitizeVerseRange(input: unknown): { from: number; to: number } | null {
  if (!input || typeof input !== 'object') return null;
  const { from, to } = input as { from?: unknown; to?: unknown };
  const verse = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 200;
  if (!verse(from) || !verse(to) || to < from) return null;
  return { from, to };
}
```

- [ ] **Step 4: 執行，確認通過**

Run: `npx vitest run meeting/chatProtocol.test.ts`
Expected: PASS（全部）

- [ ] **Step 5: 檢查點** — `npx tsc --noEmit` 無輸出。

---

### Task 2: 經文高亮 — 用戶端狀態與聖經面板

**Files:**
- Modify: `hooks/useBibleSync.ts`
- Modify: `components/meeting/BiblePanel.tsx`
- Modify: `components/meeting/MeetingRoomView.tsx`（把 `highlight` 傳給 `BiblePanel`）

- [ ] **Step 1: `useBibleSync` 加上高亮狀態**

介面 `BibleSync` 新增欄位並改 `selectChapter` 簽名：

```ts
  /** Verses a host is presenting, for the passage named — cleared on any other move. */
  highlight: BibleHighlight | null;
  selectChapter: (bookId: number, chapter: number, highlight?: { from: number; to: number }) => void;
```

檔案頂部（`BibleScrollPosition` 之後）新增：

```ts
export interface BibleHighlight {
  bookId: number;
  chapter: number;
  from: number;
  to: number;
}
```

`useBibleSync` 內：

```ts
  const [highlight, setHighlight] = useState<BibleHighlight | null>(null);
```

`apply` 中：`close` 分支加 `setHighlight(null);`；`contents` 與 `book` 分支 return 前加 `setHighlight(null);`；passage（最後）分支改為：

```ts
    setChapter(message.chapter);
    setView('text');
    setHighlight(message.action === 'passage' && message.highlight
      ? { bookId: message.bookId, chapter: message.chapter, ...message.highlight }
      : null);
```

`selectChapter` 改為：

```ts
  const selectChapter = useCallback(
    (id: number, next: number, range?: { from: number; to: number }) => lead(range
      ? { type: 'bible', action: 'passage', bookId: id, chapter: next, highlight: range }
      : { type: 'bible', action: 'passage', bookId: id, chapter: next }),
    [lead],
  );
```

return 物件加入 `highlight`。

- [ ] **Step 2: `BiblePanel` 畫出高亮並捲到起始節**

Props 新增：

```ts
  /** Verses to mark, when they belong to the passage on screen. */
  highlight?: { bookId: number; chapter: number; from: number; to: number } | null;
```

解構參數加入 `highlight = null`。在「Follow the leader」那個 `useEffect` 之後新增：

```ts
  // A presented passage: once its verses are on screen, bring the first to the top.
  const marked = highlight && highlight.bookId === bookId && highlight.chapter === chapter ? highlight : null;
  useEffect(() => {
    if (marked && verses) scrollToVerse(marked.from);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marked?.from, marked?.to, verses]);
```

經文 `<li>` 的 className 改為：

```tsx
                  <li
                    key={i}
                    data-verse={i + 1}
                    className={`flex gap-2 ${marked && i + 1 >= marked.from && i + 1 <= marked.to ? '-mx-2 rounded-lg bg-amber-400/15 px-2 ring-1 ring-amber-300/30' : ''}`}
                  >
```

- [ ] **Step 3: `MeetingRoomView` 傳入**

`<BiblePanel` 的 props 加 `highlight={bible.highlight}`。

- [ ] **Step 4: 檢查點** — `npx tsc --noEmit` 無輸出；`npx vitest run meeting` 全過。

---

### Task 3: 資料型別與純邏輯

**Files:**
- Create: `meeting/agenda/types.ts`
- Create: `meeting/agenda/agendaModel.ts`
- Test: `meeting/agenda/agendaModel.test.ts`

- [ ] **Step 1: 建立型別**

`meeting/agenda/types.ts`：

```ts
/**
 * 聚會內容 — what a host prepares before a meeting, kept only on their own
 * device (see agendaStore). Nothing here is ever sent to the server.
 */
export interface TextItem { id: string; kind: 'text'; title: string; body: string }
export interface ImageItem { id: string; kind: 'image'; title: string; fileId: string }
export interface ScriptureItem { id: string; kind: 'scripture'; bookId: number; chapter: number; fromVerse: number; toVerse: number }
export interface YouTubeItem { id: string; kind: 'youtube'; title: string; videoId: string; startSeconds: number }
export interface LocalVideoItem { id: string; kind: 'localVideo'; title: string; fileId: string; fileName: string; size: number }

export type AgendaItem = TextItem | ImageItem | ScriptureItem | YouTubeItem | LocalVideoItem;
export type AgendaItemKind = AgendaItem['kind'];

export interface Agenda {
  id: string;
  title: string;
  /** 'YYYY-MM-DD', the meeting's date. */
  date: string;
  note: string;
  items: AgendaItem[];
  updatedAt: number;
}

/** An image or video body, stored apart so opening a list never loads a film. */
export interface StoredFile {
  id: string;
  blob: Blob;
  type: string;
  size: number;
}

export const MAX_VIDEO_BYTES = 2 * 1024 ** 3;
export const MAX_IMAGE_EDGE = 3840;
```

- [ ] **Step 2: 寫失敗的測試**

`meeting/agenda/agendaModel.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  dayDistance, duplicateAgenda, itemLabel, localDateString, moveItem, nearestAgenda, neighbourItem,
  newAgenda, referencedFileIds, scriptureLabel, sortAgendas,
} from './agendaModel';
import type { Agenda, AgendaItem } from './types';
import { Language } from '../../types';

const agenda = (id: string, date: string, items: AgendaItem[] = [], updatedAt = 0): Agenda =>
  ({ id, title: id, date, note: '', items, updatedAt });
const text = (id: string, title = '', body = ''): AgendaItem => ({ id, kind: 'text', title, body });
const image = (id: string, fileId: string): AgendaItem => ({ id, kind: 'image', title: 'p', fileId });

describe('dates', () => {
  it('formats the local date and measures whole days', () => {
    expect(localDateString(new Date(2026, 8, 4, 23, 30))).toBe('2026-09-04');
    expect(dayDistance('2026-09-30', '2026-10-07')).toBe(7);
  });
});

describe('newAgenda', () => {
  it('starts empty, dated today', () => {
    const a = newAgenda(new Date(2026, 9, 7), '新的聚會內容');
    expect(a).toMatchObject({ title: '新的聚會內容', date: '2026-10-07', note: '', items: [] });
    expect(a.id).toMatch(/[0-9a-f-]{36}/);
  });
});

describe('sortAgendas', () => {
  it('puts the latest meeting first, then the latest edit', () => {
    const sorted = sortAgendas([agenda('a', '2026-09-23'), agenda('b', '2026-10-07', [], 1), agenda('c', '2026-10-07', [], 2)]);
    expect(sorted.map((a) => a.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('nearestAgenda', () => {
  it('picks the one dated closest to today, preferring the upcoming on a tie', () => {
    const list = [agenda('past', '2026-09-30'), agenda('next', '2026-10-04'), agenda('far', '2026-12-01')];
    expect(nearestAgenda(list, '2026-10-02')?.id).toBe('next');
    expect(nearestAgenda([], '2026-10-02')).toBeNull();
  });
});

describe('referencedFileIds', () => {
  it('collects the files every agenda still uses', () => {
    const ids = referencedFileIds([
      agenda('a', '2026-01-01', [image('1', 'f1'), text('2')]),
      agenda('b', '2026-01-02', [{ id: '3', kind: 'localVideo', title: 'v', fileId: 'f2', fileName: 'v.mp4', size: 1 }]),
    ]);
    expect([...ids].sort()).toEqual(['f1', 'f2']);
  });
});

describe('moveItem', () => {
  it('moves one entry and leaves the input alone', () => {
    const items = ['a', 'b', 'c', 'd'];
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(items, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(items).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('duplicateAgenda', () => {
  it('copies with fresh ids but shares the files', () => {
    const source = agenda('a', '2026-09-30', [image('1', 'f1')]);
    const copy = duplicateAgenda(source, new Date(2026, 9, 7), '（副本）');
    expect(copy.id).not.toBe('a');
    expect(copy.title).toBe('a（副本）');
    expect(copy.items[0].id).not.toBe('1');
    expect(copy.items[0]).toMatchObject({ kind: 'image', fileId: 'f1' });
  });
});

describe('labels', () => {
  it('names a verse range the way a reader says it', () => {
    const one = { id: 's', kind: 'scripture' as const, bookId: 43, chapter: 3, fromVerse: 16, toVerse: 16 };
    expect(scriptureLabel(one, Language.ZH)).toBe('約翰福音 3:16');
    expect(scriptureLabel({ ...one, toVerse: 17 }, Language.ZH)).toBe('約翰福音 3:16–17');
  });

  it('falls back to the first line of a text, then to the kind', () => {
    const fallbacks = { text: '文字', image: '圖片', youtube: 'YouTube', localVideo: '影片' };
    expect(itemLabel(text('1', '開場'), Language.ZH, fallbacks)).toBe('開場');
    expect(itemLabel(text('1', '', '\n  本週代禱事項\n第二行'), Language.ZH, fallbacks)).toBe('本週代禱事項');
    expect(itemLabel(text('1'), Language.ZH, fallbacks)).toBe('文字');
  });
});

describe('neighbourItem', () => {
  const items = [text('a'), text('b'), text('c')];
  it('steps through the list and stops at either end', () => {
    expect(neighbourItem(items, 'b', 1)?.id).toBe('c');
    expect(neighbourItem(items, 'b', -1)?.id).toBe('a');
    expect(neighbourItem(items, 'c', 1)).toBeNull();
    expect(neighbourItem(items, 'a', -1)).toBeNull();
  });
  it('starts from the first item when nothing is being shared', () => {
    expect(neighbourItem(items, null, 1)?.id).toBe('a');
    expect(neighbourItem(items, null, -1)).toBeNull();
  });
});
```

- [ ] **Step 3: 執行，確認失敗**

Run: `npx vitest run meeting/agenda/agendaModel.test.ts`
Expected: FAIL — `Cannot find module './agendaModel'`。

- [ ] **Step 4: 實作**

先確認 `Language` 列舉的中文值：`grep -n "enum Language" -A4 types.ts`（應為 `ZH`／`EN`；若名稱不同，測試與實作一併改用實際名稱）。

`meeting/agenda/agendaModel.ts`：

```ts
import { findBibleBook, localizeBookName } from '../../constants/bibleBooks';
import type { Language } from '../../types';
import type { Agenda, AgendaItem, ScriptureItem } from './types';

export const newId = (): string => crypto.randomUUID();

/** 'YYYY-MM-DD' in the device's own time zone — the date a host means. */
export function localDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function dayDistance(a: string, b: string): number {
  const day = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 86_400_000;
  return day(b) - day(a);
}

export function newAgenda(now: Date, title: string): Agenda {
  return { id: newId(), title, date: localDateString(now), note: '', items: [], updatedAt: now.getTime() };
}

/** Latest meeting first; among the same date, the latest edit. */
export function sortAgendas(list: readonly Agenda[]): Agenda[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
}

/** The agenda for the meeting nearest today — upcoming wins a tie. */
export function nearestAgenda(list: readonly Agenda[], today: string): Agenda | null {
  let best: Agenda | null = null;
  let bestKey = Infinity;
  for (const agenda of list) {
    const distance = dayDistance(today, agenda.date);
    // Doubling and subtracting one for the future breaks ties toward it.
    const key = Math.abs(distance) * 2 - (distance > 0 ? 1 : 0);
    if (key < bestKey) { best = agenda; bestKey = key; }
  }
  return best;
}

export function referencedFileIds(list: readonly Agenda[]): Set<string> {
  const ids = new Set<string>();
  for (const agenda of list) {
    for (const item of agenda.items) {
      if (item.kind === 'image' || item.kind === 'localVideo') ids.add(item.fileId);
    }
  }
  return ids;
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** A copy for another week: new ids throughout, the same stored files. */
export function duplicateAgenda(source: Agenda, now: Date, suffix: string): Agenda {
  return {
    ...source,
    id: newId(),
    title: `${source.title}${suffix}`,
    items: source.items.map((item) => ({ ...item, id: newId() })),
    updatedAt: now.getTime(),
  };
}

export function scriptureLabel(item: ScriptureItem, language: Language): string {
  const book = findBibleBook(item.bookId);
  const name = book ? localizeBookName(book, language) : String(item.bookId);
  const range = item.toVerse > item.fromVerse ? `${item.fromVerse}–${item.toVerse}` : String(item.fromVerse);
  return `${name} ${item.chapter}:${range}`;
}

export interface ItemFallbacks { text: string; image: string; youtube: string; localVideo: string }

/** What a list row calls an item. */
export function itemLabel(item: AgendaItem, language: Language, fallbacks: ItemFallbacks): string {
  if (item.kind === 'scripture') return scriptureLabel(item, language);
  if (item.kind === 'text') {
    const firstLine = item.body.split('\n').map((line) => line.trim()).find(Boolean);
    return item.title.trim() || firstLine?.slice(0, 40) || fallbacks.text;
  }
  return item.title.trim() || fallbacks[item.kind];
}

/** The item before or after `currentId`; with nothing current, "next" is the first. */
export function neighbourItem(items: readonly AgendaItem[], currentId: string | null, delta: 1 | -1): AgendaItem | null {
  if (currentId === null) return delta === 1 ? items[0] ?? null : null;
  const index = items.findIndex((item) => item.id === currentId);
  if (index < 0) return null;
  return items[index + delta] ?? null;
}
```

- [ ] **Step 5: 執行，確認通過**

Run: `npx vitest run meeting/agenda/agendaModel.test.ts`
Expected: PASS

- [ ] **Step 6: 檢查點** — `npx tsc --noEmit` 無輸出。

---

### Task 4: IndexedDB 儲存

**Files:**
- Create: `meeting/agenda/agendaStore.ts`
- Test: `meeting/agenda/agendaStore.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { AgendaStoreError, openAgendaStore } from './agendaStore';
import { newAgenda } from './agendaModel';

const fresh = () => openAgendaStore(new IDBFactory());
const blob = (text: string) => new Blob([text], { type: 'text/plain' });

describe('agendaStore', () => {
  it('saves and lists agendas, latest meeting first', async () => {
    const store = fresh();
    const a = { ...newAgenda(new Date(2026, 8, 30), 'A') };
    const b = { ...newAgenda(new Date(2026, 9, 7), 'B') };
    await store.save(a);
    await store.save(b);
    expect((await store.list()).map((x) => x.title)).toEqual(['B', 'A']);
  });

  it('stores a file with its item and reads it back', async () => {
    const store = fresh();
    const saved = await store.addFileItem(newAgenda(new Date(), 'A'), blob('picture'),
      (fileId) => ({ id: 'i1', kind: 'image', title: 'p', fileId }));
    const item = saved.items[0];
    expect(item.kind).toBe('image');
    const file = await store.getFile(item.kind === 'image' ? item.fileId : '');
    expect(await file?.blob.text()).toBe('picture');
    expect(file?.size).toBe(7);
  });

  it('removes a file only once no agenda uses it', async () => {
    const store = fresh();
    const a = await store.addFileItem(newAgenda(new Date(), 'A'), blob('x'), (fileId) => ({ id: 'i', kind: 'image', title: 'p', fileId }));
    const fileId = a.items[0].kind === 'image' ? a.items[0].fileId : '';
    const copy = { ...a, id: 'copy', items: a.items.map((i) => ({ ...i, id: 'j' })) };
    await store.save(copy);

    await store.remove(a.id);
    expect(await store.getFile(fileId)).toBeDefined();
    await store.removeItem(copy, 'j');
    expect(await store.getFile(fileId)).toBeUndefined();
  });

  it('rolls the file back when the agenda cannot be written', async () => {
    const store = fresh();
    // A function cannot be stored, so the agenda write fails after the file went in.
    const broken = { ...newAgenda(new Date(), 'A'), note: (() => 1) as unknown as string };
    let fileId = '';
    await expect(store.addFileItem(broken, blob('x'), (id) => { fileId = id; return { id: 'i', kind: 'image', title: 'p', fileId: id }; }))
      .rejects.toBeInstanceOf(AgendaStoreError);
    expect(await store.getFile(fileId)).toBeUndefined();
  });
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run meeting/agenda/agendaStore.test.ts`
Expected: FAIL — `Cannot find module './agendaStore'`。

- [ ] **Step 3: 實作**

`meeting/agenda/agendaStore.ts`：

```ts
import { newId, referencedFileIds, sortAgendas } from './agendaModel';
import type { Agenda, AgendaItem, StoredFile } from './types';

const DB_NAME = 'meeting-agenda';
const AGENDAS = 'agendas';
const FILES = 'files';

/** 'quota' is a full disk — worth its own message; anything else is 'failed'. */
export class AgendaStoreError extends Error {
  constructor(readonly reason: 'quota' | 'failed', cause?: unknown) {
    super(reason === 'quota' ? 'Storage is full' : 'Could not save', { cause });
    this.name = 'AgendaStoreError';
  }
}

const wrap = (error: unknown): AgendaStoreError =>
  error instanceof AgendaStoreError ? error
    : new AgendaStoreError((error as { name?: string })?.name === 'QuotaExceededError' ? 'quota' : 'failed', error);

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });

export interface AgendaStore {
  list(): Promise<Agenda[]>;
  /** Writes the agenda as given, stamping `updatedAt`. */
  save(agenda: Agenda): Promise<Agenda>;
  /** Deletes an agenda and any file no other agenda still uses. */
  remove(agendaId: string): Promise<void>;
  removeItem(agenda: Agenda, itemId: string): Promise<Agenda>;
  /**
   * Stores a file and appends the item that refers to it — file first, then
   * the agenda, and the file is taken back out if the agenda write fails, so a
   * full disk never leaves a half-saved item behind.
   */
  addFileItem(agenda: Agenda, blob: Blob, build: (fileId: string) => AgendaItem): Promise<Agenda>;
  getFile(fileId: string): Promise<StoredFile | undefined>;
}

export function openAgendaStore(factory: IDBFactory = indexedDB): AgendaStore {
  let opening: Promise<IDBDatabase> | null = null;
  const db = () => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(AGENDAS, { keyPath: 'id' });
        req.result.createObjectStore(FILES, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { opening = null; reject(req.error); };
    });
    return opening;
  };

  const list = async (): Promise<Agenda[]> => {
    const tx = (await db()).transaction(AGENDAS);
    return sortAgendas(await request(tx.objectStore(AGENDAS).getAll() as IDBRequest<Agenda[]>));
  };

  const save = async (agenda: Agenda): Promise<Agenda> => {
    const next = { ...agenda, updatedAt: Date.now() };
    try {
      const tx = (await db()).transaction(AGENDAS, 'readwrite');
      tx.objectStore(AGENDAS).put(next);
      await finished(tx);
    } catch (error) { throw wrap(error); }
    return next;
  };

  const deleteFiles = async (ids: Iterable<string>) => {
    const tx = (await db()).transaction(FILES, 'readwrite');
    for (const id of ids) tx.objectStore(FILES).delete(id);
    await finished(tx);
  };

  /** Deletes stored files no agenda refers to any more. */
  const prune = async () => {
    const used = referencedFileIds(await list());
    const tx = (await db()).transaction(FILES);
    const keys = await request(tx.objectStore(FILES).getAllKeys()) as string[];
    const unused = keys.filter((key) => !used.has(key));
    if (unused.length) await deleteFiles(unused);
  };

  return {
    list,
    save,
    async remove(agendaId) {
      const tx = (await db()).transaction(AGENDAS, 'readwrite');
      tx.objectStore(AGENDAS).delete(agendaId);
      await finished(tx);
      await prune();
    },
    async removeItem(agenda, itemId) {
      const saved = await save({ ...agenda, items: agenda.items.filter((item) => item.id !== itemId) });
      await prune();
      return saved;
    },
    async addFileItem(agenda, blob, build) {
      const fileId = newId();
      try {
        const tx = (await db()).transaction(FILES, 'readwrite');
        tx.objectStore(FILES).put({ id: fileId, blob, type: blob.type, size: blob.size } satisfies StoredFile);
        await finished(tx);
      } catch (error) { throw wrap(error); }
      try {
        return await save({ ...agenda, items: [...agenda.items, build(fileId)] });
      } catch (error) {
        await deleteFiles([fileId]).catch(() => undefined);
        throw wrap(error);
      }
    },
    async getFile(fileId) {
      const tx = (await db()).transaction(FILES);
      return request(tx.objectStore(FILES).get(fileId) as IDBRequest<StoredFile | undefined>);
    },
  };
}
```

- [ ] **Step 4: 執行，確認通過**

Run: `npx vitest run meeting/agenda`
Expected: PASS

- [ ] **Step 5: 檢查點** — `npx tsc --noEmit` 無輸出。

---

### Task 5: 投影片版面（純函式）與繪製

**Files:**
- Create: `meeting/agenda/slideLayout.ts`
- Test: `meeting/agenda/slideLayout.test.ts`
- Create: `meeting/agenda/slideRenderer.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest';
import { BODY_MAX_PX, BODY_MIN_PX, layoutTextSlide, wrapText, type Measure } from './slideLayout';

// Every character one em wide: easy to reason about, close enough to CJK.
const measure: Measure = (text, px) => text.length * px;

describe('wrapText', () => {
  it('breaks Chinese anywhere and English between words', () => {
    expect(wrapText('神愛世人甚至將他的獨生子', 5 * 10, 10, measure)).toEqual(['神愛世人甚', '至將他的獨', '生子']);
    expect(wrapText('for God so loved', 9 * 10, 10, measure)).toEqual(['for God', 'so loved']);
  });

  it('keeps paragraph breaks and never starts a line with closing punctuation', () => {
    expect(wrapText('第一行\n\n第三行', 100, 10, measure)).toEqual(['第一行', '', '第三行']);
    expect(wrapText('一二三四，五', 4 * 10, 10, measure)).toEqual(['一二三四，', '五']);
  });
});

describe('layoutTextSlide', () => {
  it('uses the full body size when the text fits', () => {
    const layout = layoutTextSlide('本週代禱事項', '王弟兄的母親週四手術', measure);
    expect(layout.bodyPx).toBe(BODY_MAX_PX);
    expect(layout.overflow).toBe(false);
  });

  it('shrinks long text, and says so when even the smallest size overflows', () => {
    const medium = layoutTextSlide('', '字'.repeat(400), measure);
    expect(medium.bodyPx).toBeLessThan(BODY_MAX_PX);
    expect(medium.overflow).toBe(false);
    const huge = layoutTextSlide('', '字'.repeat(4000), measure);
    expect(huge.bodyPx).toBe(BODY_MIN_PX);
    expect(huge.overflow).toBe(true);
  });
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run meeting/agenda/slideLayout.test.ts`
Expected: FAIL — `Cannot find module './slideLayout'`。

- [ ] **Step 3: 實作版面**

`meeting/agenda/slideLayout.ts`：

```ts
/** A 1080p slide, sized for being read on a phone after it is scaled down. */
export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;
export const MARGIN_X = 154; // 8%
export const MARGIN_Y = 110;
export const FOOTER_SPACE = 70;
export const TITLE_PX = 72;
export const BODY_MAX_PX = 48;
export const BODY_MIN_PX = 32;
export const LINE_HEIGHT = 1.7;
export const TITLE_GAP = 44;

/** Width of `text` at `px` pixels. The canvas supplies the real one. */
export type Measure = (text: string, px: number) => number;

const CJK = '\\u2e80-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef\\u3000-\\u303f';
const TOKEN = new RegExp(`[${CJK}]|[^\\s${CJK}]+\\s*|\\s+`, 'g');
/** Punctuation that may not begin a line (禁則). */
const CLOSING = /^[，。、；：！？）」』》〉,.;:!?)\]]/;

export function wrapText(text: string, maxWidth: number, px: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const token of paragraph.match(TOKEN) ?? []) {
      const candidate = line + token;
      if (line && measure(candidate.trimEnd(), px) > maxWidth && !CLOSING.test(token)) {
        lines.push(line.trimEnd());
        line = token.trimStart();
      } else {
        line = candidate;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export interface TextSlideLayout {
  titleLines: string[];
  bodyLines: string[];
  bodyPx: number;
  /** True when even the smallest size runs off the slide — suggest splitting. */
  overflow: boolean;
}

export function layoutTextSlide(title: string, body: string, measure: Measure): TextSlideLayout {
  const width = SLIDE_WIDTH - 2 * MARGIN_X;
  const available = SLIDE_HEIGHT - 2 * MARGIN_Y - FOOTER_SPACE;
  const titleLines = title.trim() ? wrapText(title.trim(), width, TITLE_PX, measure) : [];
  const titleHeight = titleLines.length ? titleLines.length * TITLE_PX * 1.3 + TITLE_GAP : 0;
  const trimmed = body.trim();
  for (let px = BODY_MAX_PX; px >= BODY_MIN_PX; px -= 2) {
    const bodyLines = trimmed ? wrapText(trimmed, width, px, measure) : [];
    if (titleHeight + bodyLines.length * px * LINE_HEIGHT <= available) {
      return { titleLines, bodyLines, bodyPx: px, overflow: false };
    }
  }
  return { titleLines, bodyLines: wrapText(trimmed, width, BODY_MIN_PX, measure), bodyPx: BODY_MIN_PX, overflow: true };
}
```

- [ ] **Step 4: 執行，確認通過**

Run: `npx vitest run meeting/agenda/slideLayout.test.ts`
Expected: PASS

- [ ] **Step 5: 實作繪製（瀏覽器專用，無單元測試）**

`meeting/agenda/slideRenderer.ts`：

```ts
import {
  FOOTER_SPACE, LINE_HEIGHT, MARGIN_X, MARGIN_Y, SLIDE_HEIGHT, SLIDE_WIDTH, TITLE_GAP, TITLE_PX,
  layoutTextSlide, type Measure, type TextSlideLayout,
} from './slideLayout';

export const SLIDE_FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';

export function createSlideCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SLIDE_WIDTH;
  canvas.height = SLIDE_HEIGHT;
  return canvas;
}

export function canvasMeasure(ctx: CanvasRenderingContext2D, weight = 400): Measure {
  return (text, px) => { ctx.font = `${weight} ${px}px ${SLIDE_FONT}`; return ctx.measureText(text).width; };
}

function paintFooter(ctx: CanvasRenderingContext2D, footer: string) {
  ctx.font = `400 26px ${SLIDE_FONT}`;
  ctx.fillStyle = 'rgba(241, 245, 249, 0.55)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(footer, SLIDE_WIDTH - MARGIN_X, SLIDE_HEIGHT - 50);
  ctx.textAlign = 'left';
}

/** Deep blue, like a sanctuary screen. Returns the layout so a caller can warn on overflow. */
export function drawTextSlide(canvas: HTMLCanvasElement, slide: { title: string; body: string; footer: string }): TextSlideLayout {
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  gradient.addColorStop(0, '#0f2a5c');
  gradient.addColorStop(1, '#1e3a8a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);

  const layout = layoutTextSlide(slide.title, slide.body, canvasMeasure(ctx));
  const titleHeight = layout.titleLines.length ? layout.titleLines.length * TITLE_PX * 1.3 + TITLE_GAP : 0;
  const bodyHeight = layout.bodyLines.length * layout.bodyPx * LINE_HEIGHT;
  const area = SLIDE_HEIGHT - 2 * MARGIN_Y - FOOTER_SPACE;
  // Short slides sit in the middle; full ones start at the top margin.
  let y = MARGIN_Y + Math.max(0, (area - titleHeight - bodyHeight) / 2);
  ctx.textBaseline = 'top';

  ctx.font = `700 ${TITLE_PX}px ${SLIDE_FONT}`;
  ctx.fillStyle = '#fde68a';
  for (const line of layout.titleLines) { ctx.fillText(line, MARGIN_X, y); y += TITLE_PX * 1.3; }
  if (layout.titleLines.length) y += TITLE_GAP;

  ctx.font = `400 ${layout.bodyPx}px ${SLIDE_FONT}`;
  ctx.fillStyle = '#f1f5f9';
  const lineStep = layout.bodyPx * LINE_HEIGHT;
  for (const line of layout.bodyLines) {
    if (y + lineStep > SLIDE_HEIGHT - MARGIN_Y) break;
    ctx.fillText(line, MARGIN_X, y + (lineStep - layout.bodyPx) / 2);
    y += lineStep;
  }
  paintFooter(ctx, slide.footer);
  return layout;
}

export function drawImageSlide(
  canvas: HTMLCanvasElement,
  slide: { image: CanvasImageSource & { width: number; height: number }; caption: string; footer: string },
): void {
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  const captionSpace = slide.caption.trim() ? 90 : 0;
  const boxW = SLIDE_WIDTH - 120;
  const boxH = SLIDE_HEIGHT - 120 - captionSpace - FOOTER_SPACE / 2;
  const scale = Math.min(boxW / slide.image.width, boxH / slide.image.height);
  const w = slide.image.width * scale;
  const h = slide.image.height * scale;
  const x = (SLIDE_WIDTH - w) / 2;
  const y = 60 + (boxH - h) / 2;
  ctx.drawImage(slide.image, x, y, w, h);
  if (captionSpace) {
    ctx.font = `500 44px ${SLIDE_FONT}`;
    ctx.fillStyle = '#f1f5f9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(slide.caption.trim(), SLIDE_WIDTH / 2, y + h + 26, SLIDE_WIDTH - 2 * MARGIN_X);
    ctx.textAlign = 'left';
  }
  paintFooter(ctx, slide.footer);
}
```

- [ ] **Step 6: 檢查點** — `npx tsc --noEmit` 無輸出。

---

### Task 6: 圖片處理

**Files:**
- Create: `meeting/agenda/imageFile.ts`

- [ ] **Step 1: 實作（瀏覽器專用）**

```ts
import { MAX_IMAGE_EDGE } from './types';

export class ImageDecodeError extends Error {
  constructor() { super('This file is not an image the browser can open'); this.name = 'ImageDecodeError'; }
}

/**
 * The image as it will be stored: decoded once to prove it opens, and scaled
 * down when its longest side is over 3840px — a phone photo is several times
 * what a 1080p slide can show, and would only slow the slide down.
 */
export async function prepareImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new ImageDecodeError(); }
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= MAX_IMAGE_EDGE) return file;
    const scale = MAX_IMAGE_EDGE / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
    if (!blob) throw new ImageDecodeError();
    return blob;
  } finally {
    bitmap.close();
  }
}
```

- [ ] **Step 2: 檢查點** — `npx tsc --noEmit` 無輸出。

---

### Task 7: LiveKit 投影片軌道

**Files:**
- Modify: `services/livekitService.ts`
- Test: `services/livekitService.test.ts`
- Modify: `hooks/useLiveKit.ts`

- [ ] **Step 1: 寫失敗的測試**（加在 `describe('LiveKitService.isPlayingVideoFile'` 內，並在檔案 import 加入 `SLIDE_TRACK_NAME`）

```ts
  it('treats a presented slide like a broadcast video, not a screen', () => {
    const p = participant({ video: [{ track: {}, source: Track.Source.ScreenShare, trackName: SLIDE_TRACK_NAME }] });
    expect(LiveKitService.isPlayingVideoFile(p)).toBe(true);
    expect(LiveKitService.isSharingSlide(p)).toBe(true);
    expect(LiveKitService.isSharingSlide(participant({ video: [{ track: {}, source: Track.Source.ScreenShare, trackName: VIDEO_FILE_TRACK_NAME }] }))).toBe(false);
  });
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run services/livekitService.test.ts`
Expected: FAIL — `SLIDE_TRACK_NAME` 未匯出。

- [ ] **Step 3: 實作 service**

在 `VIDEO_FILE_TRACK_NAME` 之後：

```ts
/** Track name for a 聚會內容 slide (text or image drawn on a canvas). */
export const SLIDE_TRACK_NAME = 'meeting-slide';
/** Shares that are media the page plays itself, as opposed to a captured screen. */
const MEDIA_SHARE_TRACK_NAMES = new Set([VIDEO_FILE_TRACK_NAME, SLIDE_TRACK_NAME]);
```

類別欄位（`videoFileTracks` 旁）：`private slideTrack: MediaStreamTrack | null = null;`，並在 `disconnect()` 內加 `this.slideTrack = null;`。

`unpublishVideoFile` 之後新增：

```ts
  /**
   * Publishes a canvas as the room's shared picture. The canvas keeps being
   * redrawn for the next slide; the track stays the same, so switching slides
   * is instant and never re-negotiates.
   */
  async publishSlide(canvas: HTMLCanvasElement): Promise<void> {
    const p = this.room?.localParticipant;
    if (!p || this.slideTrack) return;
    // One frame a second is plenty for a still picture, and keeps a late
    // joiner from waiting on a black tile.
    const [track] = canvas.captureStream(1).getVideoTracks();
    if (!track) throw new Error('This browser cannot present slides');
    track.contentHint = 'detail';
    this.slideTrack = track;
    await p.publishTrack(track, {
      source: Track.Source.ScreenShare,
      name: SLIDE_TRACK_NAME,
      simulcast: false,
      screenShareEncoding: { maxBitrate: 2_500_000, maxFramerate: 5 },
      degradationPreference: 'maintain-resolution',
    });
    this.emit();
  }

  async unpublishSlide(): Promise<void> {
    const p = this.room?.localParticipant;
    const track = this.slideTrack;
    this.slideTrack = null;
    if (!p || !track) return;
    try { await p.unpublishTrack(track, true); } catch { /* already gone */ }
    this.emit();
  }
```

`isPlayingVideoFile` 的條件改用 `MEDIA_SHARE_TRACK_NAMES.has(p.trackName)`，並在其後新增：

```ts
  static isSharingSlide(participant: Participant): boolean {
    return [...participant.videoTrackPublications.values()]
      .some((p) => p.track && !p.isMuted && p.source === Track.Source.ScreenShare && p.trackName === SLIDE_TRACK_NAME);
  }
```

- [ ] **Step 4: 執行，確認通過**

Run: `npx vitest run services/livekitService.test.ts`
Expected: PASS

- [ ] **Step 5: `useLiveKit` 暴露 startSlide／stopSlide**

介面 `UseLiveKit` 加：

```ts
  /** Present a canvas to the room (聚會內容). Resolves false if the slot is taken. */
  startSlide: (canvas: HTMLCanvasElement) => Promise<boolean>;
  stopSlide: () => Promise<void>;
  /** True while this participant is presenting a slide. */
  slideOn: boolean;
```

`stopVideoFile` 之後：

```ts
  const slideOn = participants.some((p) => p.isLocal && LiveKitService.isSharingSlide(p));

  const startSlide = useCallback(async (canvas: HTMLCanvasElement): Promise<boolean> => {
    const svc = serviceRef.current;
    if (!svc) return false;
    // A host's claim clears the other side; the check here only guards our own screen share.
    if (svc.localParticipant?.isScreenShareEnabled && !slideOn) {
      setError(t('meeting.screenShareBusy'));
      return false;
    }
    try {
      await svc.publishSlide(canvas);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [slideOn, t]);

  const stopSlide = useCallback(async () => {
    await serviceRef.current?.unpublishSlide().catch(() => undefined);
  }, []);
```

return 物件加入 `startSlide, stopSlide, slideOn`。

- [ ] **Step 6: 檢查點** — `npx tsc --noEmit` 無輸出；`npx vitest run services` 全過。

---

### Task 8: 會議中的分享狀態（hook）

**Files:**
- Create: `hooks/useAgendaPresenter.ts`

- [ ] **Step 1: 實作**

```ts
import { useCallback, useMemo, useRef, useState } from 'react';
import type { UseLiveKit } from './useLiveKit';
import type { RoomVideo } from './useRoomVideo';
import type { BibleSync } from './useBibleSync';
import type { HostMessage } from '../meeting/chatProtocol';
import type { AgendaItem } from '../meeting/agenda/types';
import type { AgendaStore } from '../meeting/agenda/agendaStore';
import { neighbourItem } from '../meeting/agenda/agendaModel';
import { createSlideCanvas, drawImageSlide, drawTextSlide } from '../meeting/agenda/slideRenderer';

interface PresenterDeps {
  lk: UseLiveKit;
  roomVideo: RoomVideo;
  bible: BibleSync;
  store: AgendaStore;
  /** The room's local-video broadcast, owned by MeetingRoomView. */
  videoFile: File | null;
  setVideoFile: (file: File | null) => void;
  onHostCommand: (message: HostMessage) => void;
  /** Bottom-right text on every slide. */
  footer: string;
  onError: (message: string) => void;
}

export interface AgendaPresenter {
  /** The item on everyone's screen right now, or null. */
  activeId: string | null;
  share: (item: AgendaItem) => Promise<void>;
  stop: () => Promise<void>;
  step: (items: readonly AgendaItem[], delta: 1 | -1) => Promise<void>;
}

/**
 * Puts one 聚會內容 item at a time in front of the room.
 *
 * What is "active" is re-derived from the channels themselves — the slide
 * track, the broadcast file, the room video, the Bible — rather than trusted
 * from a remembered id, so a dropped connection or someone else taking the
 * slot can never leave a row marked as sharing when it is not.
 */
export function useAgendaPresenter(deps: PresenterDeps): AgendaPresenter {
  const { lk, roomVideo, bible, store, videoFile, setVideoFile, onHostCommand, footer, onError } = deps;
  const [current, setCurrent] = useState<AgendaItem | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvas = () => (canvasRef.current ??= createSlideCanvas());

  const activeId = useMemo(() => {
    if (!current) return null;
    switch (current.kind) {
      case 'text':
      case 'image':
        return lk.slideOn ? current.id : null;
      case 'localVideo':
        return videoFile ? current.id : null;
      case 'youtube':
        return roomVideo.videoId === current.videoId ? current.id : null;
      case 'scripture':
        return bible.open && bible.highlight?.bookId === current.bookId && bible.highlight.chapter === current.chapter
          && bible.highlight.from === current.fromVerse ? current.id : null;
      default:
        return null;
    }
  }, [current, lk.slideOn, videoFile, roomVideo.videoId, bible.open, bible.highlight]);

  /** Clears the shared-picture slot of whatever this host put there. */
  const clearSlot = useCallback(async (keep: 'slide' | null) => {
    if (keep !== 'slide' && lk.slideOn) await lk.stopSlide();
    if (videoFile) { setVideoFile(null); await lk.stopVideoFile(); }
    if (roomVideo.videoId !== null && roomVideo.canLead) roomVideo.close();
  }, [lk, videoFile, setVideoFile, roomVideo]);

  const share = useCallback(async (item: AgendaItem) => {
    try {
      if (item.kind === 'scripture') {
        await clearSlot(null);
        bible.selectChapter(item.bookId, item.chapter, { from: item.fromVerse, to: item.toVerse });
      } else if (item.kind === 'text' || item.kind === 'image') {
        await clearSlot('slide');
        if (item.kind === 'text') {
          drawTextSlide(canvas(), { title: item.title, body: item.body, footer });
        } else {
          const file = await store.getFile(item.fileId);
          if (!file) throw new Error('missing');
          const image = await createImageBitmap(file.blob);
          drawImageSlide(canvas(), { image, caption: item.title, footer });
          image.close();
        }
        if (!lk.slideOn) {
          onHostCommand({ type: 'host', action: 'claimShare' });
          if (!(await lk.startSlide(canvas()))) return;
        }
      } else if (item.kind === 'youtube') {
        await clearSlot(null);
        onHostCommand({ type: 'host', action: 'claimShare' });
        roomVideo.open(item.videoId, item.startSeconds);
      } else if (item.kind === 'localVideo') {
        await clearSlot(null);
        const file = await store.getFile(item.fileId);
        if (!file) throw new Error('missing');
        onHostCommand({ type: 'host', action: 'claimShare' });
        setVideoFile(new File([file.blob], item.fileName, { type: file.type }));
      }
      setCurrent(item);
    } catch {
      onError('meeting.agendaShareFailed');
    }
  }, [bible, clearSlot, footer, lk, onError, onHostCommand, roomVideo, setVideoFile, store]);

  const stop = useCallback(async () => {
    if (current?.kind === 'scripture') bible.close();
    await clearSlot(null);
    setCurrent(null);
  }, [bible, clearSlot, current]);

  const step = useCallback(async (items: readonly AgendaItem[], delta: 1 | -1) => {
    const next = neighbourItem(items, activeId ?? current?.id ?? null, delta);
    if (next) await share(next);
  }, [activeId, current, share]);

  return { activeId, share, stop, step };
}
```

`HostMessage` 的 `claimShare` 形狀：先 `grep -n "claimShare" meeting/chatProtocol.ts` 確認為 `{ type: 'host'; action: 'claimShare' }`（`MeetingRoomView` 已這樣呼叫）。`onError` 收到的是翻譯鍵，由呼叫端 `t()`。

- [ ] **Step 2: 檢查點** — `npx tsc --noEmit` 無輸出。

---

### Task 9: 翻譯字串

**Files:**
- Modify: `constants/translations.ts`（`meeting` 區塊內，`reconnecting:` 之前）

- [ ] **Step 1: 新增**

```ts
    agendaTitle: { en: 'Meeting content', zh: '聚會內容' },
    tagAgenda: { en: 'Content', zh: '內容' },
    agendaNew: { en: 'New content', zh: '新增一份' },
    agendaUntitled: { en: 'New meeting content', zh: '新的聚會內容' },
    agendaCopySuffix: { en: ' (copy)', zh: '（副本）' },
    agendaDuplicate: { en: 'Duplicate', zh: '複製' },
    agendaDelete: { en: 'Delete', zh: '刪除' },
    agendaDeleteConfirm: { en: 'Delete this content and everything in it?', zh: '要刪除這份內容與其中所有項目嗎？' },
    agendaNotePlaceholder: { en: 'Note, e.g. group name', zh: '備註，例如小組名稱' },
    agendaEmpty: { en: 'No content yet. Add text, images, verses or videos below.', zh: '還沒有項目，用下方按鈕加入文字、圖片、經文或影片。' },
    agendaNothing: { en: 'Nothing prepared yet', zh: '還沒有準備內容' },
    agendaOpenEditor: { en: 'Open the editor', zh: '前往編輯' },
    agendaLocalOnly: { en: 'Stored only in this browser on this computer', zh: '內容只存在這台電腦的瀏覽器裡' },
    agendaUsage: { en: 'Used {size}', zh: '已使用 {size}' },
    agendaAddText: { en: 'Text', zh: '文字' },
    agendaAddImage: { en: 'Image', zh: '圖片' },
    agendaAddScripture: { en: 'Verses', zh: '經文' },
    agendaAddVideo: { en: 'Video', zh: '影片' },
    agendaItemTitle: { en: 'Title (optional)', zh: '標題（選填）' },
    agendaItemBody: { en: 'Text to show', zh: '要顯示的文字' },
    agendaTooLong: { en: 'This is too long for one slide — consider splitting it in two.', zh: '內容太長，建議分成兩項。' },
    agendaVideoYouTube: { en: 'YouTube', zh: 'YouTube' },
    agendaVideoLocal: { en: 'Video file', zh: '本機影片' },
    agendaYouTubeLink: { en: 'Paste a YouTube link', zh: '貼上 YouTube 連結' },
    agendaYouTubeInvalid: { en: 'That is not a YouTube link.', zh: '這不是 YouTube 連結。' },
    agendaStartAt: { en: 'Start at (seconds)', zh: '從第幾秒開始' },
    agendaVideoTooBig: { en: 'Videos over 2 GB cannot be stored.', zh: '影片超過 2GB，無法存入。' },
    agendaImageInvalid: { en: 'This image cannot be opened.', zh: '這張圖片無法開啟。' },
    agendaStorageFull: { en: 'Not enough space on this computer.', zh: '空間不足。' },
    agendaSaveFailed: { en: 'Could not save.', zh: '無法儲存。' },
    agendaShare: { en: 'Share', zh: '分享' },
    agendaSharing: { en: 'Sharing', zh: '分享中' },
    agendaStop: { en: 'Stop', zh: '停止' },
    agendaPrev: { en: 'Previous', zh: '上一項' },
    agendaNext: { en: 'Next', zh: '下一項' },
    agendaShareFailed: { en: 'Could not share this item.', zh: '無法分享這一項。' },
    agendaBook: { en: 'Book', zh: '書卷' },
    agendaChapter: { en: 'Chapter {n}', zh: '第 {n} 章' },
    agendaVerseTo: { en: 'to', zh: '至' },
    agendaDone: { en: 'Done', zh: '完成' },
    agendaEdit: { en: 'Edit', zh: '編輯' },
    agendaRemoveItem: { en: 'Remove', zh: '移除' },
    agendaMove: { en: 'Drag to reorder', zh: '拖曳排序' },
```

- [ ] **Step 2: 檢查點** — `npx tsc --noEmit` 無輸出。

---

### Task 10: 經文選擇器

**Files:**
- Create: `components/meeting/agenda/ScripturePicker.tsx`

- [ ] **Step 1: 實作**

```tsx
import React, { useEffect, useState } from 'react';
import { BIBLE_BOOKS, findBibleBook, localizeBookName } from '../../../constants/bibleBooks';
import { useLocalization } from '../../../hooks/useLocalization';
import { BibleService } from '../../../services/bibleService';
import type { ScriptureItem } from '../../../meeting/agenda/types';

type Range = Pick<ScriptureItem, 'bookId' | 'chapter' | 'fromVerse' | 'toVerse'>;

const select = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none';

/** 書卷 ▾ 第 N 章 ▾ 起 ▾ 至 迄 ▾, with the verses previewed as they are chosen. */
export const ScripturePicker: React.FC<{ value: Range; onChange: (next: Range) => void }> = ({ value, onChange }) => {
  const { language, t } = useLocalization();
  const [verses, setVerses] = useState<string[]>([]);
  const book = findBibleBook(value.bookId) ?? BIBLE_BOOKS[0];

  useEffect(() => {
    let cancelled = false;
    BibleService.loadChapter(value.bookId, value.chapter)
      .then((text) => { if (!cancelled) setVerses(text); })
      .catch(() => { if (!cancelled) setVerses([]); });
    return () => { cancelled = true; };
  }, [value.bookId, value.chapter]);

  // A chapter change can leave the range past its end; pull it back in.
  useEffect(() => {
    if (!verses.length) return;
    const from = Math.min(value.fromVerse, verses.length);
    const to = Math.min(Math.max(value.toVerse, from), verses.length);
    if (from !== value.fromVerse || to !== value.toVerse) onChange({ ...value, fromVerse: from, toVerse: to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verses]);

  const numbers = (from: number) => Array.from({ length: Math.max(verses.length - from + 1, 0) }, (_, i) => from + i);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t('meeting.agendaBook')} className={select} value={value.bookId}
          onChange={(e) => onChange({ bookId: Number(e.target.value), chapter: 1, fromVerse: 1, toVerse: 1 })}>
          {BIBLE_BOOKS.map((b) => <option key={b.id} value={b.id}>{localizeBookName(b, language)}</option>)}
        </select>
        <select className={select} value={value.chapter}
          onChange={(e) => onChange({ ...value, chapter: Number(e.target.value), fromVerse: 1, toVerse: 1 })}>
          {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{t('meeting.agendaChapter').replace('{n}', String(n))}</option>
          ))}
        </select>
        <select className={select} value={value.fromVerse}
          onChange={(e) => { const from = Number(e.target.value); onChange({ ...value, fromVerse: from, toVerse: Math.max(from, value.toVerse) }); }}>
          {numbers(1).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="text-sm text-gray-500">{t('meeting.agendaVerseTo')}</span>
        <select className={select} value={value.toVerse}
          onChange={(e) => onChange({ ...value, toVerse: Number(e.target.value) })}>
          {numbers(value.fromVerse).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {verses.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg border-l-4 border-blue-300 bg-white px-3 py-2 text-sm leading-relaxed text-gray-700">
          {verses.slice(value.fromVerse - 1, value.toVerse).map((text, i) => (
            <p key={i}><sup className="mr-1 font-semibold text-blue-600">{value.fromVerse + i}</sup>{text}</p>
          ))}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: 檢查點** — `npx tsc --noEmit` 無輸出。

---

### Task 11: 單一項目編輯

**Files:**
- Create: `components/meeting/agenda/AgendaItemEditor.tsx`

- [ ] **Step 1: 實作**

```tsx
import React, { useMemo } from 'react';
import { useLocalization } from '../../../hooks/useLocalization';
import type { AgendaItem } from '../../../meeting/agenda/types';
import { layoutTextSlide } from '../../../meeting/agenda/slideLayout';
import { canvasMeasure } from '../../../meeting/agenda/slideRenderer';
import { parseYouTubeStart, parseYouTubeVideoId } from '../../../meeting/youtube';
import { ScripturePicker } from './ScripturePicker';

const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

/** The fields of one item, edited in place in its row. Every change saves. */
export const AgendaItemEditor: React.FC<{ item: AgendaItem; onChange: (next: AgendaItem) => void }> = ({ item, onChange }) => {
  const { t } = useLocalization();

  // Measured with the slide's own font, so the warning matches what the room will see.
  const tooLong = useMemo(() => {
    if (item.kind !== 'text') return false;
    const ctx = document.createElement('canvas').getContext('2d');
    return ctx ? layoutTextSlide(item.title, item.body, canvasMeasure(ctx)).overflow : false;
  }, [item]);

  if (item.kind === 'text') {
    return (
      <div className="space-y-2">
        <input className={input} value={item.title} placeholder={t('meeting.agendaItemTitle')}
          onChange={(e) => onChange({ ...item, title: e.target.value })} />
        <textarea className={`${input} min-h-28`} value={item.body} placeholder={t('meeting.agendaItemBody')}
          onChange={(e) => onChange({ ...item, body: e.target.value })} />
        {tooLong && <p className="text-xs font-medium text-amber-700">{t('meeting.agendaTooLong')}</p>}
      </div>
    );
  }
  if (item.kind === 'image' || item.kind === 'localVideo') {
    return (
      <input className={input} value={item.title} placeholder={t('meeting.agendaItemTitle')}
        onChange={(e) => onChange({ ...item, title: e.target.value })} />
    );
  }
  if (item.kind === 'scripture') {
    return <ScripturePicker value={item} onChange={(range) => onChange({ ...item, ...range })} />;
  }
  return (
    <div className="space-y-2">
      <input className={input} value={item.title} placeholder={t('meeting.agendaItemTitle')}
        onChange={(e) => onChange({ ...item, title: e.target.value })} />
      <label className="flex items-center gap-2 text-sm text-gray-600">
        {t('meeting.agendaStartAt')}
        <input type="number" min={0} className={`${input} w-28`} value={item.startSeconds}
          onChange={(e) => onChange({ ...item, startSeconds: Math.max(0, Number(e.target.value) || 0) })} />
      </label>
    </div>
  );
};

/** Reads a pasted link into a YouTube item's fields, or null when it is not one. */
export function youTubeFromLink(link: string): { videoId: string; startSeconds: number } | null {
  const videoId = parseYouTubeVideoId(link);
  return videoId ? { videoId, startSeconds: parseYouTubeStart(link) ?? 0 } : null;
}
```

- [ ] **Step 2: 檢查點** — `npx tsc --noEmit` 無輸出。

---

### Task 12: 編輯畫面（左右兩欄）

**Files:**
- Create: `components/meeting/agenda/AgendaEditor.tsx`

- [ ] **Step 1: 實作**

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Copy, FileVideo, GripVertical, Image as ImageIcon, Pencil, Plus, Trash2, Type, X, Youtube } from 'lucide-react';
import { useLocalization } from '../../../hooks/useLocalization';
import { churchConfirm } from '../../ChurchDialog';
import { AgendaStoreError, type AgendaStore } from '../../../meeting/agenda/agendaStore';
import { duplicateAgenda, itemLabel, moveItem, newAgenda, newId } from '../../../meeting/agenda/agendaModel';
import { MAX_VIDEO_BYTES, type Agenda, type AgendaItem, type AgendaItemKind } from '../../../meeting/agenda/types';
import { ImageDecodeError, prepareImage } from '../../../meeting/agenda/imageFile';
import { AgendaItemEditor, youTubeFromLink } from './AgendaItemEditor';

export const KIND_ICON: Record<AgendaItemKind, React.ReactNode> = {
  text: <Type size={16} />,
  image: <ImageIcon size={16} />,
  scripture: <BookOpen size={16} />,
  youtube: <Youtube size={16} />,
  localVideo: <FileVideo size={16} />,
};

export function useItemFallbacks() {
  const { t } = useLocalization();
  return { text: t('meeting.agendaAddText'), image: t('meeting.agendaAddImage'), youtube: 'YouTube', localVideo: t('meeting.agendaVideoLocal') };
}

const formatBytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`);

/**
 * 聚會內容 — prepared ahead, on this computer only. Left: every saved agenda,
 * latest meeting first. Right: the chosen one, edited in place; every change
 * is saved as it is made (text after a short pause).
 */
export const AgendaEditor: React.FC<{ store: AgendaStore; onClose: () => void }> = ({ store, onClose }) => {
  const { language, t } = useLocalization();
  const fallbacks = useItemFallbacks();
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [usage, setUsage] = useState<number | null>(null);
  const [videoTab, setVideoTab] = useState<'youtube' | 'local' | null>(null);
  const [link, setLink] = useState('');
  const dragFrom = useRef<number | null>(null);
  const saveTimer = useRef<number>();
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const selected = agendas.find((a) => a.id === selectedId) ?? null;

  const refreshUsage = useCallback(() => {
    void navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? null)).catch(() => undefined);
  }, []);

  useEffect(() => {
    void store.list().then((list) => { setAgendas(list); setSelectedId(list[0]?.id ?? null); });
    refreshUsage();
  }, [store, refreshUsage]);

  const fail = (error: unknown) => {
    setMessage(t(error instanceof AgendaStoreError && error.reason === 'quota' ? 'meeting.agendaStorageFull' : 'meeting.agendaSaveFailed'));
  };
  const replace = (saved: Agenda) => setAgendas((list) => list.map((a) => (a.id === saved.id ? saved : a)));

  /** Updates the screen at once; writes after 400ms of quiet so typing is not a write per key. */
  const update = (next: Agenda) => {
    replace(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void store.save(next).catch(fail); }, 400);
  };
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const addAgenda = async () => {
    try {
      const created = await store.save(newAgenda(new Date(), t('meeting.agendaUntitled')));
      setAgendas((list) => [created, ...list]);
      setSelectedId(created.id);
    } catch (e) { fail(e); }
  };

  const duplicate = async () => {
    if (!selected) return;
    try {
      const copy = await store.save(duplicateAgenda(selected, new Date(), t('meeting.agendaCopySuffix')));
      setAgendas((list) => [copy, ...list]);
      setSelectedId(copy.id);
    } catch (e) { fail(e); }
  };

  const removeAgenda = async () => {
    if (!selected) return;
    const ok = await churchConfirm(t('meeting.agendaDeleteConfirm'), {
      confirmLabel: t('meeting.agendaDelete'), cancelLabel: t('meeting.cancel'),
    });
    if (!ok) return;
    await store.remove(selected.id);
    const rest = agendas.filter((a) => a.id !== selected.id);
    setAgendas(rest);
    setSelectedId(rest[0]?.id ?? null);
    refreshUsage();
  };

  const addItem = (item: AgendaItem) => {
    if (!selected) return;
    update({ ...selected, items: [...selected.items, item] });
    setOpenItemId(item.id);
  };

  const removeItem = async (itemId: string) => {
    if (!selected) return;
    window.clearTimeout(saveTimer.current);
    try { replace(await store.removeItem(selected, itemId)); refreshUsage(); } catch (e) { fail(e); }
  };

  const addFile = async (file: File, kind: 'image' | 'localVideo') => {
    if (!selected) return;
    setMessage('');
    try {
      if (kind === 'localVideo' && file.size > MAX_VIDEO_BYTES) { setMessage(t('meeting.agendaVideoTooBig')); return; }
      const blob = kind === 'image' ? await prepareImage(file) : file;
      const title = file.name.replace(/\.[^.]+$/, '');
      window.clearTimeout(saveTimer.current);
      const saved = await store.addFileItem(selected, blob, (fileId) => (kind === 'image'
        ? { id: newId(), kind: 'image', title, fileId }
        : { id: newId(), kind: 'localVideo', title, fileId, fileName: file.name, size: file.size }));
      replace(saved);
      refreshUsage();
    } catch (e) {
      if (e instanceof ImageDecodeError) setMessage(t('meeting.agendaImageInvalid'));
      else fail(e);
    }
  };

  const addYouTube = () => {
    const parsed = youTubeFromLink(link);
    if (!parsed) { setMessage(t('meeting.agendaYouTubeInvalid')); return; }
    addItem({ id: newId(), kind: 'youtube', title: 'YouTube', ...parsed });
    setLink('');
    setVideoTab(null);
    setMessage('');
  };

  const addButton = 'flex items-center gap-1.5 rounded-lg border border-dashed border-blue-300 bg-blue-50/60 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="flex h-full max-h-[860px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-5">
          <h2 className="text-base font-bold text-gray-900">{t('meeting.agendaTitle')}</h2>
          <button type="button" onClick={onClose} aria-label={t('meeting.close')} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X size={20} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-56 shrink-0 flex-col border-r border-gray-100 bg-gray-50/80">
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {agendas.map((a) => (
                <button key={a.id} type="button" onClick={() => { setSelectedId(a.id); setOpenItemId(null); }}
                  className={`w-full rounded-lg px-3 py-2 text-left ${a.id === selectedId ? 'bg-white font-semibold shadow-sm ring-1 ring-gray-200' : 'hover:bg-white/70'}`}>
                  <span className="block truncate text-sm text-gray-900">{a.title}</span>
                  <span className="block truncate text-xs text-gray-400">{a.date}{a.note ? ` · ${a.note}` : ''}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void addAgenda()} className="m-2 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">
              <Plus size={16} />{t('meeting.agendaNew')}
            </button>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            {selected ? (
              <>
                <div className="shrink-0 space-y-2 border-b border-gray-100 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <input value={selected.title} onChange={(e) => update({ ...selected, title: e.target.value })}
                      className="min-w-0 flex-1 rounded-md px-1 text-lg font-bold text-gray-900 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none" />
                    <button type="button" onClick={() => void duplicate()} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"><Copy size={14} />{t('meeting.agendaDuplicate')}</button>
                    <button type="button" onClick={() => void removeAgenda()} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} />{t('meeting.agendaDelete')}</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input type="date" value={selected.date} onChange={(e) => update({ ...selected, date: e.target.value })}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-700" />
                    <input value={selected.note} placeholder={t('meeting.agendaNotePlaceholder')} onChange={(e) => update({ ...selected, note: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-700" />
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
                  {selected.items.length === 0 && <p className="py-6 text-center text-sm text-gray-400">{t('meeting.agendaEmpty')}</p>}
                  {selected.items.map((item, index) => {
                    const open = item.id === openItemId;
                    return (
                      <div key={item.id}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragFrom.current === null || dragFrom.current === index) return;
                          update({ ...selected, items: moveItem(selected.items, dragFrom.current, index) });
                          dragFrom.current = null;
                        }}
                        className={`rounded-xl border px-3 py-2.5 ${open ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
                        <div className="flex items-center gap-2">
                          <span draggable onDragStart={() => { dragFrom.current = index; }} title={t('meeting.agendaMove')}
                            className="cursor-grab text-gray-300 hover:text-gray-500"><GripVertical size={16} /></span>
                          <span className="text-gray-500">{KIND_ICON[item.kind]}</span>
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{itemLabel(item, language, fallbacks)}</span>
                          <button type="button" onClick={() => setOpenItemId(open ? null : item.id)}
                            className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">
                            {open ? t('meeting.agendaDone') : <Pencil size={14} aria-label={t('meeting.agendaEdit')} />}
                          </button>
                          <button type="button" onClick={() => void removeItem(item.id)} aria-label={t('meeting.agendaRemoveItem')}
                            className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                        </div>
                        {open && (
                          <div className="mt-3 pl-8">
                            <AgendaItemEditor item={item}
                              onChange={(next) => update({ ...selected, items: selected.items.map((i) => (i.id === next.id ? next : i)) })} />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {videoTab && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="mb-2 flex gap-1">
                        {(['youtube', 'local'] as const).map((tab) => (
                          <button key={tab} type="button" onClick={() => setVideoTab(tab)}
                            className={`rounded-md px-3 py-1 text-sm ${videoTab === tab ? 'bg-white font-semibold shadow-sm' : 'text-gray-500'}`}>
                            {t(tab === 'youtube' ? 'meeting.agendaVideoYouTube' : 'meeting.agendaVideoLocal')}
                          </button>
                        ))}
                      </div>
                      {videoTab === 'youtube' ? (
                        <div className="flex gap-2">
                          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={t('meeting.agendaYouTubeLink')}
                            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                          <button type="button" onClick={addYouTube} className="rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">{t('meeting.agendaDone')}</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => videoInput.current?.click()} className={addButton}>
                          <FileVideo size={16} />{t('meeting.agendaVideoLocal')}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" className={addButton} onClick={() => addItem({ id: newId(), kind: 'text', title: '', body: '' })}><Type size={16} />{t('meeting.agendaAddText')}</button>
                    <button type="button" className={addButton} onClick={() => imageInput.current?.click()}><ImageIcon size={16} />{t('meeting.agendaAddImage')}</button>
                    <button type="button" className={addButton} onClick={() => addItem({ id: newId(), kind: 'scripture', bookId: 43, chapter: 3, fromVerse: 16, toVerse: 16 })}><BookOpen size={16} />{t('meeting.agendaAddScripture')}</button>
                    <button type="button" className={addButton} onClick={() => setVideoTab(videoTab ? null : 'youtube')}><Youtube size={16} />{t('meeting.agendaAddVideo')}</button>
                  </div>
                  {message && <p className="text-sm font-medium text-red-600" role="alert">{message}</p>}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <button type="button" onClick={() => void addAgenda()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">
                  <Plus size={16} />{t('meeting.agendaNew')}
                </button>
              </div>
            )}
            <footer className="shrink-0 border-t border-gray-100 px-5 py-2 text-xs text-gray-400">
              {t('meeting.agendaLocalOnly')}{usage !== null ? ` · ${t('meeting.agendaUsage').replace('{size}', formatBytes(usage))}` : ''}
            </footer>
          </main>
        </div>
      </div>
      <input ref={imageInput} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addFile(f, 'image'); }} />
      <input ref={videoInput} type="file" accept="video/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setVideoTab(null); void addFile(f, 'localVideo'); } }} />
    </div>
  );
};
```

- [ ] **Step 2: 檢查點** — `npx tsc --noEmit` 無輸出。若 `useRef<number>()` 在此 React 版本需要初始值，改為 `useRef<number | undefined>(undefined)`。

---

### Task 13: 會議中的右側抽屜

**Files:**
- Create: `components/meeting/agenda/AgendaDrawer.tsx`

- [ ] **Step 1: 實作**

```tsx
import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Square } from 'lucide-react';
import { useLocalization } from '../../../hooks/useLocalization';
import type { AgendaStore } from '../../../meeting/agenda/agendaStore';
import { itemLabel, localDateString, nearestAgenda } from '../../../meeting/agenda/agendaModel';
import type { Agenda, AgendaItem } from '../../../meeting/agenda/types';
import type { AgendaPresenter } from '../../../hooks/useAgendaPresenter';
import { KIND_ICON, useItemFallbacks } from './AgendaEditor';

/** The host's list during the meeting: pick an agenda, share its items one at a time. */
export const AgendaDrawer: React.FC<{ store: AgendaStore; presenter: AgendaPresenter; onOpenEditor: () => void; reloadKey: number }> = ({
  store, presenter, onOpenEditor, reloadKey,
}) => {
  const { language, t } = useLocalization();
  const fallbacks = useItemFallbacks();
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void store.list().then((list) => {
      setAgendas(list);
      setSelectedId((id) => (id && list.some((a) => a.id === id) ? id : nearestAgenda(list, localDateString(new Date()))?.id ?? null));
    });
  }, [store, reloadKey]);

  const agenda = agendas.find((a) => a.id === selectedId) ?? null;
  const items: AgendaItem[] = agenda?.items ?? [];
  const activeIndex = items.findIndex((i) => i.id === presenter.activeId);

  return (
    <aside className="flex w-1/3 shrink-0 flex-col overflow-hidden border-l border-white/10 bg-gray-900 sm:w-80">
      <div className="shrink-0 border-b border-white/10 px-3 py-3">
        <p className="text-sm font-semibold text-gray-100">{t('meeting.agendaTitle')}</p>
        {agendas.length > 0 && (
          <select value={selectedId ?? ''} onChange={(e) => setSelectedId(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
            {agendas.map((a) => <option key={a.id} value={a.id}>{a.title}（{a.date}）</option>)}
          </select>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center text-sm text-gray-400">
            {t('meeting.agendaNothing')}
            <button type="button" onClick={onOpenEditor} className="rounded-lg bg-white/10 px-3 py-1.5 text-gray-200 hover:bg-white/20">{t('meeting.agendaOpenEditor')}</button>
          </div>
        ) : items.map((item) => {
          const active = item.id === presenter.activeId;
          return (
            <div key={item.id} className={`flex items-center gap-2 border-b border-white/5 px-3 py-2.5 ${active ? 'bg-amber-400/10 ring-2 ring-inset ring-amber-400' : ''}`}>
              <span className={active ? 'text-amber-300' : 'text-gray-400'}>{KIND_ICON[item.kind]}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-100">{itemLabel(item, language, fallbacks)}</span>
              {active ? (
                <button type="button" onClick={() => void presenter.stop()} className="flex shrink-0 items-center gap-1 rounded-md bg-amber-400 px-2 py-1 text-xs font-semibold text-gray-900">
                  <Square size={11} fill="currentColor" />{t('meeting.agendaStop')}
                </button>
              ) : (
                <button type="button" onClick={() => void presenter.share(item)} aria-label={t('meeting.agendaShare')}
                  className="flex shrink-0 items-center rounded-md px-2 py-1 text-blue-300 hover:bg-white/10 hover:text-white">
                  <Play size={15} fill="currentColor" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {items.length > 0 && (
        <div className="flex shrink-0 gap-2 border-t border-white/10 p-3">
          <button type="button" disabled={activeIndex <= 0} onClick={() => void presenter.step(items, -1)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/15 py-2 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-30">
            <ChevronLeft size={16} />{t('meeting.agendaPrev')}
          </button>
          <button type="button" disabled={activeIndex >= items.length - 1 && activeIndex !== -1} onClick={() => void presenter.step(items, 1)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/15 py-2 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-30">
            {t('meeting.agendaNext')}<ChevronRight size={16} />
          </button>
        </div>
      )}
    </aside>
  );
};
```

- [ ] **Step 2: 檢查點** — `npx tsc --noEmit` 無輸出。

---

### Task 14: 接上首頁與會議畫面

**Files:**
- Modify: `components/meeting/MeetingControlBar.tsx`
- Modify: `components/meeting/MeetingRoomView.tsx`
- Modify: `components/meeting/MeetingPage.tsx`
- Modify: `components/meeting/DesktopRoomPicker.tsx`

- [ ] **Step 1: 控制列按鈕（Host 限定）**

`MeetingControlBarProps` 加：

```ts
  /** Host only: the 聚會內容 drawer. Absent for everyone else, and then no button. */
  agendaOpen?: boolean;
  onToggleAgenda?: () => void;
```

解構加入 `agendaOpen = false, onToggleAgenda`，lucide import 加 `ClipboardList`。在聖經 `CircleButton` 之後：

```tsx
      {onToggleAgenda && (
        <CircleButton label={t('meeting.agendaTitle')} caption={t('meeting.tagAgenda')} active={agendaOpen} onClick={onToggleAgenda}>
          <ClipboardList {...ICON} />
        </CircleButton>
      )}
```

- [ ] **Step 2: `MeetingRoomView` 掛上抽屜、編輯畫面與分享狀態**

import：

```ts
import { useAgendaPresenter } from '../../hooks/useAgendaPresenter';
import { openAgendaStore } from '../../meeting/agenda/agendaStore';
import { AgendaDrawer } from './agenda/AgendaDrawer';
import { AgendaEditor } from './agenda/AgendaEditor';
```

在 `const [youtubeOpen, setYoutubeOpen] = useState(false);` 之後：

```ts
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [agendaEditorOpen, setAgendaEditorOpen] = useState(false);
  /** Bumped when the editor closes, so the drawer re-reads what was just changed. */
  const [agendaReload, setAgendaReload] = useState(0);
  const agendaStore = useMemo(() => openAgendaStore(), []);
```

（`useMemo` 加入 React import。）在 `stopSharedVideo` 定義之後：

```ts
  const agenda = useAgendaPresenter({
    lk, roomVideo, bible, store: agendaStore, videoFile, setVideoFile, onHostCommand,
    footer: `${t('header.logo')} · ${localizeMeetingRoomText(room.name, language)}`,
    onError: (key) => void churchAlert(t(key)),
  });
```

`sharing` 的計算，在 `localSharing` 分支之前插入投影片：

```ts
    : lk.slideOn
      ? { label: t('meeting.agendaStop'), stop: () => void agenda.stop() }
```

（亦即：`videoFile || roomVideo… ? {…} : lk.slideOn ? {…} : localSharing ? {…} : null`。）

右側面板區（`membersOpen && (<aside…>)` 之後）加入：

```tsx
        {isHost && agendaOpen && (
          <AgendaDrawer store={agendaStore} presenter={agenda} reloadKey={agendaReload}
            onOpenEditor={() => setAgendaEditorOpen(true)} />
        )}
```

`youtubeOpen && (...)` 之後加入：

```tsx
      {agendaEditorOpen && (
        <AgendaEditor store={agendaStore} onClose={() => { setAgendaEditorOpen(false); setAgendaReload((n) => n + 1); }} />
      )}
```

`<MeetingControlBar` 加兩個 props：

```tsx
        agendaOpen={agendaOpen}
        onToggleAgenda={isHost ? () => setAgendaOpen((v) => !v) : undefined}
```

- [ ] **Step 3: 首頁按鈕（網頁版）**

`MeetingPage.tsx` import `openAgendaStore` 與 `AgendaEditor`，並在 state 區加：

```ts
  const [agendaEditorOpen, setAgendaEditorOpen] = useState(false);
  const agendaStore = useMemo(() => openAgendaStore(), []);
```

（React import 加 `useMemo`。）網頁版選房間頁的 `<h2 …>{t('meeting.pickPrompt')}</h2>` 換成：

```tsx
          <div className="relative mb-2 flex items-center justify-center">
            <h2 className="text-center text-2xl font-bold text-gray-800 sm:text-3xl">{t('meeting.pickPrompt')}</h2>
            <button type="button" onClick={() => setAgendaEditorOpen(true)}
              className="absolute right-0 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
              <ClipboardList size={16} />{t('meeting.agendaTitle')}
            </button>
          </div>
```

（import `ClipboardList` from `lucide-react`。）在 `{joinDialog}` 之後（網頁與桌面兩個分支都要）：

```tsx
        {agendaEditorOpen && <AgendaEditor store={agendaStore} onClose={() => setAgendaEditorOpen(false)} />}
```

桌面分支把 `onOpenAgenda={() => setAgendaEditorOpen(true)}` 傳給 `DesktopRoomPicker`。

- [ ] **Step 4: 首頁按鈕（桌面版）**

`DesktopRoomPicker` props 加 `onOpenAgenda: () => void;`，import `ClipboardList`。把 `<h2 …>{t('meeting.pickPrompt')}</h2>` 與其下 `<p>` 包成：

```tsx
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('meeting.pickPrompt')}</h2>
              <p className="mt-1 text-sm text-gray-500">{t('meeting.desktopPickHint')}</p>
            </div>
            <button type="button" onClick={onOpenAgenda}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
              <ClipboardList size={16} />{t('meeting.agendaTitle')}
            </button>
          </div>
```

- [ ] **Step 5: 檢查點** — `npx tsc --noEmit` 無輸出；`npx vitest run` 全過。

---

### Task 15: 冒煙測試與部署

**Files:**
- Modify: `desktop/smoke.cjs`

- [ ] **Step 1: 冒煙測試加入聚會內容流程**

在 `smoke.cjs` 中「`page.evaluate(() => { window.WebSocket = …` 之前」（仍在選房間頁、尚未進房時）加入：

```js
    // 聚會內容: prepare a text slide and a verse on the home page, then share them as host.
    await page.getByRole('button', { name: '聚會內容' }).first().click();
    await page.getByRole('button', { name: '新增一份' }).first().click();
    await page.getByRole('button', { name: '文字' }).click();
    await page.getByPlaceholder('要顯示的文字').fill('本週代禱事項');
    await page.getByRole('button', { name: '經文' }).click();
    await page.waitForTimeout(600);
    await page.locator('[role="dialog"] header button').click();
```

在進房後（`'分享螢幕'` 按鈕等到之後）加入：

```js
    // The host control bar offers 聚會內容; its drawer lists what was prepared.
    await page.getByRole('button', { name: '聚會內容' }).click();
    await page.getByText('本週代禱事項').waitFor();
    await page.getByText('約翰福音 3:16').waitFor();
```

並把進房前勾選 Host：在 `page.getByRole('button', { name: '加入', exact: true }).first().click();` 之前加 `await page.locator('input[type="checkbox"]').first().check();`。

- [ ] **Step 2: 本機跑冒煙測試**

Run（`Church/` 另開終端：`VITE_API_PROXY_TARGET=https://dev.bolccop.org npx vite --port 2101 --strictPort`）：
`cd desktop && MEETING_DESKTOP_URL=http://localhost:2101/meeting npm run smoke`
Expected: 最後一行 `PASS: …`

- [ ] **Step 3: 部署 Dev**

```bash
export $(grep -E '^CLOUDFLARE_(API_TOKEN|ACCOUNT_ID)=' ../Finance/.dev.vars | xargs)
npx wrangler whoami   # 帳號必須是 953bb353…
npm run deploy:dev
```

- [ ] **Step 4: 交給使用者做真人測試**（兩台電腦）：投影片文字清楚、經文跳到正確位置並高亮、YouTube 與本機影片同步、上一項／下一項、停止。

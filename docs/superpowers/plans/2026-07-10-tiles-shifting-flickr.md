# Tiles-Shifting 幻灯片 Flickr 化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `TilesShifting` 幻灯片的轮换动画改成 Flickr 式三拍编排（原地消失 → 右侧链式补位带撞击回弹 → 行尾弹性 pop），并修复"越位一格再弹回"（Bug A）与"StrictMode 下 updater 副作用双执行"（Bug B）。

**Architecture:** 编排的纯逻辑（标记退出/补位、交接重排、时序计算、常量）抽到新模块 `tilesShiftingPlan.ts`，用 vitest（node 环境）TDD。组件 `TilesShifting.tsx` 重写编排部分：所有 `setRows` updater 变成纯函数（只做数组替换），随机选择、`createTile`（消耗牌堆 ref）、`setFocalContent`、定时器调度全部移到 updater 外；新增 `rowsRef`（与 state 同步，供定时器回调读取最新布局）与 `timersRef`（统一登记/清理定时器）。三拍在 t=0 的**一次** state 更新里全部标记完成，第二拍的 240ms 起始与 55ms 阶梯由 CSS `animation-delay` 承担；交接（删目标 + 幸存者重置 idle + 尾部插入 pop-in 新瓦片）在**同一次** state 更新里完成——幸存者的 grid 下标前移与 forwards transform 清除同 commit 抵消，视觉零移动。所有效果统一 keyframe animation，删掉 `transition: all` 与随机退出/方向/blur 入场。

**Tech Stack:** React 19 + TypeScript + Tailwind（内联 `<style>` keyframes），vitest 3（`npm test`，include 覆盖 `components/**/*.test.ts`）。

**Spec:** 用户 2026-07-10 消息（三拍编排、Bug A/B 修复要求、参考 CSS、时序、验收标准）。

**约定:** 所有命令在 `Church/` 目录下执行。commit 一律不加 Co-Authored-By 尾注。`Church/components/photos/PhotosPage.tsx` 有用户未提交的本地改动——**不要触碰、不要暂存**；每个 commit 只 stage 本任务列出的文件。

---

## File Structure

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `Church/components/photos/slideshows/tilesShiftingPlan.ts` | Create | 纯逻辑：时序常量、`markRowForShift`（第 1+2 拍标记）、`handoffRow`（第 3 拍交接）、`markTileExit`/`replaceTileAt`（手动点击原地替换）、`settleRowTiles`、`handoffDelayMs` |
| `Church/components/photos/slideshows/tilesShiftingPlan.test.ts` | Create | 上述逻辑的单元测试（含 ghost 跳过、wide 跨双格、行尾无补位者、id 稳定性） |
| `Church/components/photos/slideshows/TilesShifting.tsx` | Modify | 新 CSS、纯 updater 编排、rowsRef/timersRef、固定方向、手动点击统一"消失→弹出" |

## 时序总览（常量都在 plan 模块）

| 时间 | 事件 |
| --- | --- |
| t=0（一次 state 更新） | 目标（含 ghost，跨双格 span=2）标 `exit-vanish`（300ms）；右侧非 ghost 瓦片标 `shift-bounce`，`delayMs = 240 + seq×55`（seq 按离空位由近到远数非 ghost） |
| t = maxDelay + 520 + 50 | 一次 state 更新：删目标 span + 幸存者重置 idle + 尾部插入 `pop-in` 新瓦片（440ms 弹出）。行尾被删（无补位者）时该时刻提前为 360ms |
| 再 +500ms | 整行 settle 为 idle，释放 `isAnimating` |

典型总时长 ≈ 300+…≈1.4s；轮换间隔 5s 不变，留出静止呼吸期。

---

### Task 1: 纯逻辑 `tilesShiftingPlan.ts`（TDD）

**Files:**
- Create: `Church/components/photos/slideshows/tilesShiftingPlan.ts`
- Test: `Church/components/photos/slideshows/tilesShiftingPlan.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `Church/components/photos/slideshows/tilesShiftingPlan.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  markRowForShift,
  handoffRow,
  markTileExit,
  replaceTileAt,
  settleRowTiles,
  handoffDelayMs,
  tileSpan,
  SHIFT_START_MS,
  STAGGER_MS,
  SHIFT_MS,
  HANDOFF_BUFFER_MS,
  ROW_END_POP_AT_MS,
  type ShiftableTile,
} from './tilesShiftingPlan';

type T = ShiftableTile & { id: string };
const single = (id: string): T => ({ id, type: 'single', status: 'idle' });
const wide = (id: string): T => ({ id, type: 'wide', status: 'idle' });
const ghost = (id: string): T => ({ id, type: 'ghost', status: 'idle' });

describe('tileSpan', () => {
  it('wide 占 2 格，其余 1 格', () => {
    expect(tileSpan(wide('w'))).toBe(2);
    expect(tileSpan(single('s'))).toBe(1);
    expect(tileSpan(ghost('g'))).toBe(1);
  });
});

describe('markRowForShift', () => {
  it('中间单格目标：目标 exit-vanish，右侧全部 shift-bounce，delay 由近到远 240/295，方向固定 -1', () => {
    const row = [single('a'), single('b'), single('c'), single('d')];
    const { row: marked, shifterCount, maxDelayMs } = markRowForShift(row, 1);
    expect(marked[1].status).toBe('exit-vanish');
    expect(marked[0].status).toBe('idle');
    expect(marked[2]).toMatchObject({ status: 'shift-bounce', delayMs: SHIFT_START_MS, travelUnits: 1, travelDirection: -1 });
    expect(marked[3]).toMatchObject({ status: 'shift-bounce', delayMs: SHIFT_START_MS + STAGGER_MS, travelUnits: 1, travelDirection: -1 });
    expect(shifterCount).toBe(2);
    expect(maxDelayMs).toBe(SHIFT_START_MS + STAGGER_MS);
  });

  it('wide 目标：本体和 ghost 都 exit-vanish，补位者 travelUnits = 2', () => {
    const row = [wide('w'), ghost('g'), single('c'), single('d')];
    const { row: marked, shifterCount } = markRowForShift(row, 0);
    expect(marked[0].status).toBe('exit-vanish');
    expect(marked[1].status).toBe('exit-vanish');
    expect(marked[2]).toMatchObject({ status: 'shift-bounce', travelUnits: 2, delayMs: SHIFT_START_MS });
    expect(marked[3]).toMatchObject({ status: 'shift-bounce', travelUnits: 2, delayMs: SHIFT_START_MS + STAGGER_MS });
    expect(shifterCount).toBe(2);
  });

  it('补位序号跳过 ghost：ghost 不标动画、不占 seq', () => {
    const row = [single('a'), wide('w'), ghost('g'), single('d')];
    const { row: marked, shifterCount, maxDelayMs } = markRowForShift(row, 0);
    expect(marked[1]).toMatchObject({ status: 'shift-bounce', delayMs: SHIFT_START_MS });
    expect(marked[2].status).toBe('idle'); // ghost 不动画（不渲染）
    expect(marked[3]).toMatchObject({ status: 'shift-bounce', delayMs: SHIFT_START_MS + STAGGER_MS });
    expect(shifterCount).toBe(2);
    expect(maxDelayMs).toBe(SHIFT_START_MS + STAGGER_MS);
  });

  it('行尾目标：无补位者，shifterCount = 0', () => {
    const row = [single('a'), single('b'), wide('w'), ghost('g')];
    const { row: marked, shifterCount, maxDelayMs } = markRowForShift(row, 2);
    expect(marked[2].status).toBe('exit-vanish');
    expect(marked[3].status).toBe('exit-vanish');
    expect(marked[0].status).toBe('idle');
    expect(marked[1].status).toBe('idle');
    expect(shifterCount).toBe(0);
    expect(maxDelayMs).toBe(0);
  });

  it('不改动原数组（纯函数）', () => {
    const row = [single('a'), single('b')];
    markRowForShift(row, 0);
    expect(row[0].status).toBe('idle');
    expect(row[1].status).toBe('idle');
  });
});

describe('handoffRow', () => {
  it('同一次结果里：删目标、幸存者重置 idle 且 id/顺序不变、新瓦片带 pop-in 接在尾部、行长不变', () => {
    const row = markRowForShift([single('a'), single('b'), single('c'), single('d')], 1).row;
    const incoming = [{ ...single('new'), status: 'pop-in' }];
    const next = handoffRow(row, 1, incoming);
    expect(next.map((t) => t.id)).toEqual(['a', 'c', 'd', 'new']);
    expect(next[0].status).toBe('idle');
    expect(next[1]).toMatchObject({ status: 'idle', delayMs: 0 });
    expect(next[2]).toMatchObject({ status: 'idle', delayMs: 0 });
    expect(next[3].status).toBe('pop-in');
    expect(next).toHaveLength(row.length);
  });

  it('wide 目标：删 2 格、插入 [wide, ghost]，行长不变', () => {
    const row = markRowForShift([wide('w'), ghost('g'), single('c'), single('d')], 0).row;
    const incoming = [{ ...wide('nw'), status: 'pop-in' }, ghost('ng')];
    const next = handoffRow(row, 0, incoming);
    expect(next.map((t) => t.id)).toEqual(['c', 'd', 'nw', 'ng']);
    expect(next[0].status).toBe('idle');
    expect(next[2].status).toBe('pop-in');
    expect(next).toHaveLength(row.length);
  });

  it('行尾目标（无补位者）：等价于原槽位替换', () => {
    const row = markRowForShift([single('a'), single('b'), single('c')], 2).row;
    const next = handoffRow(row, 2, [{ ...single('new'), status: 'pop-in' }]);
    expect(next.map((t) => t.id)).toEqual(['a', 'b', 'new']);
  });
});

describe('markTileExit / replaceTileAt（手动点击原地替换）', () => {
  it('markTileExit 只标目标 span，其它瓦片不动', () => {
    const row = [single('a'), wide('w'), ghost('g'), single('d')];
    const marked = markTileExit(row, 1);
    expect(marked[0].status).toBe('idle');
    expect(marked[1].status).toBe('exit-vanish');
    expect(marked[2].status).toBe('exit-vanish');
    expect(marked[3].status).toBe('idle');
  });

  it('replaceTileAt 原槽位换新瓦片，ghost 与其它瓦片保持原样', () => {
    const row = markTileExit([single('a'), wide('w'), ghost('g'), single('d')], 1);
    const next = replaceTileAt(row, 1, { ...wide('nw'), status: 'pop-in' });
    expect(next.map((t) => t.id)).toEqual(['a', 'nw', 'g', 'd']);
    expect(next[1].status).toBe('pop-in');
    expect(next[2].status).toBe('idle'); // ghost 复位 idle
  });
});

describe('settleRowTiles', () => {
  it('整行重置 idle、delay 0', () => {
    const row = markRowForShift([single('a'), single('b')], 0).row;
    const settled = settleRowTiles(handoffRow(row, 0, [{ ...single('n'), status: 'pop-in' }]));
    for (const tile of settled) {
      expect(tile.status).toBe('idle');
      expect(tile.delayMs ?? 0).toBe(0);
    }
  });
});

describe('handoffDelayMs', () => {
  it('有补位者：maxDelay + 动画时长 + 缓冲', () => {
    expect(handoffDelayMs(2, SHIFT_START_MS + STAGGER_MS)).toBe(SHIFT_START_MS + STAGGER_MS + SHIFT_MS + HANDOFF_BUFFER_MS);
  });
  it('无补位者（行尾）：固定 360ms 直接弹出', () => {
    expect(handoffDelayMs(0, 0)).toBe(ROW_END_POP_AT_MS);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- components/photos/slideshows/tilesShiftingPlan.test.ts`（在 `Church/` 下）
Expected: FAIL — 模块不存在

- [ ] **Step 3: 最小实现**

创建 `Church/components/photos/slideshows/tilesShiftingPlan.ts`：

```ts
// Tiles-Shifting 幻燈片的三拍編排純邏輯（Flickr 式：原地消失 → 鏈式補位 → 行尾彈出）。
// 純函數、不依賴 React/DOM，可單元測試。組件層只負責調度定時器與渲染。

export type TileStatus = 'idle' | 'exit-vanish' | 'shift-bounce' | 'pop-in';

export interface ShiftableTile {
  type: 'single' | 'double' | 'wide' | 'ghost';
  status: string;
  travelUnits?: number;
  travelDirection?: -1 | 1;
  delayMs?: number;
}

export const VANISH_MS = 300;            // 第 1 拍：原地淡出+縮小
export const SHIFT_START_MS = 240;       // 第 2 拍起始（與消失尾部輕微重疊）
export const SHIFT_MS = 520;             // 補位滑動（含撞擊回彈）時長
export const STAGGER_MS = 55;            // 補位波浪的階梯延遲
export const HANDOFF_BUFFER_MS = 50;     // 交接前的安全緩衝
export const POP_MS = 440;               // 第 3 拍：彈性 pop
export const SETTLE_AFTER_HANDOFF_MS = 500; // 交接後整行 settle、釋放動畫鎖
export const ROW_END_POP_AT_MS = 360;    // 行尾被刪（無補位者）時直接彈出的時刻

export const tileSpan = (tile: ShiftableTile): number => (tile.type === 'wide' ? 2 : 1);

// 注意：泛型展開覆寫屬性後 TS 無法證明結果仍是 T（T 可能是更窄的子類型），
// 這裏的覆寫只觸及 ShiftableTile 自身的字段，斷言回 T 是安全的。
const asIdle = <T extends ShiftableTile>(tile: T): T => ({
  ...tile, status: 'idle', travelUnits: 1, travelDirection: -1, delayMs: 0,
} as T);

/**
 * 第 1+2 拍（同一次 state 更新）：目標 span 標 exit-vanish；空位右側的非 ghost
 * 瓦片標 shift-bounce，delay = 240 + seq×55（seq 按離空位由近到遠數非 ghost），
 * travelUnits = 被刪 span，方向固定向左（-1）。ghost 不渲染，不標動畫。
 */
export function markRowForShift<T extends ShiftableTile>(
  row: readonly T[],
  target: number,
): { row: T[]; shifterCount: number; maxDelayMs: number } {
  const span = tileSpan(row[target]);
  let seq = 0;
  let maxDelayMs = 0;
  const next = row.map((tile, idx) => {
    if (idx >= target && idx < target + span) {
      return { ...tile, status: 'exit-vanish', travelUnits: span, travelDirection: -1 as const, delayMs: 0 } as T;
    }
    if (idx >= target + span && tile.type !== 'ghost') {
      const delayMs = SHIFT_START_MS + seq * STAGGER_MS;
      seq += 1;
      maxDelayMs = delayMs;
      return { ...tile, status: 'shift-bounce', travelUnits: span, travelDirection: -1 as const, delayMs } as T;
    }
    return tile;
  });
  return { row: next, shifterCount: seq, maxDelayMs };
}

/**
 * 第 3 拍交接（同一次 state 更新）：刪目標 span、倖存者重置 idle（grid 下標前移與
 * forwards transform 清除同 commit 抵消，視覺零移動）、新瓦片接在行尾。
 * 倖存者 id/相對順序不變，React key 穩定。
 */
export function handoffRow<T extends ShiftableTile>(
  row: readonly T[],
  target: number,
  incoming: readonly T[],
): T[] {
  const span = tileSpan(row[target]);
  const survivors = row
    .filter((_, idx) => idx < target || idx >= target + span)
    .map(asIdle);
  return [...survivors, ...incoming.map((tile) => ({ ...tile }))];
}

/** 手動點擊路徑第 1 拍：只標目標 span 為 exit-vanish，其餘瓦片不動。 */
export function markTileExit<T extends ShiftableTile>(row: readonly T[], target: number): T[] {
  const span = tileSpan(row[target]);
  return row.map((tile, idx) => (
    idx >= target && idx < target + span
      ? { ...tile, status: 'exit-vanish', travelUnits: span, travelDirection: -1 as const, delayMs: 0 } as T
      : tile
  ));
}

/** 手動點擊路徑第 3 拍：原槽位換入 pop-in 新瓦片，wide 的 ghost 復位 idle，其餘不動。 */
export function replaceTileAt<T extends ShiftableTile>(row: readonly T[], target: number, replacement: T): T[] {
  const span = tileSpan(row[target]);
  return row.map((tile, idx) => {
    if (idx === target) return { ...replacement };
    if (idx > target && idx < target + span) return asIdle(tile); // wide 的 ghost 佔位
    return tile;
  });
}

/** 整行 settle：全部 idle、清 delay/transform 變量。 */
export function settleRowTiles<T extends ShiftableTile>(row: readonly T[]): T[] {
  return row.map(asIdle);
}

/** 交接時刻：有補位者 = 最大延遲 + 滑動時長 + 緩衝；行尾無補位者 = 360ms 直接彈出。 */
export function handoffDelayMs(shifterCount: number, maxDelayMs: number): number {
  return shifterCount === 0 ? ROW_END_POP_AT_MS : maxDelayMs + SHIFT_MS + HANDOFF_BUFFER_MS;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- components/photos/slideshows/tilesShiftingPlan.test.ts`
Expected: PASS，14 个用例全绿

- [ ] **Step 5: Commit**

```bash
git add Church/components/photos/slideshows/tilesShiftingPlan.ts Church/components/photos/slideshows/tilesShiftingPlan.test.ts
git commit -m "feat(photos): pure three-beat orchestration logic for tiles-shifting slideshow"
```

---

### Task 2: 重写 `TilesShifting.tsx` 编排

**Files:**
- Modify: `Church/components/photos/slideshows/TilesShifting.tsx`

改动总览：新 imports、删 `EXIT_EFFECTS`/`ANIMATION_MS`、换 CSS、加 rowsRef/timersRef、`finishRefresh` 删除、`settleRow`/`triggerSwitch`/`mutateRow` 重写为"updater 纯函数 + 副作用外置"、渲染层去 `tile-transition`/`--entry-px`、清理逻辑。**不改** `classifyMedia`/`getNextItem`/`createTile`/`buildRow`/`generateLayout` 及照片选择逻辑。

- [ ] **Step 1: imports 与常量**

顶部 import 区，在 `import { StaticTile } from './StaticTile';` 之后加：

```ts
import {
  markRowForShift,
  handoffRow,
  markTileExit,
  replaceTileAt,
  settleRowTiles,
  handoffDelayMs,
  VANISH_MS,
  SHIFT_MS,
  POP_MS,
  SETTLE_AFTER_HANDOFF_MS,
  ROW_END_POP_AT_MS,
} from './tilesShiftingPlan';
```

删除这两行：

```ts
const ANIMATION_MS = 520;

const EXIT_EFFECTS = ['exit-fade-out', 'exit-scale-down', 'exit-slide-left', 'exit-slide-right', 'exit-slide-top', 'exit-slide-bottom', 'exit-soft-push'];
```

（`type ShiftDirection` 与 `ATile` 保持不变；`ATile.status` 仍为 string，plan 模块通过泛型兼容。）

- [ ] **Step 2: 替换 CSS**

把整个 `const sharedStyles = \`...\`;` 模板串替换为：

```ts
const sharedStyles = `
    .exit-vanish { animation: tileVanish ${VANISH_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards; }
    .shift-bounce { animation: shiftBounce ${SHIFT_MS}ms cubic-bezier(0.33, 1, 0.68, 1) forwards; animation-delay: var(--impact-delay, 0ms); z-index: 25; }
    .pop-in { animation: tilePop ${POP_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards; z-index: 30; }
    @keyframes tileVanish {
        0% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(0.72); }
    }
    @keyframes shiftBounce {
        0%   { transform: translate3d(0, 0, 0) scaleX(1); }
        58%  { transform: translate3d(calc(var(--travel-px) * var(--travel-dir) * 1.05), 0, 0) scaleX(0.96); }
        76%  { transform: translate3d(calc(var(--travel-px) * var(--travel-dir) * 0.98), 0, 0) scaleX(1.015); }
        100% { transform: translate3d(calc(var(--travel-px) * var(--travel-dir)), 0, 0) scaleX(1); }
    }
    @keyframes tilePop {
        0% { opacity: 0; transform: scale(0.25); }
        100% { opacity: 1; transform: scale(1); }
    }
`;
```

- [ ] **Step 3: rowsRef / timersRef 基础设施**

在 `const isAnimating = useRef(false);` 之后加：

```ts
// 與 state 同步的最新佈局，供定時器回調讀取（避免閉包舊 state / StrictMode 雙執行問題）
const rowsRef = useRef<ATile[][]>([]);
useEffect(() => { rowsRef.current = rows; }, [rows]);

// 所有動畫定時器統一登記，數據源變化/卸載時全部清掉，防止殘留回調打在新佈局上
const timersRef = useRef<number[]>([]);
const schedule = useCallback((fn: () => void, ms: number) => {
  timersRef.current.push(window.setTimeout(fn, ms));
}, []);
const clearTimers = useCallback(() => {
  timersRef.current.forEach((id) => window.clearTimeout(id));
  timersRef.current = [];
}, []);
useEffect(() => () => clearTimers(), [clearTimers]);
```

并在现有 `useEffect(() => { ... classifyMedia ... }, [data])` 的开头（`setReady(false);` 之前）加两行：

```ts
clearTimers();
isAnimating.current = false;
```

（该 effect 的依赖数组补上 `clearTimers`：`}, [data, clearTimers]);`）

- [ ] **Step 4: 重写编排回调**

**删除** `finishRefresh` 整个 useCallback。

**替换** `settleRow` 为：

```ts
const settleRow = useCallback((r: number) => {
  setRows((prevRows) => prevRows.map((row, idx) => (idx === r ? settleRowTiles(row) : row)));
}, []);
```

**替换** `triggerSwitch`（手动点击 = 同一套"消失→弹出"，原地替换，不补位）为：

```ts
const triggerSwitch = useCallback((r: number, c: number) => {
  if (isAnimating.current) return;
  const row = rowsRef.current[r];
  const tile = row?.[c];
  if (!tile || tile.type === 'ghost' || tile.status !== 'idle') return;
  isAnimating.current = true;
  if (tile.top) setFocalContent(tile.top.src);

  const marked = markTileExit(row, c);
  setRows((prevRows) => prevRows.map((cur, idx) => (idx === r ? marked : cur)));

  schedule(() => {
    // createTile 消耗牌堆 ref，必須在 updater 外只執行一次
    const newTile = createTile(tile.type as TileKind, rowsRef.current, new Set());
    newTile.status = 'pop-in';
    const replaced = replaceTileAt(rowsRef.current[r] ?? marked, c, newTile);
    setRows((prevRows) => prevRows.map((cur, idx) => (idx === r ? replaced : cur)));
    schedule(() => {
      settleRow(r);
      isAnimating.current = false;
    }, SETTLE_AFTER_HANDOFF_MS);
  }, ROW_END_POP_AT_MS);
}, [createTile, schedule, settleRow]);
```

**替换** `mutateRow`（自动轮换三拍）为：

```ts
const mutateRow = useCallback((rowIndex: number) => {
  if (isAnimating.current) return;
  const row = rowsRef.current[rowIndex];
  if (!row) return;
  const candidates = row.map((tile, idx) => (tile.type !== 'ghost' ? idx : -1)).filter((idx) => idx >= 0);
  if (candidates.length === 0) return;

  // 選目標、標記三拍——全部在 updater 外決定，updater 只做純數組替換
  const target = candidates[Math.floor(Math.random() * candidates.length)];
  const tile = row[target];
  isAnimating.current = true;
  if (tile.top) setFocalContent(tile.top.src);

  const { row: marked, shifterCount, maxDelayMs } = markRowForShift(row, target);
  setRows((prevRows) => prevRows.map((cur, idx) => (idx === rowIndex ? marked : cur)));

  schedule(() => {
    const newTile = createTile(tile.type as TileKind, rowsRef.current, new Set());
    newTile.status = 'pop-in';
    const incoming: ATile[] = newTile.type === 'wide'
      ? [newTile, createTile('ghost', rowsRef.current, new Set())]
      : [newTile];
    const next = handoffRow(rowsRef.current[rowIndex] ?? marked, target, incoming);
    setRows((prevRows) => prevRows.map((cur, idx) => (idx === rowIndex ? next : cur)));
    schedule(() => {
      settleRow(rowIndex);
      isAnimating.current = false;
    }, SETTLE_AFTER_HANDOFF_MS);
  }, handoffDelayMs(shifterCount, maxDelayMs));
}, [createTile, schedule, settleRow]);
```

（`getSpan` useCallback 如无其它引用则一并删除。）

- [ ] **Step 5: 渲染层**

瓦片 div 的 className 去掉 `tile-transition`：

```
className={`group/tile relative h-full w-full cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md ${tile.status}`}
```

style 对象里删除 `--entry-px` 一行；`--travel-px` / `--travel-dir` / `--impact-delay` 三个变量保留原样。

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `npx tsc --noEmit` → Expected: 只有 `components/SermonManager.tsx` 的 4 个既有错误（524/526/542/543 行），无新增
Run: `npm test` → Expected: 全部通过（含 Task 1 的 14 个新用例）
再确认残留清理：`grep -n "EXIT_EFFECTS\|tile-transition\|entering\|--entry-px\|finishRefresh\|ANIMATION_MS" Church/components/photos/slideshows/TilesShifting.tsx` 应无输出。

- [ ] **Step 7: Commit**

```bash
git add Church/components/photos/slideshows/TilesShifting.tsx
git commit -m "fix(photos): Flickr-style three-beat tile rotation, pure updaters, StrictMode-safe timers"
```

---

### Task 3: 构建验证 + 手动验收

- [ ] **Step 1: 构建**

Run: `npm run build`（在 `Church/` 下）
Expected: vite build 成功

- [ ] **Step 2: 手动验收（`npm run dev`，StrictMode 默认开启）**

进入照片页 → 启动 Tiles Shifting 幻灯片，连续观察 ≥10 轮自动轮换：

- 三拍严格顺序：原地淡出缩小（其它瓦片纹丝不动）→ 右侧瓦片波浪式左移补位（近处先动，撞击回弹：过冲后轻微挤压回稳）→ 行尾新瓦片 scale 0.25 弹出；
- 无瓦片瞬移、越位一格再弹回、无动画凭空消失、重复插入；补位结束到弹出之间零跳动；
- 行尾瓦片被删：跳过补位拍，原槽位约 360ms 直接弹出新图；
- wide（跨双格）被删/插入：补位者滑动两格宽，新 wide + ghost 插入后行长不变；
- 手动点击任意瓦片：原地消失 → 原地弹出，同一套动画语言；动画进行中点击/轮换被忽略；
- 每轮约 1.5s 内完成，之后明显静止呼吸期（轮换间隔 5s）；一次只动一行。

- [ ] **Step 3: 微调 commit（如手动验收发现需要）**

```bash
git add Church/components/photos/slideshows/
git commit -m "fix(photos): polish tiles-shifting timing after manual verification"
```

（若无改动则跳过。）

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

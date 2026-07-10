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

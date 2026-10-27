/**
 * 標準六角星形中國跳棋棋盤（121 個棋位）。
 *
 * 使用立方座標 (q, r, s)，q + r + s = 0。
 * 星形 = 兩個大三角形的聯集：
 *   T1 = { q, r, s >= -4 }（91 格）
 *   T2 = { q, r, s <=  4 }（91 格）
 *   交集為半徑 4 的中央六角形（61 格）→ 91 + 91 - 61 = 121。
 * 六個角落（各 10 格）就是某一個座標 > 4 或 < -4 的區域。
 *
 * 角落編號（順時針，畫面上方為 0）：
 *   0: 上     (r < -4)
 *   1: 右上   (q > 4)
 *   2: 右下   (s < -4)
 *   3: 下     (r > 4)
 *   4: 左下   (q < -4)
 *   5: 左上   (s > 4)
 * 對角：zone i 的對面是 (i + 3) % 6。
 */

export interface Cell {
  /** 棋位索引 0..120 */
  id: number;
  q: number;
  r: number;
  s: number;
  /** 所屬角落 0..5，中央區域為 -1 */
  zone: number;
  /** 畫面座標（單位：相鄰棋位距離 = 1） */
  x: number;
  y: number;
}

export const BOARD_SIZE = 121;
export const PIECES_PER_PLAYER = 10;
export const ZONE_COUNT = 6;

/** 六個鄰接方向（立方座標） */
export const DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [1, -1, 0],
  [1, 0, -1],
  [0, 1, -1],
  [-1, 1, 0],
  [-1, 0, 1],
  [0, -1, 1],
];

function zoneOf(q: number, r: number, s: number): number {
  if (r < -4) return 0;
  if (q > 4) return 1;
  if (s < -4) return 2;
  if (r > 4) return 3;
  if (q < -4) return 4;
  if (s > 4) return 5;
  return -1;
}

function key(q: number, r: number): string {
  return `${q},${r}`;
}

function buildCells(): Cell[] {
  const cells: Omit<Cell, 'id'>[] = [];
  for (let r = -8; r <= 8; r++) {
    for (let q = -8; q <= 8; q++) {
      const s = -q - r;
      const inT1 = q >= -4 && r >= -4 && s >= -4;
      const inT2 = q <= 4 && r <= 4 && s <= 4;
      if (!inT1 && !inT2) continue;
      cells.push({
        q,
        r,
        s,
        zone: zoneOf(q, r, s),
        // pointy-top 軸向座標轉換，相鄰距離為 1
        x: q + r / 2,
        y: (r * Math.sqrt(3)) / 2,
      });
    }
  }
  // 依 y、x 排序，讓索引由上而下、由左而右
  cells.sort((a, b) => a.r - b.r || a.x - b.x);
  return cells.map((c, id) => ({ ...c, id }));
}

export const CELLS: ReadonlyArray<Cell> = buildCells();

const INDEX = new Map<string, number>(CELLS.map((c) => [key(c.q, c.r), c.id]));

export function cellAt(q: number, r: number): number | undefined {
  return INDEX.get(key(q, r));
}

/** NEIGHBORS[id][dir] = 相鄰棋位 id 或 -1 */
export const NEIGHBORS: ReadonlyArray<ReadonlyArray<number>> = CELLS.map((c) =>
  DIRECTIONS.map(([dq, dr]) => cellAt(c.q + dq, c.r + dr) ?? -1),
);

/** JUMPS[id][dir] = { over, land }：跳過 over 落在 land；超出棋盤為 -1 */
export const JUMPS: ReadonlyArray<ReadonlyArray<{ over: number; land: number }>> = CELLS.map((c) =>
  DIRECTIONS.map(([dq, dr]) => ({
    over: cellAt(c.q + dq, c.r + dr) ?? -1,
    land: cellAt(c.q + 2 * dq, c.r + 2 * dr) ?? -1,
  })),
);

/** ZONE_CELLS[zone] = 該角落的 10 個棋位 */
export const ZONE_CELLS: ReadonlyArray<ReadonlyArray<number>> = Array.from({ length: ZONE_COUNT }, (_, z) =>
  CELLS.filter((c) => c.zone === z).map((c) => c.id),
);

export function oppositeZone(zone: number): number {
  return (zone + 3) % ZONE_COUNT;
}

export function isValidCellId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id >= 0 && id < BOARD_SIZE;
}

/** 依玩家人數分配起始角落（未使用的角落保持空置） */
export const SEAT_ZONES: Readonly<Record<number, readonly number[]>> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [1, 2, 4, 5],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
};

/** 棋盤座標範圍，供繪圖使用 */
export const BOARD_BOUNDS = (() => {
  const xs = CELLS.map((c) => c.x);
  const ys = CELLS.map((c) => c.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
})();

import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, CELLS, NEIGHBORS, SEAT_ZONES, ZONE_CELLS, cellAt, oppositeZone } from '../src/index.js';

describe('棋盤', () => {
  it('有正確的 121 個棋位，座標不重複', () => {
    expect(CELLS.length).toBe(121);
    expect(BOARD_SIZE).toBe(121);
    expect(new Set(CELLS.map((c) => `${c.q},${c.r}`)).size).toBe(121);
    for (const c of CELLS) expect(c.q + c.r + c.s).toBe(0);
  });

  it('中央六角區 61 格，六個角落各 10 格', () => {
    expect(CELLS.filter((c) => c.zone === -1).length).toBe(61);
    for (let z = 0; z < 6; z++) expect(ZONE_CELLS[z]!.length).toBe(10);
  });

  it('每一列的棋位數符合標準星形', () => {
    const rows = new Map<number, number>();
    for (const c of CELLS) rows.set(c.r, (rows.get(c.r) ?? 0) + 1);
    const counts = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
    expect(counts).toEqual([1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1]);
  });

  it('鄰接關係對稱，中心點有 6 個鄰居，角尖只有 2 個', () => {
    for (const c of CELLS) {
      for (const n of NEIGHBORS[c.id]!) if (n >= 0) expect(NEIGHBORS[n]).toContain(c.id);
    }
    expect(NEIGHBORS[cellAt(0, 0)!]!.filter((n) => n >= 0).length).toBe(6);
    expect(NEIGHBORS[cellAt(4, -8)!]!.filter((n) => n >= 0).length).toBe(2);
  });

  it('對角區域正確配對，且每種人數的起點不重複', () => {
    expect(oppositeZone(0)).toBe(3);
    expect(oppositeZone(1)).toBe(4);
    expect(oppositeZone(5)).toBe(2);
    for (let n = 2; n <= 6; n++) {
      const zones = SEAT_ZONES[n]!;
      expect(zones.length).toBe(n);
      expect(new Set(zones).size).toBe(n);
    }
    // 3 人時目標區不與其他玩家起點重疊；4 人為兩組對角
    expect(SEAT_ZONES[3]!.map(oppositeZone).some((z) => SEAT_ZONES[3]!.includes(z))).toBe(false);
    for (const z of SEAT_ZONES[4]!) expect(SEAT_ZONES[4]).toContain(oppositeZone(z));
  });
});

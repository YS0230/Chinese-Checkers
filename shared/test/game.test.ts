import { describe, expect, it } from 'vitest';
import {
  CELLS,
  DEFAULT_RULES,
  NEIGHBORS,
  SEAT_ZONES,
  ZONE_CELLS,
  applyMove,
  cellAt,
  createGame,
  deactivateSeat,
  getLegalMoves,
  hasWon,
  rankSeats,
  type GameState,
} from '../src/index.js';

/** 建立只含指定棋子的棋盤 */
function custom(placements: Array<[seat: number, q: number, r: number]>, numPlayers = 2): GameState {
  const base = createGame(numPlayers);
  const occupancy = new Array<number>(121).fill(-1);
  const pieces = placements.map(([seat, q, r], id) => {
    const cell = cellAt(q, r);
    if (cell === undefined) throw new Error(`bad cell ${q},${r}`);
    occupancy[cell] = id;
    return { id, seat, cell };
  });
  return { ...base, pieces, occupancy };
}
const C = (q: number, r: number) => cellAt(q, r)!;

describe('開局', () => {
  it.each([2, 3, 4, 5, 6])('%i 人模式每人 10 顆、棋子位於自己的起始區', (n) => {
    const g = createGame(n);
    expect(g.seats.length).toBe(n);
    expect(g.pieces.length).toBe(n * 10);
    for (let seat = 0; seat < n; seat++) {
      const mine = g.pieces.filter((p) => p.seat === seat);
      expect(mine.length).toBe(10);
      const zone = SEAT_ZONES[n]![seat]!;
      for (const p of mine) expect(CELLS[p.cell]!.zone).toBe(zone);
      expect(g.seats[seat]!.goalZone).toBe((zone + 3) % 6);
    }
    const used = new Set(SEAT_ZONES[n]);
    for (let z = 0; z < 6; z++) {
      if (used.has(z)) continue;
      for (const cell of ZONE_CELLS[z]!) expect(g.occupancy[cell]).toBe(-1);
    }
  });

  it('不支援 1 或 7 人', () => {
    expect(() => createGame(1)).toThrow();
    expect(() => createGame(7)).toThrow();
  });
});

describe('移動規則', () => {
  it('可以移動到相鄰的空棋位', () => {
    const g = custom([[0, 0, 0]]);
    const moves = getLegalMoves(g, C(0, 0));
    expect(moves.size).toBe(6);
    for (const n of NEIGHBORS[C(0, 0)]!) expect(moves.get(n)).toEqual([C(0, 0), n]);
  });

  it('不允許落在被佔據的棋位', () => {
    const g = custom([[0, 0, 0], [1, 1, 0], [1, 2, 0]]);
    const moves = getLegalMoves(g, C(0, 0));
    expect(moves.has(C(1, 0))).toBe(false);
    expect(moves.has(C(2, 0))).toBe(false);
    expect(applyMove(g, 0, C(0, 0), C(1, 0)).ok).toBe(false);
  });

  it('可以跳過相鄰棋子落在後方空位（自己或他人的棋子皆可）', () => {
    const g = custom([[0, 0, 0], [1, 1, 0], [0, 0, 1]]);
    const moves = getLegalMoves(g, C(0, 0));
    expect(moves.get(C(2, 0))).toEqual([C(0, 0), C(2, 0)]);
    expect(moves.get(C(0, 2))).toEqual([C(0, 0), C(0, 2)]);
  });

  it('不能跳過空位，也不能一次跳兩格以上', () => {
    const g = custom([[0, 0, 0], [1, 2, 0]]);
    const moves = getLegalMoves(g, C(0, 0));
    expect(moves.has(C(2, 0))).toBe(false);
    expect(moves.has(C(3, 0))).toBe(false);
    expect(moves.has(C(4, 0))).toBe(false);
  });

  it('支援連續跳躍並可改變方向', () => {
    // (0,0) 跳過 (1,0) 到 (2,0)，再跳過 (2,1) 到 (2,2)，再跳過 (1,2) 到 (0,2)
    const g = custom([[0, 0, 0], [1, 1, 0], [1, 2, 1], [1, 1, 2]]);
    const moves = getLegalMoves(g, C(0, 0));
    expect(moves.get(C(2, 2))).toEqual([C(0, 0), C(2, 0), C(2, 2)]);
    const path = moves.get(C(0, 2))!;
    expect(path).toEqual([C(0, 0), C(2, 0), C(2, 2), C(0, 2)]);
    const r = applyMove(g, 0, C(0, 0), C(0, 2));
    expect(r.ok && r.move.jump).toBe(true);
    expect(r.ok && r.move.path).toEqual(path);
  });

  it('跳躍後不能再走一步', () => {
    const g = custom([[0, 0, 0], [1, 1, 0]]);
    const moves = getLegalMoves(g, C(0, 0));
    expect(moves.has(C(2, 0))).toBe(true);
    expect(moves.has(C(3, 0))).toBe(false);
  });

  it('不允許非當前玩家移動、不允許移動別人的棋子、拒絕無效棋位', () => {
    const g = createGame(2);
    const p1 = g.pieces.find((p) => p.seat === 1 && getLegalMoves(g, p.cell).size > 0)!;
    const to = [...getLegalMoves(g, p1.cell).keys()][0]!;
    expect(applyMove(g, 1, p1.cell, to)).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    expect(applyMove(g, 0, p1.cell, to)).toMatchObject({ ok: false, code: 'NOT_YOUR_PIECE' });
    expect(applyMove(g, 0, -1, 999)).toMatchObject({ ok: false, code: 'INVALID_CELL' });
    expect(applyMove(g, 0, 1.5, 3)).toMatchObject({ ok: false, code: 'INVALID_CELL' });
  });

  it('合法移動後換下一位、回合編號遞增、原狀態不被修改', () => {
    const g = createGame(3);
    const piece = g.pieces.find((p) => p.seat === 0 && getLegalMoves(g, p.cell).size > 0)!;
    const to = [...getLegalMoves(g, piece.cell).keys()][0]!;
    const r = applyMove(g, 0, piece.cell, to);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.currentSeat).toBe(1);
    expect(r.state.turnNumber).toBe(2);
    expect(r.state.occupancy[to]).toBe(piece.id);
    expect(r.state.occupancy[piece.cell]).toBe(-1);
    expect(g.occupancy[piece.cell]).toBe(piece.id);
  });

  it('目標區鎖定：進入目標區的棋子不能再移出', () => {
    const goalEdge = ZONE_CELLS[3]!.find((id) => CELLS[id]!.r === 5)!;
    const c = CELLS[goalEdge]!;
    const g = custom([[0, c.q, c.r]]);
    const moves = [...getLegalMoves(g, goalEdge).keys()];
    expect(moves.length).toBeGreaterThan(0);
    for (const to of moves) expect(CELLS[to]!.zone).toBe(3);
    const free = { ...g, rules: { ...DEFAULT_RULES, goalLock: false } };
    expect([...getLegalMoves(free, goalEdge).keys()].some((to) => CELLS[to]!.zone !== 3)).toBe(true);
  });
});

describe('勝利判定', () => {
  it('所有棋子進入目標區即獲勝，遊戲結束後拒絕移動', () => {
    const goal = ZONE_CELLS[3]!;
    const last = goal.find((id) => CELLS[id]!.r === 5)!;
    const outside = NEIGHBORS[last]!.find((n) => n >= 0 && CELLS[n]!.zone === -1)!;
    const placements: Array<[number, number, number]> = goal
      .filter((id) => id !== last)
      .map((id) => [0, CELLS[id]!.q, CELLS[id]!.r]);
    placements.push([0, CELLS[outside]!.q, CELLS[outside]!.r]);
    placements.push([1, 2, -6]);
    const g = custom(placements);
    expect(hasWon(g, 0)).toBe(false);
    const r = applyMove(g, 0, outside, last);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.winnerSeat).toBe(0);
    expect(r.state.over).toBe(true);
    expect(applyMove(r.state, 1, C(2, -6), C(2, -5))).toMatchObject({ ok: false, code: 'GAME_OVER' });
    expect(rankSeats(r.state)[0]!.seat).toBe(0);
  });

  it('防堵規則：目標區被填滿且至少一顆己方棋子即獲勝；關閉時不算', () => {
    const goal = ZONE_CELLS[3]!;
    const placements: Array<[number, number, number]> = goal.map((id, i) => [i === 0 ? 0 : 1, CELLS[id]!.q, CELLS[id]!.r]);
    const g = custom(placements);
    expect(hasWon(g, 0)).toBe(true);
    expect(hasWon({ ...g, rules: { ...g.rules, antiBlocking: false } }, 0)).toBe(false);
  });

  it('開局時沒有人獲勝', () => {
    for (let n = 2; n <= 6; n++) {
      const g = createGame(n);
      for (let s = 0; s < n; s++) expect(hasWon(g, s)).toBe(false);
    }
  });
});

describe('玩家離場', () => {
  it('離場玩家的回合被跳過；只剩一人時該玩家獲勝', () => {
    let g = createGame(3);
    g = deactivateSeat(g, 0);
    expect(g.currentSeat).toBe(1);
    expect(g.over).toBe(false);
    g = deactivateSeat(g, 2);
    expect(g.over).toBe(true);
    expect(g.winnerSeat).toBe(1);
  });
});

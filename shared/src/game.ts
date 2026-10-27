/**
 * 中國跳棋規則引擎（純函式、不可變狀態，前後端共用）。
 * 伺服器以此驗證所有棋步；前端僅用來預覽合法落點。
 */
import {
  BOARD_SIZE,
  CELLS,
  JUMPS,
  NEIGHBORS,
  PIECES_PER_PLAYER,
  SEAT_ZONES,
  ZONE_CELLS,
  isValidCellId,
  oppositeZone,
} from './board.js';

export interface RuleOptions {
  /** 棋子進入目標區後，不能再移出目標區 */
  goalLock: boolean;
  /** 防堵規則：目標區 10 格全被佔滿，且其中至少 1 顆是自己的棋子，即判定獲勝 */
  antiBlocking: boolean;
}

export const DEFAULT_RULES: RuleOptions = {
  goalLock: true,
  antiBlocking: true,
};

export interface Piece {
  id: number;
  seat: number;
  cell: number;
}

export interface SeatState {
  zone: number;
  goalZone: number;
  /** false = 玩家已離開，回合自動跳過，棋子留在棋盤上當障礙 */
  active: boolean;
}

export interface GameState {
  rules: RuleOptions;
  seats: SeatState[];
  pieces: Piece[];
  /** occupancy[cell] = pieceId，空位為 -1 */
  occupancy: number[];
  currentSeat: number;
  /** 每成功走一步（或跳過一回合）+1，用於防止重複提交 */
  turnNumber: number;
  winnerSeat: number | null;
  /** 遊戲是否結束（有人獲勝或剩餘可行動玩家不足） */
  over: boolean;
}

export interface MoveRecord {
  seat: number;
  pieceId: number;
  from: number;
  to: number;
  /** 完整移動路徑（含起點與終點），連跳時包含每個落點 */
  path: number[];
  jump: boolean;
}

export type MoveErrorCode =
  | 'GAME_OVER'
  | 'NOT_YOUR_TURN'
  | 'INVALID_CELL'
  | 'NOT_YOUR_PIECE'
  | 'ILLEGAL_MOVE';

export type MoveResult =
  | { ok: true; state: GameState; move: MoveRecord }
  | { ok: false; code: MoveErrorCode; message: string };

export function createGame(numPlayers: number, rules: RuleOptions = DEFAULT_RULES): GameState {
  const zones = SEAT_ZONES[numPlayers];
  if (!zones) throw new Error(`不支援的玩家人數：${numPlayers}`);
  const occupancy = new Array<number>(BOARD_SIZE).fill(-1);
  const pieces: Piece[] = [];
  const seats: SeatState[] = zones.map((zone, seat) => {
    for (const cell of ZONE_CELLS[zone]!) {
      const id = pieces.length;
      pieces.push({ id, seat, cell });
      occupancy[cell] = id;
    }
    return { zone, goalZone: oppositeZone(zone), active: true };
  });
  return {
    rules: { ...rules },
    seats,
    pieces,
    occupancy,
    currentSeat: 0,
    turnNumber: 1,
    winnerSeat: null,
    over: false,
  };
}

/**
 * 計算某顆棋子的所有合法落點。
 * 回傳 Map<落點, 路徑>；路徑含起點與終點。
 * - 可走到相鄰空位（一步）
 * - 或跳過相鄰棋子落在其後方空位，可連續跳躍、可改變方向
 * - 一步移動與跳躍不可混用；不可落在被佔據的棋位
 */
export function getLegalMoves(state: GameState, from: number): Map<number, number[]> {
  const result = new Map<number, number[]>();
  if (!isValidCellId(from)) return result;
  const pieceId = state.occupancy[from]!;
  if (pieceId < 0) return result;
  const piece = state.pieces[pieceId]!;
  const occupied = (cell: number) => cell !== from && state.occupancy[cell]! >= 0;

  // 一步移動
  for (const n of NEIGHBORS[from]!) {
    if (n >= 0 && !occupied(n)) result.set(n, [from, n]);
  }

  // 連續跳躍（BFS，取得最短跳躍路徑）
  const visited = new Set<number>([from]);
  const queue: number[][] = [[from]];
  while (queue.length > 0) {
    const path = queue.shift()!;
    const at = path[path.length - 1]!;
    for (const { over, land } of JUMPS[at]!) {
      if (over < 0 || land < 0) continue;
      if (!occupied(over) || occupied(land) || visited.has(land)) continue;
      visited.add(land);
      const next = [...path, land];
      result.set(land, next);
      queue.push(next);
    }
  }

  // 目標區鎖定：已在目標區的棋子不能移出
  if (state.rules.goalLock) {
    const goal = state.seats[piece.seat]!.goalZone;
    if (CELLS[from]!.zone === goal) {
      for (const to of [...result.keys()]) {
        if (CELLS[to]!.zone !== goal) result.delete(to);
      }
    }
  }
  return result;
}

export function hasAnyMove(state: GameState, seat: number): boolean {
  return state.pieces.some((p) => p.seat === seat && getLegalMoves(state, p.cell).size > 0);
}

export function hasWon(state: GameState, seat: number): boolean {
  const s = state.seats[seat];
  if (!s) return false;
  const goalCells = ZONE_CELLS[s.goalZone]!;
  let own = 0;
  let filled = 0;
  for (const cell of goalCells) {
    const pid = state.occupancy[cell]!;
    if (pid < 0) continue;
    filled++;
    if (state.pieces[pid]!.seat === seat) own++;
  }
  if (own === PIECES_PER_PLAYER) return true;
  return state.rules.antiBlocking && filled === goalCells.length && own > 0;
}

export function activeSeatCount(state: GameState): number {
  return state.seats.filter((s) => s.active).length;
}

/** 移到下一位仍在場的玩家；沒人可動時結束遊戲 */
export function advanceTurn(state: GameState): GameState {
  if (state.over) return state;
  const next = { ...state, turnNumber: state.turnNumber + 1 };
  const n = state.seats.length;
  for (let i = 1; i <= n; i++) {
    const seat = (state.currentSeat + i) % n;
    if (!state.seats[seat]!.active) continue;
    if (!hasAnyMove(state, seat)) continue;
    next.currentSeat = seat;
    return next;
  }
  return { ...next, over: true };
}

export function applyMove(state: GameState, seat: number, from: number, to: number): MoveResult {
  if (state.over) return { ok: false, code: 'GAME_OVER', message: '遊戲已結束' };
  if (seat !== state.currentSeat) return { ok: false, code: 'NOT_YOUR_TURN', message: '還沒輪到你' };
  if (!isValidCellId(from) || !isValidCellId(to)) {
    return { ok: false, code: 'INVALID_CELL', message: '無效的棋位' };
  }
  const pieceId = state.occupancy[from]!;
  if (pieceId < 0 || state.pieces[pieceId]!.seat !== seat) {
    return { ok: false, code: 'NOT_YOUR_PIECE', message: '只能移動自己的棋子' };
  }
  const path = getLegalMoves(state, from).get(to);
  if (!path) return { ok: false, code: 'ILLEGAL_MOVE', message: '不合法的移動' };

  const occupancy = state.occupancy.slice();
  occupancy[from] = -1;
  occupancy[to] = pieceId;
  const pieces = state.pieces.map((p) => (p.id === pieceId ? { ...p, cell: to } : p));
  const jump = !NEIGHBORS[from]!.includes(to) || path.length > 2;
  let next: GameState = { ...state, occupancy, pieces };
  const move: MoveRecord = { seat, pieceId, from, to, path, jump };

  if (hasWon(next, seat)) {
    next = { ...next, winnerSeat: seat, over: true, turnNumber: state.turnNumber + 1 };
  } else {
    next = advanceTurn(next);
  }
  return { ok: true, state: next, move };
}

/** 玩家離開或逾時未回來：標記為離場，若輪到他則跳到下一位 */
export function deactivateSeat(state: GameState, seat: number): GameState {
  const s = state.seats[seat];
  if (!s || !s.active) return state;
  const seats = state.seats.map((x, i) => (i === seat ? { ...x, active: false } : x));
  let next: GameState = { ...state, seats };
  if (state.over) return next;
  const remaining = seats.map((x, i) => (x.active ? i : -1)).filter((i) => i >= 0);
  if (remaining.length === 1) {
    return { ...next, over: true, winnerSeat: remaining[0]!, turnNumber: state.turnNumber + 1 };
  }
  if (remaining.length === 0) return { ...next, over: true };
  if (state.currentSeat === seat) next = advanceTurn(next);
  return next;
}

function hexDistance(a: number, b: number): number {
  const ca = CELLS[a]!;
  const cb = CELLS[b]!;
  return (Math.abs(ca.q - cb.q) + Math.abs(ca.r - cb.r) + Math.abs(ca.s - cb.s)) / 2;
}

/** 目標角落的尖端棋位（距離中心最遠） */
function zoneTip(zone: number): number {
  let best = -1;
  let bestD = -1;
  for (const id of ZONE_CELLS[zone]!) {
    const c = CELLS[id]!;
    const d = Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.s));
    if (d > bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

export interface SeatProgress {
  seat: number;
  inGoal: number;
  /** 所有棋子到目標尖端的距離總和（越小越接近完成） */
  distance: number;
}

export function seatProgress(state: GameState, seat: number): SeatProgress {
  const goal = state.seats[seat]!.goalZone;
  const tip = zoneTip(goal);
  let inGoal = 0;
  let distance = 0;
  for (const p of state.pieces) {
    if (p.seat !== seat) continue;
    if (CELLS[p.cell]!.zone === goal) inGoal++;
    distance += hexDistance(p.cell, tip);
  }
  return { seat, inGoal, distance };
}

/** 結算排名：勝者第一，其餘依進入目標區棋子數、距離排序 */
export function rankSeats(state: GameState): SeatProgress[] {
  return state.seats
    .map((_, seat) => seatProgress(state, seat))
    .sort((a, b) => {
      if (a.seat === state.winnerSeat) return -1;
      if (b.seat === state.winnerSeat) return 1;
      return b.inGoal - a.inGoal || a.distance - b.distance;
    });
}

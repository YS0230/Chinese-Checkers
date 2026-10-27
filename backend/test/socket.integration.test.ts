import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  DEFAULT_ROOM_RULES,
  getLegalMoves,
  type ClientToServerEvents,
  type GameView,
  type JoinedRoom,
  type PublicRoomSummary,
  type ServerToClientEvents,
} from '@starry/shared';
import { SOCKET_PATH, createGameServer, type GameServer } from '../src/app.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: GameServer;
let url: string;
let staticDir: string;
const clients: Client[] = [];

function client(): Promise<Client> {
  const s: Client = connect(url, { path: SOCKET_PATH, transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(s);
  return new Promise((resolve, reject) => {
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

function next<E extends keyof ServerToClientEvents>(
  s: Client,
  event: E,
  predicate: (...args: Parameters<ServerToClientEvents[E]>) => boolean = () => true,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${String(event)}`)), 5000);
    const handler = (...args: Parameters<ServerToClientEvents[E]>) => {
      if (!predicate(...args)) return;
      clearTimeout(timer);
      (s.off as (e: string, h: unknown) => void)(event as string, handler);
      resolve(args[0]);
    };
    (s.on as (e: string, h: unknown) => void)(event as string, handler);
  });
}

async function ok<T>(p: Promise<{ ok: true; data: T } | { ok: false; error: { code: string } }>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.data;
}

function firstLegal(game: GameView, seat: number) {
  for (const p of game.state.pieces) {
    if (p.seat !== seat) continue;
    const m = getLegalMoves(game.state, p.cell);
    if (m.size) return { from: p.cell, to: [...m.keys()].at(-1)!, turnNumber: game.state.turnNumber };
  }
  throw new Error('no legal move');
}

const roomPayload = (isPublic = true) => ({
  nickname: 'Alice',
  roomName: 'Alice 的房間',
  isPublic,
  maxPlayers: 2,
  rules: DEFAULT_ROOM_RULES,
});

/** 建立兩人房並開始遊戲 */
async function startTwoPlayerGame() {
  const a = await client();
  const b = await client();
  const ja = await ok<JoinedRoom>(a.emitWithAck('createRoom', roomPayload()));
  const jb = await ok<JoinedRoom>(b.emitWithAck('joinRoom', { code: ja.room.code, nickname: 'Bob' }));
  await ok(b.emitWithAck('playerReady', { ready: true }));
  const ga = next(a, 'gameStateUpdated');
  const gb = next(b, 'gameStateUpdated');
  await ok(a.emitWithAck('startGame'));
  const [gameA, gameB] = await Promise.all([ga, gb]);
  return { a, b, ja, jb, gameA, gameB };
}

beforeEach(async () => {
  staticDir = mkdtempSync(path.join(tmpdir(), 'starry-static-'));
  writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>Starry</title>');
  server = createGameServer({ staticDir, config: { lobbyThrottleMs: 10, disconnectedTurnSkipMs: 300 } });
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await server.close();
  rmSync(staticDir, { recursive: true, force: true });
});

describe('HTTP', () => {
  it('健康檢查與 SPA fallback', async () => {
    const health = await fetch(`${url}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });
    const spa = await fetch(`${url}/room/ABCDEF`);
    expect(spa.status).toBe(200);
    expect(await spa.text()).toContain('Starry');
  });
});

describe('Socket.IO 即時連線', () => {
  it('兩名玩家的遊戲狀態同步', async () => {
    const { a, b, gameA, gameB } = await startTwoPlayerGame();
    expect(gameA).toEqual(gameB);
    expect(gameA.seats.map((s) => s.nickname)).toEqual(['Alice', 'Bob']);

    const mv = firstLegal(gameA, 0);
    const ua = next(a, 'gameStateUpdated');
    const ub = next(b, 'gameStateUpdated');
    const turnB = next(b, 'turnChanged');
    await ok(a.emitWithAck('makeMove', mv));
    const [afterA, afterB, turn] = await Promise.all([ua, ub, turnB]);
    expect(afterA).toEqual(afterB);
    expect(afterA.state.occupancy[mv.to]).toBeGreaterThanOrEqual(0);
    expect(afterA.lastMove).toMatchObject({ from: mv.from, to: mv.to });
    expect(turn.currentSeat).toBe(1);
  });

  it('伺服器拒絕非法操作', async () => {
    const { a, b, gameA } = await startTwoPlayerGame();
    const mv = firstLegal(gameA, 0);
    // Bob 試圖在 Alice 的回合移動 Alice 的棋子
    const r1 = await b.emitWithAck('makeMove', mv);
    expect(r1).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
    // 偽造落點
    const r2 = await a.emitWithAck('makeMove', { from: mv.from, to: 60, turnNumber: mv.turnNumber });
    expect(r2.ok).toBe(false);
    // 偽造資料型別
    const r3 = await a.emitWithAck('makeMove', { from: '1; drop', to: null, turnNumber: 1 } as never);
    expect(r3).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    // 非房主不能開始 / 未在房間的連線不能操作
    const c = await client();
    const r4 = await c.emitWithAck('makeMove', mv);
    expect(r4).toMatchObject({ ok: false, error: { code: 'NOT_IN_ROOM' } });
  });

  it('斷線後以 token 重新連線並取回遊戲狀態', async () => {
    const { b, ja, jb } = await startTwoPlayerGame();
    b.disconnect();
    const b2 = await client();
    const back = await ok<JoinedRoom>(b2.emitWithAck('reconnectPlayer', { code: ja.room.code, token: jb.you.token }));
    expect(back.you.playerId).toBe(jb.you.playerId);
    expect(back.game).not.toBeNull();
    expect(back.room.players.find((p) => p.id === jb.you.playerId)!.connected).toBe(true);
    // 錯誤的 token 不能冒用身分
    const c = await client();
    const bad = await c.emitWithAck('reconnectPlayer', { code: ja.room.code, token: 'x'.repeat(32) });
    expect(bad).toMatchObject({ ok: false, error: { code: 'SESSION_INVALID' } });
  });

  it('斷線玩家的回合會被跳過', async () => {
    const { a, b } = await startTwoPlayerGame();
    const skipped = next(b, 'turnChanged', (t) => t.skipped);
    a.disconnect();
    const t = await skipped;
    expect(t.currentSeat).toBe(1);
  });

  it('公開房間列表即時更新，私人房間不出現', async () => {
    const watcher = await client();
    const initial = next(watcher, 'publicRoomsUpdated');
    watcher.emit('subscribeLobby');
    expect(await initial).toEqual([]);

    const a = await client();
    const created = next(watcher, 'publicRoomsUpdated', (rooms) => rooms.length === 1);
    const ja = await ok<JoinedRoom>(a.emitWithAck('createRoom', roomPayload()));
    const list1 = (await created) as PublicRoomSummary[];
    expect(list1[0]).toMatchObject({ code: ja.room.code, playerCount: 1, status: 'waiting' });

    const b = await client();
    const joined = next(watcher, 'publicRoomsUpdated', (rooms) => rooms[0]?.playerCount === 2);
    await ok(b.emitWithAck('joinRoom', { code: ja.room.code, nickname: 'Bob' }));
    expect(((await joined) as PublicRoomSummary[])[0]!.joinable).toBe(false);

    const p = await client();
    await ok(p.emitWithAck('createRoom', roomPayload(false)));
    const list = await ok<PublicRoomSummary[]>(watcher.emitWithAck('getPublicRooms'));
    expect(list).toHaveLength(1);

    const gone = next(watcher, 'publicRoomsUpdated', (rooms) => rooms.length === 0);
    await ok(a.emitWithAck('leaveRoom'));
    await ok(b.emitWithAck('leaveRoom'));
    await gone;
  });

  it('聊天訊息廣播並做頻率限制', async () => {
    const { a, b } = await startTwoPlayerGame();
    const msg = next(b, 'chatMessage', (m) => !m.system);
    await ok(a.emitWithAck('chatMessage', { text: '  加油 <b>!</b> ' }));
    expect((await msg).text).toBe('加油 <b>!</b>');
    const results = await Promise.all(Array.from({ length: 8 }, () => a.emitWithAck('chatMessage', { text: 'spam' })));
    expect(results.some((r) => !r.ok && r.error.code === 'RATE_LIMITED')).toBe(true);
  });
});

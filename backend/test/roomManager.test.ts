import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROOM_RULES, getLegalMoves, type JoinedRoom } from '@starry/shared';
import { RoomManager, type Emitter } from '../src/roomManager.js';

interface Sent {
  target: string;
  event: string;
  args: unknown[];
}

function fakeEmitter() {
  const sent: Sent[] = [];
  const channels = new Map<string, Set<string>>();
  let lobby = 0;
  const emitter: Emitter = {
    toRoom: (code, event, ...args) => sent.push({ target: `room:${code}`, event, args }),
    toSocket: (id, event, ...args) => sent.push({ target: `socket:${id}`, event, args }),
    joinChannel: (id, code) => {
      if (!channels.has(code)) channels.set(code, new Set());
      channels.get(code)!.add(id);
    },
    leaveChannel: (id, code) => channels.get(code)?.delete(id),
    lobbyChanged: () => {
      lobby++;
    },
  };
  return { emitter, sent, channels, lobbyCount: () => lobby };
}

const createPayload = (over: Record<string, unknown> = {}) => ({
  nickname: '房主',
  roomName: '測試房',
  isPublic: true,
  maxPlayers: 2,
  rules: DEFAULT_ROOM_RULES,
  ...over,
});

function unwrap<T>(r: { ok: true; data: T } | { ok: false; error: { code: string } }): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.data;
}

describe('RoomManager', () => {
  let fx: ReturnType<typeof fakeEmitter>;
  let m: RoomManager;

  beforeEach(() => {
    vi.useFakeTimers();
    fx = fakeEmitter();
    m = new RoomManager(fx.emitter, {
      reconnectGraceMs: 1000,
      disconnectedTurnSkipMs: 500,
      waitingRoomIdleMs: 5000,
      finishedRoomTtlMs: 3000,
    });
  });
  afterEach(() => {
    m.dispose();
    vi.useRealTimers();
  });

  it('建立公開房間：6 碼代碼、出現在大廳、私密 token 不出現在玩家資料中', () => {
    const r = unwrap(m.createRoom('s1', createPayload()));
    expect(r.room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(r.room.players).toHaveLength(1);
    expect(r.room.players[0]!.isHost).toBe(true);
    expect(r.you.token.length).toBeGreaterThan(20);
    expect(JSON.stringify(r.room)).not.toContain(r.you.token);
    const list = m.listPublicRooms();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ code: r.room.code, hostName: '房主', playerCount: 1, maxPlayers: 2, joinable: true });
  });

  it('建立私人房間：8 碼代碼、不顯示在公開大廳，但可以透過代碼加入', () => {
    const r = unwrap(m.createRoom('s1', createPayload({ isPublic: false })));
    expect(r.room.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(m.listPublicRooms()).toHaveLength(0);
    const j = unwrap(m.joinRoom('s2', { code: r.room.code.toLowerCase(), nickname: '好友' }));
    expect(j.room.players).toHaveLength(2);
  });

  it('拒絕無效的建立資料', () => {
    expect(m.createRoom('s1', createPayload({ nickname: '   ' }))).toMatchObject({ ok: false });
    expect(m.createRoom('s1', createPayload({ maxPlayers: 7 }))).toMatchObject({ ok: false });
    expect(m.createRoom('s1', createPayload({ rules: { goalLock: 'x' } }))).toMatchObject({ ok: false });
    expect(m.createRoom('s1', null)).toMatchObject({ ok: false });
  });

  it('加入房間：分配不同顏色、重複暱稱自動加後綴', () => {
    const r = unwrap(m.createRoom('s1', createPayload({ maxPlayers: 3 })));
    const j = unwrap(m.joinRoom('s2', { code: r.room.code, nickname: '房主' }));
    const colors = j.room.players.map((p) => p.colorIndex);
    expect(new Set(colors).size).toBe(2);
    expect(j.room.players[1]!.nickname).toBe('房主#2');
    expect(fx.sent.some((s) => s.event === 'playerJoined')).toBe(true);
  });

  it('房間代碼錯誤或不存在時回報錯誤', () => {
    expect(m.joinRoom('s2', { code: '!!', nickname: 'a' })).toMatchObject({ ok: false, error: { code: 'ROOM_NOT_FOUND' } });
    expect(m.joinRoom('s2', { code: 'ABCDEF', nickname: 'a' })).toMatchObject({ ok: false, error: { code: 'ROOM_NOT_FOUND' } });
  });

  it('滿員時拒絕加入', () => {
    const r = unwrap(m.createRoom('s1', createPayload({ maxPlayers: 2 })));
    unwrap(m.joinRoom('s2', { code: r.room.code, nickname: 'B' }));
    expect(m.joinRoom('s3', { code: r.room.code, nickname: 'C' })).toMatchObject({ ok: false, error: { code: 'ROOM_FULL' } });
    expect(m.listPublicRooms()[0]!.joinable).toBe(false);
  });

  it('開始遊戲需要所有人準備；開始後拒絕加入', () => {
    const r = unwrap(m.createRoom('s1', createPayload({ maxPlayers: 3 })));
    unwrap(m.joinRoom('s2', { code: r.room.code, nickname: 'B' }));
    expect(m.startGame('s2')).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    expect(m.startGame('s1')).toMatchObject({ ok: false, error: { code: 'PLAYERS_NOT_READY' } });
    unwrap(m.setReady('s2', { ready: true }));
    expect(m.getRoomView(r.room.code)!.status).toBe('ready');
    unwrap(m.startGame('s1'));
    expect(m.getRoomView(r.room.code)!.status).toBe('playing');
    expect(m.joinRoom('s3', { code: r.room.code, nickname: 'C' })).toMatchObject({ ok: false, error: { code: 'ROOM_STARTED' } });
  });

  it('只有 1 人時不能開始', () => {
    unwrap(m.createRoom('s1', createPayload()));
    expect(m.startGame('s1')).toMatchObject({ ok: false, error: { code: 'NOT_ENOUGH_PLAYERS' } });
  });

  it('玩家離開會通知房間並更新人數', () => {
    const r = unwrap(m.createRoom('s1', createPayload({ maxPlayers: 3 })));
    unwrap(m.joinRoom('s2', { code: r.room.code, nickname: 'B' }));
    unwrap(m.leave('s2'));
    expect(m.getRoomView(r.room.code)!.players).toHaveLength(1);
    expect(fx.sent.some((s) => s.event === 'playerLeft')).toBe(true);
    expect(m.leave('s2')).toMatchObject({ ok: false, error: { code: 'NOT_IN_ROOM' } });
  });

  it('房主離開時移交房主；最後一人離開時清除房間', () => {
    const r = unwrap(m.createRoom('s1', createPayload({ maxPlayers: 3 })));
    const j = unwrap(m.joinRoom('s2', { code: r.room.code, nickname: 'B' }));
    unwrap(m.leave('s1'));
    const view = m.getRoomView(r.room.code)!;
    expect(view.hostId).toBe(j.you.playerId);
    expect(view.players[0]!.isHost).toBe(true);
    unwrap(m.leave('s2'));
    expect(m.hasRoom(r.room.code)).toBe(false);
    expect(m.roomCount).toBe(0);
  });

  it('房主可以移除玩家，非房主不行', () => {
    const r = unwrap(m.createRoom('s1', createPayload({ maxPlayers: 3 })));
    const b = unwrap(m.joinRoom('s2', { code: r.room.code, nickname: 'B' }));
    const c = unwrap(m.joinRoom('s3', { code: r.room.code, nickname: 'C' }));
    expect(m.kick('s2', { playerId: c.you.playerId })).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    unwrap(m.kick('s1', { playerId: b.you.playerId }));
    expect(fx.sent.some((s) => s.target === 'socket:s2' && s.event === 'kicked')).toBe(true);
    expect(m.getRoomView(r.room.code)!.players.map((p) => p.nickname)).toEqual(['房主', 'C']);
    expect(m.sessionOf('s2')).toBeUndefined();
  });

  it('斷線後可在時限內用 token 重新連線；逾時則移除', () => {
    const r = unwrap(m.createRoom('s1', createPayload({ maxPlayers: 3 })));
    const b = unwrap(m.joinRoom('s2', { code: r.room.code, nickname: 'B' }));
    m.disconnect('s2');
    expect(m.getRoomView(r.room.code)!.players[1]!.connected).toBe(false);
    expect(m.reconnect('s2b', { code: r.room.code, token: 'wrong' })).toMatchObject({ ok: false, error: { code: 'SESSION_INVALID' } });
    const back = unwrap(m.reconnect('s2b', { code: r.room.code, token: b.you.token }));
    expect(back.you.playerId).toBe(b.you.playerId);
    expect(m.getRoomView(r.room.code)!.players[1]!.connected).toBe(true);

    m.disconnect('s2b');
    vi.advanceTimersByTime(1100);
    expect(m.getRoomView(r.room.code)!.players).toHaveLength(1);
  });

  it('預設保留座位 3 分鐘：關閉分頁 2 分鐘後仍可接回，超過則移除', () => {
    const mm = new RoomManager(fx.emitter, { waitingRoomIdleMs: 60 * 60_000 });
    const r = unwrap(mm.createRoom('h1', createPayload({ maxPlayers: 3 })));
    const b = unwrap(mm.joinRoom('h2', { code: r.room.code, nickname: 'B' }));
    mm.disconnect('h2');
    vi.advanceTimersByTime(120_000);
    unwrap(mm.reconnect('h2-new-tab', { code: r.room.code, token: b.you.token }));
    mm.disconnect('h2-new-tab');
    vi.advanceTimersByTime(181_000);
    expect(mm.getRoomView(r.room.code)!.players).toHaveLength(1);
    mm.dispose();
  });

  it('等待中的房間閒置逾時會被清除；全員斷線也會清除', () => {
    const r = unwrap(m.createRoom('s1', createPayload()));
    vi.advanceTimersByTime(5100);
    expect(m.hasRoom(r.room.code)).toBe(false);

    const r2 = unwrap(m.createRoom('s9', createPayload()));
    m.disconnect('s9');
    vi.advanceTimersByTime(1100);
    expect(m.hasRoom(r2.room.code)).toBe(false);
  });

  describe('遊戲進行', () => {
    let code: string;
    let host: JoinedRoom;
    let guest: JoinedRoom;

    beforeEach(() => {
      host = unwrap(m.createRoom('s1', createPayload()));
      code = host.room.code;
      guest = unwrap(m.joinRoom('s2', { code, nickname: 'B' }));
      unwrap(m.setReady('s2', { ready: true }));
      unwrap(m.startGame('s1'));
    });

    function lastGame() {
      const e = [...fx.sent].reverse().find((s) => s.event === 'gameStateUpdated')!;
      return e.args[0] as import('@starry/shared').GameView;
    }

    function firstLegal(seat: number) {
      const g = lastGame().state;
      for (const p of g.pieces) {
        if (p.seat !== seat) continue;
        const moves = getLegalMoves(g, p.cell);
        if (moves.size) return { from: p.cell, to: [...moves.keys()][0]!, turnNumber: g.turnNumber };
      }
      throw new Error('no move');
    }

    it('伺服器驗證棋步：越權、非法、重複提交都被拒絕', () => {
      const mv = firstLegal(0);
      expect(m.makeMove('s2', mv)).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
      expect(m.makeMove('s1', { ...mv, to: mv.from })).toMatchObject({ ok: false, error: { code: 'ILLEGAL_MOVE' } });
      expect(m.makeMove('s1', { from: 'x', to: 3, turnNumber: 1 })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
      expect(m.makeMove('outsider', mv)).toMatchObject({ ok: false, error: { code: 'NOT_IN_ROOM' } });
      unwrap(m.makeMove('s1', mv));
      // 同一步再送一次 → 回合編號已過期
      expect(m.makeMove('s1', mv)).toMatchObject({ ok: false, error: { code: 'STALE_TURN' } });
      expect(lastGame().state.currentSeat).toBe(1);
      expect(lastGame().lastMove?.from).toBe(mv.from);
      unwrap(m.makeMove('s2', firstLegal(1)));
      expect(lastGame().state.currentSeat).toBe(0);
    });

    it('目前玩家斷線時，會在時限後自動跳過回合', () => {
      m.disconnect('s1');
      vi.advanceTimersByTime(600);
      expect(lastGame().state.currentSeat).toBe(1);
      expect(fx.sent.some((s) => s.event === 'turnChanged' && (s.args[0] as { skipped: boolean }).skipped)).toBe(true);
    });

    it('對手離開時剩下的玩家獲勝，房間進入已結束並在 TTL 後清除', () => {
      unwrap(m.leave('s2'));
      const over = fx.sent.find((s) => s.event === 'gameOver')!;
      expect(over.args[0]).toMatchObject({ winnerId: host.you.playerId, reason: 'forfeit' });
      expect(m.getRoomView(code)!.status).toBe('finished');
      unwrap(m.returnToRoom('s1'));
      expect(m.getRoomView(code)!.status).toBe('waiting');
      // 回到等待室後只剩 1 人，閒置逾時清除
      vi.advanceTimersByTime(5100);
      expect(m.hasRoom(code)).toBe(false);
      void guest;
    });

    it('限時回合：逾時自動換人', () => {
      m.dispose();
      fx = fakeEmitter();
      m = new RoomManager(fx.emitter);
      const h = unwrap(m.createRoom('a', createPayload({ rules: { ...DEFAULT_ROOM_RULES, turnTimeLimit: 30 } })));
      unwrap(m.joinRoom('b', { code: h.room.code, nickname: 'B' }));
      unwrap(m.setReady('b', { ready: true }));
      unwrap(m.startGame('a'));
      expect(lastGame().turnDeadline).toBeGreaterThan(Date.now());
      vi.advanceTimersByTime(30_100);
      expect(lastGame().state.currentSeat).toBe(1);
    });
  });
});

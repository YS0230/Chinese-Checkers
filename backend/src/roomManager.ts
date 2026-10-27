/**
 * 房間與遊戲狀態管理（全部存放於記憶體）。
 * 伺服器是唯一權威來源：所有操作以 socketId → 玩家 的對應判定身分，
 * 絕不信任客戶端傳入的玩家 ID。
 */
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  CHAT_HISTORY,
  CHAT_MAX,
  PLAYER_COLORS,
  PRIVATE_CODE_LENGTH,
  PUBLIC_CODE_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_NAME_MAX,
  advanceTurn,
  applyMove,
  createGame,
  deactivateSeat,
  hasWon,
  isValidCellId,
  normalizeRoomCode,
  rankSeats,
  sanitizeText,
  validateMaxPlayers,
  validateNickname,
  validateRules,
  type AckResponse,
  type ChatMessage,
  type ErrorCode,
  type GameOverPayload,
  type GameState,
  type GameView,
  type JoinedRoom,
  type MoveRecord,
  type PlayerLeftPayload,
  type PlayerView,
  type PublicRoomSummary,
  type RoomRules,
  type RoomStatus,
  type RoomView,
  type ServerToClientEvents,
} from '@starry/shared';
import { DEFAULT_CONFIG, type ServerConfig } from './config.js';

type S2C = ServerToClientEvents;

/** 讓房間管理器與 Socket.IO 解耦，方便單元測試 */
export interface Emitter {
  toRoom<E extends keyof S2C>(code: string, event: E, ...args: Parameters<S2C[E]>): void;
  toSocket<E extends keyof S2C>(socketId: string, event: E, ...args: Parameters<S2C[E]>): void;
  joinChannel(socketId: string, code: string): void;
  leaveChannel(socketId: string, code: string): void;
  lobbyChanged(): void;
}

interface Player {
  id: string;
  token: string;
  nickname: string;
  colorIndex: number;
  ready: boolean;
  socketId: string | null;
  disconnectedAt: number | null;
  graceTimer: NodeJS.Timeout | null;
}

interface SeatRecord {
  playerId: string;
  nickname: string;
  colorIndex: number;
}

interface Room {
  code: string;
  name: string;
  isPublic: boolean;
  maxPlayers: number;
  rules: RoomRules;
  hostId: string;
  players: Player[];
  game: GameState | null;
  seats: SeatRecord[];
  lastMove: MoveRecord | null;
  turnStartedAt: number;
  turnDeadline: number | null;
  turnTimer: NodeJS.Timeout | null;
  result: GameOverPayload | null;
  chat: ChatMessage[];
  createdAt: number;
  startedAt: number | null;
  lifeTimer: NodeJS.Timeout | null;
}

type Result<T> = AckResponse<T>;

const fail = <T = never>(code: ErrorCode, message: string): Result<T> => ({ ok: false, error: { code, message } });
const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  /** socketId → 所在房間與玩家（身分判定的唯一依據） */
  private readonly sockets = new Map<string, { code: string; playerId: string }>();
  private readonly cfg: ServerConfig;

  constructor(
    private readonly emit: Emitter,
    config: Partial<ServerConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------- 查詢 ----------------

  get roomCount(): number {
    return this.rooms.size;
  }

  hasRoom(code: string): boolean {
    return this.rooms.has(code);
  }

  getRoomView(code: string): RoomView | null {
    const room = this.rooms.get(code);
    return room ? this.roomView(room) : null;
  }

  sessionOf(socketId: string): { code: string; playerId: string } | undefined {
    return this.sockets.get(socketId);
  }

  listPublicRooms(): PublicRoomSummary[] {
    const list: PublicRoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (!room.isPublic) continue;
      const status = this.status(room);
      const host = room.players.find((p) => p.id === room.hostId);
      list.push({
        code: room.code,
        name: room.name,
        hostName: host?.nickname ?? '—',
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers,
        status,
        colors: room.players.map((p) => p.colorIndex),
        rules: { ...room.rules },
        createdAt: room.createdAt,
        startedAt: room.startedAt,
        joinable: this.isJoinable(room),
      });
    }
    return list.sort((a, b) => Number(b.joinable) - Number(a.joinable) || b.createdAt - a.createdAt);
  }

  // ---------------- 房間操作 ----------------

  createRoom(socketId: string, payload: unknown): Result<JoinedRoom> {
    const p = (payload ?? {}) as Record<string, unknown>;
    const nickname = validateNickname(p.nickname);
    if (!nickname) return fail('BAD_REQUEST', '請輸入暱稱（1～16 字）');
    const maxPlayers = validateMaxPlayers(p.maxPlayers);
    if (!maxPlayers) return fail('BAD_REQUEST', '玩家人數需為 2～6 人');
    const rules = validateRules(p.rules);
    if (!rules) return fail('BAD_REQUEST', '無效的遊戲規則設定');
    if (typeof p.isPublic !== 'boolean') return fail('BAD_REQUEST', '請選擇公開或私人房間');
    const name = sanitizeText(p.roomName, ROOM_NAME_MAX) ?? `${nickname} 的房間`;
    if (this.rooms.size >= this.cfg.maxRooms) return fail('INTERNAL', '伺服器房間已滿，請稍後再試');

    this.leaveCurrent(socketId);
    const code = this.generateCode(p.isPublic ? PUBLIC_CODE_LENGTH : PRIVATE_CODE_LENGTH);
    const player = this.newPlayer(nickname, 0, socketId);
    const now = Date.now();
    const room: Room = {
      code,
      name,
      isPublic: p.isPublic,
      maxPlayers,
      rules,
      hostId: player.id,
      players: [player],
      game: null,
      seats: [],
      lastMove: null,
      turnStartedAt: 0,
      turnDeadline: null,
      turnTimer: null,
      result: null,
      chat: [],
      createdAt: now,
      startedAt: null,
      lifeTimer: null,
    };
    this.rooms.set(code, room);
    this.attach(socketId, room, player);
    this.systemChat(room, `${nickname} 建立了房間`);
    this.touch(room);
    this.emit.lobbyChanged();
    return ok(this.joinedPayload(room, player));
  }

  joinRoom(socketId: string, payload: unknown): Result<JoinedRoom> {
    const p = (payload ?? {}) as Record<string, unknown>;
    const code = normalizeRoomCode(p.code);
    if (!code) return fail('ROOM_NOT_FOUND', '房間代碼格式錯誤');
    const nickname = validateNickname(p.nickname);
    if (!nickname) return fail('BAD_REQUEST', '請輸入暱稱（1～16 字）');
    const room = this.rooms.get(code);
    if (!room) return fail('ROOM_NOT_FOUND', '找不到這個房間，可能已關閉');
    const current = this.sockets.get(socketId);
    if (current?.code === code) return fail('ALREADY_IN_ROOM', '你已經在這個房間裡');
    const status = this.status(room);
    if (status === 'playing') return fail('ROOM_STARTED', '遊戲已經開始，無法加入');
    if (status === 'finished') return fail('ROOM_CLOSED', '這場遊戲已結束');
    if (room.players.length >= room.maxPlayers) return fail('ROOM_FULL', '房間已滿');

    this.leaveCurrent(socketId);
    const used = new Set(room.players.map((x) => x.colorIndex));
    const colorIndex = PLAYER_COLORS.findIndex((_, i) => !used.has(i));
    const player = this.newPlayer(this.uniqueNickname(room, nickname), colorIndex, socketId);
    room.players.push(player);
    this.attach(socketId, room, player);
    this.emit.toRoom(code, 'playerJoined', { player: this.playerView(room, player) });
    this.systemChat(room, `${player.nickname} 加入了房間`);
    this.broadcastRoom(room);
    this.touch(room);
    return ok(this.joinedPayload(room, player));
  }

  reconnect(socketId: string, payload: unknown): Result<JoinedRoom> {
    const p = (payload ?? {}) as Record<string, unknown>;
    const code = normalizeRoomCode(p.code);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room) return fail('ROOM_NOT_FOUND', '房間已不存在');
    const player = typeof p.token === 'string' ? room.players.find((x) => safeEqual(x.token, p.token as string)) : undefined;
    if (!player) return fail('SESSION_INVALID', '連線階段已失效，請重新加入');

    const current = this.sockets.get(socketId);
    if (current && current.code !== room.code) this.leaveCurrent(socketId);

    if (player.socketId && player.socketId !== socketId) {
      // 同一位玩家在別處重新連線：舊連線讓位
      const old = player.socketId;
      this.sockets.delete(old);
      this.emit.leaveChannel(old, room.code);
      this.emit.toSocket(old, 'kicked', { reason: '你已在其他分頁或裝置重新連線' });
    }
    if (player.graceTimer) clearTimeout(player.graceTimer);
    player.graceTimer = null;
    const wasDisconnected = player.socketId === null;
    player.disconnectedAt = null;
    this.attach(socketId, room, player);
    if (wasDisconnected) this.systemChat(room, `${player.nickname} 重新連線`);
    this.broadcastRoom(room);
    if (room.game && !room.game.over) {
      this.scheduleTurnTimer(room);
      this.emit.toRoom(room.code, 'gameStateUpdated', this.gameView(room));
    }
    return ok(this.joinedPayload(room, player));
  }

  leave(socketId: string): Result<null> {
    const ctx = this.context(socketId);
    if (!ctx) return fail('NOT_IN_ROOM', '你不在任何房間中');
    this.removePlayer(ctx.room, ctx.player, 'left');
    return ok(null);
  }

  /** Socket 斷線：保留座位一段時間等待重連 */
  disconnect(socketId: string): void {
    const ctx = this.context(socketId);
    if (!ctx) return;
    const { room, player } = ctx;
    this.sockets.delete(socketId);
    player.socketId = null;
    player.disconnectedAt = Date.now();
    player.graceTimer = setTimeout(() => {
      player.graceTimer = null;
      if (this.rooms.get(room.code) === room && room.players.includes(player) && !player.socketId) {
        this.removePlayer(room, player, 'timeout');
      }
    }, this.cfg.reconnectGraceMs);
    this.broadcastRoom(room);
    if (room.game && !room.game.over) {
      this.scheduleTurnTimer(room);
      this.emit.toRoom(room.code, 'gameStateUpdated', this.gameView(room));
    }
  }

  setReady(socketId: string, payload: unknown): Result<null> {
    const ctx = this.context(socketId);
    if (!ctx) return fail('NOT_IN_ROOM', '你不在任何房間中');
    const ready = (payload as { ready?: unknown } | null)?.ready;
    if (typeof ready !== 'boolean') return fail('BAD_REQUEST', '無效的準備狀態');
    if (ctx.room.game) return fail('ROOM_STARTED', '遊戲已開始');
    ctx.player.ready = ready;
    this.emit.toRoom(ctx.room.code, 'playerReady', { playerId: ctx.player.id, ready });
    this.broadcastRoom(ctx.room);
    this.touch(ctx.room);
    return ok(null);
  }

  kick(socketId: string, payload: unknown): Result<null> {
    const ctx = this.context(socketId);
    if (!ctx) return fail('NOT_IN_ROOM', '你不在任何房間中');
    const { room, player } = ctx;
    if (room.hostId !== player.id) return fail('NOT_HOST', '只有房主可以移除玩家');
    if (room.game) return fail('ROOM_STARTED', '遊戲開始後不能移除玩家');
    const targetId = (payload as { playerId?: unknown } | null)?.playerId;
    const target = room.players.find((x) => x.id === targetId);
    if (!target || target === player) return fail('BAD_REQUEST', '找不到要移除的玩家');
    if (target.socketId) this.emit.toSocket(target.socketId, 'kicked', { reason: '你已被房主移出房間' });
    this.removePlayer(room, target, 'kicked');
    return ok(null);
  }

  updateSettings(socketId: string, payload: unknown): Result<null> {
    const ctx = this.context(socketId);
    if (!ctx) return fail('NOT_IN_ROOM', '你不在任何房間中');
    const { room, player } = ctx;
    if (room.hostId !== player.id) return fail('NOT_HOST', '只有房主可以修改設定');
    if (room.game) return fail('ROOM_STARTED', '遊戲已開始');
    const p = (payload ?? {}) as Record<string, unknown>;
    if (p.roomName !== undefined) {
      const name = sanitizeText(p.roomName, ROOM_NAME_MAX);
      if (!name) return fail('BAD_REQUEST', '房間名稱無效');
      room.name = name;
    }
    if (p.isPublic !== undefined) {
      if (typeof p.isPublic !== 'boolean') return fail('BAD_REQUEST', '無效的房間類型');
      room.isPublic = p.isPublic;
    }
    if (p.maxPlayers !== undefined) {
      const max = validateMaxPlayers(p.maxPlayers);
      if (!max) return fail('BAD_REQUEST', '玩家人數需為 2～6 人');
      if (max < room.players.length) return fail('BAD_REQUEST', '人數上限不能少於目前玩家數');
      room.maxPlayers = max;
    }
    if (p.rules !== undefined) {
      const rules = validateRules(p.rules);
      if (!rules) return fail('BAD_REQUEST', '無效的遊戲規則設定');
      room.rules = rules;
      for (const x of room.players) x.ready = false;
    }
    this.systemChat(room, '房主更新了房間設定');
    this.broadcastRoom(room);
    this.touch(room);
    return ok(null);
  }

  startGame(socketId: string): Result<null> {
    const ctx = this.context(socketId);
    if (!ctx) return fail('NOT_IN_ROOM', '你不在任何房間中');
    const { room, player } = ctx;
    if (room.hostId !== player.id) return fail('NOT_HOST', '只有房主可以開始遊戲');
    if (room.game) return fail('ROOM_STARTED', '遊戲已經開始');
    if (room.players.length < 2) return fail('NOT_ENOUGH_PLAYERS', '至少需要 2 位玩家');
    if (room.players.some((x) => !x.socketId)) return fail('PLAYERS_NOT_READY', '有玩家尚未連線');
    if (room.players.some((x) => x.id !== room.hostId && !x.ready)) {
      return fail('PLAYERS_NOT_READY', '還有玩家尚未準備');
    }
    room.game = createGame(room.players.length, room.rules);
    room.seats = room.players.map((x) => ({ playerId: x.id, nickname: x.nickname, colorIndex: x.colorIndex }));
    room.lastMove = null;
    room.result = null;
    room.startedAt = Date.now();
    room.turnStartedAt = Date.now();
    this.scheduleTurnTimer(room);
    this.systemChat(room, `遊戲開始！共 ${room.seats.length} 位玩家`);
    this.broadcastRoom(room);
    this.emit.toRoom(room.code, 'gameStateUpdated', this.gameView(room));
    this.emitTurn(room, false);
    this.touch(room);
    return ok(null);
  }

  makeMove(socketId: string, payload: unknown): Result<null> {
    const ctx = this.context(socketId);
    if (!ctx) return fail('NOT_IN_ROOM', '你不在任何房間中');
    const { room, player } = ctx;
    const game = room.game;
    if (!game) return fail('GAME_NOT_STARTED', '遊戲尚未開始');
    if (game.over) return fail('GAME_OVER', '遊戲已結束');
    const p = (payload ?? {}) as Record<string, unknown>;
    if (!isValidCellId(p.from) || !isValidCellId(p.to) || typeof p.turnNumber !== 'number') {
      return fail('BAD_REQUEST', '無效的棋步資料');
    }
    if (p.turnNumber !== game.turnNumber) return fail('STALE_TURN', '棋盤狀態已更新，請重試');
    const seat = room.seats.findIndex((s) => s.playerId === player.id);
    if (seat < 0) return fail('NOT_YOUR_TURN', '你不是這場遊戲的玩家');
    const r = applyMove(game, seat, p.from, p.to);
    if (!r.ok) return fail(r.code, r.message);
    room.game = r.state;
    room.lastMove = r.move;
    this.afterTurn(room, false);
    return ok(null);
  }

  returnToRoom(socketId: string): Result<null> {
    const ctx = this.context(socketId);
    if (!ctx) return fail('NOT_IN_ROOM', '你不在任何房間中');
    const { room, player } = ctx;
    if (room.hostId !== player.id) return fail('NOT_HOST', '只有房主可以重新開局');
    if (!room.game || !room.game.over) return fail('BAD_REQUEST', '遊戲尚未結束');
    this.clearTurnTimer(room);
    room.game = null;
    room.seats = [];
    room.lastMove = null;
    room.result = null;
    room.startedAt = null;
    for (const x of room.players) x.ready = false;
    this.systemChat(room, '房主回到等待室，準備下一局');
    this.broadcastRoom(room);
    this.touch(room);
    return ok(null);
  }

  chat(socketId: string, payload: unknown): Result<null> {
    const ctx = this.context(socketId);
    if (!ctx) return fail('NOT_IN_ROOM', '你不在任何房間中');
    const text = sanitizeText((payload as { text?: unknown } | null)?.text, CHAT_MAX);
    if (!text) return fail('BAD_REQUEST', '訊息不可為空');
    this.pushChat(ctx.room, {
      id: randomUUID(),
      playerId: ctx.player.id,
      nickname: ctx.player.nickname,
      colorIndex: ctx.player.colorIndex,
      text,
      at: Date.now(),
      system: false,
    });
    return ok(null);
  }

  /** 關閉伺服器時清除所有計時器 */
  dispose(): void {
    for (const room of [...this.rooms.values()]) this.destroyRoom(room, null);
  }

  // ---------------- 內部 ----------------

  private context(socketId: string): { room: Room; player: Player } | null {
    const s = this.sockets.get(socketId);
    if (!s) return null;
    const room = this.rooms.get(s.code);
    const player = room?.players.find((x) => x.id === s.playerId);
    if (!room || !player || player.socketId !== socketId) {
      this.sockets.delete(socketId);
      return null;
    }
    return { room, player };
  }

  private leaveCurrent(socketId: string): void {
    const ctx = this.context(socketId);
    if (ctx) this.removePlayer(ctx.room, ctx.player, 'left');
  }

  private newPlayer(nickname: string, colorIndex: number, socketId: string): Player {
    return {
      id: randomUUID(),
      token: randomBytes(24).toString('base64url'),
      nickname,
      colorIndex,
      ready: false,
      socketId,
      disconnectedAt: null,
      graceTimer: null,
    };
  }

  private attach(socketId: string, room: Room, player: Player): void {
    player.socketId = socketId;
    this.sockets.set(socketId, { code: room.code, playerId: player.id });
    this.emit.joinChannel(socketId, room.code);
  }

  private uniqueNickname(room: Room, nickname: string): string {
    const names = new Set(room.players.map((x) => x.nickname));
    if (!names.has(nickname)) return nickname;
    for (let i = 2; ; i++) {
      const candidate = `${Array.from(nickname).slice(0, 13).join('')}#${i}`;
      if (!names.has(candidate)) return candidate;
    }
  }

  private generateCode(length: number): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < length; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  private status(room: Room): RoomStatus {
    if (room.game) return room.game.over ? 'finished' : 'playing';
    if (room.players.length >= 2 && room.players.every((x) => x.id === room.hostId || x.ready)) return 'ready';
    return 'waiting';
  }

  private isJoinable(room: Room): boolean {
    return !room.game && room.players.length < room.maxPlayers;
  }

  private removePlayer(room: Room, player: Player, reason: PlayerLeftPayload['reason']): void {
    if (player.graceTimer) clearTimeout(player.graceTimer);
    player.graceTimer = null;
    if (player.socketId) {
      this.sockets.delete(player.socketId);
      this.emit.leaveChannel(player.socketId, room.code);
      player.socketId = null;
    }
    room.players = room.players.filter((x) => x !== player);

    if (room.players.length === 0) {
      this.destroyRoom(room, null);
      return;
    }

    if (room.hostId === player.id) {
      const next = room.players.find((x) => x.socketId) ?? room.players[0]!;
      room.hostId = next.id;
      next.ready = false;
      this.systemChat(room, `${next.nickname} 成為新房主`);
    }

    this.emit.toRoom(room.code, 'playerLeft', { playerId: player.id, nickname: player.nickname, reason });
    const verb = reason === 'kicked' ? '被移出房間' : reason === 'timeout' ? '斷線逾時離開' : '離開了房間';
    this.systemChat(room, `${player.nickname} ${verb}`);

    const seat = room.seats.findIndex((s) => s.playerId === player.id);
    if (room.game && !room.game.over && seat >= 0) {
      room.game = deactivateSeat(room.game, seat);
      room.lastMove = null;
      this.afterTurn(room, true);
    }
    this.broadcastRoom(room);
  }

  /** 每次棋盤或回合變動後：結束判定、計時、廣播 */
  private afterTurn(room: Room, skipped: boolean): void {
    const game = room.game;
    if (!game) return;
    if (game.over) {
      this.endGame(room);
      return;
    }
    room.turnStartedAt = Date.now();
    this.scheduleTurnTimer(room);
    this.emit.toRoom(room.code, 'gameStateUpdated', this.gameView(room));
    this.emitTurn(room, skipped);
  }

  private emitTurn(room: Room, skipped: boolean): void {
    const game = room.game!;
    this.emit.toRoom(room.code, 'turnChanged', {
      currentSeat: game.currentSeat,
      playerId: room.seats[game.currentSeat]?.playerId ?? null,
      turnNumber: game.turnNumber,
      deadline: room.turnDeadline,
      skipped,
    });
  }

  private endGame(room: Room): void {
    const game = room.game!;
    this.clearTurnTimer(room);
    const winnerSeat = game.winnerSeat;
    const reason = winnerSeat === null ? 'stalemate' : hasWon(game, winnerSeat) ? 'goal' : 'forfeit';
    const rankings = rankSeats(game).map((r) => {
      const s = room.seats[r.seat]!;
      return {
        playerId: s.playerId,
        nickname: s.nickname,
        colorIndex: s.colorIndex,
        inGoal: r.inGoal,
        distance: r.distance,
        winner: r.seat === winnerSeat,
      };
    });
    room.result = {
      winnerId: winnerSeat === null ? null : room.seats[winnerSeat]!.playerId,
      reason,
      rankings,
    };
    this.emit.toRoom(room.code, 'gameStateUpdated', this.gameView(room));
    this.emit.toRoom(room.code, 'gameOver', room.result);
    const winner = winnerSeat === null ? null : room.seats[winnerSeat]!;
    this.systemChat(room, winner ? `🏆 ${winner.nickname} 獲勝！` : '遊戲結束，沒有勝利者');
    this.broadcastRoom(room);
    this.touch(room);
  }

  private clearTurnTimer(room: Room): void {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    room.turnTimer = null;
    room.turnDeadline = null;
  }

  /** 回合計時：房間限時，或目前玩家斷線時較短的跳過時間 */
  private scheduleTurnTimer(room: Room): void {
    this.clearTurnTimer(room);
    const game = room.game;
    if (!game || game.over) return;
    const seat = room.seats[game.currentSeat];
    const player = room.players.find((x) => x.id === seat?.playerId);
    let deadline = room.rules.turnTimeLimit > 0 ? room.turnStartedAt + room.rules.turnTimeLimit * 1000 : Infinity;
    if (player && !player.socketId) {
      deadline = Math.min(deadline, (player.disconnectedAt ?? Date.now()) + this.cfg.disconnectedTurnSkipMs);
    }
    if (!Number.isFinite(deadline)) return;
    room.turnDeadline = deadline;
    const turn = game.turnNumber;
    room.turnTimer = setTimeout(() => this.skipTurn(room, turn), Math.max(0, deadline - Date.now()));
  }

  private skipTurn(room: Room, turn: number): void {
    room.turnTimer = null;
    const game = room.game;
    if (this.rooms.get(room.code) !== room || !game || game.over || game.turnNumber !== turn) return;
    const name = room.seats[game.currentSeat]?.nickname ?? '玩家';
    room.game = advanceTurn(game);
    room.lastMove = null;
    this.systemChat(room, `${name} 超過時間，跳過回合`);
    this.afterTurn(room, true);
  }

  /** 房間生命週期計時：等待逾時、結束後保留、遊戲最長時間 */
  private touch(room: Room): void {
    if (room.lifeTimer) clearTimeout(room.lifeTimer);
    const status = this.status(room);
    let ms: number;
    let reason: string;
    if (status === 'playing') {
      ms = Math.max(0, (room.startedAt ?? Date.now()) + this.cfg.maxGameDurationMs - Date.now());
      reason = '遊戲超過最長時間，房間已關閉';
    } else if (status === 'finished') {
      ms = this.cfg.finishedRoomTtlMs;
      reason = '遊戲已結束一段時間，房間已關閉';
    } else {
      ms = this.cfg.waitingRoomIdleMs;
      reason = '房間閒置過久，已自動關閉';
    }
    room.lifeTimer = setTimeout(() => {
      room.lifeTimer = null;
      if (this.rooms.get(room.code) === room) this.destroyRoom(room, reason);
    }, ms);
  }

  private destroyRoom(room: Room, reason: string | null): void {
    this.clearTurnTimer(room);
    if (room.lifeTimer) clearTimeout(room.lifeTimer);
    room.lifeTimer = null;
    for (const p of room.players) {
      if (p.graceTimer) clearTimeout(p.graceTimer);
      p.graceTimer = null;
      if (p.socketId) {
        this.sockets.delete(p.socketId);
        if (reason) this.emit.toSocket(p.socketId, 'kicked', { reason });
        this.emit.leaveChannel(p.socketId, room.code);
      }
    }
    room.players = [];
    this.rooms.delete(room.code);
    this.emit.lobbyChanged();
  }

  private systemChat(room: Room, text: string): void {
    this.pushChat(room, {
      id: randomUUID(),
      playerId: null,
      nickname: '系統',
      colorIndex: -1,
      text,
      at: Date.now(),
      system: true,
    });
  }

  private pushChat(room: Room, msg: ChatMessage): void {
    room.chat.push(msg);
    if (room.chat.length > CHAT_HISTORY) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
    this.emit.toRoom(room.code, 'chatMessage', msg);
  }

  private broadcastRoom(room: Room): void {
    this.emit.toRoom(room.code, 'roomUpdated', this.roomView(room));
    if (room.isPublic) this.emit.lobbyChanged();
  }

  private playerView(room: Room, p: Player): PlayerView {
    const seat = room.seats.findIndex((s) => s.playerId === p.id);
    return {
      id: p.id,
      nickname: p.nickname,
      colorIndex: p.colorIndex,
      isHost: p.id === room.hostId,
      ready: p.id === room.hostId || p.ready,
      connected: p.socketId !== null,
      seat: seat >= 0 ? seat : null,
    };
  }

  private roomView(room: Room): RoomView {
    return {
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      maxPlayers: room.maxPlayers,
      status: this.status(room),
      hostId: room.hostId,
      players: room.players.map((p) => this.playerView(room, p)),
      rules: { ...room.rules },
      createdAt: room.createdAt,
      startedAt: room.startedAt,
    };
  }

  private gameView(room: Room): GameView {
    const game = room.game!;
    return {
      state: game,
      seats: room.seats.map((s, i) => {
        const p = room.players.find((x) => x.id === s.playerId);
        return { ...s, active: game.seats[i]!.active, connected: !!p?.socketId };
      }),
      lastMove: room.lastMove,
      turnDeadline: room.turnDeadline,
    };
  }

  private joinedPayload(room: Room, player: Player): JoinedRoom {
    return {
      room: this.roomView(room),
      you: { playerId: player.id, token: player.token },
      game: room.game ? this.gameView(room) : null,
      result: room.result,
      chat: [...room.chat],
    };
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Socket.IO 型別化事件協定與共用資料模型（前後端共用）。
 */
import type { GameState, MoveRecord, RuleOptions } from './game.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const NICKNAME_MAX = 16;
export const ROOM_NAME_MAX = 24;
export const CHAT_MAX = 200;
export const CHAT_HISTORY = 50;
export const TURN_TIME_OPTIONS = [0, 30, 60, 90] as const;
export type TurnTimeLimit = (typeof TURN_TIME_OPTIONS)[number];

/** 房間代碼字元集（排除 0/O/1/I 等易混淆字元） */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PUBLIC_CODE_LENGTH = 6;
export const PRIVATE_CODE_LENGTH = 8;
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6,8}$/;

export interface PlayerColor {
  name: string;
  /** 主色 */
  base: string;
  /** 高光 */
  light: string;
  /** 陰影 */
  dark: string;
}

export const PLAYER_COLORS: readonly PlayerColor[] = [
  { name: '紅寶石', base: '#ff3b5c', light: '#ffb3c1', dark: '#8a0f2a' },
  { name: '琥珀金', base: '#ffb020', light: '#ffe7a3', dark: '#8a5300' },
  { name: '翡翠綠', base: '#22d67a', light: '#b6ffd7', dark: '#0b6b3a' },
  { name: '藍寶石', base: '#3b82ff', light: '#bcd6ff', dark: '#11307a' },
  { name: '紫水晶', base: '#b05cff', light: '#e6c9ff', dark: '#4e1a85' },
  { name: '冰晶青', base: '#22e0f0', light: '#c4fbff', dark: '#0a6570' },
];

export type RoomStatus = 'waiting' | 'ready' | 'playing' | 'finished';

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  waiting: '等待中',
  ready: '準備開始',
  playing: '遊戲中',
  finished: '已結束',
};

export interface RoomRules extends RuleOptions {
  /** 每回合秒數，0 = 不限時 */
  turnTimeLimit: TurnTimeLimit;
}

export const DEFAULT_ROOM_RULES: RoomRules = {
  goalLock: true,
  antiBlocking: true,
  turnTimeLimit: 0,
};

export interface PlayerView {
  id: string;
  nickname: string;
  colorIndex: number;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  /** 遊戲中的座位（0..n-1），等待中為 null */
  seat: number | null;
}

export interface RoomView {
  code: string;
  name: string;
  isPublic: boolean;
  maxPlayers: number;
  status: RoomStatus;
  hostId: string;
  players: PlayerView[];
  rules: RoomRules;
  createdAt: number;
  startedAt: number | null;
}

export interface PublicRoomSummary {
  code: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
  colors: number[];
  rules: RoomRules;
  createdAt: number;
  startedAt: number | null;
  joinable: boolean;
}

export interface SeatInfo {
  playerId: string;
  nickname: string;
  colorIndex: number;
  /** false = 已離開遊戲 */
  active: boolean;
  connected: boolean;
}

export interface GameView {
  state: GameState;
  /** seats[seat] = 該座位玩家資訊 */
  seats: SeatInfo[];
  lastMove: MoveRecord | null;
  /** 本回合截止時間（epoch ms），不限時為 null */
  turnDeadline: number | null;
}

export interface Ranking {
  playerId: string;
  nickname: string;
  colorIndex: number;
  inGoal: number;
  distance: number;
  winner: boolean;
}

export type GameOverReason = 'goal' | 'forfeit' | 'stalemate';

export interface GameOverPayload {
  winnerId: string | null;
  reason: GameOverReason;
  rankings: Ranking[];
}

export interface ChatMessage {
  id: string;
  playerId: string | null;
  nickname: string;
  colorIndex: number;
  text: string;
  at: number;
  system: boolean;
}

export interface Session {
  playerId: string;
  /** 重新連線用的秘密權杖，只傳給本人 */
  token: string;
}

export interface JoinedRoom {
  room: RoomView;
  you: Session;
  game: GameView | null;
  /** 已結束遊戲的結算資料（重新連線時用） */
  result: GameOverPayload | null;
  chat: ChatMessage[];
}

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_STARTED'
  | 'ROOM_CLOSED'
  | 'NOT_IN_ROOM'
  | 'ALREADY_IN_ROOM'
  | 'NOT_HOST'
  | 'NOT_ENOUGH_PLAYERS'
  | 'PLAYERS_NOT_READY'
  | 'GAME_NOT_STARTED'
  | 'STALE_TURN'
  | 'SESSION_INVALID'
  | 'GAME_OVER'
  | 'NOT_YOUR_TURN'
  | 'INVALID_CELL'
  | 'NOT_YOUR_PIECE'
  | 'ILLEGAL_MOVE'
  | 'INTERNAL';

export interface ServerError {
  code: ErrorCode;
  message: string;
}

export type AckResponse<T> = { ok: true; data: T } | { ok: false; error: ServerError };
export type Ack<T> = (res: AckResponse<T>) => void;

export interface CreateRoomPayload {
  nickname: string;
  roomName: string;
  isPublic: boolean;
  maxPlayers: number;
  rules: RoomRules;
}

export interface JoinRoomPayload {
  code: string;
  nickname: string;
}

export interface ReconnectPayload {
  code: string;
  token: string;
}

export interface MovePayload {
  from: number;
  to: number;
  /** 客戶端看到的回合編號，避免重複提交 */
  turnNumber: number;
}

export interface UpdateSettingsPayload {
  roomName?: string;
  isPublic?: boolean;
  maxPlayers?: number;
  rules?: RoomRules;
}

export interface ClientToServerEvents {
  createRoom: (payload: CreateRoomPayload, ack: Ack<JoinedRoom>) => void;
  joinRoom: (payload: JoinRoomPayload, ack: Ack<JoinedRoom>) => void;
  reconnectPlayer: (payload: ReconnectPayload, ack: Ack<JoinedRoom>) => void;
  leaveRoom: (ack: Ack<null>) => void;
  getPublicRooms: (ack: Ack<PublicRoomSummary[]>) => void;
  subscribeLobby: () => void;
  unsubscribeLobby: () => void;
  playerReady: (payload: { ready: boolean }, ack: Ack<null>) => void;
  kickPlayer: (payload: { playerId: string }, ack: Ack<null>) => void;
  updateRoomSettings: (payload: UpdateSettingsPayload, ack: Ack<null>) => void;
  startGame: (ack: Ack<null>) => void;
  makeMove: (payload: MovePayload, ack: Ack<null>) => void;
  returnToRoom: (ack: Ack<null>) => void;
  chatMessage: (payload: { text: string }, ack: Ack<null>) => void;
}

export interface TurnChangedPayload {
  currentSeat: number;
  playerId: string | null;
  turnNumber: number;
  deadline: number | null;
  skipped: boolean;
}

export interface PlayerLeftPayload {
  playerId: string;
  nickname: string;
  reason: 'left' | 'kicked' | 'timeout';
}

export interface ServerToClientEvents {
  publicRoomsUpdated: (rooms: PublicRoomSummary[]) => void;
  roomUpdated: (room: RoomView) => void;
  playerJoined: (payload: { player: PlayerView }) => void;
  playerLeft: (payload: PlayerLeftPayload) => void;
  playerReady: (payload: { playerId: string; ready: boolean }) => void;
  gameStateUpdated: (game: GameView) => void;
  turnChanged: (payload: TurnChangedPayload) => void;
  gameOver: (payload: GameOverPayload) => void;
  chatMessage: (msg: ChatMessage) => void;
  /** 被移出房間（被踢、房間關閉、在其他分頁登入） */
  kicked: (payload: { reason: string }) => void;
  error: (err: ServerError) => void;
}

// ---------- 輸入驗證（前後端共用） ----------

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;

export function sanitizeText(input: unknown, max: number): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return null;
  return Array.from(cleaned).slice(0, max).join('');
}

export function validateNickname(input: unknown): string | null {
  return sanitizeText(input, NICKNAME_MAX);
}

export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

export function validateMaxPlayers(input: unknown): number | null {
  return typeof input === 'number' && Number.isInteger(input) && input >= MIN_PLAYERS && input <= MAX_PLAYERS
    ? input
    : null;
}

export function validateRules(input: unknown): RoomRules | null {
  if (typeof input !== 'object' || input === null) return null;
  const r = input as Record<string, unknown>;
  if (typeof r.goalLock !== 'boolean' || typeof r.antiBlocking !== 'boolean') return null;
  if (!TURN_TIME_OPTIONS.includes(r.turnTimeLimit as TurnTimeLimit)) return null;
  return { goalLock: r.goalLock, antiBlocking: r.antiBlocking, turnTimeLimit: r.turnTimeLimit as TurnTimeLimit };
}

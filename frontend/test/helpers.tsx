import { render } from '@testing-library/react';
import { vi } from 'vitest';
import type { ReactNode } from 'react';
import { DEFAULT_ROOM_RULES, createGame, type GameView, type RoomView } from '@starry/shared';
import { ClientContext, type ClientApi } from '../src/lib/client';

export function mockClient(over: Partial<ClientApi> = {}): ClientApi {
  return {
    connection: 'connected',
    view: 'home',
    nickname: 'Tester',
    setNickname: vi.fn(),
    room: null,
    you: null,
    game: null,
    result: null,
    chat: [],
    turnPulse: null,
    publicRooms: [],
    lobbyLoading: false,
    inviteCode: null,
    restoring: false,
    busy: false,
    goHome: vi.fn(),
    goLobby: vi.fn(),
    refreshLobby: vi.fn(async () => undefined),
    createRoom: vi.fn(async () => true),
    joinRoom: vi.fn(async () => true),
    leaveRoom: vi.fn(async () => undefined),
    setReady: vi.fn(async () => undefined),
    kick: vi.fn(async () => undefined),
    updateSettings: vi.fn(async () => true),
    startGame: vi.fn(async () => undefined),
    makeMove: vi.fn(async () => true),
    returnToRoom: vi.fn(async () => undefined),
    sendChat: vi.fn(async () => true),
    dismissInvite: vi.fn(),
    resumable: null,
    canResume: vi.fn(() => false),
    resumeRoom: vi.fn(),
    forgetResumable: vi.fn(),
    ...over,
  };
}

export function renderWithClient(ui: ReactNode, client: ClientApi) {
  return render(<ClientContext.Provider value={client}>{ui}</ClientContext.Provider>);
}

export function twoPlayerGame(): { room: RoomView; game: GameView } {
  const room: RoomView = {
    code: 'ABCDEF',
    name: '測試房',
    isPublic: true,
    maxPlayers: 2,
    status: 'playing',
    hostId: 'p1',
    players: [
      { id: 'p1', nickname: 'Alice', colorIndex: 0, isHost: true, ready: true, connected: true, seat: 0 },
      { id: 'p2', nickname: 'Bob', colorIndex: 1, isHost: false, ready: true, connected: true, seat: 1 },
    ],
    rules: DEFAULT_ROOM_RULES,
    createdAt: Date.now(),
    startedAt: Date.now(),
  };
  const game: GameView = {
    state: createGame(2),
    seats: [
      { playerId: 'p1', nickname: 'Alice', colorIndex: 0, active: true, connected: true },
      { playerId: 'p2', nickname: 'Bob', colorIndex: 1, active: true, connected: true },
    ],
    lastMove: null,
    turnDeadline: null,
  };
  return { room, game };
}

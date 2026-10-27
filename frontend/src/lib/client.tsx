/**
 * 遊戲客戶端狀態：把 Socket.IO 事件轉為 React 狀態，並提供操作方法。
 * 伺服器是唯一權威，前端只呈現伺服器送來的狀態。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  normalizeRoomCode,
  type ChatMessage,
  type CreateRoomPayload,
  type GameOverPayload,
  type GameView,
  type JoinedRoom,
  type PublicRoomSummary,
  type RoomView,
  type Session,
  type UpdateSettingsPayload,
} from '@starry/shared';
import { getSocket, request } from './socket';
import { play } from './sound';
import { HEARTBEAT_MS, TAB_ID, savedSessions, sessionStore, storage, type SavedSession } from './storage';
import { toast } from './toast';

export type View = 'home' | 'lobby' | 'room';
export type Connection = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface TurnPulse {
  key: number;
  mine: boolean;
  name: string;
  colorIndex: number;
  skipped: boolean;
}

export interface ClientApi {
  connection: Connection;
  view: View;
  nickname: string;
  setNickname: (n: string) => void;
  room: RoomView | null;
  you: Session | null;
  game: GameView | null;
  result: GameOverPayload | null;
  chat: ChatMessage[];
  turnPulse: TurnPulse | null;
  publicRooms: PublicRoomSummary[];
  lobbyLoading: boolean;
  /** 透過邀請連結開啟、尚未加入的房間代碼 */
  inviteCode: string | null;
  restoring: boolean;
  busy: boolean;
  goHome: () => void;
  goLobby: () => void;
  refreshLobby: () => Promise<void>;
  createRoom: (opts: Omit<CreateRoomPayload, 'nickname'>) => Promise<boolean>;
  joinRoom: (code: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  kick: (playerId: string) => Promise<void>;
  updateSettings: (p: UpdateSettingsPayload) => Promise<boolean>;
  startGame: () => Promise<void>;
  makeMove: (from: number, to: number) => Promise<boolean>;
  returnToRoom: () => Promise<void>;
  sendChat: (text: string) => Promise<boolean>;
  dismissInvite: () => void;
  /** 先前（例如分頁被關閉）留下、可以接回的房間 */
  resumable: SavedSession | null;
  /** 這個代碼是否有本瀏覽器保存的身分（可在此分頁接管） */
  canResume: (code: string) => boolean;
  resumeRoom: (code: string) => void;
  forgetResumable: () => void;
}

export const ClientContext = createContext<ClientApi | null>(null);

export function useClient(): ClientApi {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error('useClient must be used inside <ClientProvider>');
  return ctx;
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/room/${code}`;
}

function parseLocation(): { view: View; code: string | null } {
  const path = window.location.pathname;
  const m = /^\/room\/([^/]+)\/?$/i.exec(path);
  if (m) return { view: 'room', code: normalizeRoomCode(decodeURIComponent(m[1]!)) };
  if (/^\/lobby\/?$/.test(path)) return { view: 'lobby', code: null };
  return { view: 'home', code: null };
}

function pushUrl(path: string): void {
  if (window.location.pathname !== path) window.history.pushState(null, '', path);
}

function showError(err: { message: string }): void {
  toast(err.message, 'error');
  play('error');
}

export function ClientProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(parseLocation, []);
  const initialSession = useMemo(() => {
    if (!initial.code) return null;
    // 1. 本分頁重新整理
    const s = sessionStore.get();
    if (s && s.code === initial.code) return s;
    // 2. 分頁曾被關閉：從 localStorage 接回（若沒有其他分頁正在使用）
    const saved = savedSessions.get(initial.code);
    if (saved && !savedSessions.isLiveElsewhere(saved)) return { code: saved.code, token: saved.token };
    return null;
  }, [initial]);

  const [connection, setConnection] = useState<Connection>('connecting');
  const [view, setView] = useState<View>(initialSession ? 'room' : initial.view === 'lobby' ? 'lobby' : 'home');
  const [nickname, setNicknameState] = useState<string>(() => storage.get('nickname', ''));
  const [room, setRoom] = useState<RoomView | null>(null);
  const [you, setYou] = useState<Session | null>(null);
  const [game, setGame] = useState<GameView | null>(null);
  const [result, setResult] = useState<GameOverPayload | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [turnPulse, setTurnPulse] = useState<TurnPulse | null>(null);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [lobbyLoading, setLobbyLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState<string | null>(initialSession ? null : initial.code);
  const [restoring, setRestoring] = useState<boolean>(!!initialSession);
  const [busy, setBusy] = useState(false);
  const [resumable, setResumable] = useState<SavedSession | null>(null);

  const sessionRef = useRef(initialSession);
  const viewRef = useRef(view);
  viewRef.current = view;
  const youRef = useRef(you);
  youRef.current = you;
  const gameRef = useRef(game);
  gameRef.current = game;
  const movePending = useRef(false);

  const setNickname = useCallback((n: string) => {
    setNicknameState(n);
    storage.set('nickname', n);
  }, []);

  const clearRoom = useCallback(() => {
    const code = sessionRef.current?.code;
    // 只刪除屬於本分頁的保存紀錄（被其他分頁接管時不能刪掉對方的）
    if (code && savedSessions.get(code)?.tabId === TAB_ID) savedSessions.remove(code);
    sessionRef.current = null;
    sessionStore.clear();
    setRoom(null);
    setYou(null);
    setGame(null);
    setResult(null);
    setChat([]);
    setTurnPulse(null);
  }, []);

  const applyJoined = useCallback((j: JoinedRoom) => {
    const session = { code: j.room.code, token: j.you.token };
    sessionRef.current = session;
    sessionStore.set(session);
    savedSessions.save({ ...session, roomName: j.room.name });
    setRoom(j.room);
    setYou(j.you);
    setGame(j.game);
    setResult(j.result);
    setChat(j.chat);
    setInviteCode(null);
    setView('room');
    pushUrl(`/room/${j.room.code}`);
  }, []);

  /** 以保存的權杖向伺服器重新取回座位 */
  const restoreSession = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    const r = await request<JoinedRoom>((x) => x.emitWithAck('reconnectPlayer', s));
    setRestoring(false);
    if (r.ok) {
      if (viewRef.current !== 'room') toast('已回到房間', 'success');
      applyJoined(r.data);
      return;
    }
    if (r.error.code === 'OFFLINE' || r.error.code === 'TIMEOUT') return; // 連上後會再試一次
    savedSessions.remove(s.code);
    clearRoom();
    if (viewRef.current === 'room') {
      setView('home');
      if (r.error.code === 'SESSION_INVALID') {
        // 房間還在但座位已失效：改以新玩家身分加入
        setInviteCode(s.code);
        toast('座位已因斷線過久被釋放，可以重新加入房間', 'warning', 4500);
      } else {
        pushUrl('/');
        toast(r.error.message, 'warning');
      }
    }
  }, [applyJoined, clearRoom]);
  const restoreRef = useRef(restoreSession);
  restoreRef.current = restoreSession;

  // ---------- Socket 事件 ----------
  useEffect(() => {
    const socket = getSocket();
    const tryRestore = () => restoreRef.current();

    const onConnect = () => {
      setConnection('connected');
      void tryRestore();
      if (viewRef.current === 'lobby') socket.emit('subscribeLobby');
    };
    const onDisconnect = (reason: string) => {
      setConnection(reason === 'io client disconnect' ? 'offline' : 'reconnecting');
    };
    const onConnectError = () => {
      setConnection((c) => (c === 'connected' ? 'reconnecting' : c === 'connecting' ? 'connecting' : 'reconnecting'));
    };
    const onReconnectFailed = () => setConnection('offline');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_failed', onReconnectFailed);

    socket.on('publicRoomsUpdated', (rooms) => {
      setPublicRooms(rooms);
      setLobbyLoading(false);
    });
    socket.on('roomUpdated', (r) => {
      setRoom(r);
      if (r.status === 'waiting' || r.status === 'ready') {
        setGame(null);
        setResult(null);
      }
    });
    socket.on('playerJoined', ({ player }) => {
      if (player.id !== youRef.current?.playerId) {
        toast(`${player.nickname} 加入了房間`, 'success', 2200);
        play('join');
      }
    });
    socket.on('playerLeft', ({ nickname: name, reason }) => {
      toast(`${name} ${reason === 'kicked' ? '被移出房間' : '離開了房間'}`, 'info', 2200);
      play('leave');
    });
    socket.on('gameStateUpdated', (g) => setGame(g));
    socket.on('turnChanged', (t) => {
      const g = gameRef.current;
      const seat = g?.seats[t.currentSeat];
      const mine = t.playerId !== null && t.playerId === youRef.current?.playerId;
      setTurnPulse({
        key: t.turnNumber,
        mine,
        name: seat?.nickname ?? '',
        colorIndex: seat?.colorIndex ?? 0,
        skipped: t.skipped,
      });
      if (mine) play('turn');
    });
    socket.on('gameOver', (res) => {
      setResult(res);
      play(res.winnerId === youRef.current?.playerId ? 'win' : 'lose');
    });
    socket.on('chatMessage', (msg) => setChat((c) => [...c.slice(-99), msg]));
    socket.on('kicked', ({ reason }) => {
      clearRoom();
      setView('home');
      pushUrl('/');
      toast(reason, 'warning', 4500);
    });
    socket.on('error', (err) => showError(err));

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect_failed', onReconnectFailed);
      for (const e of [
        'publicRoomsUpdated',
        'roomUpdated',
        'playerJoined',
        'playerLeft',
        'gameStateUpdated',
        'turnChanged',
        'gameOver',
        'chatMessage',
        'kicked',
        'error',
      ] as const) {
        socket.off(e);
      }
    };
  }, [applyJoined, clearRoom]);

  // 在房間中：定時心跳，讓其他分頁知道此身分正在使用；分頁關閉時釋放
  const roomCode = room?.code ?? null;
  const joined = !!you;
  useEffect(() => {
    if (!roomCode || !joined) return;
    savedSessions.touch(roomCode);
    const t = window.setInterval(() => savedSessions.touch(roomCode), HEARTBEAT_MS);
    const onHide = () => savedSessions.release(roomCode);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('pagehide', onHide);
    };
  }, [roomCode, joined]);

  // 對局進行中關閉 / 離開分頁前先提醒
  const gameActive = !!game && !game.state.over;
  useEffect(() => {
    if (!gameActive) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [gameActive]);

  // 首頁 / 大廳：檢查是否有可以接回的房間
  useEffect(() => {
    if (view === 'room') {
      setResumable(null);
      return;
    }
    const check = () => setResumable(savedSessions.latestResumable(sessionRef.current?.code));
    check();
    const t = window.setInterval(check, HEARTBEAT_MS);
    window.addEventListener('storage', check);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('storage', check);
    };
  }, [view]);

  // 瀏覽器上一頁 / 下一頁
  useEffect(() => {
    const onPop = () => {
      const loc = parseLocation();
      if (sessionRef.current && loc.view !== 'room') {
        // 仍在房間中：回到房間畫面，避免誤離開
        pushUrl(`/room/${sessionRef.current.code}`);
        setView('room');
        toast('請使用「離開」按鈕離開房間', 'info');
        return;
      }
      setView(loc.view === 'room' ? 'home' : loc.view);
      if (loc.view === 'room') setInviteCode(loc.code);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // 進出大廳時訂閱 / 取消訂閱即時房間列表
  useEffect(() => {
    const socket = getSocket();
    if (view !== 'lobby') return;
    setLobbyLoading(true);
    if (socket.connected) socket.emit('subscribeLobby');
    return () => {
      socket.emit('unsubscribeLobby');
    };
  }, [view]);

  // ---------- 操作 ----------
  const withBusy = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  const goHome = useCallback(() => {
    setView('home');
    pushUrl('/');
  }, []);

  const goLobby = useCallback(() => {
    setView('lobby');
    pushUrl('/lobby');
  }, []);

  const refreshLobby = useCallback(async () => {
    setLobbyLoading(true);
    const r = await request<PublicRoomSummary[]>((s) => s.emitWithAck('getPublicRooms'));
    setLobbyLoading(false);
    if (r.ok) setPublicRooms(r.data);
    else showError(r.error);
  }, []);

  const createRoom = useCallback(
    (opts: Omit<CreateRoomPayload, 'nickname'>) =>
      withBusy(async () => {
        const r = await request<JoinedRoom>((s) => s.emitWithAck('createRoom', { ...opts, nickname }));
        if (!r.ok) {
          showError(r.error);
          return false;
        }
        applyJoined(r.data);
        play('join');
        return true;
      }),
    [applyJoined, nickname, withBusy],
  );

  const joinRoom = useCallback(
    (code: string) =>
      withBusy(async () => {
        const r = await request<JoinedRoom>((s) => s.emitWithAck('joinRoom', { code, nickname }));
        if (!r.ok) {
          showError(r.error);
          return false;
        }
        applyJoined(r.data);
        play('join');
        return true;
      }),
    [applyJoined, nickname, withBusy],
  );

  const leaveRoom = useCallback(async () => {
    await request<null>((s) => s.emitWithAck('leaveRoom'));
    clearRoom();
    setView('lobby');
    pushUrl('/lobby');
  }, [clearRoom]);

  const simple = useCallback(async (fn: Parameters<typeof request<null>>[0]): Promise<boolean> => {
    const r = await request<null>(fn);
    if (!r.ok) showError(r.error);
    return r.ok;
  }, []);

  const setReady = useCallback(
    async (ready: boolean) => {
      play('click');
      await simple((s) => s.emitWithAck('playerReady', { ready }));
    },
    [simple],
  );
  const kick = useCallback(
    async (playerId: string) => {
      await simple((s) => s.emitWithAck('kickPlayer', { playerId }));
    },
    [simple],
  );
  const updateSettings = useCallback(
    (p: UpdateSettingsPayload) => simple((s) => s.emitWithAck('updateRoomSettings', p)),
    [simple],
  );
  const startGame = useCallback(
    () => withBusy(async () => void (await simple((s) => s.emitWithAck('startGame')))),
    [simple, withBusy],
  );
  const returnToRoom = useCallback(async () => {
    await simple((s) => s.emitWithAck('returnToRoom'));
  }, [simple]);
  const sendChat = useCallback((text: string) => simple((s) => s.emitWithAck('chatMessage', { text })), [simple]);

  const makeMove = useCallback(async (from: number, to: number) => {
    const g = gameRef.current;
    if (!g || movePending.current) return false;
    movePending.current = true;
    try {
      const r = await request<null>((s) => s.emitWithAck('makeMove', { from, to, turnNumber: g.state.turnNumber }));
      if (!r.ok) showError(r.error);
      return r.ok;
    } finally {
      movePending.current = false;
    }
  }, []);

  const canResume = useCallback((code: string) => !!savedSessions.get(code), []);

  const resumeRoom = useCallback((code: string) => {
    const saved = savedSessions.get(code);
    if (!saved) return;
    sessionRef.current = { code: saved.code, token: saved.token };
    sessionStore.set(sessionRef.current);
    setInviteCode(null);
    setRestoring(true);
    setView('room');
    pushUrl(`/room/${code}`);
    void restoreRef.current();
  }, []);

  const forgetResumable = useCallback(() => {
    setResumable((r) => {
      if (r) savedSessions.remove(r.code);
      return null;
    });
  }, []);

  const dismissInvite = useCallback(() => {
    setInviteCode(null);
    // 加入成功後對話框也會關閉，此時已在房間中，不能把網址改回首頁
    if (!sessionRef.current) pushUrl('/');
  }, []);

  const api: ClientApi = {
    connection,
    view,
    nickname,
    setNickname,
    room,
    you,
    game,
    result,
    chat,
    turnPulse,
    publicRooms,
    lobbyLoading,
    inviteCode,
    restoring,
    busy,
    goHome,
    goLobby,
    refreshLobby,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    kick,
    updateSettings,
    startGame,
    makeMove,
    returnToRoom,
    sendChat,
    dismissInvite,
    resumable,
    canResume,
    resumeRoom,
    forgetResumable,
  };

  return <ClientContext.Provider value={api}>{children}</ClientContext.Provider>;
}

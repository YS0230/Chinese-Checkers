import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import type { Ack, AckResponse, ClientToServerEvents, ServerToClientEvents } from '@starry/shared';
import type { ServerConfig } from './config.js';
import { TokenBucket } from './rateLimiter.js';
import { RoomManager, type Emitter } from './roomManager.js';

export const SOCKET_PATH = '/socket.io';
const LOBBY = 'lobby';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface AppOptions {
  /** 前端建置輸出目錄；存在時由同一服務提供靜態檔與 SPA fallback */
  staticDir?: string;
  /** 開發模式允許的跨來源（Vite dev server） */
  corsOrigin?: string | string[];
  config?: Partial<ServerConfig>;
}

export interface GameServer {
  httpServer: HttpServer;
  io: IO;
  manager: RoomManager;
  close(): Promise<void>;
}

export function createGameServer(options: AppOptions = {}): GameServer {
  const app = express();
  app.disable('x-powered-by');
  const httpServer = createServer(app);
  const io: IO = new Server(httpServer, {
    path: SOCKET_PATH,
    cors: options.corsOrigin ? { origin: options.corsOrigin } : undefined,
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });

  let lobbyTimer: NodeJS.Timeout | null = null;
  const lobbyThrottle = options.config?.lobbyThrottleMs ?? 150;
  const emitter: Emitter = {
    toRoom: (code, event, ...args) => {
      io.to(code).emit(event, ...args);
    },
    toSocket: (socketId, event, ...args) => {
      io.to(socketId).emit(event, ...args);
    },
    joinChannel: (socketId, code) => {
      void io.in(socketId).socketsJoin(code);
    },
    leaveChannel: (socketId, code) => {
      void io.in(socketId).socketsLeave(code);
    },
    lobbyChanged: () => {
      if (lobbyTimer) return;
      lobbyTimer = setTimeout(() => {
        lobbyTimer = null;
        io.to(LOBBY).emit('publicRoomsUpdated', manager.listPublicRooms());
      }, lobbyThrottle);
    },
  };
  const manager = new RoomManager(emitter, options.config);

  // ---------- HTTP ----------
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', rooms: manager.roomCount, uptime: Math.round(process.uptime()) });
  });

  const staticDir = options.staticDir;
  if (staticDir && existsSync(path.join(staticDir, 'index.html'))) {
    app.use(
      express.static(staticDir, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    // SPA fallback：除了 API / socket 路徑外都回傳 index.html
    app.get(/^(?!\/socket\.io|\/health).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.type('text').send('Starry Chinese Checkers server is running. 前端尚未建置，請執行 npm run build。');
    });
  }

  // ---------- Socket.IO ----------
  io.on('connection', (socket: ClientSocket) => {
    const bucket = new TokenBucket(20, 8);
    const chatBucket = new TokenBucket(5, 0.5);

    /** 包裝事件處理：頻率限制、ack 檢查、例外保護 */
    const handle = <T>(
      fn: () => AckResponse<T>,
      ack: unknown,
      limiter: TokenBucket = bucket,
    ): void => {
      const reply: Ack<T> = typeof ack === 'function' ? (ack as Ack<T>) : () => undefined;
      if (!limiter.take()) {
        reply({ ok: false, error: { code: 'RATE_LIMITED', message: '操作太頻繁，請稍候' } });
        return;
      }
      try {
        reply(fn());
      } catch (err) {
        console.error('[socket] handler error', err);
        reply({ ok: false, error: { code: 'INTERNAL', message: '伺服器發生錯誤' } });
      }
    };

    socket.on('createRoom', (payload, ack) => handle(() => manager.createRoom(socket.id, payload), ack));
    socket.on('joinRoom', (payload, ack) => handle(() => manager.joinRoom(socket.id, payload), ack));
    socket.on('reconnectPlayer', (payload, ack) => handle(() => manager.reconnect(socket.id, payload), ack));
    socket.on('leaveRoom', (ack) => handle(() => manager.leave(socket.id), ack));
    socket.on('getPublicRooms', (ack) =>
      handle(() => ({ ok: true as const, data: manager.listPublicRooms() }), ack),
    );
    socket.on('subscribeLobby', () => {
      if (!bucket.take()) return;
      void socket.join(LOBBY);
      socket.emit('publicRoomsUpdated', manager.listPublicRooms());
    });
    socket.on('unsubscribeLobby', () => {
      void socket.leave(LOBBY);
    });
    socket.on('playerReady', (payload, ack) => handle(() => manager.setReady(socket.id, payload), ack));
    socket.on('kickPlayer', (payload, ack) => handle(() => manager.kick(socket.id, payload), ack));
    socket.on('updateRoomSettings', (payload, ack) => handle(() => manager.updateSettings(socket.id, payload), ack));
    socket.on('startGame', (ack) => handle(() => manager.startGame(socket.id), ack));
    socket.on('makeMove', (payload, ack) => handle(() => manager.makeMove(socket.id, payload), ack));
    socket.on('returnToRoom', (ack) => handle(() => manager.returnToRoom(socket.id), ack));
    socket.on('chatMessage', (payload, ack) => handle(() => manager.chat(socket.id, payload), ack, chatBucket));

    socket.on('disconnect', () => manager.disconnect(socket.id));
  });

  return {
    httpServer,
    io,
    manager,
    close: async () => {
      if (lobbyTimer) clearTimeout(lobbyTimer);
      manager.dispose();
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
    },
  };
}

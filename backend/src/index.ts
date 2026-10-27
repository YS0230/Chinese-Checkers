import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameServer } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// backend/dist/index.js → frontend/dist
const staticDir = process.env.STATIC_DIR ?? path.resolve(here, '../../frontend/dist');
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST ?? '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';

const graceSeconds = Number(process.env.RECONNECT_GRACE_SECONDS);

const server = createGameServer({
  staticDir,
  config: Number.isFinite(graceSeconds) && graceSeconds > 0 ? { reconnectGraceMs: graceSeconds * 1000 } : {},
  corsOrigin: isProd ? undefined : (process.env.CLIENT_ORIGIN ?? ['http://localhost:5173', 'http://127.0.0.1:5173']),
});

server.httpServer.listen(port, host, () => {
  console.log(`✨ Starry Chinese Checkers listening on http://${host}:${port} (${isProd ? 'production' : 'development'})`);
  console.log('⚠️  所有房間與遊戲進度僅存在記憶體，伺服器重啟後會全部消失。');
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down...`);
  void server.close().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@starry/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/** 前後端同源：正式環境由同一個 Node 服務提供，開發時由 Vite proxy 轉發 */
export function getSocket(): GameSocket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
  }
  return socket;
}

/** 帶逾時的 ack 呼叫 */
export async function request<T>(
  emit: (s: GameSocket) => Promise<{ ok: true; data: T } | { ok: false; error: { code: string; message: string } }>,
): Promise<{ ok: true; data: T } | { ok: false; error: { code: string; message: string } }> {
  const s = getSocket();
  if (!s.connected) return { ok: false, error: { code: 'OFFLINE', message: '尚未連線到伺服器，請稍候' } };
  try {
    return await emit(s.timeout(8000) as unknown as GameSocket);
  } catch {
    return { ok: false, error: { code: 'TIMEOUT', message: '伺服器沒有回應，請再試一次' } };
  }
}

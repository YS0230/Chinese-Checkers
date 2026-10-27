import type { PublicRoomSummary } from '@starry/shared';

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return '剛剛';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分鐘`;
  return `${Math.round(m / 60)} 小時`;
}

export function hexToHue(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return Math.round(h);
}

const ADJ = ['閃亮的', '迷路的', '勇敢的', '慵懶的', '神秘的', '飛翔的', '旋轉的', '微笑的'];
const NOUN = ['星塵', '彗星', '月兔', '銀河貓', '流星', '極光', '小行星', '宇宙企鵝', '星雲'];

export function randomNickname(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)]!;
  const n = NOUN[Math.floor(Math.random() * NOUN.length)]!;
  return `${a}${n}`;
}

export interface LobbyFilter {
  query: string;
  /** 0 = 全部 */
  size: number;
  joinableOnly: boolean;
}

/** 大廳搜尋與篩選：名稱 / 代碼 / 房主、人數上限、只顯示可加入 */
export function filterRooms(rooms: PublicRoomSummary[], f: LobbyFilter): PublicRoomSummary[] {
  const q = f.query.trim().toLowerCase();
  return rooms.filter((r) => {
    if (f.size && r.maxPlayers !== f.size) return false;
    if (f.joinableOnly && !r.joinable) return false;
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || r.hostName.toLowerCase().includes(q);
  });
}

/**
 * 瀏覽器儲存（僅用於個人偏好與本分頁的重連權杖）。
 * 任何讀寫失敗（無痕模式、被封鎖）都會安全退回預設值。
 */
const PREFIX = 'starry.';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    return safe(() => {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    }, fallback);
  },
  set(key: string, value: unknown): void {
    safe(() => localStorage.setItem(PREFIX + key, JSON.stringify(value)), undefined);
  },
};

export interface StoredSession {
  code: string;
  token: string;
}

/** 重連權杖存在 sessionStorage：重新整理可恢復，不同分頁是不同玩家 */
export const sessionStore = {
  get(): StoredSession | null {
    return safe(() => {
      const raw = sessionStorage.getItem(PREFIX + 'session');
      if (!raw) return null;
      const v = JSON.parse(raw) as StoredSession;
      return typeof v.code === 'string' && typeof v.token === 'string' ? v : null;
    }, null);
  },
  set(v: StoredSession): void {
    safe(() => sessionStorage.setItem(PREFIX + 'session', JSON.stringify(v)), undefined);
  },
  clear(): void {
    safe(() => sessionStorage.removeItem(PREFIX + 'session'), undefined);
  },
};

// ---------- 跨分頁保存的重連資訊（分頁被關閉後仍可回到座位） ----------

export interface SavedSession extends StoredSession {
  roomName: string;
  savedAt: number;
  /** 目前使用這個身分的分頁 */
  tabId: string;
  /** 該分頁最後一次心跳時間；0 = 分頁已關閉 */
  heartbeat: number;
}

/** 心跳間隔與判定「另一個分頁仍在使用」的門檻 */
export const HEARTBEAT_MS = 4000;
export const LIVE_THRESHOLD_MS = 12000;
/** 超過此時間的紀錄直接丟棄（伺服器早已清掉座位） */
const SAVED_TTL_MS = 6 * 60 * 60 * 1000;
const SAVED_KEY = PREFIX + 'sessions';

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** 每個分頁一個 ID（存在 sessionStorage，重新整理不變） */
export const TAB_ID: string = safe(() => {
  const existing = sessionStorage.getItem(PREFIX + 'tab');
  if (existing) return existing;
  const id = randomId();
  sessionStorage.setItem(PREFIX + 'tab', id);
  return id;
}, randomId());

function readAll(now = Date.now()): Record<string, SavedSession> {
  return safe(() => {
    const raw = localStorage.getItem(SAVED_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, SavedSession>) : {};
    for (const [code, s] of Object.entries(all)) {
      if (!s || typeof s.token !== 'string' || now - s.savedAt > SAVED_TTL_MS) delete all[code];
    }
    return all;
  }, {});
}

function writeAll(all: Record<string, SavedSession>): void {
  safe(() => localStorage.setItem(SAVED_KEY, JSON.stringify(all)), undefined);
}

export const savedSessions = {
  get(code: string): SavedSession | null {
    return readAll()[code] ?? null;
  },
  save(s: StoredSession & { roomName: string }): void {
    const all = readAll();
    const now = Date.now();
    all[s.code] = { ...s, savedAt: now, tabId: TAB_ID, heartbeat: now };
    writeAll(all);
  },
  /** 本分頁仍在使用：更新心跳 */
  touch(code: string): void {
    const all = readAll();
    const s = all[code];
    if (!s) return;
    const now = Date.now();
    all[code] = { ...s, tabId: TAB_ID, heartbeat: now, savedAt: now };
    writeAll(all);
  },
  /** 分頁關閉：釋放身分，讓重新開啟的分頁可以立即接回 */
  release(code: string): void {
    const all = readAll();
    const s = all[code];
    if (!s || s.tabId !== TAB_ID) return;
    all[code] = { ...s, heartbeat: 0 };
    writeAll(all);
  },
  remove(code: string): void {
    const all = readAll();
    delete all[code];
    writeAll(all);
  },
  /** 是否正被「另一個」仍開著的分頁使用 */
  isLiveElsewhere(s: SavedSession, now = Date.now()): boolean {
    return s.tabId !== TAB_ID && now - s.heartbeat < LIVE_THRESHOLD_MS;
  },
  /** 最近一筆可以接回的房間（沒有其他分頁在使用） */
  latestResumable(exceptCode?: string | null): SavedSession | null {
    const list = Object.values(readAll()).filter((s) => s.code !== exceptCode && !savedSessions.isLiveElsewhere(s));
    list.sort((a, b) => b.savedAt - a.savedAt);
    return list[0] ?? null;
  },
};

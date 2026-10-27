export interface ServerConfig {
  /** 斷線後保留座位的時間 */
  reconnectGraceMs: number;
  /** 斷線玩家輪到時，多久後自動跳過 */
  disconnectedTurnSkipMs: number;
  /** 等待中房間無任何活動多久後關閉 */
  waitingRoomIdleMs: number;
  /** 已結束房間保留多久 */
  finishedRoomTtlMs: number;
  /** 進行中的遊戲最長存活時間（防止殭屍房間無限佔用記憶體） */
  maxGameDurationMs: number;
  /** 伺服器同時存在的房間上限 */
  maxRooms: number;
  /** 大廳更新節流 */
  lobbyThrottleMs: number;
}

export const DEFAULT_CONFIG: ServerConfig = {
  reconnectGraceMs: 3 * 60_000,
  disconnectedTurnSkipMs: 15_000,
  waitingRoomIdleMs: 30 * 60_000,
  finishedRoomTtlMs: 10 * 60_000,
  maxGameDurationMs: 4 * 60 * 60_000,
  maxRooms: 500,
  lobbyThrottleMs: 150,
};

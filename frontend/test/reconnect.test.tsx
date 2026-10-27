import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_MS, LIVE_THRESHOLD_MS, TAB_ID, savedSessions } from '../src/lib/storage';
import { HomePage } from '../src/pages/HomePage';
import { JoinCodeModal } from '../src/pages/JoinCodeModal';
import { mockClient, renderWithClient } from './helpers';

const KEY = 'starry.sessions';

describe('跨分頁重連資訊（關閉分頁後仍可接回）', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('保存在 localStorage，分頁關閉（release）後可被接回', () => {
    savedSessions.save({ code: 'ABCDEF', token: 'tok', roomName: '房間' });
    expect(JSON.parse(localStorage.getItem(KEY)!).ABCDEF.token).toBe('tok');
    savedSessions.release('ABCDEF');
    const s = savedSessions.get('ABCDEF')!;
    expect(s.heartbeat).toBe(0);
    expect(savedSessions.latestResumable()?.code).toBe('ABCDEF');
  });

  it('另一個分頁仍有心跳時不會被自動接管；心跳停止後可以接回', () => {
    vi.useFakeTimers();
    const now = Date.now();
    localStorage.setItem(
      KEY,
      JSON.stringify({ ZZZZZZ: { code: 'ZZZZZZ', token: 't', roomName: 'x', savedAt: now, tabId: 'other-tab', heartbeat: now } }),
    );
    const s = savedSessions.get('ZZZZZZ')!;
    expect(savedSessions.isLiveElsewhere(s)).toBe(true);
    expect(savedSessions.latestResumable()).toBeNull();
    vi.advanceTimersByTime(LIVE_THRESHOLD_MS + HEARTBEAT_MS);
    expect(savedSessions.isLiveElsewhere(s)).toBe(false);
    expect(savedSessions.latestResumable()?.code).toBe('ZZZZZZ');
  });

  it('本分頁自己的紀錄不算被其他分頁使用；remove 後消失；過期紀錄自動丟棄', () => {
    savedSessions.save({ code: 'MINE22', token: 't', roomName: 'x' });
    const mine = savedSessions.get('MINE22')!;
    expect(mine.tabId).toBe(TAB_ID);
    expect(savedSessions.isLiveElsewhere(mine)).toBe(false);
    savedSessions.remove('MINE22');
    expect(savedSessions.get('MINE22')).toBeNull();

    const old = Date.now() - 7 * 60 * 60 * 1000;
    localStorage.setItem(KEY, JSON.stringify({ OLDOLD: { code: 'OLDOLD', token: 't', roomName: 'x', savedAt: old, tabId: 'a', heartbeat: 0 } }));
    expect(savedSessions.get('OLDOLD')).toBeNull();
  });

  it('localStorage 無法使用時不會拋錯', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(savedSessions.latestResumable()).toBeNull();
    expect(() => savedSessions.save({ code: 'ABCDEF', token: 't', roomName: 'x' })).not.toThrow();
    spy.mockRestore();
  });
});

describe('回到房間 UI', () => {
  it('首頁顯示「回到房間」，點擊後接回該房間', () => {
    const client = mockClient({
      resumable: { code: 'ABCDEF', token: 't', roomName: '星際對決', savedAt: Date.now(), tabId: 'x', heartbeat: 0 },
    });
    renderWithClient(<HomePage />, client);
    expect(screen.getByTestId('resume-banner')).toHaveTextContent('星際對決');
    fireEvent.click(screen.getByRole('button', { name: '回到房間' }));
    expect(client.resumeRoom).toHaveBeenCalledWith('ABCDEF');
  });

  it('邀請連結對應的身分正在其他分頁使用時，可選擇在此分頁接回', () => {
    const client = mockClient({ canResume: vi.fn(() => true) });
    const onClose = vi.fn();
    renderWithClient(<JoinCodeModal open onClose={onClose} presetCode="ABCDEF" />, client);
    fireEvent.click(screen.getByRole('button', { name: '在此分頁接回原座位' }));
    expect(client.resumeRoom).toHaveBeenCalledWith('ABCDEF');
    expect(onClose).toHaveBeenCalled();
  });
});

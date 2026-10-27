import { useEffect, useState } from 'react';
import { normalizeRoomCode } from '@starry/shared';
import { Modal } from '../components/Modal';
import { useClient } from '../lib/client';
import { NicknameField } from './NicknameField';

/** 輸入房間代碼加入；也用於邀請連結（預先帶入代碼） */
export function JoinCodeModal({
  open,
  onClose,
  presetCode,
  title = '加入房間',
}: {
  open: boolean;
  onClose: () => void;
  presetCode?: string | null;
  title?: string;
}) {
  const { nickname, setNickname, joinRoom, busy, connection, canResume, resumeRoom } = useClient();
  const [code, setCode] = useState(presetCode ?? '');
  useEffect(() => {
    if (presetCode) setCode(presetCode);
  }, [presetCode]);

  const normalized = normalizeRoomCode(code);
  const resumableHere = !!presetCode && canResume(presetCode);
  const canSubmit = !!normalized && nickname.trim().length > 0 && connection === 'connected' && !busy;

  const submit = async () => {
    if (!normalized) return;
    const ok = await joinRoom(normalized);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn-teal min-w-[8rem]" disabled={!canSubmit} onClick={submit}>
            {busy ? '加入中…' : '🚀 加入'}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void submit();
        }}
      >
        {resumableHere && (
          <div className="rounded-2xl border border-amber-200/40 bg-amber-300/10 p-3 text-sm" data-testid="takeover-hint">
            <p className="text-amber-100">你在另一個分頁已經是這個房間的玩家。</p>
            <p className="mt-1 text-white/65">可以在此分頁接回原本的座位（另一個分頁會中斷），或在下方以新玩家身分加入。</p>
            <button
              type="button"
              className="btn-gold mt-2 w-full"
              disabled={connection !== 'connected'}
              onClick={() => {
                resumeRoom(presetCode!);
                onClose();
              }}
            >
              在此分頁接回原座位
            </button>
          </div>
        )}
        <NicknameField value={nickname} onChange={setNickname} autoFocus={!nickname} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-white/70">房間代碼</span>
          <input
            className="field text-center font-mono text-2xl uppercase tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            placeholder="ABC123"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-label="房間代碼"
            readOnly={!!presetCode}
          />
          {code && !normalized && <span className="mt-1 block text-xs text-amber-200">代碼為 6～8 碼英數字（不含 0、O、1、I）</span>}
        </label>
        <button type="submit" hidden />
        {connection !== 'connected' && <p className="text-sm text-amber-200">正在連線到伺服器…</p>}
      </form>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { DEFAULT_ROOM_RULES, ROOM_NAME_MAX, TURN_TIME_OPTIONS, type RoomRules } from '@starry/shared';
import { Modal } from '../components/Modal';
import { useClient } from '../lib/client';
import { NicknameField } from './NicknameField';

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-2xl border border-white/15 bg-space-950/50 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-[40px] flex-1 rounded-xl px-2 text-sm font-semibold transition ${
            value === o.value ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-glow' : 'text-white/65 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left"
    >
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-xs text-white/55">{hint}</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-teal-400' : 'bg-white/20'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
}

export function RulesEditor({ rules, onChange }: { rules: RoomRules; onChange: (r: RoomRules) => void }) {
  return (
    <div className="space-y-2">
      <Toggle
        checked={rules.goalLock}
        onChange={(v) => onChange({ ...rules, goalLock: v })}
        label="目標區鎖定"
        hint="棋子進入目標區後不能再離開"
      />
      <Toggle
        checked={rules.antiBlocking}
        onChange={(v) => onChange({ ...rules, antiBlocking: v })}
        label="防堵規則"
        hint="目標區被佔滿且含自己棋子即獲勝"
      />
      <div>
        <span className="mb-1.5 block text-sm font-medium text-white/70">回合限時</span>
        <Segmented
          label="回合限時"
          value={rules.turnTimeLimit}
          onChange={(v) => onChange({ ...rules, turnTimeLimit: v })}
          options={TURN_TIME_OPTIONS.map((t) => ({ value: t, label: t === 0 ? '不限' : `${t} 秒` }))}
        />
      </div>
    </div>
  );
}

export function CreateRoomModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { nickname, setNickname, createRoom, busy, connection } = useClient();
  const [roomName, setRoomName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [rules, setRules] = useState<RoomRules>(DEFAULT_ROOM_RULES);

  useEffect(() => {
    if (open && !roomName && nickname.trim()) setRoomName(`${nickname.trim()} 的房間`);
  }, [open, nickname, roomName]);

  const submit = async () => {
    const ok = await createRoom({ roomName: roomName.trim() || `${nickname.trim()} 的房間`, isPublic, maxPlayers, rules });
    if (ok) onClose();
  };

  const canSubmit = nickname.trim().length > 0 && connection === 'connected' && !busy;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="建立房間"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary min-w-[8rem]" disabled={!canSubmit} onClick={submit}>
            {busy ? '建立中…' : '✨ 建立房間'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <NicknameField value={nickname} onChange={setNickname} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-white/70">房間名稱</span>
          <input className="field" value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={ROOM_NAME_MAX} placeholder="例如：週末星際對決" />
        </label>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-white/70">房間類型</span>
          <Segmented
            label="房間類型"
            value={isPublic ? 'public' : 'private'}
            onChange={(v) => setIsPublic(v === 'public')}
            options={[
              { value: 'public', label: '🌐 公開' },
              { value: 'private', label: '🔒 私人' },
            ]}
          />
          <p className="mt-1.5 text-xs text-white/50">
            {isPublic ? '會顯示在公開大廳，任何人都能加入。' : '不會出現在大廳，只能透過邀請連結或 8 碼代碼加入。'}
          </p>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-white/70">玩家人數上限</span>
          <Segmented
            label="玩家人數"
            value={maxPlayers}
            onChange={setMaxPlayers}
            options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n} 人` }))}
          />
          <p className="mt-1.5 text-xs text-white/50">房主可在人數未滿時提前開始（至少 2 人），座位依實際人數分配。</p>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-white/70">規則選項</span>
          <RulesEditor rules={rules} onChange={setRules} />
        </div>
        {connection !== 'connected' && <p className="text-sm text-amber-200">正在連線到伺服器…</p>}
      </div>
    </Modal>
  );
}

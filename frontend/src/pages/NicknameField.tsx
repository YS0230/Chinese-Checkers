import { NICKNAME_MAX } from '@starry/shared';
import { randomNickname } from '../lib/format';

export function NicknameField({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-white/70">你的暱稱</span>
      <div className="flex gap-2">
        <input
          className="field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={NICKNAME_MAX}
          placeholder="輸入暱稱（最多 16 字）"
          autoComplete="nickname"
          autoFocus={autoFocus}
          aria-label="你的暱稱"
        />
        <button type="button" className="icon-btn h-auto w-12 shrink-0" onClick={() => onChange(randomNickname())} aria-label="隨機暱稱" title="隨機暱稱">
          🎲
        </button>
      </div>
    </label>
  );
}

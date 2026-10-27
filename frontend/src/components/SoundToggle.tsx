import { useEffect, useState } from 'react';
import { isSoundEnabled, onSoundChange, play, setSoundEnabled } from '../lib/sound';

export function useSoundEnabled(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(isSoundEnabled);
  useEffect(() => {
    const off = onSoundChange(setOn);
    return () => {
      off();
    };
  }, []);
  return [on, setSoundEnabled];
}

export function SoundToggle({ withLabel = false }: { withLabel?: boolean }) {
  const [on, set] = useSoundEnabled();
  const toggle = () => {
    set(!on);
    if (!on) setTimeout(() => play('click'), 0);
  };
  return (
    <button
      type="button"
      className={withLabel ? 'btn-ghost' : 'icon-btn'}
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? '關閉音效' : '開啟音效'}
      title={on ? '關閉音效' : '開啟音效'}
    >
      <span aria-hidden className="text-lg">
        {on ? '🔊' : '🔇'}
      </span>
      {withLabel && <span>{on ? '音效：開' : '音效：關'}</span>}
    </button>
  );
}

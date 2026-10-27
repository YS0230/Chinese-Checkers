import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { PLAYER_COLORS } from '@starry/shared';
import type { TurnPulse } from '../lib/client';
import { Marble } from './Marble';

/** 回合切換提示：輪到自己時顯示大型橫幅，其他玩家顯示小提示 */
export function TurnBanner({ pulse }: { pulse: TurnPulse | null }) {
  const [shown, setShown] = useState<TurnPulse | null>(null);
  useEffect(() => {
    if (!pulse) return;
    setShown(pulse);
    const t = setTimeout(() => setShown(null), pulse.mine ? 1500 : 1300);
    return () => clearTimeout(t);
  }, [pulse]);

  const color = shown ? PLAYER_COLORS[shown.colorIndex] : undefined;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
      <AnimatePresence>
        {shown?.mine && (
          <motion.div
            key={`mine-${shown.key}`}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ scaleX: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="w-full py-4 text-center"
            style={{
              background: `linear-gradient(90deg, transparent, ${color?.base}55 20%, ${color?.base}88 50%, ${color?.base}55 80%, transparent)`,
            }}
          >
            <motion.p
              initial={{ y: 12, opacity: 0, letterSpacing: '0.6em' }}
              animate={{ y: 0, opacity: 1, letterSpacing: '0.15em' }}
              transition={{ delay: 0.1, duration: 0.45 }}
              className="font-display text-3xl font-bold text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.8)] sm:text-4xl"
            >
              輪到你了！
            </motion.p>
          </motion.div>
        )}
        {shown && !shown.mine && (
          <motion.div
            key={`other-${shown.key}`}
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="glass absolute top-3 flex items-center gap-2 rounded-full px-4 py-2 text-sm"
          >
            <Marble colorIndex={shown.colorIndex} size={20} />
            <span>
              {shown.skipped ? '跳過回合 → ' : ''}
              <b>{shown.name}</b> 的回合
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

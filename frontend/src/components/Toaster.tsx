import { AnimatePresence, motion } from 'framer-motion';
import { dismissToast, useToasts } from '../lib/toast';

const STYLE = {
  info: 'border-cyan-300/40 bg-cyan-500/20',
  success: 'border-emerald-300/40 bg-emerald-500/20',
  warning: 'border-amber-300/50 bg-amber-500/20',
  error: 'border-rose-300/50 bg-rose-500/25',
} as const;
const ICON = { info: '✦', success: '✓', warning: '!', error: '✕' } as const;

export function Toaster() {
  const toasts = useToasts();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ top: 'calc(var(--safe-top) + 12px)' }}
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            onClick={() => dismissToast(t.id)}
            initial={{ y: -20, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -12, opacity: 0, scale: 0.95 }}
            className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur-xl ${STYLE[t.kind]}`}
            role={t.kind === 'error' ? 'alert' : 'status'}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs">{ICON[t.kind]}</span>
            <span className="text-left">{t.text}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

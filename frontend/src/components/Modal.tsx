import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** 玻璃擬態對話框：手機為底部抽屜樣式，桌面置中 */
export function Modal({ open, onClose, title, children, footer, wide }: ModalProps) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-space-950/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`glass-strong relative flex max-h-[min(90dvh,760px)] w-full flex-col rounded-b-none sm:mx-4 sm:rounded-b-3xl ${
              wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
            }`}
            style={{ paddingBottom: 'var(--safe-bottom)' }}
            initial={{ y: 60, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <h2 id={titleId} className="font-display text-xl font-semibold text-white">
                {title}
              </h2>
              <button className="icon-btn h-9 w-9" onClick={onClose} aria-label="關閉">
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 px-5 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

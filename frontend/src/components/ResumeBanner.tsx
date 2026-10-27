import { AnimatePresence, motion } from 'framer-motion';
import { useClient } from '../lib/client';
import { timeAgo } from '../lib/format';

/** 分頁被關閉後再次開啟：提示可以回到原本的房間 */
export function ResumeBanner({ className = '' }: { className?: string }) {
  const { resumable, resumeRoom, forgetResumable, connection } = useClient();
  return (
    <AnimatePresence>
      {resumable && (
        <motion.div
          key={resumable.code}
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          className={`glass flex w-full flex-col gap-3 border-amber-200/40 p-4 sm:flex-row sm:items-center ${className}`}
          style={{ boxShadow: '0 0 28px rgba(251,191,36,0.25)' }}
          role="region"
          aria-label="回到進行中的房間"
          data-testid="resume-banner"
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-100">🔄 你有一個未離開的房間</p>
            <p className="truncate text-sm text-white/70">
              {resumable.roomName}・<span className="font-mono tracking-widest">{resumable.code}</span>・
              {timeAgo(resumable.savedAt)}
              {timeAgo(resumable.savedAt) === '剛剛' ? '' : '前'}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 px-3 sm:flex-none" onClick={forgetResumable}>
              忽略
            </button>
            <button
              className="btn-gold flex-1 sm:flex-none"
              disabled={connection !== 'connected'}
              onClick={() => resumeRoom(resumable.code)}
            >
              回到房間
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { motion } from 'framer-motion';
import { Marble } from './Marble';

/** 首頁 Logo：旋轉星形 + 環繞彈珠 + 漸層標題，帶入場動畫 */
export function Logo({ compact = false }: { compact?: boolean }) {
  const size = compact ? 56 : 132;
  return (
    <div className={`flex ${compact ? 'flex-row gap-3' : 'flex-col gap-4'} items-center`}>
      <motion.div
        initial={{ scale: 0.3, rotate: -120, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        className="relative"
        style={{ width: size, height: size }}
      >
        <svg viewBox="-60 -60 120 120" width={size} height={size} className="drop-shadow-[0_0_24px_rgba(192,38,211,0.6)]">
          <defs>
            <linearGradient id="logo-star" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="50%" stopColor="#f0abfc" />
              <stop offset="100%" stopColor="#5eead4" />
            </linearGradient>
            <radialGradient id="logo-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff7d6" />
              <stop offset="60%" stopColor="#fbbf24" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g className="motion-safe:animate-[orbit_40s_linear_infinite]" style={{ transformOrigin: 'center', transformBox: 'fill-box' }}>
            <polygon
              points="0,-56 14,-24 48,-28 28,0 48,28 14,24 0,56 -14,24 -48,28 -28,0 -48,-28 -14,-24"
              fill="url(#logo-star)"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </g>
          <circle r="22" fill="url(#logo-core)" />
        </svg>
        {!compact &&
          [0, 1, 2, 3, 4, 5].map((i) => (
            <motion.div
              key={i}
              className="absolute left-1/2 top-1/2"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + i * 0.08, type: 'spring', stiffness: 220, damping: 14 }}
              style={{
                x: Math.cos((i * Math.PI) / 3 - Math.PI / 2) * 58 - 11,
                y: Math.sin((i * Math.PI) / 3 - Math.PI / 2) * 58 - 11,
              }}
            >
              <div className="motion-safe:animate-float" style={{ animationDelay: `${i * -0.6}s` }}>
                <Marble colorIndex={i} size={22} />
              </div>
            </motion.div>
          ))}
      </motion.div>
      <motion.div
        initial={{ y: 16, opacity: 0, filter: 'blur(8px)' }}
        animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
        transition={{ delay: compact ? 0 : 0.25, duration: 0.7, ease: 'easeOut' }}
        className={compact ? 'text-left' : 'text-center'}
      >
        <h1
          className={`title-gradient font-display font-bold leading-tight motion-safe:animate-shimmer ${
            compact ? 'text-xl' : 'text-4xl sm:text-5xl'
          }`}
        >
          星際彈珠中國跳棋
        </h1>
        {!compact && (
          <p className="mt-2 font-display text-sm tracking-[0.35em] text-cyan-100/70 sm:text-base">STARRY CHINESE CHECKERS</p>
        )}
      </motion.div>
    </div>
  );
}

import { useId } from 'react';
import { PLAYER_COLORS } from '@starry/shared';

interface MarbleProps {
  colorIndex: number;
  size?: number;
  className?: string;
  dim?: boolean;
  title?: string;
}

/** 立體玻璃彈珠（SVG），用於頭像、列表等 */
export function Marble({ colorIndex, size = 28, className, dim, title }: MarbleProps) {
  const id = useId().replace(/:/g, '');
  const c = PLAYER_COLORS[colorIndex] ?? { base: '#94a3b8', light: '#e2e8f0', dark: '#334155', name: '' };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ opacity: dim ? 0.4 : 1, filter: `drop-shadow(0 3px 6px ${c.base}66)` }}
    >
      <defs>
        <radialGradient id={`m${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="45%" stopColor={c.base} />
          <stop offset="100%" stopColor={c.dark} />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="17" fill={`url(#m${id})`} />
      <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      <ellipse cx="14.5" cy="13" rx="6" ry="3.8" fill="white" opacity="0.75" transform="rotate(-25 14.5 13)" />
      <circle cx="26" cy="27" r="2.2" fill="white" opacity="0.25" />
    </svg>
  );
}

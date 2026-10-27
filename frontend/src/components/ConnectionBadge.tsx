import type { Connection } from '../lib/client';

const MAP: Record<Connection, { label: string; dot: string; ring: string }> = {
  connecting: { label: '連線中', dot: 'bg-amber-300', ring: 'border-amber-300/40 text-amber-100' },
  connected: { label: '已連線', dot: 'bg-emerald-400', ring: 'border-emerald-300/30 text-emerald-100' },
  reconnecting: { label: '重新連線中', dot: 'bg-amber-300', ring: 'border-amber-300/40 text-amber-100' },
  offline: { label: '離線', dot: 'bg-rose-400', ring: 'border-rose-300/40 text-rose-100' },
};

export function ConnectionBadge({ status, compact = false }: { status: Connection; compact?: boolean }) {
  const s = MAP[status];
  return (
    <span
      className={`chip bg-space-950/50 backdrop-blur ${s.ring}`}
      role="status"
      aria-label={`連線狀態：${s.label}`}
      data-testid="connection-badge"
      data-status={status}
    >
      <span className="relative flex h-2 w-2">
        {status !== 'connected' && (
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping ${s.dot}`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
      </span>
      {!compact && s.label}
    </span>
  );
}

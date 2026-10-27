import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { ROOM_STATUS_LABEL, type PublicRoomSummary, type RoomStatus } from '@starry/shared';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { Logo } from '../components/Logo';
import { Marble } from '../components/Marble';
import { ResumeBanner } from '../components/ResumeBanner';
import { SoundToggle } from '../components/SoundToggle';
import { useClient } from '../lib/client';
import { filterRooms, timeAgo, type LobbyFilter } from '../lib/format';
import { play } from '../lib/sound';
import { CreateRoomModal, Segmented } from './CreateRoomModal';
import { JoinCodeModal } from './JoinCodeModal';

const STATUS_STYLE: Record<RoomStatus, string> = {
  waiting: 'border-cyan-300/40 bg-cyan-400/15 text-cyan-100',
  ready: 'border-amber-300/50 bg-amber-400/15 text-amber-100',
  playing: 'border-fuchsia-300/40 bg-fuchsia-400/15 text-fuchsia-100',
  finished: 'border-white/20 bg-white/10 text-white/60',
};

export function StatusChip({ status }: { status: RoomStatus }) {
  return <span className={`chip ${STATUS_STYLE[status]}`}>{ROOM_STATUS_LABEL[status]}</span>;
}

export function RoomCard({ room, onJoin, now }: { room: PublicRoomSummary; onJoin: (code: string) => void; now: number }) {
  const reason = room.status === 'playing' ? '遊戲中' : room.status === 'finished' ? '已結束' : room.joinable ? null : '已滿員';
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass group flex flex-col gap-3 p-4 transition hover:border-white/30"
      data-testid="room-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-semibold">{room.name}</h3>
          <p className="truncate text-sm text-white/60">👑 {room.hostName}</p>
        </div>
        <StatusChip status={room.status} />
      </div>
      <div className="flex items-center gap-1.5" aria-label={`玩家 ${room.playerCount} / ${room.maxPlayers}`}>
        {Array.from({ length: room.maxPlayers }, (_, i) =>
          room.colors[i] !== undefined ? (
            <Marble key={i} colorIndex={room.colors[i]!} size={24} />
          ) : (
            <span key={i} className="h-6 w-6 rounded-full border-2 border-dashed border-white/25" />
          ),
        )}
        <span className="ml-auto font-display text-lg font-semibold">
          {room.playerCount}
          <span className="text-white/45">/{room.maxPlayers}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/55">
        <span className="chip border-white/15 font-mono tracking-widest text-white/80">{room.code}</span>
        {room.rules.turnTimeLimit > 0 && <span className="chip border-white/15">⏱ {room.rules.turnTimeLimit}s</span>}
        {room.rules.goalLock && <span className="chip border-white/15">🔒 目標鎖定</span>}
        <span className="ml-auto">
          {room.startedAt ? `已進行 ${timeAgo(room.startedAt, now)}` : `${timeAgo(room.createdAt, now)}${timeAgo(room.createdAt, now) === '剛剛' ? '' : '前'}建立`}
        </span>
      </div>
      <button className={reason ? 'btn-ghost' : 'btn-teal'} disabled={!!reason} onClick={() => onJoin(room.code)}>
        {reason ?? '加入房間'}
      </button>
    </motion.li>
  );
}

function EmptyState({ filtered, onCreate }: { filtered: boolean; onCreate: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass flex flex-col items-center gap-4 px-6 py-12 text-center" data-testid="lobby-empty">
      <svg viewBox="0 0 160 120" className="h-32 w-40" aria-hidden>
        <defs>
          <radialGradient id="planet" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="55%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </radialGradient>
        </defs>
        <g className="motion-safe:animate-float">
          <circle cx="80" cy="60" r="32" fill="url(#planet)" />
          <ellipse cx="80" cy="62" rx="58" ry="12" fill="none" stroke="#5eead4" strokeWidth="3" opacity="0.7" transform="rotate(-14 80 62)" />
          <ellipse cx="70" cy="48" rx="9" ry="5" fill="#fff" opacity="0.35" />
        </g>
        {[
          [20, 20],
          [140, 30],
          [130, 100],
          [30, 95],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2" fill="#fde68a" className="motion-safe:animate-pulse" style={{ animationDelay: `${i * 0.4}s` }} />
        ))}
      </svg>
      <div>
        <h3 className="font-display text-xl font-semibold">{filtered ? '沒有符合條件的房間' : '目前沒有公開房間'}</h3>
        <p className="mt-1 text-sm text-white/60">{filtered ? '試試調整搜尋或篩選條件。' : '成為第一位開房的星際旅人吧！'}</p>
      </div>
      <button className="btn-gold" onClick={onCreate}>
        ✨ 建立房間
      </button>
    </motion.div>
  );
}

export function LobbyPage() {
  const { publicRooms, lobbyLoading, refreshLobby, connection, goHome, nickname, joinRoom } = useClient();
  const [filter, setFilter] = useState<LobbyFilter>({ query: '', size: 0, joinableOnly: false });
  const [createOpen, setCreateOpen] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const rooms = useMemo(() => filterRooms(publicRooms, filter), [publicRooms, filter]);
  const isFiltered = filter.query !== '' || filter.size !== 0 || filter.joinableOnly;

  const onJoin = (code: string) => {
    play('click');
    if (!nickname.trim()) setJoinCode(code);
    else void joinRoom(code);
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:py-6">
      <header className="flex items-center justify-between gap-3">
        <button className="icon-btn" onClick={goHome} aria-label="回首頁">
          ←
        </button>
        <button onClick={goHome} className="min-w-0" aria-label="回首頁">
          <Logo compact />
        </button>
        <div className="flex items-center gap-2">
          <ConnectionBadge status={connection} compact />
          <SoundToggle />
        </div>
      </header>

      <ResumeBanner />
      <section className="glass p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold">公開房間大廳</h2>
            <p className="flex items-center gap-1.5 text-sm text-white/60">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              即時更新中・共 {publicRooms.length} 間
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setCodeOpen(true)}>
              🔑 輸入代碼
            </button>
            <button className="btn-gold" onClick={() => setCreateOpen(true)}>
              ✨ 建立房間
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <div className="flex gap-2">
            <input
              className="field"
              value={filter.query}
              onChange={(e) => setFilter({ ...filter, query: e.target.value })}
              placeholder="搜尋房名、代碼或房主"
              aria-label="搜尋房間"
              type="search"
            />
            <button
              className="icon-btn h-auto w-12 shrink-0"
              onClick={() => void refreshLobby()}
              aria-label="重新整理"
              title="重新整理"
              disabled={connection !== 'connected'}
            >
              <span className={lobbyLoading ? 'inline-block motion-safe:animate-spin' : ''}>⟳</span>
            </button>
          </div>
          <div className="min-w-0 md:w-80">
            <Segmented
              label="人數篩選"
              value={filter.size}
              onChange={(size) => setFilter({ ...filter, size })}
              options={[{ value: 0, label: '全部' }, ...[2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n}人` }))]}
            />
          </div>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-2xl border border-white/15 px-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-teal-400"
              checked={filter.joinableOnly}
              onChange={(e) => setFilter({ ...filter, joinableOnly: e.target.checked })}
            />
            只顯示可加入
          </label>
        </div>
      </section>

      {connection !== 'connected' && publicRooms.length === 0 ? (
        <div className="glass flex items-center justify-center gap-3 py-12 text-white/70" role="status">
          <span className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white motion-safe:animate-spin" />
          正在連線到伺服器…
        </div>
      ) : lobbyLoading && publicRooms.length === 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="載入中">
          {[0, 1, 2].map((i) => (
            <li key={i} className="glass h-48 animate-pulse bg-white/[0.04]" />
          ))}
        </ul>
      ) : rooms.length === 0 ? (
        <EmptyState filtered={isFiltered} onCreate={() => setCreateOpen(true)} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {rooms.map((r) => (
              <RoomCard key={r.code} room={r} onJoin={onJoin} now={now} />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinCodeModal open={codeOpen} onClose={() => setCodeOpen(false)} />
      <JoinCodeModal open={!!joinCode} onClose={() => setJoinCode(null)} presetCode={joinCode} />
    </div>
  );
}

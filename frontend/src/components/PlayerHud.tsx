import { motion } from 'framer-motion';
import { CELLS, PLAYER_COLORS, type GameView } from '@starry/shared';
import { Marble } from './Marble';

export function seatsInGoal(game: GameView): number[] {
  const counts = game.state.seats.map(() => 0);
  for (const p of game.state.pieces) {
    if (CELLS[p.cell]!.zone === game.state.seats[p.seat]!.goalZone) counts[p.seat]!++;
  }
  return counts;
}

interface PlayerHudProps {
  game: GameView;
  myId: string | null;
  now: number;
  /** 房間設定的每回合秒數（0 = 不限時），用於計時條比例 */
  turnLimit: number;
  layout: 'strip' | 'list';
}

/** 玩家順序、目前回合、目標區進度、連線狀態 */
export function PlayerHud({ game, myId, now, turnLimit, layout }: PlayerHudProps) {
  const inGoal = seatsInGoal(game);
  const { state } = game;
  const deadline = game.turnDeadline;
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;

  return (
    <ol
      className={
        layout === 'strip'
          ? 'no-scrollbar flex gap-2 overflow-x-auto px-3 py-2'
          : 'flex flex-col gap-2'
      }
      aria-label="玩家順序"
    >
      {game.seats.map((s, seat) => {
        const current = !state.over && state.currentSeat === seat;
        const winner = state.winnerSeat === seat;
        const color = PLAYER_COLORS[s.colorIndex]!;
        const me = s.playerId === myId;
        return (
          <motion.li
            key={s.playerId}
            layout
            className={`relative flex shrink-0 items-center gap-2 rounded-2xl border px-2.5 py-1.5 transition-colors ${
              current ? 'border-white/60 bg-white/15' : 'border-white/10 bg-white/[0.05]'
            } ${!s.active ? 'opacity-45' : ''}`}
            style={current ? { boxShadow: `0 0 18px ${color.base}88` } : undefined}
            aria-current={current ? 'step' : undefined}
          >
            <span className="relative">
              <Marble colorIndex={s.colorIndex} size={layout === 'strip' ? 26 : 32} dim={!s.active} />
              {current && (
                <span
                  className="absolute -inset-1 rounded-full border-2 motion-safe:animate-ping"
                  style={{ borderColor: color.light, animationDuration: '1.6s' }}
                />
              )}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-sm font-semibold leading-tight">
                <span className={`truncate ${layout === 'strip' ? 'max-w-[6.5rem]' : 'max-w-[9rem]'}`}>{s.nickname}</span>
                {me && <span className="chip border-cyan-300/50 px-1.5 py-0 text-[10px] text-cyan-100">你</span>}
                {winner && <span aria-label="勝利">👑</span>}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-white/60">
                <span title="已進入目標區的棋子">★ {inGoal[seat]}/10</span>
                {!s.active ? (
                  <span className="text-rose-200">已離開</span>
                ) : !s.connected ? (
                  <span className="text-amber-200">斷線中</span>
                ) : current ? (
                  <span className="font-semibold" style={{ color: color.light }}>
                    {remaining !== null ? `⏱ ${remaining}s` : '思考中…'}
                  </span>
                ) : null}
              </span>
            </span>
            {current && deadline && (
              <span className="absolute inset-x-2 bottom-0.5 h-0.5 overflow-hidden rounded-full bg-white/10">
                <span
                  className="block h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${Math.min(100, ((remaining ?? 0) / Math.max(1, turnLimit || 15)) * 100)}%`,
                    background: color.base,
                  }}
                />
              </span>
            )}
          </motion.li>
        );
      })}
    </ol>
  );
}

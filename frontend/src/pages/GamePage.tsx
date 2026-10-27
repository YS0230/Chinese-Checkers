import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PLAYER_COLORS, getLegalMoves, type GameOverPayload } from '@starry/shared';
import { Board } from '../components/Board';
import { Celebration } from '../components/Celebration';
import { ChatPanel } from '../components/ChatPanel';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { Marble } from '../components/Marble';
import { Modal } from '../components/Modal';
import { PlayerHud } from '../components/PlayerHud';
import { SoundToggle } from '../components/SoundToggle';
import { TurnBanner } from '../components/TurnBanner';
import { useClient } from '../lib/client';
import { hexToHue } from '../lib/format';
import { play } from '../lib/sound';
import { storage } from '../lib/storage';

const EMPTY = new Map<number, number[]>();
const ZOOMS = [1, 1.5, 2];

function VictoryOverlay({
  result,
  myId,
  isHost,
  onClose,
  onRematch,
  onLeave,
}: {
  result: GameOverPayload;
  myId: string | null;
  isHost: boolean;
  onClose: () => void;
  onRematch: () => void;
  onLeave: () => void;
}) {
  const winner = result.rankings.find((r) => r.winner);
  const iWon = !!winner && winner.playerId === myId;
  const hues = useMemo(() => {
    const base = winner ? [hexToHue(PLAYER_COLORS[winner.colorIndex]!.base)] : [];
    return [...base, 45, 280, 190];
  }, [winner]);
  const reasonText =
    result.reason === 'goal' ? '所有彈珠抵達目標區！' : result.reason === 'forfeit' ? '其他玩家已離開' : '沒有玩家能繼續移動';

  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-space-950/75 backdrop-blur-md" />
      {winner && <Celebration hues={hues} />}
      <motion.div
        className="glass-strong relative z-50 w-full max-w-md overflow-hidden p-6 text-center"
        initial={{ scale: 0.6, y: 40, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.15 }}
        role="dialog"
        aria-modal="true"
        aria-label="遊戲結算"
      >
        <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-48 rounded-full bg-amber-300/30 blur-3xl" />
        <motion.div
          initial={{ rotate: -20, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.35 }}
          className="text-6xl"
          aria-hidden
        >
          {iWon ? '🏆' : winner ? '👑' : '🌙'}
        </motion.div>
        <h2 className="title-gradient mt-2 font-display text-3xl font-bold motion-safe:animate-shimmer">
          {iWon ? '你獲勝了！' : winner ? `${winner.nickname} 獲勝！` : '遊戲結束'}
        </h2>
        <p className="mt-1 text-sm text-white/60">{reasonText}</p>

        <ol className="mt-5 space-y-2 text-left">
          {result.rankings.map((r, i) => (
            <motion.li
              key={r.playerId}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.5 + i * 0.08 }}
              className={`flex items-center gap-3 rounded-2xl border px-3 py-2 ${
                r.winner ? 'border-amber-200/50 bg-amber-300/15' : 'border-white/10 bg-white/[0.05]'
              }`}
            >
              <span className="w-6 text-center font-display text-lg font-bold text-white/70">{i + 1}</span>
              <Marble colorIndex={r.colorIndex} size={28} />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {r.nickname}
                {r.playerId === myId && <span className="text-cyan-200">（你）</span>}
              </span>
              <span className="text-sm text-white/70">★ {r.inGoal}/10</span>
            </motion.li>
          ))}
        </ol>

        <div className="mt-6 grid gap-2">
          {isHost ? (
            <button className="btn-primary" onClick={onRematch}>
              🔁 再來一局（回到等待室）
            </button>
          ) : (
            <p className="text-sm text-white/60">等待房主開啟下一局…</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={onClose}>
              查看棋盤
            </button>
            <button className="btn-danger" onClick={onLeave}>
              離開房間
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function GamePage() {
  const { room, you, game, result, chat, turnPulse, makeMove, leaveRoom, returnToRoom, sendChat, connection } = useClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [confirmMoves, setConfirmMovesState] = useState<boolean>(() => storage.get('confirmMoves', false));
  const [chatOpen, setChatOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [showResult, setShowResult] = useState(true);
  const [now, setNow] = useState(Date.now());
  const seenChat = useRef(chat.length);

  const state = game?.state;
  const turnNumber = state?.turnNumber;
  const mySeatIdx = game && you ? game.seats.findIndex((s) => s.playerId === you.playerId) : -1;
  const mySeat = mySeatIdx >= 0 ? mySeatIdx : null;
  const isMyTurn = !!state && mySeat !== null && !state.over && state.currentSeat === mySeat;
  const canAct = isMyTurn && !submitting && connection === 'connected';

  const targets = useMemo(() => (state && selected !== null ? getLegalMoves(state, selected) : EMPTY), [state, selected]);

  const cancel = useCallback(() => {
    setSelected(null);
    setConfirmTarget(null);
    setHover(null);
  }, []);

  useEffect(cancel, [turnNumber, cancel]);
  useEffect(() => {
    if (result) setShowResult(true);
  }, [result]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancel]);
  useEffect(() => {
    if (!game?.turnDeadline) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [game?.turnDeadline]);
  useEffect(() => {
    if (chatOpen) seenChat.current = chat.length;
  }, [chatOpen, chat.length]);

  const commit = useCallback(
    async (from: number, to: number) => {
      setSubmitting(true);
      const ok = await makeMove(from, to);
      setSubmitting(false);
      if (ok) cancel();
      else setConfirmTarget(null);
    },
    [makeMove, cancel],
  );

  const onCellClick = useCallback(
    (cell: number) => {
      if (!state || submitting) return;
      if (selected !== null && targets.has(cell)) {
        if (!canAct) return;
        if (confirmMoves) {
          setConfirmTarget(cell);
          play('click');
          return;
        }
        void commit(selected, cell);
        return;
      }
      const pid = state.occupancy[cell]!;
      if (pid >= 0 && state.pieces[pid]!.seat === mySeat) {
        if (selected === cell) {
          cancel();
          return;
        }
        setSelected(cell);
        setConfirmTarget(null);
        play('select');
        return;
      }
      cancel();
    },
    [state, submitting, selected, targets, canAct, confirmMoves, commit, mySeat, cancel],
  );

  if (!room || !game || !state) return null;

  const isHost = room.hostId === you?.playerId;
  const current = game.seats[state.currentSeat];
  const myColor = mySeat !== null ? PLAYER_COLORS[game.seats[mySeat]!.colorIndex]! : null;
  const unread = Math.max(0, chat.length - seenChat.current);
  const zoom = ZOOMS[zoomIdx]!;

  const statusText = state.over
    ? '遊戲結束'
    : isMyTurn
      ? selected === null
        ? '輪到你了：選擇一顆彈珠'
        : targets.size
          ? '選擇發光的落點'
          : '這顆彈珠無法移動，換一顆試試'
      : `等待 ${current?.nickname ?? ''} 行動…`;

  const setConfirmMoves = (v: boolean) => {
    setConfirmMovesState(v);
    storage.set('confirmMoves', v);
    setConfirmTarget(null);
  };

  const controls = (
    <>
      <button className="btn-ghost px-3" onClick={cancel} disabled={selected === null}>
        ✕ 取消
      </button>
      <button
        className="btn-ghost px-3"
        onClick={() => setZoomIdx((i) => (i + 1) % ZOOMS.length)}
        aria-label={`縮放棋盤（目前 ${zoom}x）`}
      >
        🔍 {zoom}x
      </button>
      <button
        className={`btn-ghost px-3 ${confirmMoves ? 'border-teal-300/60 bg-teal-400/15' : ''}`}
        onClick={() => setConfirmMoves(!confirmMoves)}
        aria-pressed={confirmMoves}
        title="移動前先預覽路徑並確認"
      >
        {confirmMoves ? '☑' : '☐'} 確認
      </button>
    </>
  );

  const status = (
    <div
      className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm"
      style={isMyTurn && myColor ? { borderColor: `${myColor.light}88`, boxShadow: `0 0 16px ${myColor.base}55` } : undefined}
      role="status"
      aria-live="polite"
    >
      {current && !state.over && <Marble colorIndex={current.colorIndex} size={18} />}
      <span className="truncate">{statusText}</span>
      {submitting && <span className="ml-auto h-4 w-4 shrink-0 rounded-full border-2 border-white/30 border-t-white motion-safe:animate-spin" />}
    </div>
  );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden lg:grid lg:grid-cols-[270px_minmax(0,1fr)_320px] short:flex-row">
      {/* 手機直向：頂部列 */}
      <header className="flex items-center gap-2 px-3 pt-2 lg:hidden short:hidden">
        <button className="icon-btn shrink-0" onClick={() => setLeaveOpen(true)} aria-label="退出遊戲">
          ⏏
        </button>
        <div className="min-w-0 flex-1">{status}</div>
        <ConnectionBadge status={connection} compact />
        <SoundToggle />
      </header>
      <div className="lg:hidden short:hidden">
        <PlayerHud game={game} myId={you?.playerId ?? null} now={now} turnLimit={room.rules.turnTimeLimit} layout="strip" />
      </div>

      {/* 桌面 / 橫向：左側欄 */}
      <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto p-3 lg:flex short:flex short:w-64 short:shrink-0">
        <div className="flex items-center gap-2">
          <button className="btn-ghost px-3" onClick={() => setLeaveOpen(true)}>
            ⏏ 退出
          </button>
          <span className="ml-auto" />
          <ConnectionBadge status={connection} compact />
          <SoundToggle />
        </div>
        <div className="glass p-3">
          <p className="truncate font-display font-semibold">{room.name}</p>
          <p className="font-mono text-xs tracking-widest text-white/50">{room.code}</p>
        </div>
        {status}
        <PlayerHud game={game} myId={you?.playerId ?? null} now={now} turnLimit={room.rules.turnTimeLimit} layout="list" />
        <div className="grid grid-cols-3 gap-2 [&>button]:px-1 [&>button]:text-sm">{controls}</div>
        <button className="btn-ghost lg:hidden" onClick={() => setChatOpen(true)}>
          💬 聊天 {unread > 0 && <span className="chip border-rose-300 bg-rose-500 text-white">{unread}</span>}
        </button>
        {state.over && result && !showResult && (
          <button className="btn-gold" onClick={() => setShowResult(true)}>
            🏆 查看結算
          </button>
        )}
      </aside>

      {/* 棋盤 */}
      <main className="relative min-h-0 min-w-0 flex-1 p-1 sm:p-3">
        <Board
          game={game}
          mySeat={mySeat}
          selected={selected}
          targets={targets}
          preview={confirmTarget ?? hover}
          interactive={canAct}
          zoom={zoom}
          onCellClick={onCellClick}
          onCellHover={setHover}
        />
        <TurnBanner pulse={turnPulse} />
        <AnimatePresence>
          {confirmTarget !== null && selected !== null && (
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              className="glass-strong absolute inset-x-3 bottom-3 z-30 mx-auto flex max-w-sm items-center gap-2 p-2"
            >
              <span className="flex-1 pl-2 text-sm">確認移動到這裡？</span>
              <button className="btn-ghost px-3" onClick={() => setConfirmTarget(null)}>
                取消
              </button>
              <button className="btn-teal px-4" disabled={submitting} onClick={() => void commit(selected, confirmTarget)}>
                確認
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* 手機直向：底部操作列 */}
      <footer className="flex items-center gap-2 px-3 pb-2 pt-1 lg:hidden short:hidden [&>button]:flex-1 [&>button]:px-2 [&>button]:text-sm">
        {controls}
        <button className="btn-ghost relative" onClick={() => setChatOpen(true)} aria-label="聊天">
          💬
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold">
              {unread}
            </span>
          )}
        </button>
        {state.over && result && !showResult && (
          <button className="btn-gold" onClick={() => setShowResult(true)}>
            🏆
          </button>
        )}
      </footer>

      {/* 桌面：右側聊天 */}
      <aside className="hidden min-h-0 flex-col p-3 lg:flex">
        <div className="glass flex min-h-0 flex-1 flex-col p-4">
          <h3 className="mb-2 font-display text-lg font-semibold">聊天室</h3>
          <ChatPanel messages={chat} myId={you?.playerId ?? null} onSend={sendChat} className="flex-1" />
        </div>
      </aside>

      <Modal open={chatOpen} onClose={() => setChatOpen(false)} title="聊天室">
        <ChatPanel messages={chat} myId={you?.playerId ?? null} onSend={sendChat} className="h-[50dvh]" />
      </Modal>

      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="退出遊戲？"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setLeaveOpen(false)}>
              繼續遊戲
            </button>
            <button className="btn-danger" onClick={() => void leaveRoom()}>
              退出
            </button>
          </>
        }
      >
        <p className="text-white/75">
          {state.over ? '確定要離開房間嗎？' : '遊戲進行中離開將視為棄權，你的彈珠會留在棋盤上，其他玩家繼續遊戲。'}
        </p>
      </Modal>

      <AnimatePresence>
        {state.over && result && showResult && (
          <VictoryOverlay
            result={result}
            myId={you?.playerId ?? null}
            isHost={isHost}
            onClose={() => setShowResult(false)}
            onRematch={() => void returnToRoom()}
            onLeave={() => void leaveRoom()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { PLAYER_COLORS, ROOM_NAME_MAX, type RoomRules, type RoomView } from '@starry/shared';
import { ChatPanel } from '../components/ChatPanel';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { Marble } from '../components/Marble';
import { Modal } from '../components/Modal';
import { SoundToggle } from '../components/SoundToggle';
import { inviteLink, useClient } from '../lib/client';
import { play } from '../lib/sound';
import { toast } from '../lib/toast';
import { RulesEditor, Segmented, Toggle } from './CreateRoomModal';
import { StatusChip } from './LobbyPage';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 舊瀏覽器 / 非安全來源的退路
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function SettingsModal({ open, onClose, room }: { open: boolean; onClose: () => void; room: RoomView }) {
  const { updateSettings } = useClient();
  const [name, setName] = useState(room.name);
  const [isPublic, setIsPublic] = useState(room.isPublic);
  const [maxPlayers, setMaxPlayers] = useState(room.maxPlayers);
  const [rules, setRules] = useState<RoomRules>(room.rules);
  useEffect(() => {
    if (!open) return;
    setName(room.name);
    setIsPublic(room.isPublic);
    setMaxPlayers(room.maxPlayers);
    setRules(room.rules);
  }, [open, room]);

  const save = async () => {
    const ok = await updateSettings({ roomName: name, isPublic, maxPlayers, rules });
    if (ok) {
      toast('設定已更新', 'success');
      onClose();
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="房間設定"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={save}>
            儲存
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-white/70">房間名稱</span>
          <input className="field" value={name} maxLength={ROOM_NAME_MAX} onChange={(e) => setName(e.target.value)} />
        </label>
        <Toggle checked={isPublic} onChange={setIsPublic} label="公開房間" hint="顯示在公開大廳" />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-white/70">人數上限</span>
          <Segmented
            label="人數上限"
            value={maxPlayers}
            onChange={setMaxPlayers}
            options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n} 人` }))}
          />
        </div>
        <RulesEditor rules={rules} onChange={setRules} />
        <p className="text-xs text-white/50">變更規則會重置所有玩家的準備狀態。</p>
      </div>
    </Modal>
  );
}

export function WaitingRoom() {
  const { room, you, chat, setReady, kick, startGame, leaveRoom, sendChat, connection, busy } = useClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  if (!room || !you) return null;

  const me = room.players.find((p) => p.id === you.playerId);
  const isHost = room.hostId === you.playerId;
  const notReady = room.players.filter((p) => !p.ready);
  const offline = room.players.filter((p) => !p.connected);
  const canStart = isHost && room.players.length >= 2 && notReady.length === 0 && offline.length === 0;
  const startHint =
    room.players.length < 2
      ? '至少需要 2 位玩家才能開始'
      : offline.length
        ? `等待 ${offline.map((p) => p.nickname).join('、')} 重新連線（或按 ✕ 移除）`
        : notReady.length
          ? `等待 ${notReady.map((p) => p.nickname).join('、')} 準備`
          : room.players.length < room.maxPlayers
            ? `可以開始（${room.players.length} 人局），或繼續等待更多玩家`
            : '所有人都準備好了！';

  const copyCode = async () => {
    play('click');
    toast((await copyText(room.code)) ? '已複製房間代碼' : '複製失敗，請手動複製', 'success');
  };
  const copyLink = async () => {
    play('click');
    const link = inviteLink(room.code);
    if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ title: '星際彈珠中國跳棋', text: `來和我玩中國跳棋！房間代碼 ${room.code}`, url: link });
        return;
      } catch {
        // 使用者取消分享時改為複製
      }
    }
    toast((await copyText(link)) ? '已複製邀請連結' : '複製失敗，請手動複製', 'success');
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:py-6">
      <header className="flex items-center justify-between gap-2">
        <button className="btn-ghost px-3" onClick={() => setConfirmLeave(true)}>
          ← 離開
        </button>
        <div className="flex items-center gap-2">
          <ConnectionBadge status={connection} compact />
          <SoundToggle />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto min-w-0 truncate font-display text-2xl font-semibold sm:text-3xl">{room.name}</h2>
              <span className="chip border-white/20 text-white/80">{room.isPublic ? '🌐 公開' : '🔒 私人'}</span>
              <StatusChip status={room.status} />
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={copyCode}
                className="group flex items-center justify-center gap-3 rounded-2xl border border-amber-200/40 bg-amber-300/10 px-5 py-3 transition hover:bg-amber-300/20"
                aria-label={`房間代碼 ${room.code}，點擊複製`}
              >
                <span className="text-xs text-amber-100/70">房間代碼</span>
                <span className="font-mono text-2xl font-bold tracking-[0.3em] text-amber-100 sm:text-3xl">{room.code}</span>
                <span className="text-amber-100/70">⧉</span>
              </button>
              <button className="btn-teal flex-1" onClick={copyLink}>
                🔗 複製邀請連結
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-white/65">
              <span className="chip border-white/15">👥 最多 {room.maxPlayers} 人</span>
              <span className="chip border-white/15">{room.rules.goalLock ? '🔒 目標區鎖定' : '🔓 目標區不鎖定'}</span>
              <span className="chip border-white/15">{room.rules.antiBlocking ? '🛡 防堵規則' : '防堵規則關閉'}</span>
              <span className="chip border-white/15">⏱ {room.rules.turnTimeLimit ? `${room.rules.turnTimeLimit} 秒/回合` : '不限時'}</span>
              {isHost && (
                <button className="chip border-violet-300/50 bg-violet-500/20 text-violet-100" onClick={() => setSettingsOpen(true)}>
                  ⚙ 房間設定
                </button>
              )}
            </div>
          </motion.section>

          <section className="glass p-4 sm:p-6">
            <h3 className="mb-3 font-display text-lg font-semibold">
              玩家 {room.players.length}/{room.maxPlayers}
            </h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <AnimatePresence initial={false}>
                {room.players.map((p) => {
                  const color = PLAYER_COLORS[p.colorIndex]!;
                  return (
                    <motion.li
                      key={p.id}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="relative flex flex-col items-center gap-2 rounded-3xl border border-white/15 bg-white/[0.06] px-3 py-4 text-center"
                      style={{ boxShadow: p.ready ? `0 0 22px ${color.base}55` : undefined }}
                      data-testid="player-slot"
                    >
                      {p.isHost && <span className="absolute left-3 top-2 text-lg" aria-label="房主">👑</span>}
                      {isHost && !p.isHost && (
                        <button
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-rose-500/30 hover:text-white"
                          onClick={() => void kick(p.id)}
                          aria-label={`移除 ${p.nickname}`}
                          title="移除玩家"
                        >
                          ✕
                        </button>
                      )}
                      <div className="motion-safe:animate-float" style={{ animationDelay: `${p.colorIndex * -0.7}s` }}>
                        <Marble colorIndex={p.colorIndex} size={56} dim={!p.connected} />
                      </div>
                      <span className="w-full truncate font-semibold">
                        {p.nickname}
                        {p.id === you.playerId && <span className="text-cyan-200">（你）</span>}
                      </span>
                      <span className="text-xs" style={{ color: color.light }}>
                        {color.name}
                      </span>
                      {!p.connected ? (
                        <span className="chip border-amber-300/40 text-amber-100">斷線中…</span>
                      ) : p.isHost ? (
                        <span className="chip border-violet-300/40 text-violet-100">房主</span>
                      ) : p.ready ? (
                        <span className="chip border-emerald-300/50 bg-emerald-400/15 text-emerald-100">✓ 已準備</span>
                      ) : (
                        <span className="chip border-white/20 text-white/60">尚未準備</span>
                      )}
                    </motion.li>
                  );
                })}
                {Array.from({ length: Math.max(0, room.maxPlayers - room.players.length) }, (_, i) => (
                  <motion.li
                    key={`empty-${i}`}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex min-h-[176px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-white/15 text-white/40"
                  >
                    <span className="relative h-14 w-14">
                      <span className="absolute inset-0 rounded-full border border-white/15" />
                      <span className="absolute inset-0 motion-safe:animate-orbit">
                        <span className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />
                      </span>
                    </span>
                    <span className="text-sm">等待玩家加入…</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              {isHost ? (
                <button className="btn-primary py-3.5 text-lg sm:min-w-[14rem]" disabled={!canStart || busy} onClick={() => void startGame()}>
                  {busy ? '啟動中…' : '🚀 開始遊戲'}
                </button>
              ) : (
                <button
                  className={me?.ready ? 'btn-ghost py-3.5 text-lg sm:min-w-[14rem]' : 'btn-teal py-3.5 text-lg sm:min-w-[14rem]'}
                  onClick={() => void setReady(!me?.ready)}
                >
                  {me?.ready ? '取消準備' : '✓ 我準備好了'}
                </button>
              )}
              <p className="text-sm text-white/60" role="status">
                {isHost ? startHint : me?.ready ? '等待房主開始遊戲…' : '準備好後請按「我準備好了」'}
              </p>
            </div>
          </section>
        </div>

        <section className="glass flex h-[360px] flex-col p-4 lg:h-auto lg:max-h-[calc(100dvh-7rem)]">
          <h3 className="mb-2 font-display text-lg font-semibold">聊天室</h3>
          <ChatPanel messages={chat} myId={you.playerId} onSend={sendChat} className="flex-1" />
        </section>
      </div>

      {isHost && <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} room={room} />}
      <Modal
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="離開房間？"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirmLeave(false)}>
              留下
            </button>
            <button className="btn-danger" onClick={() => void leaveRoom()}>
              離開
            </button>
          </>
        }
      >
        <p className="text-white/75">{isHost ? '你是房主，離開後房主會移交給下一位玩家。' : '確定要離開這個房間嗎？'}</p>
      </Modal>
    </div>
  );
}

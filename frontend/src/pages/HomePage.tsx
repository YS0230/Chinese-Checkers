import { motion } from 'framer-motion';
import { useState } from 'react';
import { Logo } from '../components/Logo';
import { ResumeBanner } from '../components/ResumeBanner';
import { RulesModal } from '../components/RulesModal';
import { SoundToggle } from '../components/SoundToggle';
import { useClient } from '../lib/client';
import { play } from '../lib/sound';
import { CreateRoomModal } from './CreateRoomModal';
import { JoinCodeModal } from './JoinCodeModal';
import { NicknameField } from './NicknameField';

const item = {
  hidden: { y: 18, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

export function HomePage() {
  const { nickname, setNickname, goLobby, inviteCode, dismissInvite } = useClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const click = (fn: () => void) => () => {
    play('click');
    fn();
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col items-center justify-center gap-8 px-4 py-10">
      <Logo />
      <ResumeBanner />

      <motion.div
        className="glass w-full p-5 sm:p-6"
        variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.45 } } }}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item}>
          <NicknameField value={nickname} onChange={setNickname} />
        </motion.div>

        <motion.button variants={item} className="btn-primary mt-5 w-full py-3.5 text-lg" onClick={click(goLobby)}>
          🌌 開始遊戲・公開大廳
        </motion.button>
        <motion.div variants={item} className="mt-3 grid grid-cols-2 gap-3">
          <button className="btn-gold" onClick={click(() => setCreateOpen(true))}>
            ✨ 建立房間
          </button>
          <button className="btn-teal" onClick={click(() => setJoinOpen(true))}>
            🔑 加入房間
          </button>
        </motion.div>
        <motion.div variants={item} className="mt-3 grid grid-cols-2 gap-3">
          <button className="btn-ghost" onClick={click(() => setRulesOpen(true))}>
            📖 遊戲規則
          </button>
          <SoundToggle withLabel />
        </motion.div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="max-w-sm text-center text-xs leading-relaxed text-white/45"
      >
        免註冊・2～6 人即時對戰・手機平板電腦皆可遊玩
        <br />
        房間與遊戲進度只存在伺服器記憶體中，伺服器重啟後會清空。
      </motion.p>

      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinCodeModal open={joinOpen} onClose={() => setJoinOpen(false)} />
      <JoinCodeModal open={!!inviteCode} onClose={dismissInvite} presetCode={inviteCode} title={`受邀加入房間 ${inviteCode ?? ''}`} />
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}

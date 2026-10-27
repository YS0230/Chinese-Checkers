import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Starfield } from './components/Starfield';
import { Toaster } from './components/Toaster';
import { useClient } from './lib/client';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
import { LobbyPage } from './pages/LobbyPage';
import { WaitingRoom } from './pages/WaitingRoom';

function Restoring() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 text-white/80" role="status">
      <span className="h-10 w-10 rounded-full border-4 border-white/20 border-t-amber-300 motion-safe:animate-spin" />
      正在回到房間…
    </div>
  );
}

function Screen() {
  const { view, room, game, restoring } = useClient();
  let key: string;
  let content: JSX.Element;
  if (view === 'room' && restoring && !room) {
    key = 'restoring';
    content = <Restoring />;
  } else if (view === 'room' && room) {
    const inGame = !!game && (room.status === 'playing' || room.status === 'finished');
    key = inGame ? `game-${room.code}` : `wait-${room.code}`;
    content = inGame ? <GamePage /> : <WaitingRoom />;
  } else if (view === 'lobby') {
    key = 'lobby';
    content = <LobbyPage />;
  } else {
    key = 'home';
    content = <HomePage />;
  }
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={key}
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1, transitionEnd: { transform: 'none' } }}
        exit={{ opacity: 0, scale: 1.015 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell relative">
        <Starfield />
        <Screen />
        <Toaster />
      </div>
    </MotionConfig>
  );
}

/**
 * 程式化音效（Web Audio 合成，不需要任何音效檔）。
 * - 使用者互動前不會建立 AudioContext、不會播放
 * - 瀏覽器不支援或發生錯誤時靜默略過
 */
import { storage } from './storage';

type SoundName = 'click' | 'select' | 'move' | 'hop' | 'land' | 'turn' | 'win' | 'lose' | 'join' | 'leave' | 'error';

let ctx: AudioContext | null = null;
let unlocked = false;
let enabled = storage.get('sound', true);
const listeners = new Set<(on: boolean) => void>();

function audio(): AudioContext | null {
  if (!unlocked) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** 在第一次使用者互動時解鎖音效 */
export function installAudioUnlock(): void {
  if (typeof window === 'undefined') return;
  const unlock = () => {
    unlocked = true;
    audio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

function tone(
  ac: AudioContext,
  freq: number,
  start: number,
  duration: number,
  { type = 'sine', gain = 0.18, slideTo }: { type?: OscillatorType; gain?: number; slideTo?: number } = {},
): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function play(name: SoundName, variant = 0): void {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  try {
    const t = ac.currentTime;
    switch (name) {
      case 'click':
        tone(ac, 660, t, 0.07, { type: 'triangle', gain: 0.08 });
        break;
      case 'select':
        tone(ac, 520, t, 0.09, { type: 'triangle', gain: 0.12, slideTo: 880 });
        break;
      case 'move':
        tone(ac, 300, t, 0.12, { type: 'sine', gain: 0.2, slideTo: 180 });
        break;
      case 'hop':
        tone(ac, 440 * Math.pow(1.12, variant), t, 0.14, { type: 'sine', gain: 0.16, slideTo: 760 * Math.pow(1.12, variant) });
        break;
      case 'land':
        tone(ac, 220, t, 0.1, { type: 'triangle', gain: 0.18, slideTo: 140 });
        break;
      case 'turn':
        tone(ac, 784, t, 0.18, { gain: 0.12 });
        tone(ac, 1175, t + 0.1, 0.25, { gain: 0.1 });
        break;
      case 'join':
        tone(ac, 523, t, 0.12, { gain: 0.1 });
        tone(ac, 784, t + 0.08, 0.16, { gain: 0.1 });
        break;
      case 'leave':
        tone(ac, 523, t, 0.12, { gain: 0.1 });
        tone(ac, 392, t + 0.08, 0.18, { gain: 0.1 });
        break;
      case 'win':
        [523, 659, 784, 1047, 1319].forEach((f, i) => tone(ac, f, t + i * 0.11, 0.4, { type: 'triangle', gain: 0.14 }));
        tone(ac, 2093, t + 0.6, 0.8, { gain: 0.05 });
        break;
      case 'lose':
        [392, 349, 311].forEach((f, i) => tone(ac, f, t + i * 0.16, 0.35, { type: 'triangle', gain: 0.1 }));
        break;
      case 'error':
        tone(ac, 160, t, 0.18, { type: 'square', gain: 0.05 });
        break;
    }
  } catch {
    // 音效失敗不影響遊戲
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  storage.set('sound', on);
  listeners.forEach((l) => l(on));
}

export function onSoundChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

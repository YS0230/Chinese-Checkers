import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
  hue: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
  alpha: number;
}
interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const HUES = [45, 190, 280, 320, 170];

function glowSprite(): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** 星空背景：閃爍星星、漂浮光粒、偶爾的流星；尊重 prefers-reduced-motion */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas?.getContext('2d') ?? null;
    } catch {
      ctx = null;
    }
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const sprite = glowSprite();
    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    let particles: Particle[] = [];
    let meteor: Meteor | null = null;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(280, Math.round((w * h) / 4500));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.6,
        hue: HUES[Math.floor(Math.random() * HUES.length)]!,
      }));
      const pc = Math.min(40, Math.round((w * h) / 40000));
      particles = Array.from({ length: pc }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 6,
        vy: -(Math.random() * 8 + 3),
        r: Math.random() * 10 + 4,
        hue: HUES[Math.floor(Math.random() * HUES.length)]!,
        alpha: Math.random() * 0.25 + 0.08,
      }));
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      ctx!.clearRect(0, 0, w, h);

      for (const s of stars) {
        const a = reduce ? 0.7 : 0.35 + 0.65 * Math.abs(Math.sin(s.phase + t * s.speed * 0.6));
        ctx!.fillStyle = `hsla(${s.hue}, 90%, 88%, ${a})`;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fill();
        if (s.r > 1.25 && sprite) {
          ctx!.globalAlpha = a * 0.5;
          ctx!.drawImage(sprite, s.x - 6, s.y - 6, 12, 12);
          ctx!.globalAlpha = 1;
        }
      }

      if (sprite) {
        ctx!.globalCompositeOperation = 'lighter';
        for (const p of particles) {
          if (!reduce) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.y < -20) {
              p.y = h + 20;
              p.x = Math.random() * w;
            }
            if (p.x < -20) p.x = w + 20;
            if (p.x > w + 20) p.x = -20;
          }
          ctx!.globalAlpha = p.alpha * (0.7 + 0.3 * Math.sin(t + p.r));
          ctx!.filter = 'none';
          ctx!.drawImage(sprite, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        }
        ctx!.globalAlpha = 1;
        ctx!.globalCompositeOperation = 'source-over';
      }

      if (!reduce) {
        if (!meteor && Math.random() < dt * 0.08) {
          meteor = { x: Math.random() * w * 0.8 + w * 0.2, y: Math.random() * h * 0.3, vx: -520, vy: 260, life: 1 };
        }
        if (meteor) {
          meteor.x += meteor.vx * dt;
          meteor.y += meteor.vy * dt;
          meteor.life -= dt * 0.9;
          const grad = ctx!.createLinearGradient(meteor.x, meteor.y, meteor.x - meteor.vx * 0.25, meteor.y - meteor.vy * 0.25);
          grad.addColorStop(0, `rgba(255,255,255,${Math.max(0, meteor.life)})`);
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx!.strokeStyle = grad;
          ctx!.lineWidth = 1.6;
          ctx!.beginPath();
          ctx!.moveTo(meteor.x, meteor.y);
          ctx!.lineTo(meteor.x - meteor.vx * 0.25, meteor.y - meteor.vy * 0.25);
          ctx!.stroke();
          if (meteor.life <= 0) meteor = null;
        }
      }
    };

    const loop = (now: number) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    resize();
    if (reduce) {
      draw(performance.now());
    } else {
      raf = requestAnimationFrame(loop);
    }

    const onResize = () => {
      resize();
      if (reduce) draw(performance.now());
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-fuchsia-600/25 blur-[110px] motion-safe:animate-float" />
      <div className="absolute -right-32 top-1/4 h-[460px] w-[460px] rounded-full bg-cyan-400/15 blur-[110px] motion-safe:animate-float [animation-delay:-2s]" />
      <div className="absolute bottom-[-180px] left-1/3 h-[520px] w-[620px] rounded-full bg-indigo-600/25 blur-[120px]" />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

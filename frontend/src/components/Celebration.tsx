import { useEffect, useRef } from 'react';

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  hue: number;
  star: boolean;
  rot: number;
  vr: number;
}

function drawStar(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}

/** 勝利慶祝：星光粒子爆發 + 彩帶，約 4 秒後停止；減少動態時不播放 */
export function Celebration({ hues }: { hues: number[] }) {
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
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = (canvas.width = Math.round(window.innerWidth * dpr));
    const h = (canvas.height = Math.round(window.innerHeight * dpr));
    const sparks: Spark[] = [];
    const palette = hues.length ? hues : [45, 280, 190];

    const burst = (cx: number, cy: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (Math.random() * 7 + 3) * dpr;
        sparks.push({
          x: cx,
          y: cy,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 2 * dpr,
          life: 1,
          size: (Math.random() * 5 + 2.5) * dpr,
          hue: palette[i % palette.length]!,
          star: Math.random() < 0.55,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.3,
        });
      }
    };

    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      if (frame === 1) burst(w / 2, h * 0.42, 140);
      if (frame === 25) burst(w * 0.22, h * 0.3, 80);
      if (frame === 45) burst(w * 0.78, h * 0.32, 80);
      if (frame === 80) burst(w / 2, h * 0.25, 100);
      ctx!.clearRect(0, 0, w, h);
      ctx!.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]!;
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.12 * dpr;
        s.vx *= 0.985;
        s.rot += s.vr;
        s.life -= 0.009;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx!.save();
        ctx!.translate(s.x, s.y);
        ctx!.rotate(s.rot);
        ctx!.globalAlpha = Math.min(1, s.life * 1.4);
        ctx!.fillStyle = `hsl(${s.hue}, 95%, ${s.star ? 75 : 62}%)`;
        if (s.star) drawStar(ctx!, s.size);
        else ctx!.fillRect(-s.size / 2, -s.size / 4, s.size, s.size / 2);
        ctx!.restore();
      }
      ctx!.globalAlpha = 1;
      if (frame < 360 || sparks.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hues]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[45] h-full w-full" />;
}

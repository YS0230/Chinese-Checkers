/**
 * 六角星形棋盤（SVG）。
 * - 依玩家座位旋轉，讓自己的起點永遠在畫面下方
 * - 棋子沿伺服器回傳的路徑做平滑位移 / 跳躍 / 落地動畫
 * - 透明命中圈提供足夠大的觸控範圍；不依賴 hover
 */
import { animate, motion, useMotionValue, useReducedMotion, type AnimationPlaybackControls } from 'framer-motion';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CELLS, NEIGHBORS, PLAYER_COLORS, ZONE_CELLS, type GameView } from '@starry/shared';
import { cellPoints, rotationForZone, starTriangles, toPath, VIEWBOX, zoneTriangle, type Point, SPACING } from '../lib/geometry';
import { play } from '../lib/sound';

const PIECE_R = 12;
const HOLE_R = 8;

export interface BoardProps {
  game: GameView;
  mySeat: number | null;
  selected: number | null;
  targets: Map<number, number[]>;
  /** 正在預覽路徑的落點 */
  preview: number | null;
  interactive: boolean;
  zoom: number;
  onCellClick: (cell: number) => void;
  onCellHover?: (cell: number | null) => void;
}

export function Board({ game, mySeat, selected, targets, preview, interactive, zoom, onCellClick, onCellHover }: BoardProps) {
  const reduced = useReducedMotion() ?? false;
  const { state } = game;
  const myZone = mySeat !== null ? (state.seats[mySeat]?.zone ?? null) : null;
  const rotation = rotationForZone(myZone);
  const points = useMemo(() => cellPoints(rotation), [rotation]);
  const triangles = useMemo(() => starTriangles(rotation, 26), [rotation]);
  const lines = useMemo(() => {
    const segs: Array<[Point, Point]> = [];
    for (const c of CELLS) {
      for (const n of NEIGHBORS[c.id]!) if (n > c.id) segs.push([points[c.id]!, points[n]!]);
    }
    return segs;
  }, [points]);

  // 角落區域：屬於哪個座位（起點）、我的目標區
  const zoneColor = useMemo(() => {
    const map = new Map<number, number>();
    state.seats.forEach((s, seat) => map.set(s.zone, game.seats[seat]?.colorIndex ?? seat));
    return map;
  }, [state.seats, game.seats]);
  const myGoal = mySeat !== null ? (state.seats[mySeat]?.goalZone ?? null) : null;
  const myColor = mySeat !== null ? PLAYER_COLORS[game.seats[mySeat]?.colorIndex ?? 0]! : PLAYER_COLORS[0]!;

  const lastMove = game.lastMove;
  const moveKey = lastMove ? `${state.turnNumber}:${lastMove.pieceId}:${lastMove.path.join('-')}` : null;
  const previewPath = preview !== null ? targets.get(preview) : undefined;

  // ---------- 尺寸與縮放 ----------
  const scrollRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(320);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const s = Math.floor(Math.min(el.clientWidth, el.clientHeight));
      if (s > 0) setSide(s);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [zoom]);

  const pieceOrder = useMemo(() => {
    const list = [...state.pieces];
    const top = selected !== null ? state.occupancy[selected] : -1;
    const moving = lastMove?.pieceId ?? -1;
    return list.sort((a, b) => rank(a.id) - rank(b.id));
    function rank(id: number) {
      return id === top ? 2 : id === moving ? 1 : 0;
    }
  }, [state.pieces, state.occupancy, selected, lastMove]);

  const onKey = (e: KeyboardEvent, cell: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCellClick(cell);
    }
  };

  return (
    <div
      ref={scrollRef}
      className={`board-scroll relative h-full w-full ${zoom > 1 ? 'zoomed overflow-auto' : 'overflow-hidden'}`}
      data-testid="board"
    >
      <div className="flex min-h-full min-w-full items-center justify-center" style={{ width: side * zoom, height: side * zoom }}>
        <svg
          viewBox={VIEWBOX}
          width={side * zoom}
          height={side * zoom}
          className="block select-none"
          role="group"
          aria-label="中國跳棋棋盤"
        >
          <defs>
            <linearGradient id="board-fill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2a1f6e" />
              <stop offset="50%" stopColor="#171246" />
              <stop offset="100%" stopColor="#0f2a4a" />
            </linearGradient>
            <linearGradient id="board-stroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="40%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#5eead4" />
            </linearGradient>
            <radialGradient id="board-sheen" cx="50%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="hole" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#05041a" />
              <stop offset="70%" stopColor="#120d3a" />
              <stop offset="100%" stopColor="#3b2f8a" />
            </radialGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {PLAYER_COLORS.map((c, i) => (
              <radialGradient key={i} id={`piece-${i}`} cx="35%" cy="30%" r="75%">
                <stop offset="0%" stopColor={c.light} />
                <stop offset="45%" stopColor={c.base} />
                <stop offset="100%" stopColor={c.dark} />
              </radialGradient>
            ))}
          </defs>

          {/* 星形底座 */}
          <g>
            {triangles.map((t, i) => (
              <path key={`glow${i}`} d={toPath(t)} fill="none" stroke="url(#board-stroke)" strokeWidth="6" opacity="0.5" filter="url(#glow)" strokeLinejoin="round" />
            ))}
            {triangles.map((t, i) => (
              <path key={`fill${i}`} d={toPath(t)} fill="url(#board-fill)" strokeLinejoin="round" />
            ))}
            {triangles.map((t, i) => (
              <path key={`sheen${i}`} d={toPath(t)} fill="url(#board-sheen)" />
            ))}
            {triangles.map((t, i) => (
              <path key={`stroke${i}`} d={toPath(t)} fill="none" stroke="url(#board-stroke)" strokeWidth="2" strokeLinejoin="round" opacity="0.9" />
            ))}
          </g>

          {/* 角落區域著色 */}
          {Array.from({ length: 6 }, (_, zone) => {
            const tri = toPath(zoneTriangle(zone, rotation, 16));
            const colorIndex = zoneColor.get(zone);
            const color = colorIndex !== undefined ? PLAYER_COLORS[colorIndex]!.base : '#94a3b8';
            return (
              <g key={zone}>
                <path d={tri} fill={color} opacity={colorIndex !== undefined ? 0.16 : 0.05} strokeLinejoin="round" />
                {zone === myGoal && (
                  <path
                    d={tri}
                    fill="none"
                    stroke={myColor.light}
                    strokeWidth="2.5"
                    strokeDasharray="6 6"
                    strokeLinejoin="round"
                    className="goal-breathe"
                  />
                )}
              </g>
            );
          })}

          {/* 格線 */}
          <g stroke="rgba(255,255,255,0.09)" strokeWidth="1.2">
            {lines.map(([a, b], i) => (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            ))}
          </g>

          {/* 棋位 */}
          <g>
            {points.map((p, id) => (
              <circle key={id} cx={p.x} cy={p.y} r={HOLE_R} fill="url(#hole)" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
            ))}
          </g>
          {myGoal !== null && (
            <g>
              {ZONE_CELLS[myGoal]!.map((id) => (
                <circle key={id} cx={points[id]!.x} cy={points[id]!.y} r={3} fill={myColor.light} opacity="0.35" />
              ))}
            </g>
          )}

          {/* 上一步軌跡 */}
          {lastMove && (
            <g key={moveKey} opacity="0.65" pointerEvents="none">
              <polyline
                points={lastMove.path.map((c) => `${points[c]!.x},${points[c]!.y}`).join(' ')}
                fill="none"
                stroke={PLAYER_COLORS[game.seats[lastMove.seat]?.colorIndex ?? 0]!.light}
                strokeWidth="2.5"
                strokeDasharray="4 5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={points[lastMove.from]!.x}
                cy={points[lastMove.from]!.y}
                r={HOLE_R + 2}
                fill="none"
                stroke={PLAYER_COLORS[game.seats[lastMove.seat]?.colorIndex ?? 0]!.light}
                strokeWidth="1.5"
                strokeDasharray="2 3"
              />
            </g>
          )}

          {/* 預覽路徑 */}
          {previewPath && (
            <g pointerEvents="none">
              <polyline
                points={previewPath.map((c) => `${points[c]!.x},${points[c]!.y}`).join(' ')}
                fill="none"
                stroke={myColor.light}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.9"
                filter="url(#glow)"
              />
              {previewPath.slice(1, -1).map((c) => (
                <circle key={c} cx={points[c]!.x} cy={points[c]!.y} r="4" fill={myColor.light} />
              ))}
            </g>
          )}

          {/* 合法落點 */}
          <g pointerEvents="none">
            {[...targets.keys()].map((cell) => {
              const p = points[cell]!;
              return (
                <g key={cell} data-target={cell}>
                  <circle cx={p.x} cy={p.y} r={HOLE_R + 2} fill="none" stroke={myColor.light} strokeWidth="2.5" className="target-pulse" />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={cell === preview ? 7 : 5}
                    fill={myColor.base}
                    stroke={myColor.light}
                    strokeWidth="1.5"
                    opacity="0.95"
                  />
                </g>
              );
            })}
          </g>

          {/* 棋子 */}
          <g pointerEvents="none">
            {pieceOrder.map((piece) => {
              const seatInfo = game.seats[piece.seat];
              const isMoving = lastMove?.pieceId === piece.id;
              return (
                <PieceView
                  key={piece.id}
                  colorIndex={seatInfo?.colorIndex ?? piece.seat}
                  point={points[piece.cell]!}
                  route={isMoving ? lastMove!.path.map((c) => points[c]!) : null}
                  routeKey={isMoving ? moveKey : null}
                  jump={isMoving ? lastMove!.jump : false}
                  selected={piece.cell === selected}
                  dim={state.seats[piece.seat]?.active === false}
                  reduced={reduced}
                />
              );
            })}
          </g>

          {/* 觸控命中層（最上層、透明） */}
          <g>
            {points.map((p, cell) => {
              const pid = state.occupancy[cell]!;
              const own = pid >= 0 && state.pieces[pid]!.seat === mySeat;
              const isTarget = targets.has(cell);
              const actionable = own || isTarget;
              return (
                <circle
                  key={cell}
                  cx={p.x}
                  cy={p.y}
                  r={SPACING / 2}
                  fill="transparent"
                  data-cell={cell}
                  data-own={own || undefined}
                  role={actionable ? 'button' : undefined}
                  tabIndex={actionable ? 0 : undefined}
                  aria-label={isTarget ? `移動到棋位 ${cell}` : own ? `選擇棋子（棋位 ${cell}）` : undefined}
                  style={{ cursor: actionable && (interactive || own) ? 'pointer' : 'default', outline: 'none' }}
                  onClick={() => onCellClick(cell)}
                  onKeyDown={(e) => onKey(e, cell)}
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse' && isTarget) onCellHover?.(cell);
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === 'mouse' && isTarget) onCellHover?.(null);
                  }}
                />
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

interface PieceViewProps {
  colorIndex: number;
  point: Point;
  route: Point[] | null;
  routeKey: string | null;
  jump: boolean;
  selected: boolean;
  dim: boolean;
  reduced: boolean;
}

const PieceView = memo(
  function PieceView({ colorIndex, point, route, routeKey, jump, selected, dim, reduced }: PieceViewProps) {
    const x = useMotionValue(point.x);
    const y = useMotionValue(point.y);
    const hop = useMotionValue(1);
    const lift = useMotionValue(0);
    const lastKey = useRef(routeKey);
    const controls = useRef<AnimationPlaybackControls[]>([]);
    const timers = useRef<number[]>([]);
    const routeRef = useRef(route);
    routeRef.current = route;

    useEffect(() => {
      controls.current.forEach((c) => c.stop());
      timers.current.forEach((t) => window.clearTimeout(t));
      controls.current = [];
      timers.current = [];

      const isNewRoute = routeKey !== null && routeKey !== lastKey.current;
      lastKey.current = routeKey;
      const r = routeRef.current;

      if (!isNewRoute || !r || r.length < 2) {
        if (reduced) {
          x.set(point.x);
          y.set(point.y);
        } else {
          controls.current.push(animate(x, point.x, { duration: 0.35, ease: 'easeInOut' }));
          controls.current.push(animate(y, point.y, { duration: 0.35, ease: 'easeInOut' }));
        }
        return;
      }

      const segs = r.length - 1;
      if (reduced) {
        x.set(point.x);
        y.set(point.y);
        play(jump ? 'land' : 'move');
        return;
      }
      const segDur = jump ? 0.32 : 0.26;
      const duration = segs * segDur;
      const times = r.map((_, i) => i / segs);
      controls.current.push(animate(x, r.map((p) => p.x), { duration, times, ease: 'easeInOut' }));
      controls.current.push(animate(y, r.map((p) => p.y), { duration, times, ease: 'easeInOut' }));
      const hopFrames: number[] = [1];
      const liftFrames: number[] = [0];
      const hopTimes: number[] = [0];
      for (let i = 0; i < segs; i++) {
        hopFrames.push(jump ? 1.22 : 1.08, 1);
        liftFrames.push(jump ? -12 : -4, 0);
        hopTimes.push((i + 0.5) / segs, (i + 1) / segs);
      }
      controls.current.push(animate(hop, hopFrames, { duration, times: hopTimes, ease: 'easeInOut' }));
      controls.current.push(animate(lift, liftFrames, { duration, times: hopTimes, ease: 'easeInOut' }));
      if (jump) {
        for (let i = 0; i < segs; i++) {
          timers.current.push(window.setTimeout(() => play('hop', i), i * segDur * 1000));
        }
        timers.current.push(window.setTimeout(() => play('land'), duration * 1000 - 40));
      } else {
        play('move');
      }
    }, [point.x, point.y, routeKey, jump, reduced, x, y, hop, lift]);

    useEffect(
      () => () => {
        controls.current.forEach((c) => c.stop());
        timers.current.forEach((t) => window.clearTimeout(t));
      },
      [],
    );

    return (
      <motion.g style={{ x, y }} opacity={dim ? 0.45 : 1}>
        <ellipse cx="1.5" cy="6" rx={PIECE_R * 0.9} ry={PIECE_R * 0.38} fill="#000" opacity="0.45" />
        <motion.g
          initial={false}
          animate={{ scale: selected ? 1.2 : 1, y: selected ? -4 : 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 18 }}
        >
          <motion.g style={{ scale: hop, y: lift }}>
            {selected && (
              <>
                <circle r={PIECE_R + 7} fill={PLAYER_COLORS[colorIndex]?.base} opacity="0.35" filter="url(#glow)" />
                <circle
                  r={PIECE_R + 5}
                  fill="none"
                  stroke="#fff"
                  strokeWidth="1.6"
                  strokeDasharray="5 4"
                  className="select-ring"
                />
              </>
            )}
            <circle r={PIECE_R} fill={`url(#piece-${colorIndex})`} />
            <circle r={PIECE_R} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
            <circle r={PIECE_R - 1.5} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1.5" transform="translate(0.8 1)" />
            <ellipse cx="-4" cy="-5" rx="5" ry="3" fill="#fff" opacity="0.78" transform="rotate(-25 -4 -5)" />
            <circle cx="4.5" cy="5" r="1.8" fill="#fff" opacity="0.3" />
          </motion.g>
        </motion.g>
      </motion.g>
    );
  },
  (a, b) =>
    a.point.x === b.point.x &&
    a.point.y === b.point.y &&
    a.routeKey === b.routeKey &&
    a.selected === b.selected &&
    a.dim === b.dim &&
    a.colorIndex === b.colorIndex &&
    a.reduced === b.reduced,
);

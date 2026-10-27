import { BOARD_BOUNDS, CELLS } from '@starry/shared';

/** 相鄰棋位距離（SVG 單位） */
export const SPACING = 30;
export const PAD = 30;

const half = Math.max(
  Math.abs(BOARD_BOUNDS.minX),
  Math.abs(BOARD_BOUNDS.maxX),
  Math.abs(BOARD_BOUNDS.minY),
  Math.abs(BOARD_BOUNDS.maxY),
);
/** 旋轉 60° 倍數後星形仍對稱，因此使用固定的正方形視窗 */
export const VIEW_HALF = half * SPACING + PAD;
export const VIEWBOX = `${-VIEW_HALF} ${-VIEW_HALF} ${VIEW_HALF * 2} ${VIEW_HALF * 2}`;

export interface Point {
  x: number;
  y: number;
}

/** 將角落 zone 轉到畫面下方所需的旋轉角度（度） */
export function rotationForZone(zone: number | null): number {
  if (zone === null || zone < 0) return 0;
  return (3 - zone) * 60;
}

export function rotatePoint(x: number, y: number, deg: number): Point {
  if (deg === 0) return { x, y };
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

export function cellPoints(deg: number): Point[] {
  return CELLS.map((cell) => rotatePoint(cell.x * SPACING, cell.y * SPACING, deg));
}

/** 星形外框（兩個大三角形） */
export function starTriangles(deg: number, pad: number): Point[][] {
  const tri = (pts: Array<[number, number]>) =>
    pts.map(([q, r]) => {
      const x = (q + r / 2) * SPACING;
      const y = ((r * Math.sqrt(3)) / 2) * SPACING;
      const len = Math.hypot(x, y);
      const k = (len + pad) / len;
      return rotatePoint(x * k, y * k, deg);
    });
  return [
    tri([[8, -4], [-4, 8], [-4, -4]]),
    tri([[-8, 4], [4, -8], [4, 4]]),
  ];
}

/** 角落三角形（用於區域著色） */
export function zoneTriangle(zone: number, deg: number, pad: number): Point[] {
  // 以該區 10 個棋位計算：三個頂點 = 離重心最遠的三個棋位，再向外擴張
  const cells = CELLS.filter((c) => c.zone === zone);
  const pts = cells.map((c) => ({ x: c.x * SPACING, y: c.y * SPACING }));
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  // 三個頂點 = 離重心最遠的三點
  const far = [...pts].sort((a, b) => Math.hypot(b.x - cx, b.y - cy) - Math.hypot(a.x - cx, a.y - cy)).slice(0, 3);
  return far.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy);
    const k = (len + pad) / len;
    return rotatePoint(cx + dx * k, cy + dy * k, deg);
  });
}

export function toPath(points: Point[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';
}

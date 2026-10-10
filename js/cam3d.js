/* 打擊動畫的攝影機：一台針孔攝影機，從「捕手後方」平順地拉遠、升高，變成「球場俯視」。
 * 座標：x 往一壘為正、y 離本壘越遠越大、z 向上，單位呎。畫面座標：x ∈ [-1,1]，y 往下，高度 = 2 / 寬高比。 */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, k) => a + (b - a) * k;
const ease = (u) => u * u * (3 - 2 * u);

export const DCAM = 6, EYE = 3, PLATE_Y = 17 / 12;
export const DP = DCAM + PLATE_Y;
const D0 = 7.4, D1 = 8000; // 起點離目標 7.4 呎（捕手視角），終點拉到很遠、近似正交的俯視
const ALPHA1 = Math.PI / 4; // 終點的俯角 45°，配合 2D 球場畫面的「往上偏移」畫法

// 起點的畫面寬度（呎，在本壘板前緣處）與垂直偏移
export const pitchView = (a) => { const hv = Math.max(9.9, 7.4 / a), wv = hv * a; return { wv, hv, shift: (1.7 * 2) / wv }; };

// end：2D 球場畫面的視野 { cx, cy, wv }（cx、cy 是畫面中心對應的地面位置，wv 是畫面寬度的呎數）
export function camAt(m, a, end) {
  const pv = pitchView(a);
  const k = ease(clamp(m, 0, 1));
  const F0 = (2 * DP) / pv.wv, F1 = (2 * D1) / end.wv;
  const d = Math.exp(mix(Math.log(D0), Math.log(D1), k));
  const F = Math.exp(mix(Math.log(F0), Math.log(F1), k));
  const al = ALPHA1 * Math.sqrt(k); // 先快速俯下來，鏡頭看向本壘（升降機的感覺），而不是貼著投手丘飛過去
  const kt = k * k; // 目標點晚一點才移向球場中央，前半段一直盯著本壘附近
  const T = [mix(0, end.cx, kt), mix(-DCAM + D0, end.cy, kt), mix(EYE, 0, k)];
  const f = [0, Math.cos(al), -Math.sin(al)], up = [0, Math.sin(al), Math.cos(al)];
  return { P: [T[0], T[1] - d * f[1], T[2] - d * f[2]], f, up, F, v: mix(1, Math.SQRT2, k), shift: pv.shift * (1 - k), k };
}

const EPS = 0.3;
const view = (c, p) => { const r = [p[0] - c.P[0], p[1] - c.P[1], p[2] - c.P[2]]; return [r[0], r[1] * c.up[1] + r[2] * c.up[2], r[1] * c.f[1] + r[2] * c.f[2]]; };
const toScreen = (c, q) => ({ x: (c.F * q[0]) / q[2], y: (-c.F * q[1] * c.v) / q[2] - c.shift, d: q[2] });
export function project(c, p) { const q = view(c, p); return q[2] > EPS ? toScreen(c, q) : null; }

// 多邊形／折線對近平面裁切（Sutherland–Hodgman），回傳畫面座標點陣列
export function projectPoly(c, pts, closed = true) {
  const q = pts.map((p) => view(c, p)), out = [];
  const n = q.length, last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = q[i], b = q[(i + 1) % n], ina = a[2] > EPS, inb = b[2] > EPS;
    if (ina) out.push(a);
    if (ina !== inb) { const s = (EPS - a[2]) / (b[2] - a[2]); out.push([mix(a[0], b[0], s), mix(a[1], b[1], s), EPS]); }
  }
  if (!closed && q.length && q[q.length - 1][2] > EPS) out.push(q[q.length - 1]);
  return out.map((p) => toScreen(c, p));
}

// 球場地面（z = 0）的形狀，顏色與 2D 球場畫面一致。y 一律 ≥ -4（鏡頭在本壘板後 6 呎）
const arc = (a, ctrl, b, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const u = i / n; return [(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * ctrl[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * ctrl[1] + u * u * b[1]]; });
const circle = (cx, cy, r, n = 40) => Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return [cx + Math.cos(t) * r, Math.max(-4, cy + Math.sin(t) * r)]; });
const WALL = [...arc([-233, 233], [-205, 405], [0, 410]), ...arc([0, 410], [205, 405], [233, 233]).slice(1)];
const sq = (cx, cy, h) => [[cx, cy - h], [cx + h, cy], [cx, cy + h], [cx - h, cy]];
export const GROUND = [
  { poly: [[-4000, -4], [4000, -4], [4000, 6000], [-4000, 6000]], fill: '#2f6d3f' },
  { poly: [[-4000, 233], ...WALL, [4000, 233], [4000, 6000], [-4000, 6000]], fill: '#1b2f44' },
  { poly: [[0, -4], [-233, 233], ...WALL.slice(1, -1), [233, 233]], fill: '#3f8a50' },
  { poly: circle(0, 60.5, 95), fill: '#b98b5e' },
  { poly: [[0, 17], [-49, 63.6], [0, 112], [49, 63.6]], fill: '#3f8a50' },
  { poly: circle(0, 0, 14), fill: '#b98b5e' },
  { poly: circle(0, 60.5, 9), fill: '#a47649' },
  { line: WALL, stroke: '#f2c94c', sw: 3 },
  { line: [[0, 0], [-290, 290]], stroke: '#fff', sw: 1.2 }, { line: [[0, 0], [290, 290]], stroke: '#fff', sw: 1.2 },
  { poly: [[0, 0], [63.6, 63.6], [0, 127.3], [-63.6, 63.6]], stroke: '#fff', sw: 1, op: 0.7 },
  { poly: [[-5.8, -3], [-1.8, -3], [-1.8, 3], [-5.8, 3]], stroke: '#fff', sw: 1 }, { poly: [[1.8, -3], [5.8, -3], [5.8, 3], [1.8, 3]], stroke: '#fff', sw: 1 },
  { poly: [[-0.708, PLATE_Y], [0.708, PLATE_Y], [0.708, 0.7], [0, 0], [-0.708, 0.7]], fill: '#f6f3ec' },
  { poly: sq(63.6, 63.6, 2.3), fill: '#fff' }, { poly: sq(0, 127.3, 2.3), fill: '#fff' }, { poly: sq(-63.6, 63.6, 2.3), fill: '#fff' },
].map((g) => ({ ...g, pts: (g.poly || g.line).map(([x, y]) => [x, y, 0]), closed: !!g.poly }));

/* 打席動畫：用 Statcast 的真實球路與擊球資料，重現「投手投球 → 打者擊球 → 跑者推進」
 * 上半是純計算（pitchPath / hitPlan / runnerMoves / buildScript / frameAt，可以在 node 測試），
 * 下半是畫面（openAnim）。畫面是球場俯視圖，球的高度用「往畫面上方偏移＋地面影子」表現。 */
import { esc } from './util.js';
import { evZh } from './dict.js';
import { S } from './state.js';
import { PITCH_ZH, pitchCls } from './pitches.js';
import { pitchGroup } from './pitchmap.js';

const PLATE_Y = 17 / 12; // 本壘板前緣（呎）
const MOUND_Y = 60.5;
const G_FT = 32.2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (u) => u * u * (3 - 2 * u);

export const BASE_XY = { H: [0, 0], '1B': [63.6, 63.6], '2B': [0, 127.3], '3B': [-63.6, 63.6] };
const ORDER = ['H', '1B', '2B', '3B', 'H'];

// 解 y(t) = target，取最靠近 t=0 的根
function solveT(c, target) {
  const a = 0.5 * c.aY, b = c.vY0, k = c.y0 - target;
  if (Math.abs(a) < 1e-9) return b ? -k / b : null;
  const disc = b * b - 4 * a * k;
  if (disc < 0) return null;
  const s = Math.sqrt(disc), r = [(-b + s) / (2 * a), (-b - s) / (2 * a)];
  return Math.abs(r[0]) < Math.abs(r[1]) ? r[0] : r[1];
}

// 一球的真實軌跡：從出手點到本壘板前緣，N 個取樣點（x 左右、y 離本壘距離、z 高度，單位呎）
export function pitchPath(pd, N = 30) {
  const c = pd && pd.coordinates;
  if (!c || c.vY0 == null || c.aY == null || c.y0 == null) return null;
  const T = solveT(c, PLATE_Y);
  const ts = solveT(c, MOUND_Y - (pd.extension || 6));
  if (!(T > 0.2 && T < 1.2)) return null;
  const t0 = ts != null && ts < 0 && ts > -0.4 ? ts : 0;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((T - t0) * i) / N;
    pts.push({ x: c.x0 + c.vX0 * t + 0.5 * c.aX * t * t, y: c.y0 + c.vY0 * t + 0.5 * c.aY * t * t, z: c.z0 + c.vZ0 * t + 0.5 * c.aZ * t * t });
  }
  return { pts, dur: T - t0 };
}

// 擊球：落點（呎，本壘為原點）、飛行時間、高度；沒有落點座標就回傳 null
export function hitPlan(h) {
  const c = h && h.coordinates;
  if (!c || c.coordX == null || c.coordY == null) return null;
  const x = (c.coordX - 125.42) * 2.5, y = (198.27 - c.coordY) * 2.5;
  const D = Math.hypot(x, y) || 1;
  const ang = h.launchAngle, v = h.launchSpeed || 80;
  const ground = /ground|bunt/.test(h.trajectory || '') || (ang != null && ang <= 8);
  if (ground) return { kind: 'ground', x, y, D, dur: clamp(D / (v * 1.467 * 0.62), 0.45, 3), apex: 0, v };
  const a = ang == null ? 25 : ang;
  const vz = v * 1.467 * Math.sin((a * Math.PI) / 180);
  const apex = clamp(a > 40 ? (vz * vz) / (2 * G_FT) * 0.75 : (D * Math.tan((a * Math.PI) / 180)) / 4, 6, 140);
  return { kind: 'air', x, y, D, dur: clamp(2 * Math.sqrt((2 * apex) / G_FT), 0.9, 5.5), apex, v };
}
export function hitPos(hp, u) {
  u = clamp(u, 0, 1);
  if (hp.kind === 'air') return { x: hp.x * u, y: hp.y * u, z: 3 * (1 - u) + 4 * hp.apex * u * (1 - u) };
  const ue = 1 - Math.pow(1 - u, 1.7);
  const hops = clamp(Math.round(hp.D / 45), 2, 6), h0 = Math.min(3, 0.9 + hp.v / 60);
  return { x: hp.x * ue, y: hp.y * ue, z: 0.3 + Math.abs(Math.sin(Math.PI * u * hops)) * h0 * Math.pow(1 - u, 1.5) };
}

// 這個打席裡有哪些跑者要移動：路徑是經過的壘包，out 表示跑到那裡被刺殺
export function runnerMoves(play) {
  const out = [];
  for (const r of (play && play.runners) || []) {
    const m = r.movement || {};
    const id = (r.details && r.details.runner && r.details.runner.id) || null;
    const s0 = m.start || m.originBase || null;
    const s = s0 ? ORDER.indexOf(s0) : 0;
    let e;
    if (m.isOut) e = m.outBase ? (m.outBase === 'Home' ? 4 : ORDER.indexOf(m.outBase)) : -1;
    else e = m.end ? (m.end === 'score' ? 4 : ORDER.indexOf(m.end)) : -1;
    if (s < 0 || e <= s) continue;
    out.push({ id, path: ORDER.slice(s, e + 1), out: !!m.isOut, batter: !s0 });
  }
  return out;
}
const runnerPos = (path, u) => {
  const n = path.length - 1;
  const f = clamp(u, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
  const a = BASE_XY[path[i]], b = BASE_XY[path[i + 1]];
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k };
};

// 捕手後方視角的透視：鏡頭在本壘板後方 DCAM 呎、眼高 EYE 呎；單位 = 本壘板前緣處的 1 呎
export const DCAM = 6, EYE = 3;
export const DP = DCAM + PLATE_Y;
export const persp = (x, y, z) => { const s = DP / (y + DCAM); return { x: x * s, y: -(z - EYE) * s, s }; };

// 全壘打牆離本壘的距離（依方向，左右外野線約 330 呎、中外野約 410 呎，與畫面上的牆一致）
export const wallR = (x, y) => { const th = Math.abs((Math.atan2(x, y) * 180) / Math.PI); return 410 - 81 * Math.pow(Math.min(th, 45) / 45, 2); };

const hitCam = (hp) => {
  const top = Math.max(150, hp.y + hp.apex + 70);
  return { cx: hp.x * 0.35, y0: -60, y1: top, minW: Math.max(280, 2 * (Math.abs(hp.x) + 60)) };
};
const lerpCam = (a, b, k) => ({ cx: a.cx + (b.cx - a.cx) * k, y0: a.y0 + (b.y0 - a.y0) * k, y1: a.y1 + (b.y1 - a.y1) * k, minW: a.minW + (b.minW - a.minW) * k });

const callZh = (e) => {
  const c = ((e.details && e.details.call && e.details.call.description) || (e.details && e.details.description) || '');
  if (/swinging|foul tip/i.test(c) && !/foul$/i.test(c.trim())) return { zh: '揮空', en: 'Swinging strike', swing: true };
  if (/called strike/i.test(c)) return { zh: '好球', en: 'Called strike' };
  if (/hit by pitch/i.test(c)) return { zh: '觸身球', en: 'Hit by pitch' };
  const k = pitchCls(e);
  return { ...{ b: { zh: '壞球', en: 'Ball' }, s: { zh: '好球', en: 'Strike' }, f: { zh: '界外', en: 'Foul', swing: true }, x: { zh: '擊出', en: 'In play', swing: true } }[k] };
};

// 把一個打席排成時間表（秒）。回傳的東西只有資料，frameAt 依時間算出每一格的畫面狀態
export function buildScript(play) {
  const evs = ((play && play.playEvents) || []).filter((e) => e && e.isPitch);
  const segs = [], caps = [], zone = [];
  let t = 0.5, hitStart = null, hitDur = 0, hrCross = null, zTop = null, zBot = null;
  const isHR = !!(play && play.result && play.result.event === 'Home Run');
  evs.forEach((e, i) => {
    const pp = pitchPath(e.pitchData);
    const dp = pp ? clamp(pp.dur * 3.3, 1.1, 2.1) : 0.9;
    const last = i === evs.length - 1;
    const prevCount = i ? evs[i - 1].count : { balls: 0, strikes: 0 };
    const pc = pitchCls(e), pd = e.pitchData || {};
    if (zTop == null && pd.strikeZoneTop) { zTop = pd.strikeZoneTop; zBot = pd.strikeZoneBottom; }
    const call = callZh(e);
    const cap = { t0: t, t1: t + dp, n: i + 1, code: (e.details && e.details.type && e.details.type.code) || '', name: (e.details && e.details.type && e.details.type.description) || '', speed: pd.startSpeed, call, swing: !!call.swing, cls: pc, count: e.count, prevCount };
    caps.push(cap);
    segs.push({ kind: 'pitch', t0: t, t1: t + dp, pp, cls: pc, code: cap.code });
    const co = pd.coordinates;
    if (co && co.pX != null && co.pZ != null) zone.push({ t: t + dp, x: co.pX, z: co.pZ, cls: pc, code: cap.code });
    t += dp;
    const hp = hitPlan(e.hitData);
    if (hp) {
      t += 0.35; // 打擊瞬間停一下，讓人看到球在好球帶的位置
      const hr = last && isHR;
      const seg = { kind: 'hit', t0: t, t1: t + hp.dur, hp, foul: pc === 'f', hr, cam0: hitCam(hp), cam1: hitCam(hp), ct0: t, ct1: t + 1, until: last ? Infinity : t + hp.dur + 0.5 };
      if (hr) { // 全壘打：球飛出牆外時鏡頭追著球走，並在過牆瞬間放煙火
        seg.cam1 = { cx: hp.x, y0: Math.max(-60, hp.y - 170), y1: hp.y + 170, minW: 320 };
        seg.ct0 = t + hp.dur * 0.15; seg.ct1 = t + hp.dur * 0.8;
        hrCross = t + hp.dur * clamp(wallR(hp.x, hp.y) / hp.D, 0.2, 1);
        seg.cross = { t: hrCross, x: hp.x * clamp(wallR(hp.x, hp.y) / hp.D, 0.2, 1), y: hp.y * clamp(wallR(hp.x, hp.y) / hp.D, 0.2, 1) };
      }
      segs.push(seg);
      if (last) { hitStart = t; hitDur = hp.dur; }
      t += hp.dur + 0.5;
      if (!last) t += 0.8;
    } else t += 0.7;
  });
  const lastEv = evs[evs.length - 1];
  const moves = lastEv && !/foul/i.test(callZh(lastEv).en) ? runnerMoves(play) : [];
  const rt0 = hitStart != null ? hitStart + 0.15 : t;
  const runners = moves.map((m) => ({ ...m, t0: rt0, dur: Math.max(1.1, (m.path.length - 1) * 0.65) }));
  const rEnd = runners.reduce((mx, r) => Math.max(mx, r.t0 + r.dur), 0);
  const contactEnd = hitStart != null ? hitStart + hitDur : t;
  const bannerT = hrCross != null ? hrCross : hitStart != null ? Math.max(contactEnd - 0.2, rt0 + 0.6) : t;
  const total = Math.max(t, rEnd, bannerT) + 1.8;
  return { segs, caps, zone, runners, bannerT, total, hr: isHR && hrCross != null, zTop: zTop || 3.4, zBot: zBot || 1.6 };
}

// 在時間 t 的畫面狀態；scene 是 'pitch'（捕手後方視角）或 'field'（球場俯視）
export function frameAt(sc, t) {
  let hs = null;
  for (const s of sc.segs) if (s.kind === 'hit' && t >= s.t0 && t <= s.until) hs = s;
  const scene = hs ? 'field' : 'pitch';
  const cam = hs ? lerpCam(hs.cam0, hs.cam1, ease(clamp((t - hs.ct0) / (hs.ct1 - hs.ct0), 0, 1))) : null;
  let ball = null, trail = null, trailCls = '';
  for (let i = 0; i < sc.segs.length; i++) {
    const s = sc.segs[i];
    if (t < s.t0) break;
    const u = clamp((t - s.t0) / (s.t1 - s.t0), 0, 1);
    if (s.kind === 'pitch' && s.pp) {
      const pts = s.pp.pts, f = u * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(f));
      const a = pts[k], b = pts[k + 1], w = f - k;
      const next = sc.segs[i + 1];
      const stillHere = t < s.t1 || (!(next && next.kind === 'hit') && t < s.t1 + 0.55);
      if (stillHere || (next && next.kind === 'hit' && t < next.t0)) { ball = { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, z: a.z + (b.z - a.z) * w }; trail = pts.slice(0, k + 1).concat([ball]); trailCls = s.code; }
    } else if (s.kind === 'hit') {
      const n = 24, list = [];
      for (let j = 0; j <= Math.round(u * n); j++) list.push(hitPos(s.hp, j / n));
      ball = hitPos(s.hp, u); trail = list.concat([ball]); trailCls = s.hr ? 'hr' : s.foul ? 'foul' : 'hit';
    }
  }
  let cap = null;
  for (const c of sc.caps) if (t >= c.t0) cap = { ...c, done: t >= c.t1 };
  const zone = sc.zone.filter((z) => t >= z.t);
  const lastZ = zone[zone.length - 1];
  const impact = lastZ && t - lastZ.t < 0.9 ? { x: lastZ.x, z: lastZ.z, cls: lastZ.cls, k: (t - lastZ.t) / 0.9 } : null;
  const swing = cap && cap.swing ? clamp((t - (cap.t1 - 0.2)) / 0.3, 0, 1) : 0;
  const runners = sc.runners.filter((r) => t >= r.t0).map((r) => {
    const u = (t - r.t0) / r.dur;
    return { ...runnerPos(r.path, u), batter: r.batter, gone: r.out && u >= 1 };
  });
  const cr = hs && hs.cross;
  const fx = cr && t >= cr.t && t - cr.t < 1.5 ? { x: cr.x, y: cr.y, k: (t - cr.t) / 1.5 } : null;
  return { scene, cam, ball, trail, trailCls, cap, zone, impact, swing, runners, fx, banner: t >= sc.bannerT, hr: sc.hr };
}

/* ───────── 畫面 ───────── */
const ZH = () => S.lang !== 'en';
const L = (zh, en) => (ZH() ? zh : en);

const FIELDERS = [[-72, 80], [72, 80], [-30, 137], [30, 137], [-150, 250], [0, 290], [150, 250], [0, MOUND_Y], [0, -7]];
const fieldSVG = () => `<g transform="scale(1,-1)">
  <rect x="-900" y="-500" width="1800" height="1500" fill="#2f6d3f"/>
  <path d="M-900 233 L-233 233 Q-205 405 0 410 Q205 405 233 233 L900 233 L900 1000 L-900 1000 Z" fill="#1b2f44"/>
  <path d="M0 0 L-233 233 Q-205 405 0 410 Q205 405 233 233 Z" fill="#3f8a50"/>
  <path d="M-233 233 Q-205 405 0 410 Q205 405 233 233" fill="none" stroke="#f2c94c" stroke-width="3" vector-effect="non-scaling-stroke"/>
  <path d="M0 0 L-290 290 M0 0 L290 290" stroke="#fff" stroke-width="1.2" vector-effect="non-scaling-stroke" opacity=".85"/>
  <circle cx="0" cy="${MOUND_Y}" r="95" fill="#b98b5e"/>
  <polygon points="0,17 -49,63.6 0,112 49,63.6" fill="#3f8a50"/>
  <circle cx="0" cy="0" r="14" fill="#b98b5e"/>
  <path d="M0 0 L63.6 63.6 L0 127.3 L-63.6 63.6 Z" fill="none" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".7"/>
  <circle cx="0" cy="${MOUND_Y}" r="9" fill="#a47649"/>
  <rect x="-5.8" y="-3" width="4" height="6" fill="none" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke"/><rect x="1.8" y="-3" width="4" height="6" fill="none" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke"/>
  <path d="M-1.4 0 L1.4 0 L1.4 -1.4 L0 -2.8 L-1.4 -1.4 Z" fill="#fff"/>
  ${['1B', '2B', '3B'].map((b) => `<rect x="${BASE_XY[b][0] - 1.6}" y="${BASE_XY[b][1] - 1.6}" width="3.2" height="3.2" fill="#fff" transform="rotate(45 ${BASE_XY[b][0]} ${BASE_XY[b][1]})"/>`).join('')}
</g>`;

// 捕手後方視角的靜態場景（座標單位：本壘板前緣處的 1 呎）
const f2 = (n) => n.toFixed(3);
const pt = (x, y, z) => { const p = persp(x, y, z); return `${f2(p.x)},${f2(p.y)}`; };
function pitchSceneSVG(rightie, top, bot) {
  const g = (x, y) => pt(x, y, 0);
  const dir = rightie ? 1 : -1;
  const s = DP / (0.7 + DCAM);
  // 打者身體（腳下 z=0），站在靠 3B／1B 側的打擊區
  const px = (x) => f2((dir * -2.1 + x) * s), pz = (z) => f2(-(z - EYE) * s);
  const hx = dir * -2.1 + dir * 0.55, hz = 4.5; // 雙手握棒的位置
  const sp = DP / (58 + DCAM), mp = DP / (MOUND_Y + DCAM);
  return `<defs><linearGradient id="anSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1624"/><stop offset="1" stop-color="#27415c"/></linearGradient></defs>
  <rect x="-40" y="-40" width="80" height="40" fill="url(#anSky)"/>
  <rect x="-40" y="0" width="80" height="40" fill="#2f6d3f"/>
  <polygon points="${g(-16, -3)} ${g(16, -3)} ${g(9, 62)} ${g(-9, 62)}" fill="#b98b5e"/>
  <ellipse cx="0" cy="${f2(-(0.8 - EYE) * mp)}" rx="${f2(9 * mp)}" ry="${f2(1.4 * mp)}" fill="#a47649"/>
  <g fill="#1c3a66" stroke="#fff" stroke-width=".012"><circle cx="0" cy="${f2(-(5.9 - EYE) * sp)}" r="${f2(0.4 * sp)}"/><rect x="${f2(-0.7 * sp)}" y="${f2(-(5.4 - EYE) * sp)}" width="${f2(1.4 * sp)}" height="${f2(2.8 * sp)}" rx="${f2(0.3 * sp)}"/><rect x="${f2(-0.6 * sp)}" y="${f2(-(2.7 - EYE) * sp)}" width="${f2(1.2 * sp)}" height="${f2(1.9 * sp)}"/></g>
  <polygon points="${pt(-0.708, 0, 0)} ${pt(0.708, 0, 0)} ${pt(0.708, 0.7, 0)} ${pt(0, 1.417, 0)} ${pt(-0.708, 0.7, 0)}" fill="#fff" opacity=".9"/>
  <rect id="pvZb" x="-0.708" y="${f2(-(top - EYE))}" width="1.416" height="${f2(top - bot)}" fill="rgba(255,255,255,.07)" stroke="#fff" stroke-width="2.2" vector-effect="non-scaling-stroke"/>
  <g stroke="rgba(255,255,255,.35)" stroke-width="1" vector-effect="non-scaling-stroke">${[1, 2].map((i) => `<line x1="${f2(-0.708 + (1.416 * i) / 3)}" x2="${f2(-0.708 + (1.416 * i) / 3)}" y1="${f2(-(top - EYE))}" y2="${f2(-(bot - EYE))}" vector-effect="non-scaling-stroke"/><line y1="${f2(-(top - EYE) + ((top - bot) * i) / 3)}" y2="${f2(-(top - EYE) + ((top - bot) * i) / 3)}" x1="-0.708" x2="0.708" vector-effect="non-scaling-stroke"/>`).join('')}</g>
  <g id="pvDots"></g>
  <g fill="#10202f" stroke="#5d7a99" stroke-width=".03">
    <rect x="${px(-0.55)}" y="${pz(3.0)}" width="${f2(0.5 * s)}" height="${f2(3.0 * s)}"/><rect x="${px(0.05)}" y="${pz(3.0)}" width="${f2(0.5 * s)}" height="${f2(3.0 * s)}"/>
    <rect x="${px(-0.7)}" y="${pz(5.2)}" width="${f2(1.4 * s)}" height="${f2(2.3 * s)}" rx="${f2(0.3 * s)}"/><circle cx="${px(0)}" cy="${pz(5.8)}" r="${f2(0.42 * s)}"/></g>
  <g id="pvBat"><line x1="${f2(hx * s)}" y1="${pz(hz)}" x2="${f2((hx - dir * 0.35) * s)}" y2="${pz(hz + 2.4)}" stroke="#d9b27c" stroke-width=".11" stroke-linecap="round"/></g>
  <g id="pvRing"></g><polyline id="pvTr" fill="none" vector-effect="non-scaling-stroke"/>
  <circle id="pvBall" class="an-bc" r=".1"/>`;
}

export function openAnim(play, gd) {
  if (!play || document.getElementById('an')) return null;
  const sc = buildScript(play);
  if (!sc.segs.length) return null;
  const m = play.matchup || {}, bat = (m.batter && m.batter.fullName) || '', pit = (m.pitcher && m.pitcher.fullName) || '';
  const R = play.result || {};
  const rightie = !(m.batSide && m.batSide.code === 'L');
  const el = document.createElement('div');
  el.id = 'an'; el.className = 'an'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="an-h"><div class="an-who"><b>${esc(bat)}</b><span>vs ${esc(pit)}</span></div><button class="an-x" aria-label="${L('關閉', 'Close')}">✕</button></div>
    <div class="an-st"><svg id="anPv" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${pitchSceneSVG(rightie, sc.zTop, sc.zBot)}</svg>
      <svg id="anSvg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${fieldSVG()}
      <g id="anFd">${FIELDERS.map(([x, y]) => `<circle class="an-fd" cx="${x}" cy="${-y}" r="3"/>`).join('')}</g>
      <circle id="anBt" class="an-bt" cx="${rightie ? -4.2 : 4.2}" cy="0" r="3"/>
      <polyline id="anTr" class="an-tr" fill="none" vector-effect="non-scaling-stroke"/>
      <g id="anFx"></g><g id="anRn"></g>
      <g id="anBall"><ellipse id="anSh" class="an-sh"/><circle id="anBc" class="an-bc"/></g></svg>
      <div class="an-cap"><div class="an-cl"></div><div class="an-ct"></div></div>
      <div class="an-bn" hidden><b></b><small></small></div></div>
    <div class="an-bar"><button class="an-re">↻ ${L('重播', 'Replay')}</button><button class="an-sp" aria-pressed="false">${L('慢動作', 'Slow')} 1×</button></div>`;
  document.body.appendChild(el);
  const $e = (s) => el.querySelector(s);
  const svg = $e('#anSvg'), pv = $e('#anPv'), st = $e('.an-st');
  const dir = rightie ? 1 : -1;
  const hands = (() => { const s = DP / (0.7 + DCAM); return { x: (dir * -2.1 + dir * 0.55) * s, y: -(4.5 - EYE) * s }; })();
  const opener = document.activeElement;
  let t = 0, speed = 1, raf = 0, last = 0, rm = 0;

  const hd = (play.playEvents || []).filter((e) => e && e.hitData).pop();
  const h = hd && hd.hitData;
  const bits = [];
  if (h && h.launchSpeed) bits.push(`${L('初速', 'EV')} ${h.launchSpeed} mph`);
  if (h && h.launchAngle != null) bits.push(`${L('仰角', 'LA')} ${h.launchAngle}°`);
  if (h && h.totalDistance) bits.push(`${h.totalDistance} ft`);
  if (R.rbi) bits.push(L(`${R.rbi} 分打點`, `${R.rbi} RBI`));
  $e('.an-bn b').textContent = sc.hr ? L('全壘打！', 'HOME RUN!') : (ZH() ? evZh(R.event) : R.event) || '';
  $e('.an-bn small').textContent = bits.join(' · ');
  $e('.an-bn').classList.toggle('hr', !!sc.hr);

  const applyPitch = (f) => {
    const a = st.clientWidth / Math.max(1, st.clientHeight);
    const hv = Math.max(9.9, 7.4 / a), wv = hv * a;
    pv.setAttribute('viewBox', `${f2(-wv / 2)} ${f2(1.7 - hv / 2)} ${f2(wv)} ${f2(hv)}`);
    const upx = Math.max(1, st.clientWidth) / wv; // 1 單位 = 幾 px
    const dots = f.zone.map((z, i) => `<circle class="pm-${pitchGroup(z.code)}" cx="${f2(z.x)}" cy="${f2(-(z.z - EYE))}" r="${i === f.zone.length - 1 ? 0.17 : 0.13}" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke" fill-opacity="${i === f.zone.length - 1 ? 1 : 0.7}"/>`).join('');
    $e('#pvDots').innerHTML = dots;
    $e('#pvRing').innerHTML = f.impact ? `<circle class="pv-ring ${f.impact.cls}" cx="${f2(f.impact.x)}" cy="${f2(-(f.impact.z - EYE))}" r="${f2(0.2 + 0.45 * f.impact.k)}" opacity="${f2(1 - f.impact.k)}" fill="none" stroke-width="3" vector-effect="non-scaling-stroke"/>` : '';
    const ball = $e('#pvBall'), tr = $e('#pvTr');
    if (f.ball && f.scene === 'pitch') {
      const p = persp(f.ball.x, f.ball.y, f.ball.z);
      ball.style.display = '';
      ball.setAttribute('cx', f2(p.x)); ball.setAttribute('cy', f2(p.y)); ball.setAttribute('r', f2(Math.max(0.19 * p.s, 2.4 / upx)));
      tr.setAttribute('points', f.trail.map((q) => pt(q.x, q.y, q.z)).join(' '));
      tr.setAttribute('class', 'an-tr pm-s-' + pitchGroup(f.trailCls));
    } else { ball.style.display = 'none'; tr.setAttribute('points', ''); }
    $e('#pvBat').setAttribute('transform', `rotate(${f2(dir * 102 * ease(f.swing))} ${f2(hands.x)} ${f2(hands.y)})`);
  };
  const applyField = (f) => {
    const a = st.clientWidth / Math.max(1, st.clientHeight);
    const cam = f.cam || { cx: 0, y0: -60, y1: 200, minW: 280 };
    const hv = cam.y1 - cam.y0, wv = Math.max(hv * a, cam.minW), hh = wv / a;
    const cy = cam.y0 + hh / 2; // 下緣固定，視窗比需要的高時多出來的留在上方
    svg.setAttribute('viewBox', `${(cam.cx - wv / 2).toFixed(2)} ${(-cy - hh / 2).toFixed(2)} ${wv.toFixed(2)} ${hh.toFixed(2)}`);
    const k = wv / Math.max(1, st.clientWidth); // 1 px 對應幾呎
    el.querySelectorAll('.an-fd').forEach((c) => c.setAttribute('r', (4 * k).toFixed(2)));
    $e('#anBt').setAttribute('r', (6 * k).toFixed(2));
    const P = (p) => `${p.x.toFixed(2)},${(-p.y - p.z).toFixed(2)}`;
    const ball = $e('#anBall');
    if (f.ball && f.scene === 'field') {
      ball.style.display = '';
      const bc = $e('#anBc'), sh = $e('#anSh');
      bc.setAttribute('cx', f.ball.x.toFixed(2)); bc.setAttribute('cy', (-f.ball.y - f.ball.z).toFixed(2)); bc.setAttribute('r', (5 * k).toFixed(2));
      sh.setAttribute('cx', f.ball.x.toFixed(2)); sh.setAttribute('cy', (-f.ball.y).toFixed(2)); sh.setAttribute('rx', (4 * k).toFixed(2)); sh.setAttribute('ry', (2 * k).toFixed(2));
    } else ball.style.display = 'none';
    const tr = $e('#anTr');
    tr.setAttribute('points', f.trail && f.scene === 'field' ? f.trail.map(P).join(' ') : '');
    tr.setAttribute('class', 'an-tr pm-s-' + (f.trailCls === 'hit' || f.trailCls === 'foul' || f.trailCls === 'hr' ? f.trailCls : pitchGroup(f.trailCls)));
    $e('#anRn').innerHTML = f.runners.filter((r) => !r.gone).map((r) => `<circle class="an-rn${r.batter ? ' b' : ''}" cx="${r.x.toFixed(1)}" cy="${(-r.y).toFixed(1)}" r="${(5.5 * k).toFixed(2)}"/>`).join('');
    // 全壘打過牆瞬間：往四周擴散的火花（角度固定，不用亂數，重播時一樣）
    $e('#anFx').innerHTML = f.fx ? Array.from({ length: 16 }, (_, i) => {
      const ang = (i / 16) * Math.PI * 2, d = (20 + 55 * f.fx.k) * (i % 2 ? 1 : 0.65);
      return `<circle cx="${(f.fx.x + Math.cos(ang) * d).toFixed(1)}" cy="${(-f.fx.y - Math.sin(ang) * d).toFixed(1)}" r="${(3.2 * k * (1 - f.fx.k * 0.6)).toFixed(2)}" fill="${i % 3 ? '#f2c94c' : '#fff'}" opacity="${(1 - f.fx.k).toFixed(2)}"/>`;
    }).join('') : '';
  };
  const apply = (f) => {
    pv.style.opacity = f.scene === 'pitch' ? 1 : 0; svg.style.opacity = f.scene === 'field' ? 1 : 0;
    applyPitch(f); applyField(f);
    const c = f.cap;
    if (c) {
      const nm = ZH() ? PITCH_ZH[c.code] || c.name : c.name;
      $e('.an-cl').textContent = `${L('第', 'Pitch ')}${c.n}${L(' 球', '')}　${nm}${c.speed ? '　' + Math.round(c.speed * 10) / 10 + ' mph' : ''}`;
      const cnt = c.done ? c.count : c.prevCount;
      $e('.an-ct').innerHTML = `${c.done && c.call ? `<em class="${c.cls}">${esc(L(c.call.zh, c.call.en))}</em>` : '<em class="w">&nbsp;</em>'}<span>${cnt ? cnt.balls + '-' + cnt.strikes : ''}</span>`;
    }
    $e('.an-bn').hidden = !f.banner;
  };
  const frame = (now) => {
    if (!last) last = now;
    t = Math.min(sc.total, t + ((now - last) / 1000) * speed); last = now;
    apply(frameAt(sc, t));
    raf = t < sc.total ? requestAnimationFrame(frame) : 0;
  };
  const start = () => { cancelAnimationFrame(raf); t = 0; last = 0; raf = requestAnimationFrame(frame); };
  const close = () => {
    cancelAnimationFrame(raf); cancelAnimationFrame(rm);
    document.removeEventListener('keydown', onKey);
    el.remove();
    if (opener && opener.focus) try { opener.focus(); } catch (_) {}
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('.an-x')) close();
    else if (e.target.closest('.an-re')) start();
    else if (e.target.closest('.an-sp')) {
      speed = speed === 1 ? 0.4 : 1;
      const b = e.target.closest('.an-sp'); b.textContent = `${L('慢動作', 'Slow')} ${speed === 1 ? '1×' : '0.4×'}`; b.setAttribute('aria-pressed', String(speed !== 1));
    }
  });
  $e('.an-x').focus();
  rm = requestAnimationFrame(() => { apply(frameAt(sc, 0)); start(); });
  // 給測試用：跳到指定時間並畫出那一格
  el._ctl = { sc, seek: (s) => { cancelAnimationFrame(raf); raf = 0; t = s; apply(frameAt(sc, s)); }, total: sc.total };
  return el._ctl;
}

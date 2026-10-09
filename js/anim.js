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

const PITCH_CAM = { cx: 0, y0: -24, y1: 68, minW: 30 };
const hitCam = (hp) => {
  const top = Math.max(150, hp.y + hp.apex + 70);
  return { cx: hp.x * 0.35, y0: -60, y1: top, minW: Math.max(280, 2 * (Math.abs(hp.x) + 60)) };
};
const lerpCam = (a, b, k) => ({ cx: a.cx + (b.cx - a.cx) * k, y0: a.y0 + (b.y0 - a.y0) * k, y1: a.y1 + (b.y1 - a.y1) * k, minW: a.minW + (b.minW - a.minW) * k });

const callZh = (e) => {
  const c = ((e.details && e.details.call && e.details.call.description) || (e.details && e.details.description) || '');
  if (/swinging|foul tip/i.test(c) && !/foul$/i.test(c.trim())) return { zh: '揮空', en: 'Swinging strike' };
  if (/called strike/i.test(c)) return { zh: '好球', en: 'Called strike' };
  if (/hit by pitch/i.test(c)) return { zh: '觸身球', en: 'Hit by pitch' };
  const k = pitchCls(e);
  return { b: { zh: '壞球', en: 'Ball' }, s: { zh: '好球', en: 'Strike' }, f: { zh: '界外', en: 'Foul' }, x: { zh: '擊出', en: 'In play' } }[k];
};

// 把一個打席排成時間表（秒）。回傳的東西只有資料，frameAt 依時間算出每一格的畫面狀態
export function buildScript(play) {
  const evs = ((play && play.playEvents) || []).filter((e) => e && e.isPitch);
  const segs = [], cams = [], caps = [], zone = [];
  let t = 0.5, cam = PITCH_CAM, hitStart = null, hitDur = 0;
  evs.forEach((e, i) => {
    const pp = pitchPath(e.pitchData);
    const dp = pp ? clamp(pp.dur * 3.3, 1.1, 2.1) : 0.9;
    const last = i === evs.length - 1;
    const prevCount = i ? evs[i - 1].count : { balls: 0, strikes: 0 };
    const pc = pitchCls(e), pd = e.pitchData || {};
    const cap = { t0: t, t1: t + dp, n: i + 1, code: (e.details && e.details.type && e.details.type.code) || '', name: (e.details && e.details.type && e.details.type.description) || '', speed: pd.startSpeed, call: callZh(e), cls: pc, count: e.count, prevCount };
    caps.push(cap);
    segs.push({ kind: 'pitch', t0: t, t1: t + dp, pp, cls: pc, code: cap.code });
    const co = pd.coordinates;
    if (co && co.pX != null && co.pZ != null) zone.push({ t: t + dp, x: co.pX, z: co.pZ, cls: pc, code: cap.code, top: pd.strikeZoneTop, bot: pd.strikeZoneBottom });
    t += dp;
    const hp = hitPlan(e.hitData);
    if (hp) {
      cams.push({ t0: t, t1: t + 0.7, from: cam, to: hitCam(hp) }); cam = hitCam(hp);
      t += 0.35;
      segs.push({ kind: 'hit', t0: t, t1: t + hp.dur, hp, foul: pc === 'f' });
      if (last) { hitStart = t; hitDur = hp.dur; }
      t += hp.dur + 0.5;
      if (!last) { cams.push({ t0: t, t1: t + 0.7, from: cam, to: PITCH_CAM }); cam = PITCH_CAM; t += 0.8; }
    } else t += 0.7;
  });
  const lastEv = evs[evs.length - 1];
  const moves = lastEv && !/foul/i.test(callZh(lastEv).en) ? runnerMoves(play) : [];
  const rt0 = hitStart != null ? hitStart + 0.15 : t;
  const runners = moves.map((m) => ({ ...m, t0: rt0, dur: Math.max(1.1, (m.path.length - 1) * 0.65) }));
  const rEnd = runners.reduce((mx, r) => Math.max(mx, r.t0 + r.dur), 0);
  const contactEnd = hitStart != null ? hitStart + hitDur : t;
  const bannerT = hitStart != null ? Math.max(contactEnd - 0.2, rt0 + 0.6) : t;
  const total = Math.max(t, rEnd, bannerT) + 1.8;
  return { segs, cams, caps, zone, runners, bannerT, total, cam0: PITCH_CAM };
}

// 在時間 t 的畫面狀態
export function frameAt(sc, t) {
  let cam = sc.cam0;
  for (const c of sc.cams) { if (t >= c.t0) cam = lerpCam(c.from, c.to, ease(clamp((t - c.t0) / (c.t1 - c.t0), 0, 1))); }
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
      ball = hitPos(s.hp, u); trail = list.concat([ball]); trailCls = s.foul ? 'foul' : 'hit';
    }
  }
  let cap = null;
  for (const c of sc.caps) if (t >= c.t0) cap = { ...c, done: t >= c.t1 };
  const zone = sc.zone.filter((z) => t >= z.t);
  const runners = sc.runners.filter((r) => t >= r.t0).map((r) => {
    const u = (t - r.t0) / r.dur;
    return { ...runnerPos(r.path, u), batter: r.batter, gone: r.out && u >= 1 };
  });
  return { cam, ball, trail, trailCls, cap, zone, runners, banner: t >= sc.bannerT };
}

/* ───────── 畫面 ───────── */
const ZH = () => S.lang !== 'en';
const L = (zh, en) => (ZH() ? zh : en);

const FIELDERS = [[-72, 80], [72, 80], [-30, 137], [30, 137], [-150, 250], [0, 290], [150, 250], [0, MOUND_Y], [0, -7]];
const fieldSVG = () => `<g transform="scale(1,-1)">
  <rect x="-900" y="-500" width="1800" height="1500" fill="#2f6d3f"/>
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

const zoneSVG = () => '<svg viewBox="0 0 120 150" class="an-zs" aria-hidden="true"><rect width="120" height="150" rx="8" class="zbg"/><rect id="anZb" class="zbox" x="42" y="30" width="36" height="60"/><g id="anZd"></g></svg>';

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
    <div class="an-st"><svg id="anSvg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${fieldSVG()}
      <g id="anFd">${FIELDERS.map(([x, y]) => `<circle class="an-fd" cx="${x}" cy="${-y}" r="3"/>`).join('')}</g>
      <circle id="anBt" class="an-bt" cx="${rightie ? -4.2 : 4.2}" cy="2.5" r="3"/>
      <polyline id="anTr" class="an-tr" fill="none" vector-effect="non-scaling-stroke"/>
      <g id="anRn"></g>
      <g id="anBall"><ellipse id="anSh" class="an-sh"/><circle id="anBc" class="an-bc"/></g></svg>
      <div class="an-zone">${zoneSVG()}</div>
      <div class="an-cap"><div class="an-cl"></div><div class="an-ct"></div></div>
      <div class="an-bn" hidden><b></b><small></small></div></div>
    <div class="an-bar"><button class="an-re">↻ ${L('重播', 'Replay')}</button><button class="an-sp" aria-pressed="false">${L('慢動作', 'Slow')} 1×</button></div>`;
  document.body.appendChild(el);
  const $e = (s) => el.querySelector(s);
  const svg = $e('#anSvg'), st = $e('.an-st');
  const opener = document.activeElement;
  let t = 0, speed = 1, raf = 0, last = 0, rm = 0;

  const bannerHTML = () => {
    const ev = ZH() ? evZh(R.event) : R.event;
    const hd = (play.playEvents || []).filter((e) => e && e.hitData).pop();
    const h = hd && hd.hitData;
    const bits = [];
    if (h && h.launchSpeed) bits.push(`${L('初速', 'EV')} ${h.launchSpeed} mph`);
    if (h && h.launchAngle != null) bits.push(`${L('仰角', 'LA')} ${h.launchAngle}°`);
    if (h && h.totalDistance) bits.push(`${h.totalDistance} ft`);
    if (R.rbi) bits.push(L(`${R.rbi} 分打點`, `${R.rbi} RBI`));
    return [ev || '', bits.join(' · ')];
  };
  const [bn1, bn2] = bannerHTML();
  $e('.an-bn b').textContent = bn1; $e('.an-bn small').textContent = bn2;

  const apply = (f) => {
    const a = st.clientWidth / Math.max(1, st.clientHeight);
    const hv = f.cam.y1 - f.cam.y0, wv = Math.max(hv * a, f.cam.minW), hh = wv / a;
    const cy = f.cam.y0 + hh / 2; // 下緣固定，視窗比需要的高時多出來的留在上方
    svg.setAttribute('viewBox', `${(f.cam.cx - wv / 2).toFixed(2)} ${(-cy - hh / 2).toFixed(2)} ${wv.toFixed(2)} ${hh.toFixed(2)}`);
    const k = wv / Math.max(1, st.clientWidth); // 1 px 對應幾呎
    el.querySelectorAll('.an-fd').forEach((c) => c.setAttribute('r', (4 * k).toFixed(2)));
    const bt = $e('#anBt'); bt.setAttribute('r', (6 * k).toFixed(2));
    const P = (p) => `${p.x.toFixed(2)},${(-p.y - p.z).toFixed(2)}`;
    const ball = $e('#anBall');
    if (f.ball) {
      ball.style.display = '';
      const bc = $e('#anBc'), sh = $e('#anSh');
      bc.setAttribute('cx', f.ball.x.toFixed(2)); bc.setAttribute('cy', (-f.ball.y - f.ball.z).toFixed(2)); bc.setAttribute('r', (5 * k).toFixed(2));
      sh.setAttribute('cx', f.ball.x.toFixed(2)); sh.setAttribute('cy', (-f.ball.y).toFixed(2)); sh.setAttribute('rx', (4 * k).toFixed(2)); sh.setAttribute('ry', (2 * k).toFixed(2));
    } else ball.style.display = 'none';
    const tr = $e('#anTr');
    tr.setAttribute('points', f.trail ? f.trail.map(P).join(' ') : '');
    tr.setAttribute('class', 'an-tr pm-s-' + (f.trailCls === 'hit' || f.trailCls === 'foul' ? f.trailCls : pitchGroup(f.trailCls)));
    $e('#anRn').innerHTML = f.runners.filter((r) => !r.gone).map((r) => `<circle class="an-rn${r.batter ? ' b' : ''}" cx="${r.x.toFixed(1)}" cy="${(-r.y).toFixed(1)}" r="${(5.5 * k).toFixed(2)}"/>`).join('');
    // 投手、打者在打擊瞬間之後就不需要了，保留靜態點
    const c = f.cap;
    if (c) {
      const nm = ZH() ? PITCH_ZH[c.code] || c.name : c.name;
      $e('.an-cl').textContent = `${L('第', 'Pitch ')}${c.n}${L(' 球', '')}　${nm}${c.speed ? '　' + Math.round(c.speed * 10) / 10 + ' mph' : ''}`;
      const cnt = c.done ? c.count : c.prevCount;
      $e('.an-ct').innerHTML = `${c.done && c.call ? `<em class="${c.cls}">${esc(L(c.call.zh, c.call.en))}</em>` : '<em class="w">&nbsp;</em>'}<span>${cnt ? cnt.balls + '-' + cnt.strikes : ''}</span>`;
    }
    const zb = $e('#anZb');
    const z0 = f.zone[0], top = (z0 && z0.top) || 3.4, bot = (z0 && z0.bot) || 1.6;
    zb.setAttribute('y', (150 - (top / 5) * 150).toFixed(1)); zb.setAttribute('height', (((top - bot) / 5) * 150).toFixed(1));
    $e('#anZd').innerHTML = f.zone.map((z, i) => `<circle class="pm-${pitchGroup(z.code)}${i === f.zone.length - 1 ? ' cur' : ''}" cx="${(((z.x + 2) / 4) * 120).toFixed(1)}" cy="${(150 - (z.z / 5) * 150).toFixed(1)}" r="${i === f.zone.length - 1 ? 6 : 4.2}"/>`).join('');
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

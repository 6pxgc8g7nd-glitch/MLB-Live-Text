/* 打席動畫的畫面：球場俯視 SVG、捕手視角的 3D 場景（cam3d.js）、雷達面板、控制列。時間表與每一格的狀態來自 anim-script.js。 */
import { esc } from './util.js';
import { evZh } from './dict.js';
import { S } from './state.js';
import { PITCH_ZH } from './pitches.js';
import { pitchGroup } from './pitchmap.js';
import { PLATE_Y, camAt, project, projectPoly, GROUND } from './cam3d.js';
import { BASE_XY, FIELD_POS as POS, MOUND_Y, buildScript, frameAt, batPose, clamp } from './anim-script.js';
/* ───────── 畫面 ───────── */
const ZH = () => S.lang !== 'en';
const L = (zh, en) => (ZH() ? zh : en);

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
export function openAnim(play, gd, allPlays) {
  if (!play || document.getElementById('an')) return null;
  const prevPlay = allPlays && play.about ? [...allPlays].reverse().find((p) => p.about && p.about.atBatIndex === play.about.atBatIndex - 1) : null;
  const sc = buildScript(play, prevPlay);
  if (!sc.segs.length) return null;
  const m = play.matchup || {}, bat = (m.batter && m.batter.fullName) || '', pit = (m.pitcher && m.pitcher.fullName) || '';
  const R = play.result || {};
  const rightie = !(m.batSide && m.batSide.code === 'L');
  const el = document.createElement('div');
  el.id = 'an'; el.className = 'an'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="an-h"><div class="an-who"><b>${esc(bat)}</b><span>vs ${esc(pit)}</span></div><button class="an-x" aria-label="${L('關閉', 'Close')}">✕</button></div>
    <div class="an-st"><svg id="anPv" preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg>
      <svg id="anSvg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${fieldSVG()}
      <g id="anFd">${Object.keys(POS).map((p) => `<circle class="an-fd" data-pos="${p}" cx="${POS[p][0]}" cy="${-POS[p][1]}" r="3"/>`).join('')}</g>
      <circle id="anBt" class="an-bt" cx="${rightie ? -4.2 : 4.2}" cy="0" r="3"/>
      <polyline id="anTr" class="an-tr" fill="none" vector-effect="non-scaling-stroke"/><polyline id="anTr2" class="an-tr2" fill="none" vector-effect="non-scaling-stroke"/>
      <g id="anFx"></g><g id="anRn"></g>
      <g id="anBall"><ellipse id="anSh" class="an-sh"/><circle id="anBc" class="an-bc"/></g></svg>
      <div class="an-hud" hidden></div>
      <div class="an-cap"><div class="an-cl"></div><div class="an-ct"></div></div>
      <div class="an-bn" hidden><b></b><small></small></div></div>
    <div class="an-bar"><div class="an-sc"><input class="an-rg" type="range" min="0" max="1000" step="1" value="0" aria-label="${L('動畫時間軸', 'Timeline')}"><span class="an-tm">0.0 / 0.0</span></div>
      <div class="an-bt2"><button class="an-pv" aria-label="${L('上一球', 'Previous pitch')}">⏮</button><button class="an-pp" aria-label="${L('暫停', 'Pause')}" aria-pressed="false">⏸</button><button class="an-nx" aria-label="${L('下一球', 'Next pitch')}">⏭</button><button class="an-re">↻ ${L('重播', 'Replay')}</button><button class="an-sp" aria-pressed="false">${L('慢動作', 'Slow')} 1×</button></div></div>`;
  document.body.appendChild(el);
  const $e = (s) => el.querySelector(s);
  const svg = $e('#anSvg'), pv = $e('#anPv'), st = $e('.an-st');
  const dir = rightie ? 1 : -1;
  const opener = document.activeElement;
  let t = 0, speed = 1, raf = 0, last = 0, rm = 0;

  const bits = [];
  if (R.rbi) bits.push(L(`${R.rbi} 分打點`, `${R.rbi} RBI`));
  $e('.an-bn b').textContent = sc.hr ? L('全壘打！', 'HOME RUN!') : (ZH() ? evZh(R.event) : R.event) || '';
  $e('.an-bn small').textContent = bits.join(' · ');
  $e('.an-bn').classList.toggle('hr', !!sc.hr);

  // 捕手視角與轉場：同一台針孔攝影機，從本壘後方拉高、拉遠成球場俯視（cam3d.js）。每格重畫整個 3D 場景
  const bs = 1; // 打者的世界座標比例（呎）
  const drawPitch = (f) => {
    const a = st.clientWidth / Math.max(1, st.clientHeight);
    pv.setAttribute('viewBox', `-1 ${f2(-1 / a)} 2 ${f2(2 / a)}`);
    const ec = f.endCam || { cx: 0, y0: -60, y1: 200, minW: 280 };
    const hvE = ec.y1 - ec.y0, wvE = Math.max(hvE * a, ec.minW), hhE = wvE / a;
    const c = camAt(f.m, a, { cx: ec.cx, cy: ec.y0 + hhE / 2, wv: wvE });
    const k = c.k, pxN = 2 / Math.max(1, st.clientWidth); // 1 px 在畫面座標裡有多大
    const P = (q) => `${f2(q.x)},${f2(q.y)}`;
    let out = '';
    for (const g of GROUND) {
      const pts = projectPoly(c, g.pts, g.closed);
      if (pts.length < 2) continue;
      const stroke = g.stroke ? ` stroke="${g.stroke}" stroke-width="${g.sw}" vector-effect="non-scaling-stroke"` : '';
      out += g.closed ? `<polygon points="${pts.map(P).join(' ')}" fill="${g.fill || 'none'}"${stroke}${g.op ? ` opacity="${g.op}"` : ''}/>` : `<polyline points="${pts.map(P).join(' ')}" fill="none"${stroke}/>`;
    }
    const fade = clamp(1 - k * 1.6, 0, 1);
    const dot = (p, rFt, minPx, attrs) => { const s = project(c, p); return s ? `<circle cx="${f2(s.x)}" cy="${f2(s.y)}" r="${f2(Math.max((rFt * c.F) / s.d, minPx * pxN))}" ${attrs}/>` : ''; };
    // 好球帶（在本壘板前緣處）：轉場時淡出
    if (fade > 0) {
      const zy = PLATE_Y, zt = sc.zTop, zb = sc.zBot;
      const corners = [[-0.708, zy, zt], [0.708, zy, zt], [0.708, zy, zb], [-0.708, zy, zb]];
      const zp = projectPoly(c, corners, true);
      if (zp.length > 2) out += `<g opacity="${f2(fade)}"><polygon points="${zp.map(P).join(' ')}" fill="rgba(255,255,255,.07)" stroke="#fff" stroke-width="2.2" vector-effect="non-scaling-stroke"/>`
        + [1, 2].map((i) => { const x = -0.708 + (1.416 * i) / 3, z = zt - ((zt - zb) * i) / 3, A = project(c, [x, zy, zt]), B = project(c, [x, zy, zb]), C = project(c, [-0.708, zy, z]), D = project(c, [0.708, zy, z]); return A && B && C && D ? `<path d="M${P(A)}L${P(B)}M${P(C)}L${P(D)}" stroke="rgba(255,255,255,.35)" stroke-width="1" vector-effect="non-scaling-stroke"/>` : ''; }).join('')
        + f.zone.map((z, i) => dot([z.x, zy, z.z], i === f.zone.length - 1 ? 0.17 : 0.13, 3, `class="pm-${pitchGroup(z.code)}" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke" fill-opacity="${i === f.zone.length - 1 ? 1 : 0.7}"`)).join('')
        + (f.impact ? (() => { const s = project(c, [f.impact.x, zy, f.impact.z]); return s ? `<circle class="pv-ring ${f.impact.cls}" cx="${f2(s.x)}" cy="${f2(s.y)}" r="${f2(((0.2 + 0.45 * f.impact.k) * c.F) / s.d)}" opacity="${f2(1 - f.impact.k)}" fill="none" stroke-width="3" vector-effect="non-scaling-stroke"/>` : ''; })() : '') + '</g>';
    }
    // 野手：近處是站著的人，拉遠後縮成跟 2D 球場一樣的圓點
    const sorted = f.fielders.map((q) => ({ q, s: project(c, [q.x, q.y, 0]) })).filter((o) => o.s).sort((u, v) => v.s.d - u.s.d);
    for (const { q, s } of sorted) {
      const top = project(c, [q.x, q.y, 5.6 * (1 - k) + 0.3]);
      const r = (0.45 * c.F / s.d) * (1 - k) + (q.act ? 5 : 4) * pxN * k;
      if (top && fade > 0.02) out += `<line x1="${f2(s.x)}" y1="${f2(s.y)}" x2="${f2(top.x)}" y2="${f2(top.y)}" stroke="#1c3a66" stroke-width="${f2((1.3 * c.F) / s.d)}" stroke-linecap="round" opacity="${f2(fade)}"/>`;
      out += `<circle cx="${f2((top || s).x)}" cy="${f2((top || s).y)}" r="${f2(r)}" fill="${q.act ? '#f2c94c' : '#1c3a66'}" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    }
    // 打者（轉場早期才看得到）
    if (k < 0.7) {
      const p = batPose(f.bat.load, f.bat.k, f.bat.type, f.bat.z);
      const W = (x, z) => [dir * (x - 2.1) * bs, 0.7, z];
      const ln = (A, B, w, col) => { const a1 = project(c, W(A.x, A.z)), b1 = project(c, W(B.x, B.z)); return a1 && b1 ? `<line x1="${f2(a1.x)}" y1="${f2(a1.y)}" x2="${f2(b1.x)}" y2="${f2(b1.y)}" stroke="${col}" stroke-width="${f2((w * c.F) / a1.d)}" stroke-linecap="round"/>` : ''; };
      const poly = projectPoly(c, [W(p.sh.x - p.ws, 4.95), W(p.sh.x + p.ws, 4.95), W(p.hip.x + p.wh, 3), W(p.hip.x - p.wh, 3)], true);
      const hd = project(c, W(p.head.x, p.head.z));
      out += `<g opacity="${f2(clamp(1 - k / 0.7, 0, 1))}">${ln(p.hip, p.footB, 0.5, '#0b1a28')}${ln(p.hip, p.footF, 0.5, '#0b1a28')}`
        + (poly.length > 2 ? `<polygon points="${poly.map(P).join(' ')}" fill="#10202f" stroke="#5d7a99" stroke-width="1" vector-effect="non-scaling-stroke"/>` : '')
        + `${ln({ x: p.sh.x - p.ws * 0.6, z: 4.8 }, p.hands, 0.28, '#1b3350')}${ln({ x: p.sh.x + p.ws * 0.6, z: 4.8 }, p.hands, 0.28, '#1b3350')}`
        + (hd ? `<circle cx="${f2(hd.x)}" cy="${f2(hd.y)}" r="${f2((0.42 * c.F) / hd.d)}" fill="#10202f" stroke="#5d7a99" stroke-width="1" vector-effect="non-scaling-stroke"/>` : '')
        + `${ln(p.hands, p.tip, 0.11, '#d9b27c')}</g>`;
    }
    // 跑者
    for (const r of f.runners) out += dot([r.x, r.y, 0.8], 1.1, 5.5, `fill="${r.batter ? '#e8863a' : '#f2c94c'}" stroke="#fff" stroke-width="1.2" vector-effect="non-scaling-stroke"`);
    // 球的軌跡與球
    if (f.ball && f.m > -1 && (f.scene === 'pitch')) {
      const tp = projectPoly(c, f.trail.map((q) => [q.x, q.y, q.z]), false);
      if (tp.length > 1) out += `<polyline points="${tp.map(P).join(' ')}" fill="none" class="an-tr pm-s-${f.trailCls === 'hit' || f.trailCls === 'foul' || f.trailCls === 'hr' ? f.trailCls : pitchGroup(f.trailCls)}" vector-effect="non-scaling-stroke"/>`;
      const sh = project(c, [f.ball.x, f.ball.y, 0]);
      if (sh && f.ball.z > 0.6) out += `<ellipse cx="${f2(sh.x)}" cy="${f2(sh.y)}" rx="${f2((0.45 * c.F) / sh.d)}" ry="${f2((0.22 * c.F * c.v) / sh.d * Math.max(0.35, Math.sin(Math.atan2(c.f[2] * -1, c.f[1]))))}" fill="rgba(0,0,0,.35)"/>`;
      out += dot([f.ball.x, f.ball.y, f.ball.z], 0.19, 2.4 + 2.6 * k, 'class="an-bc"');
    }
    pv.innerHTML = out;
  };
  const applyPitch = drawPitch;
  const applyField = (f) => {
    const a = st.clientWidth / Math.max(1, st.clientHeight);
    const cam = f.cam || { cx: 0, y0: -60, y1: 200, minW: 280 };
    const hv = cam.y1 - cam.y0, wv = Math.max(hv * a, cam.minW), hh = wv / a;
    const cy = cam.y0 + hh / 2; // 下緣固定，視窗比需要的高時多出來的留在上方
    svg.setAttribute('viewBox', `${(cam.cx - wv / 2).toFixed(2)} ${(-cy - hh / 2).toFixed(2)} ${wv.toFixed(2)} ${hh.toFixed(2)}`);
    const k = wv / Math.max(1, st.clientWidth); // 1 px 對應幾呎
    f.fielders.forEach((q) => { const c = $e(`.an-fd[data-pos="${q.pos}"]`); c.setAttribute('cx', q.x.toFixed(1)); c.setAttribute('cy', (-q.y).toFixed(1)); c.setAttribute('r', ((q.act ? 5 : 4) * k).toFixed(2)); c.classList.toggle('act', q.act); });
    $e('#anBt').setAttribute('r', (6 * k).toFixed(2)); $e('#anBt').style.display = f.scene === 'field' ? 'none' : '';
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
    $e('#anTr2').setAttribute('points', f.trail2 && f.scene === 'field' ? f.trail2.map(P).join(' ') : '');
    tr.setAttribute('class', 'an-tr pm-s-' + (f.trailCls === 'hit' || f.trailCls === 'foul' || f.trailCls === 'hr' ? f.trailCls : pitchGroup(f.trailCls)));
    $e('#anRn').innerHTML = f.runners.filter((r) => !r.gone).map((r) => `<circle class="an-rn${r.batter ? ' b' : ''}" cx="${r.x.toFixed(1)}" cy="${(-r.y).toFixed(1)}" r="${(5.5 * k).toFixed(2)}"/>`).join('');
    // 全壘打過牆瞬間：往四周擴散的火花（角度固定，不用亂數，重播時一樣）
    $e('#anFx').innerHTML = f.fx ? Array.from({ length: 16 }, (_, i) => {
      const ang = (i / 16) * Math.PI * 2, d = (20 + 55 * f.fx.k) * (i % 2 ? 1 : 0.65);
      return `<circle cx="${(f.fx.x + Math.cos(ang) * d).toFixed(1)}" cy="${(-f.fx.y - Math.sin(ang) * d).toFixed(1)}" r="${(3.2 * k * (1 - f.fx.k * 0.6)).toFixed(2)}" fill="${i % 3 ? '#f2c94c' : '#fff'}" opacity="${(1 - f.fx.k).toFixed(2)}"/>`;
    }).join('') : '';
  };
  const applyText = (f) => {
    const c = f.cap;
    if (f.evcap) { $e('.an-cl').textContent = f.evcap; $e('.an-ct').innerHTML = ''; }
    else if (c) {
      const nm = ZH() ? PITCH_ZH[c.code] || c.name : c.name;
      $e('.an-cl').textContent = `${L('第', 'Pitch ')}${c.n}${L(' 球', '')}　${nm}${c.speed ? '　' + Math.round(c.speed * 10) / 10 + ' mph' : ''}`;
      const cnt = c.done ? c.count : c.prevCount;
      $e('.an-ct').innerHTML = `${c.done && c.call ? `<em class="${c.cls}">${esc(L(c.call.zh, c.call.en))}</em>` : '<em class="w">&nbsp;</em>'}<span>${cnt ? cnt.balls + '-' + cnt.strikes : ''}</span>`;
    }
    const hudEl = $e('.an-hud');
    if (f.hud && (f.scene === 'field' || f.m > 0)) {
      const hu = f.hud;
      const row = (lab, val, unit) => `<div><small>${lab}</small><b>${val}</b><i>${unit}</i></div>`;
      hudEl.innerHTML = `${hu.ev != null ? row(L('初速', 'Exit velo'), hu.ev, 'mph') : ''}${hu.la != null ? row(L('仰角', 'Launch angle'), hu.la, '°') : ''}${row(L('飛行距離', 'Distance'), hu.dist, 'ft')}${hu.air ? row(L('滯空', 'Hang time'), hu.hang.toFixed(1), 's') : ''}${hu.foul ? `<em>${L('界外', 'FOUL')}</em>` : ''}`;
      hudEl.hidden = false;
    } else hudEl.hidden = true;
    $e('.an-bn').hidden = !f.banner;
  };
  // 播放控制：播放／暫停、時間軸、上一球／下一球。拖時間軸、按上下一球都會先暫停
  const rg = $e('.an-rg'), tm = $e('.an-tm'), pp = $e('.an-pp');
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let playing = !reduce, lastScene = 'pitch';
  const ui = () => {
    rg.value = String(Math.round((t / sc.total) * 1000));
    tm.textContent = `${t.toFixed(1)} / ${sc.total.toFixed(1)}`;
    pp.textContent = playing ? '⏸' : '▶'; pp.setAttribute('aria-pressed', String(!playing)); pp.setAttribute('aria-label', playing ? L('暫停', 'Pause') : L('播放', 'Play'));
  };
  const draw = () => {
    const f = frameAt(sc, t);
    if (f.scene === 'pitch' || lastScene === 'pitch') applyPitch(f); // 轉場結束後 3D 場景已經看不到，不必每格重畫
    lastScene = f.scene;
    pv.style.opacity = f.scene === 'pitch' ? 1 : 0; svg.style.opacity = f.scene === 'field' ? 1 : 0;
    applyField(f); applyText(f);
    ui();
  };
  const frame = (now) => {
    raf = 0;
    if (!playing) return;
    if (!last) last = now;
    t = Math.min(sc.total, t + ((now - last) / 1000) * speed); last = now;
    draw();
    if (t < sc.total) raf = requestAnimationFrame(frame); else { playing = false; ui(); }
  };
  const resume = () => { playing = true; last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); ui(); };
  const pause = () => { playing = false; cancelAnimationFrame(raf); raf = 0; last = 0; ui(); };
  const seekTo = (s) => { t = clamp(s, 0, sc.total); lastScene = 'pitch'; draw(); };
  const pitchStarts = sc.caps.map((c) => c.t0);
  const nextPitch = () => { const n = pitchStarts.find((x) => x > t + 0.05); pause(); seekTo(n != null ? n : sc.total); };
  const prevPitch = () => { const p = [...pitchStarts].reverse().find((x) => x < t - 0.4); pause(); seekTo(p != null ? p : 0); };
  const restart = () => { t = 0; lastScene = 'pitch'; draw(); resume(); };
  const close = () => {
    cancelAnimationFrame(raf); cancelAnimationFrame(rm);
    document.removeEventListener('keydown', onKey);
    el.remove();
    if (opener && opener.focus) try { opener.focus(); } catch (_) {}
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'Tab') { // 焦點留在動畫視窗內
      const f = [...el.querySelectorAll('button, input')];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    } else if (e.key === ' ' && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); if (playing) pause(); else if (t >= sc.total) restart(); else resume(); }
    else if (e.key === 'ArrowRight' && document.activeElement !== rg) nextPitch();
    else if (e.key === 'ArrowLeft' && document.activeElement !== rg) prevPitch();
  };
  document.addEventListener('keydown', onKey);
  rg.addEventListener('input', () => { const to = (Number(rg.value) / 1000) * sc.total; pause(); seekTo(to); }); // 先讀值再暫停（暫停會把滑桿同步回目前時間）
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('.an-x')) close();
    else if (e.target.closest('.an-re')) restart();
    else if (e.target.closest('.an-pp')) { if (playing) pause(); else if (t >= sc.total) restart(); else resume(); }
    else if (e.target.closest('.an-nx')) nextPitch();
    else if (e.target.closest('.an-pv')) prevPitch();
    else if (e.target.closest('.an-sp')) {
      speed = speed === 1 ? 0.4 : 1;
      const b = e.target.closest('.an-sp'); b.textContent = `${L('慢動作', 'Slow')} ${speed === 1 ? '1×' : '0.4×'}`; b.setAttribute('aria-pressed', String(speed !== 1));
    }
  });
  $e('.an-x').focus();
  // 系統設定「減少動態效果」：不自動播放，直接停在結果畫面，可用時間軸自己看
  rm = requestAnimationFrame(() => { if (reduce) seekTo(sc.total); else { draw(); resume(); } });
  // 給測試用：跳到指定時間並畫出那一格
  el._ctl = { sc, seek: (s) => { pause(); seekTo(s); }, time: () => t, playing: () => playing, total: sc.total };
  return el._ctl;
}

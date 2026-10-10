/* 單場頁骨架：局數表、頁面標頭、分頁切換與輪詢、全壘打動畫。文字轉播在 plays.js，LIVE 在 live.js，數據在 box.js */
import { $, $$, esc, dash, morph } from './util.js';
import { teamName, logo, teamAbbr, HALF, evZh } from './dict.js';
import { api, createPoller } from './api.js';
import { S, view, poller, token, G, setRoute, setPoller, setG } from './state.js';
import { gameState, seriesLbl } from './scores.js';
import { setHeader } from './shell.js';
import { wpPoints, wpHTML, bindWp } from './winprob.js';
import { renderText, playCat } from './plays.js';
import { liveHTML } from './live.js';
import { preGameHTML, ensurePre } from './preview.js';
import { IC } from './icons.js';
import { boxHTML } from './box.js';

// 拆檔後，其他模組與測試仍從 game.js 匯入這些名稱
export { textHTML, playHTML, pitchDots } from './plays.js';
export { liveHTML, recapTarget, recapHTML } from './live.js';
export { boxHTML } from './box.js';

export function headHTML(d) {
  const gd = d.gameData || {};
  const ld = d.liveData || {};
  const ls = ld.linescore || {};
  const aT = (gd.teams && gd.teams.away) || {};
  const hT = (gd.teams && gd.teams.home) || {};
  const st = gameState(gd.status, ls, gd.datetime && gd.datetime.dateTime);
  const tot = ls.teams || {};
  const r = (side) => (st.k === 'upcoming' || st.k === 'other' ? '–' : dash(tot[side] && tot[side].runs != null ? tot[side].runs : 0));
  const n = Math.max(9, (ls.innings || []).length);
  const cell = (side, i) => {
    const inn = (ls.innings || [])[i - 1];
    if (!inn || st.k === 'upcoming') return '';
    const runs = inn[side] && inn[side].runs;
    if (runs != null) return runs;
    const cur = ls.currentInning || 0;
    if (st.k === 'final') {
      const hr = tot.home && tot.home.runs, ar = tot.away && tot.away.runs;
      return side === 'home' && i === ls.innings.length && hr > ar ? 'X' : 0;
    }
    if (i < cur) return 0;
    if (i === cur) return side === 'away' ? (ls.inningState === 'Top' ? '' : 0) : ls.inningState === 'End' ? 0 : '';
    return '';
  };
  const curI = st.k === 'live' ? ls.currentInning || 0 : 0;
  const th = Array.from({ length: n }, (_, i) => `<th class="${i + 1 === curI ? 'cur' : ''}">${i + 1}</th>`).join('');
  const rowCells = (side) => Array.from({ length: n }, (_, i) => {
    const v = cell(side, i + 1);
    return `<td class="${i + 1 === curI ? 'cur' : ''}${v === 0 ? ' z' : ''}${typeof v === 'number' && v > 0 ? ' sc' : ''}"><i>${v}</i></td>`;
  }).join('');
  const rhe = (side) => `<div class="rw"><b>${r(side)}</b><span>${dash(tot[side] && tot[side].hits)}</span><span>${dash(tot[side] && tot[side].errors)}</span></div>`;
  const lsHTML = `<div class="ls3w"><div class="ls3" data-cur="${curI}">
    <div class="ls-l"><div class="lh"></div><div class="lw">${logo(aT, 'lw')}</div><div class="lw">${logo(hT, 'lw')}</div></div>
    <div class="ls-s"><table class="line"><thead><tr>${th}</tr></thead><tbody><tr>${rowCells('away')}</tr><tr>${rowCells('home')}</tr></tbody></table></div>
    <div class="ls-r"><div class="rh"><span>R</span><span>H</span><span>E</span></div>${rhe('away')}${rhe('home')}</div>
  </div></div>`;

  const extra = ''; // 賽前的先發投手改放在下面的賽前資訊面板（preview.js）
  // 已結束的比賽可以當作直播重播（按鈕由 main.js 處理，重播程式需要時才載入）
  const replay = st.k === 'final' ? `<button class="rp-go" id="rpStart">${IC.play}重播這場比賽</button>` : '';
  return `
    <div class="hero">
      ${lsHTML}
      ${extra}
      ${replay}
    </div>`;
}

/* 勝率走勢：只在進行中或已結束的比賽顯示；進行中有新打席時才重抓，且至少間隔 15 秒 */
function renderWp() {
  const el = $('#wp');
  if (!el) return;
  const d = G.data, gd = d.gameData || {};
  const aT = gd.teams && gd.teams.away, hT = gd.teams && gd.teams.home;
  const k = gd.status ? gameState(gd.status, d.liveData && d.liveData.linescore).k : '';
  if (k !== 'live' && k !== 'final') { el.innerHTML = ''; return; }
  const wp = G.wp || (G.wp = { n: -1, t: 0, busy: false, pts: [], sig: '' });
  const all = (d.liveData && d.liveData.plays && d.liveData.plays.allPlays) || [];
  const n = all.filter((p) => p.about && p.about.isComplete !== false).length;
  const paint = () => {
    const html = wpHTML(wp.pts, aT, hT, el.clientWidth);
    if (html === wp.sig) return;
    el.innerHTML = html; wp.sig = html;
    bindWp(el, wp.pts, aT, hT);
  };
  paint();
  if (wp.busy || wp.n === n || Date.now() - wp.t < 15000) return;
  wp.busy = true; wp.t = Date.now();
  const my = token;
  api(`/api/v1/game/${G.pk}/winProbability`).then((list) => {
    if (my !== token || !G || G.wp !== wp) return;
    wp.n = n; wp.pts = wpPoints(list);
    if (document.body.contains(el)) paint();
  }).catch(() => { /* 沒有勝率資料就不顯示，下次輪詢再試 */ }).finally(() => { wp.busy = false; });
}

const TAB_NAME = { text: '文字轉播', box: '數據', live: 'LIVE' };

export function renderBody() {
  const body = $('#gBody');
  if (!body || !G.data) return;
  // LIVE 分頁只在比賽進行中出現；選了 LIVE 但比賽沒在進行時，先顯示文字轉播（偏好保留，下次進行中再切回）
  const gs = G.data.gameData && G.data.gameData.status;
  const gk = gs ? gameState(gs, G.data.liveData && G.data.liveData.linescore, G.data.gameData.datetime && G.data.gameData.datetime.dateTime).k : '';
  const isLive = gk === 'live';
  const upcoming = gk === 'upcoming';
  const lvBtn = $('#gTabs [data-t="live"]');
  if (lvBtn) lvBtn.hidden = !isLive;
  const tab = S.gtab === 'live' && !isLive ? 'text' : S.gtab;
  const gc = $('#gCtl');
  if (gc) gc.classList.toggle('pre-hide', upcoming); // 還沒開打：文字轉播與數據是同一份賽前資訊，不需要分頁與篩選工具列
  const handle = $('#gFold .lm');
  if (handle) handle.textContent = TAB_NAME[tab] || '更多'; // 工具列收起時，把手上寫著目前在看哪個分頁
  if (G.bodyTab !== tab) {
    G.bodyTab = tab;
    G.sig = '';
    G.lastTotal = 0;
    if (tab === 'live') {
      $('#gChips').innerHTML = '';
      body.innerHTML = '<div id="lv" class="lv"></div>';
    } else if (tab === 'text') {
      $('#gChips').innerHTML = `
        <div class="chips">
          <button data-f="all">全部</button><button data-f="key">重點</button><button data-f="score">得分</button>
          <button class="af${S.autoFollow ? ' on' : ''}" data-af="1" role="switch" aria-checked="${S.autoFollow}">自動跟隨<i></i></button>
        </div>`;
      body.innerHTML = '<div id="plays"></div>';
    } else {
      const gd = G.data.gameData || {};
      $('#gChips').innerHTML = `
        <div class="chips">
          <button data-side="away">${esc(teamName(gd.teams && gd.teams.away))}</button>
          <button data-side="home">${esc(teamName(gd.teams && gd.teams.home))}</button>
        </div>`;
      body.innerHTML = '<div id="wp" class="wp"></div><div id="box"></div>';
      if (G.wp) G.wp.sig = '';
    }
  }
  $$('#gTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  if (tab === 'live') {
    const html = liveHTML(G.data);
    const el = $('#lv');
    if (el && html !== G.sig) { el.innerHTML = html; G.sig = html; }
  } else if (upcoming) {
    // 還沒開打：文字轉播與數據都顯示賽前資訊（先發投手、球場天氣、預定打線）
    ensurePre(G.data, () => { G.sig = ''; renderBody(); });
    const html = preGameHTML(G.data, G.pre && G.pre.stats);
    const el = tab === 'text' ? $('#plays') : $('#box');
    if (el && html !== G.sig) { el.innerHTML = html; G.sig = html; }
  } else if (tab === 'text') {
    $$('#gChips [data-f]').forEach((b) => b.classList.toggle('on', b.dataset.f === G.filter));
    renderText(G.data);
  } else {
    $$('#gChips [data-side]').forEach((b) => b.classList.toggle('on', b.dataset.side === G.side));
    const html = boxHTML(G.data, G.side);
    const box = $('#box');
    if (box && html !== G.sig) { box.innerHTML = html; G.sig = html; }
    renderWp();
  }
  const lb = $('#langBtn');
  if (lb) { lb.style.visibility = 'visible'; lb.classList.toggle('off', tab === 'box'); lb.disabled = tab === 'box'; }
}

export function gameHeader(d) {
  const gd = d.gameData || {}, ls = (d.liveData && d.liveData.linescore) || {};
  const aT = (gd.teams && gd.teams.away) || {}, hT = (gd.teams && gd.teams.home) || {};
  const st = gameState(gd.status, ls, gd.datetime && gd.datetime.dateTime);
  const tot = ls.teams || {};
  const typeZh = { F: '外卡系列賽', D: '分區系列賽', L: '聯盟冠軍賽', W: '世界大賽', R: '例行賽', S: '春訓', A: '明星賽' };
  const label = seriesLbl.get(G.pk) || typeZh[gd.game && gd.game.type] || '比賽';
  const showN = st.k === 'live' || st.k === 'final';
  const run = (side) => dash(tot[side] && tot[side].runs != null ? tot[side].runs : 0);
  const rc = (t) => (t.record ? `${t.record.wins}-${t.record.losses}` : '');
  const blk = (t) => `<div class="tk">${logo(t, 'gl')}<small>${esc(rc(t))}</small></div>`;
  $('#title').textContent = label;
  const lbEl = $('#liveBar');
  if (lbEl) {
    const on = st.k === 'live' && (ls.inningState === 'Top' || ls.inningState === 'Bottom');
    lbEl.hidden = !on;
    document.body.classList.toggle('haslb', on);
    if (on) {
      const off = ls.offense || {}, def = ls.defense || {};
      const zh = S.lang === 'zh';
      const bat = off.batter || {};
      const bases = [off.first, off.second, off.third].map((x) => (x ? 1 : 0)).join('');
      const all = (d.liveData && d.liveData.plays && d.liveData.plays.allPlays) || [];
      const donePlays = all.filter((p) => p.about && p.about.isComplete !== false && p.result && p.result.event);
      const lastP = donePlays[donePlays.length - 1];
      const key = { bid: bat.id, half: `${ls.currentInning}-${ls.inningState}`, bases, bs: `${ls.balls}-${ls.strikes}`, last: lastP ? lastP.about.atBatIndex : null };
      const pv = G.lbPrev; G.lbPrev = key; // 只有「和上一次不同」的部分才播放輕微效果
      const sameHalf = pv && pv.half === key.half;
      const fx = {
        half: !!pv && !sameHalf,
        bat: sameHalf && pv.bid !== key.bid,
        cnt: sameHalf && pv.bid === key.bid && pv.bs !== key.bs,
        last: sameHalf && pv.last !== key.last,
      };
      const bs = `<svg class="lbs" viewBox="0 0 40 30" aria-hidden="true"><rect x="15" y="1" width="10" height="10" transform="rotate(45 20 6)" class="${off.second ? 'on' : ''}"/><rect x="2" y="12" width="10" height="10" transform="rotate(45 7 17)" class="${off.third ? 'on' : ''}"/><rect x="28" y="12" width="10" height="10" transform="rotate(45 33 17)" class="${off.first ? 'on' : ''}"/></svg>`;
      let mid = '<div class="lr"></div>';
      if (lastP) {
        const cat = playCat(lastP, true).cls;
        const k = cat === 'hr' || cat === 'score' ? 'run' : cat === 'hit' ? 'hit' : '';
        const ev = lastP.result.event;
        mid = `<div class="lr${fx.last ? ' in' : ''}"><small>${zh ? '上一打席' : 'LAST'}</small><span class="res ${k}">${esc(zh ? evZh(ev) : ev)}</span></div>`;
      }
      const offSide = ls.inningState === 'Top' ? 'away' : 'home';
      const offT = (gd.teams && gd.teams[offSide]) || {};
      const half = zh ? `${ls.currentInning} 局${HALF[ls.inningState] || ''}` : `${ls.inningState === 'Top' ? 'Top' : 'Bot'} ${ls.currentInning}`;
      const ov = fx.half ? `<div class="lov"><em>${esc(half)}</em>${esc(teamAbbr(offT))} ${zh ? '進攻' : 'batting'}</div>` : '';
      const lbHTML = `<div class="lm${fx.bat ? ' in' : ''}"><b>${zh ? '打' : 'AB'} ${esc(bat.fullName || '–')}</b><span>${zh ? '投' : 'P'} ${esc((def.pitcher && def.pitcher.fullName) || '–')}</span></div>${mid}<div class="lbr">${bs}<div class="lc"><b${fx.cnt ? ' class="pop"' : ''}>${dash(ls.balls)}-${dash(ls.strikes)}</b><span>${dash(ls.outs)} ${zh ? '出局' : 'out'}</span></div></div>${ov}`;
      if (lbEl._sig !== lbHTML) { lbEl.innerHTML = lbHTML; lbEl._sig = lbHTML; }
    }
  }
  const rowHTML = `<div class="gstrip">${blk(aT)}<div class="gm">${showN ? `<b class="gn ${st.k}">${run('away')}<i class="cn"></i>${run('home')}</b>` : '<b class="gn vs">VS</b>'}<small>${esc(st.txt)}</small></div>${blk(hT)}</div>`;
  const gr = $('#gameRow');
  if (gr._sig !== rowHTML || !gr.firstChild) { morph(gr, rowHTML); gr._sig = rowHTML; } // 換頁清空過就要重畫
}
/* ---- 全壘打煙火（進行中的比賽出現新全壘打時播放，約 3.5 秒，不擋操作）---- */
export function playHR(info) {
  const old = document.getElementById('hrfx'); if (old) old.remove();
  const el = document.createElement('div'); el.id = 'hrfx'; el.className = 'hrfx';
  el.innerHTML = `<canvas></canvas><div class="hrx-flash"></div><div class="hrx-w"><div class="hrx-tk"><span class="hrx-tag">HOME RUN ・ ${esc(info.inn)}</span><h2>${esc(info.who)}</h2><p>${esc(info.kind)}${info.score ? `<b>${esc(info.score)}</b>` : ''}</p></div></div>`;
  document.body.appendChild(el);
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
  const d = window.devicePixelRatio || 1, W = window.innerWidth, H = window.innerHeight;
  cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
  const COL = ['#004B93', '#A6051A', '#e0a800', '#ffffff', '#5aa0e6'];
  let parts = [];
  const burst = (x, y) => { for (let i = 0; i < 70; i++) { const a = Math.random() * 6.283, sp = 170 * (.4 + Math.random() * .6); parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, c: COL[Math.random() * COL.length | 0], r: 2 + Math.random() * 1.6 }); } };
  [[.2, .3], [.8, .25], [.5, .15], [.3, .55], [.75, .5], [.5, .4]].forEach((p, i) => setTimeout(() => burst(p[0] * W, p[1] * H), i * 420));
  let last = performance.now(); const t0 = last;
  const loop = (ts) => {
    const dt = Math.min(.04, (ts - last) / 1000 || .016); last = ts; ctx.clearRect(0, 0, W, H);
    parts = parts.filter((p) => p.t < 1.5);
    for (const p of parts) { p.t += dt; p.vy += 90 * dt; p.vx *= .985; p.x += p.vx * dt; p.y += p.vy * dt; const a = Math.max(0, 1 - p.t / 1.5); ctx.globalAlpha = a; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a + .6, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (ts - t0 < 3700 && el.isConnected) requestAnimationFrame(loop); else el.remove();
  };
  requestAnimationFrame(loop);
}
if (typeof window !== 'undefined') window.__playHR = playHR;
export function checkHR(d) {
  const all = (d.liveData && d.liveData.plays && d.liveData.plays.allPlays) || [];
  const hrs = all.filter((p) => p.result && (p.result.eventType === 'home_run' || p.result.event === 'Home Run') && p.about && p.about.isComplete !== false);
  const seen = G.hrSeen;
  if (!seen) { G.hrSeen = new Set(hrs.map((p) => p.about.atBatIndex)); return; }
  const st = d.gameData && d.gameData.status;
  const live = st && gameState(st, d.liveData && d.liveData.linescore).k === 'live';
  for (const p of hrs) {
    const i = p.about.atBatIndex; if (seen.has(i)) continue; seen.add(i);
    if (!live) continue;
    const r = p.result, n = r.rbi || 1;
    playHR({
      inn: `${/top/i.test(p.about.halfInning || '') ? '上' : '下'} ${p.about.inning} 局`.replace(/^(.) (\d+) 局$/, '$2 局$1'),
      kind: ['', '陽春砲', '兩分砲', '三分砲', '滿貫砲'][Math.min(n, 4)],
      score: r.awayScore != null ? `${r.awayScore} : ${r.homeScore}` : '',
      who: (p.matchup && p.matchup.batter && p.matchup.batter.fullName) || '',
    });
  }
}
export function renderGame() {
  if (!G || !G.data) return;
  checkHR(G.data);
  const head = $('#gHead');
  const html = headHTML(G.data);
  if (head && html !== G.headSig) {
    const sc0 = head.querySelector('.ls-s');
    const keep = sc0 ? sc0.scrollLeft : null, prevCur = sc0 ? head.querySelector('.ls3').dataset.cur : null;
    morph(head, html); G.headSig = html;
    const sc1 = head.querySelector('.ls-s');
    if (sc1) {
      const cur = head.querySelector('.ls3').dataset.cur;
      const th = sc1.querySelector('th.cur');
      if (keep != null && cur === prevCur) sc1.scrollLeft = keep;
      else if (th) sc1.scrollLeft = Math.max(0, th.offsetLeft - sc1.clientWidth / 2 + th.offsetWidth / 2);
    }
  }
  gameHeader(G.data);
  renderBody();
}

export function showGame(pk) {
  setRoute('game');
  S.gFold = false; // 每次進入比賽頁，工具列都先展開
  setHeader('比賽', true, null);
  const my = token;
  setG({ pk, data: null, pm: {}, filter: 'all', side: 'away', limit: 60, sig: '', headSig: '', bodyTab: '', lastTotal: 0, open: new Set(), shut: new Set() });
  view.innerHTML = `
    <div id="liveBar" class="livebar" hidden></div>
    <div id="gHead" class="ghead"><div class="loading">載入中…</div></div>
    <div class="tkw${S.gFold ? ' fold' : ''}" id="gCtl"><div class="tk">
      <div class="seg" id="gTabs"><button data-t="text">文字轉播</button><button data-t="box">數據</button><button data-t="live" class="lv-tab" hidden>LIVE</button></div>
      <div class="tr"></div>
      <div id="gChips"></div>
    </div><button class="fbt" id="gFold" aria-label="收合或展開工具列"><span class="fl lc">收合</span><span class="fl lm">${TAB_NAME[S.gtab] || '更多'}</span><svg viewBox="0 0 16 10" aria-hidden="true"><path d="M2 8l6-6 6 6"/></svg></button></div>
    <div id="gBody"></div>
    <button id="newChip" class="fab" hidden></button>`;
  window.scrollTo(0, 0);
  setPoller(createPoller(
    async () => {
      const d = await api(`/api/v1.1/game/${pk}/feed/live`);
      if (my !== token) return;
      G.data = d;
      renderGame();
    },
    () => {
      const st = G.data && G.data.gameData && G.data.gameData.status;
      const k = st ? gameState(st, G.data.liveData && G.data.liveData.linescore).k : 'live';
      if (k === 'live') return S.gtab === 'live' ? 1000 : 10000; // LIVE 分頁開著：每秒更新
      if (k === 'upcoming') return 30000;
      return null; // 已結束或延賽：不再輪詢
    }
  ));
  poller.start();
}

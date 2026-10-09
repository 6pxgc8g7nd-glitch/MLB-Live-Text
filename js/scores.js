/* 比分頁：賽程、比賽卡片、骨架畫面 */
import { $, esc, dash, twDate, shiftDate, fmtTime, morph } from './util.js';
import { logo, HALF, seriesZh } from './dict.js';
import { api, createPoller } from './api.js';
import { S, view, poller, token, setRoute, setPoller } from './state.js';
import { setHeader } from './shell.js';

export async function loadSchedule(date) {
  // 台灣日期 D 涵蓋的比賽，美國日期可能是 D-1 或 D，所以兩天一起抓再用開賽時間過濾
  const from = shiftDate(date, -1);
  const d = await api(
    `/api/v1/schedule?sportId=1&startDate=${from}&endDate=${date}&hydrate=linescore,probablePitcher,decisions`,
    { ttl: 4000 }
  );
  const start = Date.parse(`${date}T00:00:00+08:00`);
  const end = start + 864e5;
  const seen = new Set();
  const out = [];
  for (const day of d.dates || []) {
    for (const g of day.games || []) {
      const t = Date.parse(g.gameDate);
      if (!(t >= start && t < end) || seen.has(g.gamePk)) continue;
      seen.add(g.gamePk);
      out.push(g);
    }
  }
  out.sort((a, b) => Date.parse(a.gameDate) - Date.parse(b.gameDate) || a.gamePk - b.gamePk);
  return out;
}

export function gameState(status, ls, gameDate) {
  const abs = status && status.abstractGameState;
  const det = (status && status.detailedState) || '';
  ls = ls || {};
  const extra =
    ls.currentInning && ls.scheduledInnings && ls.currentInning > ls.scheduledInnings
      ? `（延長${ls.currentInning}局）` : '';
  if (/postpone/i.test(det)) return { k: 'other', txt: '延賽' };
  if (/suspend/i.test(det)) return { k: 'other', txt: '比賽暫停（保留）' };
  if (/cancel/i.test(det)) return { k: 'other', txt: '取消' };
  if (abs === 'Final') return { k: 'final', txt: '比賽結束' + extra };
  if (/delay/i.test(det)) return abs === 'Live' ? { k: 'live', txt: '比賽延遲中' } : { k: 'upcoming', txt: '延後開打' };
  if (abs === 'Live') {
    if (/warmup|pre-game/i.test(det)) return { k: 'upcoming', txt: `賽前熱身 ${fmtTime(gameDate)}` };
    const inn = ls.currentInning ? `${ls.currentInning}局${HALF[ls.inningState] || ''}` : '進行中';
    const outs = (ls.inningState === 'Top' || ls.inningState === 'Bottom') && ls.outs != null ? ` ${ls.outs}出局` : '';
    return { k: 'live', txt: inn + outs + extra };
  }
  return { k: 'upcoming', txt: fmtTime(gameDate) };
}

export const seriesLbl = new Map();
export const pitStat = new Map();
export async function loadPitStats(games) {
  const ids = [];
  games.forEach((g) => ['away', 'home'].forEach((s) => {
    const p = g.teams && g.teams[s] && g.teams[s].probablePitcher;
    if (p && p.id && !pitStat.has(p.id)) ids.push(p.id);
  }));
  if (!ids.length) return;
  try {
    const yr = new Date().getFullYear();
    const d = await api(`/api/v1/people?personIds=${[...new Set(ids)].join(',')}&hydrate=stats(group=[pitching],type=[season],season=${yr})`, { ttl: 6e5 });
    (d.people || []).forEach((p) => {
      const sp = p.stats && p.stats[0] && p.stats[0].splits && p.stats[0].splits[0];
      const s = sp && sp.stat;
      pitStat.set(p.id, s ? `${s.wins}-${s.losses}　${s.era}` : '');
    });
    document.querySelectorAll('[data-pid]').forEach((el) => { const t = pitStat.get(+el.dataset.pid); if (t) el.textContent = t; });
  } catch (e) { /* 沒有戰績就只顯示名字 */ }
}
export function cardHTML(g) {
  const st = gameState(g.status, g.linescore, g.gameDate);
  const a = (g.teams && g.teams.away) || {};
  const h = (g.teams && g.teams.home) || {};
  const showScore = st.k === 'live' || st.k === 'final';
  const aWin = st.k === 'final' && a.score > h.score;
  const hWin = st.k === 'final' && h.score > a.score;
  const label = [seriesZh(g), g.gameType !== 'R' && g.seriesGameNumber ? `第${g.seriesGameNumber}戰` : '']
    .filter(Boolean).join(' ');
  seriesLbl.set(g.gamePk, label || '例行賽');
  const rec = (t) => (t.leagueRecord ? `${t.leagueRecord.wins}-${t.leagueRecord.losses}` : '');
  let foot = '';
  if (st.k === 'upcoming') {
    const ap = a.probablePitcher, hp = h.probablePitcher;
    const pcol = (p) => p && p.fullName
      ? `<div><b>${esc(p.fullName)}</b><span data-pid="${p.id || ''}">${esc(pitStat.get(p.id) || '')}</span></div>`
      : '<div><b>未定</b><span></span></div>';
    if ((ap && ap.fullName) || (hp && hp.fullName)) foot = `<div class="g-foot pp">${pcol(ap)}${pcol(hp)}</div>`;
  } else if (st.k === 'final' && g.decisions && g.decisions.winner) {
    const d = g.decisions;
    const it = (cls, lbl, p) => (p ? `<span title="${esc(p.fullName)}"><em class="${cls}">${lbl}</em><i class="pn">${esc(shortName(p.fullName))}</i></span>` : '');
    foot = `<div class="g-foot dc">${it('w', '勝', d.winner)}${it('l', '敗', d.loser)}${it('s', '救', d.save)}</div>`;
  }
  const side = (t, win) => `
    <div class="g-tm${win ? ' win' : ''}${st.k === 'final' && !win ? ' lose' : ''}">
      ${logo(t.team)}
      <div class="rc">${esc(rec(t))}</div>
    </div>`;
  const subTxt = st.k === 'final' ? st.txt.replace('比賽結束', '') : st.k === 'other' && st.txt !== '延賽' && st.txt !== '取消' ? st.txt : st.k === 'other' ? '' : st.txt;
  const mid = '<div class="g-mid">' + (showScore
    ? `<div class="big">${scN(a.score ?? 0, aWin, hWin)}<i class="cn"></i>${scN(h.score ?? 0, hWin, aWin)}</div>`
    : '<div class="big vs">VS</div>') + (subTxt ? `<div class="msub">${esc(subTxt)}</div>` : '') + '</div>';
  if (!foot) foot = `<div class="g-foot">${st.k === 'live' ? '進入文字轉播 ›' : st.k === 'final' ? '查看比賽紀錄 ›' : '尚無預定先發資訊'}</div>`;
  const corner = { live: '● 進行', upcoming: '○ 未賽', final: '■ 終了' }[st.k] || (st.txt === '取消' ? '△ 取消' : st.txt === '延賽' ? '△ 延賽' : '△ 暫停');
  return `
    <a class="game ${st.k}${[a.team, h.team].some((t) => t && S.favs.includes(t.id)) ? ' fav' : ''}" href="#/game/${g.gamePk}">
      <span class="gt">${esc(corner)}</span>
      <div class="ser">${esc(label || '例行賽')}</div>
      <div class="g-body">${side(a, aWin)}${mid}${side(h, hWin)}</div>
      <div class="tear"></div>${foot}
    </a>`;
}

export function renderGames(games) {
  const box = $('#games');
  if (!box) return;
  if (!games.length) {
    box.innerHTML = '<div class="empty">這一天沒有比賽</div>';
    box._sig = '';
    return;
  }
  const groups = { live: [], upcoming: [], final: [], other: [] };
  games.forEach((g) => groups[gameState(g.status, g.linescore, g.gameDate).k].push(g));
  const isFav = (g) => [g.teams.away.team, g.teams.home.team].some((t) => t && S.favs.includes(t.id));
  Object.values(groups).forEach((l) => l.sort((x, y) => isFav(y) - isFav(x)));
  const titles = { live: '進行中', upcoming: '尚未開打', final: '已結束', other: '其他' };
  const html = ['live', 'upcoming', 'final', 'other']
    .filter((k) => groups[k].length)
    .map((k) => `<h2 class="grp">${titles[k]}<small>${groups[k].length}</small></h2>${groups[k].map(cardHTML).join('')}`)
    .join('');
  // 內容沒變就不重畫，避免隊徽被重新載入而閃爍
  if (html !== box._sig) { morph(box, html); box._sig = html; }
  loadPitStats(games);
}

// 球員名縮寫：名字只留第一個字母＋姓（Edgardo Henriquez → E. Henriquez）；去掉 Jr./Sr./II 等後綴；已是縮寫（J.T. Realmuto）或單一名字則照舊
export function shortName(full) {
  const parts = String(full || '').replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || '';
  const first = parts[0];
  return `${/\./.test(first) ? first : Array.from(first)[0] + '.'} ${parts.slice(1).join(' ')}`;
}

// 已結束的比賽：贏的比分維持深色、輸的淡化（進行中不套用）
export const scN = (v, win, lose) => (win || lose ? `<span class="sc ${win ? 'w' : 'l'}">${dash(v)}</span>` : dash(v));

/* 載入中的骨架畫面：票券／排名列的灰色外形（不動畫），換頁占位也共用 */
export const skelTicket = () => '<div class="game skel" aria-hidden="true"><span class="gt sk"></span><div class="ser"><i class="sk w40"></i></div><div class="g-body"><div class="sk-tm"><i class="sk c"></i><i class="sk w50"></i></div><div class="sk-mid"><i class="sk w70"></i></div><div class="sk-tm"><i class="sk c"></i><i class="sk w50"></i></div></div><div class="tear"></div><div class="gf"><i class="sk w50"></i></div></div>';
export const skelRows = (n) => `<div class="tcs skel" aria-hidden="true">${Array.from({ length: n }, () => '<div class="tc"><i class="sk c"></i><div class="sk-col"><i class="sk w60"></i><i class="sk w40"></i></div><i class="sk w15 sk-r"></i></div>').join('')}</div>`;
export const skelPage = (name) => (name === 'standings'
  ? '<div class="chips stt sk-chips" aria-hidden="true"><i class="sk"></i><i class="sk"></i><i class="sk"></i><i class="sk"></i></div><h2 class="grp"><i class="sk w30 sk-h"></i></h2>' + skelRows(5)
  : name === 'settings' ? skelRows(4) : '<h2 class="grp"><i class="sk w30 sk-h"></i></h2>' + skelTicket() + skelTicket());

export function showScores() {
  setRoute('scores');
  setHeader('MLB Live Text', false, 'scores');
  const my = token;
  let anyLive = false;
  view.innerHTML = `
    <div id="games"><div class="loading skelbox">${skelTicket()}${skelTicket()}${skelTicket()}</div></div>`;
  setPoller(createPoller(
    async () => {
      const games = await loadSchedule(S.date);
      if (my !== token) return;
      anyLive = games.some((g) => gameState(g.status, g.linescore, g.gameDate).k === 'live');
      renderGames(games);
    },
    () => (anyLive ? 15000 : S.date === twDate() ? 60000 : 180000)
  ));
  poller.start();
}

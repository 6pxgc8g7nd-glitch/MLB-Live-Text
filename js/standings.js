/* 排名頁：分區／聯盟排名、季後賽、對戰樹 */
import { TZ, $, $$, esc, dash, twDate } from './util.js';
import { TEAMS, teamName, logo, teamAbbr, DIVS, DIV_ORDER, LEAGUE, CLINCH, seriesZh } from './dict.js';
import { api, createPoller } from './api.js';
import { S, view, poller, token, setRoute, setPoller, setG } from './state.js';
import { gameState, scN, skelRows } from './scores.js';
import { setHeader } from './shell.js';

export const l10 = (t) => {
  const s = t.records && (t.records.splitRecords || []).find((x) => x.type === 'lastTen');
  return s ? `${s.wins}-${s.losses}` : '–';
};
export function standRow(t, rank, po) {
  const c = t.clinchIndicator && CLINCH[t.clinchIndicator];
  const gb = t.gamesBack;
  const lead = gb === '-' || gb === '0' || gb === '0.0' || gb == null;
  const fav = t.team && S.favs.includes(t.team.id);
  return `<div class="tc${t.clinchIndicator ? ' po' : ''}${fav ? ' rib' : ''}${po ? ' inpo' : ''}"><span class="wm">${esc(rank)}</span>${logo(t.team, 'tcl')}
    <div><div class="tn">${esc(teamName(t.team))}${c ? `<i class="cl" title="${c}">${esc(t.clinchIndicator)}</i>` : ''}</div>
    <div class="ts">${dash(t.wins)}-${dash(t.losses)} ・ ${dash(t.winningPercentage)}</div></div>
    <div class="tg">${lead ? '領先' : '落後'}${lead ? '' : `<b>${esc(gb)}</b>`}</div></div>`;
}
export const standTable = (title, rows) => `
  <h3 class="inn">${esc(title)}</h3>
  <div class="tcs">${rows}</div>`;

export function standingsHTML(d) {
  const recs = d.records || [];
  if (!recs.length) return '<div class="empty">目前沒有排名資料</div>';
  let out = '';
  if (S.standView === 'division') {
    for (const lg of [103, 104]) {
      out += `<h2 class="grp">${LEAGUE[lg]}</h2>`;
      for (const dv of DIV_ORDER[lg]) {
        const r = recs.find((x) => x.division && x.division.id === dv);
        if (!r) continue;
        const teams = (r.teamRecords || []).slice().sort((a, b) => Number(a.divisionRank) - Number(b.divisionRank));
        out += standTable(DIVS[dv], teams.map((t) => standRow(t, t.divisionRank || '')).join(''));
      }
    }
  } else {
    for (const lg of [103, 104]) {
      const teams = recs
        .filter((x) => x.league && x.league.id === lg)
        .flatMap((x) => x.teamRecords || [])
        .sort((a, b) => Number(a.leagueRank) - Number(b.leagueRank));
      // 季後賽線：3 個分區冠軍＋3 張外卡。資料沒有這些欄位時，退而用第 6 名之後
      const inPO = (t) => t.divisionLeader === true || t.divisionLeader === 'true' || (t.wildCardRank != null && t.wildCardRank !== '' && Number(t.wildCardRank) <= 3);
      const hasInfo = teams.some((t) => t.divisionLeader != null || t.wildCardRank != null);
      let cut = 6;
      if (hasInfo) { cut = 0; teams.forEach((t, i) => { if (inPO(t)) cut = i + 1; }); }
      const rows = teams.map((t, i) => standRow(t, t.leagueRank || '', i < cut) + (i + 1 === cut && cut < teams.length ? '<div class="cutline"><span>季後賽線</span></div>' : '')).join('');
      out += `<h2 class="grp">${LEAGUE[lg]}</h2>` + standTable('聯盟排名', rows);
    }
  }
  const used = Object.keys(CLINCH).filter((k) => recs.some((r) => (r.teamRecords || []).some((t) => t.clinchIndicator === k)));
  if (used.length) out += `<p class="note">${used.map((k) => `<i class="cl">${k}</i> ${CLINCH[k]}`).join('　')}</p>`;
  return out;
}

/* ---- 季後賽 ---- */
export const abbrTxt = (g0) => {
  const desc = g0.seriesDescription || '';
  const lgc = /^AL /i.test(desc) ? 'AL' : /^NL /i.test(desc) ? 'NL' : '';
  return { F: lgc + 'WC', D: lgc + 'DS', L: lgc + 'CS', W: 'WS' }[g0.gameType] || '';
};
export function seriesHTML(s) {
  const games = (s.games || []).slice().sort((x, y) => Date.parse(x.gameDate) - Date.parse(y.gameDate));
  const g0 = games[0];
  if (!g0) return '';
  const A = g0.teams.away.team, H = g0.teams.home.team;
  const wins = { [A.id]: 0, [H.id]: 0 };
  let anyPlayed = false, live = false;
  games.forEach((g) => {
    const k = gameState(g.status, g.linescore, g.gameDate).k;
    if (k === 'live') live = true;
    ['away', 'home'].forEach((sd) => {
      const t = g.teams[sd];
      if (k === 'final') anyPlayed = true;
      if (t && t.isWinner && t.team && wins[t.team.id] != null) wins[t.team.id]++;
    });
  });
  const n = g0.gamesInSeries || games.length;
  const need = Math.ceil(n / 2);
  const done = wins[A.id] >= need || wins[H.id] >= need;
  const lead = wins[A.id] === wins[H.id] ? null : wins[A.id] > wins[H.id] ? A : H;
  const hi = Math.max(wins[A.id], wins[H.id]), lo = Math.min(wins[A.id], wins[H.id]);
  const k = live ? 'live' : done ? 'fin' : 'todo';
  const name = esc(seriesZh(g0) || g0.seriesDescription || '');
  const real = (t) => !!(t && TEAMS[t.id]);
  const played = games.filter((g) => gameState(g.status, g.linescore, g.gameDate).k === 'final').length;
  const gNo = Math.min(n, done ? played : played + 1);
  const liveG = games.find((g) => gameState(g.status, g.linescore, g.gameDate).k === 'live');
  // 版型與「比分」頁的比賽卡片一致：左上狀態標籤、中間大比分（系列賽勝場）、虛線撕線、底部資訊
  const cls = { live: 'live', fin: 'final', todo: 'upcoming' }[k];
  const corner = { live: '● 進行', fin: '■ 終了', todo: '○ 未賽' }[k];
  const side = (t) => {
    const win = done && lead && lead.id === t.id, lose = done && lead && lead.id !== t.id;
    return `<div class="g-tm${win ? ' win' : ''}${lose ? ' lose' : ''}">${real(t) ? logo(t) : '<span class="pq">?</span>'}<div class="rc">${real(t) ? esc(teamName(t)) : '待定'}</div></div>`;
  };
  const sub = done ? `${esc(teamName(lead))} 晉級` : live ? `G${gNo} 進行中` : !anyPlayed ? '尚未開打' : lead ? `${esc(teamName(lead))} 領先 ${hi}-${lo}` : `戰成 ${hi}-${lo}`;
  const foot = live && liveG ? '進入文字轉播 ›' : `G${gNo} / ${n}　・　${n} 戰 ${need} 勝`;
  const inner = `<span class="gt">${corner}</span>
      <div class="ser">${name}${abbrTxt(g0) ? '　' + abbrTxt(g0) : ''}</div>
      <div class="g-body">${side(A)}<div class="g-mid"><div class="big">${scN(wins[A.id], done && lead && lead.id === A.id, done && lead && lead.id !== A.id)}<i class="cn"></i>${scN(wins[H.id], done && lead && lead.id === H.id, done && lead && lead.id !== H.id)}</div><div class="msub">${sub}</div></div>${side(H)}</div>
      <div class="tear"></div><div class="g-foot">${foot}</div>`;
  const favCls = [A, H].some((t) => S.favs.includes(t.id)) ? ' fav' : '';
  return { k, html: live && liveG
    ? `<a class="game ${cls}${favCls}" href="#/game/${liveG.gamePk}">${inner}</a>`
    : `<div class="game ${cls}${favCls}">${inner}</div>` };
}
export function postHTML(d) {
  const list = (d && d.series) || [];
  const byType = {};
  list.forEach((s) => { const g = (s.games || [])[0]; if (g) (byType[g.gameType] = byType[g.gameType] || []).push(s); });
  const order = { F: 0, L: 1, D: 2, W: 3 };
  const groups = { live: [], todo: [], fin: [] };
  ['F', 'D', 'L', 'W'].forEach((t) => {
    (byType[t] || []).slice().sort((x, y) => (x.series.sortNumber || 0) - (y.series.sortNumber || 0)).forEach((s) => {
      const r = seriesHTML(s);
      if (r) groups[r.k].push(r.html);
    });
  });
  const titles = { live: '進行中', todo: '未完成', fin: '已結束' };
  let out = '';
  for (const k of ['live', 'todo', 'fin']) {
    if (groups[k].length) out += `<h2 class="grp">${titles[k]}<small>${groups[k].length}</small></h2>${groups[k].join('')}`;
  }
  return out || '<div class="empty">目前沒有季後賽資料</div>';
}

/* ---- 季後賽對戰樹 ----
 * 欄位：外卡(F) → 分區(D) → 聯盟冠軍(L)，每聯盟一棵，最後是世界大賽(W)。
 * 未決定的隊伍在 API 裡是假隊伍（id 很大、名稱像 "LAD/SD" 或 "Higher Seed League Champion"），一律顯示「待定」。 */
export const isRealTeam = (t) => !!(t && TEAMS[t.id]);
export const bkMD = new Intl.DateTimeFormat('zh-TW', { timeZone: TZ, month: 'numeric', day: 'numeric' });
export const BK_ROUND = { F: '外卡賽', D: '分區賽', L: '聯盟冠軍賽', W: '世界大賽' };

export function bkInfo(s) {
  const games = ((s && s.games) || []).filter((g) => g && g.teams && g.teams.away && g.teams.home)
    .sort((x, y) => Date.parse(x.gameDate) - Date.parse(y.gameDate));
  const g0 = games[0];
  if (!g0) return null;
  const sid = (s.series && s.series.id) || '';
  const m = /^([FDLW])_(\d+)$/.exec(sid);
  const type = (m && m[1]) || g0.gameType || '';
  const num = m ? Number(m[2]) : (s.series && s.series.sortNumber) || 0;
  const desc = g0.seriesDescription || '';
  const lg = type === 'W' ? 'WS' : /^AL /i.test(desc) ? 'AL' : /^NL /i.test(desc) ? 'NL' : '';
  // 一場比賽主場是高種子，所以高種子排上面
  const H = g0.teams.home.team || {}, A = g0.teams.away.team || {};
  const wins = { [H.id]: 0, [A.id]: 0 };
  let played = false, live = false, liveG = null, lastFinal = null;
  games.forEach((g) => {
    const k = gameState(g.status, g.linescore, g.gameDate).k;
    if (k === 'live') { live = true; liveG = liveG || g; }
    if (k === 'final') { played = true; lastFinal = g; }
    ['away', 'home'].forEach((sd) => {
      const t = g.teams[sd];
      if (k === 'final' && t && t.isWinner && t.team && wins[t.team.id] != null) wins[t.team.id]++;
    });
  });
  const n = g0.gamesInSeries || games.length;
  const need = Math.ceil(n / 2);
  const real = isRealTeam(H) && isRealTeam(A);
  const done = real && (wins[H.id] >= need || wins[A.id] >= need);
  const winner = done ? (wins[H.id] >= need ? H : A) : null;
  const next = games.find((g) => gameState(g.status, g.linescore, g.gameDate).k === 'upcoming');
  const target = liveG || (real && (lastFinal && !next ? lastFinal : next || lastFinal)) || null;
  return {
    type, num, lg, H, A, wins, n, need, real, played, live, done, winner, g0,
    target: real && target ? target.gamePk : null,
    teamIds: [H, A].filter(isRealTeam).map((t) => t.id),
  };
}

export function bkRow(t, si, w) {
  const real = isRealTeam(t);
  let nm = '待定', sub = '';
  if (real) nm = teamAbbr(t);
  else {
    const raw = (t && (t.name || t.teamName)) || '';
    if (/^[A-Z]{2,3}(\/[A-Z]{2,3})+$/.test(raw)) sub = raw.split('/').join(' / ');
    else if (/higher/i.test(raw)) sub = '高種子冠軍';
    else if (/lower/i.test(raw)) sub = '低種子冠軍';
  }
  const state = si.done && real ? (si.winner.id === t.id ? ' w' : ' l') : '';
  const shown = real && (si.played || si.live) ? w : '';
  return `<div class="bk-t${state}${real ? '' : ' tbd'}">${real ? logo(t, 'bkl') : '<i class="bkl q">?</i>'}<span class="bk-n"><b>${esc(nm)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><em>${shown}</em></div>`;
}

export function bkCard(si, big) {
  const hi = Math.max(si.wins[si.H.id] || 0, si.wins[si.A.id] || 0);
  const lo = Math.min(si.wins[si.H.id] || 0, si.wins[si.A.id] || 0);
  const lead = hi === lo ? null : (si.wins[si.H.id] || 0) > (si.wins[si.A.id] || 0) ? si.H : si.A;
  let st = '待定', cls = '';
  if (si.done) { st = `${teamAbbr(si.winner)} 晉級`; cls = ' d'; }
  else if (si.live) { st = si.played && lead ? `● ${teamAbbr(lead)} ${hi}-${lo}` : si.played ? `● 戰成 ${hi}-${lo}` : '● 進行中'; cls = ' l'; }
  else if (si.real && si.played) st = lead ? `${teamAbbr(lead)} 領先 ${hi}-${lo}` : `戰成 ${hi}-${lo}`;
  else if (si.real) st = `${bkMD.format(new Date(si.g0.gameDate))} 開打`;
  const head = `<div class="bk-h"><span>${BK_ROUND[si.type] || ''}</span><small>${si.n}戰${si.need}勝</small></div>`;
  const body = `${bkRow(si.H, si, si.wins[si.H.id])}${bkRow(si.A, si, si.wins[si.A.id])}<div class="bk-s${cls}">${esc(st)}</div>`;
  const c = `bk-card${big ? ' big' : ''}${si.live ? ' live' : ''}${si.done ? ' done' : ''}`;
  return si.target
    ? `<a class="${c}" href="#/game/${si.target}">${head}${body}</a>`
    : `<div class="${c}">${head}${body}</div>`;
}

/* 單一系列賽縮圖：標籤＋上下兩隊（隊徽＋勝場） */
export function bk2Chip(si, d) {
  if (!si) {
    return `<div class="bk2c emp"><span class="bk2n">待定</span><div class="bk2tr"></div><div class="bk2t"><i class="bk2l q">?</i></div><div class="bk2t"><i class="bk2l q">?</i></div></div>`;
  }
  const cls = `bk2c${si.live ? ' live' : ''}${si.done ? ' done' : ''}${si.teamIds.some((id) => S.favs.includes(id)) ? ' fav' : ''}`;
  const row = (t) => {
    const real = isRealTeam(t);
    const st = si.done && real ? (si.winner.id === t.id ? ' w' : ' l') : '';
    const shown = real && (si.played || si.live) ? si.wins[t.id] : '';
    return `<div class="bk2t${st}">${real ? logo(t, 'bk2l') : '<i class="bk2l q">?</i>'}<em>${shown}</em></div>`;
  };
  const tip = `${BK_ROUND[si.type] || ''} ${isRealTeam(si.H) ? teamAbbr(si.H) : '待定'} vs ${isRealTeam(si.A) ? teamAbbr(si.A) : '待定'}`;
  const inner = `<span class="bk2n">${BK_ROUND[si.type] || ''}</span><div class="bk2tr"></div>${row(si.H)}${row(si.A)}`;
  return si.target
    ? `<a class="${cls}" title="${esc(tip)}" href="#/game/${si.target}">${inner}</a>`
    : `<div class="${cls}" title="${esc(tip)}">${inner}</div>`;
}

export function bracketHTML(d, first) {
  const infos = ((d && d.series) || []).map((s) => { try { return bkInfo(s); } catch (e) { return null; } }).filter(Boolean);
  if (!infos.length) return '<div class="empty">目前沒有季後賽資料</div>';
  const pick = (lg, type) => infos.filter((x) => x.lg === lg && x.type === type).sort((a, b) => a.num - b.num);
  const lgs = {};
  for (const lg of ['AL', 'NL']) {
    const wc = pick(lg, 'F'), ds = pick(lg, 'D'), cs = pick(lg, 'L');
    // 外卡贏家去打哪個分區系列賽：先看有沒有同一支球隊；還沒決定就用賽制固定的對位
    let wcCol = [null, null];
    if (wc.length) {
      const left = wc.slice();
      const n = Math.max(ds.length, 2);
      wcCol = Array.from({ length: n }, (_, i) => {
        const x = ds[i];
        let k = x ? left.findIndex((w) => w.teamIds.some((id) => x.teamIds.includes(id))) : -1;
        if (k < 0) { const want = wc[wc.length - 1 - i]; k = left.indexOf(want); }
        if (k < 0) k = left.length ? 0 : -1;
        return k < 0 ? null : left.splice(k, 1)[0];
      });
    }
    lgs[lg] = { wcCol, ds: [ds[0] || null, ds[1] || null], cs: cs[0] || null };
  }
  const ws = infos.find((x) => x.type === 'W') || null;
  const hasWC = ['AL', 'NL'].some((lg) => lgs[lg].wcCol.some(Boolean));
  const adv = (x) => !!x && x.teamIds.some((id) => S.favs.includes(id)) && (!x.done || (x.winner && S.favs.includes(x.winner.id)));
  const hl = (on) => (on ? 'var(--navy)' : 'var(--ln)');
  const joinSty = (span, a, b) => `style="grid-column:${span};--la:${hl(adv(a))};--lb:${hl(adv(b))};--ld:${hl(adv(a) || adv(b))}"`;
  const cell = (x, span) => `<div class="bk2-c" style="grid-column:${span}">${bk2Chip(x)}</div>`;
  let step = 0;
  const dl = () => `style="--d:${(step++ * 0.18).toFixed(2)}s"`;
  let out = `<div class="bk2${first ? ' first' : ''}">
    <div class="bk2-lg"><span>美國聯盟</span><span>國家聯盟</span></div>`;
  if (hasWC) {
    const w = [lgs.AL.wcCol[0], lgs.AL.wcCol[1], lgs.NL.wcCol[0], lgs.NL.wcCol[1]];
    out += `<div class="bk2-row" ${dl()}>${w.map((x, i) => (x ? cell(x, `${i * 2 + 1} / span 2`) : '')).join('')}</div>
    <div class="bk2-row bk2-stem" ${dl()}>${w.map((x, i) => (x ? `<div class="bk2-s" style="grid-column:${i * 2 + 1} / span 2;--ls:${hl(adv(x))}"></div>` : '')).join('')}</div>`;
  }
  const dsCells = [lgs.AL.ds[0], lgs.AL.ds[1], lgs.NL.ds[0], lgs.NL.ds[1]];
  out += `<div class="bk2-row" ${dl()}>${dsCells.map((x, i) => cell(x, `${i * 2 + 1} / span 2`)).join('')}</div>
    <div class="bk2-row bk2-join" ${dl()}><div class="bk2-j" ${joinSty('1 / span 4', lgs.AL.ds[0], lgs.AL.ds[1])}></div><div class="bk2-j" ${joinSty('5 / span 4', lgs.NL.ds[0], lgs.NL.ds[1])}></div></div>
    <div class="bk2-row" ${dl()}>${cell(lgs.AL.cs, '2 / span 2')}${cell(lgs.NL.cs, '6 / span 2')}</div>
    <div class="bk2-row bk2-join" ${dl()}><div class="bk2-j" ${joinSty('1 / span 8', lgs.AL.cs, lgs.NL.cs)}></div></div>
    <div class="bk2-row bk2-wsr" ${dl()}>${cell(ws, '4 / span 2')}</div>
  </div>`;
  const other = infos.filter((x) => x.lg === '' && x.type !== 'W');
  if (other.length) out += `<h2 class="grp">其他系列賽</h2><div class="bk-ws">${other.map((x) => bkCard(x)).join('')}</div>`;
  return out + '<p class="note">點系列賽縮圖可進入比賽。</p>';
}

export function paintBracket(box, d, st) {
  const html = bracketHTML(d, !st.sig);
  const sigNow = bracketHTML(d, false);
  if (sigNow === st.sig && box.querySelector('.bk2')) return;
  box.innerHTML = html;
  st.sig = sigNow;
}

export function showStandings() {
  setRoute('standings');
  S.standView = S.standDef;
  setHeader('MLB 排名', false, 'standings');
  const my = token;
  let data = null;
  view.innerHTML = `
    <div class="chips stt">
      <button data-sv="division">分區</button><button data-sv="league">聯盟</button><button data-sv="post">季後賽</button><button data-sv="bracket">對戰樹</button>
    </div><div id="stand"><div class="loading skelbox">${skelRows(6)}</div></div>`;
  const bk = { sig: '' };
  const paint = () => {
    $$('[data-sv]').forEach((b) => b.classList.toggle('on', b.dataset.sv === S.standView));
    if (S.standView !== 'bracket') bk.sig = '';
    if (S.standView === 'post') {
      if (post) $('#stand').innerHTML = postHTML(post);
    } else if (S.standView === 'bracket') {
      if (post) paintBracket($('#stand'), post, bk);
    } else if (data) $('#stand').innerHTML = standingsHTML(data);
  };
  let post = null;
  setG({ repaint: paint });
  paint();
  const season = twDate().slice(0, 4);
  setPoller(createPoller(
    async () => {
      const d = await api(`/api/v1/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`, { ttl: 60000 });
      if (my !== token) return;
      data = d;
      try {
        post = await api(`/api/v1/schedule/postseason/series?season=${season}&sportId=1`, { ttl: 30000 });
      } catch (e) { post = post || { series: [] }; }
      if (my !== token) return;
      paint();
    },
    () => (S.standView === 'post' || S.standView === 'bracket' ? 60000 : 300000)
  ));
  poller.start();
}

'use strict';
/* MLB 文字轉播 PWA
 * 資料來源：MLB Stats API（statsapi.mlb.com，非官方、無穩定性保證，因此所有欄位都做缺值保護）
 * 結構：工具 → 字典 → 資料層(api/poller) → 畫面(比分/轉播/排名) → 路由與啟動
 */
(() => {
  /* ================= 工具 ================= */
  const API = 'https://statsapi.mlb.com';
  const TZ = 'Asia/Taipei';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dash = (v) => (v === undefined || v === null || v === '' ? '–' : v);

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {
        /* 無痕模式或儲存空間被封鎖時忽略 */
      }
    },
  };

  /* ---- 日期：一律以台灣時間（0:00 換日）為準 ---- */
  const fmtISO = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fmtHM = new Intl.DateTimeFormat('zh-TW', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const fmtHMS = new Intl.DateTimeFormat('zh-TW', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const fmtDay = new Intl.DateTimeFormat('zh-TW', { timeZone: TZ, month: 'numeric', day: 'numeric', weekday: 'short' });

  const twDate = (d = new Date()) => fmtISO.format(d); // YYYY-MM-DD（台灣日期）
  const shiftDate = (s, n) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  };
  const fmtTime = (x) => (x ? fmtHM.format(new Date(x)) : '–');
  const fmtClock = (x) => fmtHMS.format(new Date(x));
  const dayLabel = (s) => fmtDay.format(new Date(`${s}T12:00:00+08:00`));

  /* ================= 字典 ================= */
  const TEAMS = {
    108: '洛杉磯天使', 109: '亞利桑那響尾蛇', 110: '巴爾的摩金鶯', 111: '波士頓紅襪', 112: '芝加哥小熊',
    113: '辛辛那提紅人', 114: '克里夫蘭守護者', 115: '科羅拉多洛磯', 116: '底特律老虎', 117: '休士頓太空人',
    118: '堪薩斯市皇家', 119: '洛杉磯道奇', 120: '華盛頓國民', 121: '紐約大都會', 133: '運動家',
    134: '匹茲堡海盜', 135: '聖地牙哥教士', 136: '西雅圖水手', 137: '舊金山巨人', 138: '聖路易紅雀',
    139: '坦帕灣光芒', 140: '德州遊騎兵', 141: '多倫多藍鳥', 142: '明尼蘇達雙城', 143: '費城費城人',
    144: '亞特蘭大勇士', 145: '芝加哥白襪', 146: '邁阿密馬林魚', 147: '紐約洋基', 158: '密爾瓦基釀酒人',
  };
  const ABBR = {
    108: 'LAA', 109: 'AZ', 110: 'BAL', 111: 'BOS', 112: 'CHC', 113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET',
    117: 'HOU', 118: 'KC', 119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH', 134: 'PIT', 135: 'SD', 136: 'SEA',
    137: 'SF', 138: 'STL', 139: 'TB', 140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI', 144: 'ATL', 145: 'CWS',
    146: 'MIA', 147: 'NYY', 158: 'MIL',
  };
  const teamName = (t) => (t && TEAMS[t.id]) || (t && t.name) || '—'; // 查不到就用 API 的英文名
  const logo = (t, c) => (t && t.id ? `<img class="tl ${c || ''}" src="logos/${t.id}.svg" alt="" loading="lazy" onerror="this.remove()">` : '');
  const teamAbbr = (t) => (t && ABBR[t.id]) || (t && (t.abbreviation || t.teamName)) || '';

  const DIVS = { 201: '美聯東區', 202: '美聯中區', 200: '美聯西區', 204: '國聯東區', 205: '國聯中區', 203: '國聯西區' };
  const DIV_ORDER = { 103: [201, 202, 200], 104: [204, 205, 203] };
  const LEAGUE = { 103: '美國聯盟', 104: '國家聯盟' };
  const CLINCH = { z: '例行賽最佳', y: '分區冠軍', w: '外卡', x: '晉級季後賽' };

  const HALF = { Top: '上', Bottom: '下', Middle: '中場', End: '局末' };
  const BASE = { '1B': '一壘', '2B': '二壘', '3B': '三壘', Home: '本壘' };
  const EV = {
    Single: '一壘安打', Double: '二壘安打', Triple: '三壘安打', 'Home Run': '全壘打',
    Walk: '四壞球', 'Intent Walk': '故意四壞球', 'Hit By Pitch': '觸身球',
    Strikeout: '三振', 'Strikeout Double Play': '三振雙殺',
    Groundout: '滾地球出局', Flyout: '飛球出局', Lineout: '平飛球出局', 'Pop Out': '內野高飛球出局',
    Forceout: '封殺出局', 'Grounded Into DP': '滾地球雙殺打', 'Double Play': '雙殺', 'Triple Play': '三殺',
    'Field Error': '因守備失誤上壘', Error: '失誤',
    'Sac Fly': '高飛犧牲打', 'Sac Fly Double Play': '高飛犧牲打雙殺',
    'Sac Bunt': '犧牲觸擊', 'Sac Bunt Double Play': '犧牲觸擊雙殺',
    'Fielders Choice': '野手選擇', 'Fielders Choice Out': '野手選擇出局',
    'Bunt Groundout': '觸擊滾地球出局', 'Bunt Pop Out': '觸擊高飛球出局', 'Bunt Lineout': '觸擊平飛球出局',
    'Catcher Interference': '捕手妨礙打擊', 'Batter Interference': '打者妨礙', 'Fan Interference': '觀眾干擾',
    'Runner Out': '跑者出局', 'Wild Pitch': '暴投', 'Passed Ball': '捕逸', Balk: '投手犯規',
    'Game Advisory': '場上通知', 'Runner Placed On Base': '延長賽跑者置於壘上',
  };
  const HIT_EVENTS = ['Single', 'Double', 'Triple', 'Home Run'];
  const KEY_EVENTS = ['Home Run', 'Triple', 'Double', 'Double Play', 'Triple Play', 'Grounded Into DP', 'Field Error', 'Error'];

  function evZh(e) {
    if (!e) return '';
    if (EV[e]) return EV[e];
    let m;
    if ((m = e.match(/^Stolen Base (1B|2B|3B|Home)$/))) return `盜${BASE[m[1]]}成功`;
    if ((m = e.match(/^Caught Stealing (1B|2B|3B|Home)$/))) return `盜${BASE[m[1]]}失敗`;
    if ((m = e.match(/^Pickoff (1B|2B|3B)$/))) return `牽制${BASE[m[1]]}跑者出局`;
    if (/^Pickoff Caught Stealing/.test(e)) return '牽制盜壘失敗';
    return e; // 沒收錄的事件保留英文，不顯示空白
  }

  function seriesZh(g) {
    if (!g || g.gameType === 'R') return '';
    const s = g.seriesDescription || '';
    if (g.gameType === 'S') return '春訓';
    if (g.gameType === 'A') return '明星賽';
    const lg = /^AL /i.test(s) ? '美聯' : /^NL /i.test(s) ? '國聯' : '';
    const map = [
      [/wild card/i, '外卡系列賽'], [/division series/i, '分區系列賽'],
      [/championship series/i, '聯盟冠軍賽'], [/world series/i, '世界大賽'],
    ];
    for (const [re, zh] of map) if (re.test(s)) return lg + zh;
    return s;
  }

  /* ================= 資料層 ================= */
  const cache = new Map(); // path -> { t, d }  只用來避免短時間內重複請求
  async function api(path, { ttl = 0, timeout = 12000 } = {}) {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.t < ttl) return hit.d;
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(API + path, { signal: ctl.signal, cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      cache.set(path, { t: Date.now(), d });
      return d;
    } finally {
      clearTimeout(to);
    }
  }

  let lastOk = 0;
  function setStatus(ok) {
    const b = $('#banner');
    if (!b) return;
    if (ok) {
      lastOk = Date.now();
      b.hidden = true;
      const u = $('#updated');
      if (u) u.textContent = '更新 ' + fmtClock(lastOk);
    } else {
      b.hidden = false;
      b.textContent =
        navigator.onLine === false
          ? '目前離線，畫面是上次載入的資料'
          : `資料更新失敗，稍後自動重試${lastOk ? `（上次成功 ${fmtClock(lastOk)}）` : ''}`;
    }
  }

  /* 輪詢：失敗時指數退避、背景分頁暫停、回到前景立即補更新、不重疊執行 */
  function createPoller(fn, delayFn) {
    let timer = 0, fails = 0, stopped = false, busy = false;
    const p = {
      async run() {
        clearTimeout(timer);
        if (stopped || busy || document.hidden) return;
        busy = true;
        let ok = true;
        try { await fn(); } catch (e) { ok = false; console.warn(e); }
        busy = false;
        if (stopped) return;
        if (ok) { fails = 0; setStatus(true); } else { fails++; setStatus(false); }
        const base = delayFn();
        if (base == null) return; // 不需要再更新（例如比賽已結束）
        const wait = Math.min(base * Math.pow(2, Math.min(fails, 4)), 60000);
        timer = setTimeout(() => p.run(), wait);
      },
      start() { stopped = false; p.run(); },
      kick() { if (!stopped && !busy) p.run(); },
      stop() { stopped = true; clearTimeout(timer); },
    };
    return p;
  }

  /* ================= 狀態 ================= */
  const S = {
    boxMore: store.get('boxMore', false),
    lang: store.get('lang', 'zh'),
    date: twDate(),
    follow: true, // true = 跟著「今天」，台灣 0:00 自動換日
    standView: store.get('standView', 'division'),
    gtab: store.get('gtab', 'text'),
  };
  let view = null;
  let poller = null;
  let token = 0; // 每次換頁 +1，舊請求回來時用來丟棄
  let route$ = 'scores';
  let G = null; // 目前比賽頁狀態

  function stopPoller() {
    if (poller) poller.stop();
    poller = null;
  }

  /* ================= 賽程 / 比分 ================= */
  async function loadSchedule(date) {
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

  function gameState(status, ls, gameDate) {
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

  const pitStat = new Map();
  async function loadPitStats(games) {
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
  function cardHTML(g) {
    const st = gameState(g.status, g.linescore, g.gameDate);
    const a = (g.teams && g.teams.away) || {};
    const h = (g.teams && g.teams.home) || {};
    const showScore = st.k === 'live' || st.k === 'final';
    const aWin = st.k === 'final' && a.score > h.score;
    const hWin = st.k === 'final' && h.score > a.score;
    const label = [seriesZh(g), g.gameType !== 'R' && g.seriesGameNumber ? `第${g.seriesGameNumber}戰` : '']
      .filter(Boolean).join(' ');
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
      const it = (cls, lbl, p) => (p ? `<span><em class="${cls}">${lbl}</em>${esc(p.fullName)}</span>` : '');
      foot = `<div class="g-foot dc">${it('w', '勝', d.winner)}${it('l', '敗', d.loser)}${it('s', '救', d.save)}</div>`;
    }
    const side = (t, win) => `
      <div class="g-tm${win ? ' win' : ''}${st.k === 'final' && !win ? ' lose' : ''}">
        ${logo(t.team)}
        <div class="rc">${esc(rec(t))}</div>
      </div>`;
    const subTxt = st.k === 'final' ? st.txt.replace('比賽結束', '') : st.k === 'other' && st.txt !== '延賽' && st.txt !== '取消' ? st.txt : st.k === 'other' ? '' : st.txt;
    const mid = '<div class="g-mid">' + (showScore
      ? `<div class="big">${dash(a.score ?? 0)}<i>:</i>${dash(h.score ?? 0)}</div>`
      : '<div class="big vs">VS</div>') + (subTxt ? `<div class="msub">${esc(subTxt)}</div>` : '') + '</div>';
    if (!foot) foot = `<div class="g-foot">${st.k === 'live' ? '進入文字轉播 ›' : st.k === 'final' ? '查看比賽紀錄 ›' : '尚無預定先發資訊'}</div>`;
    const corner = { live: '● 進行', upcoming: '○ 未賽', final: '■ 終了' }[st.k] || (st.txt === '取消' ? '△ 取消' : st.txt === '延賽' ? '△ 延賽' : '△ 暫停');
    return `
      <a class="game ${st.k}" href="#/game/${g.gamePk}">
        <span class="gt">${esc(corner)}</span>
        <div class="ser">${esc(label || '例行賽')}</div>
        <div class="g-body">${side(a, aWin)}${mid}${side(h, hWin)}</div>
        <div class="tear"></div>${foot}
      </a>`;
  }

  function renderGames(games) {
    const box = $('#games');
    if (!box) return;
    if (!games.length) {
      box.innerHTML = '<div class="empty">這一天沒有比賽</div>';
      return;
    }
    const groups = { live: [], upcoming: [], final: [], other: [] };
    games.forEach((g) => groups[gameState(g.status, g.linescore, g.gameDate).k].push(g));
    const titles = { live: '進行中', upcoming: '尚未開打', final: '已結束', other: '其他' };
    box.innerHTML = ['live', 'upcoming', 'final', 'other']
      .filter((k) => groups[k].length)
      .map((k) => `<h2 class="grp">${titles[k]}<small>${groups[k].length}</small></h2>${groups[k].map(cardHTML).join('')}`)
      .join('');
    loadPitStats(games);
  }

  function showScores() {
    route$ = 'scores';
    setHeader('MLB Live Text', false, 'scores');
    const my = token;
    let anyLive = false;
    view.innerHTML = `
      <div id="games"><div class="loading">載入中…</div></div>`;
    poller = createPoller(
      async () => {
        const games = await loadSchedule(S.date);
        if (my !== token) return;
        anyLive = games.some((g) => gameState(g.status, g.linescore, g.gameDate).k === 'live');
        renderGames(games);
      },
      () => (anyLive ? 15000 : S.date === twDate() ? 60000 : 180000)
    );
    poller.start();
  }

  /* ================= 單場：文字轉播 / 數據 ================= */
  const diamond = (on1, on2, on3) => {
    const d = (cx, cy, on) =>
      `<polygon class="${on ? 'on' : ''}" points="${cx},${cy - 8} ${cx + 8},${cy} ${cx},${cy + 8} ${cx - 8},${cy}"/>`;
    return `<svg class="bases" viewBox="0 0 60 46" aria-hidden="true">${d(30, 11, on2)}${d(12, 29, on3)}${d(48, 29, on1)}</svg>`;
  };

  function headHTML(d) {
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
    const th = Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('');
    const tr = (side, t) => `
      <tr><th class="tn">${esc(teamAbbr(t) || (side === 'away' ? '客' : '主'))}</th>
      ${Array.from({ length: n }, (_, i) => `<td>${cell(side, i + 1)}</td>`).join('')}
      <td class="tot">${r(side)}</td><td>${dash(tot[side] && tot[side].hits)}</td><td>${dash(tot[side] && tot[side].errors)}</td></tr>`;

    let sit = '';
    if (st.k === 'live' && (ls.inningState === 'Top' || ls.inningState === 'Bottom')) {
      const off = ls.offense || {}, def = ls.defense || {};
      sit = `<div class="sit">${diamond(!!off.first, !!off.second, !!off.third)}
        <div><div class="cnt">${dash(ls.balls)} 壞 ${dash(ls.strikes)} 好 ${dash(ls.outs)} 出局</div>
        <div class="mu">打者 ${esc((off.batter && off.batter.fullName) || '–')}<br>投手 ${esc((def.pitcher && def.pitcher.fullName) || '–')}</div></div></div>`;
    }
    let extra = '';
    const dec = ld.decisions;
    if (st.k === 'final' && dec) {
      const p = (k, name) => (dec[k] && dec[k].fullName ? `${name} ${esc(dec[k].fullName)}` : '');
      extra = `<div class="dec">${[p('winner', '勝投'), p('loser', '敗投'), p('save', '救援')].filter(Boolean).join('　')}</div>`;
    } else if (st.k === 'upcoming') {
      const pp = gd.probablePitchers || {};
      const ap = pp.away && pp.away.fullName, hp = pp.home && pp.home.fullName;
      if (ap || hp) extra = `<div class="dec">預定先發　${esc(ap || '未定')} vs ${esc(hp || '未定')}</div>`;
    }
    const venue = gd.venue && gd.venue.name;
    const aRuns = tot.away && tot.away.runs, hRuns = tot.home && tot.home.runs;
    const showN = st.k === 'live' || st.k === 'final';
    const dimA = st.k === 'final' && aRuns < hRuns, dimH = st.k === 'final' && hRuns < aRuns;
    const num = (v, dim) => `<b class="${dim ? 'dim' : ''}">${showN ? dash(v != null ? v : 0) : '–'}</b>`;
    const teamBlk = (cls, t, fb) =>
      `<div class="h-team ${cls}">${logo(t, 'hl')}<div class="ab">${esc(teamAbbr(t) || fb)}</div><div class="zn">${esc(teamName(t))}</div></div>`;
    return `
      <div class="hero">
        <div class="h-top"><span class="pill ${st.k}">${esc(st.txt)}</span>
          <span>${esc(fmtTime(gd.datetime && gd.datetime.dateTime))}（台灣時間）${venue ? ' · ' + esc(venue) : ''}</span></div>
        <div class="h-score">
          ${teamBlk('away', aT, '客')}
          <div class="h-nums">${num(aRuns, dimA)}<i>:</i>${num(hRuns, dimH)}</div>
          ${teamBlk('home', hT, '主')}
        </div>
        <div class="scroll"><table class="line"><thead><tr><th></th>${th}<th>R</th><th>H</th><th>E</th></tr></thead>
        <tbody>${tr('away', aT)}${tr('home', hT)}</tbody></table></div>
        ${sit}${extra}
      </div>`;
  }

  /* ---- 文字轉播 ---- */
  const isSubEvent = (e) =>
    !!e && (e.isSubstitution || /substitution|defensive switch/i.test((e.details && e.details.event) || ''));
  const isKey = (p) => {
    const r = p.result || {}, ab = p.about || {};
    return !!ab.isScoringPlay || KEY_EVENTS.includes(r.event) || (p.playEvents || []).some(isSubEvent);
  };


  const PITCH_ZH = { FF: '四縫線速球', SI: '伸卡球', FT: '二縫線速球', FA: '速球', FC: '切球', SL: '滑球', ST: '橫掃球', SV: '大滑球', CU: '曲球', KC: '指節曲球', CS: '慢曲球', CH: '變速球', FS: '指叉球', FO: '指叉球', KN: '蝴蝶球', SC: '螺旋球', EP: '慢速球' };
  function pitchLine(p, zh) {
    const ps = (p.playEvents || []).filter((e) => e && e.isPitch);
    if (!ps.length) return '';
    const last = ps[ps.length - 1];
    const ty = last.details && last.details.type;
    const name = ty ? (zh ? PITCH_ZH[ty.code] || ty.description : ty.description) : '';
    const spd = last.pitchData && last.pitchData.startSpeed;
    const bits = [`${ps.length} ${zh ? '球' : 'pitches'}`];
    if (name) bits.push(`${zh ? '決勝球' : 'Last'} <b>${esc(name)}</b>${spd ? ' ' + Math.round(spd * 10) / 10 + ' mph' : ''}`);
    return `<div class="pitch">${bits.join(' · ')}</div>`;
  }
  function subHTML(e, zh) {
    const d = (e.details && (e.details.description || e.details.event)) || '';
    if (!zh) return `<div class="chg${/pitching change/i.test(d) ? ' pc' : ''}">${esc(d)}</div>`;
    const m = d.match(/^(Pitching Change|Offensive Substitution|Defensive Substitution|Defensive Switch)\s*:\s*(.*)$/i);
    if (!m) return `<div class="chg"><i>換人</i>${esc(d)}</div>`;
    const kind = m[1].toLowerCase(), rest = m[2];
    if (kind === 'pitching change') {
      const mm = rest.match(/^(.*?) replaces (.*?)\.?$/i);
      return `<div class="chg pc"><i>投手換人</i>${mm ? `${esc(mm[1])} 接替 ${esc(mm[2])}` : esc(rest)}</div>`;
    }
    const lab = /pinch-hitter/i.test(rest) ? '代打' : /pinch-runner/i.test(rest) ? '代跑' : kind === 'offensive substitution' ? '攻方換人' : '守備調動';
    return `<div class="chg"><i>${lab}</i>${esc(rest)}</div>`;
  }

  /* 每個打席依結果分類，決定左側色條與標籤：全壘打 > 得分 > 安打 > 出局 > 上壘 */
  const OUT_RE = /out|double play|triple play|grounded into|sac /i;
  const BASE_RE = /walk|hit by pitch|error|interference|fielders choice/i;
  function playCat(p, done) {
    const r = p.result || {}, ab = p.about || {};
    const zh = S.lang === 'zh';
    const ev = r.event || '';
    if (!done) return { cls: 'live', label: zh ? '進行中' : 'LIVE' };
    if (ev === 'Home Run') return { cls: 'hr', label: zh ? '全壘打' : 'HR' };
    if (ab.isScoringPlay) return { cls: 'score', label: zh ? '得分' : 'RUN' };
    if (HIT_EVENTS.includes(ev)) return { cls: 'hit', label: zh ? '安打' : 'HIT' };
    if (OUT_RE.test(ev)) return { cls: 'out', label: zh ? '出局' : 'OUT' };
    if (BASE_RE.test(ev)) return { cls: 'base', label: zh ? '上壘' : 'ON' };
    return { cls: '', label: '' };
  }

  function playHTML(p, gd) {
    const r = p.result || {}, ab = p.about || {}, m = p.matchup || {};
    const bat = (m.batter && m.batter.fullName) || '';
    const pit = (m.pitcher && m.pitcher.fullName) || '';
    const done = ab.isComplete !== false;
    const zh = S.lang === 'zh';
    const aT = gd.teams && gd.teams.away, hT = gd.teams && gd.teams.home;

    let body;
    if (!done) {
      body = zh ? `打擊中　${esc(bat)}（對 ${esc(pit)}）` : `At bat: ${esc(bat)} vs ${esc(pit)}`;
    } else if (zh) {
      const ev = evZh(r.event);
      body = `${esc(bat)} ${HIT_EVENTS.includes(r.event) ? '擊出' : ''}<span class="ev">${esc(ev)}</span>`;
      if (r.rbi) body += `<em>${r.rbi}分打點</em>`;
    } else {
      body = esc(r.description || r.event || '');
    }

    const subEvs = (p.playEvents || []).filter(isSubEvent);
    const subs = subEvs.map((e) => subHTML(e, zh)).join('');
    const pitchRow = done ? pitchLine(p, zh) : '';

    let hit = '';
    const hdEv = [...(p.playEvents || [])].reverse().find((e) => e && e.hitData);
    if (hdEv) {
      const hd = hdEv.hitData;
      const bits = [];
      if (hd.launchSpeed != null) bits.push(`初速 ${hd.launchSpeed} mph`);
      if (hd.launchAngle != null) bits.push(`仰角 ${hd.launchAngle}°`);
      if (hd.totalDistance != null) bits.push(`${hd.totalDistance} ft`);
      if (bits.length) hit = `<div class="hd">${bits.join(' · ')}</div>`;
    }

    const score = ab.isScoringPlay && r.awayScore != null
      ? `<span class="p-score">${esc(teamAbbr(aT))} ${r.awayScore} – ${r.homeScore} ${esc(teamAbbr(hT))}</span>` : '';
    const outs = p.count && p.count.outs != null && done ? `${p.count.outs} 出局` : '';
    const meta = zh && done ? [pit ? `投手 ${esc(pit)}` : '', outs].filter(Boolean).join(' · ') : '';
    const cat = playCat(p, done);
    const cls = ['play', cat.cls, G.open.has(ab.atBatIndex) ? 'open' : ''].filter(Boolean).join(' ');
    const en = zh && done && r.description ? `<div class="en">${esc(r.description)}</div>` : '';
    const top = cat.label || score
      ? `<div class="p-top">${cat.label ? `<span class="tag">${cat.label}</span>` : '<span></span>'}${score}</div>` : '';
    return `<div class="${cls}" data-k="${ab.atBatIndex}">
      ${top}<div class="p-body">${body}</div>${pitchRow}${hit}${subs}${meta ? `<div class="p-meta">${meta}</div>` : ''}${en}</div>`;
  }

  function textHTML(d) {
    const gd = d.gameData || {};
    const all = (d.liveData && d.liveData.plays && d.liveData.plays.allPlays) || [];
    // 以 atBatIndex 去重（同一打席只留最新版本），並依打席順序排列
    const byIdx = new Map();
    all.forEach((p, i) => byIdx.set(p.about && p.about.atBatIndex != null ? p.about.atBatIndex : 'i' + i, p));
    let plays = [...byIdx.values()];
    if (G.filter === 'score') plays = plays.filter((p) => p.about && p.about.isScoringPlay);
    else if (G.filter === 'key') plays = plays.filter(isKey);
    const total = plays.length;
    plays = plays.slice(-G.limit).reverse(); // 最新在最上面，不會和閱讀位置打架
    if (!plays.length) return { html: '<div class="empty">目前沒有符合的事件</div>', total, more: false };

    const aT = gd.teams && gd.teams.away, hT = gd.teams && gd.teams.home;
    let last = '', out = '';
    for (const p of plays) {
      const ab = p.about || {};
      const key = `${ab.inning}-${ab.halfInning}`;
      if (key !== last) {
        last = key;
        const top = /top/i.test(ab.halfInning || '');
        const bt = teamAbbr(top ? aT : hT);
        out += S.lang === 'zh'
          ? `<h3 class="inn">${ab.inning}局${top ? '上' : '下'}<small>${esc(bt)} 進攻</small></h3>`
          : `<h3 class="inn">${top ? 'Top' : 'Bot'} ${ab.inning}<small>${esc(bt)} batting</small></h3>`;
      }
      out += playHTML(p, gd);
    }
    return { html: out, total, more: total > G.limit };
  }

  function renderText(d) {
    const box = $('#plays');
    if (!box) return;
    const { html, total, more } = textHTML(d);
    const full = html + (more ? '<button id="moreBtn" class="more">載入更早的事件</button>' : '');
    if (full === G.sig) return;
    const prevY = window.scrollY, prevH = document.documentElement.scrollHeight;
    box.innerHTML = full;
    G.sig = full;
    // 使用者正在往下看舊內容時，保持原本閱讀位置，並提示有新事件
    if (prevY > 80) {
      window.scrollTo(0, prevY + (document.documentElement.scrollHeight - prevH));
      const added = total - G.lastTotal;
      const chip = $('#newChip');
      if (chip && G.lastTotal && added > 0) {
        chip.textContent = `↑ ${added} 則新事件`;
        chip.hidden = false;
      }
    }
    G.lastTotal = total;
  }

  /* ---- 數據（Boxscore / 賽前打線）---- */
  function boxHTML(d, side) {
    const t = d.liveData && d.liveData.boxscore && d.liveData.boxscore.teams && d.liveData.boxscore.teams[side];
    if (!t) return '<div class="empty">尚無數據</div>';
    const P = t.players || {};
    const get = (id) => P['ID' + id];
    let ids = (t.batters || []).slice();
    const lineupOnly = !ids.length && (t.battingOrder || []).length > 0;
    if (lineupOnly) ids = t.battingOrder.slice();

    const bRows = ids.map(get).filter(Boolean).map((p) => {
      const b = (p.stats && p.stats.batting) || {};
      const played = b.atBats != null || b.plateAppearances != null || lineupOnly;
      if (!played) return '';
      const sub = p.battingOrder && !/00$/.test(String(p.battingOrder));
      const avg = p.seasonStats && p.seasonStats.batting && p.seasonStats.batting.avg;
      const name = esc((p.person && p.person.fullName) || '');
      const pos = esc((p.position && p.position.abbreviation) || '');
      return `<tr class="${sub ? 'sub' : ''}"><th>${name}<small>${pos}</small></th>
        <td>${dash(b.atBats)}</td><td class="k">${dash(b.hits)}</td><td>${dash(b.rbi)}</td><td>${dash(b.runs)}</td>
        <td class="x">${dash(b.baseOnBalls)}</td><td class="x">${dash(b.strikeOuts)}</td><td>${dash(avg)}</td></tr>`;
    }).join('');

    const pRows = (t.pitchers || []).map(get).filter(Boolean).map((p) => {
      const s = (p.stats && p.stats.pitching) || {};
      const era = p.seasonStats && p.seasonStats.pitching && p.seasonStats.pitching.era;
      return `<tr><th>${esc((p.person && p.person.fullName) || '')}</th>
        <td class="k">${dash(s.inningsPitched)}</td><td>${dash(s.hits)}</td><td>${dash(s.earnedRuns)}</td><td>${dash(s.strikeOuts)}</td>
        <td class="x">${dash(s.runs)}</td><td class="x">${dash(s.baseOnBalls)}</td><td class="x">${dash(s.pitchesThrown ?? s.numberOfPitches)}</td><td>${dash(era)}</td></tr>`;
    }).join('');

    return `
      <h3 class="inn">${lineupOnly ? '預定打線' : '打擊'}</h3>
      <div class="scroll"><table class="box${S.boxMore ? ' all' : ''}"><thead><tr><th>打者</th><th>打數</th><th>安打</th><th>打點</th><th>得分</th><th class="x">四壞</th><th class="x">三振</th><th>打擊率</th></tr></thead>
      <tbody>${bRows || '<tr><td colspan="8" class="empty">尚未公布</td></tr>'}</tbody></table></div>
      ${pRows ? `<h3 class="inn">投球</h3>
      <div class="scroll"><table class="box${S.boxMore ? ' all' : ''}"><thead><tr><th>投手</th><th>局數</th><th>被安</th><th>責失</th><th>三振</th><th class="x">失分</th><th class="x">四壞</th><th class="x">球數</th><th>防禦率</th></tr></thead>
      <tbody>${pRows}</tbody></table></div>` : ''}
      <button class="tgl" id="boxMore">${S.boxMore ? '收合欄位' : '更多欄位'}</button>`;
  }

  function renderBody() {
    const body = $('#gBody');
    if (!body || !G.data) return;
    if (G.bodyTab !== S.gtab) {
      G.bodyTab = S.gtab;
      G.sig = '';
      G.lastTotal = 0;
      if (S.gtab === 'text') {
        body.innerHTML = `
          <div class="chips">
            <button data-f="all">全部</button><button data-f="key">重點</button><button data-f="score">得分</button>
          </div><div id="plays"></div>`;
      } else {
        const gd = G.data.gameData || {};
        body.innerHTML = `
          <div class="chips">
            <button data-side="away">${esc(teamName(gd.teams && gd.teams.away))}</button>
            <button data-side="home">${esc(teamName(gd.teams && gd.teams.home))}</button>
          </div><div id="box"></div>`;
      }
    }
    $$('#gTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === S.gtab));
    if (S.gtab === 'text') {
      $$('#gBody [data-f]').forEach((b) => b.classList.toggle('on', b.dataset.f === G.filter));
      renderText(G.data);
    } else {
      $$('#gBody [data-side]').forEach((b) => b.classList.toggle('on', b.dataset.side === G.side));
      const html = boxHTML(G.data, G.side);
      const box = $('#box');
      if (box && html !== G.sig) { box.innerHTML = html; G.sig = html; }
    }
    const lb = $('#langBtn');
    if (lb) lb.style.visibility = S.gtab === 'text' ? 'visible' : 'hidden';
  }

  function renderGame() {
    if (!G || !G.data) return;
    const head = $('#gHead');
    const html = headHTML(G.data);
    if (head && html !== G.headSig) { head.innerHTML = html; G.headSig = html; }
    renderBody();
  }

  function showGame(pk) {
    route$ = 'game';
    setHeader('比賽', true, null);
    const my = token;
    G = { pk, data: null, filter: 'all', side: 'away', limit: 60, sig: '', headSig: '', bodyTab: '', lastTotal: 0, open: new Set() };
    view.innerHTML = `
      <div id="gHead" class="ghead"><div class="loading">載入中…</div></div>
      <div class="seg" id="gTabs"><button data-t="text">文字轉播</button><button data-t="box">數據</button></div>
      <div id="gBody"></div>
      <button id="newChip" class="fab" hidden></button>`;
    window.scrollTo(0, 0);
    poller = createPoller(
      async () => {
        const d = await api(`/api/v1.1/game/${pk}/feed/live`);
        if (my !== token) return;
        G.data = d;
        renderGame();
      },
      () => {
        const st = G.data && G.data.gameData && G.data.gameData.status;
        const k = st ? gameState(st, G.data.liveData && G.data.liveData.linescore).k : 'live';
        if (k === 'live') return 10000;
        if (k === 'upcoming') return 30000;
        return null; // 已結束或延賽：不再輪詢
      }
    );
    poller.start();
  }

  /* ================= 排名 ================= */
  const l10 = (t) => {
    const s = t.records && (t.records.splitRecords || []).find((x) => x.type === 'lastTen');
    return s ? `${s.wins}-${s.losses}` : '–';
  };
  function standRow(t, rank) {
    const c = t.clinchIndicator && CLINCH[t.clinchIndicator];
    return `<tr class="${t.clinchIndicator ? 'po' : ''}"><th><span class="rk">${rank}</span>${esc(teamName(t.team))}${c ? `<i class="cl" title="${c}">${esc(t.clinchIndicator)}</i>` : ''}</th>
      <td>${dash(t.wins)}-${dash(t.losses)}</td><td>${dash(t.winningPercentage)}</td><td>${dash(t.gamesBack)}</td>
      <td>${l10(t)}</td><td>${dash(t.streak && t.streak.streakCode)}</td></tr>`;
  }
  const standTable = (title, rows) => `
    <h3 class="inn">${esc(title)}</h3>
    <div class="scroll"><table class="box stand"><thead><tr><th>球隊</th><th>戰績</th><th>勝率</th><th>勝差</th><th>近10</th><th>連</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;

  function standingsHTML(d) {
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
        out += `<h2 class="grp">${LEAGUE[lg]}</h2>` + standTable('聯盟排名', teams.map((t) => standRow(t, t.leagueRank || '')).join(''));
      }
    }
    const used = Object.keys(CLINCH).filter((k) => recs.some((r) => (r.teamRecords || []).some((t) => t.clinchIndicator === k)));
    if (used.length) out += `<p class="note">${used.map((k) => `<i class="cl">${k}</i> ${CLINCH[k]}`).join('　')}</p>`;
    return out;
  }

  function showStandings() {
    route$ = 'standings';
    setHeader('MLB 排名', false, 'standings');
    const my = token;
    let data = null;
    view.innerHTML = `
      <div class="chips">
        <button data-sv="division">分區</button><button data-sv="league">聯盟</button>
      </div><div id="stand"><div class="loading">載入中…</div></div>`;
    const paint = () => {
      $$('[data-sv]').forEach((b) => b.classList.toggle('on', b.dataset.sv === S.standView));
      if (data) $('#stand').innerHTML = standingsHTML(data);
    };
    G = { repaint: paint };
    paint();
    const season = twDate().slice(0, 4);
    poller = createPoller(
      async () => {
        const d = await api(`/api/v1/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`, { ttl: 60000 });
        if (my !== token) return;
        data = d;
        paint();
      },
      () => 300000
    );
    poller.start();
  }

  /* ================= 外框、主題、路由 ================= */
  /* 標題欄日期：三張小票（前一天 / 目前日期 / 後一天） */
  function segLabel(d, offset) {
    const dl = dayLabel(d);
    const md = (dl.match(/\d+\/\d+/) || [''])[0], wk = (dl.match(/週./) || [''])[0];
    if (offset < 0) return { small: '', name: '‹' };
    if (offset > 0) return { small: '', name: '›' };
    return d === twDate() ? { small: '', name: 'Today' } : { small: '', name: `${md} ${wk}`.trim() };
  }
  function renderSegs() {
    [['#segL', -1], ['#segC', 0], ['#segR', 1]].forEach(([sel, off]) => {
      const d = shiftDate(S.date, off), l = segLabel(d, off), el = $(sel);
      el.querySelector('small').textContent = l.small;
      el.querySelector('b').textContent = l.name;
      el.classList.toggle('today', off === 0 && d === twDate());
    });
    $('#segL').setAttribute('aria-label', '前一天'); $('#segR').setAttribute('aria-label', '後一天');
  }
  /* 長按今天：跳出日曆，點日期直接切換 */
  const calDays = new Map();
  function openCal(sel, onPick) {
    const old = document.getElementById('cal'); if (old) old.remove();
    const today = twDate();
    let y = +sel.slice(0, 4), m = +sel.slice(5, 7); // m: 1-12
    const wrap = document.createElement('div');
    wrap.id = 'cal'; wrap.className = 'cal';
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    const key = () => `${y}-${String(m).padStart(2, '0')}`;
    const loadMonth = async () => {
      const k = key();
      if (calDays.has(k)) return;
      calDays.set(k, null);
      try {
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const d = await api(`/api/v1/schedule?sportId=1&startDate=${shiftDate(k + '-01', -1)}&endDate=${shiftDate(k + '-' + String(last).padStart(2, '0'), 1)}`, { ttl: 6e5 });
        const set = new Set();
        for (const day of d.dates || []) for (const g of day.games || []) {
          const s = g.status && g.status.detailedState;
          if (s === 'Postponed' || s === 'Cancelled') continue;
          set.add(twDate(new Date(g.gameDate)));
        }
        calDays.set(k, set);
        if (document.body.contains(wrap) && key() === k) draw();
      } catch (e) { calDays.delete(k); }
    };
    const draw = () => {
      const has = calDays.get(key()) || new Set();
      const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const pad = (n) => String(n).padStart(2, '0');
      let cells = '';
      for (let i = 0; i < first; i++) cells += '<i></i>';
      for (let d = 1; d <= days; d++) {
        const iso = `${y}-${pad(m)}-${pad(d)}`;
        cells += `<button data-d="${iso}" class="${iso === sel ? 'sel' : ''}${iso === today ? ' now' : ''}${has.has(iso) ? ' hv' : ''}">${d}</button>`;
      }
      wrap.innerHTML = `<div class="cal-bg"></div><div class="cal-box" role="dialog" aria-label="選擇日期">
        <div class="cal-h"><button class="cal-nav" data-m="-1" aria-label="上個月">‹</button><b>${y} 年 ${m} 月</b><button class="cal-nav" data-m="1" aria-label="下個月">›</button></div>
        <div class="cal-w"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
        <div class="cal-g">${cells}</div>
        <div class="cal-lg"><i></i>有比賽</div>
        <button class="cal-t" data-d="${today}">回到今天</button></div>`;
    };
    wrap.addEventListener('click', (e) => {
      if (e.target.classList.contains('cal-bg')) return close();
      const n = e.target.closest('[data-m]');
      if (n) { m += +n.dataset.m; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } draw(); return loadMonth(); }
      const d = e.target.closest('[data-d]');
      if (d) { close(); onPick(d.dataset.d); }
    });
    draw();
    loadMonth();
  }
  /* 左右兩張：前後一天；中間：單擊回到今天、長按（約 0.5 秒）開啟日期選擇器 */
  function bindSegs() {
    const c = $('#segC'), pick = $('#datePick');
    let timer = null, longDone = false;
    const clear = () => { clearTimeout(timer); timer = null; };
    const go = (date) => {
      if (route$ !== 'scores') return;
      S.date = date;
      S.follow = date === twDate();
      route();
    };
    $('#segL').addEventListener('click', () => go(shiftDate(S.date, -1)));
    $('#segR').addEventListener('click', () => go(shiftDate(S.date, 1)));
    const openPicker = () => {
      longDone = true;
      if (route$ !== 'scores') return;
      openCal(S.date, go);
    };
    c.addEventListener('pointerdown', () => { longDone = false; clear(); timer = setTimeout(openPicker, 500); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => c.addEventListener(ev, clear));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('click', () => {
      if (longDone) { longDone = false; return; }
      go(twDate());
    });
    pick.addEventListener('change', () => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(pick.value)) go(pick.value);
    });
  }

  function setHeader(title, isGame, tab) {
    $('#title').textContent = title;
    $('#back').hidden = !isGame;
    $('#ballIc').hidden = isGame;
    $('#langBtn').hidden = !isGame;
    document.body.classList.toggle('ingame', isGame);
    document.body.classList.toggle('nodates', tab !== 'scores');
    if (tab === 'scores') renderSegs();
    $$('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
    document.title = isGame ? 'MLB 文字轉播' : title;
    $('#updated').textContent = '';
  }

  function applyLang() {
    $('#langBtn').textContent = S.lang === 'zh' ? '中' : 'EN';
  }

  function route() {
    stopPoller();
    token++;
    G = null;
    $('#banner').hidden = true;
    const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
    if (name === 'game' && /^\d+$/.test(arg || '')) return showGame(arg);
    if (name === 'standings') return showStandings();
    return showScores();
  }

  function rollover() {
    // 台灣 0:00 換日：停在「今天」的人自動跳到新的一天
    if (S.follow && route$ === 'scores' && twDate() !== S.date) {
      S.date = twDate();
      route();
    }
  }

  function boot() {
    view = $('#view');
    applyLang();
    bindSegs();

    $('#langBtn').onclick = () => {
      S.lang = S.lang === 'zh' ? 'en' : 'zh';
      store.set('lang', S.lang);
      applyLang();
      if (G && G.data) { G.sig = ''; renderGame(); }
    };
    $('#back').onclick = () => {
      location.hash = '#/scores';
    };

    view.addEventListener('click', (e) => {
      const play = e.target.closest('.play');
      if (play && G && G.open && S.lang === 'zh') {
        const k = Number(play.dataset.k);
        if (G.open.has(k)) G.open.delete(k); else G.open.add(k);
        play.classList.toggle('open', G.open.has(k));
        G.sig = '';
        return;
      }
      const b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'prevDay' || b.id === 'nextDay') {
        S.date = shiftDate(S.date, b.id === 'prevDay' ? -1 : 1);
        S.follow = S.date === twDate();
        route();
      } else if (b.dataset.t) {
        S.gtab = b.dataset.t;
        store.set('gtab', S.gtab);
        renderBody();
      } else if (b.dataset.f) {
        G.filter = b.dataset.f;
        G.limit = 60;
        G.sig = '';
        G.lastTotal = 0;
        renderBody();
      } else if (b.dataset.side) {
        G.side = b.dataset.side;
        G.sig = '';
        renderBody();
      } else if (b.dataset.sv) {
        S.standView = b.dataset.sv;
        store.set('standView', S.standView);
        if (G && G.repaint) G.repaint();
      } else if (b.id === 'boxMore') {
        S.boxMore = !S.boxMore;
        store.set('boxMore', S.boxMore);
        G.sig = '';
        renderBody();
      } else if (b.id === 'moreBtn') {
        G.limit += 60;
        G.sig = '';
        renderBody();
      } else if (b.id === 'newChip') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        b.hidden = true;
      }
    });

    addEventListener('scroll', () => {
      const chip = $('#newChip');
      if (chip && !chip.hidden && window.scrollY < 80) chip.hidden = true;
    }, { passive: true });

    addEventListener('hashchange', route);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { rollover(); if (poller) poller.kick(); }
    });
    addEventListener('online', () => poller && poller.kick());
    addEventListener('pageshow', () => poller && poller.kick());
    setInterval(rollover, 20000);

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
    route();
  }

  /* 測試鉤子：node 下可直接驗證純函式，不影響瀏覽器 */
  if (typeof globalThis.__MLB_TEST__ === 'object') {
    Object.assign(globalThis.__MLB_TEST__, { twDate, shiftDate, gameState, cardHTML, evZh, seriesZh, standingsHTML, boxHTML, headHTML, textHTML, S, setG: (g) => { G = g; } });
  } else {
    boot();
  }
})();

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
  async function api(path, opts) {
    if (!S.testMode || !window.MLB_MOCK) return apiReal(path, opts);
    const mk = window.MLB_MOCK;
    const m = mk.handle(path, S.testStart);
    if (m) return m;
    let d;
    try { d = await apiReal(path, opts); } catch (e) { d = /schedule|people/.test(path) ? {} : (() => { throw e; })(); }
    return mk.decorate(path, d, twDate(), S.testStart);
  }
  async function apiReal(path, { ttl = 0, timeout = 12000 } = {}) {
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
      if (u) u.textContent = (S.testMode ? '測試模式 ・ ' : '') + '更新 ' + fmtClock(lastOk);
    } else {
      const ld = document.querySelector('#view .loading');
      if (ld) {
        const off = navigator.onLine === false;
        ld.className = 'errbox';
        ld.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 9a15 15 0 0 1 19 0M5.5 12.5a10.5 10.5 0 0 1 13 0M8.7 16a6 6 0 0 1 6.6 0"/><circle cx="12" cy="19.5" r="1.2"/><path d="M4 4l16 16"/></svg>
          <b>${off ? '目前沒有網路' : '資料載入失敗'}</b>
          <small>${off ? '請確認網路連線後再試一次' : 'MLB 資料暫時連不上，請稍後再試'}</small>
          <button id="retryBtn">重新載入</button>`;
        b.hidden = true;
        return;
      }
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
      kick() { return (!stopped && !busy) ? p.run() : Promise.resolve(); },
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
    standDef: ['division', 'league', 'post', 'bracket'].includes(store.get('standView', 'division')) ? store.get('standView', 'division') : 'division',
    standView: 'division',
    gtab: store.get('gtab', 'text'),
    autoFollow: store.get('autoFollow', false),
    testMode: store.get('testMode', false),
    favs: store.get('favs', []),
    testStart: store.get('testStart', Date.now()),
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

  const seriesLbl = new Map();
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
      <a class="game ${st.k}${[a.team, h.team].some((t) => t && S.favs.includes(t.id)) ? ' fav' : ''}" href="#/game/${g.gamePk}">
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
    if (html !== box._sig) { box.innerHTML = html; box._sig = html; }
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
    const curI = st.k === 'live' ? ls.currentInning || 0 : 0;
    const th = Array.from({ length: n }, (_, i) => `<th class="${i + 1 === curI ? 'cur' : ''}">${i + 1}</th>`).join('');
    const rowCells = (side) => Array.from({ length: n }, (_, i) => {
      const v = cell(side, i + 1);
      return `<td class="${i + 1 === curI ? 'cur' : ''}${v === 0 ? ' z' : ''}${typeof v === 'number' && v > 0 ? ' sc' : ''}">${v}</td>`;
    }).join('');
    const rhe = (side) => `<div class="rw"><b>${r(side)}</b><span>${dash(tot[side] && tot[side].hits)}</span><span>${dash(tot[side] && tot[side].errors)}</span></div>`;
    const lsHTML = `<div class="ls3w"><div class="ls3" data-cur="${curI}">
      <div class="ls-l"><div class="lh"></div><div class="lw">${logo(aT, 'lw')}</div><div class="lw">${logo(hT, 'lw')}</div></div>
      <div class="ls-s"><table class="line"><thead><tr>${th}</tr></thead><tbody><tr>${rowCells('away')}</tr><tr>${rowCells('home')}</tr></tbody></table></div>
      <div class="ls-r"><div class="rh"><span>R</span><span>H</span><span>E</span></div>${rhe('away')}${rhe('home')}</div>
    </div></div>`;

    let extra = '';
    if (st.k === 'upcoming') {
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
        ${lsHTML}
        ${extra}
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
  /* 每球結果：b 壞球 / s 好球 / f 界外 / x 打進場內 */
  const pitchCls = (e) => {
    const d = e.details || {}, c = (d.call && d.call.description) || d.description || '';
    if (d.isInPlay) return 'x';
    if (/foul/i.test(c)) return 'f';
    if (d.isBall) return 'b';
    if (d.isStrike) return 's';
    return 'b';
  };
  const PCALL = { b: '壞球', s: '好球', f: '界外', x: '擊出' };
  function pitchDots(p) {
    const ps = (p.playEvents || []).filter((e) => e && e.isPitch);
    if (!ps.length) return '';
    return `<div class="pd">${ps.map((e, i) => `<i class="${pitchCls(e)}">${i + 1}</i>`).join('')}</div>`;
  }
  function pitchZone(p, zh) {
    const ps = (p.playEvents || []).filter((e) => e && e.isPitch);
    if (!ps.length) return '';
    const pos = ps.filter((e) => e.pitchData && e.pitchData.coordinates && e.pitchData.coordinates.pX != null && e.pitchData.coordinates.pZ != null);
    const first = ps[0].pitchData || {};
    const top = first.strikeZoneTop || 3.5, bot = first.strikeZoneBottom || 1.5;
    const X = (x) => ((x + 2) / 4) * 120, Y = (z) => 150 - (z / 5) * 150;
    const zl = X(-0.708), zr = X(0.708), zt = Y(top), zb = Y(bot);
    const dots = pos.map((e) => {
      const i = ps.indexOf(e) + 1;
      const c = e.pitchData.coordinates;
      return `<g class="zp ${pitchCls(e)}"><circle cx="${X(c.pX).toFixed(1)}" cy="${Y(c.pZ).toFixed(1)}" r="8"/><text x="${X(c.pX).toFixed(1)}" y="${(Y(c.pZ) + 3.5).toFixed(1)}">${i}</text></g>`;
    }).join('');
    const rows = ps.map((e, i) => {
      const ty = e.details && e.details.type;
      const nm = ty ? (zh ? PITCH_ZH[ty.code] || ty.description : ty.description) : '';
      const sp = e.pitchData && e.pitchData.startSpeed;
      const cnt = e.count ? `${e.count.balls}-${e.count.strikes}` : '';
      return `<li><i class="${pitchCls(e)}">${i + 1}</i><span>${esc(nm)}${sp ? ' ' + Math.round(sp * 10) / 10 + ' mph' : ''}</span><em>${PCALL[pitchCls(e)]}${cnt ? ' · ' + cnt : ''}</em></li>`;
    }).join('');
    const svg = pos.length
      ? `<svg class="zone" viewBox="0 0 120 150" aria-hidden="true"><rect x="0" y="0" width="120" height="150" rx="8" class="zbg"/><rect x="${zl.toFixed(1)}" y="${zt.toFixed(1)}" width="${(zr - zl).toFixed(1)}" height="${(zb - zt).toFixed(1)}" class="zbox"/>${dots}</svg>` : '';
    return `<div class="pz">${svg}<ul class="pl2">${rows}</ul></div>`;
  }
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
      ${top}<div class="p-body">${body}</div>${pitchDots(p)}${pitchRow}${hit}${subs}${meta ? `<div class="p-meta">${meta}</div>` : ''}${en}${pitchZone(p, zh)}</div>`;
  }

  function textHTML(d) {
    const gd = d.gameData || {};
    const all = (d.liveData && d.liveData.plays && d.liveData.plays.allPlays) || [];
    // 以 atBatIndex 去重（同一打席只留最新版本），並依打席順序排列
    const byIdx = new Map();
    all.forEach((p, i) => byIdx.set(p.about && p.about.atBatIndex != null ? p.about.atBatIndex : 'i' + i, p));
    const zh0 = S.lang === 'zh';
    let plays = [...byIdx.values()];
    if (G.filter === 'score') plays = plays.filter((p) => p.about && p.about.isScoringPlay);
    else if (G.filter === 'key') plays = plays.filter(isKey);
    const total = plays.length;
    plays = plays.slice(-G.limit).reverse(); // 最新在最上面，不會和閱讀位置打架
    if (!plays.length) return { html: '<div class="empty">目前沒有符合的事件</div>', total, more: false };

    const aT = gd.teams && gd.teams.away, hT = gd.teams && gd.teams.home;
    // 每個半局結束時的比數，用來算「本局得分」與目前比數
    const fullList = [...byIdx.values()];
    const halfEnd = new Map();
    let prevKey = null, prevScore = { a: 0, h: 0 };
    fullList.forEach((q) => {
      const ab = q.about || {}, rr = q.result || {};
      const k = `${ab.inning}-${ab.halfInning}`;
      if (!halfEnd.has(k)) halfEnd.set(k, { from: prevScore, a: prevScore.a, h: prevScore.h, top: /top/i.test(ab.halfInning || '') });
      const e = halfEnd.get(k);
      if (rr.awayScore != null && rr.homeScore != null) { e.a = rr.awayScore; e.h = rr.homeScore; }
      prevScore = { a: e.a, h: e.h };
    });
    let last = '', out = '';
    for (const p of plays) {
      const ab = p.about || {};
      const key = `${ab.inning}-${ab.halfInning}`;
      if (key !== last) {
        last = key;
        const top = /top/i.test(ab.halfInning || '');
        const bt = teamAbbr(top ? aT : hT);
        const he = halfEnd.get(key);
        const runs = he ? (top ? he.a - he.from.a : he.h - he.from.h) : null;
        const na = top ? `<b class="of">${he ? he.a : ''}</b>` : `${he ? he.a : ''}`;
        const nh = top ? `${he ? he.h : ''}` : `<b class="of">${he ? he.h : ''}</b>`;
        const sc = he
          ? `${runs > 0 ? `<em class="rb">+${runs}</em>` : ''}<em class="hs${runs > 0 ? '' : ' al'}">${esc(teamAbbr(aT))} ${na} – ${nh} ${esc(teamAbbr(hT))}</em>` : '';
        out += S.lang === 'zh'
          ? `<h3 class="inn stk">${ab.inning}局${top ? '上' : '下'}<small>${esc(bt)} 進攻</small>${sc}</h3>`
          : `<h3 class="inn stk">${top ? 'Top' : 'Bot'} ${ab.inning}<small>${esc(bt)} batting</small>${sc}</h3>`;
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
        if (S.autoFollow) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          chip.textContent = `↑ ${added} 則新事件`;
          chip.hidden = false;
        }
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

    const more = !!S.boxMore;
    const live = d.gameData && d.gameData.status && d.gameData.status.abstractGameState === 'Live';
    const off = (live && d.liveData && d.liveData.linescore && d.liveData.linescore.offense) || {};
    const curId = off.batter && off.batter.id;
    const deckId = off.onDeck && off.onDeck.id;
    const bRows = ids.map(get).filter(Boolean).map((p) => {
      const b = (p.stats && p.stats.batting) || {};
      const played = b.atBats != null || b.plateAppearances != null || lineupOnly;
      if (!played) return '';
      const sub = p.battingOrder && !/00$/.test(String(p.battingOrder));
      const avg = p.seasonStats && p.seasonStats.batting && p.seasonStats.batting.avg;
      const name = esc((p.person && p.person.fullName) || '');
      const pos = esc((p.position && p.position.abbreviation) || '');
      const hit = Number(b.hits) > 0;
      const bo = String(p.battingOrder || '');
      const ord = bo ? bo[0] : '';
      const pid = p.person && p.person.id;
      const isCur = live && pid != null && pid === curId;
      const isDeck = live && pid != null && pid === deckId;
      const ln = lineupOnly ? '' : `<div class="ln"><span class="${hit ? 'hl' : ''}">${dash(b.atBats)} 打數 ${dash(b.hits)} 安打</span> ・ ${dash(b.rbi)} 打點 ・ ${dash(b.runs)} 得分${more ? ` ・ ${dash(b.baseOnBalls)} 四壞 ・ ${dash(b.strikeOuts)} 三振` : ''}</div>`;
      const tagC = isCur ? '<span class="now">打擊中</span>' : isDeck ? '<span class="dk">下一棒</span>' : '';
      return `<div class="pc${sub ? ' sub' : ''}${!lineupOnly && !hit ? ' z' : ''}${isCur ? ' cur' : ''}"><span class="ord${sub ? ' s' : ''}">${ord}</span><div><div><span class="nm">${name}</span> <span class="ps">${pos}</span>${tagC}</div>${ln}</div><div class="av">${dash(avg)}<small>AVG</small></div></div>`;
    }).join('');

    const pRows = (t.pitchers || []).map(get).filter(Boolean).map((p) => {
      const s = (p.stats && p.stats.pitching) || {};
      const era = p.seasonStats && p.seasonStats.pitching && p.seasonStats.pitching.era;
      return `<div class="pc"><div><div><span class="nm">${esc((p.person && p.person.fullName) || '')}</span></div>
        <div class="ln"><span class="hl">${dash(s.inningsPitched)} 局</span> ・ ${dash(s.hits)} 被安 ・ ${dash(s.earnedRuns)} 責失 ・ ${dash(s.strikeOuts)} 三振${more ? ` ・ ${dash(s.runs)} 失分 ・ ${dash(s.baseOnBalls)} 四壞 ・ ${dash(s.pitchesThrown ?? s.numberOfPitches)} 球` : ''}</div></div><div class="av">${dash(era)}<small>ERA</small></div></div>`;
    }).join('');

    return `
      <h3 class="inn">${lineupOnly ? '預定打線' : '打擊'}</h3>
      <div class="pcs">${bRows || '<div class="empty">尚未公布</div>'}</div>
      ${pRows ? `<h3 class="inn">投球</h3>
      <div class="pcs">${pRows}</div>` : ''}
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
        body.innerHTML = '<div id="box"></div>';
      }
    }
    $$('#gTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === S.gtab));
    if (S.gtab === 'text') {
      $$('#gChips [data-f]').forEach((b) => b.classList.toggle('on', b.dataset.f === G.filter));
      renderText(G.data);
    } else {
      $$('#gChips [data-side]').forEach((b) => b.classList.toggle('on', b.dataset.side === G.side));
      const html = boxHTML(G.data, G.side);
      const box = $('#box');
      if (box && html !== G.sig) { box.innerHTML = html; G.sig = html; }
    }
    const lb = $('#langBtn');
    if (lb) { lb.style.visibility = 'visible'; lb.classList.toggle('off', S.gtab !== 'text'); lb.disabled = S.gtab !== 'text'; }
  }

  function gameHeader(d) {
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
        const bs = `<svg class="lbs" viewBox="0 0 40 30" aria-hidden="true"><rect x="15" y="1" width="10" height="10" transform="rotate(45 20 6)" class="${off.second ? 'on' : ''}"/><rect x="2" y="12" width="10" height="10" transform="rotate(45 7 17)" class="${off.third ? 'on' : ''}"/><rect x="28" y="12" width="10" height="10" transform="rotate(45 33 17)" class="${off.first ? 'on' : ''}"/></svg>`;
        lbEl.innerHTML = `<div class="lm"><b>${S.lang === 'zh' ? '打' : 'AB'} ${esc((off.batter && off.batter.fullName) || '–')}</b><span>${S.lang === 'zh' ? '投' : 'P'} ${esc((def.pitcher && def.pitcher.fullName) || '–')}</span></div>${bs}<div class="lc"><b>${dash(ls.balls)}-${dash(ls.strikes)}</b><span>${dash(ls.outs)} ${S.lang === 'zh' ? '出局' : 'out'}</span></div>`;
      }
    }
    $('#gameRow').innerHTML = `<div class="gstrip">${blk(aT)}<div class="gm">${showN ? `<b class="gn ${st.k}">${run('away')} : ${run('home')}</b>` : '<b class="gn vs">VS</b>'}<small>${esc(st.txt)}</small></div>${blk(hT)}</div>`;
  }
  /* ---- 全壘打煙火（進行中的比賽出現新全壘打時播放，約 3.5 秒，不擋操作）---- */
  function playHR(info) {
    const old = document.getElementById('hrfx'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'hrfx'; el.className = 'hrfx';
    el.innerHTML = `<canvas></canvas><div class="hrx-flash"></div><div class="hrx-w"><div class="hrx-tk"><small>${esc(info.inn)}</small><h2>全壘打！</h2><p>${esc(info.kind)}${info.score ? ' ・ ' + esc(info.score) : ''}</p><small>${esc(info.who)}</small></div></div>`;
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
      if (ts - t0 < 3700) requestAnimationFrame(loop); else el.remove();
    };
    requestAnimationFrame(loop);
  }
  if (typeof window !== 'undefined') window.__playHR = playHR;
  function checkHR(d) {
    const all = (d.liveData && d.liveData.plays && d.liveData.plays.allPlays) || [];
    const hrs = all.filter((p) => p.result && p.result.eventType === 'home_run' && p.about && p.about.isComplete !== false);
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
  function renderGame() {
    if (!G || !G.data) return;
    checkHR(G.data);
    const head = $('#gHead');
    const html = headHTML(G.data);
    if (head && html !== G.headSig) {
      const sc0 = head.querySelector('.ls-s');
      const keep = sc0 ? sc0.scrollLeft : null, prevCur = sc0 ? head.querySelector('.ls3').dataset.cur : null;
      head.innerHTML = html; G.headSig = html;
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

  function showGame(pk) {
    route$ = 'game';
    setHeader('比賽', true, null);
    const my = token;
    G = { pk, data: null, filter: 'all', side: 'away', limit: 60, sig: '', headSig: '', bodyTab: '', lastTotal: 0, open: new Set() };
    view.innerHTML = `
      <div id="liveBar" class="livebar" hidden></div>
      <div id="gHead" class="ghead"><div class="loading">載入中…</div></div>
      <div class="tkw"><div class="tk">
        <div class="seg" id="gTabs"><button data-t="text">文字轉播</button><button data-t="box">數據</button></div>
        <div class="tr"></div>
        <div id="gChips"></div>
      </div></div>
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
    const gb = t.gamesBack;
    const lead = gb === '-' || gb === '0' || gb === '0.0' || gb == null;
    const fav = t.team && S.favs.includes(t.team.id);
    return `<div class="tc${t.clinchIndicator ? ' po' : ''}${fav ? ' rib' : ''}"><span class="wm">${esc(rank)}</span>${logo(t.team, 'tcl')}
      <div><div class="tn">${esc(teamName(t.team))}${c ? `<i class="cl" title="${c}">${esc(t.clinchIndicator)}</i>` : ''}</div>
      <div class="ts">${dash(t.wins)}-${dash(t.losses)} ・ ${dash(t.winningPercentage)}</div></div>
      <div class="tg">${lead ? '領先' : '落後'}${lead ? '' : `<b>${esc(gb)}</b>`}</div></div>`;
  }
  const standTable = (title, rows) => `
    <h3 class="inn">${esc(title)}</h3>
    <div class="tcs">${rows}</div>`;

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

  /* ---- 季後賽 ---- */
  function seriesHTML(s) {
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
    let status;
    if (done) status = `${esc(teamName(lead))} 晉級`;
    else if (live) status = '● 進行中';
    else if (!anyPlayed) status = '尚未開打';
    else status = lead ? `${esc(teamName(lead))} 領先 ${hi}-${lo}` : `戰成 ${hi}-${lo}`;
    const k = live ? 'live' : done ? 'fin' : 'todo';
    const name = esc(seriesZh(g0) || g0.seriesDescription || '');
    const real = (t) => !!(t && TEAMS[t.id]);
    const lost = (t) => done && lead && lead.id !== t.id;
    const side = (t) => `<div class="ptm${lost(t) ? ' l' : ''}"><b>${real(t) ? esc(teamName(t)) : '待定'}</b>${real(t) ? logo(t, 'tcl') : '<span class="pq">?</span>'}</div>`;
    const played = games.filter((g) => gameState(g.status, g.linescore, g.gameDate).k === 'final').length;
    const gNo = Math.min(n, done ? played : played + 1);
    const desc = g0.seriesDescription || '';
    const lgc = /^AL /i.test(desc) ? 'AL' : /^NL /i.test(desc) ? 'NL' : '';
    const abbr = { F: lgc + 'WC', D: lgc + 'DS', L: lgc + 'CS', W: 'WS' }[g0.gameType] || '';
    const stText = live ? '進行中' : status;
    return { k, html: `<div class="ptk ${k}${[A, H].some((t) => S.favs.includes(t.id)) ? ' fav' : ''}"><div class="pth"><span>${name}</span><span>${abbr}</span></div>
      <div class="ptm-row">${side(A)}<div class="pcn"><b class="psb">${wins[A.id]} : ${wins[H.id]}</b><i class="par"></i></div>${side(H)}</div>
      <div class="pinf"><div><small>場次</small><b>G${gNo} / ${n}</b></div><div><small>狀態</small><b>${stText}</b></div><div><small>制度</small><b>${n} 戰 ${need} 勝</b></div></div></div>` };
  }
  function postHTML(d) {
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
  const isRealTeam = (t) => !!(t && TEAMS[t.id]);
  const bkMD = new Intl.DateTimeFormat('zh-TW', { timeZone: TZ, month: 'numeric', day: 'numeric' });
  const BK_ROUND = { F: '外卡賽', D: '分區賽', L: '聯盟冠軍賽', W: '世界大賽' };

  function bkInfo(s) {
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

  function bkRow(t, si, w) {
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

  function bkCard(si, big) {
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
  function bk2Chip(si, d) {
    if (!si) {
      return `<div class="bk2c emp"><span class="bk2n">待定</span><div class="bk2t"><i class="bk2l q">?</i></div><div class="bk2tr"></div><div class="bk2t"><i class="bk2l q">?</i></div></div>`;
    }
    const cls = `bk2c${si.live ? ' live' : ''}${si.done ? ' done' : ''}${si.teamIds.some((id) => S.favs.includes(id)) ? ' fav' : ''}`;
    const row = (t) => {
      const real = isRealTeam(t);
      const st = si.done && real ? (si.winner.id === t.id ? ' w' : ' l') : '';
      const shown = real && (si.played || si.live) ? si.wins[t.id] : '';
      return `<div class="bk2t${st}">${real ? logo(t, 'bk2l') : '<i class="bk2l q">?</i>'}<em>${shown}</em></div>`;
    };
    const tip = `${BK_ROUND[si.type] || ''} ${isRealTeam(si.H) ? teamAbbr(si.H) : '待定'} vs ${isRealTeam(si.A) ? teamAbbr(si.A) : '待定'}`;
    const inner = `<span class="bk2n">${BK_ROUND[si.type] || ''}</span>${row(si.H)}<div class="bk2tr"></div>${row(si.A)}`;
    return si.target
      ? `<a class="${cls}" title="${esc(tip)}" href="#/game/${si.target}">${inner}</a>`
      : `<div class="${cls}" title="${esc(tip)}">${inner}</div>`;
  }

  function bracketHTML(d, first) {
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
    const cell = (x, span) => `<div class="bk2-c" style="grid-column:${span}">${bk2Chip(x)}</div>`;
    let step = 0;
    const dl = () => `style="--d:${(step++ * 0.18).toFixed(2)}s"`;
    let out = `<div class="bk2${first ? ' first' : ''}">
      <div class="bk2-lg"><span>美國聯盟</span><span>國家聯盟</span></div>`;
    if (hasWC) {
      const w = [lgs.AL.wcCol[0], lgs.AL.wcCol[1], lgs.NL.wcCol[0], lgs.NL.wcCol[1]];
      out += `<div class="bk2-row" ${dl()}>${w.map((x, i) => (x ? cell(x, `${i * 2 + 1} / span 2`) : '')).join('')}</div>
      <div class="bk2-row bk2-stem" ${dl()}>${w.map((x, i) => (x ? `<div class="bk2-s" style="grid-column:${i * 2 + 1} / span 2"></div>` : '')).join('')}</div>`;
    }
    const dsCells = [lgs.AL.ds[0], lgs.AL.ds[1], lgs.NL.ds[0], lgs.NL.ds[1]];
    out += `<div class="bk2-row" ${dl()}>${dsCells.map((x, i) => cell(x, `${i * 2 + 1} / span 2`)).join('')}</div>
      <div class="bk2-row bk2-join" ${dl()}><div class="bk2-j" style="grid-column:1 / span 4"></div><div class="bk2-j" style="grid-column:5 / span 4"></div></div>
      <div class="bk2-row" ${dl()}>${cell(lgs.AL.cs, '2 / span 2')}${cell(lgs.NL.cs, '6 / span 2')}</div>
      <div class="bk2-row bk2-join" ${dl()}><div class="bk2-j" style="grid-column:1 / span 8"></div></div>
      <div class="bk2-row bk2-wsr" ${dl()}>${cell(ws, '4 / span 2')}</div>
    </div>`;
    const other = infos.filter((x) => x.lg === '' && x.type !== 'W');
    if (other.length) out += `<h2 class="grp">其他系列賽</h2><div class="bk-ws">${other.map((x) => bkCard(x)).join('')}</div>`;
    return out + '<p class="note">點系列賽縮圖可進入比賽。</p>';
  }

  function paintBracket(box, d, st) {
    const html = bracketHTML(d, !st.sig);
    const sigNow = bracketHTML(d, false);
    if (sigNow === st.sig && box.querySelector('.bk2')) return;
    box.innerHTML = html;
    st.sig = sigNow;
  }

  const favSumHTML = () => (S.favs.length
    ? S.favs.slice(0, 4).map((id) => logo({ id }, 'fsl')).join('') + (S.favs.length > 4 ? `<em>+${S.favs.length - 4}</em>` : '')
    : '<em>尚未選擇</em>');
  function openFavSheet() {
    const old = document.getElementById('favSheet'); if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'favSheet'; wrap.className = 'fsheet';
    const ids = Object.keys(TEAMS).map(Number).sort((x, y) => (ABBR[x] || '').localeCompare(ABBR[y] || ''));
    wrap.innerHTML = `<div class="fs-bg"></div><div class="fs-p" role="dialog" aria-label="選擇最愛球隊"><div class="fs-grab"></div>
      <div class="fs-h"><b>選擇最愛球隊</b><span id="favN"></span><button id="favClear">清除</button></div>
      <div class="fgrid">${ids.map((id) => `<button class="ft${S.favs.includes(id) ? ' on' : ''}" data-ft="${id}" aria-pressed="${S.favs.includes(id)}" aria-label="${esc(teamName({ id }))}">${logo({ id }, 'tcl')}<span>${esc(ABBR[id] || '')}</span></button>`).join('')}</div>
      <button class="fs-done" id="favDone">完成</button></div>`;
    document.body.appendChild(wrap);
    const upd = () => {
      wrap.querySelector('#favN').textContent = S.favs.length ? `已選 ${S.favs.length} 隊` : '';
      wrap.querySelector('#favClear').hidden = !S.favs.length;
    };
    upd();
    const close = () => {
      wrap.classList.remove('show');
      setTimeout(() => wrap.remove(), 200);
      const sum = document.getElementById('favSum'); if (sum) sum.innerHTML = favSumHTML();
    };
    wrap.addEventListener('click', (e) => {
      const ft = e.target.closest('[data-ft]');
      if (ft) {
        const id = Number(ft.dataset.ft);
        S.favs = S.favs.includes(id) ? S.favs.filter((x) => x !== id) : S.favs.concat(id);
        store.set('favs', S.favs);
        ft.classList.toggle('on', S.favs.includes(id));
        ft.setAttribute('aria-pressed', S.favs.includes(id));
        upd();
      } else if (e.target.closest('#favClear')) {
        S.favs = []; store.set('favs', []);
        wrap.querySelectorAll('.ft').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', false); });
        upd();
      } else if (e.target.closest('#favDone') || e.target.classList.contains('fs-bg')) close();
    });
    requestAnimationFrame(() => wrap.classList.add('show'));
  }

  function showSettings() {
    route$ = 'settings';
    setHeader('設定', false, 'settings');
    view.innerHTML = `
      <div class="set">
        <div class="srow stack"><div><b>排名預設檢視</b><small>進入排名頁時先看哪一種</small></div>
          <div class="sch">${[['division', '分區'], ['league', '聯盟'], ['post', '季後賽'], ['bracket', '對戰樹']].map(([k, n]) => `<button data-sv2="${k}" class="${S.standDef === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
        <button class="srow srbtn" id="favOpen"><div><b>我的最愛球隊</b><small>選擇後，比分、排名與季後賽頁會標示這些球隊</small></div><span class="fsum" id="favSum">${favSumHTML()}</span><span class="chev">›</span></button>
        <div class="srow"><div><b>測試模式</b><small>用模擬比賽測試轉播功能（比分頁會多出三場「測試模式」比賽，不影響真實資料）</small></div><button class="sw${S.testMode ? ' on' : ''}" data-set="testMode" role="switch" aria-checked="${S.testMode}"><i></i></button></div>
        ${S.testMode ? '<div class="srow"><div><b>重新開始模擬</b><small>把進行中的模擬比賽重置回第 1 局</small></div><button class="sact" id="testRestart">重新開始</button></div>' : ''}
        <div class="srow"><div><b>更新應用程式</b><small id="verTxt">清除快取並重新載入最新版本</small></div><button class="sact" id="reloadApp">更新</button></div>
      </div>`;
    fetch('sw.js', { cache: 'no-store' }).then((r) => r.text()).then((t) => {
      const m = /VERSION\s*=\s*'([^']+)'/.exec(t);
      const el = $('#verTxt');
      if (m && el) el.textContent = '目前版本 ' + m[1] + '・清除快取並重新載入';
    }).catch(() => {});
    G = null;
  }

  function showStandings() {
    route$ = 'standings';
    S.standView = S.standDef;
    setHeader('MLB 排名', false, 'standings');
    const my = token;
    let data = null;
    view.innerHTML = `
      <div class="chips stt">
        <button data-sv="division">分區</button><button data-sv="league">聯盟</button><button data-sv="post">季後賽</button><button data-sv="bracket">對戰樹</button>
      </div><div id="stand"><div class="loading">載入中…</div></div>`;
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
    G = { repaint: paint };
    paint();
    const season = twDate().slice(0, 4);
    poller = createPoller(
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
    $('#ballIc').hidden = isGame;
    $('#langBtn').hidden = !isGame;
    document.body.classList.toggle('ingame', isGame);
    document.body.classList.remove('nonav');
    $('#gameRow').hidden = !isGame;
    if (!isGame) document.body.classList.remove('haslb');
    if (!isGame) $('#gameRow').innerHTML = '';
    document.body.classList.toggle('nodates', tab !== 'scores');
    if (tab === 'scores') renderSegs();
    $$('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
    document.title = isGame ? 'MLB Live Text' : title;
    $('#updated').textContent = '';
  }

  function applyLang() {
    $('#langBtn').innerHTML = `<span${S.lang === 'zh' ? ' class="on"' : ''}>中</span><span${S.lang === 'zh' ? '' : ' class="on"'}>EN</span>`;
  }

  function route() {
    stopPoller();
    token++;
    G = null;
    $('#banner').hidden = true;
    const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
    if (name === 'game' && /^\d+$/.test(arg || '')) return showGame(arg);
    if (name === 'standings') return showStandings();
    if (name === 'settings') return showSettings();
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
    let toastT = 0;
    const toast = (txt, hold) => {
      let t = document.getElementById('toast');
      if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
      t.textContent = txt; t.classList.add('show');
      clearTimeout(toastT);
      if (hold !== true) toastT = setTimeout(() => t.classList.remove('show'), 1400);
    };
    const manualRefresh = async () => {
      if (route$ !== 'scores') return;
      const ic = $('#ballIc'); if (ic) { ic.classList.remove('pulse'); void ic.offsetWidth; ic.classList.add('pulse'); }
      if (!poller) return;
      cache.clear();
      toast('更新中…', true);
      const u = $('#updated'); if (u) u.textContent = '更新中…';
      try { await poller.kick(); } catch (e) { /* 失敗由橫幅顯示 */ }
      const failed = !$('#banner').hidden || document.querySelector('#view .errbox');
      toast(failed ? '更新失敗，請稍後再試' : '已更新');
    };
    $('#title').onclick = manualRefresh;
    $('#ballIc').onclick = manualRefresh;
    $('#gameRow').onclick = () => {
      location.hash = '#/scores';
    };

    view.addEventListener('click', (e) => {
      if (e.target.closest('#favOpen')) { openFavSheet(); return; }
      const st = e.target.closest('[data-set]');
      if (st) {
        const k = st.dataset.set;
        S[k] = !S[k];
        store.set(k, S[k]);
        if (k === 'testMode') {
          if (S[k]) { S.testStart = Date.now(); store.set('testStart', S.testStart); }
          cache.clear();
          showSettings();
        }
        return;
      }
      if (e.target.closest('#testRestart')) {
        S.testStart = Date.now(); store.set('testStart', S.testStart);
        e.target.closest('#testRestart').textContent = '已重置';
        return;
      }
      const sv2 = e.target.closest('[data-sv2]');
      if (sv2) {
        S.standDef = sv2.dataset.sv2; store.set('standView', S.standDef);
        $$('[data-sv2]').forEach((b) => b.classList.toggle('on', b === sv2));
        return;
      }
      if (e.target.closest('#retryBtn')) {
        const eb = e.target.closest('.errbox');
        if (eb) { eb.className = 'loading'; eb.textContent = '載入中…'; }
        if (poller) poller.kick();
        return;
      }
      if (e.target.closest('#reloadApp')) {
        const done = () => location.reload();
        (async () => {
          try {
            if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((r) => r.unregister())); }
            if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
          } catch (_) {}
          done();
        })();
        return;
      }
      const play = e.target.closest('.play');
      if (play && G && G.open) {
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
      } else if (b.dataset.af) {
        S.autoFollow = !S.autoFollow;
        store.set('autoFollow', S.autoFollow);
        b.classList.toggle('on', S.autoFollow);
        b.setAttribute('aria-checked', String(S.autoFollow));
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

    let lastY = 0;
    addEventListener('scroll', () => {
      const chip = $('#newChip');
      if (chip && !chip.hidden && window.scrollY < 80) chip.hidden = true;
      const y = window.scrollY;
      const dy = y - lastY;
      if (y > 240 && dy > 6) document.body.classList.add('nonav');
      else if (dy < -6 || y <= 240) document.body.classList.remove('nonav');
      if (Math.abs(dy) > 6 || y <= 0) lastY = y;
    }, { passive: true });

    // iOS Safari 會忽略 user-scalable=no：擋掉雙指縮放手勢（雙擊放大由 touch-action: manipulation 處理）
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));
    document.addEventListener('selectstart', (e) => e.preventDefault());

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
    Object.assign(globalThis.__MLB_TEST__, { twDate, shiftDate, gameState, cardHTML, evZh, seriesZh, standingsHTML, bracketHTML, boxHTML, headHTML, textHTML, S, setG: (g) => { G = g; } });
  } else {
    boot();
  }
})();

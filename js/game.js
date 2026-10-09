/* 單場頁：局數表、文字轉播、數據、目前打席條、全壘打動畫 */
import { $, $$, esc, dash, morph } from './util.js';
import { teamName, logo, teamAbbr, HALF, HIT_EVENTS, KEY_EVENTS, evZh } from './dict.js';
import { api, createPoller } from './api.js';
import { S, view, poller, token, G, setRoute, setPoller, setG } from './state.js';
import { gameState, seriesLbl } from './scores.js';
import { setHeader } from './shell.js';
import { pLink, pAttrs } from './player.js';
import { wpPoints, wpHTML, bindWp } from './winprob.js';

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

  let extra = '';
  if (st.k === 'upcoming') {
    const pp = gd.probablePitchers || {};
    const ap = pp.away && pp.away.fullName, hp = pp.home && pp.home.fullName;
    if (ap || hp) extra = `<div class="dec">預定先發　${esc(ap || '未定')} vs ${esc(hp || '未定')}</div>`;
  }
  // 已結束的比賽可以當作直播重播（按鈕由 main.js 處理，重播程式需要時才載入）
  const replay = st.k === 'final' ? '<button class="rp-go" id="rpStart"><span aria-hidden="true">▶</span> 重播這場比賽</button>' : '';
  return `
    <div class="hero">
      ${lsHTML}
      ${extra}
      ${replay}
    </div>`;
}

/* ---- 文字轉播 ---- */
export const isSubEvent = (e) =>
  !!e && (e.isSubstitution || /substitution|defensive switch/i.test((e.details && e.details.event) || ''));
export const isKey = (p) => {
  const r = p.result || {}, ab = p.about || {};
  return !!ab.isScoringPlay || KEY_EVENTS.includes(r.event) || (p.playEvents || []).some(isSubEvent);
};


export const PITCH_ZH = { FF: '四縫線速球', SI: '伸卡球', FT: '二縫線速球', FA: '速球', FC: '切球', SL: '滑球', ST: '橫掃球', SV: '大滑球', CU: '曲球', KC: '指節曲球', CS: '慢曲球', CH: '變速球', FS: '指叉球', FO: '指叉球', KN: '蝴蝶球', SC: '螺旋球', EP: '慢速球' };
/* 每球結果：b 壞球 / s 好球 / f 界外 / x 打進場內 */
export const pitchCls = (e) => {
  const d = e.details || {}, c = (d.call && d.call.description) || d.description || '';
  if (d.isInPlay) return 'x';
  if (/foul/i.test(c)) return 'f';
  if (d.isBall) return 'b';
  if (d.isStrike) return 's';
  return 'b';
};
export const PCALL = { b: '壞球', s: '好球', f: '界外', x: '擊出' };
export function pitchDots(p) {
  const ps = (p.playEvents || []).filter((e) => e && e.isPitch);
  if (!ps.length) return '';
  return `<div class="pd">${ps.map((e, i) => `<i class="${pitchCls(e)}">${i + 1}</i>`).join('')}</div>`;
}
export function pitchZone(p, zh) {
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
    // 兩行：球種／球速＋結果。球速的數字與 mph 之間用不換行空白，窄螢幕只會在球種名稱裡換行
    return `<li><i class="${pitchCls(e)}">${i + 1}</i><div class="pt"><b>${esc(nm)}</b><small>${sp ? `<span>${Math.round(sp * 10) / 10}&nbsp;mph</span>` : ''}<em>${PCALL[pitchCls(e)]}${cnt ? ' · ' + cnt : ''}</em></small></div></li>`;
  }).join('');
  const svg = pos.length
    ? `<svg class="zone" viewBox="0 0 120 150" aria-hidden="true"><rect x="0" y="0" width="120" height="150" rx="8" class="zbg"/><rect x="${zl.toFixed(1)}" y="${zt.toFixed(1)}" width="${(zr - zl).toFixed(1)}" height="${(zb - zt).toFixed(1)}" class="zbox"/>${dots}</svg>` : '';
  return `<div class="pz">${svg}<ul class="pl2">${rows}</ul></div>`;
}
export function pitchLine(p, zh, live) {
  const ps = (p.playEvents || []).filter((e) => e && e.isPitch);
  if (!ps.length) return '';
  const last = ps[ps.length - 1];
  const ty = last.details && last.details.type;
  const name = ty ? (zh ? PITCH_ZH[ty.code] || ty.description : ty.description) : '';
  const spd = last.pitchData && last.pitchData.startSpeed;
  const bits = [`${ps.length} ${zh ? '球' : 'pitches'}`];
  if (name) bits.push(`${zh ? (live ? '上一球' : '決勝球') : (live ? 'Last pitch' : 'Last')} <b>${esc(name)}</b>${spd ? ' ' + Math.round(spd * 10) / 10 + ' mph' : ''}`);
  return `<div class="pitch">${bits.join(' · ')}</div>`;
}
export function subHTML(e, zh) {
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
export const OUT_RE = /out|double play|triple play|grounded into|sac /i;
export const BASE_RE = /walk|hit by pitch|error|interference|fielders choice/i;
export function playCat(p, done) {
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

export function playHTML(p, gd, opt = {}) {
  const r = p.result || {}, ab = p.about || {}, m = p.matchup || {};
  const pit = (m.pitcher && m.pitcher.fullName) || '';
  const done = ab.isComplete !== false;
  const zh = S.lang === 'zh';
  const aT = gd.teams && gd.teams.away, hT = gd.teams && gd.teams.home;

  let body;
  if (!done) {
    body = zh ? `打擊中　${pLink(m.batter, 'b', m.pitcher)}（對 ${pLink(m.pitcher, 'p', m.batter)}）` : `At bat: ${pLink(m.batter, 'b', m.pitcher)} vs ${pLink(m.pitcher, 'p', m.batter)}`;
  } else if (zh) {
    const ev = evZh(r.event);
    body = `${pLink(m.batter, 'b', m.pitcher)} ${HIT_EVENTS.includes(r.event) ? '擊出' : ''}<span class="ev">${esc(ev)}</span>`;
    if (r.rbi) body += `<em>${r.rbi}分打點</em>`;
  } else {
    body = esc(r.description || r.event || '');
  }

  if (opt.live && opt.body) body = opt.body; // LIVE 分頁：打者／投手兩列（含今日成績）取代「打擊中…」
  const subEvs = (p.playEvents || []).filter(isSubEvent);
  const subs = subEvs.map((e) => subHTML(e, zh)).join('');
  const pitchRow = done ? pitchLine(p, zh) : opt.live ? pitchLine(p, zh, true) : '';

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
  const meta = zh && done ? [pit ? `投手 ${pLink(m.pitcher, 'p', m.batter)}` : '', outs].filter(Boolean).join(' · ') : '';
  const cat = playCat(p, done);
  // 進行中的打席自動展開（除非手動收起）；已結束的一律收起（除非手動展開）
  const isOpen = opt.live ? true : done ? G.open.has(ab.atBatIndex) : !(G.shut && G.shut.has(ab.atBatIndex));
  const cls = ['play', cat.cls, isOpen ? 'open' : ''].filter(Boolean).join(' ');
  const en = zh && done && r.description ? `<div class="en">${esc(r.description)}</div>` : '';
  const top = cat.label || score
    ? `<div class="p-top">${cat.label ? `<span class="tag">${cat.label}</span>` : '<span></span>'}${score}</div>` : '';
  return `<div class="${cls}" data-k="${ab.atBatIndex}">
    ${top}<div class="p-body">${body}</div>${pitchDots(p)}${pitchRow}${hit}${subs}${meta ? `<div class="p-meta">${meta}</div>` : ''}${en}${pitchZone(p, zh)}${opt.live && !pitchDots(p) ? `<div class="p-meta">${zh ? '等待第一球' : 'Waiting for the first pitch'}</div>` : ''}</div>`;
}

export function textHTML(d) {
  const gd = d.gameData || {};
  const all = (d.liveData && d.liveData.plays && d.liveData.plays.allPlays) || [];
  // 以 atBatIndex 去重（同一打席只留最新版本），並依打席順序排列
  const byIdx = new Map();
  all.forEach((p, i) => byIdx.set(p.about && p.about.atBatIndex != null ? p.about.atBatIndex : 'i' + i, p));
  let plays = [...byIdx.values()].filter((p) => !(p.about && p.about.isComplete === false)); // 進行中的打席在 LIVE 分頁
  if (G.filter === 'score') plays = plays.filter((p) => p.about && p.about.isScoringPlay);
  else if (G.filter === 'key') plays = plays.filter(isKey);
  const total = plays.length;
  plays = plays.slice(-G.limit).reverse(); // 最新在最上面，不會和閱讀位置打架
  if (!plays.length) return { html: '<div class="empty">目前沒有符合的事件</div>', total, more: false };

  const aT = gd.teams && gd.teams.away, hT = gd.teams && gd.teams.home;
  // 每個半局結束時的比數，用來算「本局得分」與目前比數
  const fullList = [...byIdx.values()];
  const halfEnd = new Map();
  let prevScore = { a: 0, h: 0 };
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

export function renderText(d) {
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
/* ---- LIVE 分頁：目前這個打席（文字轉播只放已結束的打席）---- */
// 從數據中找球員今天的成績（兩隊都找，因為代打、換投後隊伍判斷不一定準）
function todayStat(d, id, group) {
  const teams = (d.liveData && d.liveData.boxscore && d.liveData.boxscore.teams) || {};
  for (const side of ['away', 'home']) {
    const pl = teams[side] && teams[side].players && teams[side].players['ID' + id];
    if (pl) return { stat: (pl.stats && pl.stats[group]) || {}, season: (pl.seasonStats && pl.seasonStats[group]) || {} };
  }
  return null;
}
const batToday = (t) => {
  if (!t) return '';
  const s = t.stat;
  if (!Number(s.plateAppearances) && !Number(s.atBats)) return '今日首打席';
  const bits = [`今日 ${dash(s.atBats)} 打數 ${dash(s.hits)} 安打`];
  if (Number(s.homeRuns) > 0) bits.push(`${s.homeRuns} 全壘打`);
  if (Number(s.rbi) > 0) bits.push(`${s.rbi} 打點`);
  if (Number(s.baseOnBalls) > 0) bits.push(`${s.baseOnBalls} 四壞`);
  if (Number(s.strikeOuts) > 0) bits.push(`${s.strikeOuts} 三振`);
  return bits.join(' ・ ');
};
const pitToday = (t) => {
  if (!t) return '';
  const s = t.stat, n = s.pitchesThrown != null ? s.pitchesThrown : s.numberOfPitches;
  const bits = [];
  if (s.inningsPitched != null) bits.push(`今日 ${s.inningsPitched} 局`);
  if (n != null) bits.push(`用球數 <b>${esc(n)}</b>`);
  if (s.strikeOuts != null) bits.push(`${s.strikeOuts} 三振`);
  return bits.join(' ・ ');
};

// 右側的大數字：打者放打擊率、投手放防禦率。數據裡的 seasonStats 在季後賽是季後賽累計，
// 所以標籤依比賽類型標示（整季數據點名字看球員小卡）；沒有數字（例如還沒投球的 -.--）就顯示灰色的「–」，不留空白
const SEASON_LBL = { R: '本季', S: '春訓', F: '季後賽', D: '季後賽', L: '季後賽', W: '季後賽' };
const seasonNum = (d, t, key, label) => {
  const v = t && t.season && t.season[key];
  const ok = v != null && /\d/.test(String(v));
  const type = d.gameData && d.gameData.game && d.gameData.game.type;
  return `<div class="lv-av${ok ? '' : ' na'}"><b>${ok ? esc(v) : '–'}</b><small>${SEASON_LBL[type] || ''}${SEASON_LBL[type] ? ' ' : ''}${label}</small></div>`;
};

/* ---- 半局回顧：半局之間（還沒有新打席）的 LIVE 分頁顯示剛結束的那個半局 ---- */
// 要回顧哪個半局：換場中是剛結束的那半局；打席之間（半局剛開始、還沒人上場）則是它的前一個半局；開賽前沒有可回顧的
export function recapTarget(ls) {
  const n = (ls && ls.currentInning) || 0, st = ls && ls.inningState;
  if (!n) return null;
  if (st === 'Middle') return { inning: n, top: true };
  if (st === 'End') return { inning: n, top: false };
  if (st === 'Bottom') return { inning: n, top: true };
  if (st === 'Top') return n > 1 ? { inning: n - 1, top: false } : null;
  return null;
}
const isTopHalf = (ab) => (ab.isTopInning != null ? !!ab.isTopInning : /top/i.test(ab.halfInning || ''));

const nameOf = (d, id) => { const x = d.gameData && d.gameData.players && d.gameData.players['ID' + id]; return (x && x.fullName) || ''; };

// 半局裡值得一提的非打席事件；打者暫停、比賽通知、投手踩板、牽制嘗試太吵，不放
const actionKind = (t) => {
  if (/^stolen_base/.test(t)) return 'sb';
  if (/caught_stealing/.test(t)) return 'cs';
  if (/^pickoff_[123]b$/.test(t)) return 'po';
  return { wild_pitch: 'wp', passed_ball: 'pb', balk: 'bk', defensive_indiff: 'di', pitching_substitution: 'pc',
    offensive_substitution: 'os', defensive_substitution: 'ds', defensive_switch: 'ds', mound_visit: 'mv' }[t] || '';
};
const ACT_ZH = { wp: '暴投', pb: '捕逸', bk: '投手犯規', di: '守方未防守進壘', mv: '投手丘會議' };
const ACT_EN = { wp: 'Wild pitch', pb: 'Passed ball', bk: 'Balk', di: 'Defensive indifference', mv: 'Mound visit' };
const ACT_CHIP = { sb: '盜壘', cs: '盜壘失敗', po: '牽制出局', wp: '暴投', pb: '捕逸', bk: '投手犯規', di: '守方未防守進壘', pc: '換投', os: '代打／代跑', ds: '守備調動', mv: '投手丘會議' };

function reviewRow(rv, gd) {
  const t = gd.teams || {};
  const team = t.away && t.away.id === rv.challengeTeamId ? t.away : t.home && t.home.id === rv.challengeTeamId ? t.home : null;
  const res = rv.inProgress ? '審查中' : rv.isOverturned ? '判決推翻' : '維持原判';
  return `<li class="ac"><div>${esc(team ? teamAbbr(team) : '')} 提出${rv.reviewType === 'MJ' ? '好壞球' : ''}挑戰</div><span>${res}</span></li>`;
}

// 依時間順序整理這個半局：每個打席前面先放它進行中發生的事件（盜壘、牽制、換人…），再放打席結果
function halfRows(d, ps, zh) {
  const gd = d.gameData || {};
  const rows = [], kinds = [], reviews = [];
  // 投手丘會議常常一個半局好幾次，只放一列（在第一次出現的位置）並標次數
  const mvN = ps.reduce((n, p) => n + (p.playEvents || []).filter((e) => e && !e.isPitch && e.details && e.details.eventType === 'mound_visit').length, 0);
  let mvDone = false;
  ps.forEach((p) => {
    let reviewed = false;
    (p.playEvents || []).forEach((e) => {
      if (!e) return;
      if (e.reviewDetails) { reviewed = true; reviews.push(e.reviewDetails); rows.push({ html: reviewRow(e.reviewDetails, gd), ev: true }); }
      if (e.isPitch) return;
      const det = e.details || {};
      const k = actionKind(det.eventType || '');
      if (!k) return;
      kinds.push(k);
      if (k === 'pc' || k === 'os' || k === 'ds') { rows.push({ html: `<li class="ev">${subHTML(e, zh)}</li>`, ev: true }); return; }
      if (k === 'mv') {
        if (!mvDone) { mvDone = true; rows.push({ html: `<li class="ac"><div>${zh ? ACT_ZH.mv : ACT_EN.mv}${mvN > 1 ? ` ×${mvN}` : ''}</div></li>`, ev: true }); }
        return;
      }
      const who = e.player && e.player.id ? { id: e.player.id, fullName: nameOf(d, e.player.id) } : null;
      const left = who && who.fullName ? pLink(who, 'b') : '';
      const label = k === 'sb' || k === 'cs' || k === 'po' ? (zh ? evZh(det.event) : det.description || det.event || '') : zh ? ACT_ZH[k] : ACT_EN[k];
      // 暴投、捕逸等的英文說明講得出誰得分、誰進壘，放在下面一行
      const note = (k === 'wp' || k === 'pb' || k === 'bk' || k === 'di') && det.description ? `<small>${esc(det.description)}</small>` : '';
      rows.push({ html: `<li class="ac"><div>${left}</div><span>${esc(label)}</span>${note}</li>`, ev: true });
    });
    if (!reviewed && p.reviewDetails) { reviews.push(p.reviewDetails); rows.push({ html: reviewRow(p.reviewDetails, gd), ev: true }); }
    const m = p.matchup || {}, r = p.result || {};
    const cat = playCat(p, true).cls;
    const dp = /Double Play|Triple Play|Grounded Into DP/.test(r.event || '');
    const res = zh ? evZh(r.event) : (r.event || '');
    rows.push({
      html: `<li${cat === 'hr' || cat === 'score' ? ' class="hot"' : ''}><div>${pLink(m.batter, 'b', m.pitcher)}</div><span>${esc(res)}${r.rbi ? `<em>${r.rbi}分打點</em>` : ''}</span></li>`,
      ab: true, out: cat === 'out' && !dp,
    });
  });
  return { rows, kinds, reviews };
}

const scoreOf = (list) => {
  const r = (list.slice().reverse().find((p) => p.result && p.result.awayScore != null && p.result.homeScore != null) || {}).result;
  return r ? { a: r.awayScore, h: r.homeScore } : null;
};

export function recapHTML(d, tgt, waiting) {
  const ls = (d.liveData && d.liveData.linescore) || {};
  const gd = d.gameData || {};
  const zh = S.lang === 'zh';
  const status = waiting ? '等待下一個打席' : '換場中';
  if (!tgt) {
    const st = ls.currentInning ? `${ls.currentInning}局${HALF[ls.inningState] || ''}` : '比賽即將開始';
    return `<div class="lv-wait"><b>${esc(st)}</b><span>等待第一個打席</span></div>`;
  }
  const all = ((d.liveData && d.liveData.plays && d.liveData.plays.allPlays) || []).filter((p) => p.about && p.about.isComplete !== false);
  const inHalf = (p) => p.about.inning === tgt.inning && isTopHalf(p.about) === tgt.top;
  const ps = all.filter(inHalf);
  const aT = gd.teams && gd.teams.away, hT = gd.teams && gd.teams.home;
  const bat = teamAbbr(tgt.top ? aT : hT);
  const inn = (ls.innings || [])[tgt.inning - 1];
  const line = (inn && inn[tgt.top ? 'away' : 'home']) || {};
  // 半局結束時的比數：取到這個半局為止、最近一個有記錄比數的打席（沒得分的打席不一定帶比數）
  const after = scoreOf(all.filter((p) => p.about.inning < tgt.inning || (p.about.inning === tgt.inning && (!tgt.top || isTopHalf(p.about)))));
  const before = scoreOf(all.filter((p) => p.about.inning < tgt.inning || (p.about.inning === tgt.inning && !tgt.top && isTopHalf(p.about)))) || { a: 0, h: 0 };
  const score = after ? `<span class="rc-s">${esc(teamAbbr(aT))} ${after.a} – ${after.h} ${esc(teamAbbr(hT))}</span>` : '';
  const runs = Number(line.runs) || 0, hits = Number(line.hits) || 0, lob = Number(line.leftOnBase) || 0;
  const { rows, kinds, reviews } = halfRows(d, ps, zh);

  // ---- 這個半局的重點標籤：依實際發生的事決定，不是固定格式 ----
  const chips = [];
  const hot = (t) => chips.push({ t, hot: true });
  const tag = (t) => chips.push({ t });
  const cnt = (re) => ps.filter((p) => re.test((p.result && p.result.event) || '')).length;
  const diff = (x) => (tgt.top ? x.a - x.h : x.h - x.a);
  if (runs > 0 && after) {
    const b = diff(before), a = diff(after);
    hot(a > 0 && b < 0 ? '反超比數' : a > 0 && b === 0 ? '取得領先' : a === 0 && b < 0 ? '追平比數' : b > 0 ? '擴大領先' : '追近比數');
  }
  const hrs = ps.filter((p) => p.result && p.result.event === 'Home Run');
  if (hrs.length === 1) hot(['', '陽春砲', '兩分砲', '三分砲', '滿貫砲'][Math.min(hrs[0].result.rbi || 1, 4)]);
  else if (hrs.length > 1) hot(`全壘打 ×${hrs.length}`);
  const tp = cnt(/Triple Play/), dp = cnt(/Double Play|Grounded Into DP/) - tp;
  if (tp) tag('三殺');
  if (dp) tag(dp > 1 ? `雙殺 ×${dp}` : '雙殺');
  const ks = cnt(/Strikeout/);
  const allOut = ps.length > 0 && ps.every((p) => playCat(p, true).cls === 'out');
  const quiet = allOut && !kinds.length && !reviews.length && runs === 0 && hits === 0;
  if (quiet && ps.length === 3) tag('三上三下');
  if (ks === 3 && ps.length === 3) tag('三者三振');
  else if (ks >= 2) tag(`三振 ×${ks}`);
  const er = cnt(/Error/);
  if (er) tag(er > 1 ? `失誤 ×${er}` : '失誤');
  const wk = cnt(/Walk|Hit By Pitch/);
  if (wk >= 2) tag(`保送 ×${wk}`);
  Object.keys(ACT_CHIP).forEach((k) => { const n = kinds.filter((x) => x === k).length; if (n) tag(n > 1 ? `${ACT_CHIP[k]} ×${n}` : ACT_CHIP[k]); });
  if (reviews.length) tag(reviews.length > 1 ? `挑戰 ×${reviews.length}` : '挑戰');
  if (runs === 0 && lob >= 2) tag(`殘壘 ${lob} 人`);
  const chipHTML = chips.slice(0, 5).map((c) => `<span${c.hot ? ' class="hot"' : ''}>${esc(c.t)}</span>`).join('');

  // 打席很多的半局只留重點：出局的打席收成一行
  let shown = rows, hidden = 0;
  if (ps.length > 6) { shown = rows.filter((r) => !r.out); hidden = rows.length - shown.length; }
  const list = shown.map((r) => r.html).join('') + (hidden ? `<li class="more">另有 ${hidden} 個出局的打席</li>` : '');
  const cells = [['得分', line.runs], ['安打', line.hits], ['殘壘', line.leftOnBase]].filter(([, v]) => v != null)
    .map(([k, v]) => `<div><b>${esc(v)}</b><small>${k}</small></div>`).join('');
  // 這個半局的投手與用球數（依出場順序）
  const pit = new Map();
  ps.forEach((p) => {
    const x = p.matchup && p.matchup.pitcher;
    if (!x || !x.fullName) return;
    const cur = pit.get(x.fullName) || { who: x, n: 0 };
    cur.n += (p.playEvents || []).filter((e) => e && e.isPitch).length;
    pit.set(x.fullName, cur);
  });
  const pits = [...pit.values()].map((o) => `${pLink(o.who, 'p')}${o.n ? `（${o.n} 球）` : ''}`).join('、');
  if (!rows.length && !cells) {
    return `<div class="lv-wait"><b>${esc(`${tgt.inning}局${tgt.top ? '上' : '下'}`)}</b><span>${status}</span></div>`;
  }
  return `<div class="lv-rc${quiet ? ' quiet' : ''}">
    <div class="rc-h"><div><b>${tgt.inning}局${tgt.top ? '上' : '下'} 回顧</b><small>${esc(bat)} 進攻・${status}</small></div>${runs > 0 ? `<span class="rc-r">+${runs}</span>` : ''}${score}</div>
    ${chipHTML ? `<div class="rc-t">${chipHTML}</div>` : ''}
    ${cells && !quiet ? `<div class="rc-g">${cells}</div>` : ''}
    ${list ? `<ul class="rc-l">${list}</ul>` : ''}
    ${pits ? `<p class="rc-p">投手　${pits}</p>` : ''}
  </div>`;
}

export function liveHTML(d) {
  const ls = (d.liveData && d.liveData.linescore) || {};
  const plays = (d.liveData && d.liveData.plays) || {};
  const all = plays.allPlays || [];
  const cur = plays.currentPlay && plays.currentPlay.about && plays.currentPlay.about.isComplete === false
    ? plays.currentPlay
    : all.slice().reverse().find((p) => p.about && p.about.isComplete === false);
  const half = ls.inningState === 'Top' || ls.inningState === 'Bottom';
  if (!cur || !half) return recapHTML(d, recapTarget(ls), half); // 半局之間：回顧剛結束的半局
  const m = cur.matchup || {};
  const bat = m.batter || {}, pit = m.pitcher || {};
  const bt = todayStat(d, bat.id, 'batting'), pt = todayStat(d, pit.id, 'pitching');
  const who = `<div class="lv-who">
      <div class="lv-p"><i>打</i><div class="lv-n">${pLink(bat, 'b', pit)}<small>${batToday(bt)}</small></div>${seasonNum(d, bt, 'avg', 'AVG')}</div>
      <div class="lv-p"><i>投</i><div class="lv-n">${pLink(pit, 'p', bat)}<small>${pitToday(pt)}</small></div>${seasonNum(d, pt, 'era', 'ERA')}</div>
    </div>`;
  return playHTML(cur, d.gameData || {}, { live: true, body: who });
}

export function boxHTML(d, side) {
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
    return `<div class="pc${sub ? ' sub' : ''}${!lineupOnly && !hit ? ' z' : ''}${isCur ? ' cur' : ''}"${pAttrs(p.person, 'b')}><span class="ord${sub ? ' s' : ''}">${ord}</span><div><div><span class="nm">${name}</span> <span class="ps">${pos}</span>${tagC}</div>${ln}</div><div class="av">${dash(avg)}<small>AVG</small></div></div>`;
  }).join('');

  const pRows = (t.pitchers || []).map(get).filter(Boolean).map((p) => {
    const s = (p.stats && p.stats.pitching) || {};
    const era = p.seasonStats && p.seasonStats.pitching && p.seasonStats.pitching.era;
    return `<div class="pc"${pAttrs(p.person, 'p')}><div><div><span class="nm">${esc((p.person && p.person.fullName) || '')}</span></div>
      <div class="ln"><span class="hl">${dash(s.inningsPitched)} 局</span> ・ ${dash(s.hits)} 被安 ・ ${dash(s.earnedRuns)} 責失 ・ ${dash(s.strikeOuts)} 三振${more ? ` ・ ${dash(s.runs)} 失分 ・ ${dash(s.baseOnBalls)} 四壞 ・ ${dash(s.pitchesThrown ?? s.numberOfPitches)} 球` : ''}</div></div><div class="av">${dash(era)}<small>ERA</small></div></div>`;
  }).join('');

  return `
    <h3 class="inn">${lineupOnly ? '預定打線' : '打擊'}</h3>
    <div class="pcs">${bRows || '<div class="empty">尚未公布</div>'}</div>
    ${pRows ? `<h3 class="inn">投球</h3>
    <div class="pcs">${pRows}</div>` : ''}
    <button class="tgl" id="boxMore">${S.boxMore ? '收合欄位' : '更多欄位'}</button>`;
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

export function renderBody() {
  const body = $('#gBody');
  if (!body || !G.data) return;
  // LIVE 分頁只在比賽進行中出現；選了 LIVE 但比賽沒在進行時，先顯示文字轉播（偏好保留，下次進行中再切回）
  const gs = G.data.gameData && G.data.gameData.status;
  const isLive = !!gs && gameState(gs, G.data.liveData && G.data.liveData.linescore).k === 'live';
  const lvBtn = $('#gTabs [data-t="live"]');
  if (lvBtn) lvBtn.hidden = !isLive;
  const tab = S.gtab === 'live' && !isLive ? 'text' : S.gtab;
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
  setHeader('比賽', true, null);
  const my = token;
  setG({ pk, data: null, filter: 'all', side: 'away', limit: 60, sig: '', headSig: '', bodyTab: '', lastTotal: 0, open: new Set(), shut: new Set() });
  view.innerHTML = `
    <div id="liveBar" class="livebar" hidden></div>
    <div id="gHead" class="ghead"><div class="loading">載入中…</div></div>
    <div class="tkw${S.gFold ? ' fold' : ''}" id="gCtl"><div class="tk">
      <div class="seg" id="gTabs"><button data-t="text">文字轉播</button><button data-t="box">數據</button><button data-t="live" class="lv-tab" hidden>LIVE</button></div>
      <div class="tr"></div>
      <div id="gChips"></div>
    </div><button class="fbt" id="gFold" aria-label="收合或展開工具列"><span class="fl lc">收合</span><span class="fl lm">更多</span><svg viewBox="0 0 16 10" aria-hidden="true"><path d="M2 8l6-6 6 6"/></svg></button></div>
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

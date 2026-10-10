/* LIVE 分頁：目前這個打席，以及半局之間的「半局回顧」 */
import { esc, dash } from './util.js';
import { teamAbbr, HALF, evZh } from './dict.js';
import { S } from './state.js';
import { pLink } from './player.js';
import { playHTML, playCat, subHTML } from './plays.js';

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

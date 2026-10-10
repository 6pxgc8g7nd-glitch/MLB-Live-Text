/* 文字轉播：打席卡（投球圓點、好球帶、動畫鈕）、依結果分類、換人說明，以及文字轉播列表的渲染 */
import { $, esc } from './util.js';
import { teamAbbr, HIT_EVENTS, KEY_EVENTS, evZh } from './dict.js';
import { S, G } from './state.js';
import { pLink } from './player.js';
import { PITCH_ZH, pitchCls, PCALL } from './pitches.js';

/* ---- 文字轉播 ---- */
export const isSubEvent = (e) =>
  !!e && (e.isSubstitution || /substitution|defensive switch/i.test((e.details && e.details.event) || ''));
export const isKey = (p) => {
  const r = p.result || {}, ab = p.about || {};
  return !!ab.isScoringPlay || KEY_EVENTS.includes(r.event) || (p.playEvents || []).some(isSubEvent);
};


export function pitchDots(p, zh = true) {
  const ps = (p.playEvents || []).filter((e) => e && e.isPitch);
  if (!ps.length) return '';
  const can = p.about && p.about.atBatIndex != null && ps.some((e) => e.pitchData && e.pitchData.coordinates && e.pitchData.coordinates.vY0 != null);
  const play = can ? `<button class="anb" data-an="${p.about.atBatIndex}" aria-label="${zh ? '動畫重現這個打席' : 'Animate this at-bat'}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z"/></svg>${zh ? '動畫' : 'Play'}</button>` : '';
  return `<div class="pd">${ps.map((e, i) => `<i class="${pitchCls(e)}">${i + 1}</i>`).join('')}${play}</div>`;
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
    ${top}<div class="p-body">${body}</div>${pitchDots(p, zh)}${pitchRow}${hit}${subs}${meta ? `<div class="p-meta">${meta}</div>` : ''}${en}${pitchZone(p, zh)}${opt.live && !pitchDots(p) ? `<div class="p-meta">${zh ? '等待第一球' : 'Waiting for the first pitch'}</div>` : ''}</div>`;
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

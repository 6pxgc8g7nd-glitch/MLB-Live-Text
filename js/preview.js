/* 賽前資訊：比賽還沒開打時，文字轉播與數據分頁顯示預定先發投手（含本季成績）、球場與天氣、預定打線 */
import { esc, dash } from './util.js';
import { api } from './api.js';
import { teamName, logo } from './dict.js';
import { G } from './state.js';
import { pLink, pickStat } from './player.js';

const COND = { Clear: '晴', Sunny: '晴朗', 'Partly Cloudy': '局部多雲', Cloudy: '多雲', Overcast: '陰', Rain: '雨', Drizzle: '毛毛雨', Snow: '雪', 'Roof Closed': '屋頂關閉', Dome: '室內球場' };
const FIELD = { LF: '左外野', CF: '中外野', RF: '右外野' };
const HAND = { R: '右投', L: '左投', S: '左右開弓' };

// 風：「8 mph, Out To CF」→「8 mph・往中外野吹」；看不懂的方向就照原文
export function windZh(w) {
  if (!w) return '';
  const m = String(w).match(/^\s*(\d+)\s*mph\s*,?\s*(.*)$/i);
  if (!m) return /calm|none/i.test(w) ? '無風' : String(w);
  const dir = m[2].trim();
  let t = dir;
  let x;
  if ((x = dir.match(/^Out To (LF|CF|RF)$/i))) t = `往${FIELD[x[1].toUpperCase()]}吹`;
  else if ((x = dir.match(/^In From (LF|CF|RF)$/i))) t = `從${FIELD[x[1].toUpperCase()]}吹向本壘`;
  else if (/^L To R$/i.test(dir)) t = '由左向右';
  else if (/^R To L$/i.test(dir)) t = '由右向左';
  else if (/^(Calm|None|)$/i.test(dir)) t = '';
  return Number(m[1]) === 0 ? '無風' : `${m[1]} mph${t ? '・' + t : ''}`;
}

// 天氣：「72°F（22°C） 晴 風 8 mph・往中外野吹」；沒有資料（室內球場常見）回傳空字串
export function weatherZh(w) {
  if (!w || (!w.condition && !w.temp && !w.wind)) return '';
  const f = Number(w.temp), temp = Number.isFinite(f) && w.temp !== '' && w.temp != null ? `${Math.round(f)}°F（${Math.round(((f - 32) * 5) / 9)}°C）` : '';
  const wind = windZh(w.wind);
  return [temp, COND[w.condition] || w.condition || '', wind ? '風 ' + wind : ''].filter(Boolean).join('\u3000');
}

function pitcherCard(d, side, stats) {
  const gd = d.gameData || {}, t = (gd.teams && gd.teams[side]) || {};
  const pp = gd.probablePitchers && gd.probablePitchers[side];
  const head = `<div class="pre-t">${logo(t, 'gl')}<small>${esc(teamName(t))}</small></div>`;
  if (!pp || !pp.id) return `<div class="pre-p">${head}<div class="pre-n">先發投手未定</div></div>`;
  const pl = (gd.players && gd.players['ID' + pp.id]) || {};
  const meta = [HAND[pl.pitchHand && pl.pitchHand.code], pl.primaryNumber ? '#' + pl.primaryNumber : ''].filter(Boolean).join('\u3000');
  const s = stats && stats[pp.id];
  const cells = s
    ? [['勝-敗', s.wins != null ? `${s.wins}-${s.losses}` : null], ['防禦率', s.era], ['局數', s.inningsPitched], ['三振', s.strikeOuts]]
    : [];
  return `<div class="pre-p">${head}<div class="pre-n">${pLink({ id: pp.id, fullName: pp.fullName }, 'p')}</div>${meta ? `<div class="pre-m">${esc(meta)}</div>` : ''}
    ${cells.length ? `<div class="pre-g">${cells.map(([k, v]) => `<div><b>${esc(dash(v))}</b><small>${k}</small></div>`).join('')}</div>` : stats === undefined ? '<div class="pre-m">本季成績載入中…</div>' : '<div class="pre-m">本季尚無成績</div>'}</div>`;
}

function lineup(d, side) {
  const gd = d.gameData || {}, t = (gd.teams && gd.teams[side]) || {};
  const bt = d.liveData && d.liveData.boxscore && d.liveData.boxscore.teams && d.liveData.boxscore.teams[side];
  const ids = (bt && bt.battingOrder) || [];
  const P = (bt && bt.players) || {};
  const rows = ids.map((id, i) => {
    const p = P['ID' + id] || {};
    return `<li><i>${i + 1}</i>${pLink(p.person || { id }, 'b')}<span>${esc((p.position && p.position.abbreviation) || '')}</span></li>`;
  }).join('');
  return `<div class="pre-l"><div class="pre-t">${logo(t, 'gl')}<small>${esc(teamName(t))}</small></div>${rows ? `<ol>${rows}</ol>` : '<div class="pre-m">打線尚未公布<br>通常在開賽前約 2 小時公布</div>'}</div>`;
}

// stats：{ 投手 id: 本季成績 }；undefined 表示還在載入
export function preGameHTML(d, stats) {
  const gd = d.gameData || {};
  const wx = weatherZh(gd.weather), venue = gd.venue && gd.venue.name;
  const info = [venue ? `<div><small>球場</small><b>${esc(venue)}</b></div>` : '', `<div><small>天氣</small><b>${wx ? esc(wx) : '尚無資料'}</b></div>`].join('');
  return `<h3 class="inn">預定先發投手</h3>
    <div class="pre-row">${pitcherCard(d, 'away', stats)}${pitcherCard(d, 'home', stats)}</div>
    <h3 class="inn">球場與天氣</h3><div class="pre-info">${info}</div>
    <h3 class="inn">預定打線</h3>
    <div class="pre-row">${lineup(d, 'away')}${lineup(d, 'home')}</div>`;
}

// 先發投手的本季成績：兩人合成一次請求；失敗就不再重試（面板顯示「本季尚無成績」），資料回來後呼叫 onUpdate 重畫
export function ensurePre(d, onUpdate) {
  const pp = (d.gameData && d.gameData.probablePitchers) || {};
  const ids = [pp.away && pp.away.id, pp.home && pp.home.id].filter(Boolean);
  if (!ids.length) return;
  const key = ids.join(',');
  const pre = G.pre || (G.pre = { key: '', stats: undefined });
  if (pre.key === key) return;
  pre.key = key;
  api(`/api/v1/people?personIds=${key}&hydrate=stats(group=[pitching],type=[season])`, { ttl: 6e5 }).then((r) => {
    const out = {};
    ((r && r.people) || []).forEach((p) => { const s = pickStat(p.stats, 'season', 'pitching'); if (s) out[p.id] = s.stat; });
    pre.stats = out; onUpdate();
  }).catch(() => { pre.stats = {}; onUpdate(); });
}

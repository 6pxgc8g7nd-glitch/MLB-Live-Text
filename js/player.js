/* 球員小卡：點文字轉播、目前打席條或數據頁的球員名字，從下方滑出本季／生涯數據與打者對投手的對戰紀錄 */
import { esc, dash } from './util.js';
import { logo } from './dict.js';
import { api } from './api.js';

const POS_ZH = {
  P: '投手', C: '捕手', '1B': '一壘手', '2B': '二壘手', '3B': '三壘手', SS: '游擊手',
  LF: '左外野手', CF: '中外野手', RF: '右外野手', OF: '外野手', IF: '內野手', DH: '指定打擊', TWP: '二刀流',
};
const HAND = { L: '左', R: '右' };

// 可點的球員名字；opp 是對戰的另一方（打者對投手），沒有就不顯示對戰紀錄
export const pLink = (person, role, opp) => {
  const nm = esc((person && person.fullName) || '');
  if (!person || !person.id || !nm) return nm;
  const vs = opp && opp.id ? ` data-vs="${opp.id}" data-vsn="${esc(opp.fullName || '')}"` : '';
  // 用行內 span 而非 button：長名字在目前打席條才能照原樣以「…」截斷
  return `<span class="pl-n" role="button" tabindex="0" data-player="${person.id}" data-role="${role}"${vs}>${nm}</span>`;
};

// 季中被交易的球員會有多筆 split（各隊＋合計），優先取沒有 team 的合計那筆
export function pickStat(stats, type, group) {
  const s = (stats || []).find((x) => x.type && x.type.displayName === type && x.group && x.group.displayName === group);
  const sp = (s && s.splits) || [];
  const hit = sp.find((x) => !x.team) || sp[sp.length - 1];
  return hit ? { stat: hit.stat || {}, season: hit.season } : null;
}

const cells = (list) => `<div class="pcd-g">${list.map(([k, v]) => `<div><b>${esc(dash(v))}</b><small>${k}</small></div>`).join('')}</div>`;
const hitCells = (s) => cells([['出賽', s.gamesPlayed], ['打擊率', s.avg], ['全壘打', s.homeRuns], ['打點', s.rbi], ['盜壘', s.stolenBases], ['OPS', s.ops]]);
const pitCells = (s) => cells([['出賽', s.gamesPlayed], ['勝-敗', s.wins != null ? `${s.wins}-${s.losses}` : null], ['防禦率', s.era], ['局數', s.inningsPitched], ['三振', s.strikeOuts], ['WHIP', s.whip]]);

function vsLine(v) {
  if (!v) return '';
  const s = v.stat || {};
  const pa = Number(s.plateAppearances || 0) || Number(s.atBats || 0) + Number(s.baseOnBalls || 0);
  if (!pa) return '<p class="pcd-vs">兩人生涯首次對戰</p>';
  const bits = [`${dash(s.atBats)} 打數 ${dash(s.hits)} 安打`];
  if (Number(s.homeRuns) > 0) bits.push(`${s.homeRuns} 全壘打`);
  if (Number(s.baseOnBalls) > 0) bits.push(`${s.baseOnBalls} 四壞`);
  bits.push(`${dash(s.strikeOuts)} 三振`);
  return `<p class="pcd-vs">${bits.join(' ・ ')}${s.avg ? `<b>${esc(s.avg)}</b>` : ''}</p>`;
}

/* p：people API 的球員；role：'b' 打者 / 'p' 投手；vs：{ name, stat } 對戰資料（打者觀點） */
export function playerCardHTML(p, role, vs) {
  if (!p) return '<div class="empty">找不到球員資料</div>';
  const pos = (p.primaryPosition && p.primaryPosition.abbreviation) || '';
  const bats = p.batSide && (p.batSide.code === 'S' ? '左右開弓、' : `${HAND[p.batSide.code] || ''}打`);
  const hand = bats && p.pitchHand ? `${bats}${HAND[p.pitchHand.code] || ''}投` : '';
  const meta = [p.primaryNumber ? `#${p.primaryNumber}` : '', POS_ZH[pos] || pos, hand, p.currentAge ? `${p.currentAge} 歲` : '']
    .filter(Boolean).map(esc).join(' ・ ');
  // 依點選的身分決定先看打擊或投球；沒有該類數據（例如投手打擊）就換另一類
  let group = role === 'p' ? 'pitching' : 'hitting';
  if (!pickStat(p.stats, 'season', group) && !pickStat(p.stats, 'career', group)) group = group === 'pitching' ? 'hitting' : 'pitching';
  const fmt = group === 'pitching' ? pitCells : hitCells;
  const sea = pickStat(p.stats, 'season', group), car = pickStat(p.stats, 'career', group);
  const sec = (title, x) => `<div class="pcd-sec"><h4>${title}</h4>${x ? fmt(x.stat) : '<p class="pcd-none">尚無數據</p>'}</div>`;
  const vsSec = vs ? `<div class="pcd-sec"><h4>${role === 'p' ? '對' : '對上投手'} ${esc(vs.name || '')}・生涯</h4>${vsLine(vs)}</div>` : '';
  return `<div class="pcd-h">${logo(p.currentTeam, 'pcd-l')}<div><b>${esc(p.fullName || '')}</b><small>${meta}</small></div></div>
    ${sec(`${sea && sea.season ? sea.season + ' ' : ''}本季${group === 'pitching' ? '投球' : '打擊'}`, sea)}
    ${sec(`生涯${group === 'pitching' ? '投球' : '打擊'}`, car)}
    ${vsSec}`;
}

export function openPlayer({ id, role, vs, vsName }) {
  closePlayer();
  const wrap = document.createElement('div');
  wrap.id = 'pcard'; wrap.className = 'fsheet';
  wrap.innerHTML = `<div class="fs-bg"></div><div class="fs-p pcd" role="dialog" aria-label="球員資料"><div class="fs-grab"></div>
    <div id="pcdBody"><div class="loading">載入中…</div></div>
    <button class="fs-done" id="pcdClose">關閉</button></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('#pcdClose') || e.target.classList.contains('fs-bg')) closePlayer();
  });
  requestAnimationFrame(() => wrap.classList.add('show'));

  // 對戰紀錄一律用打者觀點查詢
  const [bid, pid] = role === 'p' ? [vs, id] : [id, vs];
  const person = api(`/api/v1/people/${id}?hydrate=currentTeam,stats(group=[hitting,pitching],type=[season,career])`, { ttl: 6e5 });
  const match = vs
    ? api(`/api/v1/people/${bid}/stats?stats=vsPlayerTotal&opposingPlayerId=${pid}&group=hitting`, { ttl: 6e5 }).catch(() => null)
    : Promise.resolve(null);
  Promise.all([person, match]).then(([d, m]) => {
    if (!wrap.isConnected) return;
    const s = m && m.stats && m.stats[0] && m.stats[0].splits;
    const v = vs ? { name: vsName, stat: (s && s[0] && s[0].stat) || {} } : null;
    wrap.querySelector('#pcdBody').innerHTML = playerCardHTML(d && d.people && d.people[0], role, v);
  }).catch(() => {
    if (wrap.isConnected) wrap.querySelector('#pcdBody').innerHTML = '<div class="empty">資料載入失敗，請稍後再試</div>';
  });
}

export function closePlayer() {
  const w = document.getElementById('pcard');
  if (!w) return;
  w.id = ''; w.classList.remove('show');
  setTimeout(() => w.remove(), 200);
}

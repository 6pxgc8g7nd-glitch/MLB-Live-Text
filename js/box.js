/* 數據分頁：打擊／投球數據，投手列可展開整場球路圖 */
import { esc, dash } from './util.js';
import { S, G } from './state.js';
import { pLink, pAttrs } from './player.js';
import { pitcherMapHTML } from './pitchmap.js';

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

  const pm = (G && G.pm) || {};
  const pRows = (t.pitchers || []).map(get).filter(Boolean).map((p) => {
    const s = (p.stats && p.stats.pitching) || {};
    const era = p.seasonStats && p.seasonStats.pitching && p.seasonStats.pitching.era;
    const pid = p.person && p.person.id;
    const open = pid != null && pm[pid] !== undefined;
    const map = open ? pitcherMapHTML(d, pid, pm[pid]) : '';
    const can = pid != null && !lineupOnly && (s.pitchesThrown ?? s.numberOfPitches ?? 1) !== 0;
    return `<div class="pcw${open && map ? ' open' : ''}"><div class="pc${can ? ' pcx' : ''}"${can ? ` role="button" tabindex="0" data-pm="${pid}" aria-expanded="${open}"` : ''}><div><div><span class="nm">${pLink(p.person, 'p')}</span></div>
      <div class="ln"><span class="hl">${dash(s.inningsPitched)} 局</span> ・ ${dash(s.hits)} 被安 ・ ${dash(s.earnedRuns)} 責失 ・ ${dash(s.strikeOuts)} 三振${more ? ` ・ ${dash(s.runs)} 失分 ・ ${dash(s.baseOnBalls)} 四壞 ・ ${dash(s.pitchesThrown ?? s.numberOfPitches)} 球` : ''}</div></div><div class="av">${dash(era)}<small>ERA</small></div>${can ? '<svg class="pcc" viewBox="0 0 16 10" aria-hidden="true"><path d="M2 2l6 6 6-6"/></svg>' : ''}</div>${map}</div>`;
  }).join('');

  return `
    <h3 class="inn">${lineupOnly ? '預定打線' : '打擊'}</h3>
    <div class="pcs">${bRows || '<div class="empty">尚未公布</div>'}</div>
    ${pRows ? `<h3 class="inn">投球</h3>
    <div class="pcs">${pRows}</div>` : ''}
    <button class="tgl" id="boxMore">${S.boxMore ? '收合欄位' : '更多欄位'}</button>`;
}

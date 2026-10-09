/* 投手球路：整場投球分布圖（好球帶）＋球種分布表。資料來自 feed 的 allPlays，不另外請求 */
import { esc } from './util.js';
import { PITCH_ZH, pitchCls } from './pitches.js';

// 球種顏色（同一類球種用同一色系，圖例與圓點一致）
const GROUP = {
  FF: 'fb', FA: 'fb', SI: 'si', FT: 'si', FC: 'ct', SL: 'sl', ST: 'sl', SV: 'sl',
  CU: 'cu', KC: 'cu', CS: 'cu', CH: 'ch', FS: 'ch', FO: 'ch', KN: 'ot', SC: 'ot', EP: 'ot',
};
export const pitchGroup = (code) => GROUP[code] || 'ot';

// 這位投手整場投的每一球：球種、球速、位置、結果
export function pitcherPitches(d, pid) {
  const all = (d.liveData && d.liveData.plays && d.liveData.plays.allPlays) || [];
  const out = [];
  for (const p of all) {
    if (!p.matchup || !p.matchup.pitcher || p.matchup.pitcher.id !== pid) continue;
    for (const e of p.playEvents || []) {
      if (!e || !e.isPitch) continue;
      const ty = (e.details && e.details.type) || {};
      const pd = e.pitchData || {}, c = pd.coordinates || {};
      const call = (e.details && e.details.call && e.details.call.description) || (e.details && e.details.description) || '';
      out.push({
        code: ty.code || '', name: ty.description || '', cls: pitchCls(e),
        speed: pd.startSpeed, x: c.pX, z: c.pZ, top: pd.strikeZoneTop, bot: pd.strikeZoneBottom,
        whiff: /swinging/i.test(call),
      });
    }
  }
  return out;
}

// 依球種彙整：球數、佔比、均速、最速、揮空
export function pitchTypeStats(pitches) {
  const m = new Map();
  for (const p of pitches) {
    const k = p.code || '?';
    const r = m.get(k) || { code: k, name: p.name, n: 0, sp: 0, spN: 0, max: 0, whiff: 0 };
    r.n++; if (p.whiff) r.whiff++;
    if (p.speed) { r.sp += p.speed; r.spN++; r.max = Math.max(r.max, p.speed); }
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => b.n - a.n).map((r) => ({ ...r, pct: Math.round((r.n / pitches.length) * 100), avg: r.spN ? r.sp / r.spN : null }));
}

const X = (x) => ((x + 2) / 4) * 120, Y = (z) => 150 - (z / 5) * 150;
const med = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

// sel：只顯示某一種球種（null = 全部）
export function pitcherMapHTML(d, pid, sel) {
  const ps = pitcherPitches(d, pid);
  if (!ps.length) return '';
  const stats = pitchTypeStats(ps);
  const nm = (r) => PITCH_ZH[r.code] || r.name || '其他';
  const pos = ps.filter((p) => p.x != null && p.z != null && (!sel || p.code === sel));
  const top = med(ps.map((p) => p.top).filter(Boolean)) || 3.5, bot = med(ps.map((p) => p.bot).filter(Boolean)) || 1.5;
  const zl = X(-0.708), zr = X(0.708), zt = Y(top), zb = Y(bot);
  const dots = pos.map((p) => `<circle class="pm-${pitchGroup(p.code)}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.z).toFixed(1)}" r="4.2"/>`).join('');
  const svg = `<svg class="pmz" viewBox="0 0 120 150" aria-hidden="true"><rect width="120" height="150" rx="8" class="zbg"/><rect x="${zl.toFixed(1)}" y="${zt.toFixed(1)}" width="${(zr - zl).toFixed(1)}" height="${(zb - zt).toFixed(1)}" class="zbox"/>${dots}</svg>`;
  const chips = stats.map((r) => `<button class="pmc${sel === r.code ? ' on' : ''}" data-pmt="${esc(r.code)}"><i class="pm-${pitchGroup(r.code)}"></i>${esc(nm(r))}</button>`).join('');
  const rows = stats.map((r) => `<tr><td><i class="pm-${pitchGroup(r.code)}"></i>${esc(nm(r))}</td><td>${r.n}</td><td>${r.pct}%</td><td>${r.avg ? r.avg.toFixed(1) : '–'}</td><td>${r.max ? r.max.toFixed(1) : '–'}</td><td>${r.whiff || '–'}</td></tr>`).join('');
  const shown = sel ? pos.length : pos.length, miss = ps.length - ps.filter((p) => p.x != null && p.z != null).length;
  return `<div class="pm">
    <div class="pmt"><div class="pmzw">${svg}<small>捕手視角　${shown} 球${miss ? `（${miss} 球無位置）` : ''}</small></div>
    <table class="pms"><thead><tr><th>球種</th><th>球數</th><th>比例</th><th>均速</th><th>最速</th><th>揮空</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="pmcs">${chips}</div></div>`;
}

/* 勝率走勢：數據頁上方的主隊勝率折線（每個打席一點）
 * 上方是主隊、下方是客隊；拖曳、滑鼠移動或方向鍵可逐打席查看，下方列出勝率變化最大的打席 */
import { esc } from './util.js';
import { teamAbbr, evZh } from './dict.js';

const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));
const r1 = (v) => Math.round(v * 10) / 10;

// API 回傳 → 繪圖用的點；第一點是開賽前（第一個打席的勝率扣掉它造成的變化）
export function wpPoints(list) {
  const done = (list || []).filter((p) => p && p.homeTeamWinProbability != null && !(p.about && p.about.isComplete === false));
  if (!done.length) return [];
  const f = done[0];
  const pts = [{ h: clamp(f.homeTeamWinProbability - (f.homeTeamWinProbabilityAdded || 0)), inn: 1, top: true, who: '', ev: '開賽', add: 0 }];
  done.forEach((p) => {
    const ab = p.about || {};
    pts.push({
      h: clamp(p.homeTeamWinProbability),
      inn: ab.inning || 0,
      top: ab.isTopInning != null ? !!ab.isTopInning : /top/i.test(ab.halfInning || ''),
      who: (p.matchup && p.matchup.batter && p.matchup.batter.fullName) || '',
      ev: evZh(p.result && p.result.event),
      add: Number(p.homeTeamWinProbabilityAdded) || 0,
    });
  });
  return pts;
}

const innTxt = (p) => (p.inn ? `${p.inn}局${p.top ? '上' : '下'}` : '');
// 以「領先的一方」描述勝率，比較直覺（主隊 23% ＝ 客隊 77%）
const favTxt = (h, aAb, hAb) => (h >= 50 ? `${hAb} ${Math.round(h)}%` : `${aAb} ${Math.round(100 - h)}%`);
const swingTxt = (add, aAb, hAb) => `${add >= 0 ? hAb : aAb} +${Math.round(Math.abs(add))}%`;

const L = 40, R = 10, T = 10, B = 20, PH = 112;

/* pts：wpPoints() 的結果；aT / hT：客／主隊；w：容器寬度（px） */
export function wpHTML(pts, aT, hT, w) {
  if (!pts || pts.length < 2) return '';
  const aAb = teamAbbr(aT) || '客', hAb = teamAbbr(hT) || '主';
  const W = Math.max(240, Math.round(w || 340)), H = T + PH + B;
  const n = pts.length;
  const x = (i) => r1(L + (i * (W - L - R)) / (n - 1));
  const y = (h) => r1(T + ((100 - h) / 100) * PH);
  const mid = y(50);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.h)}`).join('');
  const area = `${line}L${x(n - 1)},${mid}L${x(0)},${mid}Z`;
  // 局數刻度：每局開始的位置（第 1 局在最左邊）；太擠（延長賽）就略過
  let ticks = `<text class="wp-ax" x="${x(0)}" y="${H - 5}" text-anchor="middle">1</text>`, lastX = x(0);
  pts.forEach((p, i) => {
    if (!i || !p.top || (pts[i - 1].inn === p.inn)) return;
    const tx = x(i - 1);
    if (tx - lastX < 16) return;
    lastX = tx;
    ticks += `<line class="wp-tk" x1="${tx}" x2="${tx}" y1="${T}" y2="${T + PH}"/><text class="wp-ax" x="${tx}" y="${H - 5}" text-anchor="middle">${p.inn}</text>`;
  });
  const last = pts[n - 1];
  const svg = `<svg class="wp-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    ${ticks}
    <line class="wp-mid" x1="${L}" x2="${W - R}" y1="${mid}" y2="${mid}"/>
    <text class="wp-ax" x="${L - 6}" y="${T + 8}" text-anchor="end">${esc(hAb)}</text>
    <text class="wp-ax" x="${L - 6}" y="${mid + 4}" text-anchor="end">50%</text>
    <text class="wp-ax" x="${L - 6}" y="${T + PH}" text-anchor="end">${esc(aAb)}</text>
    <path class="wp-area" d="${area}"/>
    <path class="wp-line" d="${line}"/>
    <circle class="wp-end" cx="${x(n - 1)}" cy="${y(last.h)}" r="4"/>
    <line class="wp-x" x1="0" x2="0" y1="${T}" y2="${T + PH}" visibility="hidden"/>
    <circle class="wp-dot" cx="0" cy="0" r="4" visibility="hidden"/>
  </svg>`;
  const keys = pts.map((p, i) => ({ p, i })).filter((o) => o.i > 0 && Math.abs(o.p.add) >= 1)
    .sort((a, b) => Math.abs(b.p.add) - Math.abs(a.p.add)).slice(0, 3);
  const keyRows = keys.map(({ p }) => `<li><span class="wp-ki">${esc(innTxt(p))}</span><span class="wp-kw">${esc(p.who)} ${esc(p.ev)}</span><b>${esc(swingTxt(p.add, aAb, hAb))}</b></li>`).join('');
  return `<h3 class="inn">勝率走勢<span class="wp-now">${esc(favTxt(last.h, aAb, hAb))}</span></h3>
    <div class="wp-c" tabindex="0" role="img" aria-label="勝率走勢，目前 ${esc(favTxt(last.h, aAb, hAb))}；可用左右方向鍵逐打席查看" data-w="${W}">
      ${svg}<div class="wp-tip" hidden><b></b><span></span></div>
    </div>
    ${keyRows ? `<ul class="wp-keys"><li class="wp-kh">影響最大的打席</li>${keyRows}</ul>` : ''}`;
}

/* 互動：十字線對齊最近的打席，說明文字一律用 textContent */
export function bindWp(box, pts, aT, hT) {
  const c = box.querySelector('.wp-c');
  if (!c || pts.length < 2) return;
  const aAb = teamAbbr(aT) || '客', hAb = teamAbbr(hT) || '主';
  const W = Number(c.dataset.w), n = pts.length;
  const xl = c.querySelector('.wp-x'), dot = c.querySelector('.wp-dot'), tip = c.querySelector('.wp-tip');
  const px = (i) => L + (i * (W - L - R)) / (n - 1);
  let cur = -1;
  const show = (i) => {
    cur = Math.max(0, Math.min(n - 1, i));
    const p = pts[cur], X = px(cur), Y = T + ((100 - p.h) / 100) * PH;
    xl.setAttribute('x1', X); xl.setAttribute('x2', X); xl.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', X); dot.setAttribute('cy', Y); dot.setAttribute('visibility', 'visible');
    tip.querySelector('b').textContent = favTxt(p.h, aAb, hAb);
    tip.querySelector('span').textContent = cur
      ? `${innTxt(p)}・${p.who} ${p.ev}${Math.abs(p.add) >= 1 ? `（${swingTxt(p.add, aAb, hAb)}）` : ''}`
      : '開賽';
    tip.hidden = false;
    const half = tip.offsetWidth / 2, cw = c.clientWidth;
    tip.style.left = `${Math.max(0, Math.min(cw - tip.offsetWidth, (X / W) * cw - half))}px`;
  };
  const hide = () => { cur = -1; xl.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  const at = (e) => {
    const r = c.getBoundingClientRect();
    return Math.round((((e.clientX - r.left) / r.width) * W - L) / ((W - L - R) / (n - 1)));
  };
  c.addEventListener('pointerdown', (e) => show(at(e)));
  c.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) show(at(e)); });
  c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  c.addEventListener('blur', hide);
  c.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); show(cur < 0 ? n - 1 : cur + (e.key === 'ArrowRight' ? 1 : -1)); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); show(e.key === 'Home' ? 0 : n - 1); }
    else if (e.key === 'Escape') hide();
  });
}

/* 工具：DOM 小幫手、localStorage、台灣時間的日期格式 */
export const API = 'https://statsapi.mlb.com';
export const TZ = 'Asia/Taipei';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const dash = (v) => (v === undefined || v === null || v === '' ? '–' : v);

export const store = {
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
export const fmtISO = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const fmtHM = new Intl.DateTimeFormat('zh-TW', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const fmtHMS = new Intl.DateTimeFormat('zh-TW', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
export const fmtDay = new Intl.DateTimeFormat('zh-TW', { timeZone: TZ, month: 'numeric', day: 'numeric', weekday: 'short' });

export const twDate = (d = new Date()) => fmtISO.format(d); // YYYY-MM-DD（台灣日期）
export const shiftDate = (s, n) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
export const fmtTime = (x) => (x ? fmtHM.format(new Date(x)) : '–');
export const fmtClock = (x) => fmtHMS.format(new Date(x));
export const dayLabel = (s) => fmtDay.format(new Date(`${s}T12:00:00+08:00`));
// 'YYYY-MM-DD' → '10/8'
export const monthDay = (s) => (dayLabel(s).match(/\d+\/\d+/) || [''])[0];
// 星期的英文縮寫（Mon、Tue、Wed、Thu、Fri、Sat、Sun），標題欄的日期票用
const fmtWkEn = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
export const weekdayEn = (s) => fmtWkEn.format(new Date(`${s}T12:00:00+08:00`));

/* 把新的 HTML 套進容器：只更新有變的文字與屬性，沒變的節點（尤其是隊徽圖片）原封不動。
 * 整塊 innerHTML 重寫會讓隊徽重新載入，畫面就會閃一下 */
export function morph(el, html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  patchKids(el, t.content);
}
const sameNode = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && !(a.nodeName === 'IMG' && a.getAttribute('src') !== b.getAttribute('src'));
function patchKids(a, b) {
  const an = Array.from(a.childNodes), bn = Array.from(b.childNodes);
  bn.forEach((y, i) => {
    const x = an[i];
    if (!x) a.appendChild(y);
    else if (!sameNode(x, y)) a.replaceChild(y, x);
    else if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; }
    else { patchAttrs(x, y); patchKids(x, y); }
  });
  for (let i = bn.length; i < an.length; i++) a.removeChild(an[i]);
}
function patchAttrs(a, b) {
  for (const { name } of Array.from(a.attributes)) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of Array.from(b.attributes)) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
}

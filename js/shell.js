/* 外框：標題欄日期、日曆、路由、提示訊息 */
import { $, $$, twDate, shiftDate, monthDay, weekdayEn } from './util.js';
import { api } from './api.js';
import { S, route$, stopPoller, nextToken, setG } from './state.js';
import { showScores } from './scores.js';
import { showGame } from './game.js';
import { showStandings } from './standings.js';
import { showSettings } from './settings.js';
import { closePlayer } from './player.js';

/* 標題欄日期：三張小票（前一天 / 目前日期 / 後一天） */
export function segLabel(d, offset) {
  const md = monthDay(d), wk = weekdayEn(d);
  if (offset < 0) return { small: '', name: '‹' };
  if (offset > 0) return { small: '', name: '›' };
  return d === twDate() ? { small: '', name: 'Today' } : { small: '', name: `${md} ${wk}`.trim() };
}
export function renderSegs() {
  [['#segL', -1], ['#segC', 0], ['#segR', 1]].forEach(([sel, off]) => {
    const d = shiftDate(S.date, off), l = segLabel(d, off), el = $(sel);
    el.querySelector('small').textContent = l.small;
    el.querySelector('b').textContent = l.name;
    el.classList.toggle('today', off === 0 && d === twDate());
  });
  $('#segL').setAttribute('aria-label', '前一天'); $('#segR').setAttribute('aria-label', '後一天');
}
/* 長按今天：跳出日曆，點日期直接切換 */
export const calDays = new Map();
/* 日曆標題的年、月下拉選單。年份從 2008（有逐球位置資料）到明年；正在看的年份若超出範圍也會補進去 */
const CAL_MIN_YEAR = 2008;
export function calYears(y, nowYear) {
  const from = Math.min(CAL_MIN_YEAR, y), to = Math.max(nowYear + 1, y);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
export function calTitleHTML(y, m, nowYear) {
  const opt = (v, cur, unit) => `<option value="${v}"${v === cur ? ' selected' : ''}>${v} ${unit}</option>`;
  const ys = calYears(y, nowYear).map((v) => opt(v, y, '年')).join('');
  const ms = Array.from({ length: 12 }, (_, i) => opt(i + 1, m, '月')).join('');
  return `<span class="cal-sel"><select class="cal-y" aria-label="年">${ys}</select><select class="cal-mo" aria-label="月">${ms}</select></span>`;
}

export function openCal(sel, onPick) {
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
      <div class="cal-h">${calTitleHTML(y, m, +today.slice(0, 4))}</div>
      <div class="cal-w"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
      <div class="cal-g">${cells}</div>
      <div class="cal-lg"><i></i>有比賽</div>
      <button class="cal-t" data-d="${today}">回到今天</button></div>`;
  };
  wrap.addEventListener('click', (e) => {
    if (e.target.classList.contains('cal-bg')) return close();
    const d = e.target.closest('[data-d]');
    if (d) { close(); onPick(d.dataset.d); }
  });
  wrap.addEventListener('change', (e) => { // 直接選年或月
    const t = e.target;
    if (t.classList.contains('cal-y')) y = +t.value;
    else if (t.classList.contains('cal-mo')) m = +t.value;
    else return;
    draw();
    loadMonth();
  });
  draw();
  loadMonth();
}
/* 左右兩張：前後一天；中間：單擊回到今天、長按（約 0.5 秒）開啟日期選擇器 */
export function bindSegs() {
  const c = $('#segC');
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
}

export function setHeader(title, isGame, tab) {
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

export function applyLang() {
  $('#langBtn').innerHTML = `<span${S.lang === 'zh' ? ' class="on"' : ''}>中</span><span${S.lang === 'zh' ? '' : ' class="on"'}>EN</span>`;
}

export function route() {
  stopPoller();
  nextToken();
  setG(null);
  const hrfx = document.getElementById('hrfx'); if (hrfx) hrfx.remove(); // 換頁時立刻結束全壘打動畫
  closePlayer();
  $('#banner').hidden = true;
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (name === 'game' && /^\d+$/.test(arg || '')) { showGame(arg); return; }
  if (name === 'standings') showStandings();
  else if (name === 'settings') showSettings();
  else showScores();
}

export function rollover() {
  // 台灣 0:00 換日：停在「今天」的人自動跳到新的一天
  if (S.follow && route$ === 'scores' && twDate() !== S.date) {
    S.date = twDate();
    route();
  }
}


export let toastT = 0;
export const toast = (txt, hold) => {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = txt; t.classList.add('show');
  clearTimeout(toastT);
  if (hold !== true) toastT = setTimeout(() => t.classList.remove('show'), 1400);
};

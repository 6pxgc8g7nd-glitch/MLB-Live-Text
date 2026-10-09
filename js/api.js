/* 資料層：API 請求、狀態橫幅、輪詢 */
import { API, $, fmtClock } from './util.js';

export const cache = new Map(); // path -> { t, d }  只用來避免短時間內重複請求
let override = null; // 重播模式（js/replay.js）會換掉部分請求；平常一律直接抓 API
export const setApiOverride = (fn) => { override = fn; };
export const api = (path, opts) => (override ? override(path, opts, apiReal) : apiReal(path, opts));
export async function apiReal(path, { ttl = 0, timeout = 12000 } = {}) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t < ttl) return hit.d;
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(API + path, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (ttl > 0) cache.set(path, { t: Date.now(), d }); // 沒有設 ttl 的請求（例如比賽頁每 10 秒的更新）不存，免得越積越多
    return d;
  } finally {
    clearTimeout(to);
  }
}

export let lastOk = 0;
export function setStatus(ok) {
  const b = $('#banner');
  if (!b) return;
  if (ok) {
    lastOk = Date.now();
    b.hidden = true;
    const u = $('#updated');
    if (u) u.textContent = '更新 ' + fmtClock(lastOk);
  } else {
    const ld = document.querySelector('#view .loading');
    if (ld) {
      const off = navigator.onLine === false;
      ld.className = 'errbox';
      ld.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 9a15 15 0 0 1 19 0M5.5 12.5a10.5 10.5 0 0 1 13 0M8.7 16a6 6 0 0 1 6.6 0"/><circle cx="12" cy="19.5" r="1.2"/><path d="M4 4l16 16"/></svg>
        <b>${off ? '目前沒有網路' : '資料載入失敗'}</b>
        <small>${off ? '請確認網路連線後再試一次' : 'MLB 資料暫時連不上，請稍後再試'}</small>
        <button id="retryBtn">重新載入</button>`;
      b.hidden = true;
      return;
    }
    b.hidden = false;
    b.textContent =
      navigator.onLine === false
        ? '目前離線，畫面是上次載入的資料'
        : `資料更新失敗，稍後自動重試${lastOk ? `（上次成功 ${fmtClock(lastOk)}）` : ''}`;
  }
}

/* 輪詢：失敗時指數退避、背景分頁暫停、回到前景立即補更新、不重疊執行 */
export function createPoller(fn, delayFn) {
  let timer = 0, fails = 0, stopped = false, busy = false;
  const p = {
    async run() {
      clearTimeout(timer);
      if (stopped || busy || document.hidden) return;
      busy = true;
      let ok = true;
      try { await fn(); } catch (e) { ok = false; console.warn(e); }
      busy = false;
      if (stopped) return;
      if (ok) { fails = 0; setStatus(true); } else { fails++; setStatus(false); }
      const base = delayFn();
      if (base == null) return; // 不需要再更新（例如比賽已結束）
      const wait = Math.min(base * Math.pow(2, Math.min(fails, 4)), 60000);
      timer = setTimeout(() => p.run(), wait);
    },
    start() { stopped = false; p.run(); },
    kick() { return (!stopped && !busy) ? p.run() : Promise.resolve(); },
    stop() { stopped = true; clearTimeout(timer); },
  };
  return p;
}

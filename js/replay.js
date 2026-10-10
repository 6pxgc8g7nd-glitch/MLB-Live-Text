/* 重播：用 MLB 的歷史快照（feed/live?timecode=，約每 15 秒一筆）把已結束的比賽當作直播重播。
 * 兩種用法，都是需要時才載入：
 *   - App 內：已結束比賽頁的「重播」按鈕 → startInApp()，頁面下方出現控制列，離開這場比賽就自動結束
 *   - 開發用外框 replay.html：網址帶 ?replay=<gamePk>，由外框透過 postMessage 控制、這裡回報進度 */
import { setApiOverride } from './api.js';
import { G, poller } from './state.js';
import { esc } from './util.js';
import { IC } from './icons.js';

// '20261007_205955'（UTC）→ 毫秒
export const tcToMs = (tc) => Date.UTC(+tc.slice(0, 4), +tc.slice(4, 6) - 1, +tc.slice(6, 8), +tc.slice(9, 11), +tc.slice(11, 13), +tc.slice(13, 15));

// 已排序的時間點中，找出 <= t 的最後一筆；都比 t 晚就回傳第一筆
export function stampAt(ms, t) {
  let lo = 0, hi = ms.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ms[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// 每個半局第一個打席的開始時間，給「跳到第幾局」用
export function halfStarts(allPlays) {
  const out = [];
  (allPlays || []).forEach((p) => {
    const ab = p.about || {};
    const top = ab.isTopInning != null ? !!ab.isTopInning : /top/i.test(ab.halfInning || '');
    const last = out[out.length - 1];
    if (ab.startTime && (!last || last.inning !== ab.inning || last.top !== top)) out.push({ inning: ab.inning, top, t: Date.parse(ab.startTime) });
  });
  return out;
}

let active = null; // 同時只會有一場重播

export function stopReplay() { if (active) active.stop(); }

/* 開始重播，回傳控制器。onStatus：每次進度變化時呼叫（App 內控制列用） */
export async function startReplay(pk, api, { onStatus } = {}) {
  stopReplay();
  const base = `/api/v1.1/game/${pk}/feed/live`;
  const [stamps, final, wpAll] = await Promise.all([
    api(`${base}/timestamps`),
    api(base),
    api(`/api/v1/game/${pk}/winProbability`).catch(() => []),
  ]);
  const tcs = (stamps || []).slice().sort();
  const ms = tcs.map(tcToMs);
  const halves = halfStarts(final && final.liveData && final.liveData.plays && final.liveData.plays.allPlays);
  if (!ms.length || !halves.length) throw new Error('這場比賽沒有可重播的資料');
  const start = halves[0].t - 30000, end = ms[ms.length - 1];
  const R = { vt: start, speed: 10, playing: true, idx: -1, snap: null };

  setApiOverride((path, opts, real) => {
    if (path === base) { // 一律回目前重播時間點的整份快照
      const tc = tcs[stampAt(ms, R.vt)];
      return real(`${base}?timecode=${tc}`, { ttl: 864e5 }).then((d) => { R.snap = d; report(); return d; });
    }
    if (path === `/api/v1/game/${pk}/winProbability`) {
      return Promise.resolve((wpAll || []).filter((p) => p.about && p.about.endTime && Date.parse(p.about.endTime) <= R.vt));
    }
    return real(path, opts);
  });

  const status = () => {
    const ls = (R.snap && R.snap.liveData && R.snap.liveData.linescore) || {};
    const st = (R.snap && R.snap.gameData && R.snap.gameData.status) || {};
    return {
      vt: R.vt, start, end, speed: R.speed, playing: R.playing, done: R.vt >= end,
      inning: ls.currentInning || 0, half: ls.inningState || '', outs: ls.outs, balls: ls.balls, strikes: ls.strikes,
      state: st.detailedState || '', halves: halves.map((h) => ({ inning: h.inning, top: h.top })),
    };
  };
  const parentWin = window.parent !== window ? window.parent : null;
  function report() {
    const s = status();
    if (onStatus) onStatus(s);
    if (parentWin) parentWin.postMessage({ type: 'replay-status', ...s }, location.origin);
  }
  const refresh = () => { if (poller) poller.kick(true); };
  // 往前或往後跳：清掉「已看過的全壘打」與勝率快取，避免一次補播多支全壘打動畫
  const seek = (t) => {
    R.vt = Math.max(start, Math.min(end, t));
    R.idx = -1;
    if (G) { G.hrSeen = null; G.wp = null; G.lbPrev = null; }
    refresh(); report();
  };

  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now(), dt = now - last;
    last = now;
    if (R.playing && R.vt < end) R.vt = Math.min(end, R.vt + dt * R.speed);
    const i = stampAt(ms, R.vt);
    if (i !== R.idx) { R.idx = i; refresh(); }
    report();
  }, 500);

  const ctl = {
    pk: String(pk),
    play() { if (R.vt >= end) seek(start); R.playing = true; report(); },
    pause() { R.playing = false; report(); },
    setSpeed(v) { R.speed = Math.max(1, Math.min(120, Number(v) || 1)); report(); },
    seek,
    half(i) { const h = halves[Number(i)]; if (h) seek(h.t - 5000); },
    status,
    stop() {
      clearInterval(timer);
      removeEventListener('message', onMsg);
      setApiOverride(null);
      if (active === ctl) active = null;
    },
  };
  function onMsg(e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'replay') return;
    const { cmd, value } = e.data;
    if (cmd === 'play') ctl.play();
    else if (cmd === 'pause') ctl.pause();
    else if (cmd === 'speed') ctl.setSpeed(value);
    else if (cmd === 'seek') seek(Number(value));
    else if (cmd === 'half') ctl.half(value);
  }
  addEventListener('message', onMsg);
  active = ctl;
  return ctl;
}

/* ---- App 內的重播控制列 ---- */
const HALF = { Top: '上', Bottom: '下', Middle: '中場', End: '局末' };
const tw = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function barLabel(s) {
  if (s.done) return '重播結束';
  if (!s.inning) return '開賽前';
  const cnt = s.half === 'Top' || s.half === 'Bottom' ? ` ${s.outs != null ? s.outs : 0}出局 ${s.balls != null ? s.balls : 0}-${s.strikes != null ? s.strikes : 0}` : '';
  return `${s.inning}局${HALF[s.half] || ''}${cnt}`;
}

/* route：重新開啟比賽頁的函式（shell.js 的 route），開始與結束時各呼叫一次 */
export async function startInApp(pk, api, route) {
  const bar = document.getElementById('rpBar') || document.createElement('div');
  bar.id = 'rpBar'; bar.className = 'rpbar';
  bar.innerHTML = '<div class="rp-l">重播載入中…</div>';
  document.body.appendChild(bar);
  document.body.classList.add('replaying');
  let ctl, dragging = false, built = false;
  const end = () => {
    removeEventListener('hashchange', onHash);
    if (ctl) ctl.stop();
    bar.remove();
    document.body.classList.remove('replaying');
  };
  // 離開這場比賽（換頁、回比分）就結束重播
  const onHash = () => { if (location.hash.replace(/^#\/?/, '') !== `game/${pk}`) end(); };
  addEventListener('hashchange', onHash);
  const paint = (s) => {
    if (!built) {
      built = true;
      bar.innerHTML = `<div class="rp-r1">
          <button class="rp-pp" aria-label="播放或暫停"></button>
          <div class="rp-l"><b></b><small></small></div>
          <select class="rp-sp" aria-label="倍速">${[1, 5, 10, 30, 60].map((v) => `<option value="${v}"${v === s.speed ? ' selected' : ''}>${v}×</option>`).join('')}</select>
          <button class="rp-x" aria-label="結束重播">結束</button>
        </div>
        <div class="rp-r2">
          <select class="rp-h" aria-label="跳到半局"><option value="">跳到…</option>${s.halves.map((h, i) => `<option value="${i}">${h.inning}局${h.top ? '上' : '下'}</option>`).join('')}</select>
          <input class="rp-rg" type="range" min="0" max="1000" value="0" aria-label="重播進度">
        </div>`;
      bar.querySelector('.rp-pp').onclick = () => (ctl.status().playing && !ctl.status().done ? ctl.pause() : ctl.play());
      bar.querySelector('.rp-sp').onchange = (e) => ctl.setSpeed(e.target.value);
      bar.querySelector('.rp-h').onchange = (e) => { if (e.target.value !== '') ctl.half(e.target.value); e.target.value = ''; };
      const rg = bar.querySelector('.rp-rg');
      rg.oninput = () => { dragging = true; };
      rg.onchange = () => { dragging = false; const t = ctl.status(); ctl.seek(t.start + (rg.value / 1000) * (t.end - t.start)); };
      bar.querySelector('.rp-x').onclick = () => { end(); route(); }; // 回到這場比賽的最終結果
    }
    bar.querySelector('.rp-pp').innerHTML = s.playing && !s.done ? IC.pause : IC.play;
    bar.querySelector('.rp-l b').textContent = barLabel(s);
    bar.querySelector('.rp-l small').innerHTML = `重播・${esc(tw.format(new Date(s.vt)))}`;
    if (!dragging) bar.querySelector('.rp-rg').value = Math.round(((s.vt - s.start) / (s.end - s.start || 1)) * 1000);
  };
  try {
    ctl = await startReplay(pk, api, { onStatus: (s) => { if (bar.isConnected) paint(s); } });
  } catch (e) {
    end();
    throw e;
  }
  if (!bar.isConnected) { ctl.stop(); return null; } // 載入途中已經離開這場比賽
  route(); // 用重播的資料重新開啟比賽頁（從開賽前開始）
  return ctl;
}

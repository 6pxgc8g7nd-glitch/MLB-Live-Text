/* 重播模式（開發用）：只在網址帶 ?replay=<gamePk> 時由 main.js 載入，正式畫面不會出現。
 * 用 MLB 的歷史快照（feed/live?timecode=，約每 15 秒一筆）把已結束的比賽當作直播重播；
 * 外框 replay.html 透過 postMessage 控制播放、倍速與跳局，這裡回報目前進度。 */
import { setApiOverride } from './api.js';
import { G, poller } from './state.js';

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

export async function startReplay(pk, api) {
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
    if (path === base) {
      const tc = tcs[stampAt(ms, R.vt)];
      return real(`${base}?timecode=${tc}`, { ttl: 864e5 }).then((d) => { R.snap = d; report(); return d; });
    }
    if (path === `/api/v1/game/${pk}/winProbability`) {
      return Promise.resolve((wpAll || []).filter((p) => p.about && p.about.endTime && Date.parse(p.about.endTime) <= R.vt));
    }
    return real(path, opts);
  });

  const parentWin = window.parent !== window ? window.parent : null;
  function report() {
    if (!parentWin) return;
    const ls = (R.snap && R.snap.liveData && R.snap.liveData.linescore) || {};
    const st = (R.snap && R.snap.gameData && R.snap.gameData.status) || {};
    parentWin.postMessage({
      type: 'replay-status', vt: R.vt, start, end, speed: R.speed, playing: R.playing,
      inning: ls.currentInning || 0, half: ls.inningState || '', outs: ls.outs, balls: ls.balls, strikes: ls.strikes,
      state: st.detailedState || '', halves: halves.map((h) => ({ inning: h.inning, top: h.top })),
    }, location.origin);
  }
  const refresh = () => { if (poller) poller.kick(); };
  // 往前或往後跳：清掉「已看過的全壘打」與勝率快取，避免一次補播多支全壘打動畫
  const seek = (t) => {
    R.vt = Math.max(start, Math.min(end, t));
    R.idx = -1;
    if (G) { G.hrSeen = null; G.wp = null; G.lbPrev = null; }
    refresh(); report();
  };

  let last = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = now - last;
    last = now;
    if (R.playing && R.vt < end) R.vt = Math.min(end, R.vt + dt * R.speed);
    const i = stampAt(ms, R.vt);
    if (i !== R.idx) { R.idx = i; refresh(); }
    report();
  }, 500);

  addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'replay') return;
    const { cmd, value } = e.data;
    if (cmd === 'play') R.playing = true;
    else if (cmd === 'pause') R.playing = false;
    else if (cmd === 'speed') R.speed = Math.max(1, Math.min(120, Number(value) || 1));
    else if (cmd === 'seek') seek(Number(value));
    else if (cmd === 'half') { const h = halves[Number(value)]; if (h) seek(h.t - 5000); }
    report();
  });
}

/* MLB 文字轉播 PWA：進入點
 * 資料來源：MLB Stats API（statsapi.mlb.com，非官方、無穩定性保證，因此所有欄位都做缺值保護）
 * 模組：util 工具 → dict 字典 → api 資料層/輪詢 → state 共用狀態 → scores 比分 / game 轉播 / standings 排名 / settings 設定
 *       → shell 外框與路由 → gestures 滑動換頁與下拉更新 → main 啟動與事件綁定 */

import { $, $$, store, twDate, shiftDate } from './util.js';
import { api, cache } from './api.js';
import { S, view, poller, route$, G, setView } from './state.js';
import { skelTicket, skelRows } from './scores.js';
import { renderBody, renderGame } from './game.js';
import { openFavSheet } from './settings.js';
import { bindSegs, applyLang, route, rollover, toast } from './shell.js';
import { initSwipe, initPull } from './gestures.js';
import { openPlayer, fromEl } from './player.js';

function boot() {
  setView($('#view'));
  applyLang();
  bindSegs();
  initSwipe();

  $('#langBtn').onclick = () => {
    S.lang = S.lang === 'zh' ? 'en' : 'zh';
    store.set('lang', S.lang);
    applyLang();
    if (G && G.data) { G.sig = ''; renderGame(); }
  };
  const manualRefresh = async () => {
    if (route$ !== 'scores' && route$ !== 'standings') return;
    const ic = $('#ballIc'); if (ic) { ic.classList.remove('pulse'); void ic.offsetWidth; ic.classList.add('pulse'); }
    if (!poller) return;
    cache.clear();
    if (G && G.expire) G.expire(); // 排名頁：略過「每天中午才更新」，這次一定重抓
    toast('更新中…', true);
    const u = $('#updated'); if (u) u.textContent = '更新中…';
    try { await poller.kick(); } catch (e) { /* 失敗由橫幅顯示 */ }
    const failed = !$('#banner').hidden || document.querySelector('#view .errbox');
    toast(failed ? '更新失敗，請稍後再試' : '已更新');
  };
  $('#title').onclick = manualRefresh;
  $('#ballIc').onclick = manualRefresh;
  initPull(manualRefresh);

  view.addEventListener('click', (e) => {
    if (e.target.closest('#favOpen')) { openFavSheet(); return; }
    if (e.target.closest('#rpStart') && G && G.pk) {
      const pk = G.pk;
      import('./replay.js').then((m) => m.startInApp(pk, api, route)).catch((err) => toast((err && err.message) || '重播載入失敗'));
      return;
    }
    if (e.target.closest('#gFold')) { S.gFold = !S.gFold; $('#gCtl').classList.toggle('fold', S.gFold); return; }
    const sv2 = e.target.closest('[data-sv2]');
    if (sv2) {
      S.standDef = sv2.dataset.sv2; store.set('standView', S.standDef);
      $$('[data-sv2]').forEach((b) => b.classList.toggle('on', b === sv2));
      return;
    }
    if (e.target.closest('#retryBtn')) {
      const eb = e.target.closest('.errbox');
      if (eb) { eb.className = 'loading skelbox'; eb.innerHTML = route$ === 'standings' ? skelRows(6) : skelTicket() + skelTicket() + skelTicket(); }
      if (poller) poller.kick();
      return;
    }
    if (e.target.closest('#reloadApp')) {
      const done = () => location.reload();
      (async () => {
        try {
          if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((r) => r.unregister())); }
          if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
        } catch (_) {}
        done();
      })();
      return;
    }
    const pl = e.target.closest('[data-player]'); // 球員名字：開小卡，不要同時展開／收合打席
    if (pl) {
      openPlayer(fromEl(pl));
      return;
    }
    const play = e.target.closest('.play');
    if (play && G && G.open && !play.closest('#lv')) { // LIVE 分頁的打席卡固定展開
      const k = Number(play.dataset.k);
      const nowOpen = !play.classList.contains('open');
      if (play.classList.contains('live')) { if (nowOpen) G.shut.delete(k); else G.shut.add(k); } // 進行中：記錄「手動收起」
      else if (nowOpen) G.open.add(k); else G.open.delete(k); // 已結束：記錄「手動展開」
      play.classList.toggle('open', nowOpen);
      G.sig = '';
      return;
    }
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'prevDay' || b.id === 'nextDay') {
      S.date = shiftDate(S.date, b.id === 'prevDay' ? -1 : 1);
      S.follow = S.date === twDate();
      route();
    } else if (b.dataset.t) {
      S.gtab = b.dataset.t;
      store.set('gtab', S.gtab);
      renderBody();
      if (poller) poller.kick(); // 切到 LIVE 分頁就馬上換成 1 秒的節奏
    } else if (b.dataset.af) {
      S.autoFollow = !S.autoFollow;
      store.set('autoFollow', S.autoFollow);
      b.classList.toggle('on', S.autoFollow);
      b.setAttribute('aria-checked', String(S.autoFollow));
    } else if (b.dataset.f) {
      G.filter = b.dataset.f;
      G.limit = 60;
      G.sig = '';
      G.lastTotal = 0;
      renderBody();
    } else if (b.dataset.side) {
      G.side = b.dataset.side;
      G.sig = '';
      renderBody();
    } else if (b.dataset.sv) {
      S.standView = b.dataset.sv;
      if (G && G.repaint) G.repaint();
    } else if (b.id === 'boxMore') {
      S.boxMore = !S.boxMore;
      store.set('boxMore', S.boxMore);
      G.sig = '';
      renderBody();
    } else if (b.id === 'moreBtn') {
      G.limit += 60;
      G.sig = '';
      renderBody();
    } else if (b.id === 'newChip') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      b.hidden = true;
    }
  });

  view.addEventListener('keydown', (e) => { // 球員名字是 span，補上鍵盤操作
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-player]')) { e.preventDefault(); e.target.click(); }
  });

  let rsT = 0; // 勝率圖依容器寬度繪製，視窗大小改變時重畫
  addEventListener('resize', () => {
    clearTimeout(rsT);
    rsT = setTimeout(() => { if (G && G.wp && S.gtab === 'box') { G.wp.sig = ''; renderBody(); } }, 150);
  });

  let lastY = 0;
  addEventListener('scroll', () => {
    const chip = $('#newChip');
    if (chip && !chip.hidden && window.scrollY < 80) chip.hidden = true;
    const y = window.scrollY;
    const dy = y - lastY;
    if (y > 240 && dy > 6) document.body.classList.add('nonav');
    else if (dy < -6 || y <= 240) document.body.classList.remove('nonav');
    if (Math.abs(dy) > 6 || y <= 0) lastY = y;
  }, { passive: true });

  // iOS Safari 會忽略 user-scalable=no：擋掉雙指縮放手勢（雙擊放大由 touch-action: manipulation 處理）
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));
  document.addEventListener('selectstart', (e) => e.preventDefault());

  addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { rollover(); if (poller) poller.kick(); }
  });
  addEventListener('online', () => poller && poller.kick());
  addEventListener('pageshow', () => poller && poller.kick());
  setInterval(rollover, 20000);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  // 開發用重播模式（見 replay.html）：網址帶 ?replay=<gamePk> 才載入，正式使用不會下載這段
  const rp = new URLSearchParams(location.search).get('replay');
  if (rp && /^\d+$/.test(rp)) {
    import('./replay.js').then((m) => m.startReplay(rp, api)).catch((e) => toast((e && e.message) || '重播載入失敗', true)).then(route);
  } else route();
}

boot();

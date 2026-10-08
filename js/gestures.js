/* 手勢：主頁左右滑動切換、比分頁下拉更新 */
import { $ } from './util.js';
import { view, route$ } from './state.js';
import { skelPage } from './scores.js';

// 比分／排名／設定可左右滑動切換。往左滑：下一頁從右側蓋上，目前頁退後變暗；往右滑：目前頁向右滑出，前一頁從退後位置回到原位。
// 下一頁的內容在切換完成後才載入，滑動途中先顯示該頁的骨架畫面。
export function initSwipe() {
  const ORDER = ['scores', 'standings', 'settings'];
  const RET = 0.28, DUR = 340, EASE = 'cubic-bezier(.22,.8,.3,1)';
  const html = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let d = null, busy = false, mute = 0;
  const W = () => innerWidth;
  const topEdge = () => { const t = $('.top'); return t ? Math.round(t.getBoundingClientRect().bottom) : 0; };
  const mkLayer = (cls, key) => {
    const el = document.createElement('div');
    el.className = 'sw-layer ' + cls;
    el.style.top = topEdge() + 'px';
    el.innerHTML = `<main class="sw-ph" aria-hidden="true">${skelPage(key)}</main>`;
    document.body.appendChild(el);
    return el;
  };
  const tr = (el, on) => { el.style.transition = on ? `transform ${DUR}ms ${EASE}, filter ${DUR}ms ease` : 'none'; };
  const pose = (el, x, dim) => { el.style.transform = `translate3d(${x}px,0,0)`; el.style.filter = dim ? `brightness(${(1 - dim).toFixed(3)})` : ''; };
  const prep = () => {
    html.classList.add('sw-on');
    Object.assign(view.style, { position: 'relative', zIndex: '1', minHeight: Math.max(0, innerHeight - topEdge()) + 'px', willChange: 'transform' });
  };
  const unprep = () => {
    html.classList.remove('sw-on');
    ['transform', 'filter', 'transition', 'position', 'z-index', 'min-height', 'will-change', 'background', 'box-shadow'].forEach((p) => view.style.removeProperty(p));
  };
  const dropLayer = () => { if (d && d.layer) { d.layer.remove(); d.layer = null; } };
  const setup = (dir) => {
    dropLayer();
    d.dir = dir;
    const ni = d.i - dir;
    if (ni >= 0 && ni < ORDER.length) d.layer = mkLayer(dir < 0 ? 'in' : 'under', ORDER[ni]);
    view.style.background = dir > 0 && d.layer ? 'var(--bg)' : '';
    view.style.boxShadow = dir > 0 && d.layer ? '-10px 0 20px rgba(0,0,0,.22)' : '';
  };
  const apply = () => {
    const w = W(), dx = d.dx, pr = Math.min(1, Math.abs(dx) / w);
    tr(view, false);
    if (!d.layer) { pose(view, dx * 0.2, 0); return; } // 到頭了：只做橡皮筋
    tr(d.layer, false);
    if (d.dir < 0) { pose(d.layer, w + dx, 0); pose(view, dx * RET, pr * 0.25); }
    else { pose(view, dx, 0); pose(d.layer, -RET * w * (1 - pr), (1 - pr) * 0.25); }
  };
  function finish(s, commit) {
    busy = true;
    const w = W(), dir = s.dir, ni = s.i - dir, dx = s.dx, pr = Math.min(1, Math.abs(dx) / w);
    const later = (fn, ms) => setTimeout(fn, reduce ? 0 : ms);
    const go = () => { window.scrollTo(0, 0); location.hash = '#/' + ORDER[ni]; };
    if (!commit) {
      tr(view, true); pose(view, 0, 0);
      if (s.layer) { tr(s.layer, true); if (dir < 0) pose(s.layer, w, 0); else pose(s.layer, -RET * w, 0.25); }
      later(() => { if (s.layer) s.layer.remove(); unprep(); busy = false; }, DUR + 30);
      return;
    }
    if (dir < 0) { // 往左：新頁蓋上
      tr(s.layer, true); pose(s.layer, 0, 0); tr(view, true); pose(view, -RET * w, 0.25);
      later(() => { unprep(); go(); setTimeout(() => { s.layer.remove(); busy = false; }, 90); }, DUR + 30);
      return;
    }
    // 往右：目前頁面複製成一層繼續滑出，真正的新頁面在底下由退後位置回到原位
    const r = view.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'sw-layer sw-ghost';
    ghost.style.top = r.top + 'px'; ghost.style.height = r.height + 'px'; ghost.style.bottom = 'auto';
    const clone = view.cloneNode(true);
    clone.removeAttribute('id'); clone.removeAttribute('style');
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.appendChild(clone);
    pose(ghost, dx, 0);
    document.body.appendChild(ghost);
    if (s.layer) s.layer.remove();
    unprep(); prep();
    view.style.minHeight = '';
    tr(view, false); pose(view, -RET * w * (1 - pr), (1 - pr) * 0.25);
    go();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      tr(ghost, true); pose(ghost, w, 0); tr(view, true); pose(view, 0, 0);
      later(() => { ghost.remove(); unprep(); busy = false; }, DUR + 30);
    }));
  }

  document.addEventListener('pointerdown', (e) => {
    if (busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const i = ORDER.indexOf(route$);
    if (i < 0 || e.clientX < 24) return; // 螢幕最左緣留給系統的返回手勢
    if (e.target.closest('.top, .tabbar, .fsheet, .cal, .scroll, input, select, textarea')) return;
    d = { id: e.pointerId, x: e.clientX, y: e.clientY, i, lock: 0, dx: 0, v: 0, lx: e.clientX, lt: e.timeStamp, dir: 0, layer: null };
  });
  document.addEventListener('pointermove', (e) => {
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.lock) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.3) { d = null; return; } // 以直向捲動為主
      d.lock = 1; prep();
    }
    const dir = dx < 0 ? -1 : 1;
    if (dir !== d.dir) setup(dir);
    d.dx = dx;
    const dt = e.timeStamp - d.lt;
    if (dt > 0) d.v = 0.8 * d.v + 0.2 * ((e.clientX - d.lx) / dt);
    d.lx = e.clientX; d.lt = e.timeStamp;
    apply();
  });
  const end = (e) => {
    if (!d || d.id !== e.pointerId) return;
    const s = d; d = null;
    if (!s.lock) return;
    mute = Date.now() + 350;
    const pr = Math.abs(s.dx) / W(), ni = s.i - s.dir;
    const fast = Math.abs(s.v) > 0.5 && Math.sign(s.v) === s.dir;
    finish(s, !!s.layer && ni >= 0 && ni < ORDER.length && e.type === 'pointerup' && (pr > 0.35 || (fast && pr > 0.06)));
  };
  document.addEventListener('dragstart', (e) => { if (d) e.preventDefault(); }); // 滑鼠拖曳比賽卡片（連結）時不要啟動瀏覽器的拖放
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('click', (e) => { if (Date.now() < mute) { e.preventDefault(); e.stopPropagation(); } }, true); // 滑鼠拖曳放開時不要誤觸點擊
}

// 在比分頁最上方往下拉：標題欄提示「下拉更新／放開更新」，放開後重新載入。
export function initPull(refresh) {
  const THRESH = 56;                    // 內容被拉下的距離（已套用阻力）超過這個值，放開才會更新
  let t0 = null, busy = false, saved = '';
  const note = (txt) => { const u = $('#updated'); if (u) { if (txt) u.textContent = txt; else if (saved) u.textContent = saved; } };
  const reset = (anim) => {
    view.style.transition = anim ? 'transform .26s cubic-bezier(.22,.8,.3,1)' : 'none';
    view.style.transform = '';
    setTimeout(() => { if (!t0) view.style.removeProperty('transition'); }, 300);
  };
  document.addEventListener('touchstart', (e) => {
    t0 = null;
    if (busy || route$ !== 'scores' || e.touches.length !== 1 || window.scrollY > 0) return;
    if (e.target.closest('.top, .tabbar, .fsheet, .cal, .scroll')) return;
    const t = e.touches[0];
    t0 = { x: t.clientX, y: t.clientY, lock: 0, pull: 0 };
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!t0) return;
    const t = e.touches[0], dx = t.clientX - t0.x, dy = t.clientY - t0.y;
    if (!t0.lock) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) { t0 = null; return; }
      t0.lock = 1;
      const u = $('#updated'); saved = u ? u.textContent : '';
    }
    const pull = Math.min(110, dy * 0.5);
    t0.pull = pull;
    view.style.transition = 'none';
    view.style.transform = `translate3d(0,${pull}px,0)`;
    note(pull >= THRESH ? '放開更新' : '下拉更新');
  }, { passive: true });
  const end = async () => {
    const s = t0; t0 = null;
    if (!s || !s.lock) return;
    if (s.pull >= THRESH) {
      busy = true;
      reset(true);
      note('更新中…');
      try { await refresh(); } catch (e) { /* 失敗由橫幅顯示 */ }
      busy = false;
      const u = $('#updated'); if (u && u.textContent === '更新中…') u.textContent = saved;
    } else {
      reset(true);
      note(saved);
    }
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
}

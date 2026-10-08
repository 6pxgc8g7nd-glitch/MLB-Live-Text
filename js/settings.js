/* 設定頁與最愛球隊選單 */
import { $, esc, store } from './util.js';
import { TEAMS, ABBR, teamName, logo } from './dict.js';
import { S, view, setRoute, setG } from './state.js';
import { setHeader } from './shell.js';

export const favSumHTML = () => (S.favs.length
  ? S.favs.slice(0, 4).map((id) => logo({ id }, 'fsl')).join('') + (S.favs.length > 4 ? `<em>+${S.favs.length - 4}</em>` : '')
  : '<em>尚未選擇</em>');
export function openFavSheet() {
  const old = document.getElementById('favSheet'); if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.id = 'favSheet'; wrap.className = 'fsheet';
  const ids = Object.keys(TEAMS).map(Number).sort((x, y) => (ABBR[x] || '').localeCompare(ABBR[y] || ''));
  wrap.innerHTML = `<div class="fs-bg"></div><div class="fs-p" role="dialog" aria-label="選擇最愛球隊"><div class="fs-grab"></div>
    <div class="fs-h"><b>選擇最愛球隊</b><span id="favN"></span><button id="favClear">清除</button></div>
    <div class="fgrid">${ids.map((id) => `<button class="ft${S.favs.includes(id) ? ' on' : ''}" data-ft="${id}" aria-pressed="${S.favs.includes(id)}" aria-label="${esc(teamName({ id }))}">${logo({ id }, 'tcl')}<span>${esc(ABBR[id] || '')}</span></button>`).join('')}</div>
    <button class="fs-done" id="favDone">完成</button></div>`;
  document.body.appendChild(wrap);
  const upd = () => {
    wrap.querySelector('#favN').textContent = S.favs.length ? `已選 ${S.favs.length} 隊` : '';
    wrap.querySelector('#favClear').hidden = !S.favs.length;
  };
  upd();
  const close = () => {
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 200);
    const sum = document.getElementById('favSum'); if (sum) sum.innerHTML = favSumHTML();
  };
  wrap.addEventListener('click', (e) => {
    const ft = e.target.closest('[data-ft]');
    if (ft) {
      const id = Number(ft.dataset.ft);
      S.favs = S.favs.includes(id) ? S.favs.filter((x) => x !== id) : S.favs.concat(id);
      store.set('favs', S.favs);
      ft.classList.toggle('on', S.favs.includes(id));
      ft.setAttribute('aria-pressed', S.favs.includes(id));
      upd();
    } else if (e.target.closest('#favClear')) {
      S.favs = []; store.set('favs', []);
      wrap.querySelectorAll('.ft').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', false); });
      upd();
    } else if (e.target.closest('#favDone') || e.target.classList.contains('fs-bg')) close();
  });
  requestAnimationFrame(() => wrap.classList.add('show'));
}

export function showSettings() {
  setRoute('settings');
  setHeader('設定', false, 'settings');
  view.innerHTML = `
    <div class="set">
      <div class="srow stack"><div><b>排名預設檢視</b><small>進入排名頁時先看哪一種</small></div>
        <div class="sch">${[['division', '分區'], ['league', '聯盟'], ['post', '季後賽'], ['bracket', '對戰樹']].map(([k, n]) => `<button data-sv2="${k}" class="${S.standDef === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <button class="srow srbtn" id="favOpen"><div><b>我的最愛球隊</b><small>選擇後，比分、排名與季後賽頁會標示這些球隊</small></div><span class="fsum" id="favSum">${favSumHTML()}</span><span class="chev">›</span></button>
      <div class="srow"><div><b>更新應用程式</b><small id="verTxt">清除快取並重新載入最新版本</small></div><button class="sact" id="reloadApp">更新</button></div>
    </div>`;
  fetch('sw.js', { cache: 'no-store' }).then((r) => r.text()).then((t) => {
    const m = /VERSION\s*=\s*'([^']+)'/.exec(t);
    const el = $('#verTxt');
    if (m && el) el.textContent = '目前版本 ' + m[1] + '・清除快取並重新載入';
  }).catch(() => {});
  setG(null);
}

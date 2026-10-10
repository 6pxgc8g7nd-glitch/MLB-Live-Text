/* 介面圖示：一律用內嵌 SVG（跟著文字顏色），不用 emoji／符號字元——它們在不同系統上會變成彩色的 emoji 圖案 */
const svg = (body, vb = '0 0 24 24') => `<svg class="ic" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
export const IC = {
  play: svg('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>'),
  pause: svg('<rect x="6" y="4.5" width="4.2" height="15" rx="1.2" fill="currentColor"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" fill="currentColor"/>'),
  prev: svg('<rect x="5" y="5" width="2.6" height="14" rx="1" fill="currentColor"/><path d="M19 5.2v13.6L9 12z" fill="currentColor"/>'),
  next: svg('<rect x="16.4" y="5" width="2.6" height="14" rx="1" fill="currentColor"/><path d="M5 5.2v13.6L15 12z" fill="currentColor"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  replay: svg('<path d="M5 12a7 7 0 1 0 2.2-5.1M5 4.5v4.2h4.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
};

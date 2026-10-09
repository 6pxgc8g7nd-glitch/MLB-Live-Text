/* 共用狀態：設定值、目前頁面、輪詢器、比賽頁狀態 */
import { store, twDate } from './util.js';

export const S = {
  boxMore: store.get('boxMore', false),
  lang: store.get('lang', 'zh'),
  date: twDate(),
  follow: true, // true = 跟著「今天」，台灣 0:00 自動換日
  standDef: ['division', 'league', 'post', 'bracket'].includes(store.get('standView', 'division')) ? store.get('standView', 'division') : 'division',
  standView: 'division',
  gtab: store.get('gtab', 'text'),
  autoFollow: store.get('autoFollow', false),
  gFold: false, // 比賽頁工具列：每次進入都是展開，收合只在這一次停留有效
  favs: store.get('favs', []),
};
export let view = null;
export let poller = null;
export let token = 0; // 每次換頁 +1，舊請求回來時用來丟棄
export let route$ = 'scores';
export let G = null; // 目前比賽頁狀態

// 匯出的 let 在其他模組是唯讀的，一律透過這些函式改值
export const setView = (v) => { view = v; };
export const setPoller = (p) => { poller = p; };
export const nextToken = () => ++token;
export const setRoute = (r) => { route$ = r; };
export const setG = (g) => { G = g; };

export function stopPoller() {
  if (poller) poller.stop();
  poller = null;
}

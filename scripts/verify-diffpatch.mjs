/* 在比賽進行中驗證差異更新：反覆抓 diffPatch 套用到本地資料，再抓同一時間點的整份 feed 逐欄比對
 *
 *   node scripts/verify-diffpatch.mjs <gamePk> [分鐘數，預設 5]
 *
 * 每一輪印出：差異大小、整份大小、比對結果。最後統計省下的流量；有任何不一致就以 exit 1 結束。 */
import { applyPatch } from '../js/livefeed.js';

const [pk, minArg] = process.argv.slice(2);
if (!/^\d+$/.test(pk || '')) { console.error('用法：node scripts/verify-diffpatch.mjs <gamePk> [分鐘數]'); process.exit(2); }
const until = Date.now() + (Number(minArg) || 5) * 60000;
const base = `https://statsapi.mlb.com/api/v1.1/game/${pk}/feed/live`;
const get = async (u) => { const r = await fetch(u); const t = await r.text(); return { bytes: t.length, data: JSON.parse(t) }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 找出第一個不同的欄位，方便除錯
function firstDiff(a, b, path = '') {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return `${path || '/'}：${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}：型別不同`;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = firstDiff(a[k], b[k], `${path}/${k}`);
    if (d) return d;
  }
  return null;
}

let doc = (await get(base)).data;
if (doc.gameData.status.abstractGameState !== 'Live') console.warn(`注意：這場比賽目前是 ${doc.gameData.status.detailedState}，不是進行中，MLB 可能只會回整份資料`);
let diffBytes = 0, fullBytes = 0, rounds = 0, patched = 0, fullReplies = 0, bad = 0;
while (Date.now() < until) {
  await sleep(5000);
  const ts = doc.metaData.timeStamp;
  const r = await get(`${base}/diffPatch?startTimecode=${ts}`);
  if (Array.isArray(r.data)) {
    if (!r.data.length) { console.log(`${ts}  沒有變動`); continue; }
    r.data.forEach((x) => applyPatch(doc, x.diff || []));
    patched++;
  } else { doc = r.data; fullReplies++; }
  const now = doc.metaData.timeStamp;
  // 同一時間點的整份，用來比對：目前的整份時間戳記相同就用它，否則抓該時間點的快照
  let ref = await get(base);
  if (ref.data.metaData.timeStamp !== now) ref = await get(`${base}?timecode=${now}`);
  rounds++; diffBytes += r.bytes; fullBytes += ref.bytes;
  // 只比對 App 實際用到的部分：外層的 copyright、metaData 裡的事件清單等，兩個端點本來就不同
  const strip = (x) => ({ timeStamp: x.metaData && x.metaData.timeStamp, gameData: x.gameData, liveData: x.liveData });
  const d = firstDiff(strip(doc), strip(ref.data));
  if (d) bad++;
  console.log(`${ts} → ${now}  ${Array.isArray(r.data) ? '差異' : '整份'} ${(r.bytes / 1024).toFixed(1)} KB / 整份 ${(ref.bytes / 1024).toFixed(0)} KB  ${d ? '✗ 不一致 ' + d : '✓ 一致'}`);
  if (d) doc = ref.data; // 重新對齊後繼續
}
console.log(`\n共 ${rounds} 輪：套用差異 ${patched} 次、MLB 回整份 ${fullReplies} 次、不一致 ${bad} 次`);
if (rounds) console.log(`流量：差異 ${(diffBytes / 1024).toFixed(0)} KB，若每次抓整份則為 ${(fullBytes / 1024).toFixed(0)} KB（約省 ${Math.round((1 - diffBytes / fullBytes) * 100)}%）`);
process.exit(bad ? 1 : 0);

/* 比賽資料的差異更新（LIVE 模式用）
 * 完整的 feed/live 一份動輒數百 KB；LIVE 模式每秒更新時改抓 diffPatch，只拿上次之後變動的部分（JSON Patch）。
 * MLB 覺得差太多時會直接回整份；格式不對或套用失敗就退回抓整份，所以最壞情況等同原本的做法。 */

const FULL_EVERY = 120; // 連續套用這麼多次差異後，強制抓一次整份重新對齊

// RFC 6901：JSON Pointer 的 ~1 → /、~0 → ~
const unesc = (s) => s.replace(/~1/g, '/').replace(/~0/g, '~');

function parent(doc, path) {
  const keys = path.split('/').slice(1).map(unesc);
  const last = keys.pop();
  let o = doc;
  for (const k of keys) {
    if (o == null || typeof o !== 'object' || !(k in o)) throw new Error(`patch 路徑不存在：${path}`);
    o = o[k];
  }
  if (o == null || typeof o !== 'object') throw new Error(`patch 路徑不存在：${path}`);
  return [o, last];
}
const getAt = (doc, path) => { const [o, k] = parent(doc, path); if (!(k in o)) throw new Error(`patch 路徑不存在：${path}`); return o[k]; };
const clone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

// 依 RFC 6902 套用 add / remove / replace / copy / move / test，直接改動 doc
export function applyPatch(doc, ops) {
  for (const op of ops || []) {
    if (!op || typeof op.path !== 'string') throw new Error('patch 格式不符');
    if (op.path === '') throw new Error('不支援替換整份文件的 patch');
    const [o, k] = parent(doc, op.path);
    const arr = Array.isArray(o);
    const idx = arr ? (k === '-' ? o.length : Number(k)) : null;
    if (arr && (!Number.isInteger(idx) || idx < 0 || idx > o.length)) throw new Error(`patch 索引不符：${op.path}`);
    switch (op.op) {
      case 'add':
        if (arr) o.splice(idx, 0, op.value); else o[k] = op.value;
        break;
      case 'replace':
        if (arr ? idx >= o.length : !(k in o)) throw new Error(`replace 目標不存在：${op.path}`);
        o[arr ? idx : k] = op.value;
        break;
      case 'remove':
        if (arr ? idx >= o.length : !(k in o)) throw new Error(`remove 目標不存在：${op.path}`);
        if (arr) o.splice(idx, 1); else delete o[k];
        break;
      case 'copy':
      case 'move': {
        const v = getAt(doc, op.from);
        if (op.op === 'move') applyPatch(doc, [{ op: 'remove', path: op.from }]);
        applyPatch(doc, [{ op: 'add', path: op.path, value: op.op === 'copy' ? clone(v) : v }]);
        break;
      }
      case 'test':
        if (JSON.stringify(getAt(doc, op.path)) !== JSON.stringify(op.value)) throw new Error(`test 不符：${op.path}`);
        break;
      default:
        throw new Error(`不支援的 patch 操作：${op.op}`);
    }
  }
  return doc;
}

/* 取得比賽資料。g：比賽頁狀態（用 g.data 當作上一份、g.diffN 計數）；useDiff：是否嘗試差異更新。
 * 回傳 { data, mode }，mode 是 'full'（整份）、'diff'（套用差異）或 'same'（沒有變動） */
export async function loadLiveFeed(api, pk, g, useDiff) {
  const base = `/api/v1.1/game/${pk}/feed/live`;
  const prev = g && g.data;
  const ts = prev && prev.metaData && prev.metaData.timeStamp;
  const full = async () => { g.diffN = 0; return { data: await api(base), mode: 'full' }; };
  if (!useDiff || !ts || (g.diffN || 0) >= FULL_EVERY) return full();
  try {
    const r = await api(`${base}/diffPatch?startTimecode=${encodeURIComponent(ts)}`);
    if (Array.isArray(r)) {
      if (!r.length) return { data: prev, mode: 'same' };
      // 先在複本上套用：套到一半失敗時，畫面上的資料不會是半新半舊
      const next = clone(prev);
      r.forEach((x) => applyPatch(next, (x && x.diff) || []));
      if (!next.metaData || !next.metaData.timeStamp) throw new Error('套用後缺少時間戳記');
      g.diffN = (g.diffN || 0) + 1;
      return { data: next, mode: 'diff' };
    }
    if (r && r.gameData && r.liveData) { g.diffN = 0; return { data: r, mode: 'full' }; } // 差太多時 MLB 直接回整份
    throw new Error('diffPatch 回傳格式不符');
  } catch (e) {
    console.warn('差異更新失敗，改抓整份', e);
    return full();
  }
}

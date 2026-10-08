/* sw.js 的快取清單（SHELL）與版本號（VERSION）維護工具
 *
 *   node scripts/sw.mjs sync         依照實際檔案重寫 SHELL；外殼有變動且 VERSION 還沒調過時，自動 +1
 *   node scripts/sw.mjs check [base] 檢查 SHELL 是否與實際檔案一致；給 base（git ref）時，
 *                                    也檢查 base 之後外殼有變動的話 VERSION 有沒有調高（CI 用）
 *   node scripts/sw.mjs precommit    pre-commit hook 用：暫存區有外殼檔案時執行 sync 並把 sw.js 加入提交
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = path.join(ROOT, 'sw.js');

// 外殼檔案：更動這些檔案，使用者端就需要新的 VERSION 才會換掉舊快取
const SHELL_RE = /^(index\.html|style\.css|manifest\.webmanifest|sw\.js|app\.js|js\/[^/]+\.js|icons\/[^/]+\.png|logos\/[^/]+\.svg)$/;

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
const ls = (dir, ext) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(ext)).sort().map((f) => `${dir}/${f}`);

function shellList() {
  const top = ['index.html', 'style.css', ...ls('js', '.js'), 'manifest.webmanifest'];
  return ['./', ...top, ...ls('icons', '.png'), ...ls('logos', '.svg')];
}

const readVersion = (src) => (/const VERSION = '([^']+)'/.exec(src) || [])[1];
const readShell = (src) => {
  const m = /const SHELL = \[([\s\S]*?)\];/.exec(src);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
};
const renderShell = (list) => `const SHELL = [\n${list.map((f) => `  '${f}',`).join('\n')}\n];`;
const versionAt = (ref) => { try { return readVersion(git('show', `${ref}:sw.js`)); } catch { return null; } };
const bump = (v) => v.replace(/\d+$/, (n) => String(Number(n) + 1));
const changedSince = (ref) => git('diff', '--name-only', ref, 'HEAD').split('\n').filter((f) => SHELL_RE.test(f));
const dirtyShell = () => git('status', '--porcelain', '--untracked-files=all').split('\n').map((l) => l.slice(3).replace(/^.* -> /, '')).filter((f) => SHELL_RE.test(f));
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

function sync({ force = false } = {}) {
  let src = fs.readFileSync(SW, 'utf8');
  const want = shellList();
  const listChanged = !same(readShell(src), want);
  if (listChanged) src = src.replace(/const SHELL = \[[\s\S]*?\];/, renderShell(want));
  const cur = readVersion(src), head = versionAt('HEAD');
  let next = cur;
  if ((force || listChanged) && cur === head) next = bump(cur);
  if (next !== cur) src = src.replace(/const VERSION = '[^']+'/, `const VERSION = '${next}'`);
  fs.writeFileSync(SW, src);
  return { listChanged, from: cur, to: next };
}

function check(base) {
  const src = fs.readFileSync(SW, 'utf8');
  const problems = [];
  const want = shellList(), have = readShell(src) || [];
  if (!same(have, want)) {
    const miss = want.filter((f) => !have.includes(f)), extra = have.filter((f) => !want.includes(f));
    problems.push(`sw.js 的 SHELL 和實際檔案不一致（缺少：${miss.join(', ') || '無'}；多出：${extra.join(', ') || '無'}）`);
  }
  let files = [];
  if (base && !/^0+$/.test(base)) {
    try { files = changedSince(base); } catch { console.warn(`找不到 ${base}（可能是 force push），略過版本號比對`); base = null; }
  }
  if (base && !/^0+$/.test(base)) {
    const v0 = versionAt(base), v1 = readVersion(src);
    if (files.length && v0 && v0 === v1) problems.push(`外殼檔案有變動（${files.join(', ')}），但 VERSION 仍是 ${v1}`);
  }
  if (problems.length) {
    problems.forEach((p) => console.error('✗ ' + p));
    console.error('請執行 node scripts/sw.mjs sync 後再提交。');
    process.exit(1);
  }
  console.log(`✓ sw.js 正常（VERSION ${readVersion(src)}，SHELL ${want.length} 個檔案）`);
}

function precommit() {
  const staged = git('diff', '--cached', '--name-only').split('\n').filter((f) => SHELL_RE.test(f));
  if (!staged.length) return;
  const r = sync({ force: true });
  git('add', 'sw.js');
  if (r.from !== r.to) console.log(`sw.js：VERSION ${r.from} → ${r.to}${r.listChanged ? '，已更新 SHELL 清單' : ''}`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'sync') {
  const r = sync({ force: dirtyShell().length > 0 });
  console.log(r.from === r.to ? `VERSION 維持 ${r.to}（外殼沒有變動，或這次已經調過）` : `VERSION ${r.from} → ${r.to}`);
} else if (cmd === 'check') check(arg);
else if (cmd === 'precommit') precommit();
else { console.error('用法：node scripts/sw.mjs sync | check [base] | precommit'); process.exit(2); }

/* 打席動畫：用真實比賽（2019 世界大賽第 1 戰）精簡出來的 19 個打席當 fixture，不連網路。
 * 檢查：每個打席、每個時間點的畫面狀態都是有限數字；幾種代表性打席（全壘打、滾地球傳殺、雙殺、盜壘、保送、接殺、三振）的動畫行為。 */
import assert from 'node:assert';
import fs from 'node:fs';
import { buildScript, frameAt } from '../js/anim.js';

const plays = JSON.parse(fs.readFileSync(new URL('./fixtures/plays-599371.json', import.meta.url))).allPlays;
const by = new Map(plays.map((p) => [p.about.atBatIndex, p]));
const script = (n) => buildScript(by.get(n), by.get(n - 1));
const hitSeg = (sc) => sc.segs.find((s) => s.kind === 'hit');
const pos = (r) => [Math.round(r.x), Math.round(r.y)];

// 1) 全部掃一遍：每 0.05 秒一格，所有座標都要是有限數字；場景只會是 pitch / field；鏡頭轉場進度在 0~1
let frames = 0;
for (const p of plays) {
  if (!p.playEvents.some((e) => e.isPitch)) continue;
  const sc = buildScript(p, by.get(p.about.atBatIndex - 1));
  assert.ok(sc.segs.length > 0 && sc.total > 2, `打席 ${p.about.atBatIndex} 有時間表`);
  for (let t = 0; t <= sc.total + 0.5; t += 0.05) {
    const f = frameAt(sc, t);
    frames++;
    assert.ok(f.scene === 'pitch' || f.scene === 'field');
    assert.ok(f.m >= 0 && f.m <= 1);
    const nums = [];
    if (f.ball) nums.push(f.ball.x, f.ball.y, f.ball.z);
    if (f.cam) nums.push(f.cam.cx, f.cam.y0, f.cam.y1, f.cam.minW);
    f.runners.forEach((r) => nums.push(r.x, r.y));
    f.fielders.forEach((q) => nums.push(q.x, q.y));
    assert.ok(nums.every(Number.isFinite), `打席 ${p.about.atBatIndex} t=${t.toFixed(2)} 出現非數字`);
  }
}
assert.ok(frames > 3000, '至少掃了幾千格');

// 2) 全壘打（Zimmerman）：過牆、火花、金色橫幅，沒有野手任務
{
  const sc = script(12), h = hitSeg(sc);
  assert.strictEqual(sc.hr, true);
  assert.ok(h.cross && h.cross.t > h.t0 && h.cross.t <= h.t1);
  assert.strictEqual(sc.bannerT, h.cross.t);
  assert.ok(frameAt(sc, h.cross.t + 0.3).fx, '過牆後有火花');
  assert.ok(!h.legs, '全壘打沒有傳球');
  assert.strictEqual(frameAt(sc, sc.total).runners.length, 0, '繞完壘回到本壘後消失');
}

// 3) 滾地球（Kendrick）：游擊手接球傳一壘，打者要等球到才出局
{
  const sc = script(10), h = hitSeg(sc);
  assert.deepStrictEqual(h.legs.map((l) => l.kind), ['throw']);
  const bat = sc.ents[0].moves[0];
  assert.ok(bat.out && bat.t0 + bat.dur > h.legs[0].t1);
  const ss = frameAt(sc, h.t1 + 0.1).fielders.find((q) => q.pos === 'SS');
  assert.ok(ss.x < 0 && ss.y < 140, '游擊手跑去接球');
  const f1 = frameAt(sc, sc.total).fielders.find((q) => q.pos === '1B');
  assert.deepStrictEqual(pos(f1), [64, 64]);
}

// 4) 雙殺（Zimmerman 打出的）：兩次傳球，兩個跑者都出局
{
  const sc = script(47), h = hitSeg(sc);
  assert.deepStrictEqual(h.legs.map((l) => l.kind), ['throw', 'throw']);
  assert.strictEqual(sc.ents.filter((e) => e.moves.some((m) => m.out)).length, 2);
  assert.strictEqual(frameAt(sc, sc.total).runners.length, 0);
}

// 5) 盜壘（Turner 盜二壘）：兩球之間切到球場畫面，字幕「盜二壘成功」，跑者從一壘跑到二壘
{
  const sc = script(1), seg = sc.segs.find((s) => s.kind === 'play');
  assert.ok(seg && frameAt(sc, seg.t0 + 0.3).scene === 'field');
  assert.deepStrictEqual(sc.evcaps.map((e) => e.text), ['盜二壘成功']);
  assert.deepStrictEqual(frameAt(sc, 0).runners.map(pos), [[64, 64]], '一開始跑者站在一壘');
  assert.deepStrictEqual(frameAt(sc, sc.total).runners.map(pos), [[0, 127]]);
}

// 6) 保送：字幕「四壞球」，打者最後站在一壘
{
  const sc = script(4);
  assert.deepStrictEqual(sc.evcaps.map((e) => e.text), ['四壞球']);
  assert.deepStrictEqual(frameAt(sc, sc.total).runners.map(pos), [[64, 64]]);
}

// 7) 接殺（外野飛球）沒有傳球，壘上原有的跑者留在原位；三振的打者不會跑出去
{
  const fly = script(15);
  assert.ok(!hitSeg(fly).legs || hitSeg(fly).legs.length === 0);
  assert.deepStrictEqual(frameAt(fly, fly.total).runners.map(pos), [[64, 64]]);
  const k = script(2);
  assert.ok(!k.segs.some((s) => s.kind === 'hit'));
  assert.ok(!k.ents.some((e) => e.moves.some((m) => m.path[0] === 'H')), '三振的打者沒有跑壘');
}

// 8) 三振＋盜壘同一球：字幕是「盜二壘成功」，不是「三振」
{
  const sc = script(7);
  assert.ok(sc.evcaps.some((e) => e.text === '盜二壘成功') && !sc.evcaps.some((e) => e.text === '三振'));
}

console.log('animation tests passed (' + frames + ' frames)');

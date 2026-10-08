import assert from 'node:assert';
import { twDate, shiftDate } from '../js/util.js';
import { evZh, seriesZh } from '../js/dict.js';
import { gameState, cardHTML } from '../js/scores.js';
import { headHTML, textHTML, boxHTML, liveHTML } from '../js/game.js';
import { standingsHTML } from '../js/standings.js';
import { S, setG } from '../js/state.js';
import { pLink, pickStat, playerCardHTML } from '../js/player.js';
import { wpPoints, wpHTML } from '../js/winprob.js';
import { tcToMs, stampAt, halfStarts, barLabel } from '../js/replay.js';
import { applyPatch, loadLiveFeed } from '../js/livefeed.js';

const T = { twDate, shiftDate, evZh, seriesZh, gameState, cardHTML, headHTML, textHTML, boxHTML, standingsHTML, S, setG };

// 日期：台灣 0:00 換日
assert.strictEqual(T.twDate(new Date('2026-10-07T15:59:59Z')), '2026-10-07');
assert.strictEqual(T.twDate(new Date('2026-10-07T16:00:00Z')), '2026-10-08');
assert.strictEqual(T.shiftDate('2026-10-01', -1), '2026-09-30');
assert.strictEqual(T.shiftDate('2026-12-31', 1), '2027-01-01');

// 事件翻譯與回退
assert.strictEqual(T.evZh('Home Run'), '全壘打');
assert.strictEqual(T.evZh('Stolen Base 2B'), '盜二壘成功');
assert.strictEqual(T.evZh('Some New Event'), 'Some New Event');
assert.strictEqual(T.evZh(undefined), '');

// 賽程樣本（取自實際 API 回傳結構）
const live = {
  gamePk: 849833, gameType: 'D', gameDate: '2026-10-07T20:00:00Z', seriesDescription: 'AL Division Series', seriesGameNumber: 3,
  status: { abstractGameState: 'Live', detailedState: 'In Progress' },
  teams: { away: { team: { id: 114, name: 'Cleveland Guardians' }, score: 5, leagueRecord: { wins: 0, losses: 2 } },
           home: { team: { id: 145, name: 'Chicago White Sox' }, score: 2, leagueRecord: { wins: 2, losses: 0 } } },
  linescore: { currentInning: 6, inningState: 'Top', outs: 1, scheduledInnings: 9 },
};
const pre = {
  gamePk: 849838, gameType: 'D', gameDate: '2026-10-08T00:00:00Z', seriesDescription: 'AL Division Series', seriesGameNumber: 3,
  status: { abstractGameState: 'Preview', detailedState: 'Pre-Game' },
  teams: { away: { team: { id: 139 } , probablePitcher: { fullName: 'A B' } }, home: { team: { id: 147 } } },
  linescore: {},
};
const warm = { ...pre, status: { abstractGameState: 'Live', detailedState: 'Warmup' } };
const fin = { ...live, status: { abstractGameState: 'Final', detailedState: 'Final' }, linescore: { currentInning: 11, scheduledInnings: 9 } };
const ppd = { ...pre, status: { abstractGameState: 'Preview', detailedState: 'Postponed' } };

let s = T.gameState(live.status, live.linescore, live.gameDate);
assert.deepStrictEqual(s, { k: 'live', txt: '6局上 1出局' });
assert.strictEqual(T.gameState(pre.status, pre.linescore, pre.gameDate).txt, '08:00');
assert.strictEqual(T.gameState(warm.status, warm.linescore, warm.gameDate).k, 'upcoming');
assert.ok(T.gameState(fin.status, fin.linescore, fin.gameDate).txt.includes('延長11局'));
assert.strictEqual(T.gameState(ppd.status, ppd.linescore, ppd.gameDate).txt, '延賽');
assert.strictEqual(T.seriesZh(live), '美聯分區系列賽');

const html = T.cardHTML(live);
assert.ok(html.includes('美聯分區系列賽 第3戰') && html.includes('6局上'));
assert.ok(T.cardHTML(pre).includes('g-foot pp'));
assert.ok(T.cardHTML({ gamePk: 1 }).length > 0); // 全空欄位不丟錯

// 單場：缺值保護與基本渲染
T.setG({ filter: 'all', limit: 60, open: new Set() });
const empty = {};
T.headHTML(empty); T.boxHTML(empty, 'away'); T.textHTML(empty);

const feed = {
  gameData: { status: live.status, teams: { away: { id: 114, name: 'Cleveland Guardians' }, home: { id: 145, name: 'Chicago White Sox' } },
              datetime: { dateTime: '2026-10-07T20:00:00Z' }, venue: { name: 'Rate Field' } },
  liveData: {
    linescore: { currentInning: 6, inningState: 'Top', outs: 1, balls: 0, strikes: 0, scheduledInnings: 9,
      innings: [{ num: 1, home: { runs: 1 }, away: {} }, { num: 2, home: {}, away: {} }, { num: 3, home: {}, away: { runs: 4 } }],
      teams: { home: { runs: 2, hits: 5, errors: 0 }, away: { runs: 5, hits: 5, errors: 0 } },
      offense: { first: { id: 1 }, batter: { fullName: 'Patrick Bailey' } }, defense: { pitcher: { fullName: 'Noah Schultz' } } },
    plays: { allPlays: [
      { about: { atBatIndex: 0, inning: 1, halfInning: 'top', isComplete: true, isScoringPlay: false },
        result: { event: 'Strikeout', description: 'X strikes out.' }, matchup: { batter: { fullName: 'X' }, pitcher: { fullName: 'Y' } }, count: { outs: 1 } },
      { about: { atBatIndex: 1, inning: 1, halfInning: 'top', isComplete: true, isScoringPlay: true },
        result: { event: 'Home Run', description: 'Z homers.', rbi: 2, awayScore: 2, homeScore: 0 },
        matchup: { batter: { fullName: 'Z' }, pitcher: { fullName: 'Y' } },
        playEvents: [{ hitData: { launchSpeed: 105.3, launchAngle: 28, totalDistance: 410 } }, { isSubstitution: true, details: { description: 'Pitching Change: A replaces B.' } }] },
      { about: { atBatIndex: 1, inning: 1, halfInning: 'top', isComplete: true, isScoringPlay: true }, // 重複同一打席，需去重
        result: { event: 'Home Run', description: 'Z homers (corrected).', rbi: 2, awayScore: 2, homeScore: 0 },
        matchup: { batter: { fullName: 'Z' }, pitcher: { fullName: 'Y' } },
        playEvents: [{ hitData: { launchSpeed: 105.3, launchAngle: 28, totalDistance: 410 } }, { isSubstitution: true, details: { description: 'Pitching Change: A replaces B.' } }] },
      { about: { atBatIndex: 2, inning: 1, halfInning: 'bottom', isComplete: false }, result: {}, matchup: { batter: { fullName: 'Q' }, pitcher: { fullName: 'R' } } },
    ] },
    boxscore: { teams: { away: { batters: [10, 11], pitchers: [20],
      players: {
        ID10: { person: { fullName: 'Hitter One' }, position: { abbreviation: 'CF' }, battingOrder: '100', stats: { batting: { atBats: 3, runs: 1, hits: 2, rbi: 1 } }, seasonStats: { batting: { avg: '.301' } } },
        ID11: { person: { fullName: 'Sub Guy' }, battingOrder: '101', stats: { batting: { atBats: 0 } } },
        ID20: { person: { fullName: 'Pitcher One' }, stats: { pitching: { inningsPitched: '5.0', strikeOuts: 6, pitchesThrown: 77 } }, seasonStats: { pitching: { era: '3.10' } } } } } } },
  },
};
T.setG({ filter: 'all', limit: 60, open: new Set([1]) });
const head = T.headHTML(feed);
assert.ok(head.includes('ls3'));
const t = T.textHTML(feed);
assert.strictEqual(t.total, 2, '同一打席應去重，進行中的打席不算');
assert.ok((t.html.includes('擊出') && t.html.includes('>全壘打<')) && t.html.includes('2分打點') && t.html.includes('初速 105.3 mph'));
assert.ok(!t.html.includes('打擊中') && !t.html.includes('1局下'), '進行中的打席改放 LIVE 分頁');
assert.ok(t.html.includes('Z homers (corrected).'), '應保留最新版本');
assert.ok(t.html.indexOf('Z homers') < t.html.indexOf('X strikes out'), '最新在最上面');
T.S.lang = 'en';
assert.ok(T.textHTML(feed).html.includes('Top 1'));
T.S.lang = 'zh';
T.setG({ filter: 'score', limit: 60, open: new Set() });
assert.strictEqual(T.textHTML(feed).total, 1);
const box = T.boxHTML(feed, 'away');
assert.ok(box.includes('Hitter One') && box.includes('.301') && box.includes('Pitcher One') && box.includes('3.10') && box.includes('pc sub'));

// 排名：樣本結構
const stand = { records: [
  { league: { id: 103 }, division: { id: 201 }, teamRecords: [
    { team: { id: 139 }, wins: 98, losses: 64, winningPercentage: '.605', gamesBack: '-', divisionRank: '1', leagueRank: '1', clinchIndicator: 'z', streak: { streakCode: 'L1' },
      records: { splitRecords: [{ type: 'lastTen', wins: 5, losses: 5 }] } },
    { team: { id: 147 }, wins: 93, losses: 68, winningPercentage: '.578', gamesBack: '4.5', divisionRank: '2', leagueRank: '2' } ] } ] };
let sh = T.standingsHTML(stand);
assert.ok(sh.includes('美聯東區') && sh.includes('坦帕灣光芒') && sh.includes('tcs') && sh.includes('例行賽最佳'));
T.S.standView = 'league';
sh = T.standingsHTML(stand);
assert.ok(sh.includes('聯盟排名'));
assert.ok(T.standingsHTML({}).includes('目前沒有排名資料'));

// 球員小卡
assert.strictEqual(pLink({ fullName: 'No Id' }, 'b'), 'No Id', '沒有 id 就只顯示名字');
assert.strictEqual(pLink(null, 'b'), '');
const lk = pLink({ id: 7, fullName: 'A <b>' }, 'b', { id: 9, fullName: 'P' });
assert.ok(lk.includes('data-player="7"') && lk.includes('data-vs="9"') && lk.includes('A &lt;b&gt;'), '名字要跳脫');
const st = (type, group, splits) => ({ type: { displayName: type }, group: { displayName: group }, splits });
const traded = [st('season', 'hitting', [{ team: { id: 1 }, stat: { avg: '.200' } }, { team: { id: 2 }, stat: { avg: '.300' } }, { stat: { avg: '.250' } }])];
assert.strictEqual(pickStat(traded, 'season', 'hitting').stat.avg, '.250', '交易球員取合計');
assert.strictEqual(pickStat(traded, 'season', 'pitching'), null);
const hitter = { fullName: 'Hit Ter', primaryNumber: '5', primaryPosition: { abbreviation: '1B' }, batSide: { code: 'L' }, pitchHand: { code: 'R' }, currentAge: 26, currentTeam: { id: 145 },
  stats: [st('season', 'hitting', [{ season: '2026', stat: { gamesPlayed: 127, avg: '.207', homeRuns: 35, rbi: 77, stolenBases: 1, ops: '.825' } }])] };
let pc = playerCardHTML(hitter, 'b', { name: 'Pit Cher', stat: { plateAppearances: 4, atBats: 3, hits: 1, homeRuns: 1, baseOnBalls: 1, strikeOuts: 1, avg: '.333' } });
assert.ok(pc.includes('#5') && pc.includes('一壘手') && pc.includes('左打右投') && pc.includes('2026 本季打擊') && pc.includes('.825'));
assert.ok(pc.includes('生涯打擊') && pc.includes('尚無數據'), '缺生涯數據不丟錯');
assert.ok(pc.includes('對上投手 Pit Cher') && pc.includes('3 打數 1 安打') && pc.includes('1 全壘打') && pc.includes('.333'));
pc = playerCardHTML(hitter, 'p', null); // 點的是投手身分但只有打擊數據：改顯示打擊
assert.ok(pc.includes('本季打擊') && !pc.includes('對戰'));
assert.ok(playerCardHTML(hitter, 'b', { name: 'X', stat: {} }).includes('首次對戰'));
const twp = { fullName: 'Two Way', stats: [st('season', 'hitting', [{ stat: { avg: '.275' } }]), st('season', 'pitching', [{ stat: { era: '1.79', wins: 8, losses: 2 } }])] };
assert.ok(playerCardHTML(twp, 'p').includes('1.79') && playerCardHTML(twp, 'p').includes('8-2'), '二刀流點投手看投球');
assert.ok(playerCardHTML(twp, 'b').includes('.275'));
assert.ok(playerCardHTML(undefined, 'b').includes('找不到'));
// 轉播文字裡的名字可點，且帶對戰對象
T.setG({ filter: 'all', limit: 60, open: new Set() });
const fp = { ...feed, liveData: { ...feed.liveData, plays: { allPlays: [{ about: { atBatIndex: 0, inning: 1, halfInning: 'top', isComplete: true }, result: { event: 'Single' },
  matchup: { batter: { id: 11, fullName: 'Bat' }, pitcher: { id: 22, fullName: 'Pit' } }, count: { outs: 0 } }] } } };
const th = T.textHTML(fp).html;
assert.ok(th.includes('data-player="11" data-role="b" data-vs="22"') && th.includes('data-player="22" data-role="p" data-vs="11"'));

// 勝率走勢
const wpRaw = [
  { homeTeamWinProbability: 52.2, homeTeamWinProbabilityAdded: 2.2, about: { inning: 1, isTopInning: true, isComplete: true }, result: { event: 'Groundout' }, matchup: { batter: { fullName: 'A' } } },
  { homeTeamWinProbability: 26.2, homeTeamWinProbabilityAdded: -26, about: { inning: 1, isTopInning: true, isComplete: true }, result: { event: 'Home Run' }, matchup: { batter: { fullName: 'B <i>' } } },
  { homeTeamWinProbability: 40, homeTeamWinProbabilityAdded: 13.8, about: { inning: 1, isTopInning: false, isComplete: true }, result: { event: 'Double' }, matchup: { batter: { fullName: 'C' } } },
  { homeTeamWinProbability: 99, about: { inning: 2, isTopInning: true, isComplete: false }, result: {}, matchup: {} }, // 進行中的打席不畫
];
const wpts = wpPoints(wpRaw);
assert.strictEqual(wpts.length, 4, '開賽點＋3 個完成的打席');
assert.strictEqual(Math.round(wpts[0].h), 50, '開賽勝率由第一個打席回推');
assert.ok(wpts[2].top && !wpts[3].top && wpts[2].ev === '全壘打');
assert.deepStrictEqual(wpPoints([]), []);
assert.strictEqual(wpHTML(wpts.slice(0, 1), {}, {}, 340), '', '少於兩點不畫');
const wh = wpHTML(wpts, { id: 114 }, { id: 145 }, 340);
assert.ok(wh.includes('class="wp-line"') && wh.includes('>CWS<') && wh.includes('>CLE<') && wh.includes('50%'));
assert.ok(wh.includes('CWS 60%') || wh.includes('CLE 60%'), '目前勝率以領先方表示');
assert.ok(wh.includes('B &lt;i&gt; 全壘打') && wh.indexOf('B &lt;i&gt;') < wh.indexOf('>C 二壘安打'), '影響最大的打席依幅度排序且跳脫');
assert.ok(wh.includes('CLE +26%'), '客隊得利的打席歸給客隊');

// 重播模式：時間點換算與搜尋
assert.strictEqual(tcToMs('20261007_205955'), Date.parse('2026-10-07T20:59:55Z'));
const tms = ['20261007_200000', '20261007_200015', '20261007_200030'].map(tcToMs);
assert.strictEqual(stampAt(tms, tms[1] + 5000), 1, '取不晚於目前時間的最後一筆');
assert.strictEqual(stampAt(tms, tms[2] + 1), 2);
assert.strictEqual(stampAt(tms, tms[0] - 1), 0, '比第一筆還早就用第一筆');
const hs = halfStarts([
  { about: { inning: 1, isTopInning: true, startTime: '2026-10-07T20:08:10Z' } },
  { about: { inning: 1, isTopInning: true, startTime: '2026-10-07T20:09:10Z' } },
  { about: { inning: 1, isTopInning: false, startTime: '2026-10-07T20:15:00Z' } },
  { about: { inning: 2, halfInning: 'top', startTime: '2026-10-07T20:21:00Z' } },
]);
assert.deepStrictEqual(hs.map((h) => `${h.inning}${h.top ? '上' : '下'}`), ['1上', '1下', '2上']);
assert.strictEqual(hs[1].t, Date.parse('2026-10-07T20:15:00Z'));

// 差異更新：JSON Patch 套用
const doc = { metaData: { timeStamp: 't1' }, a: { 'x/y': 1, list: [1, 2, 3] } };
applyPatch(doc, [
  { op: 'replace', path: '/metaData/timeStamp', value: 't2' },
  { op: 'add', path: '/a/list/-', value: 4 },
  { op: 'add', path: '/a/list/0', value: 0 },
  { op: 'remove', path: '/a/list/1' },
  { op: 'replace', path: '/a/x~1y', value: 9 },
  { op: 'copy', from: '/a/list', path: '/a/copy' },
  { op: 'move', from: '/a/copy', path: '/b' },
  { op: 'test', path: '/b/0', value: 0 },
]);
assert.deepStrictEqual(doc, { metaData: { timeStamp: 't2' }, a: { 'x/y': 9, list: [0, 2, 3, 4] }, b: [0, 2, 3, 4] });
assert.throws(() => applyPatch(doc, [{ op: 'replace', path: '/nope/x', value: 1 }]), /路徑不存在/);
assert.throws(() => applyPatch(doc, [{ op: 'replace', path: '/a/list/9', value: 1 }]), /索引不符/);
assert.throws(() => applyPatch(doc, [{ op: 'frobnicate', path: '/a' }]), /不支援/);

// 差異更新：抓資料的流程（假的 api，記錄打了哪些網址）
const fakeApi = (replies) => { const calls = []; const f = async (p) => { calls.push(p); const r = replies.shift(); if (r instanceof Error) throw r; return r; }; f.calls = calls; return f; };
const fullDoc = () => ({ metaData: { timeStamp: 't1' }, gameData: {}, liveData: { plays: { allPlays: [1] } } });
let gs = { data: fullDoc() }, fa = fakeApi([[{ diff: [{ op: 'replace', path: '/metaData/timeStamp', value: 't2' }, { op: 'add', path: '/liveData/plays/allPlays/-', value: 2 }] }]]);
let res = await loadLiveFeed(fa, 7, gs, true);
assert.strictEqual(res.mode, 'diff');
assert.ok(fa.calls[0].includes('/diffPatch?startTimecode=t1'));
assert.deepStrictEqual(res.data.liveData.plays.allPlays, [1, 2]);
assert.deepStrictEqual(gs.data.liveData.plays.allPlays, [1], '套用在複本上，原本的資料不動');
gs = { data: fullDoc() }; fa = fakeApi([[]]);
assert.strictEqual((await loadLiveFeed(fa, 7, gs, true)).mode, 'same');
gs = { data: fullDoc() }; fa = fakeApi([{ ...fullDoc(), metaData: { timeStamp: 't9' } }]);
res = await loadLiveFeed(fa, 7, gs, true);
assert.ok(res.mode === 'full' && res.data.metaData.timeStamp === 't9', 'MLB 回整份時直接用');
const warn = console.warn; console.warn = () => {};
gs = { data: fullDoc() }; fa = fakeApi([[{ diff: [{ op: 'replace', path: '/no/such', value: 1 }] }], fullDoc()]);
res = await loadLiveFeed(fa, 7, gs, true);
assert.ok(res.mode === 'full' && fa.calls[1] === '/api/v1.1/game/7/feed/live', '套用失敗就改抓整份');
gs = { data: fullDoc() }; fa = fakeApi([new Error('HTTP 500'), fullDoc()]);
assert.strictEqual((await loadLiveFeed(fa, 7, gs, true)).mode, 'full', '差異請求失敗也改抓整份');
console.warn = warn;
gs = { data: fullDoc() }; fa = fakeApi([fullDoc()]);
await loadLiveFeed(fa, 7, gs, false);
assert.strictEqual(fa.calls[0], '/api/v1.1/game/7/feed/live', '沒開 LIVE 模式就照舊抓整份');
gs = { data: fullDoc(), diffN: 120 }; fa = fakeApi([fullDoc()]);
await loadLiveFeed(fa, 7, gs, true);
assert.ok(!fa.calls[0].includes('diffPatch') && gs.diffN === 0, '定期抓整份重新對齊');

// 重播按鈕只出現在已結束的比賽；控制列的進度文字
const finFeed = { ...feed, gameData: { ...feed.gameData, status: { abstractGameState: 'Final', detailedState: 'Final' } } };
assert.ok(T.headHTML(finFeed).includes('id="rpStart"'), '已結束的比賽有重播按鈕');
assert.ok(!T.headHTML(feed).includes('id="rpStart"'), '進行中的比賽沒有重播按鈕');
assert.strictEqual(barLabel({ inning: 3, half: 'Top', outs: 1, balls: 2, strikes: 1 }), '3局上 1出局 2-1');
assert.strictEqual(barLabel({ inning: 3, half: 'Middle' }), '3局中場');
assert.strictEqual(barLabel({ inning: 0 }), '開賽前');
assert.strictEqual(barLabel({ inning: 9, half: 'Bottom', done: true }), '重播結束');

// LIVE 分頁：目前打席、今日成績與用球數、下一棒、上一打席
const lvFeed = { ...feed, liveData: { ...feed.liveData,
  linescore: { ...feed.liveData.linescore, inningState: 'Bottom', currentInning: 1, outs: 1,
    offense: { first: { id: 10 }, batter: { id: 30, fullName: 'Q' }, onDeck: { id: 31, fullName: 'Deck Guy' }, inHole: { id: 32, fullName: 'Hole Guy' } } },
  plays: { allPlays: [
    feed.liveData.plays.allPlays[1],
    { about: { atBatIndex: 2, inning: 1, halfInning: 'bottom', isComplete: false }, result: {}, count: { balls: 2, strikes: 1, outs: 1 },
      matchup: { batter: { id: 30, fullName: 'Q' }, pitcher: { id: 20, fullName: 'Pitcher One' } },
      playEvents: [{ isPitch: true, details: { type: { code: 'SL', description: 'Slider' }, isBall: true, call: { description: 'Ball' } }, count: { balls: 1, strikes: 0 }, pitchData: { startSpeed: 85.2, coordinates: { pX: -1, pZ: 1.2 } } }] },
  ] } } };
const lv = liveHTML(lvFeed);
assert.ok(!lv.includes('lv-sit') && !lv.includes('class="bases"'), '局數／壘包／球數大卡已移除（目前打席條已有）');
assert.ok(lv.includes('data-player="30"') && lv.includes('data-player="20"'), '打者與投手可開小卡');
assert.ok(lv.includes('用球數 <b>77</b>') && lv.includes('今日 5.0 局'), '投手今日用球數');
assert.ok(lv.includes('滑球') && lv.includes('class="pz"'), '本打席的每一球');
assert.ok(lv.includes('Deck Guy') && lv.includes('Hole Guy'), '下一棒、再下一棒');
assert.ok(lv.includes('上一打席') && lv.includes('全壘打'), '上一打席結果');
const gap = liveHTML({ ...lvFeed, liveData: { ...lvFeed.liveData, linescore: { ...lvFeed.liveData.linescore, inningState: 'Middle' } } });
assert.ok(gap.includes('換場中') && gap.includes('接下來：Q、Deck Guy、Hole Guy'), '半局之間顯示換場與接下來的打者');
assert.ok(liveHTML({}).includes('比賽即將開始'), '全空資料不丟錯');
const withBat = (id, batting) => { const f = JSON.parse(JSON.stringify(lvFeed)); f.liveData.plays.allPlays[1].matchup.batter = { id, fullName: 'B' }; if (batting) f.liveData.boxscore.teams.away.players['ID' + id] = { stats: { batting } }; return liveHTML(f); };
assert.ok(withBat(10).includes('今日 3 打數 2 安打 ・ 1 打點'), '打者今日成績');
assert.ok(withBat(99, { atBats: 0, plateAppearances: 0 }).includes('今日首打席'));
assert.ok(!withBat(10).includes('打擊率'), '不放容易誤會的季後賽累計打擊率');

console.log('all tests passed');

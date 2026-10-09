import assert from 'node:assert';
import { twDate, shiftDate, weekdayEn, monthDay } from '../js/util.js';
import { segLabel, calYears, calTitleHTML } from '../js/shell.js';
import { evZh, seriesZh } from '../js/dict.js';
import { gameState, cardHTML } from '../js/scores.js';
import { pitcherPitches, pitchTypeStats, pitcherMapHTML } from '../js/pitchmap.js';
import { headHTML, textHTML, boxHTML, liveHTML, recapTarget } from '../js/game.js';
import { standingsHTML, bracketHTML, lastNoon, nextNoon, isFreshDaily } from '../js/standings.js';
import { pollWait, nextWait, createPoller } from '../js/api.js';
import { S, setG } from '../js/state.js';
import { pLink, pickStat, playerCardHTML, teamInGame } from '../js/player.js';
import { logo } from '../js/dict.js';
import { wpPoints, wpHTML } from '../js/winprob.js';
import { tcToMs, stampAt, halfStarts, barLabel } from '../js/replay.js';

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
assert.ok(lv.includes('<b>滑球</b>') && lv.includes('85.2&nbsp;mph') && lv.includes('class="pz"'), '本打席的每一球：第一行球種、第二行球速與結果');
assert.ok(lv.includes('<em>壞球 · 1-0</em>'), '結果與球數');
{ // 英文：長的球種名稱照樣完整出現，沒有球速時只剩結果
  T.S.lang = 'en';
  const en = liveHTML(lvFeed);
  assert.ok(en.includes('<b>Slider</b>'), '英文球種名稱');
  T.S.lang = 'zh';
}
assert.ok(lv.includes('class="play live open"') && lv.includes('進行中'), '進行中的打席用文字轉播的卡片樣式，固定展開');
assert.ok(lv.includes('class="pd"') && lv.includes('上一球') && !lv.includes('決勝球'), '每一球的圓點與「上一球」摘要（進行中不叫決勝球）');
const noPitch = JSON.parse(JSON.stringify(lvFeed)); noPitch.liveData.plays.allPlays[1].playEvents = [];
assert.ok(liveHTML(noPitch).includes('等待第一球'), '還沒投球：卡片裡提示等待第一球');
const withSub = JSON.parse(JSON.stringify(lvFeed)); withSub.liveData.plays.allPlays[1].playEvents.push({ isSubstitution: true, details: { description: 'Pitching Change: A replaces B.' } });
assert.strictEqual((liveHTML(withSub).match(/class="chg pc"/g) || []).length, 1, '換投手只顯示一次（在卡片裡）');
assert.ok(!lv.includes('Deck Guy') && !lv.includes('上一打席'), '下一棒與上一打席的卡片已移除');
// 半局之間：回顧剛結束的半局（局數表的得分／安打／殘壘、每個打席的結果、投手與用球數）
const mid = (state, extra) => { const f = JSON.parse(JSON.stringify(lvFeed)); f.liveData.linescore.inningState = state; f.liveData.linescore.innings[0].away = { runs: 2, hits: 1, leftOnBase: 0 }; f.liveData.plays.allPlays = f.liveData.plays.allPlays.filter((p) => p.about.isComplete !== false); if (extra) extra(f); return f; };
const gap = liveHTML(mid('Middle'));
assert.ok(gap.includes('1局上 回顧') && gap.includes('CLE 進攻・換場中'), '回顧剛結束的上半局，標示換場中');
assert.ok(gap.includes('class="rc-r">+2<') && gap.includes('CLE 2 – 0 CWS'), '本半局得分與比數');
assert.ok(gap.includes('<b>2</b><small>得分</small>') && gap.includes('<b>1</b><small>安打</small>') && gap.includes('<b>0</b><small>殘壘</small>'), '得分／安打／殘壘');
assert.ok(gap.includes('>Z<') && gap.includes('全壘打') && gap.includes('2分打點') && gap.includes('class="hot"'), '打席結果，得分的打席標紅');
assert.ok(gap.includes('投手') && !gap.includes('接下來') && !gap.includes('上一打席'), '有投手；舊的接下來／上一打席已移除');
assert.ok(!gap.includes('lv-mu'), '半局之間不顯示打者／投手卡');
const gap2 = liveHTML(mid('End', (f) => { f.liveData.linescore.currentInning = 3; f.liveData.linescore.innings[2] = { home: { runs: 0, hits: 0, leftOnBase: 1 }, away: {} }; }));
assert.ok(gap2.includes('3局下 回顧') && gap2.includes('CWS 進攻'), '下半局結束回顧下半局（沒有打席也不丟錯）');
assert.ok(liveHTML(mid('Top', (f) => { f.liveData.linescore.currentInning = 2; })).includes('1局下'), '新半局還沒有打席：回顧它的前一個半局');
assert.ok(liveHTML(mid('Top', (f) => { f.liveData.linescore.currentInning = 1; })).includes('等待第一個打席'), '第一局開始前沒有可回顧的半局');
assert.ok(liveHTML(mid('Bottom')).includes('等待下一個打席'), '打席之間標示等待下一個打席');
assert.deepStrictEqual(recapTarget({ currentInning: 4, inningState: 'Middle' }), { inning: 4, top: true });
assert.deepStrictEqual(recapTarget({ currentInning: 4, inningState: 'End' }), { inning: 4, top: false });
assert.deepStrictEqual(recapTarget({ currentInning: 4, inningState: 'Top' }), { inning: 3, top: false });
assert.deepStrictEqual(recapTarget({ currentInning: 4, inningState: 'Bottom' }), { inning: 4, top: true });
assert.strictEqual(recapTarget({ currentInning: 1, inningState: 'Top' }), null);
assert.strictEqual(recapTarget({}), null);
T.S.lang = 'en';
assert.ok(liveHTML(mid('Middle')).includes('Home Run'), '英文模式顯示原文結果');
T.S.lang = 'zh';
assert.ok(liveHTML({}).includes('比賽即將開始'), '全空資料不丟錯');
const withBat = (id, batting) => { const f = JSON.parse(JSON.stringify(lvFeed)); f.liveData.plays.allPlays[1].matchup.batter = { id, fullName: 'B' }; if (batting) f.liveData.boxscore.teams.away.players['ID' + id] = { stats: { batting } }; return liveHTML(f); };
assert.ok(withBat(10).includes('今日 3 打數 2 安打 ・ 1 打點'), '打者今日成績');
assert.ok(withBat(99, { atBats: 0, plateAppearances: 0 }).includes('今日首打席'));
assert.ok(withBat(10).includes('class="lv-av"') && withBat(10).includes('<b>.301</b>'), '右側大數字：打者打擊率');
assert.ok(lv.includes('<b>3.10</b>') && lv.includes('ERA'), '右側大數字：投手防禦率');
const noBat = withBat(99, { atBats: 0 });
assert.strictEqual((noBat.match(/class="lv-av"/g) || []).length, 1, '投手的防禦率照常顯示');
assert.ok(noBat.includes('class="lv-av na"><b>–</b><small>AVG</small>'), '打者沒有打擊率：顯示灰色「–」與標籤，不留空白');
const withType = (type, era) => { const f = JSON.parse(JSON.stringify(lvFeed)); f.gameData.game = { type }; f.liveData.boxscore.teams.away.players.ID20.seasonStats.pitching.era = era; return liveHTML(f); };
assert.ok(withType('D', '3.10').includes('季後賽 ERA'), '季後賽標示季後賽');
assert.ok(withType('R', '3.10').includes('本季 ERA'), '例行賽標示本季');
assert.ok(withType('R', '-.--').includes('class="lv-av na"><b>–</b><small>本季 ERA</small>'), '防禦率沒有數字（-.--）：顯示「–」與標籤');
assert.ok(withType('R', null).includes('<b>–</b><small>本季 ERA</small>'), '沒有這項資料：同樣顯示「–」');
const noPit = JSON.parse(JSON.stringify(lvFeed)); noPit.liveData.plays.allPlays[1].matchup.pitcher = { id: 777, fullName: 'New Arm' };
assert.ok(liveHTML(noPit).includes('<b>–</b><small>ERA</small>'), '投手不在數據裡（剛上場）：顯示「–」');
assert.ok(!withType('R', '-.--').includes('-.--'), '不把 MLB 的 -.-- 原樣丟給畫面');

// LIVE 分頁：打者／投手資訊在打席卡裡，沒有另外的卡、也沒有重複的「打擊中…」
assert.ok(lv.includes('class="lv-who"') && !lv.includes('lv-mu') && !lv.includes('打擊中'), '打者／投手兩列放進打席卡，取代「打擊中」那行');
assert.strictEqual((lv.match(/class="play live open"/g) || []).length, 1, 'LIVE 只有一張打席卡');

// 半局回顧：依內容變化（標籤、事件、精簡模式）
const rcFeed = (plays, innings, { state = 'Middle', cur = 1, players = {} } = {}) => ({
  gameData: { teams: { away: { id: 114 }, home: { id: 145 } }, players, status: { abstractGameState: 'Live', detailedState: 'In Progress' } },
  liveData: { linescore: { currentInning: cur, inningState: state, innings }, plays: { allPlays: plays } },
});
const pl = (idx, inn, top, ev, x = {}) => ({
  about: { atBatIndex: idx, inning: inn, isTopInning: top, halfInning: top ? 'top' : 'bottom', isComplete: true, isScoringPlay: !!x.score },
  result: { event: ev, rbi: x.rbi, awayScore: x.a, homeScore: x.h },
  matchup: { batter: { id: 100 + idx, fullName: 'B' + idx }, pitcher: { id: 900, fullName: 'Pit' } }, playEvents: x.pe || [],
});
const inn0 = [{ away: { runs: 0, hits: 0, leftOnBase: 0 }, home: {} }];
const quiet3 = liveHTML(rcFeed([pl(0, 1, true, 'Groundout'), pl(1, 1, true, 'Flyout'), pl(2, 1, true, 'Lineout')], inn0));
assert.ok(quiet3.includes('lv-rc quiet') && quiet3.includes('三上三下') && !quiet3.includes('rc-g') && !quiet3.includes('rc-r'), '三上三下：精簡版，不放得分／安打／殘壘三格');
const kkk = liveHTML(rcFeed([pl(0, 1, true, 'Strikeout'), pl(1, 1, true, 'Strikeout'), pl(2, 1, true, 'Strikeout')], inn0));
assert.ok(kkk.includes('三者三振') && kkk.includes('三上三下'), '三者三振');
const lead = (before, plays2, ex) => liveHTML(rcFeed([...before, ...plays2], [{ away: {}, home: { runs: before.length ? 1 : 0 } }, { away: { runs: 2, hits: 2, leftOnBase: 1 }, home: {} }], { cur: 2, ...ex }));
const hrB = pl(0, 1, false, 'Home Run', { score: true, rbi: 1, a: 0, h: 1 });
assert.ok(lead([hrB], [pl(1, 2, true, 'Single'), pl(2, 2, true, 'Home Run', { score: true, rbi: 2, a: 2, h: 1 })]).includes('反超比數'), '原本落後、這局超前：反超比數');
assert.ok(lead([hrB], [pl(1, 2, true, 'Home Run', { score: true, rbi: 1, a: 1, h: 1 })]).includes('追平比數'), '追平');
assert.ok(lead([], [pl(1, 2, true, 'Home Run', { score: true, rbi: 2, a: 2, h: 0 })]).includes('取得領先'), '原本平手、得分後領先：取得領先');
const ahead = pl(0, 1, true, 'Home Run', { score: true, rbi: 1, a: 1, h: 0 });
assert.ok(lead([ahead], [pl(1, 2, true, 'Double', { score: true, rbi: 1, a: 2, h: 0 })]).includes('擴大領先'), '擴大領先');
assert.ok(lead([hrB, pl(2, 1, false, 'Home Run', { score: true, rbi: 1, a: 0, h: 2 })], [pl(3, 2, true, 'Single', { score: true, rbi: 1, a: 1, h: 2 })]).includes('追近比數'), '追近比數');
assert.ok(lead([], [pl(1, 2, true, 'Home Run', { score: true, rbi: 4, a: 4, h: 0 })]).includes('滿貫砲'), '全壘打依分數標示陽春砲／兩分砲／三分砲／滿貫砲');
const busy = liveHTML(rcFeed([
  pl(0, 1, true, 'Walk', { pe: [
    { isPitch: true, details: { call: { description: 'Ball' }, isBall: true }, reviewDetails: { isOverturned: true, challengeTeamId: 114, reviewType: 'MJ' } },
    { isPitch: false, details: { eventType: 'batter_timeout', event: 'Batter Timeout', description: 'Batter Timeout.' } },
    { isPitch: false, details: { eventType: 'game_advisory', event: 'Game Advisory', description: 'Status Change' } },
    { isPitch: false, details: { eventType: 'pitching_substitution', event: 'Pitching Substitution', description: 'Pitching Change: New Guy replaces Old Guy.' }, isSubstitution: true },
    { isPitch: false, details: { eventType: 'mound_visit', event: 'Mound Visit', description: 'Mound Visit.' } },
  ] }),
  pl(1, 1, true, 'Single', { pe: [
    { isPitch: false, details: { eventType: 'stolen_base_2b', event: 'Stolen Base 2B', description: 'Runner R steals (1) 2nd base.' }, player: { id: 5 } },
    { isPitch: false, details: { eventType: 'wild_pitch', event: 'Wild Pitch', description: 'Wild pitch by pitcher Pit. Runner R to 3rd.' }, player: { id: 5 } },
  ] }),
  pl(2, 1, true, 'Groundout'),
], [{ away: { runs: 0, hits: 1, leftOnBase: 2 }, home: {} }], { players: { ID5: { fullName: 'Runner R' } } }));
assert.ok(busy.includes('Runner R') && busy.includes('盜二壘成功') && busy.includes('class="chg pc"') && busy.includes('New Guy'), '盜壘與換投手穿插在打席之間');
assert.ok(busy.includes('暴投') && busy.includes('Wild pitch by pitcher Pit'), '暴投附英文說明');
assert.ok(busy.includes('CLE 提出好壞球挑戰') && busy.includes('判決推翻') && busy.includes('投手丘會議'), '挑戰與投手丘會議');
assert.ok(!busy.includes('Batter Timeout') && !busy.includes('Status Change'), '打者暫停、比賽通知不放');
assert.strictEqual((busy.match(/投手丘會議/g) || []).length, 2, '投手丘會議：一列加一個標籤，不重複印');
const mvs = liveHTML(rcFeed([pl(0, 1, true, 'Groundout', { pe: [1, 2, 3].map(() => ({ isPitch: false, details: { eventType: 'mound_visit', event: 'Mound Visit' } })) }), pl(1, 1, true, 'Flyout'), pl(2, 1, true, 'Lineout')], inn0));
assert.ok(mvs.includes('投手丘會議 ×3') && (mvs.match(/<li class="ac">/g) || []).length === 1, '一個半局多次投手丘會議：只放一列並標次數');
assert.ok(busy.includes('<span>盜壘</span>') && busy.includes('<span>換投</span>') && busy.includes('<span>挑戰</span>') && busy.includes('<span>暴投</span>'), '重點標籤');
assert.ok((busy.match(/<span>/g) || []).length > 0 && busy.indexOf('Runner R') < busy.indexOf('B1'), '事件排在發生它的打席之前');
const longInn = liveHTML(rcFeed([
  pl(0, 1, true, 'Single'), pl(1, 1, true, 'Groundout'), pl(2, 1, true, 'Flyout'), pl(3, 1, true, 'Grounded Into DP'),
  pl(4, 1, true, 'Strikeout'), pl(5, 1, true, 'Walk'), pl(6, 1, true, 'Lineout'),
], [{ away: { runs: 0, hits: 1, leftOnBase: 3 }, home: {} }]));
assert.ok(longInn.includes('另有 4 個出局的打席') && longInn.includes('B0') && longInn.includes('B5') && longInn.includes('B3') && !longInn.includes('>B1<'), '打席太多：出局收成一行，安打、保送、雙殺保留');
assert.ok(longInn.includes('雙殺') && longInn.includes('殘壘 3 人'), '雙殺、殘壘標籤');
const errs = liveHTML(rcFeed([pl(0, 1, true, 'Field Error'), pl(1, 1, true, 'Walk'), pl(2, 1, true, 'Walk'), pl(3, 1, true, 'Groundout')], [{ away: { runs: 0, hits: 0, leftOnBase: 2 }, home: {} }]));
assert.ok(errs.includes('<span>失誤</span>') && errs.includes('保送 ×2') && errs.includes('殘壘 2 人'), '失誤、保送、殘壘標籤');
T.S.lang = 'en';
assert.ok(liveHTML(rcFeed([pl(0, 1, true, 'Single', { pe: [{ isPitch: false, details: { eventType: 'stolen_base_2b', event: 'Stolen Base 2B', description: 'Runner R steals (1) 2nd base.' }, player: { id: 5 } }] })], inn0, { players: { ID5: { fullName: 'Runner R' } } })).includes('Runner R steals (1) 2nd base.'), '英文模式用原文');
T.S.lang = 'zh';

// 對戰樹的連線：只有最愛球隊「已經晉級」才亮，還沒分出勝負的不亮
const bg = (pk, a, h, n, st, winner) => ({
  gamePk: pk, gameType: 'D', gameDate: `2026-10-0${n}T20:00:00Z`, seriesDescription: 'AL Division Series', gamesInSeries: 5, seriesGameNumber: n,
  status: { abstractGameState: st, detailedState: st }, linescore: {},
  teams: { away: { team: { id: a }, isWinner: st === 'Final' && winner === a }, home: { team: { id: h }, isWinner: st === 'Final' && winner === h } },
});
const bracketData = { series: [
  { series: { id: 'D_1', sortNumber: 1 }, games: [bg(1, 139, 147, 1, 'Final', 147), bg(2, 139, 147, 2, 'Final', 147), bg(3, 147, 139, 3, 'Final', 147)] }, // 洋基 3–0 光芒：已晉級
  { series: { id: 'D_2', sortNumber: 2 }, games: [bg(4, 145, 114, 1, 'Final', 114), bg(5, 145, 114, 2, 'Preview')] }, // 守護者 vs 白襪：還在打
] };
const lit = (html) => (html.match(/--l[abds]:var\(--navy\)/g) || []).length;
T.S.favs = [];
assert.strictEqual(lit(bracketHTML(bracketData, false)), 0, '沒有最愛球隊：沒有亮的線');
T.S.favs = [114]; // 最愛球隊在還沒打完的系列賽
assert.strictEqual(lit(bracketHTML(bracketData, false)), 0, '最愛球隊還沒確定晉級：線不亮');
T.S.favs = [147]; // 最愛球隊已經贏下系列賽
const won = bracketHTML(bracketData, false);
assert.ok(won.includes('--la:var(--navy)') && won.includes('--ld:var(--navy)') && !won.includes('--lb:var(--navy)'), '最愛球隊已晉級：它那一側與往下的線亮，另一側不亮');
T.S.favs = [139]; // 最愛球隊已被淘汰
assert.strictEqual(lit(bracketHTML(bracketData, false)), 0, '最愛球隊被淘汰：線不亮');
T.S.favs = [];

// 日期票的星期：英文縮寫
assert.deepStrictEqual(['2020-01-05', '2020-01-06', '2020-01-07', '2020-01-08', '2020-01-09', '2020-01-10', '2020-01-11'].map(weekdayEn), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
assert.strictEqual(weekdayEn('2026-10-10'), 'Sat', '以台灣日期算星期');
assert.strictEqual(segLabel('2020-01-11', 0).name, '1/11 Sat', '不是今天：月/日 加英文星期');
assert.strictEqual(segLabel(twDate(), 0).name, 'Today');
assert.deepStrictEqual([segLabel('2020-01-11', -1).name, segLabel('2020-01-11', 1).name], ['‹', '›']);

// 日曆標題的年、月選單
assert.deepStrictEqual([calYears(2026, 2026)[0], calYears(2026, 2026).at(-1), calYears(2026, 2026).length], [2008, 2027, 20], '2008 到明年');
assert.strictEqual(calYears(2005, 2026)[0], 2005, '看的年份比下限早也補進去');
assert.strictEqual(calYears(2031, 2026).at(-1), 2031, '看的年份比上限晚也補進去');
const ct = calTitleHTML(2026, 9, 2026);
assert.ok(ct.includes('<option value="2026" selected>2026 年</option>') && ct.includes('<option value="9" selected>9 月</option>'), '目前的年、月是選中的');
assert.strictEqual((ct.match(/<option value="\d+" selected>/g) || []).length, 2, '年、月各一個選中');
assert.strictEqual((ct.match(/<option value="\d+"( selected)?>\d+ 月<\/option>/g) || []).length, 12, '十二個月都有');
assert.ok(ct.includes('aria-label="年"') && ct.includes('aria-label="月"'), '選單有無障礙標籤');

// 排名頁每天台灣中午 12 點更新一次
const Z = (s) => Date.parse(s);
assert.strictEqual(lastNoon(Z('2026-10-09T05:00:00Z')), Z('2026-10-09T04:00:00Z'), '下午一點：最近一次中午是今天 12:00（台灣）');
assert.strictEqual(lastNoon(Z('2026-10-09T03:59:59Z')), Z('2026-10-08T04:00:00Z'), '上午 11:59:59：最近一次中午是昨天');
assert.strictEqual(lastNoon(Z('2026-10-09T04:00:00Z')), Z('2026-10-09T04:00:00Z'), '剛好中午 12:00 就算今天');
assert.strictEqual(lastNoon(Z('2026-10-08T16:30:00Z')), Z('2026-10-08T04:00:00Z'), '台灣凌晨 00:30：台灣日期已經是隔天，但最近一次中午還是前一天');
assert.strictEqual(nextNoon(Z('2026-10-09T05:00:00Z')), Z('2026-10-10T04:00:00Z'), '下一個中午是明天');
assert.strictEqual(nextNoon(Z('2026-10-09T03:00:00Z')), Z('2026-10-09T04:00:00Z'), '上午：下一個中午是今天');
assert.ok(isFreshDaily(Z('2026-10-09T04:00:01Z'), Z('2026-10-09T20:00:00Z')), '中午之後抓的、同一天：新');
assert.ok(!isFreshDaily(Z('2026-10-09T03:59:59Z'), Z('2026-10-09T04:00:00Z')), '中午之前抓的、現在過了中午：舊');
assert.ok(isFreshDaily(Z('2026-10-08T05:00:00Z'), Z('2026-10-09T03:00:00Z')), '昨天下午抓的、今天中午前：還是新');
assert.ok(!isFreshDaily(0) && !isFreshDaily(null), '沒有資料或抓取失敗（時間 0）：舊');
// 輪詢等待：退避最多 60 秒，但呼叫端要求更長的間隔就照它
assert.deepStrictEqual([pollWait(1000, 0), pollWait(1000, 3), pollWait(10000, 0), pollWait(10000, 1)], [1000, 8000, 10000, 20000]);
assert.strictEqual(pollWait(20000, 4), 60000, '失敗退避最多 60 秒');
assert.strictEqual(pollWait(3 * 3600e3, 0), 3 * 3600e3, '等到隔天中午這種長間隔不被壓成 60 秒');

// 輪詢節奏：從「這一次開始」算起，扣掉下載花的時間
assert.strictEqual(nextWait(1000, 0, 370), 630, '要求每秒、下載 0.37 秒：再等 0.63 秒');
assert.strictEqual(nextWait(10000, 0, 400), 9600, '每 10 秒也是從開始算起');
assert.strictEqual(nextWait(1000, 0, 1600), 200, '下載比間隔還久：至少留 200 毫秒，不連續猛打');
assert.strictEqual(nextWait(1000, 0, 0), 1000, '沒花時間就等滿');
assert.strictEqual(nextWait(1000, 2, 370), 4000, '失敗時照退避、不扣時間');
assert.strictEqual(nextWait(3 * 3600e3, 0, 500), 3 * 3600e3 - 500, '很長的間隔（排名等到隔天中午）也照算');

// 排名資料的時鐘保護：存的時間比現在晚（手機時鐘被調過）就當過期
assert.ok(!isFreshDaily(Z('2026-10-09T10:00:00Z'), Z('2026-10-09T06:00:00Z')), '抓取時間在未來 4 小時：過期');
assert.ok(isFreshDaily(Z('2026-10-09T06:03:00Z'), Z('2026-10-09T06:00:00Z')), '只差 3 分鐘的誤差：還是新的');
assert.strictEqual(monthDay('2026-10-08'), '10/8', 'monthDay');

// 輪詢：已經沒事可更新（例如比賽結束）時，自動觸發的 kick 不再重抓；force 才抓
globalThis.document = { hidden: false, querySelector: () => null };
const mkPoller = (delay) => { let n = 0; const p = createPoller(async () => { n++; }, () => delay); return { p, calls: () => n }; };
{
  const done = mkPoller(null);
  done.p.start(); await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(done.calls(), 1, 'start 抓一次');
  await done.p.kick(); await done.p.kick();
  assert.strictEqual(done.calls(), 1, '比賽結束：回到畫面／切分頁的 kick 不再重抓');
  await done.p.kick(true);
  assert.strictEqual(done.calls(), 2, 'force 一定抓（重播換時間點）');
  done.p.stop();
  const live = mkPoller(60000);
  live.p.start(); await new Promise((r) => setTimeout(r, 30));
  await live.p.kick(); await live.p.kick();
  assert.strictEqual(live.calls(), 3, '還在更新的：kick 照常立刻抓');
  live.p.stop();
}

// 隊徽：只有大聯盟球隊；小卡的隊徽優先用「這場比賽」所屬的球隊
assert.ok(logo({ id: 147 }).includes('logos/147.svg'), '大聯盟球隊有隊徽');
assert.strictEqual(logo({ id: 534 }), '', '三 A 球隊（Rochester）沒有隊徽檔，不放，免得 404');
assert.strictEqual(logo({ id: 159 }), '', '明星賽隊伍也不放');
assert.strictEqual(logo(null), '');
assert.strictEqual(teamInGame(feed, 10), 114, '客隊名單裡的球員 → 客隊');
assert.strictEqual(teamInGame(feed, 999), null, '名單裡找不到 → null');
assert.strictEqual(teamInGame(null, 10), null);
const hb = { ...hitter, currentTeam: { id: 119 } }; // 現在的球隊是道奇
assert.ok(playerCardHTML(hb, 'b', null, 145).includes('logos/145.svg') && !playerCardHTML(hb, 'b', null, 145).includes('logos/119.svg'), '優先顯示這場比賽的球隊（白襪），不是現在的球隊');
assert.ok(playerCardHTML(hb, 'b', null, null).includes('logos/119.svg'), '不知道這場的球隊：退回目前球隊');
assert.ok(!playerCardHTML({ ...hitter, currentTeam: { id: 534 } }, 'b', null, null).includes('<img'), '目前球隊在小聯盟、又不知道這場的球隊：不放隊徽');
assert.ok(playerCardHTML({ ...hitter, currentTeam: { id: 534 } }, 'b', null, 145).includes('logos/145.svg'), '退役／下放的球員仍顯示他在這場比賽的球隊');

console.log('all tests passed');

// 投手球路：彙整球種、顏色、篩選、缺資料
{
  const pe = (code, desc, speed, x, z, call, extra) => ({ isPitch: true, details: { type: { code, description: desc }, call: { description: call }, isStrike: /strike|foul/i.test(call), isBall: /^ball/i.test(call), ...extra }, pitchData: { startSpeed: speed, coordinates: x == null ? {} : { pX: x, pZ: z }, strikeZoneTop: 3.4, strikeZoneBottom: 1.6 } });
  const d = { liveData: { plays: { allPlays: [
    { matchup: { pitcher: { id: 7 } }, playEvents: [pe('FF', 'Four-Seam Fastball', 96, 0.1, 2.5, 'Called Strike'), pe('SL', 'Slider', 87, -0.5, 1.2, 'Swinging Strike'), pe('FF', 'Four-Seam Fastball', 98, 1.2, 3.9, 'Ball'), { isPitch: false, details: {} }] },
    { matchup: { pitcher: { id: 8 } }, playEvents: [pe('CU', 'Curveball', 80, 0, 2, 'Ball')] },
    { matchup: { pitcher: { id: 7 } }, playEvents: [pe('SL', 'Slider', 86, null, null, 'Foul')] },
  ] } } };
  const ps = pitcherPitches(d, 7);
  assert.strictEqual(ps.length, 4, '只算這位投手的球，不算換人與其他投手');
  const st = pitchTypeStats(ps);
  assert.deepStrictEqual(st.map((r) => [r.code, r.n, r.pct, r.whiff]), [['FF', 2, 50, 0], ['SL', 2, 50, 1]]);
  assert.strictEqual(st[0].max, 98); assert.strictEqual(Math.round(st[0].avg), 97);
  const html = pitcherMapHTML(d, 7, null);
  assert.ok(html.includes('四縫線速球') && html.includes('滑球') && html.includes('data-pmt="FF"') && html.includes('1 球無位置'));
  assert.strictEqual((html.match(/<circle/g) || []).length, 3, '沒有位置的球不畫點');
  assert.strictEqual((pitcherMapHTML(d, 7, 'FF').match(/<circle/g) || []).length, 2, '篩選球種只畫該球種');
  assert.strictEqual(pitcherMapHTML(d, 99, null), '', '沒投球的人不顯示');
}

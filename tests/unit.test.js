import assert from 'node:assert';
import { twDate, shiftDate } from '../js/util.js';
import { evZh, seriesZh } from '../js/dict.js';
import { gameState, cardHTML } from '../js/scores.js';
import { headHTML, textHTML, boxHTML } from '../js/game.js';
import { standingsHTML } from '../js/standings.js';
import { S, setG } from '../js/state.js';

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
assert.strictEqual(t.total, 3, '同一打席應去重');
assert.ok((t.html.includes('擊出') && t.html.includes('>全壘打<')) && t.html.includes('2分打點') && t.html.includes('初速 105.3 mph') && t.html.includes('打擊中'));
assert.ok(t.html.includes('Z homers (corrected).'), '應保留最新版本');
assert.ok(t.html.indexOf('1局下') < t.html.indexOf('1局上'), '最新在最上面');
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

console.log('all tests passed');

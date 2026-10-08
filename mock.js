/* 測試模式：用「模擬比賽」取代真實資料，沒有比賽的時候也能測試轉播功能。
 * 模擬比賽依時間逐打席推進（每 8 秒一個打席），結果由固定亂數種子決定，所以每次輪詢都會得到一致的內容。 */
(function () {
  const PK = { live: 999001, final: 999002, upcoming: 999003 };
  const TEAM = { away: { id: 147, name: 'New York Yankees' }, home: { id: 119, name: 'Los Angeles Dodgers' } };
  const FIRST = ['Alex', 'Ben', 'Carlos', 'Daniel', 'Ethan', 'Felix', 'Gabe', 'Henry', 'Ivan'];
  const LAST = { away: ['Rivera', 'Sanders', 'Morales', 'Brooks', 'Ortega', 'Nakamura', 'Whitfield', 'Duarte', 'Keller'],
                 home: ['Alvarez', 'Hayes', 'Tanaka', 'Mercer', 'Delgado', 'Foster', 'Park', 'Navarro', 'Quinn'] };
  const POS = ['CF', 'SS', 'RF', 'DH', '1B', '3B', 'LF', 'C', '2B'];
  const PITCHER = { away: 'Marcus Reed', home: 'Kenji Ito' };
  const STEP = 8000;
  const PRE = 14; // 開啟測試模式時已經打完的打席數
  const bname = (side, i) => `${FIRST[i]} ${LAST[side][i]}`;
  const bid = (side, i) => (side === 'away' ? 1000 : 2000) + i + 1;
  const pid = (side) => (side === 'away' ? 1100 : 2100);

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const EVENTS = [
    ['Strikeout', 0.22], ['Groundout', 0.17], ['Flyout', 0.14], ['Single', 0.18], ['Double', 0.06], ['Walk', 0.10], ['Home Run', 0.05],
  ];
  const TYPES = [['FF', 'Four-Seam Fastball', 95], ['SL', 'Slider', 86], ['CH', 'Changeup', 87], ['CU', 'Curveball', 80]];

  function pickEvent(r) {
    const tot = EVENTS.reduce((s, e) => s + e[1], 0);
    let x = r() * tot;
    for (const [n, w] of EVENTS) { if ((x -= w) < 0) return n; }
    return 'Groundout';
  }

  function genAtBat(r, ev, b, pitcher, st) {
    // 依結果產生一串投球
    const pitches = [];
    let balls = 0, strikes = 0;
    const mk = (kind, last) => {
      const t = TYPES[Math.floor(r() * TYPES.length)];
      const inZone = kind === 'strike' || kind === 'inplay';
      const pX = inZone ? (r() - 0.5) * 1.5 : (r() < 0.5 ? -1 : 1) * (0.95 + r() * 0.5);
      const pZ = inZone ? 1.9 + r() * 1.2 : (r() < 0.5 ? 1.0 + r() * 0.5 : 3.5 + r() * 0.4);
      const p = { isPitch: true, details: { type: { code: t[0], description: t[1] } },
        pitchData: { startSpeed: +(t[2] + (r() - 0.5) * 6).toFixed(1), strikeZoneTop: 3.4, strikeZoneBottom: 1.6, coordinates: { pX: +pX.toFixed(2), pZ: +pZ.toFixed(2) } } };
      if (kind === 'ball') { balls++; p.details.isBall = true; p.details.call = { description: 'Ball' }; }
      else if (kind === 'strike') {
        const sw = r() < 0.4;
        if (strikes < 2 || last) strikes++;
        p.details.isStrike = true; p.details.call = { description: last ? 'Swinging Strike' : sw ? 'Foul' : 'Called Strike' };
      } else { p.details.isInPlay = true; p.details.call = { description: 'In play' }; }
      p.count = { balls, strikes };
      return p;
    };
    const pre = (nb, ns) => {
      const seq = [];
      for (let i = 0; i < nb; i++) seq.push('ball');
      for (let i = 0; i < ns; i++) seq.push('strike');
      seq.sort(() => r() - 0.5);
      seq.forEach((k) => pitches.push(mk(k, false)));
    };
    if (ev === 'Strikeout') { pre(Math.floor(r() * 3), 2); pitches.push(mk('strike', true)); }
    else if (ev === 'Walk') { pre(3, Math.floor(r() * 3)); pitches.push(mk('ball', true)); }
    else {
      pre(Math.floor(r() * 3), Math.floor(r() * 3));
      const p = mk('inplay', true);
      if (ev !== 'Groundout' && ev !== 'Flyout') {
        p.hitData = { launchSpeed: +(88 + r() * 20).toFixed(1), launchAngle: Math.floor(5 + r() * 30), totalDistance: Math.floor(ev === 'Home Run' ? 380 + r() * 60 : 120 + r() * 200) };
      }
      pitches.push(p);
    }
    return pitches;
  }

  function describe(ev, name, n) {
    switch (ev) {
      case 'Strikeout': return `${name} strikes out swinging.`;
      case 'Groundout': return `${name} grounds out, shortstop to first baseman.`;
      case 'Flyout': return `${name} flies out to center fielder.`;
      case 'Single': return `${name} singles on a line drive to left field.`;
      case 'Double': return `${name} doubles (${n}) on a fly ball to right field.`;
      case 'Walk': return `${name} walks.`;
      default: return `${name} homers (${n}) on a fly ball to left center field.`;
    }
  }

  function simulate(seed, nDone, partialFrac) {
    const r = rng(seed);
    const S = {
      inning: 1, half: 'top', outs: 0, bases: [null, null, null], idx: { away: 0, home: 0 }, score: { away: 0, home: 0 },
      innings: [{ num: 1, away: {}, home: {} }], final: false,
      box: { away: [], home: [] }, pit: { away: { outs: 0, h: 0, r: 0, so: 0, bb: 0, np: 0 }, home: { outs: 0, h: 0, r: 0, so: 0, bb: 0, np: 0 } },
      hrCount: {},
    };
    for (const side of ['away', 'home']) for (let i = 0; i < 9; i++) S.box[side].push({ ab: 0, r: 0, h: 0, rbi: 0, bb: 0, so: 0 });
    const plays = [];
    let inProgress = null;
    const sideOf = () => (S.half === 'top' ? 'away' : 'home');
    const defOf = () => (S.half === 'top' ? 'home' : 'away');

    for (let k = 0; k <= nDone && !S.final; k++) {
      const bs = sideOf(), ds = defOf();
      const i = S.idx[bs];
      const name = bname(bs, i);
      const ev = pickEvent(r);
      const pitches = genAtBat(r, ev, name, PITCHER[ds], S);
      if (k === nDone) { // 進行中的打席：只顯示部分投球
        inProgress = { bs, ds, i, name, ev, pitches, frac: partialFrac };
        break;
      }
      // 套用結果
      const rec = S.box[bs][i];
      const cur = { key: bs + ':' + i };
      let runs = 0;
      const scoreRunner = (rk) => { runs++; if (rk) S.box[rk.split(':')[0]][+rk.split(':')[1]].r++; };
      let outsAdd = 0;
      if (ev === 'Strikeout') { outsAdd = 1; rec.ab++; rec.so++; S.pit[ds].so++; }
      else if (ev === 'Groundout' || ev === 'Flyout') { outsAdd = 1; rec.ab++; }
      else if (ev === 'Walk') { rec.bb++; S.pit[ds].bb++; const b = S.bases; if (b[0]) { if (b[1]) { if (b[2]) scoreRunner(b[2]); b[2] = b[1]; } b[1] = b[0]; } b[0] = cur.key; }
      else if (ev === 'Single') { rec.ab++; rec.h++; S.pit[ds].h++; const b = S.bases; if (b[2]) scoreRunner(b[2]); b[2] = b[1]; b[1] = b[0]; b[0] = cur.key; }
      else if (ev === 'Double') { rec.ab++; rec.h++; S.pit[ds].h++; const b = S.bases; if (b[2]) scoreRunner(b[2]); if (b[1]) scoreRunner(b[1]); b[2] = b[0]; b[1] = cur.key; b[0] = null; }
      else { rec.ab++; rec.h++; S.pit[ds].h++; S.bases.forEach((x) => { if (x) scoreRunner(x); }); scoreRunner(cur.key); S.bases = [null, null, null]; S.hrCount[cur.key] = (S.hrCount[cur.key] || 0) + 1; }
      rec.rbi += runs;
      S.pit[ds].r += runs;
      S.pit[ds].np += pitches.length;
      S.score[bs] += runs;
      S.outs += outsAdd;
      S.pit[ds].outs += outsAdd;
      const cell = S.innings[S.inning - 1][bs === 'away' ? 'away' : 'home'];
      cell.runs = (cell.runs || 0) + runs;
      const scoring = runs > 0;
      plays.push({
        about: { atBatIndex: k, inning: S.inning, halfInning: S.half, isComplete: true, isScoringPlay: scoring },
        result: { event: ev, eventType: ev === 'Home Run' ? 'home_run' : '', description: describe(ev, name, 1 + Math.floor(rec.h + k % 20)) + (runs > 1 ? ` ${runs} runs score.` : ''), rbi: runs || undefined, awayScore: S.score.away, homeScore: S.score.home },
        matchup: { batter: { id: bid(bs, i), fullName: name }, pitcher: { id: pid(ds), fullName: PITCHER[ds] } },
        count: { outs: S.outs },
        playEvents: pitches,
      });
      S.idx[bs] = (i + 1) % 9;
      // 換半局 / 結束
      const walkoff = S.half === 'bottom' && S.inning >= 9 && S.score.home > S.score.away;
      if (walkoff) { S.final = true; break; }
      if (S.outs >= 3) {
        S.outs = 0; S.bases = [null, null, null];
        if (S.half === 'top') {
          if (S.inning >= 9 && S.score.home > S.score.away) { S.final = true; break; }
          S.half = 'bottom';
        } else {
          if (S.inning >= 9 && S.score.home !== S.score.away) { S.final = true; break; }
          if (S.inning >= 12) { S.final = true; break; }
          S.inning++; S.half = 'top'; S.innings.push({ num: S.inning, away: {}, home: {} });
        }
      }
    }
    return { S, plays, inProgress };
  }

  function sim(kind, startedAt) {
    if (kind === 'final') return simulate(77, 1000, 0);
    if (kind === 'upcoming') return simulate(5, 0, 0);
    const el = Math.max(0, Date.now() - startedAt);
    return simulate(20261008, PRE + Math.floor(el / STEP), (el % STEP) / STEP);
  }

  function boxFor(side, sm) {
    const { S } = sm;
    const players = {}, batters = [];
    for (let i = 0; i < 9; i++) {
      const b = S.box[side][i];
      const id = bid(side, i);
      batters.push(id);
      players['ID' + id] = {
        person: { id, fullName: bname(side, i) }, position: { abbreviation: POS[i] }, battingOrder: String((i + 1) * 100),
        stats: { batting: { atBats: b.ab, runs: b.r, hits: b.h, rbi: b.rbi, baseOnBalls: b.bb, strikeOuts: b.so, plateAppearances: b.ab + b.bb } },
        seasonStats: { batting: { avg: '.' + String(220 + ((i * 17) % 80)).padStart(3, '0') } },
      };
    }
    const dside = side === 'away' ? 'home' : 'away'; // 該隊的投手 = 對手打擊時的 pit[該隊]
    const p = S.pit[side === 'away' ? 'home' : 'away'];
    // S.pit[ds] 記錄「防守方投手」的數據，防守方是 ds；side 的投手對應 S.pit[side]
    const pp = S.pit[side];
    players['ID' + pid(side)] = {
      person: { id: pid(side), fullName: PITCHER[side] },
      stats: { pitching: { inningsPitched: `${Math.floor(pp.outs / 3)}.${pp.outs % 3}`, hits: pp.h, runs: pp.r, earnedRuns: pp.r, baseOnBalls: pp.bb, strikeOuts: pp.so, pitchesThrown: pp.np } },
      seasonStats: { pitching: { era: side === 'away' ? '3.21' : '2.87' } },
    };
    void dside; void p;
    return { batters, pitchers: [pid(side)], players, battingOrder: batters.map((x) => x * 100) };
  }

  function buildFeed(pk, startedAt) {
    const kind = pk === PK.final ? 'final' : pk === PK.upcoming ? 'upcoming' : 'live';
    const sm = sim(kind, startedAt);
    const { S, plays, inProgress } = sm;
    const allPlays = plays.slice();
    let balls = 0, strikes = 0;
    if (inProgress && kind === 'live') {
      const total = inProgress.pitches.length;
      const shown = inProgress.pitches.slice(0, Math.min(total - 1, Math.floor(inProgress.frac * total)));
      if (shown.length) { balls = shown[shown.length - 1].count.balls; strikes = shown[shown.length - 1].count.strikes; }
      allPlays.push({
        about: { atBatIndex: plays.length, inning: S.inning, halfInning: S.half, isComplete: false, isScoringPlay: false },
        result: { event: '', description: '' },
        matchup: { batter: { id: bid(inProgress.bs, inProgress.i), fullName: inProgress.name }, pitcher: { id: pid(inProgress.ds), fullName: PITCHER[inProgress.ds] } },
        count: { balls, strikes, outs: S.outs },
        playEvents: shown,
      });
    }
    const bs = S.half === 'top' ? 'away' : 'home', ds = bs === 'away' ? 'home' : 'away';
    const nxt = (S.idx[bs] + 1) % 9;
    const hits = (side) => S.box[side].reduce((t, b) => t + b.h, 0);
    const status = kind === 'upcoming' ? { abstractGameState: 'Preview', detailedState: 'Scheduled' }
      : S.final ? { abstractGameState: 'Final', detailedState: 'Final' } : { abstractGameState: 'Live', detailedState: 'In Progress' };
    const off = S.bases.map((x) => (x ? { id: bid(x.split(':')[0], +x.split(':')[1]) } : undefined));
    return {
      gameData: {
        status, game: { type: 'D' },
        teams: { away: Object.assign({}, TEAM.away, { record: { wins: 2, losses: 1 } }), home: Object.assign({}, TEAM.home, { record: { wins: 1, losses: 2 } }) },
        datetime: { dateTime: new Date(Date.now() + (kind === 'upcoming' ? 3 * 36e5 : -36e5)).toISOString() },
        venue: { name: 'Test Park' },
        probablePitchers: { away: { id: 9001, fullName: PITCHER.away }, home: { id: 9002, fullName: PITCHER.home } },
      },
      liveData: {
        linescore: {
          currentInning: S.inning, inningState: S.final ? 'End' : S.half === 'top' ? 'Top' : 'Bottom', outs: S.outs, balls, strikes, scheduledInnings: 9,
          innings: kind === 'upcoming' ? [] : S.innings.map((x) => ({ num: x.num, away: x.away, home: x.home })),
          teams: { away: { runs: S.score.away, hits: hits('away'), errors: 0 }, home: { runs: S.score.home, hits: hits('home'), errors: 0 } },
          offense: { first: off[0], second: off[1], third: off[2], batter: { id: bid(bs, S.idx[bs]), fullName: bname(bs, S.idx[bs]) }, onDeck: { id: bid(bs, nxt) } },
          defense: { pitcher: { id: pid(ds), fullName: PITCHER[ds] } },
        },
        plays: { allPlays },
        boxscore: { teams: { away: boxFor('away', sm), home: boxFor('home', sm) } },
        decisions: S.final ? { winner: { fullName: PITCHER[S.score.away > S.score.home ? 'away' : 'home'] }, loser: { fullName: PITCHER[S.score.away > S.score.home ? 'home' : 'away'] } } : {},
      },
    };
  }

  function scheduleGame(kind, startedAt, today) {
    const f = buildFeed(PK[kind], startedAt);
    const ls = f.liveData.linescore, gs = f.gameData.status;
    const dayStart = Date.parse(`${today}T00:00:00+08:00`);
    const t = kind === 'live' ? Math.max(dayStart + 6e4, Date.now() - 36e5)
      : kind === 'final' ? dayStart + 3e5 : Math.min(Date.now() + 3 * 36e5, dayStart + 864e5 - 6e4);
    const g = {
      gamePk: PK[kind], gameType: 'D', gameDate: new Date(t).toISOString(), seriesDescription: '測試模式', seriesGameNumber: kind === 'final' ? 1 : 2,
      status: gs,
      teams: { away: { team: TEAM.away, leagueRecord: { wins: 2, losses: 1 } }, home: { team: TEAM.home, leagueRecord: { wins: 1, losses: 2 } } },
      linescore: kind === 'upcoming' ? {} : { currentInning: ls.currentInning, inningState: ls.inningState, outs: ls.outs, scheduledInnings: 9, teams: ls.teams, innings: ls.innings },
    };
    if (kind !== 'upcoming') { g.teams.away.score = ls.teams.away.runs; g.teams.home.score = ls.teams.home.runs; }
    if (kind === 'upcoming') { g.teams.away.probablePitcher = { id: 9001, fullName: PITCHER.away }; g.teams.home.probablePitcher = { id: 9002, fullName: PITCHER.home }; }
    if (kind === 'final' || gs.abstractGameState === 'Final') g.decisions = f.liveData.decisions;
    return g;
  }

  window.MLB_MOCK = {
    isTestPk: (pk) => Object.values(PK).includes(Number(pk)),
    // 模擬比賽的即時資料；其他路徑回傳 null（交給真實 API）
    handle(path, startedAt) {
      const m = /\/game\/(\d+)\/feed\/live/.exec(path);
      if (m && this.isTestPk(m[1])) return buildFeed(Number(m[1]), startedAt);
      return null;
    },
    // 在真實資料上加入模擬資料（不改動原物件）
    decorate(path, d, today, startedAt) {
      if (/\/api\/v1\/schedule\?/.test(path) && /hydrate=/.test(path)) {
        const end = /endDate=(\d{4}-\d{2}-\d{2})/.exec(path);
        if (!end || end[1] !== today) return d;
        const games = ['live', 'final', 'upcoming'].map((k) => scheduleGame(k, startedAt, today));
        const dates = (d && d.dates ? d.dates : []).map((x) => Object.assign({}, x));
        if (dates.length) dates[dates.length - 1].games = games.concat(dates[dates.length - 1].games || []);
        else dates.push({ date: today, games });
        return Object.assign({}, d, { dates });
      }
      if (/\/api\/v1\/people\?/.test(path)) {
        const pp = (id, w, l, e) => ({ id, stats: [{ splits: [{ stat: { wins: w, losses: l, era: e } }] }] });
        return Object.assign({}, d, { people: (d && d.people ? d.people : []).concat([pp(9001, 12, 6, '3.21'), pp(9002, 14, 5, '2.87')]) });
      }
      return d;
    },
  };
})();

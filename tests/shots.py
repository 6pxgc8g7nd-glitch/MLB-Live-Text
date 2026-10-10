import json, re, subprocess, threading, time, http.server, socketserver, functools, os
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

import os, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='mlb-shots-')
os.makedirs(OUT, exist_ok=True)
PORT = 0  # 0＝由系統挑一個空的連接埠，多個測試同時跑也不會撞到

TW = timezone(timedelta(hours=8))
now = datetime.now(TW)
start = now.replace(hour=0, minute=0, second=0, microsecond=0)
iso = lambda dt: dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

def team(i, n): return {'id': i, 'name': n}

def game(pk, a, h, state, det, dt, ascore=None, hscore=None, ls=None, pp=None, num=3):
    g = {'gamePk': pk, 'gameType': 'D', 'gameDate': iso(dt), 'seriesDescription': 'AL Division Series', 'seriesGameNumber': num,
         'status': {'abstractGameState': state, 'detailedState': det},
         'teams': {'away': {'team': team(*a), 'leagueRecord': {'wins': 1, 'losses': 1}}, 'home': {'team': team(*h), 'leagueRecord': {'wins': 1, 'losses': 1}}},
         'linescore': ls or {}}
    if ascore is not None:
        g['teams']['away']['score'] = ascore; g['teams']['home']['score'] = hscore
    if pp:
        g['teams']['away']['probablePitcher'] = {'id': 101, 'fullName': pp[0]}; g['teams']['home']['probablePitcher'] = {'id': 102, 'fullName': pp[1]}
    return g

games = [
    game(1, (114, 'Cleveland Guardians'), (145, 'Chicago White Sox'), 'Live', 'In Progress', start + timedelta(hours=4), 5, 2,
         {'currentInning': 6, 'inningState': 'Top', 'outs': 1, 'scheduledInnings': 9}),
    game(2, (119, 'Los Angeles Dodgers'), (144, 'Atlanta Braves'), 'Final', 'Final', start + timedelta(hours=1), 3, 4,
         {'currentInning': 9, 'scheduledInnings': 9}, num=4),
    game(3, (139, 'Tampa Bay Rays'), (147, 'New York Yankees'), 'Preview', 'Pre-Game', start + timedelta(hours=5), pp=('Shane Baz', 'Max Fried')),
    game(4, (158, 'Milwaukee Brewers'), (135, 'San Diego Padres'), 'Preview', 'Postponed', start + timedelta(hours=6)),
]
schedule = {'dates': [{'date': start.strftime('%Y-%m-%d'), 'games': games}]}

def tr(i, w, l, pct, gb, dr, lr, clinch=None, l10=(5, 5), strk='W1'):
    t = {'team': {'id': i, 'name': ''}, 'wins': w, 'losses': l, 'winningPercentage': pct, 'gamesBack': gb,
         'divisionRank': str(dr), 'leagueRank': str(lr), 'streak': {'streakCode': strk},
         'records': {'splitRecords': [{'type': 'lastTen', 'wins': l10[0], 'losses': l10[1]}]}}
    if clinch: t['clinchIndicator'] = clinch
    return t

def rec(lg, dv, teams): return {'league': {'id': lg}, 'division': {'id': dv}, 'teamRecords': teams}
standings = {'records': [
    rec(103, 201, [tr(139, 98, 64, '.605', '-', 1, 1, 'z'), tr(147, 93, 68, '.578', '4.5', 2, 2, 'w', (4, 6), 'L1'), tr(111, 87, 75, '.537', '11.0', 3, 3, 'w'), tr(110, 79, 82, '.491', '18.5', 4, 8), tr(141, 79, 83, '.488', '19.0', 5, 9)]),
    rec(103, 202, [tr(114, 85, 77, '.525', '-', 1, 4, 'y'), tr(145, 84, 78, '.519', '1.0', 2, 5, 'w'), tr(142, 77, 85, '.475', '8.0', 3, 10), tr(116, 76, 86, '.469', '9.0', 4, 11), tr(118, 69, 93, '.426', '16.0', 5, 13)]),
    rec(103, 200, [tr(117, 81, 81, '.500', '-', 1, 6, 'y'), tr(140, 80, 82, '.494', '1.0', 2, 7), tr(136, 76, 86, '.469', '5.0', 3, 12), tr(133, 64, 98, '.395', '17.0', 4, 14), tr(108, 62, 100, '.383', '19.0', 5, 15)]),
    rec(104, 204, [tr(144, 94, 68, '.580', '-', 1, 3, 'y'), tr(143, 88, 74, '.543', '6.0', 2, 6, 'w'), tr(146, 80, 82, '.494', '14.0', 3, 9), tr(120, 77, 85, '.475', '17.0', 4, 11), tr(121, 74, 88, '.457', '20.0', 5, 13)]),
    rec(104, 205, [tr(158, 103, 59, '.636', '-', 1, 1, 'z', (8, 2), 'W5'), tr(112, 89, 73, '.549', '14.0', 2, 5, 'w'), tr(134, 82, 80, '.506', '21.0', 3, 8), tr(138, 77, 85, '.475', '26.0', 4, 10), tr(113, 75, 87, '.463', '28.0', 5, 12)]),
    rec(104, 203, [tr(119, 100, 62, '.617', '-', 1, 2, 'y'), tr(135, 91, 71, '.562', '9.0', 2, 4, 'w'), tr(109, 86, 76, '.531', '14.0', 3, 7), tr(137, 65, 97, '.401', '35.0', 4, 14), tr(115, 58, 104, '.358', '42.0', 5, 15)]),
]}

def P(idx, inn, half, ev, desc, bat, pit, score=False, rbi=None, a=None, h=None, done=True, outs=1, pe=None):
    r = {'event': ev, 'description': desc}
    if rbi: r['rbi'] = rbi
    if a is not None: r['awayScore'] = a; r['homeScore'] = h
    p = {'about': {'atBatIndex': idx, 'inning': inn, 'halfInning': half, 'isComplete': done, 'isScoringPlay': score,
                   'startTime': iso(start + timedelta(hours=4, minutes=2 * idx))},
         'result': r, 'matchup': {'batter': {'id': 1000 + idx, 'fullName': bat}, 'pitcher': {'id': 2000 + len(pit), 'fullName': pit}}, 'count': {'outs': outs}}
    if pe: p['playEvents'] = pe
    return p

plays = [
    P(0, 5, 'top', 'Strikeout', 'Steven Kwan strikes out swinging.', 'Steven Kwan', 'Noah Schultz', outs=1),
    P(1, 5, 'top', 'Single', 'Brayan Rocchio singles on a line drive to left field.', 'Brayan Rocchio', 'Noah Schultz', outs=1),
    P(2, 5, 'top', 'Double', 'Jose Ramirez doubles (14) on a fly ball to right field. Brayan Rocchio scores.', 'Jose Ramirez', 'Noah Schultz', True, 1, 5, 2, outs=1,
      pe=[{'hitData': {'launchSpeed': 101.2, 'launchAngle': 24, 'totalDistance': 332}}]),
    P(3, 5, 'bottom', 'Groundout', 'Colson Montgomery grounds out, second baseman to first baseman.', 'Colson Montgomery', 'Joey Cantillo', outs=1),
    P(4, 5, 'bottom', 'Walk', 'Miguel Vargas walks.', 'Miguel Vargas', 'Joey Cantillo', outs=1),
    P(5, 6, 'top', 'Home Run', 'Kyle Manzardo homers (22) on a fly ball to right center field.', 'Kyle Manzardo', 'Noah Schultz', True, 2, 7, 2, outs=0,
      pe=[{'isSubstitution': True, 'details': {'eventType': 'pitching_substitution', 'event': 'Pitching Substitution', 'description': 'Pitching Change: Grant Taylor replaces Noah Schultz.'}},
          {'isPitch': True, 'details': {'type': {'code': 'SL', 'description': 'Slider'}, 'isBall': True, 'call': {'description': 'Ball'}}, 'count': {'balls': 1, 'strikes': 0}, 'pitchData': {'startSpeed': 85.2, 'strikeZoneTop': 3.4, 'strikeZoneBottom': 1.6, 'coordinates': {'pX': -1.1, 'pZ': 1.2}}},
          {'isPitch': True, 'details': {'type': {'code': 'FF', 'description': 'Four-Seam Fastball'}, 'isStrike': True, 'call': {'description': 'Called Strike'}}, 'count': {'balls': 1, 'strikes': 1}, 'pitchData': {'startSpeed': 95.1, 'coordinates': {'pX': 0.1, 'pZ': 2.6}}},
          {'isPitch': True, 'details': {'type': {'code': 'FF', 'description': 'Four-Seam Fastball'}, 'isStrike': True, 'call': {'description': 'Foul'}}, 'count': {'balls': 1, 'strikes': 2}, 'pitchData': {'startSpeed': 95.8, 'coordinates': {'pX': 0.6, 'pZ': 3.3}}},
          {'isPitch': True, 'details': {'type': {'code': 'FF', 'description': 'Four-Seam Fastball'}, 'isInPlay': True, 'call': {'description': 'In play, run(s)'}}, 'count': {'balls': 1, 'strikes': 2}, 'pitchData': {'startSpeed': 96.34, 'coordinates': {'pX': -0.2, 'pZ': 2.4}}, 'hitData': {'launchSpeed': 108.4, 'launchAngle': 29, 'totalDistance': 421}}]),
    P(6, 6, 'top', 'Flyout', 'Patrick Bailey flies out to center fielder Tristan Peters.', 'Patrick Bailey', 'Grant Taylor', outs=1,
      pe=[{'isPitch': False, 'details': {'eventType': 'stolen_base_2b', 'event': 'Stolen Base 2B', 'description': 'Brayan Rocchio steals (3) 2nd base.'}, 'player': {'id': 4}}]),
    P(7, 6, 'top', 'Strikeout', '', 'Brayan Rocchio', 'Grant Taylor', done=False, outs=1,
      pe=[{'isPitch': True, 'details': {'type': {'code': 'SL', 'description': 'Slider'}, 'isBall': True, 'call': {'description': 'Ball'}}, 'count': {'balls': 1, 'strikes': 0}, 'pitchData': {'startSpeed': 85.2, 'strikeZoneTop': 3.4, 'strikeZoneBottom': 1.6, 'coordinates': {'pX': -1.1, 'pZ': 1.2}}},
          {'isPitch': True, 'details': {'type': {'code': 'FF', 'description': 'Four-Seam Fastball'}, 'isStrike': True, 'call': {'description': 'Called Strike'}}, 'count': {'balls': 1, 'strikes': 1}, 'pitchData': {'startSpeed': 95.1, 'coordinates': {'pX': 0.1, 'pZ': 2.6}}}]),
]
for i in range(8, 40):
    plays.insert(0, P(i - 60, 1 + (i % 4), 'top' if i % 2 else 'bottom', 'Groundout', 'Filler grounds out.', 'Filler %d' % i, 'Pitcher', outs=1))
# 球路的物理資料（出手點、初速、加速度）與擊球落點：動畫與投手球路圖需要，沒有的話 CI 完全跑不到這些功能
for _p in plays:
    for _e in _p.get('playEvents', []):
        _pd = _e.get('pitchData')
        if _pd and 'coordinates' in _pd:
            _pd['coordinates'].update({'x0': 1.2, 'y0': 50, 'z0': 5.4, 'vX0': -4.6, 'vY0': -128, 'vZ0': -4.5, 'aX': 15.5, 'aY': 26.6, 'aZ': -30})
        if _e.get('hitData'):
            _e['hitData'].update({'trajectory': 'fly_ball', 'coordinates': {'coordX': 150, 'coordY': 60}})
plays.sort(key=lambda p: p['about']['atBatIndex'])

def bat(i, nm, pos, order, ab, r, h, rbi, bb, so, avg):
    return {'person': {'id': i, 'fullName': nm}, 'position': {'abbreviation': pos}, 'battingOrder': order,
            'stats': {'batting': {'atBats': ab, 'runs': r, 'hits': h, 'rbi': rbi, 'baseOnBalls': bb, 'strikeOuts': so}},
            'seasonStats': {'batting': {'avg': avg}}}

players = {
    'ID1': bat(1, 'Steven Kwan', 'LF', '100', 3, 1, 1, 0, 1, 1, '.272'),
    'ID2': bat(2, 'Jose Ramirez', '3B', '200', 3, 1, 2, 1, 0, 0, '.283'),
    'ID3': bat(3, 'Kyle Manzardo', '1B', '300', 3, 1, 1, 2, 0, 1, '.241'),
    'ID4': bat(4, 'Brayan Rocchio', 'SS', '400', 2, 1, 1, 0, 1, 0, '.251'),
    'ID5': bat(5, 'Pinch Hitter', 'PH', '401', 1, 0, 0, 0, 0, 1, '.210'),
    'ID1007': {'person': {'id': 1007, 'fullName': 'Brayan Rocchio'}, 'stats': {'batting': {'atBats': 3, 'hits': 1, 'strikeOuts': 1, 'plateAppearances': 3}}, 'seasonStats': {'batting': {'avg': '.251'}}},
    'ID2012': {'person': {'id': 2012, 'fullName': 'Grant Taylor'}, 'stats': {'pitching': {'inningsPitched': '0.2', 'strikeOuts': 1, 'pitchesThrown': 14}}, 'seasonStats': {'pitching': {'era': '-.--'}}},  # 剛上場還沒投球：MLB 給 -.--，畫面顯示「–」
    'ID9': {'person': {'fullName': 'Joey Cantillo'}, 'stats': {'pitching': {'inningsPitched': '5.2', 'hits': 4, 'runs': 2, 'earnedRuns': 2, 'baseOnBalls': 1, 'strikeOuts': 7, 'pitchesThrown': 88}}, 'seasonStats': {'pitching': {'era': '3.45'}}},
    'ID10': {'person': {'fullName': 'Cade Smith'}, 'stats': {'pitching': {'inningsPitched': '1.0', 'hits': 0, 'runs': 0, 'earnedRuns': 0, 'baseOnBalls': 0, 'strikeOuts': 2, 'pitchesThrown': 14}}, 'seasonStats': {'pitching': {'era': '2.80'}}},
}

def feed(state, det, ls_state='Top'):
    return {
        'gameData': {'status': {'abstractGameState': state, 'detailedState': det},
                     'teams': {'away': dict(team(114, 'Cleveland Guardians'), record={'wins':1,'losses':1}), 'home': dict(team(145, 'Chicago White Sox'), record={'wins':1,'losses':1})},
                     'datetime': {'dateTime': iso(start + timedelta(hours=4))}, 'venue': {'name': 'Rate Field'}, 'players': {'ID4': {'fullName': 'Brayan Rocchio'}}},
        'liveData': {
            'linescore': {'currentInning': 6, 'inningState': ls_state, 'outs': 1, 'balls': 2, 'strikes': 1, 'scheduledInnings': 9,
                          'innings': [{'num': 1, 'home': {'runs': 1}, 'away': {}}, {'num': 2, 'home': {}, 'away': {}},
                                      {'num': 3, 'home': {}, 'away': {'runs': 4}}, {'num': 4, 'home': {'runs': 1}, 'away': {}},
                                      {'num': 5, 'home': {}, 'away': {'runs': 1}}, {'num': 6, 'home': {}, 'away': {'runs': 2, 'hits': 1, 'leftOnBase': 0}}],
                          'teams': {'home': {'runs': 2, 'hits': 5, 'errors': 0}, 'away': {'runs': 7, 'hits': 7, 'errors': 0}},
                          'offense': {'first': {'id': 1}, 'third': {'id': 2}, 'batter': {'id': 4, 'fullName': 'Brayan Rocchio'}, 'onDeck': {'id': 3}},
                          'defense': {'pitcher': {'fullName': 'Grant Taylor'}}},
            'plays': {'allPlays': plays},
            'boxscore': {'teams': {'away': {'batters': [1, 2, 3, 4, 5], 'pitchers': [9, 10, 2012], 'players': players},
                                   'home': {'batters': [], 'pitchers': [], 'players': {}}}},
            'decisions': {}}}


def pg(pk, a, h, n, st, sc=None, gt='D', desc='AL Division Series', tot=5, dt=0):
    g = {'gamePk': pk, 'gameType': gt, 'gameDate': iso(start + timedelta(hours=dt)), 'seriesDescription': desc, 'gamesInSeries': tot, 'seriesGameNumber': n,
         'status': {'abstractGameState': st, 'detailedState': st}, 'teams': {'away': {'team': team(*a)}, 'home': {'team': team(*h)}}, 'linescore': {}}
    if sc:
        g['teams']['away']['score'], g['teams']['home']['score'] = sc
        g['teams']['away']['isWinner'] = sc[0] > sc[1]; g['teams']['home']['isWinner'] = sc[1] > sc[0]
    return g
NYY=(147,'New York Yankees'); TB=(139,'Tampa Bay Rays'); CLE=(114,'Cleveland Guardians'); CWS=(145,'Chicago White Sox'); LAD=(119,'Los Angeles Dodgers'); ATL=(144,'Atlanta Braves')
postseason = {'series': [
  {'series': {'id': 'D_1', 'sortNumber': 1}, 'games': [pg(11, NYY, TB, 1, 'Final', (0, 1), dt=-72), pg(12, NYY, TB, 2, 'Final', (4, 2), dt=-48), pg(13, TB, NYY, 3, 'Live', dt=1), pg(14, TB, NYY, 4, 'Preview', dt=26)]},
  {'series': {'id': 'D_2', 'sortNumber': 2}, 'games': [pg(21, CWS, CLE, 1, 'Final', (3, 0), dt=-72), pg(22, CWS, CLE, 2, 'Final', (5, 1), dt=-48), pg(23, CLE, CWS, 3, 'Final', (2, 6), dt=-24)]},
  {'series': {'id': 'D_3', 'sortNumber': 3}, 'games': [pg(31, LAD, ATL, 1, 'Final', (3, 4), gt='D', desc='NL Division Series', dt=-72), pg(32, LAD, ATL, 2, 'Preview', gt='D', desc='NL Division Series', dt=30)]},
]}

person = {'people': [{'id': 1007, 'fullName': 'Brayan Rocchio', 'primaryNumber': '4', 'primaryPosition': {'abbreviation': 'SS'},
    'batSide': {'code': 'S'}, 'pitchHand': {'code': 'R'}, 'currentAge': 24, 'currentTeam': {'id': 114},
    'stats': [{'type': {'displayName': 'season'}, 'group': {'displayName': 'hitting'}, 'splits': [{'season': '2026', 'stat': {'gamesPlayed': 152, 'avg': '.251', 'homeRuns': 9, 'rbi': 58, 'stolenBases': 21, 'ops': '.672'}}]},
              {'type': {'displayName': 'career'}, 'group': {'displayName': 'hitting'}, 'splits': [{'stat': {'gamesPlayed': 431, 'avg': '.243', 'homeRuns': 24, 'rbi': 160, 'stolenBases': 55, 'ops': '.651'}}]}]}]}
vs_stats = {'stats': [{'type': {'displayName': 'vsPlayerTotal'}, 'splits': [{'stat': {'plateAppearances': 7, 'atBats': 6, 'hits': 2, 'homeRuns': 1, 'baseOnBalls': 1, 'strikeOuts': 2, 'avg': '.333'}}]}]}

# 勝率：依比分差粗略換算，只求有起伏可看
wp_data, _a, _h = [], 0, 0
for q in plays:
    if not q['about']['isComplete']: continue
    _a, _h = q['result'].get('awayScore', _a), q['result'].get('homeScore', _h)
    hp = max(1, min(99, 50 - 9 * (_a - _h) + (q['about']['atBatIndex'] % 5) - 2))
    wp_data.append({'homeTeamWinProbability': hp, 'homeTeamWinProbabilityAdded': hp - (wp_data[-1]['homeTeamWinProbability'] if wp_data else 50),
                    'about': {'inning': q['about']['inning'], 'isTopInning': q['about']['halfInning'] == 'top', 'isComplete': True},
                    'result': {'event': q['result']['event']}, 'matchup': {'batter': q['matchup']['batter']}})

# 重播：第 2 場（已結束）的歷史快照時間點，每分鐘一筆
_t0 = min(q['about']['startTime'] for q in plays)
_t0 = datetime.strptime(_t0, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
stamps = [(_t0 + timedelta(minutes=m)).strftime('%Y%m%d_%H%M%S') for m in range(-1, 200)]

def pre_feed():
    f = feed('Preview', 'Scheduled')
    f['gameData']['probablePitchers'] = {'away': {'id': 301, 'fullName': 'Sean Burke'}, 'home': {'id': 302, 'fullName': 'Gavin Williams'}}
    f['gameData']['players'].update({'ID301': {'id': 301, 'fullName': 'Sean Burke', 'primaryNumber': '59', 'pitchHand': {'code': 'R'}}, 'ID302': {'id': 302, 'fullName': 'Gavin Williams', 'primaryNumber': '32', 'pitchHand': {'code': 'L'}}})
    f['gameData']['weather'] = {'condition': 'Sunny', 'temp': '72', 'wind': '8 mph, Out To CF'}
    f['liveData']['plays']['allPlays'] = []
    f['liveData']['linescore'] = {'currentInning': 0, 'scheduledInnings': 9, 'innings': [], 'teams': {'home': {}, 'away': {}}}
    f['liveData']['boxscore'] = {'teams': {'away': {'batters': [], 'pitchers': [], 'battingOrder': [1, 2, 3],
        'players': {'ID1': {'person': {'id': 1, 'fullName': 'Steven Kwan'}, 'position': {'abbreviation': 'LF'}}, 'ID2': {'person': {'id': 2, 'fullName': 'Jose Ramirez'}, 'position': {'abbreviation': '3B'}}, 'ID3': {'person': {'id': 3, 'fullName': 'Kyle Manzardo'}, 'position': {'abbreviation': '1B'}}}},
        'home': {'batters': [], 'pitchers': [], 'battingOrder': [], 'players': {}}}}
    return f

pre_people = {'people': [{'id': i, 'stats': [{'type': {'displayName': 'season'}, 'group': {'displayName': 'pitching'}, 'splits': [{'stat': {'wins': w, 'losses': l, 'era': e, 'inningsPitched': ip, 'strikeOuts': k}}]}]} for i, w, l, e, ip, k in ((301, 11, 7, '3.34', '172.1', 185), (302, 14, 8, '3.76', '184.1', 248))]}

def handler(route):
    url = route.request.url
    if '/game/4/feed/live' in url:  # 還沒開打的比賽：賽前資訊
        return route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(pre_feed()))
    if 'personIds=301' in url:
        return route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(pre_people))
    if '/feed/live/timestamps' in url:
        return route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(stamps))
    if '/game/3/feed/live' in url:  # 半局之間（6 局上剛結束，換場中）：LIVE 分頁顯示半局回顧
        f = feed('Live', 'In Progress', 'Middle')
        f['liveData']['plays']['allPlays'] = [q for q in plays if q['about']['isComplete']]
        return route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(f))
    if '/game/2/feed/live' in url and 'timecode=' not in url:  # 已結束比賽的最終資料（有重播按鈕）
        return route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(feed('Final', 'Final')))
    if '/winProbability' in url:
        return route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(wp_data))
    if 'stats=vsPlayerTotal' in url:
        return route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(vs_stats))
    if re.search(r'/people/\d+\?', url):
        return route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(person))
    if '/people' in url:
        pp=lambda i,w,l,e:{'id':i,'stats':[{'splits':[{'stat':{'wins':w,'losses':l,'era':e}}]}]}
        return route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps({'people':[pp(101,2,1,'3.12'),pp(102,1,0,'2.45')]}))
    if '/postseason/series' in url:
        return route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps(postseason))
    if '/schedule' in url:
        for dd in schedule.get('dates',[]):
            for gg in dd['games']:
                if gg['status']['abstractGameState']=='Final': gg['decisions']={'winner':{'fullName':'Chris Sale'},'loser':{'fullName':'Blake Treinen'}}
        body = schedule
    elif '/standings' in url: body = standings
    elif '/feed/live' in url: body = feed('Live', 'In Progress')
    else: body = {}
    route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(body))

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

shots = [('scores', '#/scores', 'light'), ('gametop', '#/game/1', 'light'), ('pre', '#/game/4', 'light'), ('prebox', '#/game/4', 'light', 'box'), ('game', '#/game/1', 'light'), ('box', '#/game/1', 'light', 'box'), ('settings', '#/settings', 'light'), ('yday', '#/scores', 'light'), ('err', '#/scores', 'light'), ('stand', '#/standings', 'light'), ('tset', '#/settings', 'light'), ('post', '#/standings', 'light'), ('br', '#/standings', 'light'), ('fav', '#/scores', 'light'), ('favst', '#/standings', 'light'), ('favset', '#/settings', 'light'), ('favsheet', '#/settings', 'light'), ('pcard', '#/game/1', 'light'), ('wp', '#/game/1', 'light', 'box'), ('rp', '#/game/2', 'light'), ('lv', '#/game/1', 'light', 'live'), ('lvgap', '#/game/3', 'light', 'live'), ('sdfresh', '#/standings', 'light'), ('sdstale', '#/standings', 'light')]

failures = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for s in shots:
        name, hsh, theme = s[0], s[1], s[2]
        tab = s[3] if len(s) > 3 else 'text'
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='zh-TW', timezone_id='Asia/Taipei')
        ctx.add_init_script("localStorage.setItem('theme', %s); localStorage.setItem('gtab', %s);" % (json.dumps(json.dumps(theme)), json.dumps(json.dumps(tab))) + ("localStorage.setItem('testMode','true');localStorage.setItem('testStart',String(Date.now()-180000));" if name.startswith('t') else '') + ("localStorage.setItem('favs','[147,114,139]');" if name.startswith('fav') else '') + ("localStorage.setItem('standData', JSON.stringify({t: Date.now() - %s, season: '%d', standings: %s, post: %s}));" % ('1000' if name == 'sdfresh' else '3*864e5', now.year, json.dumps(standings), json.dumps(postseason)) if name in ('sdfresh', 'sdstale') else ''))
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        reqs = []
        pg.on('request', lambda r: reqs.append(r.url) if 'statsapi' in r.url else None)
        pg.route('https://statsapi.mlb.com/**', (lambda r: r.abort()) if name == 'err' or name in ('sdfresh', 'sdstale') or name.startswith('t') and name != 'tbox0' else handler)
        pg.goto('http://127.0.0.1:%d/index.html%s' % (PORT, hsh))
        pg.wait_for_timeout(1200)
        if name == 'br': pg.click('[data-sv=bracket]'); pg.wait_for_timeout(3000)
        if name == 'post': pg.click('[data-sv=post]'); pg.wait_for_timeout(600)
        if name == 'favsheet': pg.click('#favOpen'); pg.wait_for_timeout(500)
        if name in ('sdfresh', 'sdstale'):
            # 排名每天中午才更新：新的快取不用網路就能顯示；過期的快取抓不到時，先顯示舊資料並跳出失敗橫幅
            pg.wait_for_timeout(800)
            pg.evaluate("document.querySelectorAll('#stand img.tl').forEach(function(i){i.__keep = true;})")
            for _ in range(3):  # 回到畫面會重新跑一次輪詢（資料沒變）
                pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(300)
            kept = pg.evaluate("[document.querySelectorAll('#stand img.tl').length, document.querySelectorAll('#stand img.tl').length && [].filter.call(document.querySelectorAll('#stand img.tl'), function(i){return i.__keep;}).length]")
            print(name, 'logos / kept after 3 refreshes:', kept)
            if not kept[0] or kept[0] != kept[1]: failures.append((name, ['資料沒變的更新把隊徽重建了（會閃）：%s' % kept]))
            rows = pg.evaluate("document.querySelectorAll('#stand .tc').length")
            banner = pg.evaluate("(function(){var b=document.getElementById('banner');return !!b && !b.hidden;})()")
            print(name, 'rows:', rows, 'banner:', banner)
            if rows != 30: failures.append((name, ['沒有顯示存起來的排名：%s 列' % rows]))
            if banner != (name == 'sdstale'): failures.append((name, ['失敗橫幅的狀態不對：%s' % banner]))
        if name == 'wp':
            pg.evaluate("document.querySelector('#wp').scrollIntoView(); window.scrollBy(0, -170)"); pg.wait_for_timeout(300)
            pg.hover('.wp-c', position={'x': 200, 'y': 60}); pg.wait_for_timeout(200)
            print('wp:', pg.evaluate("[(document.querySelector('.wp-now')||{}).textContent, (document.querySelector('.wp-tip')||{}).innerText]"))
        if name == 'rp':
            pg.click('#rpStart'); pg.wait_for_timeout(1500)
            print('rp:', pg.evaluate("[(document.querySelector('#rpBar .rp-l b')||{}).textContent, getComputedStyle(document.querySelector('.tabbar')).display, !!document.querySelector('#plays .play')]"))
        if name == 'pcard':
            pg.click('#plays .pl-n'); pg.wait_for_timeout(700)  # 點轉播裡的球員名字
            print('pcard:', pg.evaluate("(document.querySelector('#pcdBody')||{}).innerText").replace('\n', ' | ')[:120])
            pg.click('#pcard .pcd-sw'); pg.wait_for_timeout(700)  # 卡片內換成對手
            print('pcard switched, vs header:', pg.evaluate("(document.querySelector('#pcdBody .pcd-sec:last-child h4')||{}).innerText"))
        if name in ('stand', 'gametop'):
            n0 = len(reqs); pg.click('#title'); pg.wait_for_timeout(400); print(name, 'refresh requests:', len(reqs) - n0, 'toast:', pg.evaluate("(document.getElementById('toast')||{}).textContent"))
        if name in ('gametop', 'box', 'lv'):
            # 比賽頁工具列預設展開
            got = pg.evaluate("[document.querySelector('#gCtl').classList.contains('fold'), getComputedStyle(document.querySelector('#gCtl .tk')).display]")
            print(name, 'toolbar default:', got)
            if got[0] or got[1] == 'none': failures.append((name, ['工具列預設應該展開：%s' % got]))
        if name == 'box':
            # 投手球路：點投手列展開、圖例可篩選、不超出螢幕
            if pg.evaluate("document.querySelectorAll('[data-pm]').length") == 0: failures.append((name, ['數據頁沒有可展開球路的投手列']))
            else:
                pg.click('[data-pm]'); pg.wait_for_timeout(300)
                got = pg.evaluate("[document.querySelectorAll('.pcw.open .pmz').length, document.querySelectorAll('.pmc').length, [...document.querySelectorAll('.pm *')].filter(e => e.getBoundingClientRect().right > innerWidth).length]")
                print('pitch map:', got)
                if got[0] != 1 or got[1] < 1 or got[2]: failures.append((name, ['投手球路展開不正常：%s' % got]))
        if name in ('pre', 'prebox'):
            # 賽前資訊：先發投手（含本季成績）、球場天氣、預定打線；文字轉播與數據分頁都顯示，沒有篩選列
            info = pg.evaluate("""() => ({ p: document.querySelectorAll('.pre-p').length, l: document.querySelectorAll('.pre-l li').length, t: document.querySelector('#gBody').innerText,
              hidden: getComputedStyle(document.querySelector('#gChips')).display, over: [...document.querySelectorAll('#gBody *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length })""")
            print(name, 'pregame:', info['p'], info['l'], info['hidden'], info['over'])
            need = ['Sean Burke', 'Gavin Williams', '11-7', '3.76', '172.1', '右投', '左投', '72°F（22°C）', '晴朗', '往中外野吹', 'Rate Field', 'Steven Kwan', '打線尚未公布']
            miss = [x for x in need if x not in info['t']]
            if info['p'] != 2 or info['l'] != 3 or info['hidden'] != 'none' or info['over'] or miss: failures.append((name, ['賽前資訊不正常：%s %s' % (info, miss)]))
        if name == 'gametop':
            # 打席動畫：點卡片上的「動畫」鈕 → 開啟 → 在捕手視角、轉場中、球場畫面各畫一格 → 關閉；過程不能有主控台錯誤（錯誤會被下面的 errs 檢查抓到）
            n_btn = pg.evaluate("document.querySelectorAll('.anb').length")
            if n_btn == 0: failures.append((name, ['打席卡上沒有動畫鈕']))
            else:
                pg.evaluate("document.querySelector('.anb[data-an=\"5\"]').click()"); pg.wait_for_timeout(400)
                info = pg.evaluate("""() => { const el = document.getElementById('an'); if (!el) return null; const c = el._ctl, h = c.sc.segs.find((s) => s.kind === 'hit'); const out = [];
                  for (const t of [c.sc.caps[1].t1 - 0.3, h.t0 + 0.45, h.t0 + 1.5, c.total]) { c.seek(t); out.push([document.getElementById('anPv').style.opacity, document.getElementById('anSvg').style.opacity, document.getElementById('anPv').innerHTML.length]); }
                  return { out, hud: !document.querySelector('.an-hud').hidden, banner: !document.querySelector('.an-bn').hidden }; }""")
                print('anim:', info)
                if not info: failures.append((name, ['點動畫鈕沒有開出動畫']))
                else:
                    o = info['out']
                    if o[0][0] != '1' or o[2][1] != '1' or o[3][1] != '1' or o[0][2] < 2000 or not info['hud'] or not info['banner']:
                        failures.append((name, ['動畫畫面不正常：%s' % info]))
                    pg.click('.an-x'); pg.wait_for_timeout(200)
                    if pg.evaluate("!!document.getElementById('an')"): failures.append((name, ['動畫關不掉']))
        if name == 'gametop':
            # 點把手收起（把手寫目前分頁名稱）／再點展開；離開再進來又是展開
            pg.click('#gFold'); pg.wait_for_timeout(200)
            closed = pg.evaluate("[document.querySelector('#gCtl').classList.contains('fold'), getComputedStyle(document.querySelector('#gCtl .tk')).display, (document.querySelector('#gFold .lm') || {}).textContent]")
            pg.click('#gFold'); pg.wait_for_timeout(200)
            opened = pg.evaluate("[document.querySelector('#gCtl').classList.contains('fold'), document.querySelectorAll('#gTabs button:not([hidden])').length]")
            print('toolbar toggle: closed', closed, 'open', opened)
            pg.click('#gFold'); pg.wait_for_timeout(200)
            gh = pg.evaluate('location.hash'); pg.evaluate("location.hash = '#/scores'"); pg.wait_for_timeout(600); pg.evaluate('h => { location.hash = h; }', gh); pg.wait_for_timeout(1200)
            again = pg.evaluate("document.querySelector('#gCtl').classList.contains('fold')")
            if again: failures.append((name, ['離開再進比賽頁，工具列應該回到展開']))
            if closed != [True, 'none', '文字轉播'] or opened[0] or opened[1] < 2: failures.append((name, ['工具列收起／展開不正常：%s %s' % (closed, opened)]))
        if name == 'gametop':
            # 展開的打席裡，每一球的清單不可以超出清單本身（英文球種名稱長，窄螢幕很容易溢出）；中英文各檢查一次
            chk = "(() => { document.querySelectorAll('#plays .play').forEach(function(p){p.classList.add('open');}); var bad = []; document.querySelectorAll('#plays .pl2 li').forEach(function(li){ var u = li.parentElement.getBoundingClientRect(), r = li.getBoundingClientRect(); var kids = li.querySelectorAll('*'); for (var i = 0; i < kids.length; i++) { var k = kids[i].getBoundingClientRect(); if (k.width && k.right > u.right + 1) { bad.push(kids[i].tagName + ' ' + Math.round(k.right - u.right)); break; } } if (r.right > u.right + 1) bad.push('LI ' + Math.round(r.right - u.right)); }); return [document.querySelectorAll('#plays .pl2 li').length, bad]; })()"
            zh_res = pg.evaluate(chk)
            pg.click('#langBtn'); pg.wait_for_timeout(500)
            en_res = pg.evaluate(chk)
            print('pitch list rows / overflow  zh:', zh_res, ' en:', en_res)
            if not zh_res[0] or zh_res[1] or en_res[1]: failures.append((name, ['每一球的清單超出了容器：zh %s、en %s' % (zh_res, en_res)]))
            pg.click('#langBtn'); pg.wait_for_timeout(300)
        if name == 'gametop' and pg.evaluate("document.querySelectorAll('#liveBar [data-player]').length"):
            failures.append((name, ['目前打席條不應該點了開球員小卡']))
        if name == 'yday': pg.click('#segL'); pg.wait_for_timeout(800)
        if name == 'game': pg.evaluate('window.scrollTo(0, 560)'); pg.wait_for_timeout(200)
        if name == 'stand':
            pg.evaluate('window.scrollTo(0, 700)'); pg.wait_for_timeout(500); print('nonav after scroll:', pg.evaluate("document.body.classList.contains('nonav')"))
            pg.evaluate('window.scrollBy(0, -60)'); pg.wait_for_timeout(500); print('nonav after scroll up:', pg.evaluate("document.body.classList.contains('nonav')"))
            pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(300)
        if name == 'scores':
            ok = pg.evaluate("""async () => {
              const m = await import('/js/util.js'); const box = document.createElement('div'); document.body.appendChild(box);
              m.morph(box, '<div class="a"><img src="logos/147.svg"><b>1</b><i></i></div>');
              const img = box.querySelector('img'); img.__keep = true;
              m.morph(box, '<div class="a x"><img src="logos/147.svg"><b>2</b></div>');
              const kept = box.querySelector('img').__keep === true && box.querySelector('b').textContent === '2' && box.querySelector('.a').className === 'a x' && !box.querySelector('i');
              m.morph(box, '<div class="a x"><img src="logos/139.svg"><b>2</b></div>');
              const swapped = box.querySelector('img').__keep !== true && box.querySelector('img').getAttribute('src') === 'logos/139.svg';
              box.remove(); return kept && swapped; }""")
            print('morph keeps unchanged nodes:', ok)
            if not ok: failures.append((name, ['morph 沒有保留沒變的節點、或沒有更新有變的內容']))
        if name == 'scores':
            n0 = len(reqs); pg.click('#title'); pg.wait_for_timeout(600); print('refresh requests after title click:', len(reqs) - n0)
        out = '%s/shot_%s_%s.png' % (OUT, name, theme)
        pg.screenshot(path=out, full_page=(name in ('stand','br')))
        print(out, 'errors:', errs[:3])
        bad = [e for e in errs if not (name in ('err', 'sdstale') and 'ERR_FAILED' in e)]  # err、sdstale 刻意斷網，載入失敗是預期的
        if bad: failures.append((name, bad[:3]))
        ctx.close()
    b.close()
httpd.shutdown()
if failures:
    print('FAILED:', failures)
    sys.exit(1)
print('all %d shots OK' % len(shots))

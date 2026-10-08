#!/usr/bin/env python3
"""全壘打煙火回放測試：用真實「已完成」的比賽假裝成直播，逐步回放。

流程：自動從近 10 天找一場有 ≥2 支全壘打的完賽 → 把 feed 切成三個階段
  (1) 第一支全壘打之前  (2) 含第一支  (3) 含兩支
→ 檢查：載入時不播、新全壘打各播一次、動畫結束後移除、卡片內容正確。
用法：python3 tests/hr_replay.py   （需 playwright 與可連到 statsapi.mlb.com 的網路）
"""
import copy, json, os, subprocess, sys, time, urllib.request
from datetime import date, timedelta
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = 'https://statsapi.mlb.com'
get = lambda path: json.load(urllib.request.urlopen(API + path, timeout=30))

def find_game():
    for back in range(1, 11):
        d = (date.today() - timedelta(days=back)).isoformat()
        for dt in get(f'/api/v1/schedule?sportId=1&date={d}')['dates']:
            for g in dt['games']:
                if g['status']['abstractGameState'] != 'Final':
                    continue
                f = get(f"/api/v1.1/game/{g['gamePk']}/feed/live")
                n = sum(1 for p in f['liveData']['plays']['allPlays'] if p['result'].get('eventType') == 'home_run')
                if n >= 2:
                    return g['gamePk'], f
    sys.exit('近 10 天找不到有兩支以上全壘打的完賽，無法測試')

pk, F = find_game()
plays = F['liveData']['plays']['allPlays']
hr = [p['about']['atBatIndex'] for p in plays if p['result'].get('eventType') == 'home_run']

def stage(cut):
    d = copy.deepcopy(F)
    d['liveData']['plays']['allPlays'] = [p for p in plays if p['about']['atBatIndex'] < cut]
    d['gameData']['status'].update(abstractGameState='Live', detailedState='In Progress', statusCode='I', codedGameState='I')
    return d

stages = [stage(hr[0]), stage(hr[0] + 1), stage(hr[1] + 1)]
srv = subprocess.Popen(['python3', '-m', 'http.server', '8792', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        pg = p.chromium.launch().new_page(viewport={'width': 390, 'height': 780})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        n = [0]
        def h(route):
            if '/feed/live' in route.request.url:
                route.fulfill(json=stages[min(n[0], 2)]); n[0] += 1
            else:
                route.continue_()
        pg.route('**/*statsapi.mlb.com/**', h)
        pg.goto(f'http://localhost:8792/index.html#/game/{pk}'); pg.wait_for_timeout(2500)
        fx = pg.locator('#hrfx'); txt = lambda: fx.locator('.hrx-tk').inner_text().replace('\n', ' ')
        res = {'載入時不播': fx.count() == 0}
        pg.wait_for_timeout(11000)          # 第 1 次輪詢（約 10 秒）→ 第一支
        res['第一支有播'] = fx.count() == 1 and 'HOME RUN' in txt()
        pg.wait_for_timeout(4200)
        res['動畫結束後移除'] = fx.count() == 0
        pg.wait_for_timeout(4500)           # 第 2 次輪詢 → 第二支
        res['第二支有播'] = fx.count() == 1 and 'HOME RUN' in txt()
        res['無 JS 錯誤'] = not errs
finally:
    srv.terminate()
for k, v in res.items():
    print(('PASS ' if v else 'FAIL ') + k)
sys.exit(0 if all(res.values()) else 1)

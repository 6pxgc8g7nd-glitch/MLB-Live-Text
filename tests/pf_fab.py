"""懸浮白球（關注球隊進行中）回歸測試：用測試模式的模擬比賽（洋基 vs 道奇）驗證。
用法：python3 tests/pf_fab.py"""
import os, subprocess, time, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8841
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
fails = []
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)

def page(p, favs, w=390, h=844):
    ctx = p.chromium.launch().new_context(viewport={'width': w, 'height': h}, has_touch=True)
    ctx.add_init_script("localStorage.setItem('testMode','true');localStorage.setItem('testStart',String(Date.now()-180000));localStorage.setItem('favs','%s');" % favs)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    return pg, errs
hid = lambda pg: pg.evaluate("document.querySelector('.pfab').hidden")
def go(pg, h, ms=700):
    pg.evaluate("location.hash='%s'" % h); pg.wait_for_timeout(ms)

try:
    with sync_playwright() as p:
        pg, errs = page(p, '[]'); pg.goto('http://localhost:%d/#/scores' % PORT); pg.wait_for_timeout(2500)
        check('沒有最愛球隊時隱藏', hid(pg))
        pg, errs = page(p, '[999]'); pg.goto('http://localhost:%d/#/scores' % PORT); pg.wait_for_timeout(2500)
        check('最愛球隊沒有比賽時隱藏', hid(pg))

        pg, errs = page(p, '[147]'); reqs = []
        pg.on('request', lambda r: reqs.append(r.url) if 'teamId=' in r.url else None)
        pg.goto('http://localhost:%d/#/standings' % PORT); pg.wait_for_timeout(2500)
        check('最愛球隊進行中時顯示', not hid(pg))
        bb = pg.locator('.pf-ball').bounding_box(); top = pg.evaluate("document.querySelector('.top').getBoundingClientRect().bottom")
        check('預設在右上方、標題列下方', bb['x'] > 390 / 2 and top <= bb['y'] <= 300)
        pg.mouse.click(bb['x'] + 26, bb['y'] + 26); pg.wait_for_timeout(500)
        check('點擊展開卡片並顯示比分', '進入轉播' in pg.inner_text('.pf-card') and 'NYY' in pg.inner_text('.pf-card'))
        pg.mouse.click(20, 700); pg.wait_for_timeout(300)
        check('點卡片外面會收起', pg.evaluate("document.querySelector('.pf-card').hidden"))
        # 拖曳
        bb = pg.locator('.pf-ball').bounding_box()
        pg.mouse.move(bb['x'] + 26, bb['y'] + 26); pg.mouse.down(); pg.mouse.move(150, 400, steps=6); pg.mouse.move(40, 420, steps=4); pg.mouse.up(); pg.wait_for_timeout(500)
        nb = pg.locator('.pf-ball').bounding_box()
        check('拖曳後吸附左側', nb['x'] < 20 and 380 < nb['y'] < 460)
        pg.reload(); pg.wait_for_timeout(2500)
        check('重新載入後位置保留', pg.locator('.pf-ball').bounding_box()['x'] < 20)
        go(pg, '#/settings'); check('設定頁隱藏', hid(pg))
        go(pg, '#/standings'); check('離開設定頁後再顯示', not hid(pg))
        go(pg, '#/game/999001', 1500); check('進入該場轉播頁時隱藏', hid(pg))
        # 快速切換頁面不應產生重複的檢查計時器
        reqs.clear()
        for h in ['#/scores', '#/standings', '#/scores', '#/standings', '#/scores', '#/standings']: go(pg, h, 150)
        pg.wait_for_timeout(36000)
        n = len([r for r in reqs if 'schedule' in r])
        check('快速換頁後 36 秒內檢查次數合理（%d 次）' % n, n <= 6)
        check('沒有 JS 錯誤', not errs)
finally:
    srv.terminate()
print('FAILED: %s' % fails if fails else 'all passed'); sys.exit(1 if fails else 0)

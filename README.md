# MLB Live Text

個人用的 MLB 即時文字轉播 PWA：比分、逐打席文字轉播、排名與季後賽，藍色票券風格的繁體中文介面。
純靜態網頁（HTML / CSS / JavaScript），沒有建置步驟、沒有後端，直接部署在 GitHub Pages。

> 非官方專案，與 MLB 及各球隊無關聯。資料來自 MLB Stats API。

## 功能

- **比分**：依日期瀏覽賽程與比分，可標記關注球隊
- **文字轉播**：逐打席、逐球更新；進行中的打席自動展開，已結束的打席自動收起（手動展開除外）
- **目前打席條**：顯示打者、球數、壘包與上一打席結果，換打者／換半局／球數變化有輕微動畫
- **全壘打動畫**：直播中出現全壘打時播放煙火與卡片（陽春砲、兩分砲、三分砲、滿貫砲）
- **LIVE 模式**：在轉播頁連點三下比賽列，更新間隔由 10 秒縮短為 1 秒
- **局數表與數據**：局數表（含 H、E，左右欄固定、中間可滑動）、打擊與投球數據
- **球員小卡**：點文字轉播、目前打席條或數據頁的球員名字，顯示本季／生涯數據與打者對投手的生涯對戰
- **勝率走勢**：數據頁上方的主隊勝率折線，可拖曳或用方向鍵逐打席查看，並列出影響最大的三個打席
- **排名與季後賽**：聯盟／分區排名，季後賽對戰
- **可收合工具列**：轉播頁工具列可收成細條
- **左右滑動換頁**：比分、排名、設定三個主頁可左右滑動切換（疊層視差：新頁從側邊蓋上、舊頁退後變暗）；轉播頁不支援，螢幕最左緣與橫向捲動的表格不會觸發
- **PWA**：可加入主畫面、離線載入外殼，設定 → 更新應用程式 取得新版

## 專案結構

```
index.html            頁面骨架（以 <script type="module"> 載入 js/main.js）
js/                   主程式，原生 ES modules，不需建置
  main.js             進入點：啟動與事件綁定
  util.js             工具：DOM、localStorage、台灣時間日期格式
  dict.js             字典：球隊、分區、事件中文對照
  api.js              資料層：API 請求、狀態橫幅、輪詢
  state.js            共用狀態（其他模組透過 setG / setPoller 等函式改值）
  scores.js           比分頁
  game.js             單場頁：局數表、文字轉播、數據、全壘打動畫
  standings.js        排名、季後賽、對戰樹
  settings.js         設定頁與最愛球隊
  shell.js            外框：標題欄日期、日曆、路由
  gestures.js         左右滑動換頁、下拉更新
  player.js           球員小卡
  winprob.js          勝率走勢圖
  replay.js           重播模式（只在 ?replay= 時載入）
replay.html           重播模式控制頁（開發用）
style.css             樣式（藍色票券風格）
sw.js                 Service Worker（外殼 network-first，VERSION 變更即更新）
manifest.webmanifest  PWA 設定
icons/                App 圖示（192、512、apple-touch、maskable）
logos/                球隊 logo 副本（見 logos/README.md）
scripts/sw.mjs        維護 sw.js 的快取清單與 VERSION
.githooks/            pre-commit hook（自動執行 scripts/sw.mjs）
.github/workflows/    CI：單元測試、sw.js 檢查、截圖檢查
tests/                單元測試、截圖檢查、全壘打回放
```

## 本機執行

```bash
python3 -m http.server 8000
# 開啟 http://localhost:8000
```

需要經過 HTTP 伺服器才能註冊 Service Worker，直接開檔案不行。

## 重播模式（開發用）

沒有比賽進行時，也能看到「直播中」的畫面：開啟 `replay.html`（例如 http://localhost:8000/replay.html），
選一場最近 7 天已結束的比賽，或輸入 gamePk。它會用 MLB 的歷史快照（`feed/live?timecode=`，約每 15 秒一筆）
把比賽當作直播重播，右邊是真正的 App 畫面：目前打席條、文字轉播、勝率圖、全壘打動畫都會照直播的方式運作。

- 可暫停、調倍速（1×–60×）、拖進度條、跳到任一半局
- 只在網址帶 `?replay=<gamePk>` 時才載入 `js/replay.js`，正式 App 的畫面與設定頁不受影響
- 正式網站上也能用：`https://<網站>/replay.html`

## 部署與更新

推送到 `main` 後由 GitHub Pages 發佈。修改外殼檔案（HTML、CSS、`js/`、圖示、logo）時，`sw.js` 的 `VERSION`
必須調高，使用者才會在 設定 → 更新應用程式 時取得新版。這件事已自動化：

```bash
git config core.hooksPath .githooks   # 每個 clone 做一次，之後提交時自動更新 sw.js
node scripts/sw.mjs sync              # 也可以手動執行：重寫 SHELL 清單，必要時 VERSION +1
```

新增或刪除 `js/`、`icons/`、`logos/` 裡的檔案時，SHELL 清單也會跟著更新。
沒有啟用 hook 就提交（例如在 GitHub 網頁上直接編輯）時，CI 會檢查出來並標示失敗。

## 測試

```bash
node tests/unit.test.js          # 單元測試（解析、格式化、狀態判斷），也可用 npm test
node scripts/sw.mjs check        # sw.js 的 SHELL 清單是否和實際檔案一致
python3 tests/shots.py [輸出資料夾]  # 以 Playwright 截 15 張頁面圖（模擬 API），有 JS 錯誤時回傳失敗
python3 tests/hr_replay.py       # 回放已結束的真實比賽，驗證全壘打偵測與動畫（需要網路）
```

截圖與回放需要 `pip install playwright`（Chromium）。都讀取本資料夾的檔案，執行前請先儲存最新修改。

每次推送或開 PR，GitHub Actions 會自動執行單元測試、`sw.js` 檢查（含 VERSION 是否有調高）與截圖檢查，
截圖會上傳成 artifact 保留 7 天。`hr_replay.py` 需要連到真實的 MLB API，不放在 CI 裡。

## 設計

- 主色 `#004B93`、中性色 `#E6E6E6`、強調色 `#A6051A`（僅用於直播與比分）、金色 `#e0a800`（關注與安打）
- 僅有淺色主題
- 票券缺口以 CSS `radial-gradient` mask 製作；陰影請放在外層容器，避免被 mask 裁掉

## 資料來源

[MLB Stats API](https://statsapi.mlb.com)（非官方、無穩定性保證，程式對缺漏欄位做了保護）。主要用到：

- 賽程比分：`/api/v1/schedule`
- 即時轉播：`/api/v1.1/game/{gamePk}/feed/live`
- 排名與季後賽：`/api/v1/standings` 等

## 商標與版權

MLB 及各球隊名稱與標誌屬 Major League Baseball 及各球隊所有。`logos/` 內的檔案僅為加快載入與離線顯示而存放，
不在本專案程式碼授權範圍內，請勿用於商業用途或重新散布。App 圖示為自行設計，未使用任何 MLB 或球隊標誌。

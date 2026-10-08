# MLB Live Text

個人用的 MLB 即時文字轉播 PWA：比分、逐打席文字轉播、排名與季後賽，藍色票券風格的繁體中文介面。
純靜態網頁（HTML / CSS / 原生 ES modules），沒有建置步驟、沒有後端，經 GitHub Actions 部署到 GitHub Pages。

網站：https://6pxgc8g7nd-glitch.github.io/MLB-Live-Text/

> 非官方專案，與 MLB 及各球隊無關聯。資料來自 MLB Stats API。

## 功能

- **比分**：依日期瀏覽賽程與比分（台灣時間 0:00 換日），依進行中／未開打／已結束分組；
  點標題欄中間回到今天、長按開啟日曆（標示有比賽的日子）；下拉或點標題可手動更新
- **文字轉播**：已結束打席的紀錄，最新在最上面，點一下可展開每一球；
  可篩選全部／重點／得分，開啟「自動跟隨」會在有新事件時捲回最上方；轉播文字可切換中文／英文
- **LIVE 分頁**：比賽進行中才出現（在「數據」旁邊），專門看目前這個打席：打者與投手的今日成績
  （投手含用球數，右側大數字是打擊率／防禦率，季後賽標示「季後賽」）、本打席每一球的位置／球種／球速；
  局數、出局、壘包與球數看上方的目前打席條；半局之間顯示換場與接下來的打者
- **目前打席條**：顯示打者、投手、球數、壘包與上一打席結果，換打者／換半局／球數變化有輕微動畫
- **全壘打動畫**：直播中出現全壘打時播放煙火與卡片（陽春砲、兩分砲、三分砲、滿貫砲）
- **LIVE 模式**：在轉播頁連點三下比賽列，更新間隔由 10 秒縮短為 1 秒；此時改抓差異（diffPatch），只下載上次之後變動的部分
- **局數表與數據**：局數表（含 H、E，左右欄固定、中間可滑動）、打擊與投球數據（可展開更多欄位）
- **球員小卡**：點文字轉播裡的球員名字、目前打席條左半邊或數據頁的整列，從下方滑出本季／生涯數據；
  從轉播或打席條開啟時另外顯示打者對投手的生涯對戰，點對手名字可直接換成對手的小卡
- **重播**：已結束的比賽頁有「重播這場比賽」按鈕，把整場比賽當作直播重播（任何日期都可以，用日曆找到比賽即可）；
  下方控制列可播放／暫停、調倍速（1×–60×）、跳到任一半局、拖進度條，按「結束」或離開這場比賽就回到最終結果
- **勝率走勢**：數據頁上方的主隊勝率折線，可拖曳、滑鼠移動或用方向鍵逐打席查看，並列出影響最大的三個打席
- **排名與季後賽**：分區／聯盟排名（含季後賽線），季後賽系列賽戰況與對戰樹
- **最愛球隊**：在設定頁選擇，比分頁會把這些球隊的比賽排在各組前面，比分、排名與季後賽頁都會標示
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
  game.js             單場頁：局數表、文字轉播、LIVE 分頁、數據、目前打席條、全壘打動畫
  livefeed.js         LIVE 模式的差異更新（diffPatch / JSON Patch，失敗時退回抓整份）
  player.js           球員小卡
  winprob.js          勝率走勢圖
  standings.js        排名、季後賽、對戰樹
  settings.js         設定頁與最愛球隊
  shell.js            外框：標題欄日期、日曆、路由
  gestures.js         左右滑動換頁、下拉更新
  replay.js           重播（按下重播按鈕或網址帶 ?replay= 時才載入）
replay.html           重播的開發用外框頁
style.css             樣式（藍色票券風格）
sw.js                 Service Worker（外殼 network-first，VERSION 變更即更新）
manifest.webmanifest  PWA 設定
icons/                App 圖示（192、512、apple-touch、maskable）
logos/                球隊 logo 副本（見 logos/README.md）
scripts/sw.mjs        維護 sw.js 的快取清單（SHELL）與 VERSION
scripts/verify-diffpatch.mjs  比賽進行中驗證差異更新是否與整份資料一致
eslint.config.js      ESLint 設定
package.json          開發工具（ESLint）與 npm 指令；網站本身沒有任何相依套件
.githooks/            pre-commit hook（自動執行 scripts/sw.mjs）
.github/workflows/    CI：ESLint、單元測試、sw.js 檢查、截圖檢查，全過才部署
tests/                單元測試、截圖檢查、全壘打回放
```

## 本機執行

```bash
python3 -m http.server 8000
# 開啟 http://localhost:8000
```

需要經過 HTTP 伺服器才能載入 ES modules 與註冊 Service Worker，直接開檔案不行。
`http.server` 不會送出快取標頭，瀏覽器可能沿用舊的 CSS／JS；改完看不到效果時請強制重新整理。

## 重播

App 內：進入任何一場已結束的比賽，按局數表下方的「重播這場比賽」。重播用 MLB 的歷史快照
（`feed/live?timecode=`，約每 15 秒一筆）把比賽當作直播播放，目前打席條、文字轉播、勝率圖、全壘打動畫、球員小卡
都會照直播的方式運作；重播期間下方導覽列換成控制列，按「結束」或離開這場比賽就停止。

開發用外框：沒有比賽進行時想並排看控制項與手機畫面，可以開 `replay.html`
（本機 http://localhost:8000/replay.html，或網站上的 https://6pxgc8g7nd-glitch.github.io/MLB-Live-Text/replay.html），
選一場最近 7 天已結束的比賽，或輸入 gamePk。它會用 MLB 的歷史快照（`feed/live?timecode=`，約每 15 秒一筆）
把比賽當作直播重播，旁邊是真正的 App 畫面：目前打席條、文字轉播、勝率圖、全壘打動畫都會照直播的方式運作。

- 可暫停、調倍速（1×–60×）、拖進度條、跳到任一半局
- 外框透過網址的 `?replay=<gamePk>` 啟動 App 內的重播，`js/replay.js` 只有用到時才會下載
- 手機上控制面板在上方，App 畫面在下方

## 部署與更新

推送到 `main` 後，GitHub Actions 先跑完所有檢查（ESLint、單元測試、`sw.js`、截圖），**全部通過才部署**到 GitHub Pages；
任何一項失敗，網站就維持上一版。部署只會放上網站需要的檔案（HTML、CSS、`js/`、`sw.js`、manifest、圖示、logo），
測試、腳本與 `node_modules` 不會公開。（Settings → Pages → Source 需設為「GitHub Actions」。）

修改外殼檔案（HTML、CSS、`js/`、圖示、logo）時，`sw.js` 的 `VERSION` 必須調高，
使用者才會在 設定 → 更新應用程式 時取得新版。這件事已自動化：

```bash
git config core.hooksPath .githooks   # 每個 clone 做一次，之後提交時自動更新 sw.js
node scripts/sw.mjs sync              # 也可以手動執行：重寫 SHELL 清單，必要時 VERSION +1
```

新增或刪除 `js/`、`icons/`、`logos/` 裡的檔案時，SHELL 清單也會跟著更新。
沒有啟用 hook 就提交（例如在 GitHub 網頁上直接編輯）時，CI 會檢查出來並標示失敗。

已知限制：兩個分支各自把 VERSION 調到同一個數字、rebase 之後，`sync` 比對的是目前的提交，不會再加 1；
這時 `node scripts/sw.mjs check origin/main` 會報錯，請手動把 VERSION 改成下一個數字。

## 測試

```bash
node tests/unit.test.js          # 單元測試（解析、格式化、球員小卡、勝率圖、重播），也可用 npm test
npm ci && npx eslint .           # ESLint（第一次先 npm ci 安裝）
node scripts/sw.mjs check        # sw.js 的 SHELL 清單是否和實際檔案一致（加上 git ref 會一併檢查 VERSION 是否調高）
python3 tests/shots.py [輸出資料夾]  # 以 Playwright 截 19 張頁面圖（模擬 API），有 JS 錯誤時回傳失敗
python3 tests/hr_replay.py       # 回放已結束的真實比賽，驗證全壘打偵測與動畫（需要網路）
node scripts/verify-diffpatch.mjs <gamePk> [分鐘]  # 比賽進行中：驗證差異更新與整份資料逐欄一致、統計省下的流量
```

截圖與回放需要 `pip install playwright`（Chromium）。截圖測試會自己挑一個空的連接埠，同時跑多個也不會衝突。
都讀取本資料夾的檔案，執行前請先儲存最新修改。

每次推送或開 PR，GitHub Actions 會自動執行 ESLint、單元測試、`sw.js` 檢查（含 VERSION 是否有調高）與截圖檢查，
截圖會上傳成 artifact 保留 7 天。`hr_replay.py` 與 `verify-diffpatch.mjs` 需要連到真實的 MLB API，不放在 CI 裡。

## 設計

- 主色 `#004B93`、中性色 `#E6E6E6`、強調色 `#A6051A`（僅用於直播與比分）、金色 `#e0a800`（關注與安打）
- 僅有淺色主題
- 票券缺口以 CSS `radial-gradient` mask 製作；陰影請放在外層容器，避免被 mask 裁掉
- 可點開球員小卡的名字以淡色虛線底線標示

## 資料來源

[MLB Stats API](https://statsapi.mlb.com)（非官方、無穩定性保證，程式對缺漏欄位做了保護）。主要用到：

- 賽程比分：`/api/v1/schedule`
- 即時轉播：`/api/v1.1/game/{gamePk}/feed/live`；LIVE 模式用 `…/feed/live/diffPatch`
- 勝率：`/api/v1/game/{gamePk}/winProbability`
- 球員資料與對戰：`/api/v1/people/{id}`、`/api/v1/people/{id}/stats?stats=vsPlayerTotal`
- 排名與季後賽：`/api/v1/standings`、`/api/v1/schedule/postseason/series`
- 重播模式：`…/feed/live/timestamps` 與 `…/feed/live?timecode=`

## 商標與版權

MLB 及各球隊名稱與標誌屬 Major League Baseball 及各球隊所有。`logos/` 內的檔案僅為加快載入與離線顯示而存放，
不在本專案程式碼授權範圍內，請勿用於商業用途或重新散布。App 圖示為自行設計，未使用任何 MLB 或球隊標誌。

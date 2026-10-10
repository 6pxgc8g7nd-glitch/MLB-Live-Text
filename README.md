# MLB Live Text

個人用的 MLB 即時文字轉播網頁 App（PWA）。

網站：https://6pxgc8g7nd-glitch.github.io/MLB-Live-Text/

## 專案介紹

用手機或電腦就能看 MLB 的比分、逐打席文字轉播、排名與季後賽，繁體中文介面，藍色票券風格。
即使沒有比賽進行，也能把已結束的比賽當作直播重播。

- 純靜態網頁（HTML、CSS、原生 JavaScript），沒有建置步驟、沒有後端，部署在 GitHub Pages
- 資料來自 [MLB Stats API](https://statsapi.mlb.com)（非官方、無穩定性保證，程式對缺漏欄位做了保護）
- 非官方專案，與 MLB 及各球隊無關聯

## 功能介紹

- **比分**：依日期瀏覽賽程與比分（台灣時間 0:00 換日），分成進行中、未開打、已結束；可標記最愛球隊
- **文字轉播**：已結束打席的逐打席紀錄，點開看每一球；可篩選全部、重點、得分；可切換中文／英文
- **LIVE 分頁**：比賽進行中才出現，打開時每秒更新（其他分頁每 10 秒），專看目前這個打席（打者與投手的今日成績、每一球的位置與球種球速）；
  半局之間改顯示上一個半局的回顧（比數變化、全壘打、雙殺、盜壘、換投手、挑戰等事件）
- **目前打席條**：固定在上方，顯示打者、投手、球數、壘包與上一打席結果
- **全壘打動畫**：直播中出現全壘打時播放煙火與卡片
- **球員小卡**：點球員名字，看本季與生涯數據，以及打者對投手的生涯對戰
- **勝率走勢**：主隊勝率折線，可逐打席查看並列出影響最大的打席
- **局數表與數據**：局數表（含安打、失誤）、打擊與投球數據
- **賽前資訊**：比賽還沒開打時，文字轉播與數據分頁顯示預定先發投手（慣用手、背號、本季勝敗／防禦率／局數／三振）、球場與天氣（華氏換攝氏、風向）、預定打線（尚未公布時說明通常何時公布）
- **投手球路**：數據頁點投手列展開，看他整場投球的好球帶分布圖與球種表（球數、比例、均速、最速、揮空），點圖例可只看某一種球種
- **打席動畫**：每張打席卡右側的「動畫」鈕。投球用捕手後方視角（透視、好球帶、每球落點累積；打者先蓄力再揮棒，棒子依球的高度揮過，揮空會從球上下掃過），擊出後鏡頭不中斷地從本壘後方升高、拉遠成球場俯視（同一台攝影機的運鏡）（真實擊球落點，右上角即時顯示初速、仰角、飛行距離與滯空）：野手跑向落點接球、傳球刺殺，跑者從壘上原位依實際順序推進（盜壘、牽制、保送、暴投也會播）；全壘打會追球過牆並放火花。可重播、可慢動作
- **排名與季後賽**：分區與聯盟排名、季後賽線、系列賽戰況與對戰樹；資料每天台灣時間中午 12 點更新一次，其他時候用上次存的
- **重播**：已結束的比賽可以從頭重播，可暫停、調倍速、跳到任一半局
- **PWA**：可加入主畫面、離線載入外殼，左右滑動切換主頁

## 安裝方式

**直接使用（手機）**：用瀏覽器開啟上面的網站，再「加入主畫面」。
iPhone 用 Safari（分享 → 加入主畫面），Android 用 Chrome（選單 → 安裝應用程式）。

**本機開發**：

1. 安裝 [Git](https://git-scm.com)、[Python 3](https://www.python.org)（用來啟動本機伺服器）
2. 下載專案：

```bash
git clone https://github.com/6pxgc8g7nd-glitch/MLB-Live-Text.git
cd MLB-Live-Text
```

3. 需要跑測試或 ESLint 時，另外安裝 [Node.js](https://nodejs.org) 20 以上，再執行：

```bash
npm ci                                  # 安裝 ESLint
git config core.hooksPath .githooks     # 啟用提交前檢查（自動更新 sw.js 的版本號）
```

4. 需要截圖測試時，另外安裝 Playwright：

```bash
pip install playwright
python3 -m playwright install chromium
```

## 使用方式

**執行**：在專案資料夾啟動本機伺服器，再用瀏覽器開啟 http://localhost:8000

```bash
python3 -m http.server 8000
```

需要透過伺服器才能載入 ES modules 與 Service Worker，直接開檔案不行。

**操作**：

- 比分頁：點標題欄中間回到今天，長按開啟日曆；下拉或點標題更新
- 比賽頁：工具列（文字轉播／數據／LIVE、篩選、自動跟隨）預設展開，可點底部把手收成一條寫著目前分頁名稱的細條，再點展開（每次進入比賽頁都先展開）；點球員名字看小卡
- 已結束的比賽：按「重播這場比賽」，下方控制列可暫停、調倍速、跳局
- 設定頁：選擇最愛球隊、更新應用程式

**測試**：

```bash
npm test                     # 單元測試＋打席動畫測試
npx eslint .                 # 程式碼檢查
node scripts/sw.mjs check    # 檢查 sw.js 的快取清單與版本號
python3 tests/shots.py       # 截圖測試（模擬 API，需先安裝 Playwright）
```

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
  game.js             單場頁骨架：局數表、標頭、分頁切換與輪詢、全壘打動畫
  plays.js            文字轉播：打席卡、投球圓點與好球帶、換人說明
  live.js             LIVE 分頁：目前打席、半局回顧
  preview.js          賽前資訊：先發投手、球場天氣、預定打線
  box.js              數據分頁：打擊／投球數據、投手列展開球路
  pitches.js          球種名稱與每球結果分類
  pitchmap.js         投手球路：整場投球分布圖與球種表
  cam3d.js            打擊動畫的針孔攝影機：捕手視角到球場俯視的運鏡與 3D 投影
  anim.js             打席動畫入口（匯出下面兩個模組）
  anim-script.js      打席動畫的純計算：球路、擊球、野手傳球、跑者、揮棒、時間表
  anim-view.js        打席動畫的畫面：3D 場景、球場俯視、雷達面板、控制列
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
eslint.config.js      ESLint 設定
package.json          開發工具（ESLint）與 npm 指令；網站本身沒有任何相依套件
.githooks/            pre-commit hook（自動執行 scripts/sw.mjs）
.github/workflows/    CI：ESLint、單元測試、sw.js 檢查、截圖檢查，全過才部署
tests/                單元測試、打席動畫測試（fixtures/ 是真實打席精簡檔）、截圖檢查、全壘打回放
```

## 使用技術

- HTML、CSS、JavaScript（原生 ES modules，不需要打包）
- Service Worker 與 Web App Manifest（PWA、離線外殼）
- MLB Stats API（賽程、即時轉播、勝率、球員資料、排名）
- Node.js：單元測試、ESLint 9、`sw.js` 維護腳本
- Python 與 Playwright：截圖測試
- GitHub Actions 與 GitHub Pages：測試通過才自動部署

## 授權資訊

這是個人專案，**保留所有權利**，未授權他人使用、修改或散布程式碼。

MLB 及各球隊名稱與標誌屬 Major League Baseball 及各球隊所有。`logos/` 內的檔案僅為加快載入與離線顯示而存放，
不在本專案的授權範圍內，請勿用於商業用途或重新散布。App 圖示是一個簡單的藍色棒球線條圖案，未使用任何 MLB 或球隊標誌。

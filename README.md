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
- **排名與季後賽**：聯盟／分區排名，季後賽對戰
- **關注球隊懸浮按鈕**：只要有「我的最愛球隊」正在比賽，就會自動在畫面右上方出現白球按鈕（沒有進行中的比賽時隱藏）。可拖曳，放開後吸附左右側並記住位置；點一下展開比分、局數、壘包與球數，同時有多場時並列顯示；有得分或換半局時閃一下；點卡片進入該場轉播
- **可收合工具列**：轉播頁工具列可收成細條
- **測試模式**：設定中開啟後，會多出三場模擬比賽（進行中、已結束、未開賽），進行中的比賽每 3 秒投一球，可離線測試轉播功能
- **PWA**：可加入主畫面、離線載入外殼，設定 → 更新應用程式 取得新版

## 專案結構

```
index.html            頁面骨架
app.js                主程式：資料抓取、路由、各頁面渲染、輪詢
style.css             樣式（藍色票券風格）
mock.js               測試模式的模擬比賽資料
sw.js                 Service Worker（外殼 network-first，VERSION 變更即更新）
manifest.webmanifest  PWA 設定
icons/                App 圖示（192、512、apple-touch、maskable）
logos/                球隊 logo 副本（見 logos/README.md）
tests/                單元測試、截圖檢查、全壘打回放
```

## 本機執行

```bash
python3 -m http.server 8000
# 開啟 http://localhost:8000
```

需要經過 HTTP 伺服器才能註冊 Service Worker，直接開檔案不行。

## 部署與更新

推送到 `main` 後由 GitHub Pages 發佈。每次修改外殼檔案時，請同步調高 `sw.js` 的 `VERSION`，
使用者才會在 設定 → 更新應用程式 時取得新版。

## 測試

```bash
node tests/unit.test.js          # 單元測試（解析、格式化、狀態判斷）
python3 tests/shots.py [輸出資料夾]  # 以 Playwright 截 16 張頁面圖，輸出中 "errors: []" 應出現 16 次
python3 tests/hr_replay.py       # 回放已結束的真實比賽，驗證全壘打偵測與動畫
```

截圖與回放需要 `pip install playwright`（Chromium）。三者都讀取本資料夾的檔案，執行前請先儲存最新修改。

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

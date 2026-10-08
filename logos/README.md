# Logos

此資料夾的 SVG 是 MLB 30 支球隊與美國聯盟（AL）、國家聯盟（NL）的官方 logo 副本，
原始來源為 `https://www.mlbstatic.com/team-logos/`。

- `{teamId}.svg`：球隊 logo
- `league-103.svg`、`league-104.svg`：AL／NL logo（透明背景版本）
- `mlb-on-dark.svg`：頁面標題列的 MLB 標誌

## 版權聲明

所有 logo 的商標與版權屬 Major League Baseball 及各球隊所有。
本專案為非官方的個人應用，與 MLB 無關聯；這些檔案只為了加快載入與離線顯示而存放，
**不在本專案程式碼授權範圍內**，也請勿用於商業用途或重新散布。
若權利人要求移除，請刪除本資料夾，並把 `app.js` 裡 `logo` 函式的圖片網址（`logos/${t.id}.svg`）改成線上網址 `https://www.mlbstatic.com/team-logos/${t.id}.svg`。

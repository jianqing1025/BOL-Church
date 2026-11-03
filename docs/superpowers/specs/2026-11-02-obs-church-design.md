# OBS Church 設計

日期：2026-11-02　基礎：OBS Studio 33.0.1（`OBS-Church/`，未修改的原始碼已收進主倉庫）

## 目標（使用者需求）

1. **串流／錄影區**：在「控制」右邊新增一區。上方兩個按鈕（串流、錄影），與原本的控制按鈕共用同一套機制；下方三個小畫面：**現場影像**、**簡報**（OBS 放在螢幕上的 presentation）、**混合（畫中畫，可編輯）**。點哪個小畫面，串流與錄影就輸出哪個畫面。
2. **新的來源類型**（參考 bolccop meeting）：文字、經文、圖片、線上影片、PPT。PPT 播放時可用 USB 簡報器（翻頁筆）上一頁／下一頁。
3. **經文**與 bolccop meeting 一致：選經文直接上螢幕，長的經文自動分頁。
4. **右側 30%**：原本的大預覽移到右側，變成三個畫面——①與現在完全一樣的預覽（可編輯）②純影像 ③混合模式，與右下角的三個小畫面一致；在任一畫面按右鍵選擇投影到哪個螢幕。
5. **左側其餘空間**：像 ProPresenter 一樣平鋪所有投影片，點一下就送到右側第一個畫面（簡報）。可選背景主題與排版模式：純漸層、基督教主題畫面；文字自動排版。
6. 做成 Windows 安裝檔（.exe）。

## 架構

### 內容用網頁技術，介面與輸出用 C++

投影片、經文、PPT、主題背景全部用 TypeScript 實作，跑在 OBS 內建的 CEF（obs-browser）裡，**直接重用 bolccop meeting 已測過的程式**：
`Church/meeting/agenda/pptx/*`（PPT 解析與繪製、點擊動畫分頁）、`slideLayout.ts`（經文與文字大字分頁）、`slideThemes.ts`、`constants/bibleBooks.ts` 與 `public/bible/*.json`（和合本）。

C++ 只負責：版面、三個畫面與投影、場景切換（節目輸出）、全域快捷鍵（翻頁筆）、本機檔案選擇。

```
OBS-Church/
├── church-presenter/          TypeScript（Vite）→ 打包到 OBS 資料夾 data/church-presenter/
│   ├── panel.html             左側投影片面板（ProPresenter 式）
│   └── output.html            「教會簡報輸出」來源的畫面（1920×1080）
├── plugins/obs-browser/       加一個 obsstudio.sendToHost(json)：面板 → C++
└── frontend/                  新版面、串流錄影區、三個畫面、投影、快捷鍵
```

### 訊息路徑

| 方向 | 方式 |
|---|---|
| 面板 → C++ | `window.obsstudio.sendToHost(json)`（新增）：渲染行程送 process message，面板的 `QCefBrowserClient` 收到後由 `QCefWidget::hostMessage(QString)` 發出 Qt 訊號 |
| C++ → 面板 | `QCefWidget::executeJavaScript`（現有） |
| C++ → 輸出畫面 | 瀏覽器來源的 proc handler `javascript_event(eventName, json)`（現有） |

面板與輸出畫面都由 `http://absolute/<路徑>` 載入（obs-browser 的本機檔案網址），同源下可直接讀取任何本機檔案：PPT、圖片都以路徑傳遞，由輸出畫面用同一份繪製程式自行畫出，**面板與輸出畫面一模一樣**。

### 場景與輸出

第一次啟動時自動建立三個場景（以設定記住，不靠名稱）：

| 場景 | 內容 |
|---|---|
| 簡報 Presentation | 「教會簡報輸出」來源（全畫面） |
| 現場影像 Camera | 視訊擷取裝置（全畫面） |
| 混合 Mixed | 簡報輸出（全畫面）＋攝影機（右下角畫中畫，可在預覽中直接調整） |

內部使用工作室模式：**預覽**＝右側第一個畫面（可編輯，與現在 OBS 一樣），**節目**＝串流／錄影的輸出，由串流錄影區的三個小畫面決定（`TransitionToScene`，照常使用轉場）。OBS 原本的「節目」畫面與轉場按鈕不顯示——三個小畫面就是節目選擇器，現場的那個加紅框。

### 翻頁筆

USB 簡報器送的是鍵盤按鍵（PageDown/PageUp、→/←、↓/↑）。面板有焦點時由網頁直接處理；OBS 不在前景時，用 OBS 全域快捷鍵（預設綁定上述按鍵），C++ 收到後 `executeJavaScript` 叫面板翻頁。

### 主題

- 純漸層：沿用 bolccop meeting 的十套，再加數套。
- 基督教主題：以 SVG 向量繪製（十字架與晨光、鴿子、光芒、彩色玻璃、麥穗、山與十字架、打開的聖經、橄欖枝等），不用外部圖片，沒有版權問題。
- 排版模式：置中標題＋內文、左對齊講義、經文、歌詞（大字置中）、下方字幕（疊加在影像上）。

## 安裝檔

以 CMake 編譯（Visual Studio 2026 Build Tools，OBS 33 的預設產生器），`cmake --install` 到資料夾，再用 Inno Setup 做成 `OBS-Church-Setup-<版本>.exe`。

## 分階段

1. 工具鏈與原版 OBS 編譯、打包流程打通。
2. obs-browser 的 `sendToHost`；`church-presenter` 網頁專案（重用 meeting 程式）與「教會簡報輸出」來源。
3. 版面：左側面板、右側三畫面與投影、串流錄影區、三個場景、工作室模式。
4. 新來源類型、經文、PPT、翻頁筆快捷鍵。
5. 主題與排版、背景圖庫。
6. 安裝檔。

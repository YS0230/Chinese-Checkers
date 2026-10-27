# ✨ 星際彈珠中國跳棋（Starry Chinese Checkers）

免註冊、免資料庫的多人線上中國跳棋。支援 2～6 人、公開大廳、私人房間邀請連結、斷線重連，手機／平板／桌面皆可遊玩。

- 前端：React 18 + TypeScript + Vite + Tailwind CSS + Framer Motion + Socket.IO Client
- 後端：Node.js + TypeScript + Express + Socket.IO（伺服器權威）
- 共用：`shared/` 規則引擎與型別化事件協定（前後端同一份規則）
- 部署：Render.com 單一 Web Service

> ⚠️ **沒有資料庫**：所有房間、玩家、棋局、聊天、重連資訊都只存在 Node.js 伺服器記憶體中。**伺服器重啟、重新部署或 Render 免費方案休眠後，全部資料都會消失。**

---

## 專案結構

```
.
├── shared/                 # 共用規則引擎與協定（被前後端引用）
│   ├── src/board.ts        # 121 格六角星棋盤、立方座標、鄰接/跳躍表、座位分配
│   ├── src/game.ts         # 合法移動、連跳 BFS、回合、勝利判定、離場處理（純函式）
│   ├── src/protocol.ts     # Socket.IO C2S / S2C 事件型別、資料模型、輸入驗證
│   └── test/               # 規則單元測試
├── backend/
│   ├── src/roomManager.ts  # 記憶體房間管理：生命週期、權限、計時器、重連
│   ├── src/app.ts          # Express + Socket.IO、頻率限制、/health、SPA fallback
│   ├── src/index.ts        # 啟動入口（process.env.PORT、0.0.0.0）
│   └── test/               # 房間系統單元測試、Socket.IO 整合測試
├── frontend/
│   ├── src/lib/            # socket、客戶端狀態、音效（Web Audio 合成）、儲存、幾何
│   ├── src/components/     # 棋盤、星空背景、彈珠、勝利特效、聊天、HUD…
│   ├── src/pages/          # 首頁、大廳、建立/加入、等待房間、遊戲畫面
│   └── test/               # UI 測試（jsdom + Testing Library）
├── render.yaml             # Render Blueprint
├── .env.example
└── package.json            # npm workspaces
```

## 快速開始

### 1. 安裝 Node.js
需要 **Node.js 20.11 以上**（建議 22 LTS）：<https://nodejs.org/>

```bash
node -v   # v22.x
```

### 2. 安裝依賴
```bash
npm install
```

### 3. 本機開發
```bash
npm run dev
```
- 前端：<http://localhost:5173>（Vite，`/socket.io` 自動 proxy 到後端）
- 後端：<http://localhost:3000>
- 同網路的手機可用 `http://<電腦區網IP>:5173` 連線測試

### 4. 執行測試
```bash
npm test            # 全部測試（shared + backend + frontend）
npm run typecheck   # 全專案型別檢查
npx vitest run --project shared     # 只跑規則引擎
npx vitest run --project backend    # 只跑房間/連線
npx vitest run --project frontend   # 只跑 UI
```

### 5. 建置與以正式模式執行
```bash
npm run build       # shared → backend(tsc) → frontend(vite build)
npm start           # node backend/dist/index.js，同時提供前端與 Socket.IO
```
開啟 <http://localhost:3000>。PowerShell 可用 `$env:PORT=8080; npm start` 改埠。

## 部署到 Render.com

### 6. 推送到 GitHub
```bash
git init
git add .
git commit -m "Starry Chinese Checkers"
git branch -M main
git remote add origin https://github.com/<你的帳號>/starry-chinese-checkers.git
git push -u origin main
```

### 7. 建立 Web Service
**方式 A：Blueprint（推薦）**
Render Dashboard → **New → Blueprint** → 選擇此 repo → Render 讀取 `render.yaml` 自動建立服務。

**方式 B：手動**
Render Dashboard → **New → Web Service** → 選擇 repo，設定：

| 欄位 | 值 |
| --- | --- |
| Runtime | Node |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Instances | **1** |
| 環境變數 | `NODE_ENV=production`、`NODE_VERSION=22.15.0` |

### 8. 建置與啟動命令說明
- `--include=dev`：`NODE_ENV=production` 時 npm 預設不裝 devDependencies，但建置需要 TypeScript／Vite。
- 伺服器監聽 `process.env.PORT`（Render 自動注入）並綁定 `0.0.0.0`，沒有寫死埠號。
- 正式環境由 Express 提供 `frontend/dist` 靜態檔與 SPA fallback（`/room/XXXX` 等路徑都回 `index.html`），Socket.IO 路徑為 `/socket.io`，與網頁同源，不需設定 CORS 或額外網址。

### 9. 驗證公開網址
```bash
curl https://<你的服務>.onrender.com/health
# {"status":"ok","rooms":0,"uptime":12}
```
瀏覽器開啟網址，右上角連線狀態應為綠燈「已連線」。

### 10. 驗證手機與多人連線
1. 電腦開網址 → 建立房間 → 「複製邀請連結」。
2. 用手機（另一個網路也可以）開啟邀請連結 → 輸入暱稱 → 加入。
3. 手機按「我準備好了」，電腦按「開始遊戲」，雙方輪流走棋，確認兩邊棋盤同步。
4. 手機重新整理頁面、或關掉分頁再重開網站／邀請連結，應自動回到原座位（3 分鐘內）。
5. 測試直向與橫向畫面。

> Render 免費方案閒置約 15 分鐘會休眠，喚醒時伺服器重啟，**所有房間會消失**。

## ⚠️ 單一實例限制（重要）

本服務把狀態存在**單一 Node.js 程序的記憶體**。一個實例可以共享自己的記憶體，但**多個實例之間的記憶體不會自動同步**：玩家 A 連到實例 1、玩家 B 連到實例 2 時會看不到彼此的房間。

因此：
- 請保持 `numInstances: 1`，**不要開啟水平擴展 / Autoscaling**。
- 若未來需要多實例，必須重新設計狀態共享架構（例如外部共享狀態存放 + Socket.IO adapter + sticky session），這已超出本專案「不使用資料庫」的範圍。

## 遊戲規則與實作細節

### 棋盤
立方座標 `(q, r, s)`，星形 = `{q,r,s ≥ -4}` ∪ `{q,r,s ≤ 4}`，正好 121 格；中央六角 61 格，六個角落各 10 格。前端會旋轉棋盤，讓**自己的起點永遠在畫面下方**。

### 座位分配
| 人數 | 起點角落（0=上，順時針） | 說明 |
| --- | --- | --- |
| 2 | 0, 3 | 上下對角 |
| 3 | 0, 2, 4 | 間隔三角，目標區皆為空角 |
| 4 | 1, 2, 4, 5 | 兩組對角 |
| 5 | 0, 1, 2, 3, 4 | 角落 5 空置 |
| 6 | 全部 | |

### 移動
- 一步：移到相鄰空位。
- 跳躍：跳過緊鄰的任一棋子，落在正後方空位；可連跳、可轉向（BFS 找出所有落點與最短路徑）。
- 一步與跳躍不可混用；不吃子；不可落在有棋子的棋位。

### 規則選項（建立房間時設定，房主在等待中可修改）
| 選項 | 預設 | 說明 |
| --- | --- | --- |
| 目標區鎖定 | 開 | 進入目標區的棋子不能再移出目標區 |
| 防堵規則 | 開 | 目標區 10 格全被佔滿且其中至少 1 顆是自己的 → 獲勝（防止對手佔位阻擋） |
| 回合限時 | 不限 | 30／60／90 秒，逾時自動跳過 |

### 勝負
- 第一位完成者獲勝，遊戲結束並顯示結算（其餘依進入目標區棋子數、與目標距離排名）。
- 玩家中途離開：其座位停用、棋子留作障礙、回合自動跳過；只剩 1 人時該玩家獲勝。
- 若所有剩餘玩家都無合法移動，判定和局。

### 房間與生命週期（皆為記憶體計時器）
| 項目 | 時間 |
| --- | --- |
| 斷線保留座位 | 3 分鐘（重新整理、網路恢復、**關閉分頁後重開**皆可回到座位；`RECONNECT_GRACE_SECONDS` 可調） |
| 斷線玩家輪到時自動跳過 | 15 秒 |
| 等待中房間閒置關閉 | 30 分鐘 |
| 已結束房間保留 | 10 分鐘 |
| 單局最長 | 4 小時 |
| 伺服器房間上限 | 500 間 |
| 房間無人 | 立即清除 |

- 房主可開始遊戲（≥2 人、全員準備且在線；人數未滿也可提前開始，座位依實際人數分配）、修改設定、移除玩家（僅限未開始時）。
- 房主離開 → 自動移交給下一位在線玩家。
- 遊戲結束後房主可「再來一局」回到等待室。
- 公開房間代碼 6 碼，私人房間 8 碼（32 字元集、`crypto.randomInt` 產生，約 1.1 兆種組合）；私人房間不出現在大廳。

### 安全性
- 伺服器是唯一權威：每一步都在伺服器用 `shared` 規則引擎重新驗證。
- 身分只看 socket 連線與伺服器端對應，**不信任客戶端傳來的玩家 ID**。
- 重連使用 192-bit 隨機權杖（只回傳給本人，存在該分頁 `sessionStorage`），以 `timingSafeEqual` 比對。
- 每步附帶 `turnNumber`，防止重複提交；前端也會鎖住送出中的操作。
- 每個連線 token bucket 頻率限制（一般 20 次突發 / 8 次每秒；聊天另限 5 則突發）。
- 所有輸入皆驗證型別、長度並移除控制字元；`maxHttpBufferSize` 16KB。
- 廣播的玩家資料不含權杖或 socket ID。

### Socket.IO 事件
Client → Server：`createRoom`、`joinRoom`、`reconnectPlayer`、`leaveRoom`、`getPublicRooms`、`subscribeLobby`、`unsubscribeLobby`、`playerReady`、`kickPlayer`、`updateRoomSettings`、`startGame`、`makeMove`、`returnToRoom`、`chatMessage`（皆使用 ack 回傳 `{ ok, data | error }`）

Server → Client：`publicRoomsUpdated`、`roomUpdated`、`playerJoined`、`playerLeft`、`playerReady`、`gameStateUpdated`、`turnChanged`、`gameOver`、`chatMessage`、`kicked`、`error`

完整型別見 `shared/src/protocol.ts`。

## 其他設計決定
- **音效**：以 Web Audio 即時合成，沒有任何音效檔；使用者第一次點擊/按鍵前不建立 AudioContext；不支援時靜默略過。設定存在 localStorage。
- **動畫**：Framer Motion + CSS + Canvas；`MotionConfig reducedMotion="user"` 與 CSS media query 尊重 `prefers-reduced-motion`；分頁隱藏時停止星空動畫。
- **手機**：`100dvh`、safe-area padding、棋盤只在互動區設定 `touch-action`；提供 1x/1.5x/2x 縮放；命中範圍為整個棋位間距；重要資訊不依賴 hover。
- **重連機制**：
  - 重連權杖同時存在 `sessionStorage`（本分頁重新整理）與 `localStorage`（分頁被關閉後仍保留，6 小時後自動丟棄）。
  - 關閉分頁後重新開啟網站：首頁/大廳顯示「回到房間」；直接開啟原邀請連結會自動回到原座位。
  - 在房間中的分頁每 4 秒寫入心跳；其他分頁看到心跳仍新（12 秒內）就不會自動接管，所以同一瀏覽器多開分頁仍是不同玩家，方便本機測試。若要在新分頁接回，邀請對話框提供「在此分頁接回原座位」（舊分頁會被中斷）。
  - 分頁關閉（`pagehide`）時立即釋放心跳，重開時不用等待。
  - 對局進行中關閉或離開分頁，瀏覽器會先跳出確認提示。
  - 伺服器保留座位 3 分鐘；期間輪到該玩家時 15 秒後自動跳過。
- 字型：標題使用 Google Fonts「Fredoka」，載入失敗時退回系統字型。

## 環境變數
見 `.env.example`。全部選用：`PORT`（預設 3000）、`RECONNECT_GRACE_SECONDS`（預設 180）、`HOST`（預設 0.0.0.0）、`NODE_ENV`、`CLIENT_ORIGIN`（僅開發模式 CORS）、`STATIC_DIR`（前端建置目錄）。

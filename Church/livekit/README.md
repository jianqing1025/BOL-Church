# 自架 LiveKit（備援會議伺服器）

LiveKit Cloud 的分鐘額度用盡、或帳號出問題時，用這台接手小組查經與禱告會。

- 位址：`wss://live.bolccop.org`（VPS 152.53.39.9，netcup，美國維吉尼亞州 Manassas）
- 服務：`livekit`（SFU，本機 7880）、`caddy`（443 TLS 反向代理）
- 設定與金鑰：`/opt/church/livekit/`，金鑰檔 `keys.env` 權限 600，**不在版控內**

## 優先順序

**自架這台是主力**，發 token 前 Worker 會先探活（`https://live.bolccop.org/`，
逾時 1.5 秒、失敗重試一次）。探得到就用它——它沒有分鐘額度可以用完。

探不到才退回 LiveKit Cloud，兩組專案之間**依日期輪換的規則原封不動**。

重試一次是刻意的：單一個封包掉了就把會議推去雲端，會讓後加入的人跟已經
在自架伺服器上的人分屬兩台機器，而且畫面上看不出任何錯誤。

## 手動釘住（少用）

平常不需要設。`LIVEKIT_ACTIVE` **會繞過健康檢查**，所以釘在 `self` 時
VPS 掛了也不會自動退回雲端——只有在你明確要覆蓋自動判斷時才用：

```bash
cd Church
printf 'self' | npx wrangler secret put LIVEKIT_ACTIVE --config wrangler.toml            # 正式站
printf 'self' | npx wrangler secret put LIVEKIT_ACTIVE --config .tmp/wrangler.church-dev.toml  # dev
```

恢復自動模式（自架優先、斷線退回雲端）：

```bash
npx wrangler secret delete LIVEKIT_ACTIVE --config wrangler.toml
```

secret 立即生效，**不需要重新部署**。`a` / `b` 則是釘在指定的某一組雲端專案上。

**要在兩場聚會之間切換，不要在聚會進行中切。** 一個房間只存在於一台伺服器上；切換後才加入的人會連到另一台，跟已經在線的人完全隔開，而且畫面上看不出任何錯誤。

## 容量

實測上傳 485 Mbps、2 核、3.8 GB RAM。瓶頸是 CPU 而非頻寬，約 20–30 人。

| 人數 | 需要上傳 | 佔比 |
|---|---|---|
| 10 | 約 36 Mbps | 7% |
| 15 | 約 84 Mbps | 17% |
| 25 | 約 240 Mbps | 50% |

西雅圖到這台的來回延遲約 93 ms（美東↔美西），可用但不如美西機房。

## 重新安裝或改設定

```bash
scp -i ~/.ssh/bolccop_vps_ed25519 install.sh livekit.yaml.template Caddyfile \
    root@152.53.39.9:/opt/church/livekit-src/
ssh -i ~/.ssh/bolccop_vps_ed25519 root@152.53.39.9 \
    'cd /opt/church/livekit-src && bash install.sh live.bolccop.org'
```

腳本可重複執行：**既有的 API 金鑰會保留**，不會讓已經發出去的 token 失效。

## 檢查狀態

```bash
ssh -i ~/.ssh/bolccop_vps_ed25519 root@152.53.39.9 \
  'systemctl is-active livekit caddy; curl -s localhost:7880; journalctl -u livekit -n 20 --no-pager'
```

## 連接埠

| 埠 | 用途 |
|---|---|
| 443/tcp | 訊令（wss）與憑證申請 |
| 80/tcp | Let's Encrypt HTTP 驗證 |
| 7881/tcp | UDP 被擋死時的 ICE/TCP 回退 |
| 7882/udp | 媒體流（單一埠 mux） |

## DNS

`live.bolccop.org` → A 記錄 152.53.39.9，**必須維持 DNS only（灰雲）**。
開啟 Cloudflare 代理會讓 WebRTC 媒體流不通，症狀是連得上但沒有畫面與聲音。

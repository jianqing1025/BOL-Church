# 自架 LiveKit（備援會議伺服器）

LiveKit Cloud 的分鐘額度用盡、或帳號出問題時，用這台接手小組查經與禱告會。

- 位址：`wss://live.bolccop.org`（VPS 152.53.39.9，netcup，美國維吉尼亞州 Manassas）
- 服務：`livekit`（SFU，本機 7880）、`caddy`（443 TLS 反向代理）
- 設定與金鑰：`/opt/church/livekit/`，金鑰檔 `keys.env` 權限 600，**不在版控內**

## 切換

平常走 LiveKit Cloud 的兩組專案依日期輪換。要改用這台：

```bash
cd Church
printf 'self' | npx wrangler secret put LIVEKIT_ACTIVE --config wrangler.toml            # 正式站
printf 'self' | npx wrangler secret put LIVEKIT_ACTIVE --config .tmp/wrangler.church-dev.toml  # dev
```

改回雲端（恢復日期輪換）：

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

#!/usr/bin/env bash
#
# Installs the self-hosted LiveKit SFU that backs up LiveKit Cloud.
#
# Run as root on the VPS. Safe to re-run: existing API keys and certificates
# are kept, so re-running to pick up a config change never invalidates tokens
# already issued or forces a new certificate order.
#
#   bash install.sh live.bolccop.org
#
set -euo pipefail

DOMAIN="${1:?usage: install.sh <domain>}"
ROOT=/opt/church/livekit
KEYS="$ROOT/keys.env"

echo "==> 安裝相依套件"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl gnupg debian-keyring debian-archive-keyring apt-transport-https ca-certificates

if ! command -v caddy >/dev/null 2>&1; then
  echo "==> 安裝 Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi

if ! command -v livekit-server >/dev/null 2>&1; then
  echo "==> 安裝 livekit-server"
  curl -sSL https://get.livekit.io | bash
fi

mkdir -p "$ROOT"
chmod 750 "$ROOT"

# Keys are generated here and never leave the machine. Re-running the script
# must not rotate them: every token the Worker has already signed would stop
# working mid-meeting.
if [ ! -f "$KEYS" ]; then
  echo "==> 產生 API 金鑰（僅此一次）"
  {
    echo "LIVEKIT_API_KEY=API$(head -c 16 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 12)"
    echo "LIVEKIT_API_SECRET=$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 43)"
  } > "$KEYS"
  chmod 600 "$KEYS"
else
  echo "==> 沿用既有 API 金鑰"
fi
# shellcheck disable=SC1090
. "$KEYS"

echo "==> 寫入 livekit.yaml"
sed -e "s|__API_KEY__|${LIVEKIT_API_KEY}|" -e "s|__API_SECRET__|${LIVEKIT_API_SECRET}|" \
  "$(dirname "$0")/livekit.yaml.template" > "$ROOT/livekit.yaml"
chmod 600 "$ROOT/livekit.yaml"

echo "==> 建立 systemd 服務"
cat > /etc/systemd/system/livekit.service <<UNIT
[Unit]
Description=LiveKit SFU (self-hosted backup for church meetings)
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/livekit-server --config ${ROOT}/livekit.yaml
Restart=on-failure
RestartSec=5
User=root
# A dropped meeting is worse than a slow one: give it room to hold sessions.
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
UNIT

echo "==> 設定 Caddy"
sed "s|live.bolccop.org|${DOMAIN}|" "$(dirname "$0")/Caddyfile" > /etc/caddy/Caddyfile

echo "==> 開放連接埠"
ufw allow 80/tcp  comment 'HTTP (ACME challenge)'       >/dev/null
ufw allow 443/tcp comment 'LiveKit signalling over TLS' >/dev/null
ufw allow 7881/tcp comment 'LiveKit ICE/TCP fallback'   >/dev/null
ufw allow 7882/udp comment 'LiveKit media (UDP mux)'    >/dev/null

echo "==> 啟動服務"
systemctl daemon-reload
systemctl enable --now livekit
systemctl reload-or-restart caddy

echo
echo "==> 完成。金鑰存放於 ${KEYS}（權限 600）"
echo "    API KEY: ${LIVEKIT_API_KEY}"
echo "    SECRET 請用: grep SECRET ${KEYS}"

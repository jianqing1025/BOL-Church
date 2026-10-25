#!/usr/bin/env bash
set -euo pipefail

id -u finance-db >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin finance-db
install -d -o root -g root -m 755 /opt/finance-standby
install -o root -g root -m 755 /tmp/finance-standby-db_api.py /opt/finance-standby/db_api.py
install -d -o root -g finance-db -m 750 /etc/church-standby
if [ ! -s /etc/church-standby/token ]; then
  openssl rand -hex 48 > /tmp/church-standby-token
  install -o root -g finance-db -m 640 /tmp/church-standby-token /etc/church-standby/token
  rm -f /tmp/church-standby-token
fi
chown root:finance-db /etc/church-standby/token
chmod 640 /etc/church-standby/token
install -o root -g root -m 644 /tmp/bol-church-standby.service /etc/systemd/system/bol-church-standby.service

python3 - <<'PY'
from pathlib import Path

path = Path('/etc/caddy/Caddyfile')
config = path.read_text()
old = '152.53.39.9.sslip.io {\n\tencode zstd gzip\n\treverse_proxy 127.0.0.1:8788\n}'
new = '152.53.39.9.sslip.io {\n\tencode zstd gzip\n\thandle_path /bol-church/* {\n\t\treverse_proxy 127.0.0.1:8789\n\t}\n\thandle {\n\t\treverse_proxy 127.0.0.1:8788\n\t}\n}'
if old in config:
    Path('/root/Caddyfile.before-bol-church-standby').write_text(config)
    path.write_text(config.replace(old, new, 1))
elif new not in config:
    raise SystemExit('Existing Finance Caddy block did not match; refusing to overwrite it')
PY

caddy validate --config /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now bol-church-standby.service
systemctl restart finance-standby.service
systemctl reload caddy
rm -f /tmp/finance-standby-db_api.py /tmp/bol-church-standby.service
echo "BOL Church standby API installed."

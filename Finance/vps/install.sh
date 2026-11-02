#!/usr/bin/env bash
set -euo pipefail

id -u finance-db >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin finance-db
install -d -o root -g root -m 755 /opt/finance-standby
install -o root -g root -m 755 /tmp/finance-standby-db_api.py /opt/finance-standby/db_api.py
install -d -o root -g finance-db -m 750 /etc/finance-standby
if [ ! -s /etc/finance-standby/token ]; then
  openssl rand -hex 48 > /tmp/finance-standby-token
  install -o root -g finance-db -m 640 /tmp/finance-standby-token /etc/finance-standby/token
  rm -f /tmp/finance-standby-token
fi
chown root:finance-db /etc/finance-standby/token
chmod 640 /etc/finance-standby/token
chown -R finance-db:finance-db /var/lib/finance-standby
chmod 700 /var/lib/finance-standby
chmod 600 /var/lib/finance-standby/finance.sqlite3
install -o root -g root -m 644 /tmp/finance-standby.service /etc/systemd/system/finance-standby.service

if ! grep -q '152.53.39.9.sslip.io' /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile /root/Caddyfile.before-finance-standby
  cat /tmp/finance-standby.Caddyfile >> /etc/caddy/Caddyfile
fi

caddy validate --config /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now finance-standby.service
systemctl reload caddy
rm -f /tmp/finance-standby-db_api.py /tmp/finance-standby.service /tmp/finance-standby.Caddyfile
echo "Finance standby API installed."

#!/usr/bin/env bash
set -euo pipefail

id -u finance-db >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin finance-db
install -d -o finance-db -g finance-db -m 700 /var/lib/church-standby
python3 - <<'PY'
import sqlite3
p = "/var/lib/church-standby/bol-church.sqlite3"
c = sqlite3.connect(p)
with open("/tmp/bol-church-vps-copy.sql", encoding="utf-8") as f:
    c.executescript(f.read())
c.commit()
tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
print("TABLE_COUNT", len(tables))
for table in tables:
    quoted = '"' + table.replace('"', '""') + '"'
    print("ROWS", table, c.execute("SELECT COUNT(*) FROM " + quoted).fetchone()[0])
print("INTEGRITY", c.execute("PRAGMA integrity_check").fetchone()[0])
print("MIGRATIONS", c.execute("SELECT COUNT(*) FROM d1_migrations").fetchone()[0])
c.close()
PY
chown finance-db:finance-db /var/lib/church-standby/bol-church.sqlite3
chmod 600 /var/lib/church-standby/bol-church.sqlite3
rm -f /tmp/bol-church-vps-copy.sql

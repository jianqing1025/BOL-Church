#!/usr/bin/env bash
set -euo pipefail

id -u finance-db >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin finance-db
install -d -o finance-db -g finance-db -m 700 /var/lib/church-photos-standby
python3 - <<'PY'
import sqlite3
p = "/var/lib/church-photos-standby/photos.sqlite3"
c = sqlite3.connect(p)
with open("/tmp/church-photos-vps-copy.sql", encoding="utf-8") as f:
    dump = f.read()
# D1's SQL export can place literal NUL bytes inside quoted TEXT values. Turn
# each into a SQL expression while preserving the exact stored string value.
dump = dump.replace("\x00", "'||char(0)||'")
c.executescript("BEGIN TRANSACTION;\n" + dump + "\nCOMMIT;")
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
chown finance-db:finance-db /var/lib/church-photos-standby/photos.sqlite3
chmod 600 /var/lib/church-photos-standby/photos.sqlite3
rm -f /tmp/church-photos-vps-copy.sql

#!/usr/bin/env python3
"""Small authenticated SQLite HTTP endpoint for the Finance VPS standby."""

import hmac
import json
import os
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DB_PATH = os.environ.get("STANDBY_DB_PATH", "/var/lib/finance-standby/finance.sqlite3")
TOKEN_PATH = os.environ.get("STANDBY_TOKEN_PATH", "/etc/finance-standby/token")
PORT = int(os.environ.get("STANDBY_PORT", "8788"))
MAX_BODY = 1_000_000


def db_connect():
    connection = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 10000")
    return connection


def execute(connection, statement):
    sql = statement.get("sql")
    params = statement.get("params", [])
    mode = statement.get("mode", "run")
    if not isinstance(sql, str) or not sql.strip() or len(sql) > 100_000:
        raise ValueError("Invalid SQL statement")
    if not isinstance(params, list) or len(params) > 100:
        raise ValueError("Invalid SQL parameters")
    if mode not in ("run", "all", "first"):
        raise ValueError("Invalid query mode")

    before = connection.total_changes
    cursor = connection.execute(sql, params)
    rows = []
    if cursor.description:
        if mode == "first":
            row = cursor.fetchone()
            rows = [dict(row)] if row is not None else []
        elif mode == "all" or mode == "run":
            rows = [dict(row) for row in cursor.fetchall()]
    return {
        "success": True,
        "results": rows,
        "meta": {
            "changes": connection.total_changes - before,
            "last_row_id": cursor.lastrowid,
            "duration": 0,
        },
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "FinanceStandby/1"
    sys_version = ""

    def log_message(self, _format, *_args):
        # Request bodies and SQL can contain finance data; keep access logs quiet.
        return

    def respond(self, status, payload):
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            expected = open(TOKEN_PATH, "rb").read().strip()
            supplied = self.headers.get("Authorization", "").removeprefix("Bearer ").encode()
            if not expected or not hmac.compare_digest(supplied, expected):
                self.respond(401, {"error": "Unauthorized"})
                return
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > MAX_BODY:
                self.respond(413, {"error": "Request size is invalid"})
                return
            request = json.loads(self.rfile.read(length))
            connection = db_connect()
            try:
                if self.path == "/db/query":
                    result = execute(connection, request)
                elif self.path == "/db/batch":
                    statements = request.get("statements")
                    if not isinstance(statements, list) or not statements or len(statements) > 100:
                        raise ValueError("Invalid batch")
                    connection.execute("BEGIN IMMEDIATE")
                    try:
                        result = {"results": [execute(connection, {**item, "mode": "run"}) for item in statements]}
                        connection.execute("COMMIT")
                    except Exception:
                        connection.execute("ROLLBACK")
                        raise
                else:
                    self.respond(404, {"error": "Not found"})
                    return
            finally:
                connection.close()
            self.respond(200, result)
        except (ValueError, TypeError, json.JSONDecodeError, sqlite3.Error) as exc:
            self.respond(400, {"error": str(exc)[:300]})
        except Exception:
            self.respond(500, {"error": "Database service error"})


if __name__ == "__main__":
    token = open(TOKEN_PATH, "rb").read().strip()
    if len(token) < 32:
        raise SystemExit("Finance standby token must be at least 32 bytes")
    if not os.path.isfile(DB_PATH):
        raise SystemExit("Finance standby database is missing")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

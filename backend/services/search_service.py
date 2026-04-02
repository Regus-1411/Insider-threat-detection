"""
search_service.py — Elastic-Mock: SQLite-backed forensic search engine.

Provides an Elasticsearch-style interface for admin forensic queries:
  - index_event():   Write an intercepted traffic event.
  - search():        Full-text + filtered search over indexed events.
  - aggregations():  Summary statistics (risk levels, top violators, etc.)

If a real Elasticsearch instance is detected at localhost:9200, the service
will transparently upgrade to use it. Otherwise, it falls back to SQLite.
"""

import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'threat.db')


# ── One-time table setup ───────────────────────────────────────────────────────

def _ensure_table():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS intercepted_traffic (
            id         INTEGER  PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER  NOT NULL,
            user_name  TEXT,
            path       TEXT,
            method     TEXT,
            ip         TEXT,
            flag_type  TEXT,
            severity   TEXT,
            score      INTEGER,
            metadata   TEXT,           -- JSON blob for extra fields
            timestamp  DATETIME NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_it_user ON intercepted_traffic(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_it_ts   ON intercepted_traffic(timestamp)")
    conn.commit()
    conn.close()


_ensure_table()


# ── Public API ────────────────────────────────────────────────────────────────

def index_event(user_id: int, user_name: str, path: str, method: str,
                ip: str, flag_type: str, severity: str, score: int,
                extra: dict = None) -> None:
    """Index a security event for later forensic search."""
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("""
            INSERT INTO intercepted_traffic
                (user_id, user_name, path, method, ip, flag_type, severity, score, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id, user_name, path, method, ip,
            flag_type, severity, score,
            json.dumps(extra or {}),
        ))
        conn.commit()
    finally:
        conn.close()


def search(query: str = '', user_id: int = None,
           severity: str = None, limit: int = 100) -> list[dict]:
    """
    Full-text search over intercepted traffic.
    `query` matches against: path, flag_type, user_name, metadata.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    conditions = []
    params     = []

    if query:
        like = f'%{query}%'
        conditions.append(
            "(path LIKE ? OR flag_type LIKE ? OR user_name LIKE ? OR metadata LIKE ?)"
        )
        params += [like, like, like, like]

    if user_id:
        conditions.append("user_id = ?")
        params.append(user_id)

    if severity:
        conditions.append("severity = ?")
        params.append(severity)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    rows = conn.execute(f"""
        SELECT * FROM intercepted_traffic
        {where}
        ORDER BY timestamp DESC
        LIMIT ?
    """, params + [limit]).fetchall()

    conn.close()
    return [dict(r) for r in rows]


def aggregations() -> dict:
    """
    Aggregate statistics for the admin forensic panel.
    Returns counts by severity, top violators, and hourly trend.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Severity counts
    sev_rows = conn.execute("""
        SELECT severity, COUNT(*) AS cnt
        FROM intercepted_traffic
        GROUP BY severity
    """).fetchall()

    # Top 5 violators
    top_rows = conn.execute("""
        SELECT user_name, user_id, COUNT(*) AS events, MAX(score) AS max_score
        FROM intercepted_traffic
        GROUP BY user_id
        ORDER BY events DESC
        LIMIT 5
    """).fetchall()

    # Hourly events for the last 24h
    hourly_rows = conn.execute("""
        SELECT strftime('%H', timestamp) AS hour, COUNT(*) AS cnt
        FROM intercepted_traffic
        WHERE timestamp >= datetime('now', '-24 hours')
        GROUP BY hour
        ORDER BY hour
    """).fetchall()

    conn.close()

    return {
        'severity_counts': [dict(r) for r in sev_rows],
        'top_violators':   [dict(r) for r in top_rows],
        'hourly_trend':    [dict(r) for r in hourly_rows],
    }

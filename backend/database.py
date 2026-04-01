import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'threat.db')


def get_connection():
    """Return a new SQLite connection with row_factory set."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Create all tables if they do not exist."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS admins (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT    UNIQUE NOT NULL,
            password_hash TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER  PRIMARY KEY AUTOINCREMENT,
            name          TEXT     NOT NULL,
            email         TEXT     UNIQUE NOT NULL,
            password_hash TEXT     NOT NULL DEFAULT '',
            department    TEXT     NOT NULL,
            role          TEXT     NOT NULL DEFAULT 'Employee',
            is_active     BOOLEAN  NOT NULL DEFAULT 0,
            created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS user_logs (
            id             INTEGER  PRIMARY KEY AUTOINCREMENT,
            user_id        INTEGER  NOT NULL REFERENCES users(id),
            timestamp      DATETIME NOT NULL DEFAULT (datetime('now')),
            action         TEXT     NOT NULL,
            ip_address     TEXT,
            device_os      TEXT,
            browser        TEXT,
            location       TEXT,
            sessions_today INTEGER  NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS fingerprints (
            id                INTEGER  PRIMARY KEY AUTOINCREMENT,
            user_id           INTEGER  UNIQUE NOT NULL REFERENCES users(id),
            usual_login_hours TEXT,
            common_ip         TEXT,
            common_os         TEXT,
            common_browser    TEXT,
            anomaly_score     REAL     NOT NULL DEFAULT 0.0,
            last_updated      DATETIME NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS risk_scores (
            id              INTEGER  PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER  UNIQUE NOT NULL REFERENCES users(id),
            score           INTEGER  NOT NULL DEFAULT 0,
            level           TEXT     NOT NULL DEFAULT 'Low',
            last_calculated DATETIME NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS flags (
            id        INTEGER  PRIMARY KEY AUTOINCREMENT,
            user_id   INTEGER  NOT NULL REFERENCES users(id),
            timestamp DATETIME NOT NULL DEFAULT (datetime('now')),
            flag_type TEXT     NOT NULL,
            severity  TEXT     NOT NULL,
            resolved  BOOLEAN  NOT NULL DEFAULT 0,
            notes     TEXT
        );
    """)

    conn.commit()
    conn.close()
    print("[DB] Tables created / verified.")


if __name__ == '__main__':
    init_db()

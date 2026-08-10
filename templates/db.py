"""SQLite access and forward-only schema migration helpers."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

from flask import current_app, g


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def get_db() -> sqlite3.Connection:
    if "db_conn" not in g:
        g.db_conn = _connect(current_app.config["DATABASE"])
    return g.db_conn


def close_db(_error=None) -> None:
    conn = g.pop("db_conn", None)
    if conn is not None:
        conn.close()


def init_db(app) -> None:
    """Create the schema or upgrade it without changing existing chat content."""
    conn = _connect(app.config["DATABASE"])
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                student_id TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_login TEXT
            )
            """
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
        if "student_id" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN student_id TEXT NOT NULL DEFAULT ''")
        if "is_admin" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")

        duplicates = conn.execute(
            """
            SELECT student_id FROM users
            GROUP BY student_id HAVING COUNT(*) > 1
            """
        ).fetchall()
        if duplicates:
            raise RuntimeError(
                "数据库迁移已停止：发现重复学号。请先备份数据库并人工处理重复账户。"
            )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                session_id TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_student_id ON users(student_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_chat_user_session_time ON chat_messages(user_id, session_id, created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_chat_user_time ON chat_messages(user_id, created_at)")
        conn.commit()
    finally:
        conn.close()


def save_message_pair(user_id: int, session_id: str, user_text: str, assistant_text: str) -> None:
    conn = get_db()
    now = utc_now()
    conn.executemany(
        """
        INSERT INTO chat_messages (user_id, role, content, session_id, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        [
            (user_id, "user", user_text, session_id, now),
            (user_id, "assistant", assistant_text, session_id, now),
        ],
    )
    conn.commit()

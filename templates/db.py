"""SQLite access and forward-only schema migration helpers."""

from __future__ import annotations

import sqlite3
import json
from datetime import datetime, timezone
from typing import Any

from flask import current_app, g


PUBLIC_ASSESSMENT_FIELDS = (
    "emotions",
    "concerns",
    "functioning",
    "protectiveFactors",
    "evidenceSufficiency",
    "followUpTarget",
)


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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS assessment_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_id TEXT NOT NULL,
                state_json TEXT NOT NULL,
                safety_level TEXT,
                evidence_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS context_checkpoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_id TEXT NOT NULL,
                summary TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS ix_assessment_user_session_time ON assessment_snapshots(user_id, session_id, id DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_checkpoint_user_session_time ON context_checkpoints(user_id, session_id, id DESC)")
        conn.commit()
    finally:
        conn.close()


def load_session_context(user_id: int, session_id: str) -> tuple[list[dict[str, str]], dict[str, Any], str]:
    """Return only one user's persisted context for a single session."""
    conn = get_db()
    messages = conn.execute(
        """
        SELECT role, content FROM chat_messages
        WHERE user_id = ? AND session_id = ?
        ORDER BY id ASC
        """,
        (user_id, session_id),
    ).fetchall()
    snapshot = conn.execute(
        """
        SELECT state_json FROM assessment_snapshots
        WHERE user_id = ? AND session_id = ?
        ORDER BY id DESC LIMIT 1
        """,
        (user_id, session_id),
    ).fetchone()
    checkpoint = conn.execute(
        """
        SELECT summary FROM context_checkpoints
        WHERE user_id = ? AND session_id = ?
        ORDER BY id DESC LIMIT 1
        """,
        (user_id, session_id),
    ).fetchone()
    try:
        state = json.loads(snapshot["state_json"]) if snapshot else {}
    except (json.JSONDecodeError, TypeError):
        state = {}
    return [dict(row) for row in messages], state if isinstance(state, dict) else {}, checkpoint["summary"] if checkpoint else ""


def latest_assessment(user_id: int, session_id: str):
    """Return the display-safe state and timestamp, never internal risk evidence."""
    row = get_db().execute(
        """
        SELECT state_json, created_at FROM assessment_snapshots
        WHERE user_id = ? AND session_id = ?
        ORDER BY id DESC LIMIT 1
        """,
        (user_id, session_id),
    ).fetchone()
    if not row:
        return None
    try:
        state = json.loads(row["state_json"])
    except (json.JSONDecodeError, TypeError):
        state = {}
    display_state = {
        key: state[key]
        for key in PUBLIC_ASSESSMENT_FIELDS
        if isinstance(state, dict) and isinstance(state.get(key), str)
    }
    return {"state": display_state, "created_at": row["created_at"]}


def save_turn(
    user_id: int,
    session_id: str,
    user_text: str,
    assistant_text: str,
    *,
    state_snapshot: dict[str, Any] | None = None,
    safety_level: str | None = None,
    evidence: dict[str, Any] | None = None,
    checkpoint_summary: str | None = None,
    mode: str = "companion",
) -> None:
    """Atomically persist a completed turn and optional companion-only state."""
    conn = get_db()
    now = utc_now()
    with conn:
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
        if mode == "companion" and state_snapshot is not None:
            conn.execute(
                """
                INSERT INTO assessment_snapshots (user_id, session_id, state_json, safety_level, evidence_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user_id, session_id, json.dumps(state_snapshot, ensure_ascii=False), safety_level, json.dumps(evidence, ensure_ascii=False) if evidence is not None else None, now),
            )
        if mode == "companion" and checkpoint_summary is not None:
            conn.execute(
                """
                INSERT INTO context_checkpoints (user_id, session_id, summary, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (user_id, session_id, checkpoint_summary, now),
            )


def delete_session_data(user_id: int, session_id: str | None) -> int:
    """Delete a user's session messages and every associated state record together."""
    conn = get_db()
    with conn:
        if session_id is None:
            cursor = conn.execute("DELETE FROM chat_messages WHERE user_id = ? AND session_id IS NULL", (user_id,))
        else:
            conn.execute("DELETE FROM assessment_snapshots WHERE user_id = ? AND session_id = ?", (user_id, session_id))
            conn.execute("DELETE FROM context_checkpoints WHERE user_id = ? AND session_id = ?", (user_id, session_id))
            cursor = conn.execute("DELETE FROM chat_messages WHERE user_id = ? AND session_id = ?", (user_id, session_id))
    return cursor.rowcount


def save_message_pair(user_id: int, session_id: str, user_text: str, assistant_text: str) -> None:
    """Backward-compatible message-only persistence helper."""
    save_turn(user_id, session_id, user_text, assistant_text)

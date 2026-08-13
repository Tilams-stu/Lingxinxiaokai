"""Flask application factory and HTTP routes for 聆心小开."""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from datetime import timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, Response, abort, current_app, g, jsonify, request, send_from_directory, session, stream_with_context
from flask.cli import with_appcontext
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

from ai_service import CRISIS_REPLY, is_crisis
from db import close_db, delete_session_data, get_db, init_db, latest_assessment, load_session_context, save_turn, utc_now
from gateway import GatewayError, NodeGateway


BASE_DIR = Path(__file__).resolve().parent
logger = logging.getLogger(__name__)
VISIBLE = lambda value: bool(value) and all(char.isprintable() and not char.isspace() for char in value)


class _NoopLimiter:
    def limit(self, *_args, **_kwargs):
        return lambda function: function


class KeyedBusyLock:
    """Non-blocking process-local exclusion for one authenticated session turn."""

    def __init__(self):
        self._guard = threading.Lock()
        self._held: set[tuple[int, str]] = set()

    def acquire(self, key: tuple[int, str]) -> bool:
        with self._guard:
            if key in self._held:
                return False
            self._held.add(key)
            return True

    def release(self, key: tuple[int, str]) -> None:
        with self._guard:
            self._held.discard(key)


def _load_env() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv(BASE_DIR / ".env")
    except ImportError:
        pass


def _error(code: str, message: str, status: int):
    return jsonify({"error": code, "message": message}), status


def _current_user():
    if "current_user" not in g:
        user_id = session.get("user_id")
        g.current_user = get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone() if user_id else None
    return g.current_user


def _serialize_user(user):
    return {
        "id": user["id"],
        "username": user["username"],
        "student_id": user["student_id"],
        "is_admin": bool(user["is_admin"]),
        "created_at": user["created_at"],
        "last_login": user["last_login"],
    }


def login_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        if not _current_user():
            return _error("unauthorized", "请先登录", 401)
        return function(*args, **kwargs)

    return wrapper


def admin_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        user = _current_user()
        if not user:
            return _error("unauthorized", "请先登录", 401)
        if not bool(user["is_admin"]):
            return _error("forbidden", "无管理员权限", 403)
        return function(*args, **kwargs)

    return wrapper


def _validate_chat(payload: dict):
    mode = payload.get("mode")
    session_id = payload.get("session_id")
    if "messages" in payload or "history" in payload:
        return None, _error("client_history_not_allowed", "浏览器不能提交会话历史", 400)
    message = payload.get("message")
    if mode not in {"companion", "popsci"}:
        return None, _error("invalid_mode", "聊天模式无效", 400)
    if not isinstance(session_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", session_id):
        return None, _error("invalid_session", "会话标识无效", 400)
    if not isinstance(message, str) or not message.strip() or len(message) > 4000:
        return None, _error("invalid_message", "消息内容不能为空且不能超过 4000 字符", 400)
    return (mode, session_id, message.strip(), payload.get("stream") is True), None


def create_app(test_config: dict | None = None) -> Flask:
    _load_env()
    app = Flask(__name__)
    app.config.from_mapping(
        SECRET_KEY=os.getenv("SECRET_KEY", ""),
        DATABASE=os.getenv("CHAT_DB_PATH", str(BASE_DIR / "data" / "chat.db")),
        DEBUG=os.getenv("APP_DEBUG", "false").lower() in {"1", "true", "yes", "on"},
        SESSION_COOKIE_NAME=os.getenv("SESSION_COOKIE_NAME", "lx_session"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE=os.getenv("SESSION_COOKIE_SAMESITE", "Lax"),
        SESSION_COOKIE_SECURE=os.getenv("SESSION_COOKIE_SECURE", "false").lower() in {"1", "true", "yes", "on"},
        AGENT_BASE_URL=os.getenv("AGENT_BASE_URL", "http://127.0.0.1:8787"),
        MAX_CHECKPOINT_CHARS=int(os.getenv("MAX_CHECKPOINT_CHARS", "80000")),
        RATELIMIT_ENABLED=True,
    )
    if test_config:
        app.config.update(test_config)
    app.permanent_session_lifetime = timedelta(seconds=int(os.getenv("SESSION_TTL", "604800")))

    if not app.config["TESTING"]:
        placeholders = {"", "dev-secret-key", "placeholder", "your-long-random-secret-key-here", "your-deepseek-api-key-here"}
        if app.config["SECRET_KEY"] in placeholders:
            raise RuntimeError("生产配置缺少有效的 SECRET_KEY")
    if os.getenv("TRUST_PROXY_HEADERS", "false").lower() in {"1", "true", "yes", "on"}:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)

    CORS(
        app,
        resources={r"/api/*": {"origins": [os.getenv("DEV_FRONTEND_ORIGIN", "http://localhost:5173")]}},
        supports_credentials=True,
        allow_headers=["Content-Type"],
    )
    app.teardown_appcontext(close_db)
    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
    init_db(app)
    app.extensions["session_turn_lock"] = KeyedBusyLock()
    app.extensions["turn_gateway"] = app.config.get("TURN_GATEWAY") or NodeGateway(app.config["AGENT_BASE_URL"])

    limiter = _NoopLimiter()
    if app.config["RATELIMIT_ENABLED"]:
        try:
            from flask_limiter import Limiter
            from flask_limiter.util import get_remote_address
        except ImportError as exc:
            raise RuntimeError("缺少 Flask-Limiter；请安装 templates/requirements.txt") from exc

        limiter = Limiter(key_func=get_remote_address, app=app, default_limits=[])

    def user_key():
        user = _current_user()
        return f"user:{user['id']}" if user else request.remote_addr

    @app.after_request
    def no_cache_api(response):
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, private"
            response.headers["Pragma"] = "no-cache"
        return response

    @app.errorhandler(413)
    def request_too_large(_error_value):
        return _error("payload_too_large", "请求内容过大", 413)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    def serve_spa():
        dist = BASE_DIR / "dist" / "index.html"
        if not dist.is_file():
            return Response("前端构建文件缺失。请在 web 目录执行 npm.cmd run build。", status=503, mimetype="text/plain")
        return send_from_directory(BASE_DIR / "dist", "index.html")

    @app.get("/")
    @app.get("/login")
    @app.get("/home")
    @app.get("/admin")
    def spa_routes():
        return serve_spa()

    @app.get("/info")
    def info_page():
        return send_from_directory(BASE_DIR, "index（心理科普）.html")

    @app.get("/companion")
    def companion_page():
        return send_from_directory(BASE_DIR, "index（心理陪伴）.html")

    @app.get("/<path:path>")
    def static_files(path: str):
        if path.startswith("api/") or path in {"profile", "users", "settings", "聆心小开.apk"}:
            abort(404)
        dist_file = BASE_DIR / "dist" / path
        if dist_file.is_file():
            return send_from_directory(BASE_DIR / "dist", path)
        local_file = BASE_DIR / path
        if local_file.is_file():
            return send_from_directory(BASE_DIR, path)
        abort(404)

    @app.post("/api/auth/register")
    @limiter.limit("5 per hour")
    def register():
        data = request.get_json(silent=True) or {}
        username = str(data.get("username", "")).strip()
        student_id = str(data.get("student_id", "")).strip()
        password = str(data.get("password", ""))
        if not (3 <= len(username) <= 32 and VISIBLE(username)):
            return _error("invalid_username", "称呼需为 3 到 32 个可见字符", 400)
        if not (1 <= len(student_id) <= 32 and VISIBLE(student_id)):
            return _error("invalid_student_id", "学号需为 1 到 32 个可见字符", 400)
        if len(password) < 8:
            return _error("invalid_password", "密码至少需要 8 位", 400)
        conn = get_db()
        if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            return _error("username_taken", "该称呼已被使用", 409)
        if conn.execute("SELECT 1 FROM users WHERE student_id = ?", (student_id,)).fetchone():
            return _error("student_id_taken", "该学号已注册", 409)
        now = utc_now()
        cursor = conn.execute(
            """
            INSERT INTO users (username, password_hash, student_id, is_admin, created_at)
            VALUES (?, ?, ?, 0, ?)
            """,
            (username, generate_password_hash(password), student_id, now),
        )
        conn.commit()
        user = conn.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
        session.clear()
        session["user_id"] = user["id"]
        session.permanent = True
        return jsonify({"user": _serialize_user(user)}), 201

    @app.post("/api/auth/login")
    @limiter.limit("10 per minute")
    def login():
        data = request.get_json(silent=True) or {}
        username = str(data.get("username", "")).strip()
        student_id = str(data.get("student_id", "")).strip()
        password = str(data.get("password", ""))
        user = get_db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if not user or user["student_id"] != student_id or not check_password_hash(user["password_hash"], password):
            return _error("invalid_credentials", "称呼、学号或密码错误", 401)
        now = utc_now()
        get_db().execute("UPDATE users SET last_login = ? WHERE id = ?", (now, user["id"]))
        get_db().commit()
        session.clear()
        session["user_id"] = user["id"]
        session.permanent = True
        user = get_db().execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        return jsonify({"user": _serialize_user(user)})

    @app.post("/api/auth/logout")
    def logout():
        session.clear()
        return jsonify({"ok": True})

    @app.get("/api/users/me")
    @login_required
    def current_user():
        return jsonify({"user": _serialize_user(_current_user())})

    @app.get("/api/users")
    @admin_required
    def list_users():
        rows = get_db().execute(
            """
            SELECT u.*, COUNT(c.id) AS chat_count FROM users u
            LEFT JOIN chat_messages c ON c.user_id = u.id
            GROUP BY u.id ORDER BY u.created_at DESC
            """
        ).fetchall()
        return jsonify({"users": [{**_serialize_user(row), "chat_count": row["chat_count"]} for row in rows]})

    @app.get("/api/users/me/messages")
    @login_required
    def my_messages():
        limit = min(max(request.args.get("limit", default=200, type=int), 1), 2000)
        rows = get_db().execute(
            """
            SELECT id, role, content, session_id, created_at FROM chat_messages
            WHERE user_id = ? ORDER BY created_at ASC LIMIT ?
            """,
            (_current_user()["id"], limit),
        ).fetchall()
        return jsonify({"messages": [dict(row) for row in rows]})

    @app.delete("/api/users/me/messages")
    @login_required
    def delete_my_messages():
        session_id = request.args.get("session_id")
        if session_id is None:
            return _error("invalid_payload", "缺少 session_id", 400)
        return jsonify({"ok": True, "deleted": delete_session_data(_current_user()["id"], session_id or None)})

    @app.get("/api/users/<int:user_id>/messages")
    @admin_required
    def user_messages(user_id: int):
        limit = min(max(request.args.get("limit", default=100, type=int), 1), 500)
        rows = get_db().execute(
            "SELECT id, role, content, session_id, created_at FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        return jsonify({"messages": [dict(row) for row in rows]})

    @app.get("/api/admin/export-all")
    @admin_required
    def export_all():
        rows = get_db().execute(
            """
            SELECT u.id AS user_id, u.username, u.student_id, u.created_at, u.last_login,
                   c.id AS message_id, c.role, c.content, c.session_id, c.created_at AS message_created_at
            FROM users u LEFT JOIN chat_messages c ON c.user_id = u.id
            ORDER BY u.id, c.created_at
            """
        ).fetchall()
        users: dict[int, dict] = {}
        for row in rows:
            entry = users.setdefault(
                row["user_id"],
                {"id": row["user_id"], "username": row["username"], "student_id": row["student_id"], "created_at": row["created_at"], "last_login": row["last_login"], "messages": []},
            )
            if row["message_id"] is not None:
                entry["messages"].append({"id": row["message_id"], "role": row["role"], "content": row["content"], "session_id": row["session_id"], "created_at": row["message_created_at"]})
        body = json.dumps({"exported_at": utc_now(), "users": list(users.values())}, ensure_ascii=False).encode("utf-8")
        return Response(body, mimetype="application/json", headers={"Content-Disposition": "attachment; filename=chat_export.json"})

    @app.post("/api/chat")
    @login_required
    @limiter.limit("30 per minute", key_func=user_key)
    def chat():
        validated, error = _validate_chat(request.get_json(silent=True) or {})
        if error:
            return error
        mode, session_id, user_text, wants_stream = validated
        user_id = _current_user()["id"]
        busy_lock: KeyedBusyLock = app.extensions["session_turn_lock"]
        key = (user_id, session_id)
        if not busy_lock.acquire(key):
            return _error("session_busy", "该会话正在处理中", 409)
        if is_crisis(user_text):
            try:
                save_turn(user_id, session_id, user_text, CRISIS_REPLY, mode=mode)
            finally:
                busy_lock.release(key)
            if wants_stream:
                def crisis_stream():
                    yield f"event: delta\ndata: {json.dumps({'content': CRISIS_REPLY}, ensure_ascii=False)}\n\n"
                    yield "event: done\ndata: {}\n\n"
                return Response(stream_with_context(crisis_stream()), mimetype="text/event-stream")
            return jsonify({"reply": CRISIS_REPLY})
        try:
            messages, state_snapshot, summary = load_session_context(user_id, session_id)
            gateway = app.extensions["turn_gateway"]
            events = gateway.stream_turn(mode=mode, input=user_text, state_snapshot=state_snapshot, messages=messages, summary=summary)

            def turn_result(event):
                if event.type != "result":
                    return None, None
                snapshot = event.state_snapshot
                checkpoint = event.checkpoint_summary
                if snapshot is None and checkpoint is None and event.content:
                    try:
                        payload = json.loads(event.content)
                    except json.JSONDecodeError:
                        payload = {}
                    snapshot = payload.get("stateSnapshot") if isinstance(payload.get("stateSnapshot"), dict) else None
                    checkpoint = payload.get("checkpointSummary") if isinstance(payload.get("checkpointSummary"), str) else None
                if isinstance(checkpoint, str):
                    limit = max(0, app.config["MAX_CHECKPOINT_CHARS"])
                    checkpoint = checkpoint[-limit:] if limit else ""
                return snapshot if isinstance(snapshot, dict) else None, checkpoint if isinstance(checkpoint, str) else None

            if wants_stream:
                def proxy_stream():
                    reply_parts: list[str] = []
                    failed = False
                    result_snapshot = None
                    result_checkpoint = None
                    try:
                        for event in events:
                            if event.type == "done":
                                continue
                            if event.type == "result":
                                result_snapshot, result_checkpoint = turn_result(event)
                                continue
                            if event.type == "error":
                                failed = True
                                yield f"event: error\ndata: {json.dumps({'message': event.message or 'local agent unavailable'}, ensure_ascii=False)}\n\n"
                            elif event.type in {"analysis", "delta"} and event.content:
                                if event.type == "delta":
                                    reply_parts.append(event.content)
                                yield f"event: {event.type}\ndata: {json.dumps({'content': event.content}, ensure_ascii=False)}\n\n"
                        reply = "".join(reply_parts).strip()
                        if not failed and reply:
                            save_turn(
                                user_id,
                                session_id,
                                user_text,
                                reply,
                                state_snapshot=result_snapshot if mode == "companion" else None,
                                checkpoint_summary=result_checkpoint if mode == "companion" else None,
                                mode=mode,
                            )
                        elif not failed:
                            yield f"event: error\ndata: {json.dumps({'message': 'local agent returned no reply'}, ensure_ascii=False)}\n\n"
                    except GatewayError as exc:
                        yield f"event: error\ndata: {json.dumps({'message': str(exc)}, ensure_ascii=False)}\n\n"
                    finally:
                        busy_lock.release(key)
                        yield "event: done\ndata: {}\n\n"
                return Response(stream_with_context(proxy_stream()), mimetype="text/event-stream")
            reply_parts = []
            result_snapshot = None
            result_checkpoint = None
            for event in events:
                if event.type == "error":
                    raise GatewayError(event.message or "local agent unavailable")
                if event.type == "result":
                    result_snapshot, result_checkpoint = turn_result(event)
                if event.type == "delta" and event.content:
                    reply_parts.append(event.content)
            reply = "".join(reply_parts).strip()
            if not reply:
                raise GatewayError("local agent returned no reply")
            save_turn(
                user_id,
                session_id,
                user_text,
                reply,
                state_snapshot=result_snapshot if mode == "companion" else None,
                checkpoint_summary=result_checkpoint if mode == "companion" else None,
                mode=mode,
            )
            return jsonify({"reply": reply})
        except GatewayError as exc:
            return _error("upstream_unavailable", str(exc), 502)
        finally:
            if not wants_stream:
                busy_lock.release(key)

    @app.get("/api/assessment")
    @login_required
    def assessment():
        session_id = request.args.get("session_id")
        if not isinstance(session_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", session_id):
            return _error("invalid_session", "会话标识无效", 400)
        return jsonify({
            "assessment": latest_assessment(_current_user()["id"], session_id),
            "disclaimer": "This experimental conversation state is not a medical assessment or diagnosis.",
        })

    @app.route("/api/<path:_unknown>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def unknown_api(_unknown: str):
        abort(404)

    @app.cli.command("set-admin")
    @click.argument("username")
    @with_appcontext
    def set_admin(username: str):
        cursor = get_db().execute("UPDATE users SET is_admin = 1 WHERE username = ?", (username,))
        get_db().commit()
        if cursor.rowcount != 1:
            raise click.ClickException("未找到该用户")
        click.echo(f"已授予管理员权限：{username}")

    @app.cli.command("revoke-admin")
    @click.argument("username")
    @with_appcontext
    def revoke_admin(username: str):
        cursor = get_db().execute("UPDATE users SET is_admin = 0 WHERE username = ?", (username,))
        get_db().commit()
        if cursor.rowcount != 1:
            raise click.ClickException("未找到该用户")
        click.echo(f"已撤销管理员权限：{username}")

    return app


import click  # kept at module bottom so Flask CLI registration stays explicit

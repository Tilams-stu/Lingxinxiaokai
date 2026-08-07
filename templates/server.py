import os
import json
import logging
import sqlite3
import base64
import uuid
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, Response, jsonify, send_from_directory, g, session, abort, has_request_context
from flask.sessions import SecureCookieSessionInterface
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from werkzeug.security import generate_password_hash, check_password_hash
import requests

# 与 server.py 同目录的 .env（不依赖 gunicorn/systemd 的 WorkingDirectory）
_BASE_DIR_FOR_ENV = os.path.dirname(os.path.abspath(__file__))
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(_BASE_DIR_FOR_ENV, '.env'))
except Exception:
    pass


class AdaptiveSecureCookieSessionInterface(SecureCookieSessionInterface):
    """按 SESSION_COOKIE_SECURE 与当前请求是否 HTTPS 决定是否设置 Secure Cookie。
    解决：仅用 http://IP 访问时若误设 SECURE=1，浏览器不发送 Cookie 导致全部 API 401。"""

    def get_cookie_secure(self, app):
        raw = os.getenv('SESSION_COOKIE_SECURE', 'auto').strip().lower()
        if raw in ('1', 'true', 'yes', 'on'):
            return True
        if raw in ('0', 'false', 'no', 'off'):
            return False
        if has_request_context():
            return request.is_secure
        return False


app = Flask(__name__)
app.session_interface = AdaptiveSecureCookieSessionInterface()
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
app.config['SESSION_COOKIE_NAME'] = os.getenv('SESSION_COOKIE_NAME', 'lx_session')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = os.getenv('SESSION_COOKIE_SAMESITE', 'Lax')
# 兼容仅读 app.config 的扩展；实际 Secure 以 AdaptiveSecureCookieSessionInterface 为准
app.config['SESSION_COOKIE_SECURE'] = os.getenv('SESSION_COOKIE_SECURE', 'auto').lower() in ('1', 'true', 'yes')
app.config['SESSION_COOKIE_PATH'] = os.getenv('SESSION_COOKIE_PATH', '/')
app.config['SESSION_REFRESH_EACH_REQUEST'] = True
SESSION_TTL = int(os.getenv('SESSION_TTL', '604800'))
app.permanent_session_lifetime = timedelta(seconds=SESSION_TTL)
TOKEN_TTL = int(os.getenv('AUTH_TOKEN_TTL', '604800'))
serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'], salt='lx-auth')

# 允许跨域请求（开发态可配合 Vue dev server 使用 cookie）
_dev_frontend_origin = os.getenv('DEV_FRONTEND_ORIGIN', 'http://localhost:5173')
CORS(
    app,
    resources={r"/api/*": {"origins": [_dev_frontend_origin]}},
    supports_credentials=True,
    expose_headers=["Content-Type"],
    allow_headers=["Authorization", "Content-Type", "X-App-Id"]
)

# Nginx 终止 HTTPS 时把 X-Forwarded-Proto 传给 Werkzeug，request.is_secure 才为 True（配合 auto Cookie）
if os.getenv('TRUST_PROXY_HEADERS', '1').lower() in ('1', 'true', 'yes', 'on'):
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)

# 上游 Hiagent 配置（从环境变量读取，提供默认值以便开发测试）
UPSTREAM_URL = os.getenv(
    "HIAGENT_URL",
    "https://coze.nankai.edu.cn/api/proxy/api/v1"
)
HIAGENT_API_KEY = os.getenv("HIAGENT_API_KEY", "d41etaoqmqg5tv71vrig")
HIAGENT_APP_ID = os.getenv("HIAGENT_APP_ID", "d0vqgleunshmtco54tt0")
HIAGENT_USE_BEARER = os.getenv("HIAGENT_USE_BEARER", "true").lower() in ("1", "true", "yes")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
BASE_DIR = _BASE_DIR_FOR_ENV
DATA_DIR = os.path.join(BASE_DIR, 'data')
os.makedirs(DATA_DIR, exist_ok=True)

# 聊天日志目录（可通过 CHAT_LOG_DIR 环境变量配置）
LOG_DIR = os.getenv('CHAT_LOG_DIR', os.path.join(BASE_DIR, 'logs'))
os.makedirs(LOG_DIR, exist_ok=True)
DB_PATH = os.getenv('CHAT_DB_PATH', os.path.join(DATA_DIR, 'chat.db'))

# 云端豆包 TTS 配置（需在 .env 或环境变量中设置）
VOLC_TTS_APP_ID = os.getenv('VOLC_TTS_APP_ID', '')
VOLC_TTS_TOKEN = os.getenv('VOLC_TTS_TOKEN', '')
VOLC_TTS_CLUSTER = os.getenv('VOLC_TTS_CLUSTER', 'volcano_icl')
VOLC_TTS_VOICE_TYPE = os.getenv('VOLC_TTS_VOICE_TYPE', 'BV001_streaming')

def write_chat_log(session_id: str, role: str, content: str, meta: dict = None):
    """将聊天记录写入本地 JSONL 文件（按日期滚动）。"""
    try:
        entry = {
            "ts": datetime.utcnow().isoformat() + "Z",
            "session_id": session_id,
            "role": role,
            "content": content,
        }
        if meta:
            entry["meta"] = meta
        log_file = os.path.join(LOG_DIR, f"chat-{datetime.utcnow().strftime('%Y-%m-%d')}.jsonl")
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        logger.error("写入聊天日志失败: %s", e)


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            student_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            session_id TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    cols = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    if 'student_id' not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN student_id TEXT NOT NULL DEFAULT ''")
    conn.commit()
    conn.close()


def get_db():
    if 'db_conn' not in g:
        g.db_conn = sqlite3.connect(DB_PATH)
        g.db_conn.row_factory = sqlite3.Row
    return g.db_conn


@app.teardown_appcontext
def close_db(exception):
    conn = g.pop('db_conn', None)
    if conn is not None:
        conn.close()


def _is_admin_user(user) -> bool:
    """判断是否为管理员账号（用户名+学号匹配配置）。"""
    if not user:
        return False
    admin_name = os.getenv('ADMIN_USERNAME', '李宏伟').strip()
    admin_sid = os.getenv('ADMIN_STUDENT_ID', '2312627').strip()
    # sqlite3.Row 不支持 .get，这里统一用索引读取并做兜底，避免 /api/users/me 500
    try:
        username = str(user['username']).strip()
        student_id = str(user['student_id']).strip()
    except Exception:
        username = str(getattr(user, 'username', '')).strip()
        student_id = str(getattr(user, 'student_id', '')).strip()
    return username == admin_name and student_id == admin_sid


def serialize_user(row, include_admin=False):
    if not row:
        return None
    out = {
        "id": row["id"],
        "username": row["username"],
        "student_id": row["student_id"],
        "created_at": row["created_at"],
        "last_login": row["last_login"]
    }
    if include_admin:
        out["is_admin"] = _is_admin_user(row)
    return out


def get_user_by_username(username: str):
    conn = get_db()
    cur = conn.execute("SELECT * FROM users WHERE username = ?", (username,))
    return cur.fetchone()


def get_user_by_id(user_id: int):
    conn = get_db()
    cur = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    return cur.fetchone()


def create_user(username: str, password: str, student_id: str):
    conn = get_db()
    hashed = generate_password_hash(password)
    cur = conn.execute(
        "INSERT INTO users (username, password_hash, student_id, created_at) VALUES (?, ?, ?, ?)",
        (username, hashed, student_id, datetime.utcnow().isoformat() + "Z")
    )
    conn.commit()
    return cur.lastrowid


def update_last_login(user_id: int):
    conn = get_db()
    ts = datetime.utcnow().isoformat() + "Z"
    conn.execute("UPDATE users SET last_login = ? WHERE id = ?", (ts, user_id))
    conn.commit()
    return ts


def generate_token_for_user(user_id: int):
    return serializer.dumps({"user_id": user_id})


def decode_token(token: str):
    try:
        data = serializer.loads(token, max_age=TOKEN_TTL)
        return get_user_by_id(data.get("user_id"))
    except (BadSignature, SignatureExpired, KeyError):
        return None


def get_token_from_header():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header:
        return None
    if auth_header.lower().startswith('bearer '):
        return auth_header.split(' ', 1)[1].strip()
    return None


def get_current_user():
    if hasattr(g, 'current_user'):
        return g.current_user

    # 1) session/cookie 登录态（推荐）
    try:
        user_id = session.get('user_id')
    except Exception:
        user_id = None
    if user_id:
        user = get_user_by_id(int(user_id))
        g.current_user = user
        return user

    # 2) 兼容 Bearer token（旧前端/脚本）
    token = get_token_from_header()
    user = decode_token(token) if token else None
    g.current_user = user
    return user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            has_session_cookie = app.config['SESSION_COOKIE_NAME'] in request.cookies
            logger.warning(
                "401 unauthorized path=%s secure=%s xfp=%s has_cookie=%s remote=%s",
                request.path,
                request.is_secure,
                request.headers.get('X-Forwarded-Proto', ''),
                has_session_cookie,
                request.remote_addr,
            )
            return jsonify({"error": "unauthorized", "message": "请先登录"}), 401
        return fn(*args, **kwargs)
    return wrapper


def save_chat_message(user_id: int, role: str, content: str, session_id: str = None):
    if not user_id or not content:
        return
    try:
        with app.app_context():
            conn = get_db()
            conn.execute(
                """
                INSERT INTO chat_messages (user_id, role, content, session_id, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, role, content, session_id, datetime.utcnow().isoformat() + "Z")
            )
            conn.commit()
    except Exception as exc:
        logger.error("写入数据库聊天记录失败: %s", exc)


init_db()


@app.after_request
def _no_cache_api_responses(response):
    """避免浏览器缓存 /api/* 的鉴权结果，防止「/api/users/me 显示已登录但发消息 401」。"""
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store, private'
        response.headers['Pragma'] = 'no-cache'
    return response


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})

@app.route('/', methods=['GET'])
def serve_index():
    # Vue SPA 入口
    dist_dir = os.path.join(BASE_DIR, 'dist')
    if os.path.exists(os.path.join(dist_dir, 'index.html')):
        return send_from_directory(dist_dir, 'index.html')
    # 兜底：开发/未构建时返回旧静态入口
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/login', methods=['GET'])
@app.route('/home', methods=['GET'])
@app.route('/admin', methods=['GET'])
@app.route('/info', methods=['GET'])
@app.route('/companion', methods=['GET'])
@app.route('/users', methods=['GET'])
def serve_spa_routes():
    return serve_index()

@app.route('/<path:path>', methods=['GET'])
def serve_static(path):
    # API 不在这里处理
    if path.startswith('api/'):
        abort(404)

    dist_dir = os.path.join(BASE_DIR, 'dist')
    dist_path = os.path.join(dist_dir, path)
    if os.path.exists(dist_path) and os.path.isfile(dist_path):
        return send_from_directory(dist_dir, path)

    legacy_path = os.path.join(BASE_DIR, path)
    if os.path.exists(legacy_path) and os.path.isfile(legacy_path):
        return send_from_directory(BASE_DIR, path)

    # history fallback（SPA 路由刷新）
    return serve_index()


@app.route('/api/tts/synthesize', methods=['POST'])
@login_required
def tts_synthesize():
    """使用火山引擎（豆包）TTS将文本合成为音频并返回音频字节。"""
    body = request.get_json(silent=True) or {}
    text = str(body.get('text', '')).strip()
    voice_type = body.get('voice_type') or VOLC_TTS_VOICE_TYPE
    encoding = body.get('encoding') or 'wav'
    # 语速/音量/音调可选
    try:
        speed_ratio = float(body.get('speed_ratio', 1.0))
        volume_ratio = float(body.get('volume_ratio', 1.0))
        pitch_ratio = float(body.get('pitch_ratio', 1.0))
    except Exception:
        speed_ratio, volume_ratio, pitch_ratio = 1.0, 1.0, 1.0

    if not text:
        return jsonify({"error": "invalid_payload", "message": "text 不能为空"}), 400
    if not (VOLC_TTS_APP_ID and VOLC_TTS_TOKEN):
        return jsonify({"error": "tts_not_configured", "message": "未配置云端TTS，请设置 VOLC_TTS_APP_ID 与 VOLC_TTS_TOKEN"}), 501

    reqid = str(uuid.uuid4())
    payload = {
        "app": {"appid": VOLC_TTS_APP_ID, "token": VOLC_TTS_TOKEN, "cluster": VOLC_TTS_CLUSTER},
        "user": {"uid": "web"},
        "audio": {
            "voice_type": voice_type,
            "encoding": encoding,
            "speed_ratio": speed_ratio,
            "volume_ratio": volume_ratio,
            "pitch_ratio": pitch_ratio
        },
        "request": {"reqid": reqid, "text": text, "text_type": "plain", "operation": "query"}
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer; {VOLC_TTS_TOKEN}"
    }
    try:
        upstream = "https://openspeech.bytedance.com/api/v1/tts"
        resp = requests.post(upstream, json=payload, headers=headers, timeout=30)
        if resp.status_code != 200:
            return jsonify({
                "error": "upstream_error",
                "status": resp.status_code,
                "message": resp.text
            }), 502
        data = resp.json()
        audio_b64 = data.get("data")
        if not audio_b64:
            return jsonify({"error": "no_audio", "message": "上游未返回音频数据"}), 502
        try:
            audio_bytes = base64.b64decode(audio_b64)
        except Exception as e:
            return jsonify({"error": "decode_failed", "message": str(e)}), 502
        mime = "audio/wav" if encoding.lower() == "wav" else (
            "audio/mpeg" if encoding.lower() == "mp3" else "application/octet-stream"
        )
        return Response(audio_bytes, mimetype=mime)
    except Exception as exc:
        logger.error("TTS 合成调用失败: %s", exc)
        return jsonify({"error": "exception", "message": str(exc)}), 502


@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json(silent=True) or {}
    username = str(data.get('username', '')).strip()
    password = str(data.get('password', '')).strip()
    student_id = str(data.get('student_id', '')).strip()

    if len(username) < 3 or len(password) < 6 or not student_id:
        return jsonify({"error": "invalid_payload", "message": "用户名至少3个字符，密码至少6个字符，学号必填"}), 400

    if get_user_by_username(username):
        return jsonify({"error": "user_exists", "message": "用户名已被占用"}), 409

    try:
        user_id = create_user(username, password, student_id)
        user = get_user_by_id(user_id)
    except sqlite3.IntegrityError:
        return jsonify({"error": "user_exists", "message": "用户名已被占用"}), 409

    session.clear()
    session['user_id'] = user_id
    session.permanent = True
    session.modified = True
    token = generate_token_for_user(user_id)
    return jsonify({"token": token, "user": serialize_user(user)}), 201


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get('username', '')).strip()
    password = str(data.get('password', '')).strip()
    student_id = str(data.get('student_id', '')).strip()

    if not username or not password or not student_id:
        return jsonify({"error": "invalid_payload", "message": "请输入用户名、密码和学号"}), 400

    user = get_user_by_username(username)
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "invalid_credentials", "message": "用户名或密码错误"}), 401
    if user["student_id"] and user["student_id"] != student_id:
        return jsonify({"error": "invalid_credentials", "message": "学号不匹配"}), 401
    if not user["student_id"]:
        conn = get_db()
        conn.execute("UPDATE users SET student_id = ? WHERE id = ?", (student_id, user["id"]))
        conn.commit()

    last_login = update_last_login(user["id"])
    user_dict = serialize_user(user)
    if user_dict:
        user_dict["last_login"] = last_login
    session.clear()
    session['user_id'] = int(user["id"])
    session.permanent = True
    session.modified = True
    token = generate_token_for_user(user["id"])
    return jsonify({"token": token, "user": user_dict})


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route('/api/users/me', methods=['GET'])
@login_required
def current_user():
    user = get_current_user()
    return jsonify({"user": serialize_user(user, include_admin=True)})


@app.route('/api/users', methods=['GET'])
@login_required
def list_users():
    conn = get_db()
    cursor = conn.execute("""
        SELECT 
            u.id,
            u.username,
            u.student_id,
            u.created_at,
            u.last_login,
            COUNT(c.id) AS chat_count
        FROM users u
        LEFT JOIN chat_messages c ON c.user_id = u.id
        GROUP BY u.id
        ORDER BY u.created_at DESC
    """)
    users = []
    for row in cursor.fetchall():
        users.append({
            "id": row["id"],
            "username": row["username"],
            "student_id": row["student_id"],
            "created_at": row["created_at"],
            "last_login": row["last_login"],
            "chat_count": row["chat_count"],
        })
    return jsonify({"users": users})


@app.route('/api/users/me/messages', methods=['GET'])
@login_required
def my_messages():
    """当前用户聊天记录：默认取「最近」若干条（按时间从新到旧截取窗口），再按时间正序返回，便于前端回放。"""
    limit = request.args.get('limit', default=2000, type=int)
    limit = max(1, min(limit, 5000))
    uid = get_current_user()["id"]
    conn = get_db()
    cursor = conn.execute(
        """
        SELECT id, role, content, session_id, created_at
        FROM (
            SELECT id, role, content, session_id, created_at
            FROM chat_messages
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        ) t
        ORDER BY created_at ASC
        """,
        (uid, limit)
    )
    messages = [
        {
            "id": row["id"],
            "role": row["role"],
            "content": row["content"],
            "session_id": row["session_id"],
            "created_at": row["created_at"]
        }
        for row in cursor.fetchall()
    ]
    return jsonify({"messages": messages})


def admin_required(fn):
    """要求已登录且为管理员账号。"""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "unauthorized", "message": "请先登录"}), 401
        if not _is_admin_user(user):
            return jsonify({"error": "forbidden", "message": "无权限"}), 403
        return fn(*args, **kwargs)
    return wrapper


@app.route('/api/admin/export-all', methods=['GET'])
@admin_required
def admin_export_all_chats():
    """管理员专属：导出全站聊天记录，按账号分块。"""
    conn = get_db()
    cursor = conn.execute("""
        SELECT u.id AS user_id, u.username, u.student_id, u.created_at, u.last_login,
               c.id AS msg_id, c.role, c.content, c.session_id, c.created_at AS msg_created
        FROM users u
        LEFT JOIN chat_messages c ON c.user_id = u.id
        ORDER BY u.id, c.created_at ASC
    """)
    from collections import OrderedDict
    users_map = OrderedDict()
    for row in cursor.fetchall():
        uid = row["user_id"]
        if uid not in users_map:
            users_map[uid] = {
                "user_id": uid,
                "username": row["username"],
                "student_id": row["student_id"],
                "created_at": row["created_at"],
                "last_login": row["last_login"],
                "messages": []
            }
        if row["msg_id"] is not None:
            users_map[uid]["messages"].append({
                "id": row["msg_id"],
                "role": row["role"],
                "content": row["content"],
                "session_id": row["session_id"],
                "created_at": row["msg_created"]
            })
    out = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "users": list(users_map.values())
    }
    body = json.dumps(out, ensure_ascii=False, indent=2).encode('utf-8')
    fname = f"chat_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    return Response(
        body,
        mimetype='application/json',
        headers={'Content-Disposition': f'attachment; filename="{fname}"'}
    )


@app.route('/api/users/me/messages', methods=['DELETE'])
@login_required
def delete_my_session_messages():
    """按 session_id 删除当前用户该会话下的所有消息。session_id 为空字符串表示删除 session_id 为 NULL 的历史记录。"""
    session_id = request.args.get('session_id', default=None)
    if session_id is None:
        return jsonify({"error": "invalid_payload", "message": "缺少 session_id"}), 400
    uid = get_current_user()["id"]
    conn = get_db()
    if session_id == '':
        cur = conn.execute(
            "DELETE FROM chat_messages WHERE user_id = ? AND session_id IS NULL",
            (uid,)
        )
    else:
        cur = conn.execute(
            "DELETE FROM chat_messages WHERE user_id = ? AND session_id = ?",
            (uid, session_id)
        )
    conn.commit()
    return jsonify({"ok": True, "deleted": cur.rowcount})


@app.route('/api/users/<int:user_id>/messages', methods=['GET'])
@login_required
def user_messages(user_id: int):
    """管理页 users.html 需按 user_id 拉取记录；个人会话请用 GET /api/users/me/messages。"""
    limit = request.args.get('limit', default=100, type=int)
    limit = max(1, min(limit, 500))
    conn = get_db()
    cursor = conn.execute(
        """
        SELECT id, role, content, session_id, created_at
        FROM chat_messages
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (user_id, limit)
    )
    messages = [
        {
            "id": row["id"],
            "role": row["role"],
            "content": row["content"],
            "session_id": row["session_id"],
            "created_at": row["created_at"]
        }
        for row in cursor.fetchall()
    ]
    return jsonify({"messages": messages})


@app.route('/api/cards/generate', methods=['POST'])
@login_required
def generate_card():
    """生成基于用户聊天记录的卡片"""
    user = get_current_user()
    if not user:
        return jsonify({"error": "unauthorized", "message": "请先登录"}), 401
    
    user_id = user["id"]
    card_type = request.json.get('type', 'luck')  # luck 或 animal
    
    # 获取用户最近的聊天记录
    conn = get_db()
    cursor = conn.execute(
        """
        SELECT content
        FROM chat_messages
        WHERE user_id = ? AND role = 'user'
        ORDER BY created_at DESC
        LIMIT 10
        """,
        (user_id,)
    )
    user_messages = [row["content"] for row in cursor.fetchall()]
    
    import random
    
    if card_type == 'luck':
        luck_cards = [
            "今天会有意外的惊喜等着你！",
            "你的努力很快就会得到回报。",
            "明天是充满希望的一天。",
            "你身边有贵人相助。",
            "健康是最大的财富，保持好心情。",
            "机会总是留给有准备的人。",
            "每一个困难都是成长的机会。",
            "你的笑容可以感染身边的人。"
        ]
        content = random.choice(luck_cards)
        title = "好运卡片"
    else:
        animal_icons = [
            {"icon": "fa-cat", "name": "猫咪"},
            {"icon": "fa-dog", "name": "狗狗"},
            {"icon": "fa-rabbit", "name": "兔子"},
            {"icon": "fa-bear", "name": "小熊"},
            {"icon": "fa-panda", "name": "熊猫"},
            {"icon": "fa-fox", "name": "狐狸"}
        ]
        animal_blessings = [
            "喵喵～今天也要开心哦！",
            "汪汪～愿你每天都充满活力！",
            "蹦蹦跳跳～烦恼都走开！",
            "吼吼～勇气满满面对挑战！",
            "滚滚～生活像竹子一样甜美！",
            "嘤嘤～愿你被世界温柔以待！"
        ]
        animal = random.choice(animal_icons)
        content = random.choice(animal_blessings)
        title = f"{animal['name']}的祝福"
        
    return jsonify({
        "title": title,
        "content": content,
        "icon": animal.get('icon', 'fa-star') if card_type == 'animal' else 'fa-star'
    })


@app.route('/api/hiagent/chat', methods=['POST'])
def hiagent_chat():
    """代理转发到 Hiagent 上游；支持流式与非流式。"""
    payload = request.get_json(silent=True) or {}
    stream = bool(payload.get('stream'))

    auth_header = f"Bearer {HIAGENT_API_KEY}" if HIAGENT_USE_BEARER else HIAGENT_API_KEY
    headers = {
        "Authorization": auth_header,
        "Content-Type": "application/json",
        "X-App-Id": HIAGENT_APP_ID,
        "AppId": HIAGENT_APP_ID,
        "Accept": "text/event-stream" if stream else "application/json"
    }

    payload['app_id'] = HIAGENT_APP_ID

    try:
        upstream = requests.post(
            UPSTREAM_URL,
            headers=headers,
            json=payload,
            stream=stream,
            timeout=120
        )
    except requests.RequestException as e:
        logger.error("上游连接失败: %s", e)
        return jsonify({"error": f"upstream error: {str(e)}"}), 502

    if upstream.status_code >= 400:
        try:
            err_json = upstream.json()
            return jsonify(err_json), upstream.status_code
        except Exception:
            return Response(upstream.content, status=upstream.status_code, mimetype='application/json')

    if stream:
        content_type = upstream.headers.get('content-type', '')
        if 'text/event-stream' not in content_type:
            try:
                data = upstream.json()
                text = (
                    data.get('choices', [{}])[0]
                        .get('message', {})
                        .get('content', '')
                )
                def gen_json_sse():
                    if text:
                        payload = {"choices": [{"delta": {"content": text}}]}
                        yield f"data: {json.dumps(payload, ensure_ascii=False)}\n"
                    yield "data: [DONE]\n"
                return Response(gen_json_sse(), mimetype='text/event-stream')
            except Exception:
                return Response(upstream.content, status=upstream.status_code, mimetype='application/json')

        def generate():
            try:
                for chunk in upstream.iter_lines(decode_unicode=True):
                    if chunk:
                        yield f"{chunk}\n"
                yield "data: [DONE]\n"
            except Exception as e:
                logger.error("流式转发异常: %s", e)
        return Response(generate(), mimetype='text/event-stream')
    else:
        return Response(upstream.content, status=upstream.status_code, mimetype='application/json')


# ------------------- 🔥 核心修复：DeepSeek 三方API适配 -------------------
@app.route('/api/deepseek/chat', methods=['POST'])
@login_required
def deepseek_chat():
    payload = request.get_json(silent=True) or {}
    stream = bool(payload.get('stream'))
    skip_persist = bool(payload.get('skip_persist'))
    user = get_current_user()
    user_id = user["id"] if user else None
    session_id = (payload.get('session_id')
                  or request.headers.get('X-Session-Id')
                  or (f"user-{user_id}" if user_id else None)
                  or request.remote_addr
                  or 'anonymous')

    if not skip_persist:
        try:
            msgs = payload.get('messages') or []
            if msgs:
                last_user = next((m for m in reversed(msgs) if m.get('role') == 'user'), None)
                if last_user and last_user.get('content'):
                    write_chat_log(session_id, 'user', last_user['content'], meta={
                        'model': payload.get('model'),
                        'type': 'deepseek'
                    })
                    if user_id:
                        save_chat_message(user_id, 'user', last_user['content'], session_id)
        except Exception:
            pass

    # 读取配置
    api_key = os.getenv('DEEPSEEK_API_KEY')
    base_url = os.getenv('DEEPSEEK_BASE_URL')
    
    if not api_key or not base_url:
        return jsonify({
            "error": "config_error",
            "message": "API密钥或地址未配置"
        }), 400

    # ✅ 适配三方平台：自动补全接口路径（修复 Invalid URL）
    if not base_url.endswith('/chat/completions'):
        deepseek_url = f"{base_url.rstrip('/')}/chat/completions"
    else:
        deepseek_url = base_url

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream" if stream else "application/json"
    }

    body = {
        "model": payload.get("model") or os.getenv('MODEL_NAME', 'deepseek-chat'),
        "messages": payload.get("messages") or []
    }
    for key in ("temperature", "max_tokens", "top_p", "presence_penalty", "frequency_penalty"):
        if key in payload:
            body[key] = payload[key]
    if stream:
        body["stream"] = True

    try:
        upstream = requests.post(
            deepseek_url,
            headers=headers,
            json=body,
            stream=stream,
            timeout=120
        )
    except requests.RequestException as e:
        logger.error("DeepSeek 上游连接失败: %s", e)
        return jsonify({"error": f"upstream error: {str(e)}"}), 502

    if upstream.status_code >= 400:
        try:
            err_json = upstream.json()
            return jsonify(err_json), upstream.status_code
        except Exception:
            return Response(upstream.content, status=upstream.status_code, mimetype='application/json')

    if stream:
        acc = []
        def generate():
            try:
                for chunk in upstream.iter_lines(decode_unicode=False):
                    if not chunk:
                        continue
                    # 明确使用 UTF-8 解码，避免自动检测编码导致乱码
                    line = chunk.decode('utf-8', errors='replace').strip()
                    if line.startswith('data:'):
                        data_str = line[5:].strip()
                        if data_str == '[DONE]':
                            if not skip_persist:
                                try:
                                    final_text = ''.join(acc)
                                    if final_text:
                                        write_chat_log(session_id, 'assistant', final_text, meta={
                                            'model': body.get('model'),
                                            'type': 'deepseek'
                                        })
                                        if user_id:
                                            save_chat_message(user_id, 'assistant', final_text, session_id)
                                except Exception:
                                    pass
                            yield 'data: [DONE]\n'
                            break
                        else:
                            try:
                                obj = json.loads(data_str)
                                content = (
                                    obj.get('choices', [{}])[0]
                                       .get('delta', {})
                                       .get('content')
                                )
                                if content:
                                    acc.append(content)
                            except Exception:
                                pass
                    yield f"{line}\n"
                yield "data: [DONE]\n"
            except Exception as e:
                logger.error("DeepSeek 流式转发异常: %s", e)
        return Response(generate(), mimetype='text/event-stream')
    else:
        try:
            result = upstream.json()
            content = (
                result.get('choices', [{}])[0]
                    .get('message', {})
                    .get('content', '')
            )
            if not skip_persist and content:
                write_chat_log(session_id, 'assistant', content, meta={
                    'model': body.get('model'),
                    'type': 'deepseek'
                })
                if user_id:
                    save_chat_message(user_id, 'assistant', content, session_id)
            return jsonify(result)
        except Exception:
            return Response(upstream.content, status=upstream.status_code, mimetype='application/json')


if __name__ == '__main__':
    port = int(os.getenv('PORT', '5000'))
    app.run(host='0.0.0.0', port=port, debug=True)
"""Public API regression tests for the Flask chat gateway."""

from __future__ import annotations

import json

import pytest

from app import create_app  # noqa: E402
from db import get_db, save_turn  # noqa: E402
from gateway import GatewayEvent  # noqa: E402


class FakeGateway:
    """In-process Node gateway double; production transport is not exercised here."""

    def __init__(self, events=None):
        self.events = events or [GatewayEvent("delta", content="gateway reply"), GatewayEvent("done")]
        self.requests = []

    def stream_turn(self, *, input, state_snapshot, messages, summary):
        self.requests.append(
            {
                "input": input,
                "state_snapshot": state_snapshot,
                "messages": messages,
                "summary": summary,
            }
        )
        yield from self.events


@pytest.fixture()
def gateway():
    return FakeGateway()


@pytest.fixture()
def app(tmp_path, gateway):
    app = create_app(
        {
            "TESTING": True,
            "DATABASE": str(tmp_path / "test.db"),
            "SECRET_KEY": "test-secret-key-that-is-long-enough",
            "RATELIMIT_ENABLED": False,
            "TURN_GATEWAY": gateway,
        }
    )
    yield app


@pytest.fixture()
def client(app):
    return app.test_client()


def register(client, username="testuser", student_id="20260001", password="safe-password"):
    return client.post(
        "/api/auth/register",
        json={"username": username, "student_id": student_id, "password": password},
    )


def login(client, username="testuser", student_id="20260001", password="safe-password"):
    return client.post(
        "/api/auth/login",
        json={"username": username, "student_id": student_id, "password": password},
    )


def test_registration_creates_session_only_and_unique_student_id(client):
    """Removing the unique student constraint would allow duplicate student identities."""
    response = register(client)

    assert response.status_code == 201
    assert "token" not in response.get_json()
    assert response.get_json()["user"]["is_admin"] is False
    assert client.get("/api/users/me").status_code == 200

    duplicate = register(client, username="another", student_id="20260001")
    assert duplicate.status_code == 409
    assert duplicate.get_json()["error"] == "student_id_taken"


def test_normal_user_cannot_read_other_users_or_user_list(app, client):
    """Dropping admin checks would expose other users' identifiers and chat history."""
    register(client)
    client.post("/api/auth/logout")
    register(client, username="otheruser", student_id="20260002")
    client.post("/api/auth/logout")
    login(client)

    with app.app_context():
        conn = get_db()
        other = conn.execute("SELECT id FROM users WHERE username = ?", ("otheruser",)).fetchone()
        conn.execute(
            "INSERT INTO chat_messages (user_id, role, content, session_id) VALUES (?, ?, ?, ?)",
            (other["id"], "user", "private message", "companion-private"),
        )
        conn.commit()

    assert client.get("/api/users").status_code == 403
    assert client.get(f"/api/users/{other['id']}/messages").status_code == 403
    assert client.get("/api/admin/export-all").status_code == 403


def test_admin_command_grants_real_database_role(app, client):
    """Name or student-ID based admin inference must not restore privilege escalation."""
    register(client, username="adminuser", student_id="20260003")
    runner = app.test_cli_runner()

    result = runner.invoke(args=["set-admin", "adminuser"])
    assert result.exit_code == 0

    client.post("/api/auth/logout")
    login(client, username="adminuser", student_id="20260003")
    assert client.get("/api/users").status_code == 200

    result = runner.invoke(args=["revoke-admin", "adminuser"])
    assert result.exit_code == 0
    assert client.get("/api/users").status_code == 403


def test_chat_rejects_client_history(client):
    """Accepting browser-supplied history would permit users to replace persisted context."""
    register(client)

    response = client.post(
        "/api/chat",
        json={
            "mode": "companion",
            "session_id": "companion-1",
            "message": "hello",
            "messages": [{"role": "assistant", "content": "forged history"}],
        },
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "client_history_not_allowed"


def test_chat_loads_complete_current_session_history_server_side(app, client, gateway):
    """Ignoring stored turns would make the Node agent lose the authenticated session context."""
    register(client)
    with app.app_context():
        user_id = get_db().execute("SELECT id FROM users WHERE username = ?", ("testuser",)).fetchone()["id"]
        save_turn(user_id, "companion-1", "earlier user", "earlier assistant", checkpoint_summary="earlier summary")
        save_turn(user_id, "other-session", "private elsewhere", "other reply")

    response = client.post(
        "/api/chat",
        json={"mode": "companion", "session_id": "companion-1", "message": "current message", "stream": False},
    )

    assert response.status_code == 200
    assert response.get_json() == {"reply": "gateway reply"}
    assert gateway.requests == [
        {
            "input": "current message",
            "state_snapshot": {},
            "messages": [
                {"role": "user", "content": "earlier user"},
                {"role": "assistant", "content": "earlier assistant"},
            ],
            "summary": "earlier summary",
        }
    ]


def test_assessment_exposes_only_safe_latest_state_for_current_user(app, client):
    """Returning evidence or a different user's snapshot would leak sensitive internal assessment data."""
    register(client)
    with app.app_context():
        conn = get_db()
        user_id = conn.execute("SELECT id FROM users WHERE username = ?", ("testuser",)).fetchone()["id"]
        other_id = conn.execute(
            "INSERT INTO users (username, password_hash, student_id, created_at) VALUES (?, ?, ?, ?)",
            ("other", "hash", "20269999", "2026-08-13T00:00:00Z"),
        ).lastrowid
        conn.commit()
        save_turn(
            user_id,
            "companion-1",
            "u",
            "a",
            state_snapshot={
                "mood": "low",
                "sleep": "poor",
                "unknown": "must not expose",
                "support": {"label": "friend", "risk_level": "high", "evidence": {"private": "text"}},
            },
            safety_level="high",
            evidence={"verbatim": "private"},
        )
        save_turn(other_id, "companion-1", "other u", "other a", state_snapshot={"mood": "other"})

    response = client.get("/api/assessment?session_id=companion-1")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["assessment"]["state"] == {"mood": "low", "sleep": "poor"}
    assert payload["assessment"]["created_at"]
    assert "medical" in payload["disclaimer"].lower()
    assert "safety_level" not in json.dumps(payload)
    assert "evidence" not in json.dumps(payload)
    assert "other" not in json.dumps(payload)


def test_popsci_turn_never_creates_assessment_snapshot(app, client):
    """Persisting state for science chats would mix two modes with different safety semantics."""
    register(client)

    response = client.post(
        "/api/chat",
        json={"mode": "popsci", "session_id": "popsci-1", "message": "What is anxiety?", "stream": False},
    )

    assert response.status_code == 200
    with app.app_context():
        count = get_db().execute("SELECT COUNT(*) FROM assessment_snapshots").fetchone()[0]
    assert count == 0


def test_companion_turn_persists_gateway_result_snapshot_and_bounded_checkpoint(app, client, gateway):
    """Dropping Node result metadata would lose the state needed by the next authenticated turn."""
    gateway.events = [
        GatewayEvent("delta", content="reply"),
        GatewayEvent(
            "result",
            content=json.dumps({"stateSnapshot": {"mood": "settled", "stress": "moderate"}, "checkpointSummary": "summary from Node"}),
        ),
        GatewayEvent("done"),
    ]
    register(client)

    response = client.post(
        "/api/chat",
        json={"mode": "companion", "session_id": "companion-1", "message": "hello", "stream": False},
    )

    assert response.status_code == 200
    with app.app_context():
        conn = get_db()
        snapshot = conn.execute("SELECT state_json FROM assessment_snapshots").fetchone()
        checkpoint = conn.execute("SELECT summary FROM context_checkpoints").fetchone()
    assert json.loads(snapshot["state_json"]) == {"mood": "settled", "stress": "moderate"}
    assert checkpoint["summary"] == "summary from Node"


def test_companion_turn_bounds_gateway_checkpoint_before_persisting(app, client, gateway):
    """Persisting an unbounded agent checkpoint could grow a session record without limit."""
    app.config["MAX_CHECKPOINT_CHARS"] = 8
    gateway.events = [
        GatewayEvent("delta", content="reply"),
        GatewayEvent("result", content=json.dumps({"stateSnapshot": {}, "checkpointSummary": "0123456789"})),
        GatewayEvent("done"),
    ]
    register(client)

    response = client.post(
        "/api/chat",
        json={"mode": "companion", "session_id": "companion-1", "message": "hello", "stream": False},
    )

    assert response.status_code == 200
    with app.app_context():
        checkpoint = get_db().execute("SELECT summary FROM context_checkpoints").fetchone()
    assert checkpoint["summary"] == "23456789"


def test_streaming_companion_turn_persists_gateway_result_metadata(app, client, gateway):
    """Saving state only for JSON replies would make streaming companion sessions lose their checkpoint."""
    gateway.events = [
        GatewayEvent("delta", content="reply"),
        GatewayEvent("result", content=json.dumps({"stateSnapshot": {"energy": "low"}, "checkpointSummary": "stream summary"})),
        GatewayEvent("done"),
    ]
    register(client)

    response = client.post(
        "/api/chat",
        json={"mode": "companion", "session_id": "companion-1", "message": "hello", "stream": True},
    )

    assert "event: done" in response.get_data(as_text=True)
    with app.app_context():
        snapshot = get_db().execute("SELECT state_json FROM assessment_snapshots").fetchone()
        checkpoint = get_db().execute("SELECT summary FROM context_checkpoints").fetchone()
    assert json.loads(snapshot["state_json"]) == {"energy": "low"}
    assert checkpoint["summary"] == "stream summary"


def test_popsci_turn_discards_gateway_result_state_and_checkpoint(app, client, gateway):
    """Persisting Node result metadata for popsci would cross the companion-only state boundary."""
    gateway.events = [
        GatewayEvent("delta", content="reply"),
        GatewayEvent("result", content=json.dumps({"stateSnapshot": {"mood": "settled"}, "checkpointSummary": "must not persist"})),
        GatewayEvent("done"),
    ]
    register(client)

    response = client.post(
        "/api/chat",
        json={"mode": "popsci", "session_id": "popsci-1", "message": "question", "stream": False},
    )

    assert response.status_code == 200
    with app.app_context():
        assert get_db().execute("SELECT COUNT(*) FROM assessment_snapshots").fetchone()[0] == 0
        assert get_db().execute("SELECT COUNT(*) FROM context_checkpoints").fetchone()[0] == 0


def test_high_risk_fixed_reply_bypasses_gateway_and_persists(client, gateway):
    """Routing a crisis message through the model could delay the fixed emergency response."""
    register(client)

    response = client.post(
        "/api/chat",
        json={"mode": "companion", "session_id": "companion-1", "message": "我想自杀，不想活了", "stream": False},
    )

    assert response.status_code == 200
    assert "12356" in response.get_json()["reply"]
    assert gateway.requests == []


def test_chat_stream_proxies_named_events_and_emits_one_done_event(client, gateway):
    """Duplicating or dropping the terminal event would leave an SSE consumer in the wrong state."""
    gateway.events = [
        GatewayEvent("analysis", content="reasoning"),
        GatewayEvent("delta", content="hello"),
        GatewayEvent("done"),
    ]
    register(client)

    response = client.post(
        "/api/chat",
        json={"mode": "popsci", "session_id": "popsci-1", "message": "question", "stream": True},
    )

    body = response.get_data(as_text=True)
    assert response.status_code == 200
    assert "event: analysis\ndata: {\"content\": \"reasoning\"}" in body
    assert "event: delta\ndata: {\"content\": \"hello\"}" in body
    assert body.count("event: done") == 1


def test_chat_returns_session_busy_when_current_user_session_lock_is_held(app, client):
    """Removing the keyed lock would allow concurrent turns to race their shared session context."""
    register(client)
    with app.app_context():
        user_id = get_db().execute("SELECT id FROM users WHERE username = ?", ("testuser",)).fetchone()["id"]
    lock = app.extensions["session_turn_lock"]
    assert lock.acquire((user_id, "companion-1"))
    try:
        response = client.post(
            "/api/chat",
            json={"mode": "companion", "session_id": "companion-1", "message": "blocked", "stream": False},
        )
    finally:
        lock.release((user_id, "companion-1"))

    assert response.status_code == 409
    assert response.get_json()["error"] == "session_busy"


def test_retired_emotion_api_is_not_available(client):
    """Restoring the disconnected emotion endpoint would reintroduce an unsafe duplicate AI path."""
    register(client)
    assert client.post("/api/emotions/analyze", json={"mode": "companion", "text": "hello"}).status_code == 404


def test_retired_uncontrolled_ai_and_fake_pages_are_not_available(client):
    """Restoring legacy proxy routes or fake profile pages would reintroduce bypasses."""
    assert client.post("/api/deepseek/chat", json={}).status_code == 404
    assert client.post("/api/hiagent/chat", json={}).status_code == 404
    assert client.get("/profile").status_code == 404


def test_production_placeholder_credentials_are_rejected(tmp_path):
    """A deployment with an example session secret must fail closed."""
    with pytest.raises(RuntimeError, match="缺少有效"):
        create_app(
            {
                "DATABASE": str(tmp_path / "production.db"),
                "SECRET_KEY": "placeholder",
                "RATELIMIT_ENABLED": False,
            }
        )

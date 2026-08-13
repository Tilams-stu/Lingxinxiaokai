"""Boundary tests for the loopback Node-agent HTTP adapter."""

from __future__ import annotations

import pytest

from gateway import NodeGateway


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1.attacker.test:8787",
        "http://localhost.attacker.test:8787",
        "http://[::1].attacker.test:8787",
        "http://127.0.0.1@attacker.test:8787",
    ],
)
def test_gateway_rejects_attacker_prefix_hosts(url):
    """Prefix checks would let a hostile hostname receive private session context."""
    with pytest.raises(ValueError, match="loopback"):
        NodeGateway(url)


class FakeResponse:
    status_code = 200

    def __init__(self, lines):
        self._lines = lines
        self.closed = False

    def iter_lines(self, decode_unicode=False):
        yield from self._lines

    def close(self):
        self.closed = True


def test_gateway_processes_valid_final_sse_event_at_eof(monkeypatch):
    """Only flushing on a blank line would drop the last model token at connection close."""
    response = FakeResponse(["event: delta", 'data: {"content":"last token"}'])
    posted = {}

    def post(*args, **kwargs):
        posted.update(kwargs)
        return response

    monkeypatch.setattr("gateway.requests.post", post)

    events = list(NodeGateway("http://127.0.0.1:8787").stream_turn(mode="companion", input="hello", state_snapshot={}, messages=[], summary=""))

    assert [(event.type, event.content) for event in events] == [("delta", "last token")]
    assert posted["json"]["mode"] == "companion"
    assert response.closed is True


def test_gateway_ignores_unknown_and_malformed_sse_events(monkeypatch):
    """Forwarding unrecognized or invalid event data would expand Flask's public SSE contract."""
    response = FakeResponse(
        [
            "event: internal_trace",
            'data: {"secret":"no"}',
            "",
            "event: delta",
            "data: not-json",
            "",
            "event: delta",
            'data: {"content":"kept"}',
            "",
        ]
    )
    monkeypatch.setattr("gateway.requests.post", lambda *args, **kwargs: response)

    events = list(NodeGateway("http://localhost:8787").stream_turn(mode="popsci", input="hello", state_snapshot={}, messages=[], summary=""))

    assert [(event.type, event.content) for event in events] == [("delta", "kept")]


def test_gateway_parses_terminal_result_metadata(monkeypatch):
    """Discarding the agent's terminal result would prevent Flask from atomically checkpointing a turn."""
    response = FakeResponse(
        [
            "event: result",
            'data: {"stateSnapshot":{"mood":"settled"},"checkpointSummary":"next-turn context"}',
            "",
        ]
    )
    monkeypatch.setattr("gateway.requests.post", lambda *args, **kwargs: response)

    events = list(NodeGateway("http://[::1]:8787").stream_turn(mode="companion", input="hello", state_snapshot={}, messages=[], summary=""))

    assert len(events) == 1
    assert events[0].type == "result"
    assert events[0].state_snapshot == {"mood": "settled"}
    assert events[0].checkpoint_summary == "next-turn context"


def test_gateway_preserves_display_safe_source_metadata(monkeypatch):
    """Dropping an approved-card source would leave the pop-science UI with an empty citation row."""
    response = FakeResponse(
        [
            "event: delta",
            'data: {"content":"explanation","sources":[{"label":"local card","url":"https://www.nhc.gov.cn/"}]}',
            "",
        ]
    )
    monkeypatch.setattr("gateway.requests.post", lambda *args, **kwargs: response)

    events = list(NodeGateway("http://localhost:8787").stream_turn(mode="popsci", input="hello", state_snapshot={}, messages=[], summary=""))

    assert events[0].sources == [{"label": "local card", "url": "https://www.nhc.gov.cn/"}]

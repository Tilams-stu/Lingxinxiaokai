"""Loopback-only transport for the local Node Pi agent service."""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import requests


class GatewayError(Exception):
    """The local Node agent could not produce a usable response."""


@dataclass(frozen=True)
class GatewayEvent:
    type: str
    content: str | None = None
    message: str | None = None
    state_snapshot: dict[str, Any] | None = None
    checkpoint_summary: str | None = None
    sources: list[dict[str, str]] | None = None


class NodeGateway:
    """Posts complete server-owned session context to the loopback Node `/turn` endpoint."""

    def __init__(self, base_url: str, timeout: float = 45.0):
        try:
            parsed = urlsplit(base_url)
        except ValueError as exc:
            raise ValueError("AGENT_BASE_URL must be loopback-only") from exc
        if (
            parsed.scheme != "http"
            or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
            or re.fullmatch(r"(?:127\.0\.0\.1|localhost)(?::\d{1,5})?|\[::1\](?::\d{1,5})?", parsed.netloc.lower()) is None
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("AGENT_BASE_URL must be loopback-only")
        self._url = urlunsplit((parsed.scheme, parsed.netloc, f"{parsed.path.rstrip('/')}/turn", "", ""))
        self._timeout = timeout

    def stream_turn(
        self,
        *,
        mode: str,
        input: str,
        state_snapshot: dict[str, Any],
        messages: list[dict[str, str]],
        summary: str,
    ) -> Iterator[GatewayEvent]:
        try:
            response = requests.post(
                self._url,
                json={"mode": mode, "input": input, "stateSnapshot": state_snapshot, "messages": messages, "summary": summary},
                headers={"Accept": "text/event-stream"},
                stream=True,
                timeout=self._timeout,
            )
        except requests.RequestException as exc:
            raise GatewayError("local agent unavailable") from exc
        if response.status_code >= 400:
            response.close()
            raise GatewayError("local agent unavailable")
        event_name: str | None = None
        data_lines: list[str] = []

        def parse_event(name: str | None, lines: list[str]) -> GatewayEvent | None:
            if name not in {"analysis", "delta", "error", "done", "result"}:
                return None
            try:
                payload = json.loads("\n".join(lines) or "{}")
            except json.JSONDecodeError:
                return None
            if not isinstance(payload, dict):
                return None
            if name == "error":
                message = payload.get("message")
                return GatewayEvent("error", message=message if isinstance(message, str) else "local agent unavailable")
            if name == "done":
                return GatewayEvent("done")
            if name == "result":
                snapshot = payload.get("stateSnapshot")
                checkpoint = payload.get("checkpointSummary")
                if not isinstance(snapshot, dict) and not isinstance(checkpoint, str):
                    return None
                return GatewayEvent(
                    "result",
                    state_snapshot=snapshot if isinstance(snapshot, dict) else None,
                    checkpoint_summary=checkpoint if isinstance(checkpoint, str) else None,
                )
            content = payload.get("content")
            if not isinstance(content, str) or not content:
                return None
            sources = payload.get("sources")
            safe_sources = [
                {"label": item["label"], **({"url": item["url"]} if isinstance(item.get("url"), str) else {})}
                for item in sources
                if isinstance(item, dict) and isinstance(item.get("label"), str)
            ] if isinstance(sources, list) else None
            return GatewayEvent(name, content=content, sources=safe_sources)

        def flush_event() -> GatewayEvent | None:
            nonlocal event_name, data_lines
            event = parse_event(event_name, data_lines)
            event_name = None
            data_lines = []
            return event

        try:
            for raw_line in response.iter_lines(decode_unicode=True):
                if isinstance(raw_line, bytes):
                    raw_line = raw_line.decode("utf-8", errors="replace")
                line = raw_line.strip() if raw_line else ""
                if not line:
                    event = flush_event()
                    if event is not None:
                        yield event
                elif line.startswith("event:"):
                    event_name = line[6:].strip()
                elif line.startswith("data:"):
                    data_lines.append(line[5:].strip())
            event = flush_event()
            if event is not None:
                yield event
        finally:
            response.close()

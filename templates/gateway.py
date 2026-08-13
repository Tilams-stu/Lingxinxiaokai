"""Loopback-only transport for the local Node Pi agent service."""

from __future__ import annotations

import json
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import requests


class GatewayError(Exception):
    """The local Node agent could not produce a usable response."""


@dataclass(frozen=True)
class GatewayEvent:
    type: str
    content: str | None = None
    message: str | None = None


class NodeGateway:
    """Posts complete server-owned session context to the loopback Node `/turn` endpoint."""

    def __init__(self, base_url: str, timeout: float = 45.0):
        if not base_url.startswith(("http://127.0.0.1", "http://localhost", "http://[::1]")):
            raise ValueError("AGENT_BASE_URL must be loopback-only")
        self._url = f"{base_url.rstrip('/')}/turn"
        self._timeout = timeout

    def stream_turn(
        self,
        *,
        input: str,
        state_snapshot: dict[str, Any],
        messages: list[dict[str, str]],
        summary: str,
    ) -> Iterator[GatewayEvent]:
        try:
            response = requests.post(
                self._url,
                json={"input": input, "stateSnapshot": state_snapshot, "messages": messages, "summary": summary},
                headers={"Accept": "text/event-stream"},
                stream=True,
                timeout=self._timeout,
            )
        except requests.RequestException as exc:
            raise GatewayError("local agent unavailable") from exc
        if response.status_code >= 400:
            response.close()
            raise GatewayError("local agent unavailable")
        event_name = None
        data_lines: list[str] = []
        try:
            for raw_line in response.iter_lines(decode_unicode=True):
                line = raw_line.strip() if raw_line else ""
                if not line:
                    if event_name in {"analysis", "delta", "error", "done"}:
                        try:
                            payload = json.loads("\n".join(data_lines) or "{}")
                        except json.JSONDecodeError:
                            payload = {}
                        if event_name == "error":
                            yield GatewayEvent("error", message=str(payload.get("message", "local agent unavailable")))
                        elif event_name == "done":
                            yield GatewayEvent("done")
                        else:
                            content = payload.get("content")
                            if isinstance(content, str) and content:
                                yield GatewayEvent(event_name, content=content)
                    event_name = None
                    data_lines = []
                elif line.startswith("event:"):
                    event_name = line[6:].strip()
                elif line.startswith("data:"):
                    data_lines.append(line[5:].strip())
        finally:
            response.close()

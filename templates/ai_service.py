"""Controlled DeepSeek integration. Browser input never controls system prompts or model settings."""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Iterator

import requests


SCORES = ("happy", "sad", "angry", "calm", "surprised", "fear")
SYSTEM_PROMPTS = {
    "companion": (
        "你是聆心小开的心理陪伴助手。以温和、非评判的中文回应，鼓励用户寻求可信的人和专业支持。"
        "不要作出诊断，不承诺保密，不替代紧急或医疗服务。"
    ),
    "popsci": (
        "你是聆心小开的心理科普助手。用准确、通俗、非诊断性的中文解释心理学知识，"
        "必要时建议用户咨询专业人士。"
    ),
}
CRISIS_REPLY = (
    "我很重视你现在说的感受。请先不要独自承受：如果你有立即伤害自己或他人的风险，"
    "请立刻拨打 120/110，或联系身边可信任的人陪伴你。\n\n"
    "你也可以联系全国统一心理援助热线 12356；南开大学心理中心：津南校区 022-85358432，"
    "八里台校区 022-23505432，泰达校区 022-66229388。"
)
CRISIS_PATTERN = re.compile(
    r"自杀|想死|不想活|结束生命|结束自己|割腕|跳楼|杀了自己|suicid(?:e|al)|kill myself",
    re.IGNORECASE,
)


class UpstreamError(Exception):
    pass


def is_crisis(text: str) -> bool:
    return bool(CRISIS_PATTERN.search(text))


def _url(config: dict) -> str:
    base = str(config["DEEPSEEK_BASE_URL"]).rstrip("/")
    return base if base.endswith("/chat/completions") else f"{base}/chat/completions"


def _headers(config: dict, stream: bool) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {config['DEEPSEEK_API_KEY']}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream" if stream else "application/json",
    }


def _body(config: dict, mode: str, messages: list[dict], stream: bool = False) -> dict:
    body = {
        "model": config["DEEPSEEK_MODEL"],
        "temperature": 0.4 if mode == "companion" else 0.2,
        "max_tokens": 800,
        "messages": [{"role": "system", "content": SYSTEM_PROMPTS[mode]}, *messages],
    }
    if stream:
        body["stream"] = True
    return body


def _reply_from_json(payload: dict) -> str:
    try:
        reply = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise UpstreamError("AI 服务返回了无法识别的内容") from exc
    if not isinstance(reply, str) or not reply.strip():
        raise UpstreamError("AI 服务没有返回有效文本")
    return reply.strip()


def complete_chat(config: dict, mode: str, messages: list[dict]) -> str:
    try:
        response = requests.post(
            _url(config), headers=_headers(config, False), json=_body(config, mode, messages), timeout=30
        )
    except requests.RequestException as exc:
        raise UpstreamError("暂时无法连接 AI 服务") from exc
    if response.status_code >= 400:
        raise UpstreamError("AI 服务暂时不可用")
    try:
        return _reply_from_json(response.json())
    except ValueError as exc:
        raise UpstreamError("AI 服务返回了无法识别的内容") from exc


def stream_chat(
    config: dict,
    mode: str,
    messages: list[dict],
    persist: Callable[[str], None],
) -> Iterator[str]:
    """Yield our stable SSE format and send exactly one terminal done event."""
    upstream = None
    text_parts: list[str] = []
    try:
        try:
            upstream = requests.post(
                _url(config),
                headers=_headers(config, True),
                json=_body(config, mode, messages, stream=True),
                stream=True,
                timeout=30,
            )
        except requests.RequestException as exc:
            raise UpstreamError("暂时无法连接 AI 服务") from exc
        if upstream.status_code >= 400:
            raise UpstreamError("AI 服务暂时不可用")
        for raw_line in upstream.iter_lines(decode_unicode=False):
            if not raw_line:
                continue
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                payload = json.loads(data)
                content = payload["choices"][0]["delta"].get("content")
            except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                continue
            if isinstance(content, str) and content:
                text_parts.append(content)
                yield f"data: {json.dumps({'type': 'delta', 'content': content}, ensure_ascii=False)}\n\n"
        final_text = "".join(text_parts).strip()
        if not final_text:
            raise UpstreamError("AI 服务没有返回有效文本")
        persist(final_text)
    except UpstreamError as exc:
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)}, ensure_ascii=False)}\n\n"
    finally:
        if upstream is not None:
            upstream.close()
        yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"


def analyze_emotions(config: dict, mode: str, text: str) -> dict[str, float]:
    prompt = (
        "仅返回 JSON 对象，键必须是 happy,sad,angry,calm,surprised,fear，值为 0 到 1 的数字。"
        "根据下列文本给出粗略情绪倾向，不作医学诊断：\n" + text
    )
    messages = [{"role": "user", "content": prompt}]
    raw = complete_chat(config, mode, messages)
    try:
        parsed = json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip()))
    except (json.JSONDecodeError, TypeError):
        parsed = {}
    result: dict[str, float] = {}
    for key in SCORES:
        try:
            result[key] = max(0.0, min(1.0, float(parsed.get(key, 0))))
        except (TypeError, ValueError, AttributeError):
            result[key] = 0.0
    return result

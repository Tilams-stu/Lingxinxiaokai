"""Deterministic crisis policy kept in Flask before the local agent gateway."""

from __future__ import annotations

import re


CRISIS_REPLY = (
    "我很重视你现在说的感受。请先不要独自承担：如果你有立即伤害自己或他人的风险，"
    "请立刻拨打 120/110，或联系身边可信任的人陪伴你。\n\n"
    "你也可以联系全国统一心理援助热线 12356；南开大学心理中心：津南校区 022-85358432；"
    "八里台校区 022-23505432，泰达校区 022-66229388。"
)
CRISIS_PATTERN = re.compile(
    r"自杀|想死|不想活|结束生命|结束自己|割腕|跳楼|杀了自己|suicid(?:e|al)|kill myself",
    re.IGNORECASE,
)


def is_crisis(text: str) -> bool:
    return bool(CRISIS_PATTERN.search(text))

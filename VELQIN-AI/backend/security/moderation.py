"""Basic safety checks for image/video generation prompts.

This is a deliberately conservative keyword filter — not a guarantee. It hard-blocks sexual
content involving minors in every configuration and blocks explicit sexual content unless the
owner explicitly allows NSFW generation for this private instance."""
from __future__ import annotations

import re

from services import system_settings

_MINOR = r"(child|children|kid|kids|minor|minors|underage|under-age|preteen|pre-teen|teen|teens|teenager|young girl|young boy|little girl|little boy|loli|lolita|shota|schoolgirl|schoolboy|kinder|mädchen|junge|minderjährig|\b1[0-7] ?(yo|y/o|years? old|jahre alt)\b)"
_SEXUAL = r"(nude|naked|nsfw|sex|sexual|porn|erotic|explicit|topless|lingerie|genital|nackt|erotisch|porno|sexy|undress)"
_ALWAYS_BLOCKED = [
    r"\bcsam\b",
    r"\bchild ?porn",
    r"\bkinderporn",
]
_REAL_PERSON_SEXUAL = r"(deepfake)"

NSFW_NEGATIVE = "nsfw, nude, naked, explicit, sexual"


def check_prompt(prompt: str) -> str | None:
    """Return a human-readable refusal reason, or None if the prompt is allowed."""
    p = prompt.lower()
    for pat in _ALWAYS_BLOCKED:
        if re.search(pat, p):
            return "This request is not allowed."
    has_minor = re.search(rf"\b{_MINOR}", p) is not None
    has_sexual = re.search(rf"\b{_SEXUAL}", p) is not None
    if has_minor and has_sexual:
        return "Sexual content involving minors is never allowed."
    if re.search(_REAL_PERSON_SEXUAL, p) and has_sexual:
        return "Sexual deepfakes are not allowed."
    if has_sexual and not system_settings.get("allow_nsfw_generation"):
        return "Explicit content is disabled on this VELQIN instance."
    return None


def safety_negative() -> str:
    return "" if system_settings.get("allow_nsfw_generation") else NSFW_NEGATIVE

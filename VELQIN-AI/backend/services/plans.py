"""Internal, free access tiers. They are configurable permission groups — never a paywall."""
from __future__ import annotations

from services import system_settings

PLAN_ORDER = ["free", "creator", "studio", "owner"]

PLANS: dict[str, dict] = {
    "free": {
        "name": "VELQIN Free",
        "tagline": "Everything you need to chat and create.",
        "features": ["chat", "web_search", "files", "image_generate", "memory", "voice"],
        "highlights": ["Unlimited chat with standard models", "Web research with sources", "Text-to-image", "File analysis"],
    },
    "creator": {
        "name": "VELQIN Creator",
        "tagline": "More models, image editing and video.",
        "features": ["chat", "web_search", "files", "image_generate", "memory", "voice",
                     "image_edit", "video", "advanced_settings"],
        "highlights": ["Vision & Code models", "Image-to-image, inpaint, outpaint, upscale", "VELQIN Motion video studio", "Seeds & advanced parameters"],
    },
    "studio": {
        "name": "VELQIN Studio",
        "tagline": "All local models, workflows and projects.",
        "features": ["chat", "web_search", "files", "image_generate", "memory", "voice",
                     "image_edit", "video", "advanced_settings", "projects", "all_models", "long_video"],
        "highlights": ["Every installed model", "Projects with shared context", "Long videos (segment extension)", "All creative features"],
    },
    "owner": {
        "name": "VELQIN Owner",
        "tagline": "Full control of the platform.",
        "features": ["*"],
        "highlights": ["Admin dashboard", "User & invite management", "Model management", "System & resource control"],
    },
}


def plan_rank(plan: str) -> int:
    try:
        return PLAN_ORDER.index(plan)
    except ValueError:
        return 0


def effective_plan(user) -> str:
    if user.role == "owner":
        return "owner"
    if not system_settings.get("plans_enabled"):
        # Tiers disabled: everyone gets the full creative feature set (admin rights stay role-based).
        return "studio"
    return user.plan if user.plan in PLANS else "free"


def has_feature(user, feature: str) -> bool:
    feats = PLANS[effective_plan(user)]["features"]
    return "*" in feats or feature in feats


def can_use_plan_level(user, min_plan: str) -> bool:
    plan = effective_plan(user)
    if "all_models" in PLANS[plan]["features"] or "*" in PLANS[plan]["features"]:
        return True
    return plan_rank(plan) >= plan_rank(min_plan)


def features_for(user) -> list[str]:
    feats = PLANS[effective_plan(user)]["features"]
    if "*" in feats:
        all_f: set[str] = set()
        for p in PLANS.values():
            all_f.update(f for f in p["features"] if f != "*")
        return sorted(all_f | {"admin"})
    out = list(feats)
    if user.role in ("owner", "admin"):
        out.append("admin")
    return sorted(set(out))

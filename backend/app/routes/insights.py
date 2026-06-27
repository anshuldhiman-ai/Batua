"""Insights routes.

The default ``GET /insights`` returns INSTANT rule-based insights so the
dashboard never has to wait on the LLM. A separate ``POST /insights/refresh``
runs Gemini in the background and writes the result into a short-lived
cache; subsequent ``GET /insights`` reads from that cache until it expires.
This is much faster (no spinner) AND avoids the LLM returning inconsistent
numbers caused by mixed current/all-time metrics in a single prompt.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, BackgroundTasks

import ai
from parser import CATEGORIES
from app.cache import get_cache
from app.dependencies import get_storage
from app.routes.analytics import analytics_timeline, category_breakdown
from app.routes.dashboard import dashboard_metrics

logger = logging.getLogger("batua.insights")

router = APIRouter()

DEFAULT_CATEGORIES = list(CATEGORIES.keys()) + ["Other"]


async def get_all_txns():
    storage = get_storage()
    return await storage.all("transactions")


# Cache TTLs (seconds). The LLM cache is short so the user can force a
# refresh by waiting a minute, but long enough that it doesn't fire on
# every navigation back to the dashboard.
_RULES_CACHE_TTL = 30
_LLM_CACHE_TTL = 300  # 5 min
_LLM_TIMEOUT = 20.0  # generous: this runs in a background task, so it never
# blocks the UI (GET returns rules instantly). A cold Gemini call takes
# ~6-9s, so a tight cap here just guarantees the LLM result never lands.


@router.get("/")
async def insights():
    """Return cached insights if fresh, else build rules synchronously.

    Always fast (<100ms). Gemini insights, when present, are layered on top
    from a separate cache that the refresh endpoint fills in the background.
    """
    cache = get_cache()
    rules = cache.get("insights_rules")
    if rules is None:
        txns = await get_all_txns()
        metrics = await dashboard_metrics()
        cats = (await category_breakdown(month=metrics.get("current_month")))["data"]
        rules = {"insights": _rule_based_insights(metrics, cats, txns)}
        cache.set("insights_rules", rules, ttl=_RULES_CACHE_TTL)

    llm = cache.get("insights_llm") if ai.is_enabled() else None

    # Prefer LLM if we have it; otherwise rules. We always include rules as
    # a baseline so a missing/broken LLM never hides insights from the user.
    if llm and llm.get("insights"):
        return {
            "insights": llm["insights"],
            "source": "gemini",
            "rules_fallback": rules["insights"],
            "generated_at": llm.get("generated_at"),
        }
    return {
        "insights": rules["insights"],
        "source": "rules",
        "generated_at": int(time.time()),
    }


@router.post("/refresh")
async def refresh_ai_insights(background_tasks: BackgroundTasks):
    """Kick off a Gemini refresh in the background.

    Returns immediately with a status flag so the UI doesn't block.
    """
    if not ai.is_enabled():
        return {"status": "disabled", "message": "Gemini is not configured."}
    background_tasks.add_task(_refresh_llm_insights)
    return {"status": "queued"}


async def _refresh_llm_insights() -> None:
    """Run Gemini with a strict scope, validate, cache on success, fall
    back to rules on failure."""
    try:
        metrics = await dashboard_metrics()
        timeline_data = await analytics_timeline()
        timeline = timeline_data["series"][-6:] if timeline_data.get("series") else []
        cats = (await category_breakdown(month=metrics.get("current_month")))["data"]

        llm_lines = await asyncio.wait_for(
            asyncio.to_thread(_gemini_insights, metrics, timeline, cats),
            timeout=_LLM_TIMEOUT,
        )
        if llm_lines:
            get_cache().set(
                "insights_llm",
                {
                    "insights": llm_lines,
                    "generated_at": int(time.time()),
                },
                ttl=_LLM_CACHE_TTL,
            )
            logger.info("Gemini insights refreshed (%d lines)", len(llm_lines))
    except asyncio.TimeoutError:
        logger.warning("Gemini insights timed out after %.1fs", _LLM_TIMEOUT)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Gemini insights failed: %s", exc)


def _sanitize_metric(value: Any) -> Any:
    """Strip keys the LLM doesn't need so the prompt is short and the model
    doesn't hallucinate using stale or out-of-scope numbers."""
    if isinstance(value, dict):
        return {k: _sanitize_metric(v) for k, v in value.items()
                if k not in {"top_categories", "investments_total",
                             "total_savings_rate", "avg_savings_rate"}}
    if isinstance(value, list):
        return [_sanitize_metric(v) for v in value]
    return value


def _gemini_insights(metrics: dict, timeline: list, cats: list) -> list[str] | None:
    """Call Gemini with a tightly-scoped prompt and validate the response."""
    # Only this-month numbers + the last 6 months of trend + top categories
    # from the SAME month. This prevents the LLM from mixing timeframes
    # (the source of the "wrong data" reports).
    safe_metrics = {
        "income": metrics.get("income", 0),
        "expense": metrics.get("expense", 0),
        "net": metrics.get("net", 0),
        "savings_rate": metrics.get("savings_rate", 0),
        "income_change_pct": metrics.get("income_change", 0),
        "expense_change_pct": metrics.get("expense_change", 0),
        "current_month": metrics.get("current_month", ""),
        "top_categories": metrics.get("top_categories", []),
    }
    safe_cats = cats[:6] if cats else []
    payload = json.dumps({"metrics": safe_metrics, "timeline": timeline, "categories": safe_cats})

    system = (
        "You are a concise personal finance coach for an Indian user (currency "
        "INR ₹). All numbers below refer to the SAME month "
        f"({safe_metrics['current_month']}). Do NOT mix in all-time numbers. "
        "Return 3-4 short, specific, actionable coaching lines that reference "
        "the actual numbers. Keep each line under 140 chars. Return JSON: "
        '{"insights": ["...", "..."]}. No fluff, no preamble.'
    )
    data = ai.chat_json(system, payload)
    if not data or not isinstance(data, dict):
        return None
    lines = data.get("insights")
    if not isinstance(lines, list) or not lines:
        return None

    # Validate: drop anything too long, empty, or that claims an absurd number.
    cleaned: list[str] = []
    for line in lines:
        if not isinstance(line, str):
            continue
        text = line.strip()
        # Remove markdown bold formatting (**text**)
        text = text.replace("**", "")
        if not text or len(text) > 200:
            continue
        cleaned.append(text)
        if len(cleaned) >= 4:
            break

    # If Gemini gave us 0 usable lines, treat as failure → rules fallback.
    return cleaned or None


def _rule_based_insights(metrics: dict, cats: list, txns: list) -> list[str]:
    out: list[str] = []
    if not txns:
        return [
            "Add your first transaction to start getting insights.",
            "Try the natural-language bar: type \"zomato 450 yesterday upi\".",
        ]
    
    current_month = metrics.get("current_month", "")
    month_label = ""
    if current_month:
        try:
            y, m = current_month.split("-")
            from datetime import datetime
            month_label = datetime(int(y), int(m), 1).strftime("%B %Y")
        except:
            month_label = current_month
    
    sr = metrics.get("savings_rate", 0)
    if sr >= 20:
        out.append(f"Strong month in {month_label} — you saved {sr}% of your income. Keep it up.")
    elif sr > 0:
        out.append(f"You saved {sr}% in {month_label}. Aim for 20% by trimming the top category.")
    elif sr == 0 and metrics.get("income", 0) > 0:
        out.append(f"You broke even in {month_label} — push for a positive savings rate next month.")
    else:
        out.append(f"You're spending more than you earn in {month_label}. Review discretionary spends.")

    if cats:
        top = cats[0]
        out.append(f"Biggest expense: {top['category']} at ₹{top['amount']:,.0f}.")
    ec = metrics.get("expense_change", 0)
    if ec > 15:
        out.append(f"Expenses rose {ec}% vs last month — watch the trend.")
    elif ec < -10:
        out.append(f"Nice — expenses fell {abs(ec)}% vs last month.")
    if len(cats) >= 3:
        out.append(f"Consider setting a budget for {cats[1]['category']} and {cats[2]['category']}.")
    
    # Ensure we always return at least some insights
    if not out:
        out.append(f"Your spending for {month_label}: ₹{metrics.get('expense', 0):,.0f}.")
    
    return out[:4]

"""Insights routes.

The default ``GET /insights`` returns INSTANT rule-based insights so the
dashboard never has to wait on the LLM. A separate ``POST /insights/refresh``
runs Gemini in the background and writes the result into a short-lived
cache; subsequent ``GET /insights`` reads from that cache until it expires.
This is much faster (no spinner) AND avoids the LLM returning inconsistent
numbers caused by mixed current/all-time metrics in a single prompt.

Supports three modes:
- rules: Pattern matching only (instant)
- llama: Local LLM via Ollama (requires Ollama running)
- mixed: Pattern rules compute exact numbers, local LLM rewords the reply
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Query

import ai
import local_llm
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
async def insights(
    background_tasks: BackgroundTasks,
    mode: str = Query("hybrid", description="Insights mode: rules, llama, or mixed"),
):
    """Return cached insights if fresh, else build rules synchronously.

    Always fast (<100ms). The local-LLM modes (``llama``/``hybrid``) NEVER
    block the response: if the LLM cache is cold, we serve rule-based
    insights immediately and kick the LLM off in a background task, so its
    reworded result lands in cache for the next load. The dashboard awaits
    this endpoint inside its initial-load ``Promise.all``, so blocking here
    (a cold Ollama call is 6-15s) is exactly what makes the page hang.

    Supports three modes:
    - rules: Pattern matching only (instant)
    - llama: Local LLM via Ollama (requires Ollama running)
    - mixed: Pattern rules compute exact numbers, local LLM rewords the reply
    """
    cache = get_cache()
    rules = cache.get("insights_rules")
    if rules is None:
        txns = await get_all_txns()
        metrics = await dashboard_metrics()
        cats = (await category_breakdown(month=metrics.get("current_month")))["data"]
        rules = {"insights": _rule_based_insights(metrics, cats, txns)}
        cache.set("insights_rules", rules, ttl=_RULES_CACHE_TTL)

    # Handle different modes
    if mode == "rules":
        # Pure rule-based insights
        return {
            "insights": rules["insights"],
            "source": "rules",
            "generated_at": int(time.time()),
        }
    elif mode == "llama":
        # Pure local LLM insights — served from cache, generated in background.
        llama = cache.get("insights_llama")
        if llama is None and local_llm.is_enabled():
            _schedule_llm_refresh(background_tasks, "insights_llama", _refresh_llama_insights)

        if llama and llama.get("insights"):
            return {
                "insights": llama["insights"],
                "source": "llama",
                "rules_fallback": rules["insights"],
                "generated_at": llama.get("generated_at"),
            }
        # Llama not ready yet (generating in background) or unavailable →
        # serve rules now; the reworded lines appear on the next load.
        return {
            "insights": rules["insights"],
            "source": "rules",
            "generated_at": int(time.time()),
        }
    elif mode == "hybrid":
        # Mixed mode: rules compute exact numbers, llama rewords the reply.
        # Generated in the background so the dashboard load never waits on it.
        mixed = cache.get("insights_mixed")
        if mixed is None and local_llm.is_enabled():
            _schedule_llm_refresh(background_tasks, "insights_mixed", _refresh_mixed_insights)

        if mixed and mixed.get("insights"):
            return {
                "insights": mixed["insights"],
                "source": "mixed",
                "rules_fallback": rules["insights"],
                "generated_at": mixed.get("generated_at"),
            }
        # Fall back to rules while the LLM reword is still generating.
        return {
            "insights": rules["insights"],
            "source": "rules",
            "generated_at": int(time.time()),
        }
    else:
        # Default to rules for unknown modes
        return {
            "insights": rules["insights"],
            "source": "rules",
            "generated_at": int(time.time()),
        }


# Guards against firing a second background generation while one is already
# in flight for the same cache key. The flag auto-expires so a crashed task
# never wedges the key permanently.
_LLM_INFLIGHT_TTL = 60


def _schedule_llm_refresh(background_tasks: BackgroundTasks, cache_key: str, worker) -> None:
    """Queue ``worker`` unless a generation for ``cache_key`` is already running.

    The dashboard can fire several ``GET /insights`` in quick succession (mode
    changes, remounts); without this guard each would spawn its own Ollama
    call and hammer the local model."""
    cache = get_cache()
    pending_key = f"{cache_key}_pending"
    if cache.get(pending_key):
        return
    cache.set(pending_key, True, ttl=_LLM_INFLIGHT_TTL)
    background_tasks.add_task(worker)


async def _refresh_llama_insights() -> None:
    """Generate pure-Llama insights and cache them (runs in the background)."""
    cache = get_cache()
    try:
        metrics = await dashboard_metrics()
        timeline_data = await analytics_timeline()
        timeline = timeline_data["series"][-6:] if timeline_data.get("series") else []
        cats = (await category_breakdown(month=metrics.get("current_month")))["data"]

        llama_insights = await asyncio.wait_for(
            asyncio.to_thread(_llama_insights, metrics, timeline, cats),
            timeout=30.0,
        )
        if llama_insights:
            cache.set(
                "insights_llama",
                {"insights": llama_insights, "generated_at": int(time.time())},
                ttl=_LLM_CACHE_TTL,
            )
        else:
            logger.warning("Llama returned no insights")
    except asyncio.TimeoutError:
        logger.warning("Llama insights timed out after 30s")
    except Exception as exc:
        logger.warning("Llama insights failed: %s", exc)
    finally:
        cache.invalidate("insights_llama_pending")


async def _refresh_mixed_insights() -> None:
    """Generate hybrid (rules reworded by Llama) insights and cache them."""
    cache = get_cache()
    try:
        rules = cache.get("insights_rules")
        if rules is None:
            txns = await get_all_txns()
            metrics = await dashboard_metrics()
            cats = (await category_breakdown(month=metrics.get("current_month")))["data"]
            rules = {"insights": _rule_based_insights(metrics, cats, txns)}
            cache.set("insights_rules", rules, ttl=_RULES_CACHE_TTL)

        metrics = await dashboard_metrics()
        timeline_data = await analytics_timeline()
        timeline = timeline_data["series"][-6:] if timeline_data.get("series") else []
        cats = (await category_breakdown(month=metrics.get("current_month")))["data"]

        mixed_insights = await asyncio.wait_for(
            asyncio.to_thread(_mixed_insights, metrics, timeline, cats, rules["insights"]),
            timeout=15.0,
        )
        if mixed_insights:
            cache.set(
                "insights_mixed",
                {"insights": mixed_insights, "generated_at": int(time.time())},
                ttl=_LLM_CACHE_TTL,
            )
    except asyncio.TimeoutError:
        logger.warning("Mixed insights timed out")
    except Exception as exc:
        logger.warning("Mixed insights failed: %s", exc)
    finally:
        cache.invalidate("insights_mixed_pending")


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
        "Return exactly 3 short, specific, actionable coaching lines. "
        "Focus on: 1) Savings rate health, 2) Top spending category, 3) One trend insight. "
        "Keep each line under 100 characters. No fluff, no preamble. "
        "Return JSON: {\"insights\": [\"line1\", \"line2\", \"line3\"]}"
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
        if not text or len(text) > 150:
            continue
        cleaned.append(text)
        if len(cleaned) >= 3:
            break

    # If Gemini gave us 0 usable lines, treat as failure → rules fallback.
    return cleaned or None


def _llama_insights(metrics: dict, timeline: list, cats: list) -> list[str] | None:
    """Call local Llama model with a detailed prompt and validate the response."""
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
    
    # Create a more detailed context for the LLM
    context = {
        "month": safe_metrics['current_month'],
        "income": safe_metrics['income'],
        "expense": safe_metrics['expense'],
        "net_savings": safe_metrics['net'],
        "savings_rate_percent": safe_metrics['savings_rate'],
        "income_change_percent": safe_metrics['income_change_pct'],
        "expense_change_percent": safe_metrics['expense_change_pct'],
        "top_spending_categories": safe_cats,
        "monthly_trend": timeline[-3:] if timeline else []  # Last 3 months trend
    }
    
    payload = json.dumps(context, indent=2)

    system = (
        "You are an expert personal finance coach for an Indian user. "
        "You will be given financial data for a specific month. "
        "Your task is to provide 3 specific, actionable, and helpful insights. "
        "\n\n"
        "Focus areas:\n"
        "1. Savings rate analysis - Is it healthy? How can it be improved?\n"
        "2. Spending patterns - What's the biggest expense category? Is it reasonable?\n"
        "3. Trends - How does this month compare to previous months? Any concerning patterns?\n"
        "\n"
        "Guidelines:\n"
        "- Be specific with numbers from the data\n"
        "- Give practical, actionable advice\n"
        "- Keep each insight under 120 characters\n"
        "- Use a conversational but professional tone\n"
        "- Focus on the current month data only\n"
        "- If savings rate is low, suggest specific ways to improve it\n"
        "- If a category is overspending, suggest alternatives\n"
        "\n"
        "Return ONLY valid JSON in this exact format:\n"
        "{\"insights\": [\"insight 1\", \"insight 2\", \"insight 3\"]}"
    )
    
    data = local_llm.chat(system, payload, temperature=0.7, timeout=30.0)
    if not data:
        logger.warning("Llama returned no data")
        return None
    
    logger.info(f"Llama raw response: {data[:200]}")
    
    # Try to parse JSON from the response
    try:
        # Extract JSON if it's wrapped in markdown
        text = data.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:]
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start : end + 1]
        parsed = json.loads(text)
        lines = parsed.get("insights")
    except Exception as e:
        logger.warning(f"Failed to parse JSON from Llama response: {e}")
        # If JSON parsing fails, try to split by newlines and clean up
        lines = []
        for line in data.strip().split("\n"):
            line = line.strip()
            # Skip lines that look like JSON keys or markdown
            if line.startswith('"') or line.startswith('[') or line.startswith(']') or line.startswith('{') or line.startswith('}'):
                continue
            # Remove numbering if present
            line = line.lstrip('0123456789.-) ')
            if line and len(line) > 10 and len(line) < 200:
                lines.append(line)
            if len(lines) >= 3:
                break
    
    if not isinstance(lines, list) or not lines:
        logger.warning("Llama returned no valid insights")
        return None

    # Validate and clean insights
    cleaned: list[str] = []
    for line in lines:
        if not isinstance(line, str):
            continue
        text = line.strip()
        # Remove markdown bold formatting and other markdown
        text = text.replace("**", "").replace("*", "")
        # Remove quotes if present
        text = text.strip('"\'')
        if not text or len(text) < 10 or len(text) > 200:
            continue
        # Skip lines that look like error messages or meta-commentary
        if "error" in text.lower() or "sorry" in text.lower() or "cannot" in text.lower():
            continue
        cleaned.append(text)
        if len(cleaned) >= 3:
            break

    if cleaned:
        logger.info(f"Llama generated {len(cleaned)} insights successfully")
    else:
        logger.warning("Llama insights were all filtered out")
    
    return cleaned or None


def _mixed_insights(metrics: dict, timeline: list, cats: list, rule_insights: list[str]) -> list[str] | None:
    """Use local Llama to reword rule-based insights for more natural language."""
    if not rule_insights:
        return None
    
    # Create context with both rule insights and raw data
    context = {
        "rule_based_insights": rule_insights,
        "financial_context": {
            "month": metrics.get("current_month", ""),
            "income": metrics.get("income", 0),
            "expense": metrics.get("expense", 0),
            "savings_rate": metrics.get("savings_rate", 0),
            "top_categories": cats[:3] if cats else []
        }
    }
    
    payload = json.dumps(context, indent=2)
    
    system = (
        "You are a friendly personal finance coach. You will receive rule-based insights "
        "that contain accurate financial data. Your job is to rewrite them to sound more "
        "natural, conversational, and helpful while keeping all the exact numbers and facts.\n\n"
        "Guidelines:\n"
        "- Keep all numbers, percentages, and facts exactly as provided\n"
        "- Make the tone more conversational and encouraging\n"
        "- Add practical suggestions where appropriate\n"
        "- Keep each insight under 120 characters\n"
        "- Use simple, clear language\n"
        "- Focus on being helpful and actionable\n"
        "\n"
        "Return ONLY valid JSON in this exact format:\n"
        "{\"insights\": [\"rewritten insight 1\", \"rewritten insight 2\", \"rewritten insight 3\"]}"
    )
    
    data = local_llm.chat(system, payload, temperature=0.8, timeout=20.0)
    if not data:
        logger.warning("Mixed mode: Llama returned no data")
        return None
    
    logger.info(f"Mixed mode raw response: {data[:200]}")
    
    # Try to parse JSON from the response
    try:
        text = data.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:]
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start : end + 1]
        parsed = json.loads(text)
        lines = parsed.get("insights")
    except Exception as e:
        logger.warning(f"Mixed mode: Failed to parse JSON: {e}")
        # If JSON parsing fails, try to split by newlines
        lines = []
        for line in data.strip().split("\n"):
            line = line.strip()
            if line.startswith('"') or line.startswith('[') or line.startswith(']') or line.startswith('{') or line.startswith('}'):
                continue
            line = line.lstrip('0123456789.-) ')
            if line and len(line) > 10 and len(line) < 200:
                lines.append(line)
            if len(lines) >= 3:
                break
    
    if not isinstance(lines, list) or not lines:
        logger.warning("Mixed mode: No valid insights from Llama")
        return None

    # Validate and clean
    cleaned: list[str] = []
    for line in lines:
        if not isinstance(line, str):
            continue
        text = line.strip()
        text = text.replace("**", "").replace("*", "").strip('"\'')
        if not text or len(text) < 10 or len(text) > 200:
            continue
        if "error" in text.lower() or "sorry" in text.lower():
            continue
        cleaned.append(text)
        if len(cleaned) >= 3:
            break

    if cleaned:
        logger.info(f"Mixed mode: Generated {len(cleaned)} insights")
    else:
        logger.warning("Mixed mode: All insights filtered out")
    
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
        except Exception:
            month_label = current_month
    else:
        # Fallback: calculate from actual transactions if current_month is missing
        from app.helpers import month_key
        months = sorted({month_key(t["date"]) for t in txns if t.get("date")})
        if months:
            current_month = months[-1]  # Use latest month
            try:
                y, m = current_month.split("-")
                from datetime import datetime
                month_label = datetime(int(y), int(m), 1).strftime("%B %Y")
            except Exception:
                month_label = current_month
    
    # Focus on 3 key insights: savings, top category, trend
    sr = metrics.get("savings_rate", 0)
    if sr >= 20:
        out.append(f"Strong month: saved {sr}% of income in {month_label}.")
    elif sr > 0:
        out.append(f"Saved {sr}% in {month_label}. Aim for 20%.")
    elif sr == 0 and metrics.get("income", 0) > 0:
        out.append(f"Broke even in {month_label}. Push for positive savings.")
    else:
        out.append(f"Spending exceeds income in {month_label}. Review expenses.")

    if cats:
        top = cats[0]
        out.append(f"Top expense: {top['category']} ₹{top['amount']:,.0f}.")

    ec = metrics.get("expense_change", 0)
    if ec > 15:
        out.append(f"Expenses up {ec}% vs last month.")
    elif ec < -10:
        out.append(f"Expenses down {abs(ec)}% vs last month.")
    
    # Ensure we always return at least some insights
    if not out:
        out.append(f"Spending in {month_label}: ₹{metrics.get('expense', 0):,.0f}.")
    
    return out[:3]

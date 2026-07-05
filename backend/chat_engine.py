"""Multi-turn conversation layer on top of ``ml_rag``/``local_llm``.

``ml_rag.FinanceQA`` stays the stateless single-turn engine; this module adds
session memory (persisted via the generic ``storage`` collection interface),
follow-up/pronoun resolution, and intent tagging, reusing ``FinanceQA``'s
public wrapper methods instead of duplicating its pattern-matching logic.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Literal

import local_llm
import ml_analytics
import ml_goals
import ml_rag

logger = logging.getLogger("batua.chat_engine")

COLLECTION = "chat_sessions"
MAX_VERBATIM_TURNS = 8
SUMMARIZE_AFTER_TURNS = 12

Intent = Literal["query", "advice", "comparison", "analysis", "anomaly"]

# Order matters — first matching intent wins.
_INTENT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "advice": ("should i", "how can i", "how do i", "recommend", "suggest", "advice", "tips", "optimi"),
    "comparison": (" vs ", "versus", "compare", "compared to", "difference between"),
    "analysis": ("trend", "pattern", "why did", "why is", "analy", "growing", "declining"),
    "anomaly": ("unusual", "weird", "strange", "anomal", "suspicious", "spike", "odd charge"),
}

_FOLLOWUP_STARTS = re.compile(r"^(and\s|what about|how about|what if|same for|same but)")
_PRONOUN_MARKERS = re.compile(r"\b(it|that|those|them|this)\b")

# Reverse of ml_rag's period-alias map, for rebuilding a human-readable
# question string out of a period key pulled from a prior turn.
_PERIOD_KEY_TO_PHRASE = {
    "this_month": "this month",
    "last_month": "last month",
    "this_week": "this week",
    "last_week": "last week",
    "this_year": "this year",
    "last_year": "last year",
    "yesterday": "yesterday",
    "today": "today",
}
_MONTH_NUMS = ["", "january", "february", "march", "april", "may", "june",
               "july", "august", "september", "october", "november", "december"]

_SUMMARY_SYSTEM = (
    "You summarize a personal finance chatbot conversation concisely, "
    "preserving any concrete rupee (₹) figures and category names "
    "mentioned. Plain text, 2-4 short sentences, no markdown."
)

_FREEFORM_SYSTEM = (
    "You are Batua, a personal finance assistant. Answer ONLY using the "
    "verified financial summary below — never invent a rupee (₹) figure, "
    "category, or date that isn't in it. If the summary doesn't have what's "
    "needed to answer, say so plainly instead of guessing. Use the recent "
    "conversation for context (e.g. resolving \"it\"/\"that\"). Keep replies "
    "to 2-3 short sentences, plain text, no markdown.\n\n"
    "Example — summary says \"Food & Dining: ₹4,200 total\", user asks "
    "\"is that a lot?\": \"₹4,200 on Food & Dining isn't extreme on its own, "
    "but it's worth comparing against your income to see how much of your "
    "budget it's taking up.\" (No invented percentages or comparisons beyond "
    "what the summary supports.)"
)


def classify_intent(question: str) -> Intent:
    """Cheap keyword heuristic over the raw question. Defaults to "query"."""
    q = question.strip().lower()
    for intent, keywords in _INTENT_KEYWORDS.items():
        if any(kw in q for kw in keywords):
            return intent  # type: ignore[return-value]
    return "query"


def needs_followup_resolution(question: str) -> bool:
    """True if the question looks like a shorthand follow-up ("and last
    month?", "what about that?") rather than a fully-specified question."""
    q = question.strip().lower()
    if not q:
        return False
    if _FOLLOWUP_STARTS.match(q):
        return True
    if _PRONOUN_MARKERS.search(q) and len(q.split()) <= 8:
        return True
    return False


def _period_key_to_phrase(period_key: str) -> str:
    if period_key in _PERIOD_KEY_TO_PHRASE:
        return _PERIOD_KEY_TO_PHRASE[period_key]
    m = re.match(r"^(\d{4})-(\d{2})$", period_key)
    if m:
        year, month = m.group(1), int(m.group(2))
        if 1 <= month <= 12:
            return f"{_MONTH_NUMS[month]} {year}"
    return period_key.replace("_", " ")


def resolve_followup(question: str, last_assistant_turn: dict | None) -> str:
    """Rules-based follow-up resolution.

    Pulls category/period/merchant entities out of the prior assistant
    turn's stored ``details``, merges them with any new period/category
    found in this shorthand question, and rebuilds a fully-specified
    question string that runs through ``ml_rag``'s existing handler
    pipeline unchanged. Falls through to the raw question if nothing can
    be merged.
    """
    if not last_assistant_turn:
        return question
    details = last_assistant_turn.get("details") or {}
    prior_category = details.get("category")
    prior_merchant = details.get("search_term") or details.get("merchant")
    prior_period = details.get("period")

    qa = ml_rag.get_qa_system()
    new_category = qa.extract_category(question)
    new_period = qa.extract_period(question)

    category = new_category or prior_category
    merchant = None if (new_category or category) else prior_merchant
    period = new_period or prior_period

    if not category and not merchant:
        return question

    if category:
        rebuilt = f"how much did I spend on {category}"
    else:
        rebuilt = f"how much did I spend on {merchant}"
    if period:
        rebuilt += f" {_period_key_to_phrase(period)}"
    return rebuilt


def _last_assistant_turn(turns: list[dict]) -> dict | None:
    for turn in reversed(turns):
        if turn.get("role") == "assistant":
            return turn
    return None


def _slim_details(result: dict) -> dict:
    """Bound what gets persisted per turn — full result stays in the live
    API response, only the stored copy is slimmed."""
    keep_keys = (
        "type", "category", "merchant", "search_term", "period", "value",
        "investment_nudge", "trend", "top_growing_category", "peak_month",
        "left", "right", "actions",
    )
    slim = {k: result[k] for k in keep_keys if k in result}
    for list_key in ("transactions", "anomalies", "recommendations"):
        value = result.get(list_key)
        if isinstance(value, list):
            slim[list_key] = value[:3]
    return slim


def _summarize_turns(fold_turns: list[dict], prior_summary: str) -> str:
    lines = [f"{t.get('role')}: {t.get('content', '')}" for t in fold_turns]
    joined = "\n".join(lines)
    if local_llm.is_enabled():
        prompt = (
            f"Prior summary: {prior_summary or '(none)'}\n\n"
            f"New turns to fold in:\n{joined}"
        )
        reply = local_llm.chat(_SUMMARY_SYSTEM, prompt, temperature=0.3)
        if reply:
            return reply.strip()
    # Deterministic fallback when the local LLM is unavailable.
    fallback = " ".join(f"{t.get('role')}: {t.get('content', '')}" for t in fold_turns)
    combined = f"{prior_summary} {fallback}".strip() if prior_summary else fallback
    return combined[:800]


def _maybe_summarize(session: dict) -> None:
    turns = session.get("turns", [])
    if len(turns) <= SUMMARIZE_AFTER_TURNS:
        return
    fold, keep = turns[:-MAX_VERBATIM_TURNS], turns[-MAX_VERBATIM_TURNS:]
    if not fold:
        return
    session["summary"] = _summarize_turns(fold, session.get("summary", ""))
    session["turns"] = keep


# ---------------------------------------------------------------------- #
# Session persistence
# ---------------------------------------------------------------------- #

def _new_session(session_id: str) -> dict:
    now = datetime.now().isoformat()
    return {"id": session_id, "created_at": now, "updated_at": now, "summary": "", "turns": []}


async def load_session(storage: Any, session_id: str) -> dict:
    doc = await storage.get(COLLECTION, session_id)
    if doc is None:
        return _new_session(session_id)
    doc.setdefault("summary", "")
    doc.setdefault("turns", [])
    return doc


async def save_session(storage: Any, session: dict) -> None:
    existing = await storage.get(COLLECTION, session["id"])
    if existing is None:
        await storage.insert(COLLECTION, session)
    else:
        await storage.update(COLLECTION, session["id"], session)


async def delete_session(storage: Any, session_id: str) -> None:
    await storage.delete(COLLECTION, session_id)


# ---------------------------------------------------------------------- #
# Intent handlers — each returns a result dict or None to fall through to
# the default query path (``FinanceQA.answer_question``).
# ---------------------------------------------------------------------- #

_COMPARISON_SPLIT = re.compile(r"\bvs\b|\bversus\b|\bcompared to\b|\bcompare(?:d)?\s+to\b")


def _handle_advice(question: str, transactions: list[dict]) -> dict | None:
    engine = ml_goals.get_recommendation_engine()
    recs = engine.generate_recommendations(transactions)
    nudge = engine.investment_nudge(transactions)
    recommendations = (recs or {}).get("recommendations", [])[:3]
    if not recommendations and not nudge:
        return None

    lines = [
        f"{r['title']}: {r['description']} (potential savings ₹{r.get('potential_savings', 0):,.2f}/mo)"
        for r in recommendations
    ]
    if nudge:
        lines.append(nudge["description"])

    qa = ml_rag.get_qa_system()
    answer = qa.naturalise(question, " ".join(lines))
    return {
        "answer": answer,
        "type": "advice",
        "recommendations": recommendations,
        "investment_nudge": nudge,
        "actions": [{"label": "Optimize budget", "to": "/budgets"}],
    }


def _handle_anomaly(question: str, transactions: list[dict]) -> dict | None:
    detector = ml_analytics.get_anomaly_detector()
    result = detector.detect_anomalies(transactions)
    qa = ml_rag.get_qa_system()
    if result.get("empty") or not result.get("anomalies"):
        return {
            "answer": qa.naturalise(
                question,
                "Nothing unusual jumps out in your recent spending — everything looks in line with your normal patterns.",
            ),
            "type": "anomaly_report",
            "anomalies": [],
        }

    top = result["anomalies"][:3]
    verified = " ".join(a["description"] for a in top)
    return {
        "answer": qa.naturalise(question, verified),
        "type": "anomaly_report",
        "anomalies": result["anomalies"],
        "actions": [{"label": "View spending patterns", "to": "/ml-insights"}],
    }


def _handle_analysis(question: str, transactions: list[dict]) -> dict | None:
    patterns = ml_analytics.get_pattern_analyzer().analyze_patterns(transactions)
    if not patterns or patterns.get("empty"):
        return None

    trend = (patterns.get("monthly_patterns") or {}).get("trend")
    top_growing = (patterns.get("category_trends") or {}).get("top_growing_category")
    seasonal = patterns.get("seasonal_patterns") or {}
    peak_month = seasonal.get("peak_spending_month")

    lines = []
    if trend:
        lines.append(f"Your spending trend is {trend}.")
    if top_growing:
        lines.append(f"{top_growing} is your fastest-growing spending category.")
    if peak_month:
        lines.append(
            f"{peak_month} was your peak spending month at ₹{seasonal.get('peak_spending_amount', 0):,.2f}."
        )
    if not lines:
        return None

    qa = ml_rag.get_qa_system()
    return {
        "answer": qa.naturalise(question, " ".join(lines)),
        "type": "analysis",
        "trend": trend,
        "top_growing_category": top_growing,
        "peak_month": peak_month,
        "actions": [{"label": "View spending patterns", "to": "/ml-insights"}],
    }


def _handle_comparison(question: str, idx: dict) -> dict | None:
    qa = ml_rag.get_qa_system()
    q = question.lower()
    parts = _COMPARISON_SPLIT.split(q)
    if len(parts) >= 2:
        left_cat = qa.extract_category(parts[0])
        right_cat = qa.extract_category(parts[1])
        if left_cat and right_cat and left_cat != right_cat:
            left_total = idx["category_index"].get(left_cat, {}).get("total", 0.0)
            right_total = idx["category_index"].get(right_cat, {}).get("total", 0.0)
            verified = f"{left_cat}: ₹{left_total:,.2f} vs {right_cat}: ₹{right_total:,.2f}."
            return {
                "answer": qa.naturalise(question, verified),
                "type": "comparison",
                "left": {"label": left_cat, "value": left_total},
                "right": {"label": right_cat, "value": right_total},
            }

    # Fallback: this month vs last month, when no two categories were named.
    months = sorted(idx.get("monthly_index", {}).keys())
    if len(months) >= 2:
        last, prev = months[-1], months[-2]
        last_expense = idx["monthly_index"][last]["expense"]
        prev_expense = idx["monthly_index"][prev]["expense"]
        verified = f"{last}: spent ₹{last_expense:,.2f} vs {prev}: spent ₹{prev_expense:,.2f}."
        return {
            "answer": qa.naturalise(question, verified),
            "type": "comparison",
            "left": {"label": last, "value": last_expense},
            "right": {"label": prev, "value": prev_expense},
        }
    return None


def _route_intent(intent: str, question: str, transactions: list[dict], mode: str) -> dict:
    qa = ml_rag.get_qa_system()
    if intent == "advice":
        result = _handle_advice(question, transactions)
        if result:
            return result
    elif intent == "anomaly":
        result = _handle_anomaly(question, transactions)
        if result:
            return result
    elif intent == "analysis":
        result = _handle_analysis(question, transactions)
        if result:
            return result
    elif intent == "comparison":
        result = _handle_comparison(question, qa.build_index(transactions))
        if result:
            return result
    return qa.answer_question(question, transactions, mode)


def _freeform_fallback(question: str, transactions: list[dict], turns: list[dict]) -> str | None:
    """Grounded freeform reply for on-topic questions no pattern handler
    matched. Feeds the model a verified digest (so figures stay real) plus
    the recent conversation for pronoun/context resolution. Returns None if
    the local LLM is unreachable or replies empty — caller keeps the canned
    "couldn't match that" answer in that case."""
    if not local_llm.is_enabled():
        return None
    qa = ml_rag.get_qa_system()
    idx = qa.build_index(transactions)
    digest = qa.context_digest(idx)
    messages = [{"role": "system", "content": f"{_FREEFORM_SYSTEM}\n\nVerified financial summary:\n{digest}"}]
    for turn in turns[-MAX_VERBATIM_TURNS:]:
        content = turn.get("content") or ""
        if not content:
            continue
        role = "assistant" if turn.get("role") == "assistant" else "user"
        messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": question})
    return local_llm.chat_messages(messages, temperature=0.6)


# ---------------------------------------------------------------------- #
# Turn processing (sync — may block on local_llm HTTP calls; run in threadpool)
# ---------------------------------------------------------------------- #

def process_turn(session: dict, question: str, transactions: list[dict], mode: str = "hybrid") -> dict:
    """Resolve follow-ups, classify intent, route to the matching handler
    (falling back to ``FinanceQA.answer_question`` for plain queries or when
    a specialized handler has nothing to say), then append both turns to
    ``session`` (mutated in place). Caller persists the session afterwards."""
    turns = session.setdefault("turns", [])
    last_assistant = _last_assistant_turn(turns)

    resolved_question = question
    if needs_followup_resolution(question):
        candidate = resolve_followup(question, last_assistant)
        if candidate != question:
            resolved_question = candidate

    intent = classify_intent(question)
    result = _route_intent(intent, resolved_question, transactions, mode)
    if result.get("type") == "unknown":
        freeform = _freeform_fallback(resolved_question, transactions, turns)
        if freeform:
            result = {**result, "answer": freeform, "type": "freeform"}
    result["question"] = question
    if resolved_question != question:
        result["resolved_question"] = resolved_question
    result["intent"] = intent
    result["session_id"] = session["id"]
    result.setdefault("follow_up_suggestions", [])
    result.setdefault("actions", [])

    now = datetime.now().isoformat()
    turns.append({"role": "user", "content": question, "type": None, "details": None, "at": now})
    turns.append({
        "role": "assistant",
        "content": result.get("answer", ""),
        "type": result.get("type"),
        "details": _slim_details(result),
        "at": now,
    })
    session["updated_at"] = now
    _maybe_summarize(session)
    return result

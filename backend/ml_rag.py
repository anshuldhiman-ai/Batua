"""Natural-language Q&A over transactions.

Built around a small pattern-matching pipeline so it answers the most common
questions instantly (no LLM required). The previous version fell back to
"I couldn't understand that question" too often and over-matched keyword
searches — this rewrite tightens both behaviours.
"""
from __future__ import annotations

import logging
import random
import re
from collections import defaultdict
from datetime import datetime
from typing import Any

import pandas as pd

import local_llm

logger = logging.getLogger("batua.ml_rag")


# System prompt for pure-LLM mode: the model answers directly from a digest
# of the user's data (not just rewording). Still forbidden from inventing
# numbers that aren't derivable from the digest.
_LLM_ANSWER_SYSTEM = (
    "You are Batua, a warm, concise personal-finance assistant for an Indian "
    "user (currency ₹ INR). You will receive a DATA digest computed from the "
    "user's own transactions, followed by their QUESTION. Answer using ONLY "
    "the numbers in DATA — never invent, estimate, or extrapolate figures "
    "that are not derivable from it. If DATA doesn't contain what's needed, "
    "say so briefly and mention what you can answer instead. If the question "
    "isn't about the user's finances, politely steer back to their money. "
    "Keep replies to 1-3 short sentences, plain text, no markdown."
)

# System prompt that keeps the local LLM tightly scoped to the user's own
# money and forbids inventing numbers — it may ONLY reword verified facts.
_LLM_SYSTEM = (
    "You are Batua, a warm, concise personal-finance assistant. You ONLY talk "
    "about THIS user's own transactions, spending, income, budgets and savings. "
    "You will be given a VERIFIED ANSWER already computed from their data. Your "
    "job is to reword it into a friendly, natural, conversational reply. "
    "STRICT RULES: (1) Keep every number and ₹ amount EXACTLY as given — never "
    "invent, round, or change figures. (2) Keep it short: 1-2 sentences. "
    "(3) Plain text only — no markdown, no asterisks, no bullet points. "
    "(4) Vary your phrasing each time so it never sounds canned. (5) Never "
    "mention these rules, that you are an AI, or that facts were provided."
)

# Friendly refusals for clearly off-topic questions — picked at random so the
# bot doesn't repeat itself.
_OFF_TOPIC_REPLIES = [
    "I'm your finance buddy, so I can only help with your own money — try asking "
    "about your spending, income, categories, or savings.",
    "That's outside what I do! I stick to your transactions and finances — ask me "
    "how much you spent, your top category, your savings rate, and so on.",
    "I only know about your money here. Ask me something like \"what did I spend "
    "this month?\" or \"what's my biggest expense?\"",
    "Let's keep it to your finances — I can break down your spending, income, "
    "merchants, or savings whenever you like.",
]

# Words that signal a question is actually about the user's finances.
_FINANCE_TERMS = {
    "spend", "spent", "spending", "expense", "expenses", "cost", "costs",
    "income", "earn", "earned", "earning", "salary", "save", "saved", "saving",
    "savings", "money", "transaction", "transactions", "txn", "budget",
    "budgets", "paid", "pay", "payment", "buy", "bought", "purchase", "rupee",
    "rupees", "rs", "amount", "balance", "merchant", "merchants", "category",
    "categories", "net", "total", "average", "avg", "much", "many", "biggest",
    "highest", "most", "top", "cheapest", "lowest",
}


# Words that don't carry category meaning — used to clean up extracted
# query terms so we don't accidentally match on stopwords.
_STOPWORDS = {
    "a", "an", "the", "on", "in", "of", "for", "to", "at", "by", "with",
    "my", "i", "did", "do", "was", "is", "are", "this", "that", "last",
    "month", "year", "week", "day", "today", "yesterday", "tomorrow",
    "much", "many", "spend", "spent", "spending", "pay", "paid", "give",
    "gave", "show", "tell", "me", "all", "total",
}

# Maps common synonyms to a canonical month-period label.
_PERIOD_ALIASES = {
    "this month": "this_month",
    "current month": "this_month",
    "last month": "last_month",
    "previous month": "last_month",
    "past month": "last_month",
    "this week": "this_week",
    "last week": "last_week",
    "this year": "this_year",
    "last year": "last_year",
    "yesterday": "yesterday",
    "today": "today",
}

# Month name to number mapping for parsing specific months
_MONTH_NAMES = {
    "january": "01", "jan": "01",
    "february": "02", "feb": "02",
    "march": "03", "mar": "03",
    "april": "04", "apr": "04",
    "may": "05",
    "june": "06", "jun": "06",
    "july": "07", "jul": "07",
    "august": "08", "aug": "08",
    "september": "09", "sep": "09", "sept": "09",
    "october": "10", "oct": "10",
    "november": "11", "nov": "11",
    "december": "12", "dec": "12",
}

# Map category-name fragments users actually type to canonical categories.
# Lets "swiggy" or "uber eats" match the Food Delivery category, etc.
_CATEGORY_FRAGMENTS = {
    "food delivery": "Food Delivery",
    "delivery": "Food Delivery",
    "ordering": "Food Delivery",
    "online food": "Food Delivery",
    "dining": "Food & Dining",
    "restaurant": "Food & Dining",
    "eating out": "Food & Dining",
    "groceries": "Groceries",
    "grocery": "Groceries",
    "vegetables": "Groceries",
    "transport": "Transportation",
    "transportation": "Transportation",
    "travel": "Transportation",
    "cab": "Transportation",
    "taxi": "Transportation",
    "petrol": "Fuel",
    "fuel": "Fuel",
    "diesel": "Fuel",
    "shopping": "Shopping",
    "shop": "Shopping",
    "clothes": "Shopping",
    "online shopping": "Shopping",
    "utilities": "Utilities",
    "utility": "Utilities",
    "bills": "Utilities",
    "bill": "Utilities",
    "electricity": "Utilities",
    "recharge": "Utilities",
    "subscriptions": "Subscriptions",
    "subscription": "Subscriptions",
    "streaming": "Subscriptions",
    "entertainment": "Entertainment",
    "movies": "Entertainment",
    "movie": "Entertainment",
    "games": "Entertainment",
    "gaming": "Entertainment",
    "health": "Health",
    "medical": "Health",
    "medicine": "Health",
    "pharmacy": "Health",
    "education": "Education",
    "courses": "Education",
    "course": "Education",
    "books": "Education",
    "tuition": "Education",
    "rent": "Housing/Rent",
    "housing": "Housing/Rent",
    "personal care": "Personal Care",
    "grooming": "Personal Care",
    "salon": "Personal Care",
    "snacks": "Snacks",
    "snack": "Snacks",
    "tea": "Snacks",
    "coffee": "Snacks",
    "investments": "Investments",
    "investment": "Investments",
    "sip": "Investments",
    "mutual funds": "Investments",
    "stocks": "Investments",
    "salary": "Income",
    "income": "Income",
    "earnings": "Income",
}


class FinanceQA:
    """Answer natural-language questions about the user's transactions."""

    def __init__(self) -> None:
        self._index_cache: dict | None = None

    # ------------------------------------------------------------------ #
    # Index
    # ------------------------------------------------------------------ #

    def _build_index(self, transactions: list[dict]) -> dict:
        df = pd.DataFrame(transactions)
        if df.empty or "date" not in df or "amount" not in df:
            return self._empty_index()
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
        df = df.dropna(subset=["date", "amount"])
        if df.empty:
            return self._empty_index()
        if "category" not in df:
            df["category"] = "Other"
        if "description" not in df:
            df["description"] = "Transaction"
        df["category"] = df["category"].fillna("Other").replace("", "Other")
        df["description"] = df["description"].fillna("Transaction").replace("", "Transaction")
        df["month"] = df["date"].dt.strftime("%Y-%m")
        df["weekday"] = df["date"].dt.day_name()

        # Category index (expenses only — income is reported separately).
        category_index: dict[str, dict[str, Any]] = {}
        for category, sub in df[df["amount"] < 0].groupby("category"):
            category_index[str(category)] = {
                "total": float(sub["amount"].abs().sum()),
                "count": int(len(sub)),
                "avg": float(sub["amount"].abs().mean()),
                "max": float(sub["amount"].abs().max()),
                "merchants": sub["description"].value_counts().head(5).to_dict(),
            }

        monthly_index: dict[str, dict[str, float]] = {}
        for month, sub in df.groupby("month"):
            income = float(sub.loc[sub["amount"] > 0, "amount"].sum())
            expense = float(sub.loc[sub["amount"] < 0, "amount"].abs().sum())
            monthly_index[str(month)] = {
                "income": income,
                "expense": expense,
                "net": income - expense,
                "count": int(len(sub)),
            }

        # Merchant index — case-insensitive substring → list of matching txns.
        # Only used when no category/period hits; bounded to keep responses tight.
        merchant_index: dict[str, list[dict]] = {}
        for _, row in df.iterrows():
            desc = str(row["description"]).lower()
            # Use first two words as a rough merchant key for matching
            # multi-word queries like "amazon prime".
            tokens = re.findall(r"[a-z0-9]+", desc)
            keys = set()
            for token in tokens:
                if len(token) > 2:
                    keys.add(token)
            if len(tokens) >= 2:
                keys.add(f"{tokens[0]} {tokens[1]}")
            for key in keys:
                merchant_index.setdefault(key, [])
                merchant_index[key].append(
                    {
                        "date": row["date"].strftime("%Y-%m-%d"),
                        "description": row["description"],
                        "amount": float(row["amount"]),
                        "category": row["category"],
                    }
                )

        return {
            "category_index": category_index,
            "monthly_index": monthly_index,
            "merchant_index": merchant_index,
            "total_transactions": int(len(df)),
            "date_range": {
                "start": df["date"].min().strftime("%Y-%m-%d"),
                "end": df["date"].max().strftime("%Y-%m-%d"),
            },
            "total_income": float(df.loc[df["amount"] > 0, "amount"].sum()),
            "total_expense": float(df.loc[df["amount"] < 0, "amount"].abs().sum()),
            "df": df,  # kept for ad-hoc queries
        }

    @staticmethod
    def _empty_index() -> dict:
        return {
            "category_index": {},
            "monthly_index": {},
            "merchant_index": {},
            "total_transactions": 0,
            "date_range": None,
            "total_income": 0.0,
            "total_expense": 0.0,
            "df": pd.DataFrame(),
        }

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def build_index(self, transactions: list[dict]) -> dict:
        """Public wrapper around ``_build_index`` for callers (e.g.
        ``chat_engine``) that need the raw index without going through
        ``answer_question``."""
        return self._build_index(transactions)

    def context_digest(self, index: dict, specific_month: str | None = None) -> str:
        """Public wrapper around ``_context_summary``."""
        return self._context_summary(index, specific_month)

    def extract_category(self, question: str) -> str | None:
        """Public wrapper around ``_extract_category`` (normalises first)."""
        return self._extract_category(self._normalise(question))

    def naturalise(self, question: str, verified_answer: str) -> str:
        """Public wrapper around ``_naturalise``."""
        return self._naturalise(question, verified_answer)

    def extract_period(self, question: str) -> str | None:
        """Public wrapper: returns a period key (e.g. ``"last_month"``) or a
        specific ``"YYYY-MM"`` month key found in the question, if any."""
        q = self._normalise(question)
        _, specific_month = self._extract_specific_month(q)
        if specific_month:
            return specific_month
        _, period_key = self._strip_period_phrase(q)
        return period_key

    def answer_question(self, question: str, transactions: list[dict], mode: str = "hybrid") -> dict:
        """Answer a question in one of three modes.

        - ``rules``: pattern-matched template answers only (instant, exact).
        - ``llm``: the local model answers directly from a data digest;
          falls back to the pattern pipeline if the model is unreachable.
        - ``hybrid`` (default): patterns compute the verified answer, the
          local model rewords it when available.
        """
        try:
            mode = (mode or "hybrid").strip().lower()
            if mode not in ("rules", "llm", "hybrid"):
                mode = "hybrid"
            index = self._build_index(transactions)
            if not index["total_transactions"]:
                return {
                    "question": question,
                    "answer": "Add a few transactions first, then I can answer questions about spending, income, and savings.",
                    "type": "empty",
                }

            q = self._normalise(question)
            if not q:
                return self._unknown(question)

            # Check for specific month first - this affects both LLM and pattern modes
            _, specific_month = self._extract_specific_month(q)
            
            # Pure-LLM mode: hand the question + a data digest straight to
            # the local model. Falls through to the pattern pipeline when
            # the model is unreachable or returns nothing usable.
            if mode == "llm":
                result = self._answer_with_llm(question, index, specific_month)
                if result:
                    result["question"] = question
                    return result

            # Order matters — more specific patterns first.
            # Period handler (specific months) must come before total handler
            handlers = (
                self._handle_period,  # This now handles specific months - must be first
                self._handle_total,
                self._handle_biggest,
                self._handle_savings_rate,
                self._handle_count,
                self._handle_average,
                self._handle_category,
                self._handle_merchant_keyword,
            )
            for handler in handlers:
                result = handler(q, index)
                if result:
                    result["question"] = question
                    if mode == "rules":
                        # Exact template answer, lightly varied — no LLM.
                        result["answer"] = self._vary_template(result["answer"])
                        result["source"] = "rules"
                    else:
                        # Reword the verified answer with the local LLM so
                        # replies sound natural. Numbers are preserved.
                        result["answer"] = self._naturalise(question, result["answer"])
                        result["source"] = "local_llm" if local_llm.is_enabled() else "rules"
                    return result

            # Nothing matched. If it isn't even a finance question, refuse
            # politely (kept strictly on-topic, as requested).
            if not self._is_finance_question(q):
                return {
                    "question": question,
                    "answer": random.choice(_OFF_TOPIC_REPLIES),
                    "type": "off_topic",
                }

            return self._suggestion_hint(question, index)
        except Exception as exc:
            logger.exception("Q&A failed")
            return {
                "question": question,
                "answer": f"Sorry, I hit an error: {exc}",
                "type": "error",
            }

    def get_suggested_questions(self, transactions: list[dict]) -> list[str]:
        try:
            index = self._build_index(transactions)
            suggestions: list[str] = []

            top_categories = sorted(
                (c for c in index["category_index"].items() if c[0] != "Income"),
                key=lambda kv: kv[1]["total"],
                reverse=True,
            )[:3]
            for category, _ in top_categories:
                suggestions.append(f"How much did I spend on {category}?")

            # Period-scoped suggestions that users always want.
            suggestions.extend(
                [
                    "What did I spend this month?",
                    "What did I spend last month?",
                    "What's my biggest expense?",
                    "What's my total income?",
                    "What's my savings rate?",
                    "How many transactions do I have?",
                    "What was my top merchant?",
                ]
            )
            # De-dupe while preserving order.
            seen = set()
            out: list[str] = []
            for s in suggestions:
                if s not in seen:
                    out.append(s)
                    seen.add(s)
            return out[:8]
        except Exception as exc:
            logger.warning("get_suggested_questions failed: %s", exc)
            return [
                "What did I spend this month?",
                "What's my biggest expense?",
                "What's my savings rate?",
            ]

    # ------------------------------------------------------------------ #
    # Normalisation
    # ------------------------------------------------------------------ #

    @staticmethod
    def _normalise(text: str) -> str:
        return re.sub(r"\s+", " ", text.strip().lower())

    @staticmethod
    def _is_finance_question(q: str) -> bool:
        """Heuristic: does this question relate to the user's finances at all?

        Used only for the no-match branch, so we refuse clearly off-topic
        questions ("who is the president?") rather than showing spending hints.
        """
        words = set(re.findall(r"[a-z]+", q))
        if words & _FINANCE_TERMS:
            return True
        # A named category/merchant fragment also counts as on-topic.
        return any(frag in q for frag in _CATEGORY_FRAGMENTS)

    def _answer_with_llm(self, question: str, index: dict, specific_month: str = None) -> dict | None:
        """Pure-LLM mode: let the local model answer from a compact digest of
        the user's data. Returns None when the model is unreachable or gives
        nothing usable, so the caller can fall back to the pattern pipeline.
        """
        if not local_llm.is_enabled():
            return None
        
        # If specific_month not provided, extract it from the question
        if specific_month is None:
            q = self._normalise(question)
            _, specific_month = self._extract_specific_month(q)
        
        if specific_month:
            # Create a filtered digest for the specific month
            digest = self._context_summary(index, specific_month)
        else:
            # Use the full digest
            digest = self._context_summary(index)
        
        prompt = f"DATA:\n{digest}\n\nQUESTION: {question}"
        reply = local_llm.chat(_LLM_ANSWER_SYSTEM, prompt, temperature=0.4)
        if not reply:
            return None
        cleaned = self._clean_llm_text(reply)
        if not cleaned:
            return None
        return {
            "answer": cleaned,
            "type": "llm_answer",
            "source": f"local_llm:{local_llm.model_name()}",
        }

    def _context_summary(self, index: dict, specific_month: str = None) -> str:
        """Compact plain-text digest of the user's finances for the LLM.

        Kept small (last 6 months, top categories/merchants) so a small
        local model answers quickly and has no room to wander.
        
        If specific_month is provided (YYYY-MM format), filters to that month only.
        """
        lines: list[str] = []
        
        if specific_month:
            # Filter to specific month
            monthly_index = index.get("monthly_index", {})
            if specific_month in monthly_index:
                m = monthly_index[specific_month]
                lines.append(
                    f"Data for {specific_month}: "
                    f"income ₹{m['income']:,.0f}, spend ₹{m['expense']:,.0f}, "
                    f"net ₹{m['net']:,.0f}, {m['count']} transactions."
                )
                
                # Filter categories to this month
                df = index.get("df", pd.DataFrame())
                if not df.empty:
                    month_df = df[df["date"].dt.strftime("%Y-%m") == specific_month]
                    if not month_df.empty:
                        # Calculate category breakdown for this month
                        month_cats = {}
                        for _, row in month_df[month_df["amount"] < 0].iterrows():
                            cat = row.get("category", "Other")
                            amount = abs(row["amount"])
                            if cat not in month_cats:
                                month_cats[cat] = {"total": 0, "count": 0}
                            month_cats[cat]["total"] += amount
                            month_cats[cat]["count"] += 1
                        
                        if month_cats:
                            lines.append("Categories for this month (total / txns):")
                            sorted_cats = sorted(month_cats.items(), key=lambda kv: kv[1]["total"], reverse=True)[:5]
                            for name, c in sorted_cats:
                                lines.append(f"  {name}: ₹{c['total']:,.0f} / {c['count']}")
            else:
                lines.append(f"No data available for {specific_month}.")
        else:
            # Full digest (all-time data)
            dr = index.get("date_range") or {}
            ti = index["total_income"]
            te = index["total_expense"]
            rate = ((ti - te) / ti * 100) if ti > 0 else 0.0
            lines.append(
                f"Data covers {dr.get('start', '?')} to {dr.get('end', '?')} — "
                f"{index['total_transactions']} transactions."
            )
            lines.append(
                f"All-time: income ₹{ti:,.0f}, spend ₹{te:,.0f}, "
                f"net ₹{ti - te:,.0f}, savings rate {rate:.1f}%."
            )
            months = sorted(index["monthly_index"])[-6:]
            if months:
                lines.append("Recent months (income / spend / net / txns):")
                for month in months:
                    m = index["monthly_index"][month]
                    lines.append(
                        f"  {month}: ₹{m['income']:,.0f} / ₹{m['expense']:,.0f} / "
                        f"₹{m['net']:,.0f} / {m['count']}"
                    )
            cats = sorted(
                index["category_index"].items(), key=lambda kv: kv[1]["total"], reverse=True
            )[:8]
            if cats:
                lines.append("Top expense categories (total / txns / avg):")
                for name, c in cats:
                    lines.append(
                        f"  {name}: ₹{c['total']:,.0f} / {c['count']} / ₹{c['avg']:,.0f}"
                    )
            try:
                top_m = self._top_merchants(index["df"])
                if top_m:
                    lines.append(
                        "Top merchants by spend: "
                        + ", ".join(f"{m} ₹{v:,.0f}" for m, v in top_m)
                    )
            except Exception:  # pragma: no cover - digest stays usable without it
                pass
        return "\n".join(lines)

    def _naturalise(self, question: str, verified_answer: str) -> str:
        """Reword a verified answer via the local LLM for a natural, varied reply.

        The computed numbers live in ``verified_answer``; the LLM may only
        rephrase them. Falls back to a lightly-varied version of the template
        (so it still doesn't read identically every time) when the local LLM
        isn't available.
        """
        if local_llm.is_enabled():
            prompt = (
                f"User asked: \"{question}\"\n"
                f"VERIFIED ANSWER (reword this, keep all numbers exactly): "
                f"{verified_answer}"
            )
            reworded = local_llm.chat(_LLM_SYSTEM, prompt, temperature=0.85)
            if reworded:
                cleaned = self._clean_llm_text(reworded)
                # Guard: the LLM must not have dropped/changed the figures. If
                # any ₹ amount from the source is missing, distrust it.
                if cleaned and self._numbers_preserved(verified_answer, cleaned):
                    return cleaned
        return self._vary_template(verified_answer)

    @staticmethod
    def _clean_llm_text(text: str) -> str:
        # Strip markdown emphasis the model may still emit, and quotes/fences.
        text = text.strip().strip("`").strip()
        text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
        text = re.sub(r"\*(.+?)\*", r"\1", text)
        if text[:1] in "\"'" and text[-1:] in "\"'":
            text = text[1:-1].strip()
        return text

    @staticmethod
    def _numbers_preserved(source: str, candidate: str) -> bool:
        """True if every ₹-amount in ``source`` also appears in ``candidate``."""
        amounts = re.findall(r"₹[\d,]+(?:\.\d+)?", source)
        return all(a in candidate for a in amounts)

    # Light phrasing variety for the offline (no-LLM) path, so even the
    # fallback doesn't return a byte-identical string every single time.
    _PREFIXES = ["", "Sure — ", "Here you go: ", "Got it. ", "Alright, ", "Okay, "]

    def _vary_template(self, answer: str) -> str:
        # Drop markdown emphasis so the chat bubble never shows literal **.
        answer = re.sub(r"\*\*(.+?)\*\*", r"\1", answer)
        if not answer:
            return answer
        prefix = random.choice(self._PREFIXES)
        if not prefix:
            return answer
        # Lower-case the first letter after a prefix so it reads naturally.
        return prefix + answer[0].lower() + answer[1:]

    @staticmethod
    def _strip_period_phrase(q: str) -> tuple[str, str | None]:
        """Pull a period phrase ("this month", "last month", …) out of the
        question and return ``(remainder, period_key)``.

        Periods can appear anywhere in the question — "what did I spend
        this month?", "show me last week", "yesterday's expenses", etc.
        We scan all phrases (longest first so "last year" wins over "last").
        """
        for phrase, key in sorted(_PERIOD_ALIASES.items(), key=lambda kv: -len(kv[0])):
            if phrase in q:
                remainder = q.replace(phrase, " ").strip()
                return remainder, key
        return q, None

    @staticmethod
    def _extract_specific_month(q: str) -> tuple[str, str | None]:
        """Extract a specific month/year like "august 2025", "june 2024" from the question.
        Returns ``(remainder, month_key)`` where month_key is "YYYY-MM" format.
        """
        words = q.split()
        for i, word in enumerate(words):
            word_lower = word.lower()
            if word_lower in _MONTH_NAMES:
                month_num = _MONTH_NAMES[word_lower]
                # Look for year in next word or current year
                year = None
                if i + 1 < len(words):
                    next_word = words[i + 1]
                    # Check if it's a 4-digit year
                    if next_word.isdigit() and len(next_word) == 4:
                        year = next_word
                if not year:
                    # Default to current year
                    year = str(datetime.now().year)
                month_key = f"{year}-{month_num}"
                logger.info(f"Extracted month: {month_key} from question: {q}")
                # Remove the month and year from the question
                remainder = q.replace(word, "", 1).strip()
                if year in remainder:
                    remainder = remainder.replace(year, "", 1).strip()
                return remainder, month_key
        logger.info(f"No specific month found in question: {q}")
        return q, None

    @staticmethod
    def _month_bounds(period_key: str, today: datetime) -> tuple[str, str] | None:
        """Return ``(month_key, end_month_key)`` for a period, or None."""
        if period_key == "this_month":
            return (today.strftime("%Y-%m"),) * 2
        if period_key == "last_month":
            last = today.replace(day=1) - pd.Timedelta(days=1)
            return (last.strftime("%Y-%m"),) * 2
        if period_key == "this_year":
            return (f"{today.year}-01", f"{today.year}-12")
        if period_key == "last_year":
            return (f"{today.year - 1}-01", f"{today.year - 1}-12")
        if period_key == "today":
            today_str = today.strftime("%Y-%m-%d")
            return (today_str, today_str)
        if period_key == "yesterday":
            y = (today - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
            return (y, y)
        # Check if it's a specific month in YYYY-MM format
        if re.match(r"^\d{4}-\d{2}$", period_key):
            return (period_key, period_key)
        return None

    # ------------------------------------------------------------------ #
    # Handlers — return a dict or None to fall through.
    # ------------------------------------------------------------------ #

    def _handle_total(self, q: str, idx: dict) -> dict | None:
        # Skip if there's a specific month mentioned - let period handler handle it
        _, specific_month = self._extract_specific_month(q)
        if specific_month:
            return None
            
        if "total" not in q and "overall" not in q and "all time" not in q:
            return None

        # Income vs spend resolution.
        if "income" in q or "earned" in q or "salary" in q:
            total = idx["total_income"]
            return {
                "answer": f"Your total income is ₹{total:,.2f}.",
                "type": "total_income",
                "value": total,
            }
        if "spend" in q or "spent" in q or "expense" in q or "spending" in q:
            total = idx["total_expense"]
            return {
                "answer": f"Your total spending is ₹{total:,.2f}.",
                "type": "total_spending",
                "value": total,
            }
        # Generic "total" — give both.
        return {
            "answer": (
                f"Income ₹{idx['total_income']:,.2f} · "
                f"Spending ₹{idx['total_expense']:,.2f}."
            ),
            "type": "total",
            "value": idx["total_income"] - idx["total_expense"],
        }

    def _handle_biggest(self, q: str, idx: dict) -> dict | None:
        if not re.search(r"\b(biggest|highest|largest|top|most)\b", q):
            return None

        if "merchant" in q or "shop" in q or "where" in q:
            top_merchants = self._top_merchants(idx["df"], limit=1)
            if top_merchants:
                name, amount = top_merchants[0]
                return {
                    "answer": f"Your top merchant is **{name}** at ₹{amount:,.2f}.",
                    "type": "top_merchant",
                    "merchant": name,
                    "value": amount,
                }

        sorted_cats = sorted(
            ((c, d) for c, d in idx["category_index"].items() if c != "Income"),
            key=lambda kv: kv[1]["total"],
            reverse=True,
        )
        if sorted_cats:
            top_cat, top_data = sorted_cats[0]
            return {
                "answer": f"Your biggest expense category is **{top_cat}** at ₹{top_data['total']:,.2f}.",
                "type": "top_category",
                "category": top_cat,
                "value": top_data["total"],
            }
        return None

    def _handle_savings_rate(self, q: str, idx: dict) -> dict | None:
        if "saving" not in q and "saved" not in q:
            return None
        if idx["total_income"] <= 0:
            return {
                "answer": "There's no income recorded yet, so a savings rate isn't meaningful.",
                "type": "savings_rate",
                "value": 0.0,
            }
        rate = (idx["total_income"] - idx["total_expense"]) / idx["total_income"] * 100
        saved = idx["total_income"] - idx["total_expense"]
        return {
            "answer": (
                f"Your savings rate is **{rate:.1f}%** "
                f"(₹{saved:,.2f} saved out of ₹{idx['total_income']:,.2f} income)."
            ),
            "type": "savings_rate",
            "value": rate,
        }

    def _handle_count(self, q: str, idx: dict) -> dict | None:
        if "how many" not in q and "count" not in q and "number of" not in q:
            return None
        return {
            "answer": f"You have **{idx['total_transactions']}** total transactions.",
            "type": "transaction_count",
            "value": idx["total_transactions"],
        }

    def _handle_average(self, q: str, idx: dict) -> dict | None:
        if "average" not in q and "avg" not in q:
            return None
        if not idx["monthly_index"]:
            return None
        total = sum(m["expense"] for m in idx["monthly_index"].values())
        months = len(idx["monthly_index"])
        if months == 0:
            return None
        avg = total / months
        return {
            "answer": f"Your average monthly spending is **₹{avg:,.2f}** across {months} months.",
            "type": "average_monthly_spending",
            "value": avg,
        }

    def _handle_period(self, q: str, idx: dict) -> dict | None:
        # First check for specific month names like "august 2025"
        remainder, specific_month = self._extract_specific_month(q)
        if specific_month:
            period_key = specific_month
            logger.info(f"Specific month detected: {period_key} from question: {q}")
        else:
            # Fall back to period aliases like "this month", "last month"
            remainder, period_key = self._strip_period_phrase(q)
            if not period_key:
                return None

        today = datetime.now()
        bounds = self._month_bounds(period_key, today)
        if not bounds:
            return None

        monthly_index = idx["monthly_index"]
        if period_key in ("today", "yesterday"):
            # Day-scoped: aggregate by category rather than month.
            df: pd.DataFrame = idx["df"]
            target_date = bounds[0]
            day_txns = df[df["date"].dt.strftime("%Y-%m-%d") == target_date]
            if day_txns.empty:
                return {
                    "answer": f"No transactions recorded on {target_date}.",
                    "type": "period_summary",
                    "period": period_key,
                }
            expense = float(day_txns.loc[day_txns["amount"] < 0, "amount"].abs().sum())
            income = float(day_txns.loc[day_txns["amount"] > 0, "amount"].sum())
            label = "Today" if period_key == "today" else "Yesterday"
            return {
                "answer": (
                    f"{label} ({target_date}): spent ₹{expense:,.2f}, "
                    f"earned ₹{income:,.2f} across {len(day_txns)} transactions."
                ),
                "type": "period_summary",
                "period": period_key,
                "value": expense,
            }

        # Month-bounded aggregation.
        start_ym, end_ym = bounds
        months_in_range = [m for m in monthly_index if start_ym <= m <= end_ym]
        logger.info(f"Month bounds: {start_ym} to {end_ym}, months in range: {months_in_range}")
        if not months_in_range:
            label = period_key.replace("_", " ")
            if re.match(r"^\d{4}-\d{2}$", period_key):
                # Format specific month nicely
                year, month = period_key.split("-")
                month_names = ["", "January", "February", "March", "April", "May", "June", 
                              "July", "August", "September", "October", "November", "December"]
                label = f"{month_names[int(month)]} {year}"
            return {
                "answer": f"No data recorded for {label} yet.",
                "type": "period_summary",
                "period": period_key,
            }
        income = sum(monthly_index[m]["income"] for m in months_in_range)
        expense = sum(monthly_index[m]["expense"] for m in months_in_range)
        label = period_key.replace("_", " ")
        if re.match(r"^\d{4}-\d{2}$", period_key):
            # Format specific month nicely
            year, month = period_key.split("-")
            month_names = ["", "January", "February", "March", "April", "May", "June", 
                          "July", "August", "September", "October", "November", "December"]
            label = f"{month_names[int(month)]} {year}"
        logger.info(f"Period result: {label}, income: {income}, expense: {expense}")
        return {
            "answer": (
                f"For **{label}**: income ₹{income:,.2f}, "
                f"spending ₹{expense:,.2f} "
                f"(net ₹{income - expense:,.2f}) across {len(months_in_range)} month(s)."
            ),
            "type": "period_summary",
            "period": period_key,
            "value": expense,
            "data": {"income": income, "expense": expense, "net": income - expense,
                     "months": months_in_range},
        }

    def _handle_category(self, q: str, idx: dict) -> dict | None:
        """Match either a fragment from the category list, an exact category
        name, or a phrase like 'on food' / 'on shopping'."""
        cat = self._extract_category(q)
        if not cat:
            return None
        data = idx["category_index"].get(cat)
        if not data:
            return {
                "answer": f"No spending recorded under {cat} yet.",
                "type": "category_spending",
                "category": cat,
                "value": 0.0,
            }
        return {
            "answer": (
                f"You spent **₹{data['total']:,.2f}** on {cat} "
                f"across {data['count']} transactions "
                f"(avg ₹{data['avg']:,.2f}, biggest ₹{data['max']:,.2f})."
            ),
            "type": "category_spending",
            "category": cat,
            "value": data["total"],
            "merchants": data.get("merchants", {}),
        }

    def _handle_merchant_keyword(self, q: str, idx: dict) -> dict | None:
        """Match 'how much did I spend on swiggy' / 'swiggy orders' / etc."""
        # Pull the search term out of common patterns.
        term = self._extract_search_term(q)
        if not term or len(term) < 2:
            return None

        merchant_index: dict[str, list[dict]] = idx["merchant_index"]
        # Exact-key match first, then substring fallback (longest keys first).
        if term in merchant_index:
            txns = merchant_index[term]
        else:
            txns = []
            for key, items in sorted(merchant_index.items(), key=lambda kv: -len(kv[0])):
                if term in key:
                    txns.extend(items)
        if not txns:
            # Fall back to scanning descriptions directly.
            matches = [
                {
                    "date": row["date"].strftime("%Y-%m-%d"),
                    "description": row["description"],
                    "amount": float(row["amount"]),
                    "category": row["category"],
                }
                for _, row in idx["df"].iterrows()
                if term in str(row["description"]).lower()
            ]
            txns = matches

        if not txns:
            return None

        expense_txns = [t for t in txns if t["amount"] < 0]
        if not expense_txns:
            return {
                "answer": f"No spending transactions match **{term}**.",
                "type": "keyword_search",
                "search_term": term,
                "value": 0.0,
                "transactions": [],
            }
        total = sum(abs(t["amount"]) for t in expense_txns)
        return {
            "answer": (
                f"You spent **₹{total:,.2f}** on {len(expense_txns)} "
                f"transaction(s) matching **{term}**."
            ),
            "type": "keyword_search",
            "search_term": term,
            "value": total,
            "transactions": expense_txns[:5],
        }

    # ------------------------------------------------------------------ #
    # Extraction helpers
    # ------------------------------------------------------------------ #

    @staticmethod
    def _extract_category(q: str) -> str | None:
        # Longest-fragment-first so "food delivery" wins over "delivery".
        for fragment, category in sorted(_CATEGORY_FRAGMENTS.items(),
                                         key=lambda kv: -len(kv[0])):
            if fragment in q:
                return category
        # Fall back to exact canonical-name match.
        for category in list(_CATEGORY_FRAGMENTS.values()) + ["Other"]:
            if category.lower() in q:
                return category
        return None

    @staticmethod
    def _extract_search_term(q: str) -> str | None:
        """Pull the meaningful search term out of a question.

        Examples:
          "how much did i spend on swiggy"      -> "swiggy"
          "swiggy orders this month"            -> "swiggy orders"
          "total amount spent at amazon"        -> "amazon"
        """
        patterns = [
            r"spend\s+(?:on|at|in)?\s+(.+?)(?:\s+(?:this|last|previous|past|in|for|during)\b|$|\?|$)",
            r"paid\s+(?:to|at|for)?\s+(.+?)(?:\s+(?:this|last|previous|past)\b|$|\?|$)",
            r"spent\s+(?:on|at|in)?\s+(.+?)(?:\s+(?:this|last|previous|past)\b|$|\?|$)",
            r"how\s+much\s+(?:did\s+i|i)\s+(?:pay|spend)\s+(?:on|at|for)?\s*(.+)",
            r"on\s+(.+?)(?:\s+(?:this|last|previous|past|in|for|during)\b|$|\?|$)",
            r"at\s+(.+?)(?:\s+(?:this|last|previous|past|in|for|during)\b|$|\?|$)",
        ]
        for pat in patterns:
            m = re.search(pat, q)
            if m:
                term = m.group(1).strip().strip("?.,!")
                # Drop trailing period words.
                term = re.sub(r"\s+this\s+month\s*$", "", term)
                term = re.sub(r"\s+last\s+month\s*$", "", term)
                return term
        # Last resort: if the question is short (≤3 words) and has no
        # category match, treat it as a bare search term.
        if len(q.split()) <= 3 and not any(w in q for w in
                                           ("how", "what", "when", "where", "which")):
            return q
        return None

    @staticmethod
    def _top_merchants(df: pd.DataFrame, limit: int = 5) -> list[tuple[str, float]]:
        if df.empty:
            return []
        out: dict[str, float] = defaultdict(float)
        for _, row in df.iterrows():
            if row["amount"] < 0:
                out[str(row["description"])] += abs(float(row["amount"]))
        return sorted(out.items(), key=lambda kv: kv[1], reverse=True)[:limit]

    # ------------------------------------------------------------------ #
    # Fallback
    # ------------------------------------------------------------------ #

    def _suggestion_hint(self, question: str, idx: dict) -> dict:
        return {
            "question": question,
            "answer": (
                "I couldn't match that one. Try asking about a category "
                "(e.g. \"how much on Food Delivery\"), a period (e.g. "
                "\"this month\"), or your top merchant."
            ),
            "type": "unknown",
            "suggestions": self.get_suggested_questions(idx["df"].to_dict("records")),
        }

    def _unknown(self, question: str) -> dict:
        return {
            "question": question,
            "answer": "Please type a question.",
            "type": "unknown",
        }


# Global instance
_qa_system: FinanceQA | None = None


def get_qa_system() -> FinanceQA:
    global _qa_system
    if _qa_system is None:
        _qa_system = FinanceQA()
    return _qa_system

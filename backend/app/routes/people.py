"""People Ledger route — track who owes you and whom you owe.

Each entry is a single "I gave X to <person>" ("gave", they owe you) or
"I took X from <person>" ("took", you owe them) record. Entries are
standalone — not linked to the regular transactions list — so the ledger
stays self-contained and simple.

The summary endpoint aggregates per-person net balance:
    net = sum(gave amounts) - sum(took amounts)
    positive net  ->  they owe you
    negative net  ->  you owe them
Settled entries are excluded from the net so a fully-paid-back balance
reads as 0 and the card naturally drops off the "needs attention" list.
"""
from collections import defaultdict

from fastapi import APIRouter, HTTPException

from app.dependencies import get_storage
from app.models import PersonEntry, PersonEntryUpdate

router = APIRouter()

VALID_DIRECTIONS = {"gave", "took"}


def _validate_name(name: str) -> str:
    """Trim + reject empties; keep the original casing for display."""
    cleaned = (name or "").strip()
    if not cleaned:
        raise HTTPException(400, "Person name is required")
    if len(cleaned) > 80:
        raise HTTPException(400, "Person name is too long (max 80 chars)")
    return cleaned


def _validate_direction(direction: str) -> str:
    direction = (direction or "").strip().lower()
    if direction not in VALID_DIRECTIONS:
        raise HTTPException(400, "Direction must be 'gave' or 'took'")
    return direction


def _validate_amount(amount) -> float:
    try:
        value = float(amount)
    except (TypeError, ValueError):
        raise HTTPException(400, "Amount must be a number") from None
    if value <= 0:
        raise HTTPException(400, "Amount must be positive (direction carries the sign)")
    if value > 1_00_00_00_000:
        raise HTTPException(400, "Amount is too large")
    return round(value, 2)


def _validate_date(date: str) -> str:
    date = (date or "").strip()
    if not date or len(date) != 10 or date[4] != "-" or date[7] != "-":
        raise HTTPException(400, "Date must be in YYYY-MM-DD format")
    return date


@router.get("/")
async def list_entries():
    """Return every ledger entry, newest date first."""
    storage = get_storage()
    entries = await storage.all("people")
    # Sort by date desc, then created_at desc — most recent activity on top.
    entries.sort(key=lambda e: (e.get("date", ""), e.get("created_at", "")), reverse=True)
    return {"entries": entries}


@router.post("/")
async def create_entry(payload: PersonEntry):
    """Create a new ledger entry.

    The Pydantic model already has sensible defaults, so we just validate
    the bits that have real rules (positive amount, known direction, sane
    date) before persisting.
    """
    name = _validate_name(payload.person_name)
    direction = _validate_direction(payload.direction)
    amount = _validate_amount(payload.amount)
    date = _validate_date(payload.date)

    entry = PersonEntry(
        person_name=name,
        direction=direction,
        amount=amount,
        reason=(payload.reason or "").strip()[:200],
        date=date,
        settled=bool(payload.settled),
    )
    storage = get_storage()
    await storage.insert("people", entry.model_dump())
    return entry.model_dump()


@router.get("/summary")
async def summary():
    """Aggregate per-person net balance.

    Per-person net = sum(gave) - sum(took) over OPEN entries only. Settling
    an entry means "this specific debt is paid off" — it must stop
    contributing to the outstanding balance, or a fully-paid-back "gave 500"
    would keep showing as 500 owed forever. A separate open "took 200" on
    the same person still counts: settling the 500 leaves a net of -200
    (you owe them 200), not +300.

    The global `totals.to_receive` / `totals.to_give` are derived from
    per-person nets — NOT a naive sum-by-direction. That way a person who
    is both a creditor and a debtor (you gave them 500 and they gave you
    200 back) only contributes 300 to one side, never 500+200 spread
    across both.

    Returns:
        totals:  { to_receive, to_give, net } from per-person nets
        people:  list of { person_name, net, open_count, entries } for
                 people with at least one OPEN entry. People whose every
                 entry is settled disappear (but stay in `names` so the
                 add-entry autocomplete can still suggest them).
        names:   sorted list of every person who ever appeared
    """
    storage = get_storage()
    entries = await storage.all("people")

    by_person: dict[str, dict] = defaultdict(
        lambda: {"gave": 0.0, "took": 0.0, "open": 0, "entries": []}
    )
    all_names: set[str] = set()

    for e in entries:
        name = (e.get("person_name") or "").strip()
        if not name:
            continue
        all_names.add(name)
        direction = (e.get("direction") or "").strip().lower()
        try:
            amount = float(e.get("amount") or 0.0)
        except (TypeError, ValueError):
            amount = 0.0
        settled = bool(e.get("settled"))

        bucket = by_person[name]
        bucket["entries"].append(e)
        if not settled:
            bucket["open"] += 1
            # Only open entries count toward the balance — a settled entry
            # is a paid-off debt and must not keep weighing on the net.
            if direction == "gave":
                bucket["gave"] += amount
            elif direction == "took":
                bucket["took"] += amount

    people: list[dict] = []
    for name, b in by_person.items():
        net = round(b["gave"] - b["took"], 2)
        if b["open"] == 0:
            # Every entry settled — user has explicitly closed this person.
            # Keep on `names` (for autocomplete) but don't surface in the list.
            continue
        people.append(
            {
                "person_name": name,
                "net": net,
                "gave": round(b["gave"], 2),
                "took": round(b["took"], 2),
                "open_count": b["open"],
                "entries": sorted(
                    b["entries"],
                    key=lambda x: (x.get("date", ""), x.get("created_at", "")),
                    reverse=True,
                ),
            }
        )
    # Largest creditor first (you'll see the most pressing debt at the top),
    # then largest debitor, then alphabetical for ties.
    people.sort(key=lambda p: (-p["net"], p["person_name"].lower()))

    # Derive global totals from per-person net — guarantees consistency with
    # the per-person view (no double-counting when a person is on both sides).
    to_receive = round(sum(max(0.0, p["net"]) for p in people), 2)
    to_give = round(sum(max(0.0, -p["net"]) for p in people), 2)

    return {
        "totals": {
            "to_receive": to_receive,
            "to_give": to_give,
            "net": round(to_receive - to_give, 2),
        },
        "people": people,
        "names": sorted(all_names, key=str.lower),
    }


@router.put("/{entry_id}")
async def update_entry(entry_id: str, payload: PersonEntryUpdate):
    """Patch an entry. Any subset of fields can be updated; omitted ones
    are left alone (so "mark settled" is a single PUT with {settled: true})."""
    storage = get_storage()
    existing = await storage.get("people", entry_id)
    if not existing:
        raise HTTPException(404, "Entry not found")

    patch: dict = {}
    if payload.person_name is not None:
        patch["person_name"] = _validate_name(payload.person_name)
    if payload.direction is not None:
        patch["direction"] = _validate_direction(payload.direction)
    if payload.amount is not None:
        patch["amount"] = _validate_amount(payload.amount)
    if payload.reason is not None:
        patch["reason"] = (payload.reason or "").strip()[:200]
    if payload.date is not None:
        patch["date"] = _validate_date(payload.date)
    if payload.settled is not None:
        patch["settled"] = bool(payload.settled)

    if not patch:
        return existing

    updated = await storage.update("people", entry_id, patch)
    return updated


@router.delete("/{entry_id}")
async def delete_entry(entry_id: str):
    storage = get_storage()
    ok = await storage.delete("people", entry_id)
    if not ok:
        raise HTTPException(404, "Entry not found")
    return {"deleted": 1}

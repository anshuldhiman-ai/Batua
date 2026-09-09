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


@router.get("/settled")
async def get_settled():
    """Return people whose every entry is settled, with full transaction history.

    This endpoint is used for the dedicated Settled view. It returns:
    - People with zero open entries (all settled)
    - All their entries (both settled and would-be open)
    - Settlement metadata (total settled amount, last settlement date)

    Returns:
        people:  list of { person_name, total_settled, last_settled_date, entries }
    """
    storage = get_storage()
    entries = await storage.all("people")

    by_person: dict[str, dict] = defaultdict(
        lambda: {"gave": 0.0, "took": 0.0, "open": 0, "entries": [], "last_settled": None}
    )

    for e in entries:
        name = (e.get("person_name") or "").strip()
        if not name:
            continue
        direction = (e.get("direction") or "").strip().lower()
        try:
            amount = float(e.get("amount") or 0.0)
        except (TypeError, ValueError):
            amount = 0.0
        settled = bool(e.get("settled"))
        date = e.get("date", "")

        bucket = by_person[name]
        if direction == "gave":
            bucket["gave"] += amount
        elif direction == "took":
            bucket["took"] += amount
        bucket["entries"].append(e)
        if not settled:
            bucket["open"] += 1
        else:
            # Track the most recent settlement date
            if not bucket["last_settled"] or date > bucket["last_settled"]:
                bucket["last_settled"] = date

    settled_people: list[dict] = []
    for name, b in by_person.items():
        if b["open"] == 0 and len(b["entries"]) > 0:
            # Only include people with at least one entry and all settled
            total_settled = round(b["gave"] + b["took"], 2)
            settled_people.append(
                {
                    "person_name": name,
                    "total_settled": total_settled,
                    "last_settled_date": b["last_settled"],
                    "entries": sorted(
                        b["entries"],
                        key=lambda x: (x.get("date", ""), x.get("created_at", "")),
                        reverse=True,
                    ),
                }
            )

    # Sort by most recent settlement first
    settled_people.sort(key=lambda p: (p["last_settled_date"] or "", p["person_name"].lower()), reverse=True)

    return {"people": settled_people}


@router.post("/settled/{person_name}/restore")
async def restore_settlement(person_name: str):
    """Restore a settled person by unmarking all their entries as settled.

    This action brings the person back to the active People view with their
    original outstanding balance. No data is lost — only the settled flag
    is toggled.

    Args:
        person_name: The name of the person to restore

    Returns:
        updated: Count of entries that were restored
    """
    storage = get_storage()
    entries = await storage.all("people")

    # Find all entries for this person that are settled
    to_restore = []
    for e in entries:
        if (e.get("person_name") or "").strip().lower() == person_name.strip().lower():
            if bool(e.get("settled")):
                to_restore.append(e.get("id"))

    if not to_restore:
        raise HTTPException(404, "No settled entries found for this person")

    # Unmark all settled entries
    updated_count = 0
    for entry_id in to_restore:
        await storage.update("people", entry_id, {"settled": False})
        updated_count += 1

    return {"restored": updated_count}

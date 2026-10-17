"""MongoStorage behaviors that don't need a live MongoDB.

Covers two things the SQLite-backed suite can't reach:
- all(fields=...) must pass the projection to find(); the old code called the
  non-existent Cursor.projection(), which raised AttributeError on every call.
- mutate() must compare-and-swap on the snapshot it read, so a concurrent
  writer can't be silently overwritten (lost update).
"""
import copy

import pytest

from storage import MongoStorage


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs
        self._sort = None
        self._skip = 0
        self._limit = None

    def sort(self, key, direction):
        self._sort = (key, direction)
        return self

    def skip(self, n):
        self._skip = n
        return self

    def limit(self, n):
        self._limit = n
        return self

    async def to_list(self, length=None):
        docs = list(self._docs)
        if self._sort:
            key, direction = self._sort
            docs.sort(key=lambda d: d.get(key), reverse=(direction == -1))
        if self._skip:
            docs = docs[self._skip:]
        if self._limit is not None:
            docs = docs[: self._limit]
        return docs


class _FakeCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])
        self.find_projections = []
        self.cas_filters = []

    async def create_index(self, *args, **kwargs):
        return "idx"

    def find(self, query, projection):
        self.find_projections.append(projection)
        matched = [
            copy.deepcopy(d)
            for d in self.docs
            if all(d.get(k) == v for k, v in (query or {}).items())
        ]
        return _FakeCursor(matched)

    async def find_one(self, filter_, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in filter_.items()):
                out = copy.deepcopy(d)
                if projection and projection.get("_id") == 0:
                    out.pop("_id", None)
                return out
        return None

    async def find_one_and_update(self, filter_, update, return_document=True, projection=None):
        self.cas_filters.append(filter_)
        for i, d in enumerate(self.docs):
            if all(d.get(k) == v for k, v in filter_.items()):
                new = {**d, **update.get("$set", {})}
                self.docs[i] = new
                out = copy.deepcopy(new)
                if projection and projection.get("_id") == 0:
                    out.pop("_id", None)
                return out
        return None

    async def update_one(self, filter_, update):
        for i, d in enumerate(self.docs):
            if all(d.get(k) == v for k, v in filter_.items()):
                self.docs[i] = {**d, **update.get("$set", {})}


class _FakeDB:
    def __init__(self):
        self._collections = {}

    def __getitem__(self, name):
        return self._collections.setdefault(name, _FakeCollection())

    @property
    def transactions(self):
        return self["transactions"]


@pytest.mark.asyncio
async def test_all_with_fields_projects_via_find():
    db = _FakeDB()
    db["transactions"].docs = [
        {"id": "a", "_id": "mongo-a", "date": "2026-01-01", "amount": -10.0, "notes": "x"},
    ]
    storage = MongoStorage(client=None, db=db)

    rows = await storage.all("transactions", fields=["id", "date", "amount"])

    projections = db["transactions"].find_projections
    assert projections, "find() should have been called with a projection"
    proj = projections[0]
    assert proj["_id"] == 0
    assert proj["id"] == 1 and proj["date"] == 1 and proj["amount"] == 1
    assert rows and rows[0]["id"] == "a"


@pytest.mark.asyncio
async def test_mutate_compare_and_swaps_on_snapshot():
    db = _FakeDB()
    db["users"].docs = [{"id": "u1", "_id": "mongo-u1", "attempts": 1}]
    storage = MongoStorage(client=None, db=db)

    out = await storage.mutate("users", "u1", lambda a: a.update(attempts=2))

    assert out["attempts"] == 2
    filt = db["users"].cas_filters[0]
    # The filter guards on the snapshot, not just the id.
    assert filt["id"] == "u1"
    assert filt["attempts"] == 1


@pytest.mark.asyncio
async def test_mutate_retries_after_concurrent_change():
    db = _FakeDB()
    col = db["users"]
    col.docs = [{"id": "u1", "_id": "mongo-u1", "attempts": 1}]
    storage = MongoStorage(client=None, db=db)

    real_cas = col.find_one_and_update
    calls = {"n": 0}

    async def racing_cas(filter_, update, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            # A concurrent writer bumps the doc; our snapshot no longer matches.
            col.docs[0] = {**col.docs[0], "attempts": 99}
            return None
        return await real_cas(filter_, update, **kwargs)

    col.find_one_and_update = racing_cas

    out = await storage.mutate("users", "u1", lambda a: a.update(attempts=a.get("attempts", 0) + 1))

    assert calls["n"] == 2  # first attempt conflicted, second succeeded
    assert out["attempts"] == 100

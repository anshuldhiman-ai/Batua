"""Regression tests for the in-memory TTL cache.

Locks in the per-key TTL override (previously computed but never stored, so
every entry expired at the default regardless of the ttl passed to set()), and
the size bound: a TTL alone does not bound memory when custom date-range
queries mint a fresh key per request.
"""
from app.cache import Cache


def test_per_key_ttl_is_honored(monkeypatch):
    clock = {"t": 1000.0}
    monkeypatch.setattr("app.cache.time.time", lambda: clock["t"])

    c = Cache(default_ttl=20)
    c.set("short", "a", ttl=5)
    c.set("long", "b", ttl=300)

    # t+10s: short (ttl=5) expired, long (ttl=300) still alive.
    clock["t"] = 1010.0
    assert c.get("short") is None
    assert c.get("long") == "b"

    # t+301s: long now expired too.
    clock["t"] = 1301.0
    assert c.get("long") is None


def test_default_ttl_used_when_unspecified(monkeypatch):
    clock = {"t": 0.0}
    monkeypatch.setattr("app.cache.time.time", lambda: clock["t"])

    c = Cache(default_ttl=20)
    c.set("k", "v")
    clock["t"] = 19.0
    assert c.get("k") == "v"
    clock["t"] = 21.0
    assert c.get("k") is None


def test_invalidate_and_clear():
    c = Cache(default_ttl=20)
    c.set("a", 1)
    c.set("b", 2)
    c.invalidate("a")
    assert c.get("a") is None
    assert c.get("b") == 2
    c.clear()
    assert c.get("b") is None


# --------------------------------------------------------------------------- #
# Size bound — the reason a TTL alone is not enough
# --------------------------------------------------------------------------- #

def test_cache_never_exceeds_max_size(monkeypatch):
    """Custom date-range queries mint a new key per request, so an unbounded
    dict grew for as long as the process lived."""
    clock = {"t": 0.0}
    monkeypatch.setattr("app.cache.time.time", lambda: clock["t"])

    c = Cache(default_ttl=60, max_size=10)
    for i in range(1000):
        c.set(f"summary_2026-01-01_2026-01-{i}", i)

    assert len(c) == 10
    # Only the 10 most recent keys survive.
    assert c.get("summary_2026-01-01_2026-01-999") == 999
    assert c.get("summary_2026-01-01_2026-01-0") is None


def test_eviction_is_least_recently_used(monkeypatch):
    clock = {"t": 0.0}
    monkeypatch.setattr("app.cache.time.time", lambda: clock["t"])

    c = Cache(default_ttl=60, max_size=3)
    c.set("a", 1)
    c.set("b", 2)
    c.set("c", 3)

    # Touch "a" so "b" becomes the coldest entry.
    assert c.get("a") == 1
    c.set("d", 4)

    assert c.get("b") is None, "least-recently-used entry was not evicted"
    assert c.get("a") == 1
    assert c.get("c") == 3
    assert c.get("d") == 4


def test_expired_entries_are_purged_on_write(monkeypatch):
    """Expired entries must not occupy the cache waiting to be looked up.

    Before this, a key that was never read again stayed resident forever — the
    TTL only took effect if something happened to call get() on it.
    """
    clock = {"t": 0.0}
    monkeypatch.setattr("app.cache.time.time", lambda: clock["t"])

    c = Cache(default_ttl=20, max_size=100)
    for i in range(50):
        c.set(f"dead-{i}", i)
    assert len(c) == 50

    clock["t"] = 100.0  # every one of the 50 has now lapsed
    c.set("fresh", "v")

    assert len(c) == 1
    assert c.get("fresh") == "v"
    assert c.get("dead-0") is None


def test_max_size_is_always_at_least_one():
    assert Cache(max_size=0).max_size == 1
    assert Cache(max_size=-5).max_size == 1


def test_concurrent_get_does_not_raise_keyerror():
    """Two coroutines reading the same lapsed key used to race on the
    check-then-delete and one raised KeyError (intermittent 500s)."""
    import threading

    c = Cache(default_ttl=0, max_size=64)
    errors: list[BaseException] = []

    def hammer():
        try:
            for _ in range(200):
                c.get("hot")
        except BaseException as exc:  # noqa: BLE001 - the point is to catch any
            errors.append(exc)

    threads = [threading.Thread(target=hammer) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == []

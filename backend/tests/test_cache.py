"""Regression tests for the in-memory TTL cache.

Locks in the fix for the per-key TTL override that was previously computed
but never stored, so every entry expired at the 20s default regardless of
the ttl passed to set().
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

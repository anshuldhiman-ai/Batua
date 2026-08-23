"""Tests for the Gemini REST wrapper's credential handling.

The API key must travel in the ``x-goog-api-key`` header and never in the
query string: a URL-embedded key is copied verbatim into access logs, proxy
logs, and any traceback that echoes the request URL.
"""
from unittest.mock import patch

import ai


class _Resp:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.headers = {"content-type": "application/json"}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise AssertionError(f"HTTP {self.status_code}")


def test_validate_key_sends_key_as_header_not_query():
    calls = {}

    def fake_get(url, **kwargs):
        calls["url"] = url
        calls["headers"] = kwargs.get("headers") or {}
        return _Resp(200)

    with patch.object(ai.requests, "get", fake_get):
        valid, reason, _msg = ai.validate_key("secret-key-123")

    assert (valid, reason) == (True, "ok")
    assert calls["headers"].get("x-goog-api-key") == "secret-key-123"
    assert "secret-key-123" not in calls["url"]
    assert "key=" not in calls["url"]


def test_post_sends_key_as_header_not_query():
    calls = {}

    def fake_post(url, **kwargs):
        calls["url"] = url
        calls["headers"] = kwargs.get("headers") or {}
        return _Resp(200, {"candidates": []})

    with patch.object(ai, "_API_KEY", "secret-key-456"), \
         patch.object(ai.requests, "post", fake_post):
        out = ai._post("models/gemini-2.5-flash:generateContent", {"contents": []})

    assert out == {"candidates": []}
    assert calls["headers"].get("x-goog-api-key") == "secret-key-456"
    assert "secret-key-456" not in calls["url"]
    assert "key=" not in calls["url"]


def test_post_short_circuits_without_a_key():
    """No key configured → no network call at all."""
    def exploding_post(*_a, **_kw):
        raise AssertionError("should not hit the network without a key")

    with patch.object(ai, "_API_KEY", ""), \
         patch.object(ai.requests, "post", exploding_post):
        assert ai._post("models/x:generateContent", {}) is None


def test_invalid_key_response_is_authoritative():
    """A 401 must be reported as invalid_key and not retried into a pass."""
    with patch.object(ai.requests, "get", lambda url, **kw: _Resp(401, {"error": {"message": "bad key"}})):
        valid, reason, msg = ai.validate_key("nope")

    assert valid is False
    assert reason == "invalid_key"
    assert "bad key" in msg

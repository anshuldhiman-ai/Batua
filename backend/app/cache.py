"""Simple in-memory cache with TTL + size bound for analytics data."""
import time
import threading
from typing import Any, Optional
from collections import OrderedDict, defaultdict


class Cache:
    """In-memory cache with TTL support and a hard entry-count ceiling.

    Bounded two ways, because a TTL alone does not bound memory:

    * **Proactive expiry** — ``set`` drops entries whose TTL has already lapsed
      instead of waiting for someone to look them up. Without this a key that is
      never read again (the common case for one-off custom date-range queries)
      stays resident forever.
    * **LRU eviction** — once ``max_size`` entries are live, inserting evicts the
      least-recently-used one. Every distinct ``?start=…&end=…`` pair is a new
      key, so a user paging through the range picker would otherwise grow this
      dict without limit.

    The previous implementation took no lock, so the check-then-delete in
    ``get`` could race and raise ``KeyError`` under concurrent requests.
    """

    def __init__(self, default_ttl: int = 20, max_size: int = 256):
        """Initialize cache with a default TTL in seconds and an entry ceiling."""
        self._store: "OrderedDict[str, tuple[float, int, Any]]" = OrderedDict()
        self.default_ttl = default_ttl
        self.max_size = max(1, max_size)
        self._lock = threading.RLock()

    def _purge_expired(self, now: float) -> None:
        """Drop every entry whose TTL has lapsed. Caller must hold the lock."""
        expired = [
            key for key, (ts, ttl, _) in self._store.items() if now - ts > ttl
        ]
        for key in expired:
            self._store.pop(key, None)

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if it exists and hasn't expired."""
        now = time.time()
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None

            timestamp, ttl, value = entry
            if now - timestamp > ttl:
                self._store.pop(key, None)
                return None

            # Refresh recency so a hot key survives the next eviction.
            self._store.move_to_end(key)
            return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache with optional TTL override."""
        ttl = ttl if ttl is not None else self.default_ttl
        now = time.time()
        with self._lock:
            self._purge_expired(now)
            self._store[key] = (now, ttl, value)
            self._store.move_to_end(key)
            # Newest at the warm end; drop from the cold end until under the cap.
            while len(self._store) > self.max_size:
                self._store.popitem(last=False)

    def invalidate(self, key: str) -> None:
        """Invalidate a specific cache key."""
        with self._lock:
            self._store.pop(key, None)

    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            self._store.clear()

    def __len__(self) -> int:
        """Number of entries currently resident (expired ones included)."""
        with self._lock:
            return len(self._store)


# Global cache instance
_analytics_cache = Cache(default_ttl=60, max_size=256)  # 60s TTL for tab switching


def get_cache() -> Cache:
    """Get the global analytics cache."""
    return _analytics_cache


def invalidate_analytics_cache() -> None:
    """Invalidate all analytics cache entries when transactions change.

    Called after any insert/update/delete so the next /dashboard/metrics or
    /analytics/timeline call rebuilds from scratch. Also drops the
    insights cache so the user immediately sees fresh coaching lines.
    """
    _analytics_cache.clear()


def pre_bucket_transactions(txns: list[dict]) -> dict[str, dict]:
    """Pre-bucket transactions by month to avoid multiple iterations.
    
    Returns: {month: {"income": float, "expense": float, "investments": float}}
    """
    by_month: dict[str, dict] = defaultdict(lambda: {"income": 0.0, "expense": 0.0, "investments": 0.0})
    
    for t in txns:
        date_str = t.get("date", "")
        if not date_str or len(date_str) < 7:
            continue
        
        month = date_str[:7]  # YYYY-MM
        amount = t.get("amount", 0)
        
        if amount > 0:
            by_month[month]["income"] += amount
        else:
            by_month[month]["expense"] += -amount
            if t.get("category") == "Investments":
                by_month[month]["investments"] += -amount
    
    return dict(by_month)

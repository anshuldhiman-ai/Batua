"""Simple in-memory cache with TTL for analytics data."""
import time
from typing import Any, Optional
from collections import defaultdict


class Cache:
    """Simple in-memory cache with TTL support."""
    
    def __init__(self, default_ttl: int = 20):
        """Initialize cache with default TTL in seconds."""
        self._store: dict[str, tuple[float, int, Any]] = {}
        self.default_ttl = default_ttl

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if it exists and hasn't expired."""
        if key not in self._store:
            return None

        timestamp, ttl, value = self._store[key]
        if time.time() - timestamp > ttl:
            del self._store[key]
            return None

        return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache with optional TTL override."""
        ttl = ttl if ttl is not None else self.default_ttl
        self._store[key] = (time.time(), ttl, value)
    
    def invalidate(self, key: str) -> None:
        """Invalidate a specific cache key."""
        if key in self._store:
            del self._store[key]
    
    def clear(self) -> None:
        """Clear all cache entries."""
        self._store.clear()


# Global cache instance
_analytics_cache = Cache(default_ttl=60)  # 60 second TTL for better tab switching performance


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

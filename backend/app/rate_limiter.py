"""In-memory sliding-window rate limiter for sensitive API routes.

Provides IP-based and account-based protection against brute-force attacks
and resource exhaustion. Designed for both self-hosted and cloud deployments.
"""
from __future__ import annotations

import time
from collections import defaultdict
from typing import Dict, List
from fastapi import HTTPException, Request

# Storage: key -> list of timestamp epochs
_rate_limits: Dict[str, List[float]] = defaultdict(list)


def _client_ip(request: Request) -> str:
    """Extract client IP, inspecting trusted proxy headers when present."""
    # If deployed behind reverse proxy (Render, Fly, Nginx), CF-Connecting-IP
    # or the first trusted hop from X-Forwarded-For is extracted.
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip.strip()
    xfwd = request.headers.get("X-Forwarded-For")
    if xfwd:
        # Take the leftmost untampered client IP
        return xfwd.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


def check_rate_limit(
    request: Request,
    scope: str,
    max_requests: int,
    window_seconds: int,
) -> None:
    """Enforce a sliding-window rate limit on a request scope.

    Raises HTTPException(429) if the limit is exceeded.
    """
    ip = _client_ip(request)
    key = f"{scope}:{ip}"
    now = time.time()
    cutoff = now - window_seconds

    # Evict timestamps outside the window
    timestamps = [ts for ts in _rate_limits[key] if ts > cutoff]
    if len(timestamps) >= max_requests:
        retry_after = int(timestamps[0] + window_seconds - now) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests for {scope}. Please try again in {retry_after} seconds.",
            headers={"Retry-After": str(max(1, retry_after))},
        )

    timestamps.append(now)
    _rate_limits[key] = timestamps


def reset_rate_limit(request: Request, scope: str) -> None:
    """Clear rate limit for a scope (e.g. on successful login)."""
    ip = _client_ip(request)
    key = f"{scope}:{ip}"
    _rate_limits.pop(key, None)

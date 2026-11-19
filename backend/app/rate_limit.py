from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
import math
import threading
import time

from fastapi import HTTPException, Request, status

from app.config import get_settings


class SlidingWindowRateLimiter:
    """Thread-safe in-memory sliding-window rate limiter keyed by (bucket, client_ip)."""

    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def check(self, bucket: str, client_ip: str, max_requests: int, window_seconds: int) -> tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - window_seconds
        key = (bucket, client_ip)
        with self._lock:
            timestamps = self._hits[key]
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            if len(timestamps) >= max_requests:
                retry_after = max(1, math.ceil(timestamps[0] + window_seconds - now))
                return False, retry_after
            timestamps.append(now)
            return True, 0


rate_limiter = SlidingWindowRateLimiter()


def _extract_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        first_ip = forwarded_for.split(",", 1)[0].strip()
        if first_ip:
            return first_ip
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def rate_limit(bucket: str, max_requests: int, window_seconds: int = 60) -> Callable[[Request], Awaitable[None]]:
    """Build a FastAPI dependency that enforces an IP-scoped sliding-window limit."""

    async def _enforce_rate_limit(request: Request) -> None:
        if not get_settings().RATE_LIMIT_ENABLED:
            return
        client_ip = _extract_client_ip(request)
        allowed, retry_after = rate_limiter.check(bucket, client_ip, max_requests, window_seconds)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
                headers={"Retry-After": str(retry_after)},
            )

    return _enforce_rate_limit

from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
import logging
import math
import threading
import time
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request, status

from app.config import get_settings

logger = logging.getLogger(__name__)
_REDIS_RETRY_COOLDOWN_SECONDS = 30.0


class SlidingWindowRateLimiter:
    """Distributed Redis sliding-window rate limiter with automatic thread-safe in-memory fallback."""

    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._redis_url_cached = ""
        self._redis_client: Any = None
        self._redis_retry_after = 0.0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
            self._redis_retry_after = 0.0

    def _get_redis_client(self) -> Any | None:
        redis_url = (get_settings().REDIS_URL or "").strip()
        if not redis_url or time.monotonic() < self._redis_retry_after:
            return None

        with self._lock:
            if self._redis_client is not None and self._redis_url_cached == redis_url:
                return self._redis_client
            try:
                import redis  # noqa: PLC0415

                client = redis.Redis.from_url(
                    redis_url,
                    decode_responses=True,
                    socket_connect_timeout=0.5,
                    socket_timeout=0.5,
                )
                self._redis_client = client
                self._redis_url_cached = redis_url
                return client
            except Exception as exc:
                self._redis_retry_after = time.monotonic() + _REDIS_RETRY_COOLDOWN_SECONDS
                logger.warning("Redis unavailable for rate limiter, falling back to RAM window: %s", exc)
                return None

    def _check_redis(
        self,
        client: Any,
        bucket: str,
        client_ip: str,
        max_requests: int,
        window_seconds: int,
    ) -> tuple[bool, int]:
        now = time.time()
        cutoff = now - window_seconds
        redis_key = f"greentrip:rl:{bucket}:{client_ip}"
        pipe = client.pipeline(transaction=True)
        pipe.zremrangebyscore(redis_key, "-inf", cutoff)
        pipe.zcard(redis_key)
        pipe.zrange(redis_key, 0, 0, withscores=True)
        _, current_count, oldest_items = pipe.execute()

        if int(current_count) >= max_requests:
            oldest_score = float(oldest_items[0][1]) if oldest_items else now
            retry_after = max(1, math.ceil(oldest_score + window_seconds - now))
            return False, retry_after

        member = f"{now}:{uuid4().hex[:8]}"
        write_pipe = client.pipeline(transaction=True)
        write_pipe.zadd(redis_key, {member: now})
        write_pipe.expire(redis_key, int(window_seconds) + 5)
        write_pipe.execute()
        return True, 0

    def check(self, bucket: str, client_ip: str, max_requests: int, window_seconds: int) -> tuple[bool, int]:
        client = self._get_redis_client()
        if client is not None:
            try:
                return self._check_redis(client, bucket, client_ip, max_requests, window_seconds)
            except Exception as exc:
                self._redis_retry_after = time.monotonic() + _REDIS_RETRY_COOLDOWN_SECONDS
                logger.warning("Redis rate limiter failed, switching to RAM fallback: %s", exc)

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

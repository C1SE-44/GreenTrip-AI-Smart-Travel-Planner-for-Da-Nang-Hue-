from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from typing import Any, Literal

from app.config import get_settings

logger = logging.getLogger(__name__)

_REDIS_RETRY_COOLDOWN_SECONDS = 30.0
_MAX_MEMORY_ENTRIES = 512
_POI_VERSION_KEY = "greentrip:pois:version"


class CacheBackend:
    """Versioned Cache-Aside wrapper using Redis when configured, with automatic in-memory fallback."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._memory_store: dict[str, tuple[float, str]] = {}
        self._memory_version = 1
        self._redis_url_cached = ""
        self._redis_client: Any = None
        self._redis_retry_after = 0.0

    def _get_redis_client(self) -> Any | None:
        settings = get_settings()
        redis_url = (settings.REDIS_URL or "").strip()
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
                logger.warning("Redis unavailable for cache, falling back to in-memory TTL cache: %s", exc)
                return None

    def _mark_redis_down(self, exc: Exception) -> None:
        self._redis_retry_after = time.monotonic() + _REDIS_RETRY_COOLDOWN_SECONDS
        logger.warning("Redis operation failed, temporarily using in-memory fallback: %s", exc)

    def backend_mode(self) -> Literal["redis", "memory"]:
        return "redis" if self._get_redis_client() is not None else "memory"

    def get_poi_namespace_version(self) -> int:
        client = self._get_redis_client()
        if client is not None:
            try:
                raw = client.get(_POI_VERSION_KEY)
                return int(raw) if raw is not None else 1
            except Exception as exc:
                self._mark_redis_down(exc)
        with self._lock:
            return self._memory_version

    def invalidate_pois(self) -> int:
        """O(1) non-blocking global invalidation via version bump (never uses KEYS *)."""
        with self._lock:
            self._memory_store.clear()
            self._memory_version += 1
            next_version = self._memory_version

        client = self._get_redis_client()
        if client is not None:
            try:
                return int(client.incr(_POI_VERSION_KEY))
            except Exception as exc:
                self._mark_redis_down(exc)
        return next_version

    def build_pois_cache_key(self, prefix: str, params: dict[str, Any]) -> str:
        version = self.get_poi_namespace_version()
        canonical = json.dumps(params, sort_keys=True, ensure_ascii=False, default=str)
        digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:24]
        return f"greentrip:pois:v{version}:{prefix}:{digest}"

    def get_json(self, key: str) -> dict[str, Any] | None:
        client = self._get_redis_client()
        if client is not None:
            try:
                raw = client.get(key)
                if raw is None:
                    return None
                parsed = json.loads(raw)
                return parsed if isinstance(parsed, dict) else None
            except Exception as exc:
                self._mark_redis_down(exc)

        now = time.monotonic()
        with self._lock:
            entry = self._memory_store.get(key)
            if entry is None:
                return None
            expires_at, payload = entry
            if now >= expires_at:
                self._memory_store.pop(key, None)
                return None
            try:
                parsed = json.loads(payload)
                return parsed if isinstance(parsed, dict) else None
            except Exception:
                self._memory_store.pop(key, None)
                return None

    def set_json(self, key: str, value: dict[str, Any], ttl_seconds: int) -> None:
        serialized = json.dumps(value, ensure_ascii=False, default=str)
        ttl = max(1, int(ttl_seconds))

        client = self._get_redis_client()
        if client is not None:
            try:
                client.setex(key, ttl, serialized)
                return
            except Exception as exc:
                self._mark_redis_down(exc)

        expires_at = time.monotonic() + ttl
        with self._lock:
            if len(self._memory_store) >= _MAX_MEMORY_ENTRIES:
                # Evict earliest-expiring key without blocking
                oldest_key = min(self._memory_store, key=lambda k: self._memory_store[k][0])
                self._memory_store.pop(oldest_key, None)
            self._memory_store[key] = (expires_at, serialized)

    def reset(self) -> None:
        with self._lock:
            self._memory_store.clear()
            self._memory_version = 1
            self._redis_retry_after = 0.0


poi_cache = CacheBackend()

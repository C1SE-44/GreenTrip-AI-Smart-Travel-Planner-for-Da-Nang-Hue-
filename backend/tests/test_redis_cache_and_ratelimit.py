"""Unit and integration tests for Phase 7: Cache-Aside (X-Cache), Redis Sliding Window, and Background Email."""
from pathlib import Path
import sys
from unittest.mock import patch
import uuid

from fastapi.testclient import TestClient
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.auth.service import create_access_token  # noqa: E402
from app.cache import CacheBackend, poi_cache  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db.postgres import get_connection  # noqa: E402
from app.main import app  # noqa: E402
from app.pois.schemas import (  # noqa: E402
    ExplanationFact,
    ExplanationPOI,
    PaginatedPOIResponse,
    PaginationMetadata,
    POIExplanationFactsResponse,
    POIResponse,
)
from app.rate_limit import SlidingWindowRateLimiter  # noqa: E402

client = TestClient(app)


class _FakeRedisClient:
    """In-memory subset of redis.Redis covering string TTL + sorted-set sliding window commands."""

    def __init__(self) -> None:
        self.kv: dict[str, str] = {}
        self.ttls: dict[str, int] = {}
        self.zsets: dict[str, dict[str, float]] = {}

    def get(self, key: str) -> str | None:
        return self.kv.get(key)

    def setex(self, key: str, ttl: int, value: str) -> bool:
        self.kv[key] = value
        self.ttls[key] = ttl
        return True

    def incr(self, key: str) -> int:
        next_val = int(self.kv.get(key, "1")) + 1 if key in self.kv else 2
        self.kv[key] = str(next_val)
        return next_val

    def pipeline(self, transaction: bool = True) -> "_FakePipeline":
        return _FakePipeline(self)


class _FakePipeline:
    def __init__(self, parent: _FakeRedisClient) -> None:
        self.parent = parent
        self.ops: list[tuple[str, tuple[object, ...]]] = []

    def zremrangebyscore(self, key: str, _min: object, max_score: float) -> "_FakePipeline":
        self.ops.append(("zrem", (key, max_score)))
        return self

    def zcard(self, key: str) -> "_FakePipeline":
        self.ops.append(("zcard", (key,)))
        return self

    def zrange(self, key: str, start: int, stop: int, withscores: bool = False) -> "_FakePipeline":
        self.ops.append(("zrange", (key, start, stop, withscores)))
        return self

    def zadd(self, key: str, mapping: dict[str, float]) -> "_FakePipeline":
        self.ops.append(("zadd", (key, mapping)))
        return self

    def expire(self, key: str, ttl: int) -> "_FakePipeline":
        self.ops.append(("expire", (key, ttl)))
        return self

    def execute(self) -> list[object]:
        results: list[object] = []
        for op, args in self.ops:
            if op == "zrem":
                key, max_score = args[0], float(args[1])  # type: ignore[arg-type]
                zset = self.parent.zsets.setdefault(str(key), {})
                removed = [m for m, s in zset.items() if s <= max_score]
                for m in removed:
                    del zset[m]
                results.append(len(removed))
            elif op == "zcard":
                zset = self.parent.zsets.get(str(args[0]), {})
                results.append(len(zset))
            elif op == "zrange":
                zset = self.parent.zsets.get(str(args[0]), {})
                ordered = sorted(zset.items(), key=lambda kv: kv[1])
                results.append(ordered[:1])
            elif op == "zadd":
                key = str(args[0])
                mapping = args[1]
                zset = self.parent.zsets.setdefault(key, {})
                if isinstance(mapping, dict):
                    zset.update(mapping)
                results.append(1)
            elif op == "expire":
                results.append(True)
        self.ops.clear()
        return results


def test_get_pois_cache_aside_miss_hit_and_invalidation() -> None:
    sample_page = PaginatedPOIResponse(
        items=[
            POIResponse(
                id="poi-cache-1",
                name="Bảo Tàng Cache Test",
                category="Di tích lịch sử và văn hóa",
                latitude=16.06,
                longitude=108.22,
                city="Đà Nẵng",
            )
        ],
        pagination=PaginationMetadata(
            page=1,
            limit=10,
            total=1,
            total_pages=1,
            has_next=False,
            has_previous=False,
        ),
    )

    calls = 0

    def fake_get_poi_page(**_kwargs: object) -> PaginatedPOIResponse:
        nonlocal calls
        calls += 1
        return sample_page

    with patch("app.pois.router.get_poi_page", side_effect=fake_get_poi_page):
        r1 = client.get("/pois?city=Đà Nẵng&page=1&limit=10")
        assert r1.status_code == 200
        assert r1.headers.get("x-cache") == "MISS"
        assert calls == 1

        # Second identical call hits Cache-Aside and skips DB repository completely
        r2 = client.get("/pois?city=Đà Nẵng&page=1&limit=10")
        assert r2.status_code == 200
        assert r2.headers.get("x-cache") == "HIT"
        assert calls == 1

        # O(1) version bump invalidates stale cache entries cleanly
        poi_cache.invalidate_pois()
        r3 = client.get("/pois?city=Đà Nẵng&page=1&limit=10")
        assert r3.status_code == 200
        assert r3.headers.get("x-cache") == "MISS"
        assert calls == 2


def test_get_explanation_facts_uses_cache_aside() -> None:
    facts_payload = POIExplanationFactsResponse(
        poi=ExplanationPOI(id="poi-kg-1", name="Chùa Thiên Mụ", is_local_business=False, source="neo4j"),
        facts=[ExplanationFact(relationship="LOCATED_IN", target_type="City", target_key="hue", target_name="Huế")],
    )
    calls = 0

    def fake_explain(_poi_id: str) -> POIExplanationFactsResponse:
        nonlocal calls
        calls += 1
        return facts_payload

    with patch("app.pois.router.get_poi_explanation_facts", side_effect=fake_explain):
        r1 = client.get("/pois/poi-kg-1/explanation-facts")
        assert r1.status_code == 200
        assert r1.headers.get("x-cache") == "MISS"
        assert calls == 1

        r2 = client.get("/pois/poi-kg-1/explanation-facts")
        assert r2.status_code == 200
        assert r2.headers.get("x-cache") == "HIT"
        assert calls == 1


def test_admin_patch_poi_invalidates_public_poi_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", " ")
    get_settings.cache_clear()

    admin_id = str(uuid.uuid4())
    poi_id = str(uuid.uuid4())
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO public.users (user_id, full_name, email, role, status) VALUES (%s, %s, %s, 'ADMIN', 'ACTIVE')",
                (admin_id, "Cache Admin", f"cache-admin-{uuid.uuid4().hex[:8]}@example.com"),
            )
            cur.execute(
                "INSERT INTO public.pois (poi_id, name, estimated_cost, is_active) VALUES (%s, %s, 50000, 1)",
                (poi_id, "POI Cache Invalidate Test"),
            )
        conn.commit()

    try:
        initial_version = poi_cache.get_poi_namespace_version()
        headers = {"Authorization": f"Bearer {create_access_token(admin_id, role='ADMIN')}"}
        res = client.patch(f"/admin/pois/{poi_id}", headers=headers, json={"estimated_cost": 90000.0})
        assert res.status_code == 200
        assert poi_cache.get_poi_namespace_version() > initial_version
    finally:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM public.admin_audit_logs WHERE target_id = %s", (poi_id,))
                cur.execute("DELETE FROM public.pois WHERE poi_id = %s", (poi_id,))
                cur.execute("DELETE FROM public.users WHERE user_id = %s", (admin_id,))
            conn.commit()


def test_redis_cache_and_sliding_window_with_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_redis = _FakeRedisClient()
    cache = CacheBackend()
    monkeypatch.setattr(cache, "_get_redis_client", lambda: fake_redis)

    k1 = cache.build_pois_cache_key("list", {"page": 1})
    cache.set_json(k1, {"hello": "world"}, ttl_seconds=60)
    assert cache.get_json(k1) == {"hello": "world"}
    assert cache.invalidate_pois() == 2
    k2 = cache.build_pois_cache_key("list", {"page": 1})
    assert k2 != k1
    assert cache.get_json(k2) is None

    limiter = SlidingWindowRateLimiter()
    monkeypatch.setattr(limiter, "_get_redis_client", lambda: fake_redis)
    assert limiter.check("api_test", "1.2.3.4", max_requests=2, window_seconds=60)[0] is True
    assert limiter.check("api_test", "1.2.3.4", max_requests=2, window_seconds=60)[0] is True
    allowed, retry_after = limiter.check("api_test", "1.2.3.4", max_requests=2, window_seconds=60)
    assert allowed is False
    assert retry_after >= 1

    # Simulate Redis failure -> seamless fallback to in-memory sliding window without crash
    def _boom() -> object:
        class _Broken:
            def pipeline(self, transaction: bool = True) -> None:
                raise ConnectionError("redis down")

        return _Broken()

    monkeypatch.setattr(limiter, "_get_redis_client", _boom)
    assert limiter.check("api_fallback", "5.6.7.8", max_requests=1, window_seconds=60)[0] is True
    assert limiter.check("api_fallback", "5.6.7.8", max_requests=1, window_seconds=60)[0] is False

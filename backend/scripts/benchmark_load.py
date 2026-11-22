"""Async concurrent load benchmark for GreenTrip AI public read endpoints (Cache MISS vs HIT)."""
from __future__ import annotations

import argparse
import asyncio
import statistics
import time

import httpx


async def run_benchmark(base_url: str, endpoint: str, total_requests: int, concurrency: int) -> int:
    url = f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"
    limits = httpx.Limits(max_connections=max(20, concurrency * 2), max_keepalive_connections=concurrency)

    async with httpx.AsyncClient(timeout=20.0, limits=limits) as client:
        t0 = time.perf_counter()
        cold_resp = await client.get(url)
        cold_ms = (time.perf_counter() - t0) * 1000.0
        cold_cache = cold_resp.headers.get("X-Cache", "NONE")

        semaphore = asyncio.Semaphore(concurrency)
        latencies_ms: list[float] = []
        cache_hits = 0
        errors = 0

        async def _worker() -> None:
            nonlocal cache_hits, errors
            async with semaphore:
                start = time.perf_counter()
                try:
                    resp = await client.get(url)
                    elapsed_ms = (time.perf_counter() - start) * 1000.0
                    latencies_ms.append(elapsed_ms)
                    if resp.status_code != 200:
                        errors += 1
                    elif resp.headers.get("X-Cache", "").upper() == "HIT":
                        cache_hits += 1
                except Exception:
                    errors += 1

        wall_start = time.perf_counter()
        await asyncio.gather(*(_worker() for _ in range(total_requests)))
        wall_sec = max(0.001, time.perf_counter() - wall_start)

    latencies_ms.sort()
    p50 = statistics.median(latencies_ms) if latencies_ms else 0.0
    p95 = latencies_ms[min(len(latencies_ms) - 1, int(len(latencies_ms) * 0.95))] if latencies_ms else 0.0
    p99 = latencies_ms[min(len(latencies_ms) - 1, int(len(latencies_ms) * 0.99))] if latencies_ms else 0.0
    throughput = total_requests / wall_sec

    print("=== GREENTRIP API LOAD BENCHMARK ===")
    print(f"Target URL       : {url}")
    print(f"Cold Request     : status={cold_resp.status_code} X-Cache={cold_cache} latency={cold_ms:.2f} ms")
    print(f"Concurrent Warm  : requests={total_requests} concurrency={concurrency} errors={errors}")
    print(f"Warm Cache HITs  : {cache_hits}/{total_requests} ({(cache_hits / max(1, total_requests)) * 100:.1f}%)")
    print(f"Warm Latency     : p50={p50:.2f} ms | p95={p95:.2f} ms | p99={p99:.2f} ms")
    print(f"Throughput       : {throughput:.1f} req/s (total {wall_sec:.2f} s)")
    return 0 if errors == 0 else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark GreenTrip API read throughput and X-Cache latency.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Backend API base URL.")
    parser.add_argument("--endpoint", default="/pois?page=1&limit=100", help="Endpoint to benchmark.")
    parser.add_argument("--requests", type=int, default=120, help="Total concurrent requests.")
    parser.add_argument("--concurrency", type=int, default=20, help="Concurrent worker count.")
    args = parser.parse_args()
    return asyncio.run(run_benchmark(args.base_url, args.endpoint, args.requests, args.concurrency))


if __name__ == "__main__":
    raise SystemExit(main())

# Hydrogen diagnostic — 17/11/2026

Existing key returned HTTP 200 for model metadata, with generateContent support. Two additional generation requests were explicitly authorized; both succeeded. No billing, demo model or application limit setting changed.

| Request | HTTP | Latency | Output |
|---|---|---|---|
| Exact GreenTrip prompt + production schema; diagnostic timeout 45s | 200 | 15.61s | Correct search / mì Quảng / food / new; valid production Turn |
| Minimal JSON, low thinking; diagnostic timeout 45s | 200 | 41.70s | Correct dish and city JSON |

The app timeout is 12 seconds, shorter than both observed latencies. This verifies a timeout mismatch for these requests, not the cause of every previous unavailable error. Minimal input/low thinking did not reliably reduce observed latency. The earlier adapter collapsed provider/network failures into unavailable and did not retain the HTTP error, so those old failures cannot be retroactively classified as 503.

Exactly two extra calls were used and metered locally (40 → 42); no further generation calls were sent. Metadata checks do not generate content. Keep the existing demo model: these two probes prove access, not superior follow-up understanding or production reliability.

No user action is currently required. A later Hydrogen rollout needs a model-specific timeout/latency budget, sanitized provider error diagnostics, and a fresh behavioral comparison; raising the timeout alone does not prove demo suitability.

Primary references: [Google troubleshooting](https://aistudio.google.com/docs/troubleshooting), [Hydrogen thinking defaults](https://aistudio.google.com/docs/whats-new-gemini-4-hydrogen).

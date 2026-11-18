# ADR-001: Backend Part 2 Quantitative Solver & Lean Zero-Friction Planner

- **Date**: 2026-11-16
- **Status**: Accepted & Implemented (Verified on branch `feature/#pb14_mindtrip-copilot-upgrade`)
- **Related Docs**: [COPILOT_AI_ADAPTATION_SPEC.md](../../docs/COPILOT_AI_ADAPTATION_SPEC.md), [USABILITY_TEST_PLAN.md](../../docs/USABILITY_TEST_PLAN.md)

---

## 1. Context

GreenTrip AI combines qualitative LLM/rule-based intent understanding with deterministic itinerary planning for Đà Nẵng & Huế. Prior to this change:
- Copilot responses could suggest POIs or reorder stops without enforcing opening hours, budget caps, route efficiency, or daily fatigue limits (`422` risk on sync, zig-zag routes, overloaded days).
- First-time visitors faced login friction before seeing an actionable itinerary + map, and lacked deterministic 1-tap controls for rainy-day rescue, nearby stop swapping, budget tracking, and safe rest-block insertion.

## 2. Decisions

### Decision A — Deterministic Backend Quantitative Solver (Part 2)
Implemented in [`backend/app/trips/itinerary_constraints.py`](../../backend/app/trips/itinerary_constraints.py) and invoked across Copilot response paths via [`upgrade_handler_response_to_mindtrip_standard`](../../backend/app/trips/copilot_consultant.py) and [`process_copilot_chat`](../../backend/app/trips/service.py):
1. **Budget Constraint ($C_{\text{total}} \le B_{\max}$)**: `enforce_budget_constraint` checks itinerary cost against `total_budget` or `TIER_DAILY_BUDGET_VND` (`budget`: 500k, `standard`: 1.2M, `luxury`: 3M VND/person/day) with cost-aware substitution or explicit warning.
2. **Opening Hours Verification**: `check_opening_hours` validates candidate POIs against `pois.opening_hours` (SQLite/Postgres seeded from `data/processed/poi_contacts_cache.json` in [`backend/app/db/postgres.py`](../../backend/app/db/postgres.py)).
3. **Anti-Zig-Zag Routing & $\text{CO}_2$ Estimation**: `optimize_outline_routes_and_co2` applies Nearest-Neighbor + 2-opt reordering while preserving rest blocks and recomputing non-overlapping timestamps (`_sync_stop_times_after_reorder`), plus mode-aware emissions (`driving`: 171, `motorcycle`: 72, `transit`: 40, `walking`: 0 g $\text{CO}_2\text{e/km}$).
4. **Daily Fatigue Score & Auto-Rest Insertion**:
   $$F(d) = \text{duration\_hours}(d) + 0.5 \cdot N_{\text{outdoor}}(d)$$
   Implemented in `compute_fatigue_score` and `enforce_fatigue_rest_blocks` (excluding `stop_type == "rest"`). When `active_count >= 4` or `fatigue_score >= 6.0`, a 90-minute `stop_type: "rest"` block is inserted in a non-overlapping slot via `_find_non_overlapping_rest_window`.
   Metrics are returned in `CopilotChatResponse.fatigue_metrics` ([`backend/app/trips/schemas.py`](../../backend/app/trips/schemas.py)).

### Decision B — Zero-Friction Guest Onboarding & Deterministic Frontend Rescue
Implemented across [`frontend/src/pages/LandingPage.tsx`](../../frontend/src/pages/LandingPage.tsx), [`frontend/src/services/itineraryService.ts`](../../frontend/src/services/itineraryService.ts), and [`frontend/src/components/planner/TripItineraryView.tsx`](../../frontend/src/components/planner/TripItineraryView.tsx):
1. **<30s Quick Planner Launch**: `LandingPage` constructs a `quickLaunchTrip` (`buildDefaultCopilotItinerary` + `DAILY_BUDGET_BY_TIER`) and navigates straight to `/planner` without requiring login.
2. **Deterministic Itinerary Normalization (`buildItineraryFromOutline`)**: Normalizes `HH:MM` timestamps (`padTime`), deduplicates cross-day `stop_id`s (`seenStopIds`), and filters overlapping windows (`acceptedWindows`) to satisfy [`TripItinerarySyncRequest`](../../backend/app/trips/schemas.py).
3. **In-Planner Deterministic Controls**:
   - **1-Tap Weather Rescue + Undo**: `isPoiOutdoor` + `suggestIndoorAlternativesForDay` swaps outdoor stops to same-city indoor/dining alternatives while preserving an Undo snapshot.
   - **Nearby Swap Picker**: `suggestNearbyAlternativesForStop` ranks up to 3 nearby replacements with distance/Eco short reasons (`getStopShortReason`).
   - **Budget & Fatigue Monitoring**: `computeTripBudgetSummary` and `computeDayFatigue` drive the budget bar and fatigue badge (`Nhịp {hours}h`) + safe `+ Thêm nghỉ` using `findRestSlot` and `insertRestInOrder`.
   - **Guest Soft-Prompt**: Local export (`.ics`/print) works immediately; Cloud-Save/Share prompts sign-in without discarding active edits.

## 3. Alternatives Rejected
- **Pure LLM itinerary generation & rest scheduling**: Rejected due to coordinate/hours hallucination, token latency, and frequent time-window overlap errors on backend sync.
- **Forcing login before `/planner`**: Rejected because it blocks Time-to-First-Itinerary (`<30s` target in [`docs/USABILITY_TEST_PLAN.md`](../../docs/USABILITY_TEST_PLAN.md)).

## 4. Trade-offs & Consequences
- **Positive**: Deterministic feasibility guarantees, zero `422` overlap rejections on quick-launch or rest insertion, instant client-side weather/nearby swaps without extra LLM round-trips.
- **Trade-off**: Fatigue weights ($0.5\text{h}$ per outdoor stop, threshold $6.0\text{h}$ or $\ge 4$ stops) and `DAILY_BUDGET_BY_TIER` constants must remain mirrored between [`backend/app/trips/itinerary_constraints.py`](../../backend/app/trips/itinerary_constraints.py) and [`frontend/src/services/itineraryService.ts`](../../frontend/src/services/itineraryService.ts) / [`frontend/src/pages/LandingPage.tsx`](../../frontend/src/pages/LandingPage.tsx).
- **Trade-off**: Dense-day overflow stops pushed past `22:00` by route reordering intentionally clear `start_time`/`end_time`/`timeSlot` (becoming untimed stops) rather than colliding at `21:30–23:00`.

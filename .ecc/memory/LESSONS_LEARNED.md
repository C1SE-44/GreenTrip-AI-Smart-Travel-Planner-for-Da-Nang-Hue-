# Lessons Learned — Copilot Part 2 & Lean Planner

**Last Updated**: 2026-11-16

---

## 1. Hardcoded Rest Window Collided With Default Itinerary Stops
- **Symptom**: Clicking `+ Thêm nghỉ` inserted a rest block hardcoded to `12:00–13:30`, causing backend `TripItinerarySyncRequest` (`422`) time-overlap validation errors on Day 1 and Day 3 default outlines.
- **Root Cause**: Default day templates already occupied midday windows, and insertion assumed `12:00–13:30` was always free.
- **Fix**: Replaced hardcoded time placement with [`findRestSlot`](../../frontend/src/services/itineraryService.ts) (`11:00–15:00` fallback `09:00–20:00`) + [`insertRestInOrder`](../../frontend/src/services/itineraryService.ts) on Frontend ([`TripItineraryView.tsx`](../../frontend/src/components/planner/TripItineraryView.tsx)), and [`_find_non_overlapping_rest_window`](../../backend/app/trips/itinerary_constraints.py) on Backend.
- **Guardrail**: Never hardcode fixed `HH:MM` windows when inserting new stops or rest blocks; always scan existing timed windows for an overlap-free slot.

## 2. Prompt Extractor Overwrote Manual Quick-Planner Pill Selections
- **Symptom**: Typing a prompt on [`LandingPage.tsx`](../../frontend/src/pages/LandingPage.tsx) that omitted destination or duration silently reset the user's manually selected city or day pills back to defaults; budget also drifted when no explicit amount was parsed.
- **Root Cause**: `extractTripIntentFromPrompt` returned fallback destination/day values unconditionally, overwriting `quickDest`/`quickDays` state on every input change.
- **Fix**: Added `hasManualDest` / `hasManualDays` refs plus `hasExplicitDest` / `hasExplicitDuration` regex guards in `handleQuickPromptInput`, and aligned fallback budget calculation with `DAILY_BUDGET_BY_TIER` (`budget`: 500k, `standard`: 1.2M, `luxury`: 3M VND).
- **Guardrail**: Natural-language parsers in hybrid forms must never override explicit user widget selections unless the user explicitly mentions the corresponding dimension *and* has not manually locked it.

## 3. Outline-to-Itinerary Conversion Violated Sync Schema Invariants
- **Symptom**: `TripItinerarySyncRequest` ([`backend/app/trips/schemas.py`](../../backend/app/trips/schemas.py)) rejects non-`HH:MM` strings, duplicate `stop_id` values across days, or overlapping stop windows within a day.
- **Root Cause**: AI/default outline stops can carry single-digit hours (`8:30`), reused template IDs across days, or colliding slots.
- **Fix**: Hardened [`buildItineraryFromOutline`](../../frontend/src/services/itineraryService.ts) with `padTime` (`HH:MM` zero-padding), `seenStopIds` cross-day deduplication, and `acceptedWindows` non-overlap checks (clearing invalid/colliding times to `null`).
- **Guardrail**: Any client-side converter feeding `/sync` must enforce the same uniqueness and non-overlap invariants checked by `TripItinerarySyncRequest.validate_days`.

## 4. Route Reorder Time Clamping Stacked Overflow Stops at `21:30`
- **Symptom**: After anti-zig-zag reordering on dense days, `_sync_stop_times_after_reorder` clamped late stops to `21:30–23:00`, stacking multiple overflow stops onto identical colliding slots.
- **Root Cause**: `cursor` was clamped instead of stopping timed assignment once remaining day hours were exhausted.
- **Fix**: In [`_sync_stop_times_after_reorder`](../../backend/app/trips/itinerary_constraints.py), when `cursor >= 22 * 60` or `cursor + 15 > 23 * 60`, clear `start_time`, `end_time`, and `timeSlot` so overflow stops remain in the day's `sequence` as untimed stops without colliding.
- **Guardrail**: When rescheduling variable-length sequences into a bounded day window, degrade overflow stops to untimed (`None`) rather than clamping multiple stops to the same end-of-day boundary.

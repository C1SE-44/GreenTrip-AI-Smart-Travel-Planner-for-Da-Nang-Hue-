# Phase 10 — Real Environment and End-to-End Verification

**Date:** 2026-11-23
**Overall status:** PARTIAL
**Production readiness:** BLOCKED pending PostgreSQL, real catalogue data, and provider verification.

## Environment and database safety

- Branch: `feature/pb18-profile-ui-integration`. The worktree already contained uncommitted Phase 1–9 changes; they were preserved. No branch switch, commit, or push was performed.
- FastAPI ran at `127.0.0.1:8001` with `APP_ENV=test`, an empty `DATABASE_URL`, and a `TEST_DATABASE_PATH` under a unique OS temporary directory. Workspace and assistant stores were also kept in that temporary directory. Smoke-test records were written there only.
- Vite served locally at `127.0.0.1:5174` with the API pointed at the isolated backend. `GET /` and the `/src/main.tsx` transform both returned HTTP 200. Browser automation was unavailable, so the running page was not interacted with in a browser.
- No PostgreSQL test server or Docker CLI was available. No `.env` file or explicit database environment configuration was found in the checked locations. No database connection outside the temporary SQLite test store was opened.
- Migration 015 was not applied. Static inspection of `backend/migrations/001_create_pois.sql` finds `public.pois.id` is a `BIGINT` primary key, while `backend/migrations/015_community_green_reviews.sql` stores `poi_id TEXT` and declares no foreign key. Existing migrations also use differing POI key assumptions. The actual deployed schema is unknown, so PostgreSQL compatibility remains BLOCKED.
- No production seed, migration, or database write was run. The temporary SQLite bootstrap and fixture setup were explicit test preparation.

## Dependencies and automated checks

- With user approval, restored the declared frontend packages using `npm install --no-save --package-lock=false morphicons@2.0.2 three@0.187.0 @types/three@0.187.0`. `package.json` and the lockfile were not changed by this command. npm reported 2 dependency vulnerabilities (1 moderate, 1 high); no audit fix was run.
- `npm run typecheck`: **PASS** after replacing browser timer annotations that required the absent `NodeJS` namespace with `ReturnType<typeof setTimeout>`.
- `npm run lint`: **PASS**, 0 errors and 134 warnings.
- `npm run build`: **PASS**, 1,699 modules. Vite still reports a large main chunk (about 795 KB, 218 KB gzip) and large Phosphor SVG bundles.
- `npm test`: **158 passed, 0 failed, 0 skipped**. These include component/browser harness checks, not a full live-app browser run.
- `python -m pytest -q`: **689 passed, 5 skipped**, one pending-deprecation warning.
- `git diff --check`: passed after the final documentation updates.

## Runtime scenario results

| Scenario | Status | Evidence and limit |
|---|---|---|
| A. PB07 and Trip Workspace | **RUNTIME VERIFIED** | `/trips/validate-parameters` returned 200 with a 6,000,000 VND total. Workspace create and reload returned 200 and retained budget and ideas. A new workspace had no itinerary until an explicit itinerary write. |
| B. PB08 and PB09 | **PARTIAL** | `/pois/weights` returned normalized weights 0.70/0.30. PB09 returned 200 with an empty result set. In test mode `backend/app/recommendations/repository.py` uses the bundled CSV fallback; this request produced no rows, so recommendation quality and ranking were not runtime verified. |
| C. Personalization | **TEST VERIFIED ONLY** | Automated tests cover the existing recommendation contracts. The empty PB09 result prevented a meaningful live check of “you may also like” or user-selected/favorited POI ranking. |
| D. Feasibility warnings | **TEST VERIFIED ONLY** | Unit and component tests passed. The browser did not run the full live UI flow. |
| E. Itinerary preview and Apply | **PARTIAL** | An itinerary with three days and two stops was explicitly saved and reloaded. In-trip preview produced one alternative and Apply succeeded. The full PB05 chat-to-itinerary-generation journey was not driven through the live UI. |
| F. Unscheduled selected POIs | **TEST VERIFIED ONLY** | Workspace ideas persisted across reload and remained after in-trip Apply. No separate live UI run covered every unscheduled-POI state. |
| G. Accommodation | **PARTIAL** | Recommendations endpoint returned 200 and one destination group with zero stays. No accommodation inventory was available in the isolated SQLite run; no stay was fabricated. |
| H. Transport | **PARTIAL** | Preview returned 200 with `partial` status and zero route legs for a one-stop itinerary. Fare and CO₂e remained unknown. The saved empty transport choice did not change the itinerary. OSRM was not called because the test had no routable segment. |
| I. In-trip assistance and recovery | **RUNTIME VERIFIED** | Explicit `VISITED` progress persisted; preview produced one alternative; Apply succeeded; reconcile returned `CLEAN`; the visited stop remained on day 1 and Workspace ideas were preserved. When the SQLite catalogue query failed, the preview used itinerary stop details and exposed an unknown-route warning. |
| J. Community Green Review | **BLOCKED** | The review endpoint returned 503 because the POI catalogue query in `backend/app/pois/repository.py` expects PostGIS `geom`, which the isolated SQLite POI table in `backend/app/db/postgres.py` does not contain. The review write and aggregate were not verified. Migration 015 remains unapplied. |

The smoke run also verified health, CORS preflight, login, `/auth/me`, optimistic Workspace revision rejection (409), itinerary GET/PUT persistence, and that writing accommodation/transport state left the itinerary unchanged.

## Runtime fix

`backend/app/assistant/service.py` now handles an unavailable POI catalogue during in-trip preview by using the POI details already saved on itinerary stops. Missing coordinates remain unknown, and the preview adds a warning. It does not alter itinerary ordering or Apply behavior. `backend/tests/test_travel_assistant.py` adds coverage for the fallback, warning, and unknown route metric.

TypeScript browser timer annotations were changed in `frontend/src/components/planner/TripOverviewView.tsx`, `frontend/src/components/poi/PoiMap.tsx`, and `frontend/src/pages/ExplorePage.tsx` to clear the typecheck blocker without adding a fake declaration.

## Remaining blockers and demo readiness

- **Capstone demo readiness: PARTIAL.** A controlled local demo can show PB07 Workspace persistence and in-trip preview/Apply/reconcile with isolated fixtures. PB09 returned no POIs, accommodation returned none, Community Green is blocked by SQLite/PostGIS incompatibility, and no full browser interaction was available.
- PostgreSQL migration and review CRUD, uniqueness, ownership, rollback, and foreign-key behavior need an isolated PostgreSQL instance and a confirmed POI key mapping.
- PB09 and accommodation need a verified data source with usable destination records. Empty responses must remain visibly empty.
- Transport routing, railway schedules, fares, and emissions need verified providers/factors before showing numeric results. No external routing or timetable request was made.
- Run browser scenarios at 320, 375, 768, and 1280 pixels against a configured test environment; the present harness covered component cases but not the complete live app.

## Before production deployment

1. Provision an isolated staging PostgreSQL database and record its schema version and actual POI primary key.
2. Reconcile the POI key types and foreign-key design before reviewing or applying migration 015; run migration and Community Green CRUD/ownership/concurrency/rollback checks on staging.
3. Run the full PB07 → PB09 → user selection → feasibility → itinerary preview/Apply flow using verified catalogue records, then reload and verify persistence.
4. Configure only validated routing, railway, fare, and emissions sources; retain unknown values where evidence is absent.
5. Complete the browser checks at all four widths, capture console/network results, and rerun CI on the release candidate.
6. Keep production startup free of sample seeding and apply reviewed migrations through the production release process after staging approval.

No production database, migration, `.env`, dependency manifest, commit, or push was changed as part of Phase 10.

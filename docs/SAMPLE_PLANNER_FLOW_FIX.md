# Sample → login → Planner correction (2026-11-18)

This supersedes the landing setup-form flow in LANDING_SAMPLE_HANDOFF.md. Guest sample editing stays public. Saving requires a real authenticated session.

## Resulting flow

1. Guest edits the database-backed sample and chooses Save as own trip.
2. Login succeeds; the edited Ideas and itinerary are saved to one stable draft trip ID. No trip-details popup on Landing.
3. Open `/planner?trip=<id>&tab=itinerary&setup=1` immediately. Existing Planner creation form appears over the saved itinerary, without its AI textarea. Destination and number of days come from the selected sample; choose start date, guests, and optional total budget.
4. Save dates and metadata to the same trip. Keep POIs, stop IDs, day assignment and order; do not generate another itinerary. Remount itinerary once setup completes so an old local draft cannot overwrite the completed plan.
5. Reload opens the saved itinerary without asking the questions again. Dismissing the form leaves the real undated draft available; reopening that trip asks for the missing details.

## Verified causes / limits

- Legacy schema varchar64 incompatibility was verified previously and remains covered by the identifier contract test. Modern stop IDs remain intact; short deterministic legacy aliases are persisted.
- Stale browser/legacy workspace revision conflicts could block the owned trip list after a successful save. Migration now ignores obsolete local revisions and isolates 409 conflicts while preserving server-owned workspaces. No browser storage clearing is required.
- The supplied runtime stack shows React hooks and renderer coming from different Vite dependency hashes. Dev and isolated QA previously shared the default optimizer directory. They now have separate cache directories, React deduplication and prebundled React Leaflet. The corrected path rendered the map and itinerary without the reported useState crash in the local UI test. The original captured browser session was not replayed.
- Catalogue requests have a 12-second timeout, cached successful data expire after 60 seconds, failures can retry. This is request refresh and in-app state update, not a new cross-device Realtime subscription.
- Google: configured frontend/backend audiences matched and Google's certificate endpoint returned HTTP 200 during diagnostics. No real Google credential was inspected; the exact reason for the screenshot's rejected ID token is unconfirmed. Verification remains strict for audience, issuer and signature with 30-second clock tolerance. Network/certificate failures now return service-unavailable separately from invalid credentials. Late responses after closing/changing auth cannot commit a stale session. Removed fake login/OTP success paths.
- ErrorBoundary no longer offers a destructive clear-all-LocalStorage action.

## Acceptance evidence

All writes used a disposable local API at 8019 and UI at 5178, with production auth/workspace/itinerary routers, local POI data and varchar64 constraint triggers. No Supabase online writes or real account changes.

- UI PASS, 1280px: guest → email/password login → saved Planner itinerary → existing information form with no AI textarea → 24 Nov, 3 guests, 3,000,000 VND. Same ID `1040b4a0-f2e3-4c20-8dfd-937e9e5f4a15` before/after; 4 stops; reload retained all values without clearing storage.
- UI PASS, 320px: moved Local Beans before Chăm Museum in sample; saved as `0bde621d-4661-4817-8d7d-839e375f8b5c`; picked today; saved/reloaded, order and 4 POIs retained. Past suggested hours cleared. Form/calendar and Planner document width 320px, no horizontal overflow. Form absent after completion/reload.
- API PASS: both IDs occur exactly once in owned workspaces; dates/people/budget/setup flag and saved itinerary verified in `SAMPLE_PLANNER_FLOW_API.json`.
- 17 focused frontend tests PASS (sample transformations, exact persistence/retry, same-ID completion, failed save recovery, session isolation and stale revisions, auth persist=false).
- 22 focused backend tests PASS: Google verification contract, legacy identifier contract, workspace and schedule validation.
- Typecheck PASS; production build PASS (existing large-chunk warning); scoped lint 0 errors, existing unused initialMode warning. UI had an existing HeroScenes fetchPriority React warning, no useState runtime crash.
- Independent review findings on stale auth, account switching, editable fields during submit and stale itinerary remount were addressed.
- Code graph refreshed without LLM calls: 3827 nodes / 10086 edges; semantic token cost 0. Existing do_revert.cjs syntax warning was outside this change.

Real Google sign-in, cross-device realtime and write verification against online Supabase are not marked PASS. Primary localhost ports 5173/8000 returned HTTP 200; end-to-end acceptance above used the isolated fixture.

Screenshots: [desktop](sample-planner-after.jpg), [mobile](sample-planner-mobile.jpg).

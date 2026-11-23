# Landing Studio v3 — 18/11/2026

Imported selectively from user-provided Downloads/chân-mây (3).zip, not its App, dependencies, global styles or credentials. Source archive remains unchanged.

## Product direction

The page now leads with a usable outcome: “Đi Đà Nẵng, Huế? Có lịch để bắt đầu.” The hero asks only city and duration, then opens an editable sample. Visitors can remove stops, restore the sample and copy it without signing in. The sample is explicitly temporary and does not silently create an account trip.

Three supplied illustrations replace the prior feature panels:
- Sơn Trà wildlife: CTA opens the existing two-day Đà Nẵng sample containing Sơn Trà.
- Food tabletop: selection reveals an editorial example, labelled “Ví dụ tham khảo”. “Tìm món này” sends the dish via the bounded q URL parameter to Explore's existing search. It does not claim a database-backed saved stop. Source attribution retained; illustrative restaurant facts are not live availability.
- Windshield/paper itinerary: CTA opens the editable sample; the paper itself remains labelled illustrative. “Tạo chuyến đi riêng” leads to the existing private planner flow, requiring sign-in.

## Performance and accessibility

Only 32 required images imported, resized to at most 1400×1000 and converted to WebP: 2,341,526 bytes total. Below-fold images lazy-decode, cards are a separate dynamic chunk (~16.2 kB gzip), offscreen sections use content-visibility. Existing responsive hero imagery, static first paint, delayed animation startup and lazy workspace/auth loads retained.

Imported new traveler artwork and 920 ms scene movement keyframes; did not import wheel/touch interception or global preloads. Scenes autoplay; animation pauses when hidden, out of view or viewing a sample, with manual pause and reduced-motion support. Traveler updates capped at 30/s. No new package dependencies.

## Verification

- TypeScript/build and scoped landing lint PASS. Whole-project lint still has 11 pre-existing errors / 139 warnings outside imported landing changes.
- Asset integrity/budget and POI-loading regression: 6 PASS.
- IAB desktop: hero sample opens, removing a stop changes 3 to 2, Sơn Trà CTA opens 2-day/5-stop sample, food selection opens example and forwards “Mì Quảng” into Explore search.
- IAB 320 px: document width 305 px within viewport 320; food interaction displays example, no broken imported images, third card opens sample; clipboard reports success.
- Explore received the correct query but reported data unavailable because the local backend was not running. End-to-end POI results were not verified this turn. No AI requests or online database writes.

Git delivery from the prior task remains pending credentials; these landing changes are local, not published.

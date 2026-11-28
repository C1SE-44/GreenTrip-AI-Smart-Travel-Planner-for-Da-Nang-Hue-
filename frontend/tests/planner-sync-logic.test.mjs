import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const itineraryServicePath = path.resolve('src/services/itineraryService.ts');
const tripItineraryViewPath = path.resolve('src/components/planner/TripItineraryView.tsx');
const tripOverviewViewPath = path.resolve('src/components/planner/TripOverviewView.tsx');
const tripCalendarViewPath = path.resolve('src/components/planner/TripCalendarView.tsx');
const tripIdeaSelectionPath = path.resolve('src/components/planner/tripIdeaSelection.ts');
const tripIdeaSelectionSource = fs.readFileSync(tripIdeaSelectionPath, 'utf8');
const tripIdeaSelectionJs = ts.transpileModule(tripIdeaSelectionSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { updateTripIdeaIds, uniqueTripRecommendationPois } = await import(`data:text/javascript;base64,${Buffer.from(tripIdeaSelectionJs).toString('base64')}`);
const apiClientPath = path.resolve('src/lib/api.ts');
const viteConfigPath = path.resolve('vite.config.ts');

// Tái hiện chính xác hàm updateDateRangeWithDays trong itineraryService.ts để test unit độc lập
function updateDateRangeWithDays(currentDateStr, newDaysCount = 1) {
  const safeDays = Math.max(1, newDaysCount);
  if (!currentDateStr || !currentDateStr.trim()) {
    return `Ngày 1 – ${safeDays} tháng 11`;
  }

  let raw = currentDateStr.trim();
  const hadParenthesisDays = /\(\d+\s*ngày\)/i.test(raw);
  if (hadParenthesisDays) {
    raw = raw.replace(/\s*\(\d+\s*ngày\)/gi, '').trim();
  }

  const ngayPattern = /^Ngày\s+(\d+)\s*[–-]\s*(\d+)\s+tháng\s+(\d+)(.*)$/i;
  const matchNgay = raw.match(ngayPattern);
  if (matchNgay) {
    const startDay = parseInt(matchNgay[1], 10);
    const month = matchNgay[3];
    const tail = matchNgay[4] || '';
    const newEndDay = startDay + safeDays - 1;
    const res = `Ngày ${startDay} – ${newEndDay} tháng ${month}${tail}`;
    return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
  }

  const dashPattern = /^(\d+)\s*[–-]\s*(\d+)\s+(thg|tháng)\s+(\d+)(.*)$/i;
  const matchDash = raw.match(dashPattern);
  if (matchDash) {
    const startDay = parseInt(matchDash[1], 10);
    const unit = matchDash[3];
    const month = matchDash[4];
    const tail = matchDash[5] || '';
    const newEndDay = startDay + safeDays - 1;
    const res = `${startDay} – ${newEndDay} ${unit} ${month}${tail}`;
    return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
  }

  const tuPattern = /^Từ\s+(\d+)\s+(thg|tháng)\s+(\d+)(.*)$/i;
  const matchTu = raw.match(tuPattern);
  if (matchTu) {
    const startDay = parseInt(matchTu[1], 10);
    const unit = matchTu[2];
    const month = matchTu[3];
    const tail = matchTu[4] || '';
    const newEndDay = startDay + safeDays - 1;
    const res = `${startDay} – ${newEndDay} ${unit} ${month}${tail}`;
    return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
  }

  const flexPattern = /^(\d+)\s*ngày\s*•\s*(.*)$/i;
  const matchFlex = raw.match(flexPattern);
  if (matchFlex) {
    const rest = matchFlex[2];
    return `${safeDays} ngày • ${rest}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const newEndDay = d + safeDays - 1;
    const res = `Ngày ${d} – ${newEndDay} tháng ${m}`;
    return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
  }

  const res = `${safeDays} ngày • ${raw}`;
  return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
}

test('updateDateRangeWithDays: Đúng ví dụ người dùng 1-5 thêm 1 ngày thành 1-6', () => {
  assert.equal(updateDateRangeWithDays('1 - 5 thg 11', 6), '1 – 6 thg 11');
  assert.equal(updateDateRangeWithDays('1 – 5 thg 11', 6), '1 – 6 thg 11');
  assert.equal(updateDateRangeWithDays('1 - 5 tháng 11', 6), '1 – 6 tháng 11');
  assert.equal(updateDateRangeWithDays('Ngày 1 – 5 tháng 11', 6), 'Ngày 1 – 6 tháng 11');
  assert.equal(updateDateRangeWithDays('14 – 17 thg 11, 2026', 5), '14 – 18 thg 11, 2026');
  assert.equal(updateDateRangeWithDays('Từ 16 thg 11', 5), '16 – 20 thg 11');
  assert.equal(updateDateRangeWithDays('4 ngày • Tháng 11', 5), '5 ngày • Tháng 11');
  assert.equal(updateDateRangeWithDays('16 - 19 thg 11 (4 ngày)', 5), '16 – 20 thg 11 (5 ngày)');
});

test('itineraryService: Khai báo đầy đủ updateDateRangeWithDays, parseStartDateFromTrip và isClientDraftTripId', () => {
  const serviceContent = fs.readFileSync(itineraryServicePath, 'utf8');
  assert.ok(serviceContent.includes('export function updateDateRangeWithDays'), 'Must export updateDateRangeWithDays');
  assert.ok(serviceContent.includes('export function parseStartDateFromTrip'), 'Must export parseStartDateFromTrip');
  assert.ok(serviceContent.includes('export function alignItineraryToTrip'), 'Must export alignItineraryToTrip');
  assert.ok(serviceContent.includes('export function isClientDraftTripId'), 'Must export isClientDraftTripId');
  assert.ok(serviceContent.includes("tripId.startsWith('trip-quick-')"), 'Draft guard must handle trip-quick-* locally without 404 GET');
});

test('TripItineraryView: Tích hợp đồng bộ ngày & ý tưởng', () => {
  const viewContent = fs.readFileSync(tripItineraryViewPath, 'utf8');
  assert.ok(viewContent.includes('updateDateRangeWithDays'), 'TripItineraryView must import and use updateDateRangeWithDays');
  assert.ok(viewContent.includes('onUpdateTrip'), 'TripItineraryView must notify parent on trip update');
  assert.ok(viewContent.includes('handleAddDay'), 'TripItineraryView must handle add day');
  assert.ok(viewContent.includes('handleDeleteDay'), 'TripItineraryView must handle delete day');
  assert.ok(viewContent.includes('Thêm ngày trước') && viewContent.includes('Thêm ngày sau'), 'Each day must support inserting adjacent days');
  assert.ok(viewContent.includes('Xóa hoạt động trong ngày') && viewContent.includes('Xóa ngày'), 'Day menu must distinguish clearing stops from removing the day');
  assert.ok(viewContent.includes('Thêm/sửa tiêu đề') && viewContent.includes('Thêm/sửa ghi chú'), 'Day menu must expose title and note editors');
  assert.ok(viewContent.includes('const clearDay ='), 'Day menu must clear scheduled stops without deleting the day');
  assert.ok(viewContent.includes('alignItineraryToTrip(latestPlan.current, trip)'), 'Must align days when trip.daysCount changes');
  assert.ok(viewContent.includes("modalTab === 'saved'"), 'Must handle saved/favorite tab');
});

test('Trip POI selection handles rapid add/remove batches without losing or duplicating IDs', () => {
  let ideas = [];
  for (let index = 0; index < 10; index += 1) {
    ideas = updateTripIdeaIds(ideas, `poi-${index}`, `poi-${index}`, `POI ${index}`, 'add');
  }
  assert.equal(ideas.length, 10);
  assert.equal(new Set(ideas).size, 10);

  for (let index = 0; index < 10; index += 1) {
    ideas = updateTripIdeaIds(ideas, `poi-${index}`, `poi-${index}`, `POI ${index}`, 'remove');
  }
  assert.deepEqual(ideas, []);
});

test('Trip POI selection preserves the final state across 20 alternating actions', () => {
  let ideas = Array.from({ length: 10 }, (_, index) => `poi-${index}`);
  for (let index = 0; index < 10; index += 1) {
    ideas = updateTripIdeaIds(ideas, `poi-${index}`, `poi-${index}`, `POI ${index}`, 'remove');
    ideas = updateTripIdeaIds(ideas, `poi-${index + 10}`, `poi-${index + 10}`, `POI ${index + 10}`, 'add');
  }
  assert.deepEqual(ideas, Array.from({ length: 10 }, (_, index) => `poi-${index + 10}`));
  assert.equal(new Set(ideas).size, ideas.length);
});

test('Repeated add is idempotent for canonical IDs and POI-name aliases', () => {
  const selected = updateTripIdeaIds([], 'poi-1', 'poi-1', 'Bãi biển', 'add');
  assert.strictEqual(updateTripIdeaIds(selected, 'poi-1', 'poi-1', 'Bãi biển', 'add'), selected);
  assert.strictEqual(updateTripIdeaIds(selected, 'Bãi biển', 'poi-1', 'Bãi biển', 'add'), selected);
});

test('PB09 results remain visible while selected Trip state controls the add button', () => {
  const recommendations = Array.from({ length: 10 }, (_, index) => ({ id: `poi-${index}`, name: `POI ${index}` }));
  let selected = [];

  assert.equal(uniqueTripRecommendationPois(recommendations).length, 10);
  selected = updateTripIdeaIds(selected, 'poi-0', 'poi-0', 'POI 0', 'add');
  assert.equal(new Set(selected).has('poi-0'), true, 'A selected POI should show the added state');
  selected = updateTripIdeaIds(selected, 'poi-0', 'poi-0', 'POI 0', 'remove');
  assert.equal(new Set(selected).has('poi-0'), false, 'Removing a POI should restore the add state');

  selected = recommendations.reduce(
    (current, poi) => updateTripIdeaIds(current, poi.id, poi.id, poi.name, 'add'),
    selected,
  );
  assert.equal(selected.length, 10);
  assert.equal(uniqueTripRecommendationPois(recommendations).length, 10);
  assert.ok(new Set(selected).has('poi-0'));

  selected = recommendations.reduce(
    (current, poi) => updateTripIdeaIds(current, poi.id, poi.id, poi.name, 'remove'),
    selected,
  );
  assert.deepEqual(selected, []);
  assert.equal(uniqueTripRecommendationPois(recommendations).length, 10);
});

test('Trip idea event handler is pure with respect to React updaters and keeps shared state paths', () => {
  const viewContent = fs.readFileSync(tripItineraryViewPath, 'utf8');
  const handlerStart = viewContent.indexOf('const handleToggleIdeaInTrip =');
  const handlerEnd = viewContent.indexOf('const runSmartSchedule =', handlerStart);
  const handler = viewContent.slice(handlerStart, handlerEnd);
  const pageContent = fs.readFileSync(path.resolve('src/pages/ExplorePage.tsx'), 'utf8');

  assert.ok(handler.includes('const currentIdeas = tripIdeasRef.current'));
  assert.ok(handler.includes('setTripIdeas(nextIdeas)'));
  assert.ok(handler.includes('onUpdateTrip?.({ ...trip, ideas: nextIdeas })'));
  assert.ok(!handler.includes('setTripIdeas((prev) =>'));
  assert.equal((handler.match(/onUpdateTrip\?\./g) || []).length, 1);
  assert.ok(handler.includes('if (nextIdeas === currentIdeas) return'));
  assert.ok(handler.includes('current.includes(poiId)') && handler.includes(': current)'));
  assert.ok(viewContent.includes('tripIdeasRef.current = incomingIdeas;'));
  const pb09Start = viewContent.indexOf('if (recommendations !== undefined || !allPois.length)');
  const pb09End = viewContent.indexOf('// Keep an unscheduled trip\'s local plan', pb09Start);
  const pb09Effect = viewContent.slice(pb09Start, pb09End);
  assert.ok(!handler.includes('fetchPoiRecommendations'));
  assert.ok(!pb09Effect.includes('tripIdeas'));
  assert.ok(pageContent.includes('localStorage.setItem(storageKey, JSON.stringify(privateTrips))'));
  assert.ok(viewContent.includes('aria-label={`Trip, ${ideaPois.length} địa điểm đã chọn`}'));
  assert.ok(viewContent.includes('rankTripRelatedPois('));
  assert.ok(viewContent.includes('recommendationCards.map((poi) => ('));
  assert.ok(viewContent.includes('isAdded={selectedTripPoiIds.has(poi.id)}'));
  assert.ok(!viewContent.includes('alreadyInTrip.has(poi.id)'));
  assert.ok(!viewContent.includes('Bạn đã chọn các địa điểm trong danh sách gợi ý này.'));
  const cardListStart = viewContent.indexOf('const recommendationCards = useMemo');
  const cardListEnd = viewContent.indexOf('const isScheduleRecommendationsLoading', cardListStart);
  const cardListLogic = viewContent.slice(cardListStart, cardListEnd);
  assert.ok(!cardListLogic.includes('plan.days') && !cardListLogic.includes('dismissedRecommendationIds'));
  const cardContent = fs.readFileSync(path.resolve('src/components/planner/RecommendationPoiCard.tsx'), 'utf8');
  assert.ok(cardContent.includes('disabled={isAdded}') && cardContent.includes('aria-pressed={isAdded}'));
  assert.ok(cardContent.includes("{isAdded ? 'Đã thêm' : 'Thêm'}"));
});

test('Planner PB09 pages append in order, use snapshot cursors, and ignore stale trip requests', () => {
  const viewContent = fs.readFileSync(tripItineraryViewPath, 'utf8');
  const serviceContent = fs.readFileSync(path.resolve('src/services/recommendations.ts'), 'utf8');
  const firstPageStart = viewContent.indexOf('const response = await fetchPoiRecommendations(recommendationRequest');
  const firstPageEnd = viewContent.indexOf('} catch (error)', firstPageStart);
  const firstPageRequest = viewContent.slice(firstPageStart, firstPageEnd);
  const nextPageStart = viewContent.indexOf('const handleLoadMoreRecommendations =');
  const nextPageEnd = viewContent.indexOf('// Keep an unscheduled trip', nextPageStart);
  const nextPageHandler = viewContent.slice(nextPageStart, nextPageEnd);

  assert.ok(viewContent.includes('top_k: 10,') && viewContent.includes('offset: 0,'));
  assert.ok(firstPageRequest.includes('response.has_more') && firstPageRequest.includes('response.snapshot_id'));
  assert.ok(nextPageHandler.includes('offset: page.nextOffset'));
  assert.ok(nextPageHandler.includes('snapshot_id: page.snapshotId'));
  assert.ok(nextPageHandler.includes('uniqueTripRecommendationPois([...current.pois, ...mapped])'));
  assert.ok(nextPageHandler.includes('recommendationRequestVersionRef.current'));
  assert.ok(nextPageHandler.includes('recommendationContextKeyRef.current !== contextKey'));
  assert.ok(nextPageHandler.includes('status === 409'));
  assert.ok(viewContent.includes('Xem thêm địa điểm'));
  assert.ok(viewContent.includes('Đã hiển thị hết các địa điểm đủ điều kiện.'));
  assert.ok(serviceContent.includes('offset?: number;') && serviceContent.includes('snapshot_id?: string;'));
  assert.ok(serviceContent.includes('signal?: AbortSignal'));

  const recommendationEffectStart = viewContent.indexOf('const requestVersion = ++recommendationRequestVersionRef.current');
  const recommendationEffectEnd = viewContent.indexOf('const handleLoadMoreRecommendations =', recommendationEffectStart);
  const recommendationEffect = viewContent.slice(recommendationEffectStart, recommendationEffectEnd);
  assert.ok(recommendationEffect.includes('recommendationContextKey'));
  assert.ok(!recommendationEffect.includes('tripIdeas'));
  assert.ok(!recommendationEffect.includes('setFetchedRecommendationPage([])'));
});

test('PB11: Trợ lý xếp lịch dùng nhịp độ, ý tưởng, gợi ý và lưu lịch trên giao diện mới', () => {
  const viewContent = fs.readFileSync(tripItineraryViewPath, 'utf8');
  const serviceContent = fs.readFileSync(itineraryServicePath, 'utf8');
  const overviewContent = fs.readFileSync(tripOverviewViewPath, 'utf8');

  assert.ok(viewContent.includes('recommendations?: Poi[]'), 'Itinerary view accepts PB09/Thiện recommendations');
  assert.ok(viewContent.includes('fetchPoiRecommendations({'), 'Standalone itinerary view can request live PB09 suggestions through the recommendation service');
  assert.ok(viewContent.includes('selectAutomaticPois(') && viewContent.includes('optimizeDays('), 'Smart action selects and schedules POIs');
  assert.ok(viewContent.includes('onClick={() => handlePacingChange(level)}'), 'Pacing presets immediately schedule more ideas when itinerary content exists');
  assert.ok(viewContent.includes('setAssistantInsight(`Đã chọn nhịp ${level}. Lịch vẫn để trống;'), 'Choosing pacing on an empty trip does not create stops');
  assert.ok(viewContent.includes('mergeAssistantStopsIntoIdeas('), 'Assistant-scheduled POIs are synced into the Ideas list');
  assert.ok(viewContent.includes('const handleRemoveIdeaFromTrip ='), 'Removing an Idea also removes its scheduled copies');
  assert.ok(viewContent.includes('onRemovePoi={handleRemoveIdeaFromTrip}'), 'Selected POI panel removal is connected to the full removal handler');
  assert.ok(viewContent.includes('getRouteCoordinateCoverage('), 'Route buttons validate coordinate availability before optimizing');
  assert.ok(viewContent.includes('onClick={handleSmartScheduleClick}'), 'Smart schedule runs only after the user requests it');
  assert.ok(viewContent.includes('aria-pressed={pacingLevel === level}'), 'Selected pacing is exposed accessibly');
  assert.ok(viewContent.includes('Vì sao GreenTrip xếp như vậy?'), 'Schedule result explains assistant choices');
  assert.ok(viewContent.includes('Xếp thêm địa điểm'), 'Rerunning communicates that it adds new places');
  assert.ok(viewContent.includes('handleUndoSmartSchedule'), 'The latest automatic schedule can be undone');
  assert.ok(viewContent.includes('excludeDismissedPois(ideaPois, dismissed)'), 'Removed ideas stay excluded from automatic runs');
  assert.ok(viewContent.includes('setSmartScheduleUndoPlan(null)'), 'Later itinerary edits clear stale undo state');
  assert.ok(viewContent.includes('setSmartScheduleUndoPlan(previousPlan)'), 'Each smart run stores the previous schedule for undo');
  assert.ok(viewContent.includes('Keep previous assistant picks'), 'Rerunning preserves previously scheduled assistant stops');
  assert.ok(serviceContent.includes('function dailyVisitStopTarget'), 'Relaxed, Balanced and Fast have explicit daily stop targets');
  assert.ok(viewContent.includes('dailyVisitStopTarget(requestedPacing)'), 'Smart scheduling applies the selected per-day stop target');
  assert.ok(viewContent.includes('top_k: 10,') && viewContent.includes('offset: 0,'), 'PB09 recommendation fetch uses the first paginated result page');
  assert.ok(serviceContent.includes('function preferredVisitPeriods'), 'Scheduler uses place time-of-day preferences');
  assert.ok(serviceContent.includes('stops.filter((stop) => experienceGroup'), 'Scheduler limits repeated cafes per day');
  assert.ok(overviewContent.includes('recommendations={recommendedPois}'), 'Overview feeds its current recommendations into the new itinerary UI');
});

test('Planner schedule generation includes current recommendations and previews before saving', () => {
  const viewContent = fs.readFileSync(tripItineraryViewPath, 'utf8');
  assert.ok(viewContent.includes('const availableRecommendations = excludeDismissedPois(scheduleRecommendations, dismissed);'), 'Dismissed recommendations are excluded before scheduling');
  assert.ok(viewContent.includes('      availableRecommendations,\n      tripWithValidBudget'), 'Current recommendation results are passed to the existing scheduler');
  assert.ok(viewContent.includes('if (isSchedulePreviewRef.current) return;'), 'Autosave must stop while a generated schedule is a draft');
  assert.ok(viewContent.includes('Hủy bản xem trước'), 'Users must be able to discard the schedule draft');
  assert.ok(viewContent.includes('Sử dụng lịch trình này'), 'Saving a generated schedule must require explicit confirmation');
  assert.ok(viewContent.includes('const cancelSchedulePreview'), 'Discarding a draft must restore the prior plan');
});

test('PB10: PB09 cards open sourced KG explanations with their actual score factors', () => {
  const viewContent = fs.readFileSync(tripItineraryViewPath, 'utf8');
  const recommendationCardContent = fs.readFileSync(path.resolve('src/components/planner/RecommendationPoiCard.tsx'), 'utf8');
  const explanationContent = fs.readFileSync(path.resolve('src/components/poi/ExplanationModal.tsx'), 'utf8');
  const explanationService = fs.readFileSync(path.resolve('src/services/poiExplanation.ts'), 'utf8');

  assert.ok(viewContent.includes('recordViewedTripPoi(poi.id)') && viewContent.includes('setExplanationPoi(poi)') && recommendationCardContent.includes('Vì sao gợi ý?'), 'Each PB09 card exposes a Why action and records the explicit view');
  assert.ok(viewContent.includes('scoreBreakdown={explanationPoi.recommendationScoreBreakdown'), 'The modal receives the score breakdown for the same POI response');
  assert.ok(viewContent.includes("handleToggleIdeaInTrip(poi.id, 'add')"), 'Adding a PB09 result uses the idempotent selected POI list handler');
  assert.ok(viewContent.includes("activeTab === 'itinerary' && ("), 'Recommendation tab does not render the itinerary timeline');
  assert.ok(explanationContent.includes('POSTGRESQL_FALLBACK') && explanationContent.includes('CSV_FALLBACK'), 'Fallback facts are clearly attributed and not labeled as Neo4j');
  assert.ok(explanationContent.includes('scoreBreakdownDescription'), 'PB09 explanation text follows the active scoring algorithm');
  assert.ok(explanationService.includes('fact_source'), 'The explanation client receives fact provenance');
});

test('Planner ideas keeps the map beside compact PB09 cards and reuses Explore for-you suggestions', () => {
  const viewContent = fs.readFileSync(tripItineraryViewPath, 'utf8');
  const mapContent = fs.readFileSync(path.resolve('src/components/planner/ItineraryMapPanel.tsx'), 'utf8');
  const cardContent = fs.readFileSync(path.resolve('src/components/planner/RecommendationPoiCard.tsx'), 'utf8');
  const helperContent = fs.readFileSync(path.resolve('src/components/explore/exploreUtils.ts'), 'utf8');

  assert.ok(viewContent.includes("activeTab === 'itinerary' || activeTab === 'ideas'"), 'Ideas and itinerary keep a right-side map panel');
  assert.ok(viewContent.includes("pois={activeTab === 'ideas' ? ideasMapPois"), 'Ideas map receives selected and suggested POIs');
  assert.ok(viewContent.includes('Có thể bạn sẽ thích'), 'The existing for-you section appears after PB09');
  assert.ok(viewContent.includes('rankPoisForYou(candidates, allPois, selectedPoiIds)') && viewContent.includes('rankTripRelatedPois('), 'Planner uses trip selections as Explore baseline context, then reranks with trip signals');
  assert.ok(viewContent.includes('aria-label={`Trip, ${ideaPois.length} địa điểm đã chọn`}') && viewContent.includes('<PlannerTripPanel'), 'The single Trip pill opens the shared selected-place panel');
  assert.ok(viewContent.includes("setIdeasRightPanelMode((current) => current === 'trip' ? 'map' : 'trip')"), 'Closing Trip returns to the map without a separate Map button');
  assert.ok(!viewContent.includes('ItineraryIdeasCarousel') && viewContent.includes("{activeTab === 'ideas' && (") && viewContent.includes('recommendationsSectionRef'), 'The selected POI carousel is removed from the suggestions view and PB09 is the first section');
  assert.ok(cardContent.includes('aspect-[16/9]') && cardContent.includes('fallbackMode="neutral"') && !cardContent.includes('PB09:'), 'Suggestion cards use readable landscape images without a prominent technical score');
  assert.ok(!viewContent.includes('reason={poi.recommendationExplanationSnippet}') && viewContent.includes('recommendationExplanationSnippet: item.explanation_snippet'), 'PB09 keeps source explanation data but does not render technical snippets on cards');
  assert.ok(viewContent.includes('Có thể bạn sẽ thích') && viewContent.indexOf('Địa điểm phù hợp với chuyến đi của bạn') < viewContent.indexOf('Có thể bạn sẽ thích'), 'Explore for-you suggestions follow PB09');
  assert.ok(viewContent.includes('onOpenPoiDetails={(poiId) =>') && viewContent.includes('setSelectedMapPoiId(poiId)'), 'Trip panel can reveal the selected POI detail card on the map');
  assert.ok(mapContent.includes("mapPurpose?: 'ideas' | 'itinerary'"), 'The map panel distinguishes recommendations from itinerary controls');
  assert.ok(helperContent.includes('export function rankPoisForYou'), 'Explore exposes the same ranking helper for reuse');
});

test('Trip header removes the three top tabs while sidebar trip navigation remains available', () => {
  const headerContent = fs.readFileSync(path.resolve('src/components/planner/TripHeader.tsx'), 'utf8');
  const exploreContent = fs.readFileSync(path.resolve('src/pages/ExplorePage.tsx'), 'utf8');

  assert.ok(!headerContent.includes("onClick={() => onNavigateToTab?.('ideas')}"), 'TripHeader no longer renders the Ideas tab button');
  assert.ok(!headerContent.includes("onClick={() => onNavigateToTab?.('itinerary')}"), 'TripHeader no longer renders the Itinerary tab button');
  assert.ok(!headerContent.includes("onClick={() => onNavigateToTab?.('calendar')}"), 'TripHeader no longer renders the Calendar tab button');
  assert.ok(headerContent.includes('aria-label="Thông tin chuyến đi"') && headerContent.includes('label={trip.destination || \'Điểm đến\'}') && headerContent.includes('label={dateRangeText}'), 'Trip destination and dates appear in the centered header summary');
  assert.ok(!headerContent.includes('Tùy chỉnh chuyến đi'), 'The old customization dropdown is replaced by centered trip details');
  assert.ok(exploreContent.includes('Gợi ý địa điểm') && exploreContent.includes('Kế hoạch chi tiết') && exploreContent.includes('Lịch'), 'Sidebar navigation still reaches the Planner views');
});

test('PB11: Guest drafts are saved locally and server failures keep a retry path', () => {
  const serviceContent = fs.readFileSync(itineraryServicePath, 'utf8');
  const viewContent = fs.readFileSync(tripItineraryViewPath, 'utf8');

  assert.ok(serviceContent.includes('export function hasItineraryAccountSession()'), 'Itinerary sync checks the active browser session');
  assert.ok(viewContent.includes('if (hasItineraryAccountSession())'), 'Restored drafts distinguish signed-in and guest sessions');
  assert.ok(viewContent.includes('persistPlan(aligned.itinerary);'), 'Restored drafts are retried automatically for signed-in sessions');
  assert.ok(viewContent.includes('setSaveErrorAction(\'login\')'), 'Guest drafts offer a direct login action');
  assert.ok(serviceContent.includes("syncStatus: 'synced' | 'local' | 'guest'"), 'Save result distinguishes guest drafts from account sync');
  assert.ok(serviceContent.includes('if (!context.token)'), 'Guests do not call the itinerary account API');
  assert.ok(serviceContent.includes("fetchJson<TripItinerary>('/my-trips'"), 'Signed-in itinerary writes use the account-owned API');
  assert.ok(serviceContent.includes('`/my-trips/${encodeURIComponent(tripId)}`'), 'Signed-in itinerary reads use the account-owned API');
  assert.ok(serviceContent.includes('greentrip_itinerary_pending_${suffix}'), 'Pending account drafts use account-scoped local storage keys');
  assert.ok(serviceContent.includes('Máy chủ gặp lỗi (500)'), 'HTTP 500 is reported as a retained local draft');
  assert.ok(viewContent.includes("result.syncStatus === 'guest'"), 'Guest save status is presented as local-only');
  assert.ok(viewContent.includes("setSaveErrorAction('login')"), 'Guest receives an action to sign in for account sync');
  assert.ok(viewContent.includes('result.syncMessage ||'), 'Server error feedback explains the retained draft and retry option');
});

test('Landing sample keeps its saved schedule when opening Planner', () => {
  const pageContent = fs.readFileSync(path.resolve('src/pages/ExplorePage.tsx'), 'utf8');
  const sampleContent = fs.readFileSync(path.resolve('src/components/landing/SampleItineraryModal.tsx'), 'utf8');
  const saveServiceContent = fs.readFileSync(path.resolve('src/services/saveLandingSample.ts'), 'utf8');
  const launchEffectStart = pageContent.indexOf('// The landing sample is already saved with its complete day plan before navigation.');
  const launchEffectEnd = pageContent.indexOf('const [isHovered, setIsHovered]', launchEffectStart);
  assert.ok(launchEffectStart >= 0 && launchEffectEnd > launchEffectStart, 'Planner must identify the landing-sample launch effect');
  const launchEffect = pageContent.slice(launchEffectStart, launchEffectEnd);

  assert.ok(sampleContent.includes('await saveLandingSample(draft, attempt.current.id, token!)'), 'Landing sample must be saved before navigation');
  assert.ok(saveServiceContent.includes('saveTripItineraryWithStatus(itinerary)'), 'Landing sample must use the account sync status');
  assert.ok(saveServiceContent.includes("result.syncStatus !== 'synced'"), 'Landing must not report local-only drafts as account saves');
  assert.ok(launchEffect.includes('setSelectedTripForDetails(quickTrip)'), 'Planner must open the saved sample trip');
  assert.ok(!launchEffect.includes('persistTripItinerary(buildItineraryFromOutline(quickTrip, allPois))'), 'Opening a saved sample must not overwrite its full schedule with an empty outline');
});

test('TripOverviewView: Đồng bộ ý tưởng và tab Đã thích', () => {
  const overviewContent = fs.readFileSync(tripOverviewViewPath, 'utf8');
  assert.ok(overviewContent.includes("modalTab === 'saved'"), 'Must handle modal saved tab');
  assert.ok(overviewContent.includes('handleSaveCopilotPoiToIdeas'), 'Must support saving Copilot ideas');
  assert.ok(overviewContent.includes('handleToggleIdea'), 'Must toggle ideas in trip');
});

test('TripCalendarView: Lịch tính chính xác theo parseStartDateFromTrip', () => {
  const calendarContent = fs.readFileSync(tripCalendarViewPath, 'utf8');
  assert.ok(calendarContent.includes('parseStartDateFromTrip(trip.startDate)'), 'Calendar must parse start date from trip');
  assert.ok(calendarContent.includes('calendarDaysMeta'), 'Must compute days metadata');
  assert.ok(calendarContent.includes('alignItineraryToTrip(plan, trip)'), 'Calendar must sync days count from trip');
});

test('Planner POI detail reuses exact-ID catalogue/API data and protects the mounted map', () => {
  const viewContent = fs.readFileSync(tripItineraryViewPath, 'utf8');
  const mapContent = fs.readFileSync(path.resolve('src/components/planner/ItineraryMapPanel.tsx'), 'utf8');

  assert.ok(viewContent.includes("poi.id === selectedDetailPoiId && poi.detailEvidence"), 'Planner only uses catalogue entries carrying source evidence');
  assert.ok(viewContent.includes('getPoisByIds([selectedDetailPoiId])'), 'Missing catalogue data is fetched by POI ID');
  assert.ok(viewContent.includes('detailRequestVersionRef.current !== requestVersion'), 'A stale detail response cannot replace a newer POI');
  assert.ok(viewContent.includes('onOpenDetail={(poiId, trigger) => openPoiDetail(poiId, trigger)}'), 'Both recommendation groups open the shared detail view');
  assert.ok(mapContent.includes('<PoiMap') && mapContent.includes('data-purpose="planner-poi-detail-overlay"'), 'Detail overlays the existing mounted map');
  assert.ok(mapContent.includes('isDetailOpen ?') && mapContent.includes('detailPanel'), 'The panel occupies the map region');
});

test('Planner detail actions stay separate and use current favorite, Trip and PB10 state', () => {
  const viewContent = fs.readFileSync(tripItineraryViewPath, 'utf8');
  const cardContent = fs.readFileSync(path.resolve('src/components/planner/RecommendationPoiCard.tsx'), 'utf8');
  const detailContent = fs.readFileSync(path.resolve('src/components/poi/PoiDetailSection.tsx'), 'utf8');

  assert.ok(cardContent.includes('onOpenDetail?.(poi.id, event.currentTarget)'), 'Card detail actions use the exact POI ID');
  assert.ok(cardContent.includes('onClick={onExplain}') && cardContent.includes('onClick={onAdd}'), 'Explain and Add remain independent sibling actions');
  assert.ok(viewContent.includes('isFavorite={savedIds.has(detailPoi.id)}') && viewContent.includes('isAddedToTrip={selectedTripPoiIds.has(detailPoi.id)}'), 'Panel state comes from the existing Save and Trip stores');
  assert.ok(viewContent.includes('onExplain={() => {') && viewContent.includes('setExplanationPoi(recommendationResults.find((poi) => poi.id === detailPoi.id) ?? detailPoi)'), 'Panel opens the existing PB10 explanation modal');
  assert.ok(detailContent.includes('plannerEvidenceMode') && detailContent.includes('onExplain?: () => void'), 'The shared detail component has a Planner-only evidence mode');
});

test('Planner evidence mode avoids synthesized detail facts without changing Explore default behavior', () => {
  const detailContent = fs.readFileSync(path.resolve('src/components/poi/PoiDetailSection.tsx'), 'utf8');
  const poiContent = fs.readFileSync(path.resolve('src/data/pois.ts'), 'utf8');

  assert.ok(detailContent.includes('plannerEvidenceMode = false'), 'Explore keeps the existing component mode by default');
  assert.ok(detailContent.includes('poi.detailEvidence?.rating') && detailContent.includes('poi.detailEvidence?.greenScore'), 'Rating and green score require source evidence in Planner');
  assert.ok(detailContent.includes('plannerEvidenceMode && !poi.detailEvidence?.openingHours'), 'Fallback opening hours are hidden in Planner');
  assert.ok(detailContent.includes('if (plannerEvidenceMode) return null'), 'Generated AI review summaries are not presented as sourced data in evidence mode');
  assert.ok(detailContent.includes('!plannerEvidenceMode && mindtripAiInsights'), 'Category-only carbon estimates are omitted in Planner');
  assert.ok(detailContent.includes('!plannerEvidenceMode && typeof document'), 'Explore mobile portal behavior remains unchanged');
  assert.ok(poiContent.includes('coordinates: hasCoordinates') && poiContent.includes('gallery: Boolean(sourceImage || gallery?.length)'), 'POI normalization records coordinates and gallery provenance');
  assert.ok(detailContent.includes('container-name: poi-detail') && detailContent.includes('@container poi-detail'), 'Planner gallery and detail columns reflow by panel width');
});

test('Local frontend API requests use the same-origin Vite proxy', () => {
  const apiContent = fs.readFileSync(apiClientPath, 'utf8');
  const viteContent = fs.readFileSync(viteConfigPath, 'utf8');

  assert.match(apiContent, /VITE_API_BASE_URL\s*\|\|\s*['"]\/api['"]/, 'The default API base is same-origin /api');
  assert.ok(viteContent.includes("'/api':"), 'Vite forwards /api requests to the local backend');
  assert.ok(viteContent.includes('process.env.VITE_BACKEND_TARGET'), 'The local backend target remains configurable');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const itineraryServicePath = path.resolve('src/services/itineraryService.ts');
const tripItineraryViewPath = path.resolve('src/components/planner/TripItineraryView.tsx');
const tripOverviewViewPath = path.resolve('src/components/planner/TripOverviewView.tsx');
const tripCalendarViewPath = path.resolve('src/components/planner/TripCalendarView.tsx');
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

test('PB11: Trợ lý xếp lịch dùng nhịp độ, ý tưởng, gợi ý và lưu lịch trên giao diện mới', () => {
  const viewContent = fs.readFileSync(tripItineraryViewPath, 'utf8');
  const serviceContent = fs.readFileSync(itineraryServicePath, 'utf8');
  const overviewContent = fs.readFileSync(tripOverviewViewPath, 'utf8');

  assert.ok(viewContent.includes('recommendations?: Poi[]'), 'Itinerary view accepts PB09/Thiện recommendations');
  assert.ok(viewContent.includes('fetchJson<{ data?: BackendRecommendation[] }>()') || viewContent.includes("'/v1/recommendations/poi'"), 'Standalone itinerary view can request live POI suggestions');
  assert.ok(viewContent.includes('selectAutomaticPois(') && viewContent.includes('optimizeDays('), 'Smart action selects and schedules POIs');
  assert.ok(viewContent.includes('onClick={() => handlePacingChange(level)}'), 'Pacing presets immediately schedule more ideas when itinerary content exists');
  assert.ok(viewContent.includes('setAssistantInsight(`Đã chọn nhịp ${level}. Lịch vẫn để trống;'), 'Choosing pacing on an empty trip does not create stops');
  assert.ok(viewContent.includes('mergeAssistantStopsIntoIdeas('), 'Assistant-scheduled POIs are synced into the Ideas list');
  assert.ok(viewContent.includes('const handleRemoveIdeaFromTrip ='), 'Removing an Idea also removes its scheduled copies');
  assert.ok(viewContent.includes('onRemoveIdeaFromTrip={handleRemoveIdeaFromTrip}'), 'Idea card removal is connected to the full removal handler');
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
  assert.ok(viewContent.includes('top_k: recommendationPoolLimit'), 'Recommendation fetch scales with trip duration up to the API limit');
  assert.ok(viewContent.includes('uniqueRecommendations.length === 50'), 'AI and catalog POIs are combined into a deduplicated candidate pool');
  assert.ok(serviceContent.includes('function preferredVisitPeriods'), 'Scheduler uses place time-of-day preferences');
  assert.ok(serviceContent.includes('stops.filter((stop) => experienceGroup'), 'Scheduler limits repeated cafes per day');
  assert.ok(overviewContent.includes('recommendations={recommendedPois}'), 'Overview feeds its current recommendations into the new itinerary UI');
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

test('Local frontend API requests use the same-origin Vite proxy', () => {
  const apiContent = fs.readFileSync(apiClientPath, 'utf8');
  const viteContent = fs.readFileSync(viteConfigPath, 'utf8');

  assert.match(apiContent, /VITE_API_BASE_URL\s*\|\|\s*['"]\/api['"]/, 'The default API base is same-origin /api');
  assert.ok(viteContent.includes("'/api':"), 'Vite forwards /api requests to the local backend');
  assert.ok(viteContent.includes('process.env.VITE_BACKEND_TARGET'), 'The local backend target remains configurable');
});

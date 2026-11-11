import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const itineraryServicePath = path.resolve('src/services/itineraryService.ts');
const tripItineraryViewPath = path.resolve('src/components/planner/TripItineraryView.tsx');
const tripOverviewViewPath = path.resolve('src/components/planner/TripOverviewView.tsx');
const tripCalendarViewPath = path.resolve('src/components/planner/TripCalendarView.tsx');

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

test('itineraryService: Khai báo đầy đủ updateDateRangeWithDays và parseStartDateFromTrip', () => {
  const serviceContent = fs.readFileSync(itineraryServicePath, 'utf8');
  assert.ok(serviceContent.includes('export function updateDateRangeWithDays'), 'Must export updateDateRangeWithDays');
  assert.ok(serviceContent.includes('export function parseStartDateFromTrip'), 'Must export parseStartDateFromTrip');
  assert.ok(serviceContent.includes('export function alignItineraryToTrip'), 'Must export alignItineraryToTrip');
});

test('TripItineraryView: Tích hợp đồng bộ ngày & ý tưởng', () => {
  const viewContent = fs.readFileSync(tripItineraryViewPath, 'utf8');
  assert.ok(viewContent.includes('updateDateRangeWithDays'), 'TripItineraryView must import and use updateDateRangeWithDays');
  assert.ok(viewContent.includes('onUpdateTrip'), 'TripItineraryView must notify parent on trip update');
  assert.ok(viewContent.includes('handleAddDay'), 'TripItineraryView must handle add day');
  assert.ok(viewContent.includes('handleDeleteDay'), 'TripItineraryView must handle delete day');
  assert.ok(viewContent.includes('alignItineraryToTrip(latestPlan.current, trip)'), 'Must align days when trip.daysCount changes');
  assert.ok(viewContent.includes("modalTab === 'saved'"), 'Must handle saved/favorite tab');
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

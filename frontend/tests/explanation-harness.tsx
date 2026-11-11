/* eslint-disable react-refresh/only-export-components -- Browser test entry point, not an HMR component module. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ExplanationModal from '../src/components/poi/ExplanationModal';
import PoiCard from '../src/components/poi/PoiCard';
import TripParametersForm from '../src/components/planner/TripParametersForm';
import ItineraryEditor from '../src/components/planner/ItineraryEditor';
import type { UserTrip } from '../src/pages/ExplorePage';
import { pois } from '../src/data/pois';
import '../src/index.css';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'success';
const preserveTimedStops = params.get('preserve-timed-stops') === 'yes';
const cafeCap = params.get('cafe-cap') === 'yes';
const multipleTimes = params.get('multiple-times') === 'yes';
const overlapError = params.get('overlap-error') === 'yes';
const manyPois = params.get('many-pois') === 'yes';
const requests: string[] = [];
const itineraryRequests: Array<{ method: string; payload?: Record<string, unknown> }> = [];
Object.assign(window, { explanationRequests: requests, itineraryRequests, cardClicks: 0 });
let attempts = 0;
let savedItinerary: Record<string, unknown> | null = null;
if (preserveTimedStops || overlapError) {
  savedItinerary = {
    trip_id: 'pb11-browser-trip',
    title: 'Kiểm thử trợ lý lịch trình',
    destination: 'Đà Nẵng & Huế',
    start_date: null,
    days_count: 1,
    days: [{
      day_id: 'pb11-browser-trip-day-1',
      day_number: 1,
      date: null,
      title: '',
      stops: overlapError ? [
        {
          stop_id: 'assistant-cafe', poi_id: null, title: 'Đi Lạc Coffee', city: 'Đà Nẵng', address: null,
          category: 'Ẩm thực', stop_type: 'poi', source: 'assistant', sequence: 0, duration_minutes: 90,
          start_time: '09:00', end_time: '10:30', comment: null, latitude: 16, longitude: 108,
        },
        {
          stop_id: 'idea-restaurant', poi_id: null, title: 'Nhà Hàng Bếp Cuốn', city: 'Đà Nẵng', address: null,
          category: 'Ẩm thực', stop_type: 'poi', source: 'manual', sequence: 1, duration_minutes: 75,
          start_time: '09:45', end_time: '11:00', comment: null, latitude: 16.01, longitude: 108.01,
        },
      ] : [
        {
          stop_id: 'morning-stop', poi_id: null, title: 'Điểm buổi sáng', city: 'Đà Nẵng', address: null,
          category: 'Địa điểm tự thêm', stop_type: 'custom', source: 'manual', sequence: 0, duration_minutes: 45,
          start_time: null, end_time: null, comment: null, latitude: 16, longitude: 108,
        },
        {
          stop_id: 'fixed-appointment', poi_id: null, title: 'Cuộc hẹn cố định', city: 'Đà Nẵng', address: null,
          category: 'Địa điểm tự thêm', stop_type: 'custom', source: 'manual', sequence: 1, duration_minutes: 60,
          start_time: '11:00', end_time: '12:00', comment: null, latitude: 16.05, longitude: 108.05,
        },
      ],
    }],
  };
}
const autoSelectedIds: string[] = [];
Object.assign(window, { autoSelectedIds });

// Browser fixtures exercise the real components without contacting production services.
window.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes('/itinerary')) {
    const method = init?.method || 'GET';
    if (method === 'PUT') {
      const payload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      itineraryRequests.push({ method, payload });
      if (overlapError && itineraryRequests.filter((request) => request.method === 'PUT').length === 1) {
        return Response.json({ detail: "Value error, Ngày 1 có khung giờ bị trùng giữa 'Đi Lạc Coffee' và 'Nhà Hàng Bếp Cuốn'." }, { status: 422 });
      }
      savedItinerary = payload;
      return Response.json({ ...payload, updated_at: '2026-11-09T10:00:00Z' });
    }
    itineraryRequests.push({ method });
    return savedItinerary
      ? Response.json({ ...savedItinerary, updated_at: '2026-11-09T10:00:00Z' })
      : Response.json({ detail: 'Chưa có lịch trình được lưu.' }, { status: 404 });
  }
  requests.push(url);
  if (url.includes('explanation-facts')) {
    attempts++;
    const id = url.includes(B) ? B : A;
    await new Promise((resolve) => setTimeout(resolve, mode === 'race' && id === A ? 400 : 80));
    if (mode === 'error' || (mode === 'retry' && attempts === 1)) return Response.json({}, { status: 503 });
    if (mode === 'missing') return Response.json({}, { status: 404 });
    return Response.json({
      poi: { id: mode === 'mismatch' ? B : id, name: `POI ${id === A ? 'A' : 'B'}`, is_local_business: true },
      facts: mode === 'empty' ? [] : [{ relationship: 'IN_CATEGORY', target_type: 'Category', target_key: id, target_name: id === A ? 'FACT A' : 'FACT B' }],
    });
  }
  if (url.includes('validate-parameters')) {
    return Response.json({ valid: true, message: 'OK', data: {
      destination: 'Đà Nẵng', days: 3, num_people: 2, total_budget: 6000000,
      daily_budget_per_person: 1000000, budget_tier: 'standard', pacing_level: 'Relaxed',
      pacing_label: 'Thong thả', pacing_desc: 'Thư giãn', is_budget_sufficient: true,
      min_recommended_budget: 2400000, budget_warning: null, preferences: ['culture'],
      cost_breakdown: { accommodation: 2000000, food_and_beverage: 2000000, transportation: 1000000, activities_and_tickets: 1000000 },
      recommendations: [],
    } });
  }
  if (url.includes('/pois/weights')) return Response.json({ normalized_green_weight: 0.6, normalized_budget_weight: 0.4 });
  if (url.includes('/recommendations/poi')) return Response.json({ status: 'success', total: 2, data: [A, B].map((id, index) => ({
    poi_id: id, name: `POI ${index === 0 ? 'A' : 'B'}`, category_name: 'Di tích', match_score: 90,
    estimated_cost: 0, satisfaction_score: 4.5, is_local_business: false, green_score: 0.8,
    lat: 16, lng: 108, explanation_snippet: `SNIPPET ${index === 0 ? 'A' : 'B'}`,
  })) });
  return Response.json({ items: [], pagination: { total_pages: 1, has_next: false } });
};

function Harness() {
  const [id, setId] = useState(A);
  const [open, setOpen] = useState(false);
  if (params.get('component') === 'planner') return <TripParametersForm />;
  if (params.get('component') === 'itinerary') {
    const hasRecommendations = params.get('auto-recommendations') === 'yes' || preserveTimedStops || multipleTimes || overlapError || manyPois;
    const trip: UserTrip = {
      id: 'pb11-browser-trip', title: 'Kiểm thử trợ lý lịch trình', destination: 'Đà Nẵng & Huế',
      daysCount: manyPois ? 4 : 1, peopleCount: 2, createdAt: '2026-11-09', pacingLevel: 'Fast', pacingLabel: '⚡ Dày đặc',
      totalBudget: manyPois ? 8_000_000 : 2_000_000,
      costBreakdown: { accommodation: 500_000, food_and_beverage: 500_000, transportation: 500_000, activities_and_tickets: manyPois ? 5_000_000 : 500_000 },
      itineraryOutline: [{
        day: 1, theme: 'Khám phá Đà Nẵng', focus_city: 'Đà Nẵng', suggested_activities: [],
        rest_periods: [
          { time_range: '09:30–10:00', activity: 'Dừng chân uống nước.', duration_minutes: 30 },
          { time_range: '12:00–14:00', activity: 'Ăn trưa chậm rãi và nghỉ ngơi.', duration_minutes: 90 },
        ],
        assistant_tip: 'Giữ thời gian nghỉ để không phải di chuyển liên tục.',
      }],
    };
    const customIdeas = manyPois ? Array.from({ length: 8 }, (_, index) => ({
      ...pois[0], id: `custom-large-${index}`, name: `Ý tưởng ${index + 1}`,
      category: ['di-tich', 'canh-quan', 'quan-an', 'chua'][index % 4] as typeof pois[number]['category'],
      city: 'Đà Nẵng' as const, lat: 16 + index * 0.005, lng: 108,
      estimatedCost: 0, average_visit_minutes: 60, visitDuration: '60 phút',
    })) : preserveTimedStops || overlapError ? [] : cafeCap ? [
      'Cà phê A', 'Cà phê B', 'Cà phê C',
    ].map((name, index) => ({
      ...pois[0], id: `custom-cafe-${index}`, name, category: 'quan-an' as const,
      sub_category: 'cafe', city: 'Đà Nẵng' as const, address: 'Đường Hải Phòng',
      lat: Number.NaN, lng: Number.NaN, estimatedCost: 0,
      average_visit_minutes: 60, visitDuration: '60 phút',
    })) : [
      { ...pois[0], id: 'custom-Cafe-Yen', name: 'Cà phê Yên', city: 'Đà Nẵng' as const, address: 'Đường Hải Phòng', lat: Number.NaN, lng: Number.NaN, estimatedCost: 0 },
      { ...pois[0], id: 'custom-Banh-Mi', name: 'Bánh mì Cô Ba', city: 'Đà Nẵng' as const, address: 'Đường Lê Duẩn', lat: Number.NaN, lng: Number.NaN, estimatedCost: 0 },
    ];
    const recommendationIds = manyPois
      ? Array.from({ length: 10 }, (_, index) => `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`)
      : preserveTimedStops ? [A, B, C] : [A, B];
    const recommendations = hasRecommendations ? recommendationIds.map((id, index) => ({
      ...pois[0], id, name: manyPois ? `POI ${index + 1}` : `POI ${index === 0 ? 'A' : 'B'}`, category: (manyPois ? ['di-tich', 'canh-quan', 'quan-an', 'chua'][index % 4] : 'di-tich') as typeof pois[number]['category'],
      city: 'Đà Nẵng' as const, lat: 16 + index * 0.01, lng: 108, estimatedCost: 100_000,
      average_visit_minutes: 60, visitDuration: '60 phút', rating: 4.8 - index * 0.1,
      best_time: multipleTimes ? ['morning', 'evening'] : [],
    })) : [];
    return <ItineraryEditor trip={trip} ideas={customIdeas} recommendations={recommendations}
      onSelectIdeas={(ids) => { autoSelectedIds.splice(0, autoSelectedIds.length, ...ids); }}
      onClose={() => undefined} onAddIdea={() => undefined} />;
  }
  if (params.get('component') === 'card') return <PoiCard
    poi={{ ...pois[0], id: A, name: 'POI A', image: '' }}
    onClick={() => Object.assign(window, { cardClicks: Number(Reflect.get(window, 'cardClicks')) + 1 })}
    onHover={() => undefined} onToggleFavorite={() => undefined}
  />;
  return <>
    <button id="open" onClick={() => setOpen(true)}>Open</button>
    <button id="switch" onClick={() => setId(B)}>Switch</button>
    <ExplanationModal poiId={id} poiName={`POI ${id === A ? 'A' : 'B'}`}
      explanationSnippet={`SNIPPET ${id === A ? 'A' : 'B'}`} isOpen={open} onClose={() => setOpen(false)} />
  </>;
}

createRoot(document.getElementById('root')!).render(<Harness />);

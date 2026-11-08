/* eslint-disable react-refresh/only-export-components -- Browser test entry point, not an HMR component module. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ExplanationModal from '../src/components/poi/ExplanationModal';
import PoiCard from '../src/components/poi/PoiCard';
import TripParametersForm from '../src/components/planner/TripParametersForm';
import { pois } from '../src/data/pois';
import '../src/index.css';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'success';
const requests: string[] = [];
Object.assign(window, { explanationRequests: requests, cardClicks: 0 });
let attempts = 0;

// Browser fixtures exercise the real components without contacting production services.
window.fetch = async (input) => {
  const url = String(input);
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
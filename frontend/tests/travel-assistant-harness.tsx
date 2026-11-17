/* eslint-disable react-refresh/only-export-components -- Isolated browser QA entry. */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import TravelAssistant from "../src/components/planner/TravelAssistant";
import { SavedPlacesProvider } from "../src/context/SavedPlacesContext";
import { login } from "../src/services/auth";
import type { UserTrip } from "../src/pages/ExplorePage";
import "../src/index.css";
import { fetchJson } from '../src/lib/api';
import type { TripItinerary } from '../src/services/itineraryService';
import CreateTripMindtripModal from '../src/components/planner/CreateTripMindtripModal';

function Harness() {
  const [error, setError] = useState("");
  const [email, setEmail] = useState("assistant-qa@example.test");
  const [password, setPassword] = useState("AssistantQA123!");
  const sampleDemo=new URLSearchParams(location.search).has('sample');
  const [createOpen,setCreateOpen]=useState(false);
  const firstTrip:UserTrip={
    id: sampleDemo ? 'sample-assistant-qa' : new URLSearchParams(location.search).has('foreign') ? 'foreign-assistant-qa' : "assistant-qa-trip-a",
    title: "Huế QA · chuyến A",
    destination: "Huế",
    daysCount: 2,
    startDate: "2026-12-20",
    peopleCount: 2,
    createdAt: "2026-11-16",
    ideas: sampleDemo ? ['cafe-garden','museum'] : [],
  };
  const [trips,setTrips]=useState<Record<string,UserTrip>>({
    a:firstTrip,b:{...firstTrip,id:'assistant-qa-trip-b',title:'Huế QA · chuyến B',ideas:[]},
  });
  const [activeTrip,setActiveTrip]=useState<'a'|'b'>('a');
  const trip=trips[activeTrip];
  const setTrip=(update:(previous:UserTrip)=>UserTrip)=>setTrips(previous=>({...previous,[activeTrip]:update(previous[activeTrip])}));
  const [opened,setOpened]=useState(true);
  const [aiEnabled,setAiEnabled]=useState(false);
  const [saved,setSaved]=useState<TripItinerary|null>(null);
  useEffect(()=>{void fetchJson<{ai_enabled:boolean}>('/health').then(r=>setAiEnabled(r.ai_enabled));},[]);
  useEffect(()=>setSaved(null),[activeTrip]);
  const [mode, setMode] = useState<"discover" | "planner">("discover");
  return (
    <main style={{maxWidth:900}} className="mx-auto p-3 sm:p-6 text-sm text-neutral-800">
      <h1 className="text-xl font-semibold">
        Kiểm thử trợ lý · dữ liệu cục bộ
      </h1>
      <form
        className="my-3 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void login({ email, password })
            .then((result) => {
              sessionStorage.setItem("access_token", result.access_token);
              window.dispatchEvent(new Event("auth-change"));
              setError("");
            })
            .catch((reason) => setError(String(reason)));
        }}
      >
        <label>
          Email
          <input
            aria-label="Email QA"
            className="block border p-2 max-w-full"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Mật khẩu
          <input
            type="password"
            aria-label="Mật khẩu QA"
            className="block border p-2 max-w-full"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="min-h-11 rounded-full border px-4">
          Đăng nhập QA
        </button>
        <button
          type="button"
          className="min-h-11 underline"
          onClick={() => {
            sessionStorage.removeItem("access_token");
            localStorage.removeItem("access_token");
            window.dispatchEvent(new Event("auth-change"));
          }}
        >
          Đăng xuất QA
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <div className="my-3 flex flex-wrap gap-2">
        <label>
          Luồng
          <select
            aria-label="Luồng"
            className="min-h-11 border px-2"
            value={mode}
            onChange={(event) =>
              setMode(event.target.value as "discover" | "planner")
            }
          >
            <option value="discover">Khám phá</option>
            <option value="planner">Lên lịch</option>
          </select>
        </label>
        <button
          className="min-h-11 border px-3"
          onClick={() => setActiveTrip(previous=>previous==='a'?'b':'a')}
        >
          Đổi chuyến A/B
        </button>
        <button type="button" className="min-h-11 border px-3" onClick={()=>setOpened(value=>!value)}>{opened?'Đóng chat QA':'Mở chat QA'}</button>
        <label className="py-3"><input type="checkbox" aria-label="Bật AI demo" checked={aiEnabled} onChange={event=>{
          const enabled=event.target.checked;
          void fetchJson<{ai_enabled:boolean}>('/qa/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})})
            .then(r=>{setAiEnabled(r.ai_enabled);setError('');}).catch(reason=>setError(String(reason)));
        }}/> AI demo: {aiEnabled?'Bật':'Tắt'}</label>
        <p className="py-3">
          Ý tưởng: {trip.ideas?.length || 0} · {trip.id}
        </p>
      </div>
      <div style={{height:'min(650px, 65vh)'}} className="border rounded-2xl overflow-hidden">
        {opened && <TravelAssistant
          onCreatePrivateTrip={()=>setCreateOpen(true)}
          mode={mode}
          trip={trip}
          onIdeasChange={(ideas) =>
            setTrip((previous) => ({ ...previous, ideas }))
          }
          onBudgetChange={(totalBudget) =>
            setTrip((previous) => ({ ...previous, totalBudget }))
          }
          onApplied={()=>void fetchJson<{itinerary:TripItinerary}>(`/qa/state?trip_id=${encodeURIComponent(trip.id)}`).then(r=>setSaved(r.itinerary))}
        />}
      </div>
      {createOpen && <CreateTripMindtripModal isOpen onClose={()=>setCreateOpen(false)} onCreateTrip={created=>setTrip(()=>({...created,ideas:[...(trip.ideas||[])]}))}/>}
      {saved && <section aria-label="Lịch đã lưu SQLite" className="mt-4 border rounded-2xl p-3"><h2 className="font-semibold">Lịch đã lưu SQLite · {saved.title}</h2>{saved.days.map(day=><div key={day.day_id}><h3>Ngày {day.day_number}</h3>{day.stops.map(stop=><p key={stop.stop_id}>{stop.start_time}–{stop.end_time} · {stop.title}</p>)}</div>)}</section>}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <SavedPlacesProvider>
      <Harness />
    </SavedPlacesProvider>
  </BrowserRouter>,
);

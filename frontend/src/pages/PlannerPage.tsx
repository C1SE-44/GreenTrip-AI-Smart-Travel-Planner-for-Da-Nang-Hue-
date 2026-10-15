import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Compass, 
  Heart, 
  CalendarCheck, 
  PlusCircle, 
  Sparkles, 
  MapPin, 
  Train, 
  Bus, 
  AlertTriangle,
  Leaf,
  CheckCircle2,
  TrendingDown
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import Logo from '@/components/ui/Logo';
import SustainabilitySliders from '@/components/planner/SustainabilitySliders';
import { getMe, type UserProfile } from '@/services/auth';

// Fix Leaflet marker icons in React
const createCorridorIcon = (color: string, label: string) => {
  return L.divIcon({
    className: 'custom-corridor-pin',
    html: `
      <div style="background-color: ${color};" class="w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-white text-[10px] font-bold">
        ${label}
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

const CORRIDOR_POINTS = [
  { id: 'hue', name: 'Cố đô Huế (Kinh thành)', coords: [16.4637, 107.5809] as [number, number], label: '1', color: '#194D33' },
  { id: 'lang-co', name: 'Vịnh Lăng Cô (Sinh thái)', coords: [16.2300, 107.9900] as [number, number], label: '2', color: '#22362B' },
  { id: 'hai-van', name: 'Đèo Hải Vân (Hải Vân Quan)', coords: [16.1950, 108.1300] as [number, number], label: '3', color: '#2D4A3E' },
  { id: 'da-nang', name: 'Đà Nẵng (Bán đảo Sơn Trà)', coords: [16.0544, 108.2422] as [number, number], label: '4', color: '#1F8A5B' },
];

const ROUTE_LINE: [number, number][] = [
  [16.4637, 107.5809],
  [16.2300, 107.9900],
  [16.1950, 108.1300],
  [16.0544, 108.2422],
];

export default function PlannerPage() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [currentWeights, setCurrentWeights] = useState<Record<string, number>>({
    co2: 26,
    budget: 11,
    crowd: 18,
    local: 21,
    satisfaction: 16,
    time: 8,
  });

  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadUser() {
      try {
        const profile = await getMe();
        if (active) setCurrentUser(profile);
      } catch {
        if (active) setCurrentUser(null);
      }
    }
    loadUser();
    return () => {
      active = false;
    };
  }, []);

  const handleGeneratePlan = (weights: Record<string, number>) => {
    setCurrentWeights(weights);
    setNotification('Đã ghi nhận trọng số bền vững! Hệ thống AI đang liên kết dữ liệu PB08 sang thuật toán gợi ý lộ trình.');
    setTimeout(() => setNotification(null), 4000);
  };

  // Dynamic calculations based on live sliders
  const co2Val = currentWeights.co2 || 26;
  const budgetVal = currentWeights.budget || 11;
  const localVal = currentWeights.local || 21;

  const co2Reduction = Math.min(50, Math.max(12, Math.round(co2Val * 0.8 + 12)));
  const ecoScore = Math.min(99, Math.max(68, Math.round(55 + co2Val * 0.7 + localVal * 0.25)));

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F8F9FA] text-[#111827] font-sans select-none">
      {/* ========================================================= */}
      {/* 1. LEFT SIDEBAR (240px) */}
      {/* ========================================================= */}
      <aside className="w-[240px] shrink-0 bg-white border-r border-gray-100 flex flex-col justify-between py-6 px-4 z-20">
        <div className="space-y-6">
          {/* Logo Brand Header */}
          <Link to="/" className="flex items-center gap-2.5 px-2 hover:opacity-85 transition">
            <Logo size="md" />
          </Link>

          {/* Navigation Menu */}
          <nav className="space-y-1 text-sm font-medium">
            <Link
              to="/explore"
              className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            >
              <Compass size={18} className="text-gray-400" />
              <span>Khám phá</span>
            </Link>

            <Link
              to="/my-trips"
              className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            >
              <Heart size={18} className="text-gray-400" />
              <span>Đã lưu</span>
            </Link>

            <Link
              to="/planner"
              className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl bg-gray-100 text-gray-900 font-semibold transition-colors"
            >
              <CalendarCheck size={18} className="text-gray-900" />
              <span>Lịch trình</span>
            </Link>

            <Link
              to="/explore"
              className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            >
              <PlusCircle size={18} className="text-gray-400" />
              <span>Tạo chuyến mới</span>
            </Link>
          </nav>

          {/* New Chat Pill Button */}
          <button
            type="button"
            onClick={() => setNotification('Trợ lý AI GreenTrip sẽ kích hoạt trong Sprint 2 tiếp theo!')}
            className="w-full py-2.5 px-4 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
          >
            <Sparkles size={14} className="text-emerald-700" />
            <span>Trò chuyện AI</span>
          </button>
        </div>

        {/* User profile & footer */}
        <div className="space-y-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#22362B] text-[#D1FAE5] font-semibold text-xs flex items-center justify-center">
                {currentUser?.full_name ? currentUser.full_name[0].toUpperCase() : 'N'}
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-gray-900 leading-tight truncate max-w-[120px]">
                  {currentUser?.full_name || 'Nguyên'}
                </p>
                <p className="text-[11px] text-gray-400 font-normal truncate max-w-[120px]">
                  {currentUser?.email || '@greentrip-user'}
                </p>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 px-1">© 2026 GreenTrip AI • Du lịch xanh</p>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* 2. CENTER PLANNER PANEL (660px, Scrollable) */}
      {/* ========================================================= */}
      <main className="w-[660px] shrink-0 bg-white flex flex-col h-full border-r border-gray-200 overflow-y-auto">
        <div className="p-8">
          {notification && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{notification}</span>
            </div>
          )}

          <SustainabilitySliders
            initialWeights={currentWeights}
            onChange={(w) => setCurrentWeights(w)}
            onGeneratePlan={handleGeneratePlan}
          />
        </div>
      </main>

      {/* ========================================================= */}
      {/* 3. RIGHT MAP & IMPACT PREVIEW PANEL (Remaining width) */}
      {/* ========================================================= */}
      <section className="flex-1 h-full relative flex flex-col bg-gray-50 overflow-hidden">
        {/* Top Header of Map Panel */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
          <div className="bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-gray-200 shadow-md flex items-center gap-2 pointer-events-auto text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-gray-800">Hành lang Di sản Huế – Đà Nẵng</span>
          </div>

          <div className="bg-amber-50/95 border border-amber-200 backdrop-blur-md px-3 py-1.5 rounded-full text-amber-800 text-[11px] font-semibold flex items-center gap-1.5 shadow-md pointer-events-auto">
            <AlertTriangle size={13} className="text-amber-600" />
            <span>Giờ cao điểm Sơn Trà: 16:30 - 18:00</span>
          </div>
        </div>

        {/* Live Leaflet Corridor Map */}
        <div className="w-full h-full">
          <MapContainer
            center={[16.3000, 107.9500]}
            zoom={10}
            scrollWheelZoom={true}
            className="w-full h-full"
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Polyline connecting Corridor */}
            <Polyline
              positions={ROUTE_LINE}
              color="#22362B"
              weight={4}
              dashArray="6, 8"
              opacity={0.8}
            />

            {CORRIDOR_POINTS.map((pt) => (
              <Marker
                key={pt.id}
                position={pt.coords}
                icon={createCorridorIcon(pt.color, pt.label)}
              >
                <Popup className="font-sans text-xs">
                  <strong>{pt.name}</strong>
                  <br />
                  Trạm dừng xanh trên tuyến
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Bottom Floating Green Impact Card */}
        <div className="absolute bottom-6 left-6 right-6 z-10">
          <div className="bg-[#22362B] text-white rounded-3xl p-5 shadow-2xl border border-white/10 backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#D1FAE5] text-[#22362B] flex items-center justify-center font-bold">
                  <Leaf size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Chỉ số Bền vững Hành trình</h3>
                  <p className="text-[11px] text-gray-300">Cập nhật tương thích theo PB08 & PB09</p>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-flex items-center gap-1 bg-[#D1FAE5] text-[#065F46] font-extrabold text-xs px-2.5 py-0.5 rounded-full">
                  <TrendingDown size={13} />
                  -{co2Reduction}% CO₂
                </span>
              </div>
            </div>

            {/* Metrics breakdown */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-center">
              <div className="p-2 bg-white/5 rounded-2xl">
                <span className="block text-[10px] text-gray-300">Điểm Eco-Score</span>
                <strong className="text-base font-extrabold text-[#D1FAE5]">{ecoScore}/100</strong>
              </div>
              <div className="p-2 bg-white/5 rounded-2xl">
                <span className="block text-[10px] text-gray-300">Phương tiện ưu tiên</span>
                <strong className="text-xs font-bold text-white flex items-center justify-center gap-1 mt-0.5">
                  <Train size={12} /> Tàu hỏa
                </strong>
              </div>
              <div className="p-2 bg-white/5 rounded-2xl">
                <span className="block text-[10px] text-gray-300">Giảm chi phí</span>
                <strong className="text-base font-extrabold text-white">~{budgetVal >= 35 ? '35%' : '18%'}</strong>
              </div>
            </div>

            {/* Quick transportation note */}
            <div className="flex items-center justify-between text-[11px] text-gray-300 pt-1">
              <span className="flex items-center gap-1">
                <Train size={12} className="text-emerald-400" /> Tàu SE Huế - Đà Nẵng
              </span>
              <span className="flex items-center gap-1">
                <Bus size={12} className="text-emerald-400" /> Xe bus điện VinBus
              </span>
              <span className="text-emerald-300 font-medium">Bảo vệ vịnh Lăng Cô</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  Calendar, 
  MapPin, 
  Route as RouteIcon, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  ChevronRight,
  Maximize2,
  Minimize2,
  Navigation,
  Car,
  Bike,
  Bus,
  Footprints,
  Train,
  Sparkles,
  DollarSign,
  Leaf,
  ShieldCheck,
  X,
  ArrowRight,
  ExternalLink,
  ListFilter,
  CheckCircle2
} from 'lucide-react';
import {
  fetchDayRoute,
  updateSegmentTransport,
  estimateCarbonFootprint,
  formatCarbonAmount,
  type DayRouteResponse,
  type RouteStop,
  type RouteSegment,
  type TransportModeOption,
  type RouteTransportMode,
} from '@/services/itineraryService';

export interface ItineraryRouteMapProps {
  itineraryId?: string;
  initialDay?: number;
  totalDays?: number;
  selectedStopId?: string | null;
  onSelectStop?: (stop: RouteStop | null) => void;
  className?: string;
  showStopsList?: boolean;
}

export type TransportMode = RouteTransportMode;

function getClientFallbackDayRoute(itineraryId: string, dayNum: number): DayRouteResponse {
  const dayTemplates: {
    stops: { poi_id: string; name: string; latitude: number; longitude: number }[];
    coords: [number, number][];
    dist: number;
    dur: number;
  }[] = [
    // Day 1: Biểu tượng Đà Nẵng
    {
      stops: [
        { poi_id: 'poi_cau_rong', name: 'Cầu Rồng Đà Nẵng', latitude: 16.0611, longitude: 108.2270 },
        { poi_id: 'poi_cho_han', name: 'Chợ Hàn Đà Nẵng', latitude: 16.0678, longitude: 108.2208 },
        { poi_id: 'poi_linh_ung', name: 'Chùa Linh Ứng Bãi Bụt', latitude: 16.1005, longitude: 108.2778 },
      ],
      coords: [
        [108.2270, 16.0611],
        [108.2250, 16.0645],
        [108.2208, 16.0678],
        [108.2350, 16.0850],
        [108.2778, 16.1005],
      ],
      dist: 13900,
      dur: 1105,
    },
    // Day 2: Danh thắng & Biển
    {
      stops: [
        { poi_id: 'poi_ngu_hanh_son', name: 'Danh thắng Ngũ Hành Sơn', latitude: 16.0044, longitude: 108.2635 },
        { poi_id: 'poi_my_khe', name: 'Bãi biển Mỹ Khê', latitude: 16.0592, longitude: 108.2435 },
      ],
      coords: [
        [108.2635, 16.0044],
        [108.2540, 16.0300],
        [108.2435, 16.0592],
      ],
      dist: 8200,
      dur: 720,
    },
    // Day 3: Bà Nà Hills
    {
      stops: [
        { poi_id: 'poi_ba_na', name: 'Khu du lịch Bà Nà Hills & Cầu Vàng', latitude: 15.9988, longitude: 107.9960 },
      ],
      coords: [
        [107.9960, 15.9988],
      ],
      dist: 36000,
      dur: 2700,
    },
    // Day 4: Cố đô Huế
    {
      stops: [
        { poi_id: 'poi_dai_noi', name: 'Đại Nội Huế (Hoàng Thành)', latitude: 16.4699, longitude: 107.5779 },
        { poi_id: 'poi_thien_mu', name: 'Chùa Thiên Mụ Huế', latitude: 16.4533, longitude: 107.5451 },
        { poi_id: 'poi_dong_ba', name: 'Chợ Đông Ba Huế', latitude: 16.4719, longitude: 107.5878 },
      ],
      coords: [
        [107.5779, 16.4699],
        [107.5600, 16.4600],
        [107.5451, 16.4533],
        [107.5700, 16.4650],
        [107.5878, 16.4719],
      ],
      dist: 9800,
      dur: 840,
    },
    // Day 5: Lăng tẩm hoàng gia
    {
      stops: [
        { poi_id: 'poi_khai_dinh', name: 'Lăng Khải Định (Ứng Lăng)', latitude: 16.3989, longitude: 107.5904 },
        { poi_id: 'poi_tu_duc', name: 'Lăng Tự Đức (Khiêm Lăng)', latitude: 16.4331, longitude: 107.5658 },
      ],
      coords: [
        [107.5904, 16.3989],
        [107.5800, 16.4150],
        [107.5658, 16.4331],
      ],
      dist: 7600,
      dur: 680,
    },
  ];

  const tIdx = Math.max(0, (dayNum - 1) % dayTemplates.length);
  const tmpl = dayTemplates[tIdx];
  const fallbackStops = tmpl.stops.map((s, idx) => ({ ...s, order: idx + 1 }));
  const fallbackSegments: RouteSegment[] = fallbackStops.slice(0, -1).map((s, idx) => {
    const nextS = fallbackStops[idx + 1];
    const segDist = Math.round(tmpl.dist / Math.max(1, fallbackStops.length - 1));
    const segDur = Math.round(tmpl.dur / Math.max(1, fallbackStops.length - 1));
    return {
      segment_index: idx,
      from_stop: s,
      to_stop: nextS,
      distance_meters: segDist,
      duration_seconds: segDur,
      is_intercity: false,
      recommended_mode: 'motorcycle',
      selected_mode: 'motorcycle',
      options: [
        {
          mode: 'motorcycle',
          label: 'Xe máy',
          icon: 'Bike',
          duration_seconds: segDur,
          duration_text: `${Math.round(segDur / 60)} phút`,
          distance_meters: segDist,
          estimated_cost_vnd: 15000,
          carbon_g: 250,
          carbon_kg: 0.25,
          score: 85.0,
          is_feasible: true,
          feasibility_note: 'Khả thi',
          recommendation_type: 'best_match',
          reason: 'Nhanh chóng và linh hoạt',
        },
        {
          mode: 'electric_bus',
          label: 'Xe buýt điện',
          icon: 'Bus',
          duration_seconds: Math.round(segDur * 1.4),
          duration_text: `${Math.round((segDur * 1.4) / 60)} phút`,
          distance_meters: segDist,
          estimated_cost_vnd: 8000,
          carbon_g: 80,
          carbon_kg: 0.08,
          score: 82.0,
          is_feasible: true,
          feasibility_note: 'Khả thi',
          recommendation_type: 'eco_friendly',
          reason: 'Phương tiện xanh thân thiện môi trường',
        },
      ],
    };
  });

  return {
    itinerary_id: itineraryId,
    day_number: dayNum,
    total_days: 5,
    total_stops: tmpl.stops.length,
    stops: fallbackStops,
    route: {
      type: 'LineString',
      coordinates: tmpl.coords,
    },
    distance_meters: tmpl.dist,
    duration_seconds: tmpl.dur,
    is_fallback: true,
    routing_provider: 'client_fallback',
    segments: fallbackSegments,
    day_total_cost_vnd: fallbackSegments.length * 15000,
    day_total_carbon_kg: fallbackSegments.length * 0.25,
  };
}

function getTransportIcon(mode: string) {
  switch (mode) {
    case 'walking':
      return <Footprints size={14} />;
    case 'bicycle':
    case 'motorcycle':
      return <Bike size={14} />;
    case 'electric_bus':
    case 'public_bus':
    case 'tourist_coach':
      return <Bus size={14} />;
    case 'train':
      return <Train size={14} />;
    case 'taxi_car':
    case 'private_car':
    case 'driving':
    default:
      return <Car size={14} />;
  }
}

function getTransportLabel(mode: string): string {
  switch (mode) {
    case 'walking': return 'Đi bộ';
    case 'bicycle': return 'Xe đạp';
    case 'motorcycle': return 'Xe máy';
    case 'electric_bus': return 'Xe buýt điện';
    case 'public_bus': return 'Xe buýt';
    case 'train': return 'Tàu hỏa';
    case 'tourist_coach': return 'Xe khách';
    case 'taxi_car': return 'Taxi / Ô tô';
    case 'private_car': return 'Ô tô riêng';
    case 'driving': return 'Ô tô';
    default: return mode;
  }
}


// ─── 1. GOOGLE MAPS AUTHENTIC MARKER ICONS ───

// Pin xuất phát Google Maps: Chấm tròn trắng viền xanh dương với tâm xanh đậm
function createGoogleStartMarkerIcon(isSelected: boolean): L.DivIcon {
  const size = isSelected ? 34 : 26;
  const half = Math.round(size / 2);

  const html = `
    <div class="gt-google-start-pin relative flex items-center justify-center transition-transform duration-200 ${
      isSelected ? 'scale-115 z-50' : ''
    }" style="width: ${size}px; height: ${size}px;">
      <div class="absolute inset-0 rounded-full bg-white shadow-[0_3px_10px_rgba(0,0,0,0.35)] border-[2.5px] border-[#1a73e8] flex items-center justify-center">
        <div class="w-2.5 h-2.5 rounded-full bg-[#1a73e8] ring-2 ring-blue-200"></div>
      </div>
      ${
        isSelected
          ? '<div class="absolute -inset-1.5 rounded-full border-2 border-blue-500 animate-ping opacity-60 pointer-events-none"></div>'
          : ''
      }
    </div>
  `;

  return L.divIcon({
    className: 'gt-google-marker-wrapper',
    html,
    iconSize: [size, size],
    iconAnchor: [half, half],
    popupAnchor: [0, -half],
  });
}

// Pin điểm đến Google Maps: Hình giọt nước đỏ đặc trưng với chấm tròn trắng ở giữa
function createGoogleDestinationMarkerIcon(isSelected: boolean): L.DivIcon {
  const width = isSelected ? 36 : 30;
  const height = isSelected ? 48 : 40;

  const html = `
    <div class="gt-google-dest-pin relative flex items-center justify-center transition-transform duration-200 ${
      isSelected ? 'scale-110 drop-shadow-[0_8px_18px_rgba(234,67,53,0.45)] z-50' : 'drop-shadow-md'
    }">
      <svg width="${width}" height="${height}" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.16344 0 0 7.16344 0 16C0 26 13 38 16 42C19 38 32 26 32 16C32 7.16344 24.8366 0 16 0Z" fill="#EA4335"/>
        <path d="M16 0C7.16344 0 0 7.16344 0 16C0 24 10 35 16 41C22 35 32 24 32 16C32 7.16344 24.8366 0 16 0Z" fill="#EA4335"/>
        <circle cx="16" cy="15" r="5.5" fill="white"/>
      </svg>
    </div>
  `;

  return L.divIcon({
    className: 'gt-google-marker-wrapper',
    html,
    iconSize: [width, height],
    iconAnchor: [Math.round(width / 2), height],
    popupAnchor: [0, -height],
  });
}

// Pin trạm dừng ở giữa: Nền trắng viền xanh Google Maps có số thứ tự in đậm
function createGoogleWaypointMarkerIcon(order: number, isSelected: boolean): L.DivIcon {
  const size = isSelected ? 34 : 28;
  const half = Math.round(size / 2);

  const html = `
    <div class="gt-google-waypoint-pin relative flex items-center justify-center transition-transform duration-200 ${
      isSelected ? 'scale-110 z-50' : ''
    }" style="width: ${size}px; height: ${size}px;">
      <div class="absolute inset-0 rounded-full flex items-center justify-center font-black ${
        isSelected
          ? 'bg-[#1a73e8] text-white shadow-[0_4px_14px_rgba(26,115,232,0.45)] ring-3 ring-blue-300'
          : 'bg-white text-[#1a73e8] border-2 border-[#1a73e8] shadow-md hover:scale-105'
      }">
        <span class="text-[12px] leading-none">${order}</span>
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'gt-google-marker-wrapper',
    html,
    iconSize: [size, size],
    iconAnchor: [half, half],
    popupAnchor: [0, -half],
  });
}

// Hộp bóng thoại nổi thời gian trực tiếp trên Polyline lộ trình (Callout Badge chuẩn Google Maps)
function createGoogleRouteCalloutIcon(durationText: string): L.DivIcon {
  const html = `
    <div class="gt-google-route-callout relative select-none cursor-pointer -translate-x-1/2 -translate-y-full transition-transform active:scale-95">
      <div class="flex flex-col items-center">
        <div class="bg-[#1a73e8] hover:bg-[#1557b0] text-white px-3 py-1.5 rounded-lg shadow-[0_4px_14px_rgba(26,115,232,0.45)] flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
          <span>${durationText}</span>
          <span class="text-emerald-300 font-normal">🍃</span>
          <span class="text-[10px] text-blue-100 font-normal border-l border-blue-300/40 pl-1.5">Ko trạm thu phí</span>
        </div>
        <div class="w-2.5 h-2.5 bg-[#1a73e8] rotate-45 -mt-1 shadow-xs"></div>
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'gt-google-callout-wrapper',
    html,
    iconSize: [160, 40],
    iconAnchor: [80, 40],
  });
}

// ─── 2. COMPONENT AUTO FIT BOUNDS ───
function AutoFitBounds({
  stops,
  polylinePositions,
}: {
  stops: RouteStop[];
  polylinePositions: [number, number][];
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const points: [number, number][] =
      polylinePositions.length > 0
        ? polylinePositions
        : stops
            .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
            .map((s) => [s.latitude, s.longitude]);

    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView(points[0], 14, { animate: true });
    } else {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, {
        padding: [60, 60],
        maxZoom: 16,
        animate: true,
      });
    }

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => clearTimeout(timer);
  }, [map, stops, polylinePositions]);

  return null;
}

// ─── 3. GOOGLE MAPS CONTROLS LAYER ───
function RouteMapControlsLayer({ onRecenter }: { onRecenter: () => void }) {
  const map = useMap();

  return (
    <>
      {/* Nút điều khiển nổi góc phải (GPS Recenter & Zoom +/-) */}
      <div className="absolute right-3.5 bottom-8 flex flex-col space-y-2 z-[1000] pointer-events-auto">
        <button
          type="button"
          onClick={onRecenter}
          aria-label="Căn giữa toàn bộ lộ trình"
          title="Căn giữa toàn bộ lộ trình ngày này"
          className="w-9 h-9 bg-white rounded-full flex items-center justify-center text-zinc-700 hover:text-black hover:bg-zinc-50 transition cursor-pointer shadow-md"
        >
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="7"></circle>
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3" strokeLinecap="round" strokeLinejoin="round"></path>
          </svg>
        </button>

        <div className="flex flex-col bg-white rounded-full overflow-hidden shadow-md">
          <button
            type="button"
            onClick={() => map.zoomIn()}
            aria-label="Phóng to"
            className="w-9 h-9 flex items-center justify-center text-zinc-700 hover:text-black hover:bg-zinc-50 border-b border-zinc-100 transition cursor-pointer"
          >
            <svg className="w-4.5 h-4.5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round"></path>
            </svg>
          </button>
          <button
            type="button"
            onClick={() => map.zoomOut()}
            aria-label="Thu nhỏ"
            className="w-9 h-9 flex items-center justify-center text-zinc-700 hover:text-black hover:bg-zinc-50 transition cursor-pointer"
          >
            <svg className="w-4.5 h-4.5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M20 12H4" strokeLinecap="round" strokeLinejoin="round"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Thanh chân trang bản quyền Google Maps */}
      <footer className="absolute bottom-0 left-0 right-0 h-5.5 bg-white/70 backdrop-blur-[2px] flex items-center justify-between px-3 text-[9.5px] text-zinc-600 z-[1000] pointer-events-none">
        <div className="pointer-events-auto">
          <span className="font-medium tracking-tight text-zinc-700">Google</span>
        </div>
        <div className="flex items-center space-x-2.5 pointer-events-auto select-none">
          <span className="hover:underline cursor-pointer">Keyboard shortcuts</span>
          <span>Map Data ©2026 Google</span>
          <div className="flex items-center space-x-1">
            <div className="w-10 h-0.5 border-b-2 border-l border-r border-zinc-700"></div>
            <span>500 m</span>
          </div>
          <span className="hover:underline cursor-pointer">Terms</span>
          <span className="hover:underline cursor-pointer">Report a map error</span>
        </div>
      </footer>
    </>
  );
}

// ─── 4. HELPER ĐỊNH DẠNG THỜI GIAN & KHOẢNG CÁCH ───
function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0 phút';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours} giờ ${remMinutes}p` : `${hours} giờ`;
}

function formatDistance(meters: number): string {
  if (meters <= 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Tính toán thời lượng theo phương tiện di chuyển
function calculateModeDuration(baseSec: number, distanceM: number, mode: TransportMode): number {
  switch (mode) {
    case 'driving':
      return baseSec;
    case 'motorcycle':
      // Xe máy di chuyển đô thị linh hoạt, ít tắc đường hơn ô tô
      return Math.max(60, Math.round(baseSec * 0.95));
    case 'transit':
      // Xe buýt công cộng nội đô
      return Math.max(300, Math.round(baseSec * 1.5 + 400));
    case 'walking':
      // Tốc độ đi bộ ~4.5 km/h = 1.25 m/s
      return Math.max(60, Math.round(distanceM / 1.25));
  }
}

export default function ItineraryRouteMap({
  itineraryId = 'sample-danang-hue-3d',
  initialDay = 1,
  totalDays: propTotalDays,
  selectedStopId = null,
  onSelectStop,
  className = '',
  showStopsList = true,
}: ItineraryRouteMapProps) {
  const [activeDay, setActiveDay] = useState<number>(initialDay);
  const [routeData, setRouteData] = useState<DayRouteResponse | null>(null);
  const [transportMode, setTransportMode] = useState<TransportMode>('driving');
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [showDrawerList, setShowDrawerList] = useState<boolean>(true);

  // Tự động xác định số ngày linh hoạt từ Backend hoặc Props (hỗ trợ 1..N ngày)
  const totalDays = useMemo(() => {
    if (propTotalDays && propTotalDays > 0) return propTotalDays;
    if (routeData?.total_days && routeData.total_days > 0) return routeData.total_days;
    return 3;
  }, [propTotalDays, routeData?.total_days]);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [internalSelectedPoiId, setInternalSelectedPoiId] = useState<string | null>(selectedStopId);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeSegmentModal, setActiveSegmentModal] = useState<RouteSegment | null>(null);
  const [isUpdatingSegment, setIsUpdatingSegment] = useState<boolean>(false);

  const handleSelectSegmentMode = async (segmentIndex: number, mode: string) => {
    if (!routeData) return;
    setIsUpdatingSegment(true);
    try {
      const updated = await updateSegmentTransport(
        itineraryId,
        activeDay,
        segmentIndex,
        mode,
        'balanced'
      );
      routeCacheRef.current.set(activeDay, updated);
      setRouteData(updated);
      if (activeSegmentModal && activeSegmentModal.segment_index === segmentIndex) {
        const refreshedSeg = updated.segments?.find((s) => s.segment_index === segmentIndex);
        setActiveSegmentModal(refreshedSeg || null);
      }
    } catch (e) {
      console.warn("Failed to call updateSegmentTransport API, updating optimistically:", e);
      setRouteData((prev) => {
        if (!prev || !prev.segments) return prev;
        const newSegments = prev.segments.map((s) => {
          if (s.segment_index !== segmentIndex) return s;
          const opt = s.options.find((o) => o.mode === mode);
          return {
            ...s,
            selected_mode: mode,
            duration_seconds: opt?.duration_seconds ?? s.duration_seconds,
          };
        });
        const newCost = newSegments.reduce((sum, s) => {
          const opt = s.options.find((o) => o.mode === s.selected_mode);
          return sum + (opt?.estimated_cost_vnd ?? 0);
        }, 0);
        const newCarbon = newSegments.reduce((sum, s) => {
          const opt = s.options.find((o) => o.mode === s.selected_mode);
          return sum + (opt?.carbon_kg ?? 0);
        }, 0);
        const updated = {
          ...prev,
          segments: newSegments,
          day_total_cost_vnd: newCost,
          day_total_carbon_kg: Number(newCarbon.toFixed(3)),
        };
        if (activeSegmentModal && activeSegmentModal.segment_index === segmentIndex) {
          const refreshedSeg = updated.segments?.find((s) => s.segment_index === segmentIndex);
          setActiveSegmentModal(refreshedSeg || null);
        }
        return updated;
      });
    } finally {
      setIsUpdatingSegment(false);
    }
  };

  const mapRef = useRef<L.Map | null>(null);
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());
  const routeCacheRef = useRef<Map<number, DayRouteResponse>>(new Map());

  // Xóa cache khi đổi lịch trình
  useEffect(() => {
    routeCacheRef.current.clear();
  }, [itineraryId]);

  // Đồng bộ selectedPoiId từ prop
  useEffect(() => {
    if (selectedStopId !== undefined) {
      setInternalSelectedPoiId(selectedStopId);
    }
  }, [selectedStopId]);

  // Tải dữ liệu lộ trình khi đổi ngày
  const loadDayRoute = useCallback(async (dayNum: number, signal?: AbortSignal) => {
    if (routeCacheRef.current.has(dayNum)) {
      setRouteData(routeCacheRef.current.get(dayNum)!);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchDayRoute(itineraryId, dayNum, signal);
      routeCacheRef.current.set(dayNum, data);
      setRouteData(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.warn(`fetchDayRoute failed for day ${dayNum}, activating client fallback:`, err);
      const fallback = getClientFallbackDayRoute(itineraryId, dayNum);
      routeCacheRef.current.set(dayNum, fallback);
      setRouteData(fallback);
    } finally {
      setLoading(false);
    }
  }, [itineraryId]);

  useEffect(() => {
    const controller = new AbortController();
    loadDayRoute(activeDay, controller.signal);
    return () => {
      controller.abort();
    };
  }, [activeDay, loadDayRoute]);

  // Chuyển đổi tọa độ GeoJSON [lon, lat] sang Leaflet [lat, lon]
  const polylinePositions = useMemo(() => {
    if (!routeData?.route?.coordinates) return [];
    return routeData.route.coordinates
      .filter((pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
      .map((pt) => [pt[1], pt[0]] as [number, number]);
  }, [routeData]);

  // Tọa độ trung điểm của tuyến đường để cắm nhãn bóng thoại ETA nổi (Callout Badge)
  const routeMidpoint = useMemo<[number, number] | null>(() => {
    if (polylinePositions.length < 2) return null;
    const midIdx = Math.floor(polylinePositions.length / 2);
    return polylinePositions[midIdx];
  }, [polylinePositions]);

  // Điểm đầu và điểm cuối
  const firstStop = routeData?.stops?.[0];
  const lastStop = routeData?.stops?.[routeData.stops.length - 1];

  // Tính thời lượng thực tế theo phương tiện đang chọn
  const currentDurationSec = useMemo(() => {
    const base = routeData?.duration_seconds || 0;
    const dist = routeData?.distance_meters || 0;
    return calculateModeDuration(base, dist, transportMode);
  }, [routeData?.duration_seconds, routeData?.distance_meters, transportMode]);

  // Ước tính phát thải CO2 theo quãng đường thực tế & phương tiện đang chọn
  const carbonEstimate = useMemo(() => {
    return estimateCarbonFootprint(routeData?.distance_meters || 0, transportMode);
  }, [routeData?.distance_meters, transportMode]);

  // Tạo liên kết mở trực tiếp bằng Google Maps
  const googleMapsDirectionsUrl = useMemo(() => {
    const stops = routeData?.stops || [];
    if (stops.length < 2) return null;
    const origin = stops[0];
    const dest = stops[stops.length - 1];
    const waypoints = stops.slice(1, -1);

    const originParam = `${origin.latitude},${origin.longitude}`;
    const destParam = `${dest.latitude},${dest.longitude}`;

    let url = `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destParam}`;
    if (waypoints.length > 0) {
      const waypointsParam = waypoints.map((w) => `${w.latitude},${w.longitude}`).join('|');
      url += `&waypoints=${encodeURIComponent(waypointsParam)}`;
    }

    let gMode = 'driving';
    if (transportMode === 'transit') gMode = 'transit';
    else if (transportMode === 'walking') gMode = 'walking';
    url += `&travelmode=${gMode}`;

    return url;
  }, [routeData?.stops, transportMode]);

  const handleSelectStop = (stop: RouteStop | null) => {
    setInternalSelectedPoiId(stop ? stop.poi_id : null);
    if (onSelectStop) onSelectStop(stop);

    if (stop && mapRef.current && Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)) {
      mapRef.current.flyTo([stop.latitude, stop.longitude], Math.max(mapRef.current.getZoom(), 15), {
        duration: 0.6,
      });

      const marker = markerRefs.current.get(stop.poi_id);
      if (marker) {
        marker.openPopup();
      }
    }
  };

  // Căn giữa toàn bộ lộ trình ngày hiện tại
  const handleRecenterMap = useCallback(() => {
    if (!mapRef.current) return;
    const points: [number, number][] =
      polylinePositions.length > 0
        ? polylinePositions
        : (routeData?.stops || [])
            .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
            .map((s) => [s.latitude, s.longitude]);

    if (points.length === 0) return;
    if (points.length === 1) {
      mapRef.current.flyTo(points[0], 14, { duration: 0.6 });
    } else {
      const bounds = L.latLngBounds(points);
      mapRef.current.fitBounds(bounds, {
        padding: [60, 60],
        maxZoom: 16,
        animate: true,
      });
    }
  }, [polylinePositions, routeData?.stops]);

  // Hành động "Bắt đầu" dẫn đường chuẩn Google Maps
  const handleStartNavigation = () => {
    if (!firstStop || !mapRef.current) return;
    setIsNavigating(true);
    mapRef.current.flyTo([firstStop.latitude, firstStop.longitude], 16, {
      duration: 1.0,
    });
    handleSelectStop(firstStop);
  };

  // Danh sách các tab phương tiện di chuyển
  const transportModesList = [
    {
      id: 'driving' as TransportMode,
      label: 'Ô tô',
      icon: Car,
      durationText: formatDuration(calculateModeDuration(routeData?.duration_seconds || 0, routeData?.distance_meters || 0, 'driving')),
    },
    {
      id: 'motorcycle' as TransportMode,
      label: 'Xe máy',
      icon: Bike,
      durationText: formatDuration(calculateModeDuration(routeData?.duration_seconds || 0, routeData?.distance_meters || 0, 'motorcycle')),
    },
    {
      id: 'transit' as TransportMode,
      label: 'Xe buýt Xanh',
      icon: Bus,
      durationText: formatDuration(calculateModeDuration(routeData?.duration_seconds || 0, routeData?.distance_meters || 0, 'transit')),
    },
    {
      id: 'walking' as TransportMode,
      label: 'Đi bộ',
      icon: Footprints,
      durationText: formatDuration(calculateModeDuration(routeData?.duration_seconds || 0, routeData?.distance_meters || 0, 'walking')),
    },
  ];

  return (
    <div className={`flex flex-col bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-card transition-all duration-300 ${
      isExpanded ? 'fixed inset-4 z-[9999] rounded-3xl h-[calc(100vh-32px)] shadow-2xl' : ''
    } ${className}`}>
      
      {/* ─── HEADER: DAY TABS & ACTIONS ─── */}
      <div className="p-3.5 sm:p-4 border-b border-stone-100 bg-[#FCFAF5] flex items-center justify-between gap-3">
        {/* Day Selector Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 auto-hide-scrollbar" role="tablist" aria-label="Chọn ngày trong lịch trình">
          {Array.from({ length: totalDays }, (_, idx) => idx + 1).map((dayNum) => {
            const isActive = activeDay === dayNum;
            return (
              <button
                key={dayNum}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveDay(dayNum);
                  setIsNavigating(false);
                }}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-forest-900 text-white shadow-sm ring-2 ring-forest-900/20'
                    : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200'
                }`}
              >
                <Calendar size={13} className={isActive ? 'text-emerald-400' : 'text-stone-400'} />
                <span>Ngày {dayNum}</span>
                {isActive && loading && (
                  <Loader2 size={12} className="animate-spin text-emerald-300 ml-0.5" />
                )}
              </button>
            );
          })}
        </div>

        {/* Nút phóng to toàn màn hình */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setIsExpanded((prev) => !prev);
              setTimeout(() => {
                mapRef.current?.invalidateSize();
              }, 200);
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-stone-200/80 text-stone-600 transition cursor-pointer shrink-0"
            title={isExpanded ? 'Thu nhỏ bản đồ' : 'Phóng to toàn màn hình'}
            aria-label={isExpanded ? 'Thu nhỏ bản đồ' : 'Phóng to toàn màn hình'}
          >
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* ─── MAIN CONTENT: MAP + STOPS LIST ─── */}
      <div className={`relative grid ${showStopsList && showDrawerList ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'} flex-1 min-h-[480px]`}>
        {/* MAP CONTAINER */}
        <div className={`${showStopsList && showDrawerList ? 'lg:col-span-8' : 'w-full'} relative min-h-[440px] h-[520px] lg:h-[580px]`}>
          {/* Custom Leaflet Styles for Google Maps */}
          <style>{`
            .leaflet-container {
              background-color: #aadaff !important;
              outline: none !important;
            }
            .gt-google-marker-wrapper, .gt-google-callout-wrapper {
              background: transparent !important;
              border: none !important;
            }
            .leaflet-popup-content-wrapper {
              border-radius: 18px !important;
              box-shadow: 0 10px 25px rgba(0,0,0,0.18) !important;
              padding: 4px !important;
            }
            .leaflet-popup-content {
              margin: 12px 14px !important;
              line-height: 1.4 !important;
            }
            .leaflet-control-attribution {
              display: none !important;
            }
          `}</style>

          {/* ─── GOOGLE MAPS FLOATING TOP DIRECTIONS CARD ─── */}
          {routeData && routeData.stops.length > 0 && (
            <div className="absolute top-3.5 left-3.5 right-3.5 sm:right-auto sm:min-w-[340px] sm:max-w-sm z-[1000] pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_6px_25px_rgba(0,0,0,0.14)] border border-stone-200/90 p-3 transition-all">
              {/* Origin & Destination lines */}
              <div className="flex items-center gap-2.5 mb-2.5 px-1">
                <div className="flex flex-col items-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#1a73e8] ring-3 ring-blue-100"></div>
                  <div className="w-0.5 h-4 border-l border-dashed border-stone-300 my-0.5"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ea4335] ring-3 ring-red-100"></div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-between h-9 text-xs">
                  <div className="truncate font-semibold text-stone-800 flex items-center gap-1">
                    <span className="text-[10px] text-stone-400 font-normal">Đi:</span>
                    <span className="truncate">{firstStop?.name || 'Vị trí bắt đầu'}</span>
                  </div>
                  <div className="truncate font-semibold text-stone-800 flex items-center gap-1">
                    <span className="text-[10px] text-stone-400 font-normal">Đến:</span>
                    <span className="truncate">{lastStop?.name || 'Điểm đến'}</span>
                  </div>
                </div>
              </div>

              {/* Transport Mode Pills (Google Maps style) */}
              <div className="flex items-center gap-1 pt-2 border-t border-stone-100">
                {transportModesList.map((m) => {
                  const Icon = m.icon;
                  const isActive = transportMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setTransportMode(m.id)}
                      className={`flex-1 py-1.5 px-1.5 rounded-xl text-xs flex flex-col sm:flex-row items-center justify-center gap-1 transition cursor-pointer ${
                        isActive
                          ? 'bg-blue-50 text-[#1a73e8] ring-1.5 ring-[#1a73e8]/30 font-bold'
                          : 'text-stone-600 hover:bg-stone-100 font-medium'
                      }`}
                      title={m.label}
                    >
                      <Icon size={13} className={isActive ? 'text-[#1a73e8]' : 'text-stone-500'} />
                      <span className="text-[10.5px] leading-tight">{m.durationText}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── GOOGLE MAPS FLOATING BOTTOM NAVIGATION SHEET ─── */}
          {routeData && routeData.stops.length > 0 && (
            <div className="absolute left-3.5 right-3.5 sm:left-4 sm:right-auto sm:min-w-[340px] sm:max-w-md bottom-7 z-[1000] pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.18)] border border-stone-200/90 p-3.5 transition-all">
              {/* Duration & Distance Big Metric */}
              <div className="flex items-baseline justify-between mb-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-emerald-600 tracking-tight" title={routeData.total_trip_duration_seconds ? `Thời gian lăn bánh: ${formatDuration(currentDurationSec)} • Tổng dự kiến gồm chờ xe: ${formatDuration(routeData.total_trip_duration_seconds)}` : undefined}>
                    {formatDuration(routeData.total_trip_duration_seconds || currentDurationSec)}
                  </span>
                  <span className="text-stone-500 text-sm font-semibold">
                    ({formatDistance(routeData.distance_meters)})
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                    carbonEstimate.savedPercent > 0
                      ? 'text-emerald-800 bg-emerald-50 border-emerald-200/80'
                      : 'text-stone-700 bg-stone-100 border-stone-200'
                  }`}
                  title={
                    carbonEstimate.savedPercent > 0
                      ? `Giảm ${formatCarbonAmount(carbonEstimate.savedGrams)} so với đi ô tô cùng quãng đường`
                      : 'Ước tính phát thải CO₂ khi di chuyển bằng ô tô'
                  }
                >
                  <span>
                    {carbonEstimate.savedPercent > 0
                      ? `🌱 ${formatCarbonAmount(carbonEstimate.co2Grams)} (-${carbonEstimate.savedPercent}% CO₂)`
                      : `~${formatCarbonAmount(carbonEstimate.co2Grams)}`}
                  </span>
                </div>
              </div>

              {/* Status Note */}
              <p className="text-xs text-stone-600 mb-3 flex items-center gap-1">
                <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                <span>Tuyến đường tối ưu nhất dựa trên thuật toán GreenTrip AI</span>
              </p>

              {/* Action Buttons: Bắt đầu | Các chặng | Mở Google Maps */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStartNavigation}
                  className={`flex-1 py-2 px-3.5 rounded-full font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer ${
                    isNavigating
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300'
                      : 'bg-[#1a73e8] hover:bg-[#1557b0] text-white'
                  }`}
                  title="Bắt đầu điều hướng theo lộ trình"
                >
                  <Navigation size={13} className="fill-white stroke-none" />
                  <span>{isNavigating ? 'Đang điều hướng' : 'Bắt đầu'}</span>
                </button>

                {showStopsList && (
                  <button
                    type="button"
                    onClick={() => setShowDrawerList((prev) => !prev)}
                    className="py-2 px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-full font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                    title="Xem chi tiết các chặng dừng"
                  >
                    <ListFilter size={13} />
                    <span>Các chặng</span>
                  </button>
                )}

                {googleMapsDirectionsUrl && (
                  <a
                    href={googleMapsDirectionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-full font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                    title="Mở lộ trình trực tiếp trên ứng dụng Google Maps"
                  >
                    <ExternalLink size={13} />
                    <span>Google Maps</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 z-[1000] bg-white/70 backdrop-blur-xs flex items-center justify-center">
              <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-md border border-stone-200 text-xs font-bold text-forest-900">
                <Loader2 size={16} className="animate-spin text-forest-600" />
                <span>Đang tải tuyến đường Ngày {activeDay}...</span>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="absolute inset-x-4 top-4 z-[1000] p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5 text-xs text-red-800">
                <AlertCircle size={17} className="text-red-600 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => loadDayRoute(activeDay)}
                className="px-3 py-1 bg-white hover:bg-red-100/60 border border-red-300 rounded-lg text-xs font-bold text-red-800 flex items-center gap-1 transition"
              >
                <RefreshCw size={12} />
                Thử lại
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && routeData && routeData.total_stops === 0 && (
            <div className="absolute inset-4 z-[900] bg-white/90 rounded-2xl border border-stone-200 p-6 flex flex-col items-center justify-center text-center shadow-sm">
              <div className="w-12 h-12 rounded-full bg-forest-50 text-forest-600 flex items-center justify-center mb-3">
                <MapPin size={24} />
              </div>
              <h4 className="font-heading text-base font-bold text-stone-900 mb-1">
                Ngày {activeDay} chưa có điểm dừng
              </h4>
              <p className="text-xs text-stone-500 max-w-sm mb-4">
                Lịch trình ngày này đang để trống để bạn thoải mái nghỉ ngơi hoặc tự do khám phá.
              </p>
            </div>
          )}

          <MapContainer
            center={[16.0544, 108.2022]}
            zoom={12}
            scrollWheelZoom={true}
            zoomControl={false}
            className="w-full h-full"
            ref={(map) => { if (map) mapRef.current = map; }}
          >
            {/* Lớp bản đồ Google Maps vector tiles tiếng Việt */}
            <TileLayer
              url="https://{s}.google.com/vt/lyrs=m&hl=vi&x={x}&y={y}&z={z}&apistyle=s.t:2|p.v:off,s.t:5|s.e:l.i|p.v:off,s.t:17|s.e:l.i|p.v:off,s.t:18|s.e:l.i|p.v:off,s.t:road|s.e:l.i|p.v:off,s.t:road.highway|s.e:labels.icon|p.v:off,s.t:road.arterial|s.e:labels.icon|p.v:off"
              subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
              attribution='&copy; Google Maps'
              keepBuffer={12}
              updateWhenIdle={false}
              updateInterval={60}
              maxZoom={20}
            />

            {/* Các tiện ích nổi: Phóng to/Thu nhỏ, Căn giữa, Google Footer */}
            <RouteMapControlsLayer onRecenter={handleRecenterMap} />

            {/* Auto fit bounds when stops or polyline change */}
            {routeData && (
              <AutoFitBounds
                stops={routeData.stops}
                polylinePositions={polylinePositions}
              />
            )}

            {/* 1. Tuyến đường Polyline chuẩn phong cách Google Maps Navigation (Xanh dương đậm viền trắng halo) */}
            {polylinePositions.length >= 2 && (
              <>
                {/* Lớp viền sáng tương phản bảo vệ (Halo casing) */}
                <Polyline
                  positions={polylinePositions}
                  pathOptions={{
                    color: '#FFFFFF',
                    weight: 10,
                    opacity: 0.95,
                    lineJoin: 'round',
                    lineCap: 'round',
                  }}
                />
                {/* Tuyến đường chính màu xanh Google Maps (#1a73e8) */}
                <Polyline
                  positions={polylinePositions}
                  pathOptions={{
                    color: transportMode === 'transit' ? '#16A34A' : '#1a73e8',
                    weight: 6,
                    opacity: 1,
                    lineJoin: 'round',
                    lineCap: 'round',
                    dashArray: transportMode === 'walking' ? '4, 8' : (routeData?.is_fallback ? '6, 8' : undefined),
                  }}
                />
              </>
            )}

            {/* 2. Hộp bóng thoại nổi thời gian trực tiếp trên tuyến đường (Callout Badge Google Maps) */}
            {routeMidpoint && polylinePositions.length >= 2 && (
              <Marker
                position={routeMidpoint}
                icon={createGoogleRouteCalloutIcon(formatDuration(currentDurationSec))}
                zIndexOffset={500}
                eventHandlers={{
                  click: handleRecenterMap,
                }}
              />
            )}

            {/* 3. Các Marker chuẩn Google Maps (Điểm đi xanh, Điểm đến đỏ, Điểm giữa đánh số) */}
            {routeData?.stops.map((stop, index) => {
              const isSelected = internalSelectedPoiId === stop.poi_id;
              const isFirst = index === 0;
              const isLast = index === (routeData.stops.length - 1) && routeData.stops.length > 1;

              let icon: L.DivIcon;
              if (isFirst) {
                icon = createGoogleStartMarkerIcon(isSelected);
              } else if (isLast) {
                icon = createGoogleDestinationMarkerIcon(isSelected);
              } else {
                icon = createGoogleWaypointMarkerIcon(stop.order, isSelected);
              }

              return (
                <Marker
                  key={`stop-${activeDay}-${stop.order}-${stop.poi_id}`}
                  position={[stop.latitude, stop.longitude]}
                  icon={icon}
                  zIndexOffset={isSelected ? 1000 : (isLast ? 600 : (isFirst ? 500 : stop.order * 10))}
                  ref={(m) => {
                    if (m) markerRefs.current.set(stop.poi_id, m);
                    else markerRefs.current.delete(stop.poi_id);
                  }}
                  eventHandlers={{
                    click: () => handleSelectStop(stop),
                  }}
                >
                  <Popup>
                    <div className="p-1 min-w-[170px]">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className={`w-5 h-5 rounded-full text-white text-[11px] font-extrabold flex items-center justify-center shrink-0 ${
                          isFirst ? 'bg-[#1a73e8]' : (isLast ? 'bg-[#ea4335]' : 'bg-[#1a73e8]')
                        }`}>
                          {isFirst ? 'A' : (isLast ? 'B' : stop.order)}
                        </span>
                        <span className="text-[11px] font-bold text-stone-700 uppercase tracking-wider">
                          {isFirst ? 'Điểm xuất phát' : (isLast ? 'Điểm kết thúc' : `Điểm dừng #${stop.order}`)}
                        </span>
                      </div>
                      <h5 className="font-heading text-sm font-bold text-stone-900 mb-1 leading-snug">
                        {stop.name}
                      </h5>
                      <p className="text-[11px] text-stone-500 mb-2">
                        Tọa độ: {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleSelectStop(stop)}
                        className="w-full py-1.5 px-3 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-lg text-xs font-semibold transition"
                      >
                        Xem điểm này
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

        {/* ─── SIDEBAR: STOPS SEQUENCE LIST ─── */}
        {showStopsList && showDrawerList && (
          <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-stone-200 bg-[#FCFAF5] p-4 flex flex-col justify-between overflow-y-auto max-h-[580px]">
            <div>
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-stone-200/60">
                <span className="text-xs font-bold uppercase tracking-wider text-forest-900 flex items-center gap-1.5">
                  <RouteIcon size={14} className="text-forest-600" />
                  Danh Sách Điểm Dừng Ngày {activeDay}
                </span>
                {routeData && (
                  <span className="text-[11px] font-bold text-forest-700 bg-forest-100/70 px-2 py-0.5 rounded-full">
                    {routeData.stops.length} điểm
                  </span>
                )}
              </div>

              {/* Stops Timeline Cards */}
              {((routeData?.day_total_cost_vnd ?? 0) > 0 || (routeData?.day_total_carbon_kg ?? 0) > 0) && (
                <div className="mb-3 p-2.5 bg-emerald-50/70 border border-emerald-200/60 rounded-xl text-xs flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-emerald-900 font-semibold">
                    <Leaf size={14} className="text-emerald-600" />
                    <span>{routeData?.day_total_carbon_kg ?? 0} kg CO2</span>
                  </div>
                  <div className="text-stone-600 font-medium">
                    Chi phí đi lại: <span className="font-bold text-stone-900">~{(routeData?.day_total_cost_vnd ?? 0).toLocaleString('vi-VN')} đ</span>
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                {routeData?.stops.map((stop, idx) => {
                  const isSelected = internalSelectedPoiId === stop.poi_id;
                  const isFirst = idx === 0;
                  const isLast = idx === (routeData.stops.length - 1) && routeData.stops.length > 1;
                  const seg = routeData.segments?.[idx];

                  return (
                    <React.Fragment key={`list-stop-${stop.order}-${stop.poi_id}`}>
                      <div
                        onClick={() => handleSelectStop(stop)}
                        className={`relative rounded-2xl p-3 border transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? 'bg-white border-[#1a73e8] ring-2 ring-blue-200 shadow-md'
                            : 'bg-white/80 hover:bg-white border-stone-200 hover:border-blue-300 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Number Badge */}
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shrink-0 transition-colors ${
                            isFirst
                              ? 'bg-[#1a73e8] text-white'
                              : isLast
                              ? 'bg-[#ea4335] text-white'
                              : isSelected
                              ? 'bg-[#1a73e8] text-white'
                              : 'bg-blue-50 text-[#1a73e8] border border-blue-200'
                          }`}>
                            {isFirst ? 'A' : isLast ? 'B' : stop.order}
                          </div>

                          {/* POI Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                                {isFirst ? 'Điểm xuất phát' : isLast ? 'Điểm đến' : `Thứ tự ${stop.order}`}
                              </span>
                              {isSelected && (
                                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded">
                                  Đang xem
                                </span>
                              )}
                            </div>
                            <h6 className="font-heading text-sm font-bold text-stone-900 truncate">
                              {stop.name}
                            </h6>
                            <span className="text-[11px] text-stone-500">
                              {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                            </span>
                          </div>

                          <ChevronRight size={16} className={`shrink-0 transition-colors ${isSelected ? 'text-[#1a73e8]' : 'text-stone-400'}`} />
                        </div>
                      </div>

                      {/* Segment connector and transport recommendation pill */}
                      {seg && (
                        <div
                          onClick={(e) => { e.stopPropagation(); setActiveSegmentModal(seg); }}
                          className="my-1 py-1.5 px-3 flex items-center justify-between text-xs bg-stone-100/90 hover:bg-emerald-50 border border-stone-200/70 hover:border-emerald-300 rounded-xl transition cursor-pointer group"
                          title="Bấm để xem và đổi phương tiện cho chặng này"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="p-1 rounded-md bg-white border border-stone-200 text-emerald-700 shadow-2xs shrink-0">
                              {getTransportIcon(seg.selected_mode)}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-stone-800 text-[11px] truncate flex items-center gap-1">
                                <span>{getTransportLabel(seg.selected_mode)}</span>
                                {seg.is_intercity && (
                                  <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1 rounded">Liên tỉnh</span>
                                )}
                              </span>
                              <span className="text-[10px] text-stone-500 truncate">
                                {(seg.distance_meters / 1000).toFixed(1)} km · {Math.round(seg.duration_seconds / 60)} phút · {seg.options?.find(o => o.mode === seg.selected_mode)?.estimated_cost_vnd === 0 ? '0 đ' : `~${seg.options?.find(o => o.mode === seg.selected_mode)?.estimated_cost_vnd?.toLocaleString('vi-VN')} đ`}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-700 group-hover:text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                            Đổi phương tiện
                          </span>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Empty State in sidebar */}
                {(!routeData || routeData.stops.length === 0) && !loading && (
                  <div className="p-4 text-center text-xs text-stone-500 border border-dashed border-stone-200 rounded-xl">
                    Chưa có điểm dừng nào cho Ngày {activeDay}.
                  </div>
                )}
              </div>
            </div>

            {/* Footer Legend */}
            <div className="pt-3 mt-4 border-t border-stone-200/60 text-[11px] text-stone-500 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1a73e8]"></span>
                Xuất phát (A)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ea4335]"></span>
                Điểm đến (B)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-1 bg-[#1a73e8] rounded"></span>
                Google Nav
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ─── SEGMENT TRANSPORT COMPARISON & SELECTION MODAL ─── */}
      {activeSegmentModal && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/80">
              <div>
                <span className="text-[11px] font-bold text-forest-700 uppercase tracking-wider">
                  Chặng {activeSegmentModal.segment_index + 1}
                </span>
                <h4 className="font-heading font-bold text-stone-900 text-sm sm:text-base flex items-center gap-1.5 mt-0.5">
                  <span className="truncate max-w-[150px] sm:max-w-[190px]">{activeSegmentModal.from_stop.name}</span>
                  <ArrowRight size={14} className="text-stone-400 shrink-0" />
                  <span className="truncate max-w-[150px] sm:max-w-[190px]">{activeSegmentModal.to_stop.name}</span>
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setActiveSegmentModal(null)}
                className="p-1.5 rounded-full hover:bg-stone-200 text-stone-500 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-5 max-h-[60vh] overflow-y-auto space-y-3">
              <div className="text-xs text-stone-500 flex items-center justify-between pb-2 border-b border-stone-100">
                <span>Khoảng cách: {(activeSegmentModal.distance_meters / 1000).toFixed(1)} km</span>
                <span className="font-medium text-stone-700">
                  {activeSegmentModal.is_intercity ? 'Tuyến liên tỉnh ĐN - Huế' : 'Tuyến nội thành'}
                </span>
              </div>

              {activeSegmentModal.options?.map((opt) => {
                const isSelected = activeSegmentModal.selected_mode === opt.mode;
                return (
                  <div
                    key={opt.mode}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-200'
                        : 'border-stone-200 hover:border-emerald-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="p-2 rounded-xl bg-stone-100 text-stone-700 shrink-0">
                          {getTransportIcon(opt.mode)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-stone-900 text-xs sm:text-sm">{opt.label}</span>
                            {opt.recommendation_type === 'best_match' && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-full">
                                Phù hợp nhất
                              </span>
                            )}
                            {opt.recommendation_type === 'eco_friendly' && (
                              <span className="text-[10px] bg-teal-100 text-teal-800 font-bold px-1.5 py-0.5 rounded-full">
                                Xanh nhất
                              </span>
                            )}
                            {opt.recommendation_type === 'cost_saving' && (
                              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-full">
                                Tiết kiệm
                              </span>
                            )}
                            {opt.is_verified_schedule && (
                              <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <ShieldCheck size={10} /> Đã xác thực
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-stone-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{opt.duration_text}</span>
                            <span>·</span>
                            <span>{opt.estimated_cost_vnd === 0 ? 'Miễn phí' : `~${opt.estimated_cost_vnd.toLocaleString('vi-VN')} đ (Giá tham khảo)`}</span>
                            <span>·</span>
                            <span>{opt.carbon_kg} kg CO2</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={!opt.is_feasible || isUpdatingSegment}
                        onClick={() => handleSelectSegmentMode(activeSegmentModal.segment_index, opt.mode)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                          isSelected
                            ? 'bg-emerald-600 text-white cursor-default'
                            : opt.is_feasible
                            ? 'bg-stone-100 hover:bg-emerald-100 text-stone-800 hover:text-emerald-900 cursor-pointer'
                            : 'bg-stone-100 text-stone-400 cursor-not-allowed'
                        }`}
                      >
                        {isSelected ? 'Đang chọn' : opt.is_feasible ? 'Chọn' : 'Không khả thi'}
                      </button>
                    </div>

                    <p className="text-[11px] text-stone-600 mt-2 pl-2 border-l-2 border-emerald-300">
                      {opt.reason}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

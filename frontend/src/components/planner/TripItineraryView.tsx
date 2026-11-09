import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Sparkles,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Check,
  X,
  Coffee,
  Heart,
  Search,
  RefreshCw,
  Utensils,
  Landmark,
  Compass,
  Footprints,
  Car,
  SlidersHorizontal,
  Lightbulb,
} from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import {
  type Poi,
  type PoiCategory,
  type PoiCity,
  getDeterministicImage,
  normalizeCategory,
  normalizeCity,
} from '@/data/pois';
import PoiMap from '@/components/poi/PoiMap';
import { ThreeElevationWave } from '@/components/ui/ThreeElevationWave';
import {
  createEmptyItinerary,
  getTripItinerary,
  saveTripItinerary,
  stopFromPoi,
  optimizeDays,
  alignItineraryToTrip,
  normalizeLegacyLunchBreaks,
  pacingForTrip,
  dailyVisitCapacity,
  distanceKm,
  minutesFromTime,
  timeFromMinutes,
  type TripItinerary,
  type ItineraryDay,
  type ItineraryStop,
} from '@/services/itineraryService';

export interface TripItineraryViewProps {
  trip: UserTrip;
  allPois?: Poi[];
  onBack: () => void;
  onUpdateTrip?: (updatedTrip: UserTrip) => void;
}

// ─────────────────────────────────────────────────────────────
// Danh mục cho Modal Thêm địa điểm (chuẩn Explore & Mindtrip)
// ─────────────────────────────────────────────────────────────
const MODAL_CATEGORY_TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'quan-an', label: 'Quán ăn' },
  { id: 'di-tich', label: 'Di tích' },
  { id: 'canh-quan', label: 'Cảnh quan' },
  { id: 'chua', label: 'Chùa chiền' },
  { id: 'bien', label: 'Bãi biển' },
];

function getPoiImage(poi?: Poi | null): string {
  if (!poi) return 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80';
  if (poi.image && poi.image.startsWith('http')) return poi.image;
  return getDeterministicImage(poi.name, poi.id, (poi.category as PoiCategory) || 'Quán ăn', poi.city);
}

function getCategoryIcon(cat?: string | null) {
  const c = (cat || '').toLowerCase();
  if (c.includes('ăn') || c.includes('ẩm thực') || c.includes('food') || c.includes('restaurant') || c.includes('culinary')) {
    return <Utensils size={13} className="text-amber-700 shrink-0" />;
  }
  if (c.includes('di tích') || c.includes('lăng') || c.includes('đại nội') || c.includes('attraction')) {
    return <Landmark size={13} className="text-emerald-800 shrink-0" />;
  }
  if (c.includes('rest') || c.includes('nghỉ')) {
    return <Coffee size={13} className="text-amber-800 shrink-0" />;
  }
  return <Compass size={13} className="text-emerald-700 shrink-0" />;
}

function displayDateVi(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('vi-VN', {
      weekday: 'short',
      day: 'numeric',
      month: 'numeric',
    }).format(d);
  } catch {
    return dateStr || '';
  }
}

export default function TripItineraryView({
  trip,
  allPois = [],
  onBack,
  onUpdateTrip,
}: TripItineraryViewProps) {
  // ─── 1. Quản lý trạng thái Lịch trình (TripItinerary Plan) ───
  const [plan, setPlan] = useState<TripItinerary>(() => createEmptyItinerary(trip));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [insightMessage, setInsightMessage] = useState<string | null>(null);

  // Lưu trữ tham chiếu tự động lưu
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersion = useRef(0);
  const latestPlan = useRef(plan);
  const currentTrip = useRef(trip);
  currentTrip.current = trip;

  // ─── 2. Quản lý Ý tưởng (Ideas List) ───
  const [tripIdeas, setTripIdeas] = useState<string[]>(() => {
    if (Array.isArray(trip.ideas) && trip.ideas.length > 0) return trip.ideas;
    // Tự động gieo ý tưởng mặc định nếu chuyến chưa có để người dùng thấy ngay
    const isHue = /hue|huế/i.test(trip.destination);
    const targetCity: PoiCity = isHue ? 'Huế' : 'Đà Nẵng';
    const cityPois = allPois.filter((p) => normalizeCity(p.city) === targetCity);
    const defaults = cityPois.slice(0, 8).map((p) => p.id);
    return defaults.length > 0 ? defaults : ['poi-1', 'poi-2', 'poi-3', 'poi-4'];
  });

  // State giao diện
  const [expandIdeas, setExpandIdeas] = useState(true);
  const [selectedDayTab, setSelectedDayTab] = useState<number | 'all'>('all');
  const [activeIdeaPickerForDay, setActiveIdeaPickerForDay] = useState<string | null>(null);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);

  // Modal Thêm địa điểm vào Ý tưởng
  const [showAddIdeasModal, setShowAddIdeasModal] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalCity, setModalCity] = useState<'all' | 'Đà Nẵng' | 'Huế'>(
    /hue|huế/i.test(trip.destination) ? 'Huế' : 'Đà Nẵng'
  );
  const [modalCategory, setModalCategory] = useState<string>('all');
  const [customIdeaInput, setCustomIdeaInput] = useState('');
  const [customIdeaAddress, setCustomIdeaAddress] = useState('');

  // Dropdown chọn ngày cho thẻ ý tưởng cụ thể
  const [openDayMenuForIdeaId, setOpenDayMenuForIdeaId] = useState<string | null>(null);

  // Chỉnh sửa giờ điểm dừng
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editEndTime, setEditEndTime] = useState('10:30');

  // ─── 3. Đồng bộ danh sách POI từ `tripIdeas` ───
  const ideaPois = useMemo(() => {
    return tripIdeas
      .map((id) => {
        const found = allPois.find((p) => p.id === id || p.name.toLowerCase() === id.toLowerCase());
        if (found) return found;
        if (id.startsWith('custom-')) {
          const customName = id.replace(/^custom-/, '');
          return {
            id,
            name: customName,
            city: /hue|huế/i.test(trip.destination) ? 'Huế' : 'Đà Nẵng',
            category: 'Quán ăn' as PoiCategory,
            image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80',
            address: 'Địa điểm tự thêm',
            description: 'Địa điểm do bạn thêm vào chuyến đi.',
            lat: 16.0678,
            lng: 108.2208,
            rating: 4.8,
            visitDuration: '1.0 giờ',
            ecoScore: 85,
            isGreen: true,
          } as Poi;
        }
        return null;
      })
      .filter((p): p is Poi => p !== null);
  }, [tripIdeas, allPois, trip.destination]);

  // Tập hợp các POI id đã có trong lịch
  const ideaIdsInPlan = useMemo(() => {
    const set = new Set<string>();
    plan.days.forEach((day) => {
      day.stops.forEach((stop) => {
        if (stop.poi_id) set.add(stop.poi_id);
      });
    });
    return set;
  }, [plan.days]);

  // Tra cứu xem POI đã được xếp vào ngày nào
  const getDayNumberForPoi = useCallback(
    (poiId: string): number | null => {
      for (const day of plan.days) {
        if (day.stops.some((s) => s.poi_id === poiId || s.title.toLowerCase() === poiId.toLowerCase())) {
          return day.day_number;
        }
      }
      return null;
    },
    [plan.days]
  );

  // ─── 4. Tự động lưu và tải từ Backend / LocalStorage ───
  const persistPlan = useCallback(
    (nextPlan: TripItinerary) => {
      const version = ++saveVersion.current;
      latestPlan.current = nextPlan;
      setPlan(nextPlan);
      setHasUnsavedChanges(true);
      setErrorMessage('');

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          const saved = await saveTripItinerary(nextPlan);
          if (version === saveVersion.current) {
            setPlan((prev) => ({ ...prev, updated_at: saved.updated_at }));
            setHasUnsavedChanges(false);
          }
        } catch (cause) {
          if (version === saveVersion.current) {
            console.warn('Lỗi lưu lịch trình:', cause);
            setErrorMessage('Lịch đã lưu cục bộ trên máy của bạn.');
          }
        } finally {
          if (version === saveVersion.current) setIsSaving(false);
        }
      }, 350);
    },
    []
  );

  // Tải kế hoạch khi mở trang
  useEffect(() => {
    let isCancelled = false;
    async function loadData() {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const saved = await getTripItinerary(trip.id);
        if (isCancelled) return;
        const normalized = normalizeLegacyLunchBreaks(saved);
        const aligned = alignItineraryToTrip(normalized.itinerary, currentTrip.current);
        latestPlan.current = aligned.itinerary;
        setPlan(aligned.itinerary);
      } catch {
        if (isCancelled) return;
        // Khởi tạo lịch mới hoặc nạp từ localStorage
        const fresh = createEmptyItinerary(currentTrip.current);
        const aligned = alignItineraryToTrip(fresh, currentTrip.current);
        latestPlan.current = aligned.itinerary;
        setPlan(aligned.itinerary);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }
    void loadData();
    return () => {
      isCancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [trip.id]);

  // Cập nhật khi trip.ideas thay đổi từ bên ngoài
  useEffect(() => {
    if (trip.ideas && trip.ideas.length > 0) {
      setTripIdeas(trip.ideas);
    }
  }, [trip.ideas]);

  // ─── 5. Thao tác THỦ CÔNG (Manual Planning First) ───

  // Thêm ý tưởng vào ngày cụ thể
  const handleAddIdeaToDay = (dayNumber: number, poi: Poi) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;

      const stops = [...day.stops];
      const newStop = stopFromPoi(poi, 'manual');

      // Tự động tính toán khung giờ kế tiếp
      let startH = 9;
      let startM = 0;
      const lastStop = stops[stops.length - 1];
      if (lastStop && lastStop.end_time) {
        const [h, m] = lastStop.end_time.split(':').map(Number);
        startH = Math.min(21, (h || 9) + (m >= 45 ? 1 : 0));
        startM = (m + 15) % 60;
      }
      const dur = poi.average_visit_minutes || 90;
      const endTotalM = startH * 60 + startM + dur;
      const endH = Math.min(23, Math.floor(endTotalM / 60));
      const endM = endTotalM % 60;

      newStop.start_time = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
      newStop.end_time = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      stops.push(newStop);
      return { ...day, stops };
    });

    const nextPlan = { ...plan, days: nextDays };
    persistPlan(nextPlan);
    setOpenDayMenuForIdeaId(null);
    setActiveIdeaPickerForDay(null);
  };

  // Bỏ địa điểm khỏi ngày (đưa về lại kho ý tưởng tự do)
  const handleRemovePoiFromDay = (poiId: string) => {
    const nextDays = plan.days.map((day) => ({
      ...day,
      stops: day.stops.filter((s) => s.poi_id !== poiId && s.stop_id !== poiId),
    }));
    persistPlan({ ...plan, days: nextDays });
  };

  // Đổi thứ tự điểm dừng trong ngày
  const handleMoveStop = (dayNumber: number, stopIndex: number, direction: 'up' | 'down') => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const stops = [...day.stops];
      const targetIndex = direction === 'up' ? stopIndex - 1 : stopIndex + 1;
      if (targetIndex < 0 || targetIndex >= stops.length) return day;

      const temp = stops[stopIndex];
      stops[stopIndex] = stops[targetIndex];
      stops[targetIndex] = temp;

      return { ...day, stops: stops.map((s, idx) => ({ ...s, sequence: idx })) };
    });

    persistPlan({ ...plan, days: nextDays });
  };

  // Xóa điểm dừng (stop) khỏi lịch
  const handleDeleteStop = (dayNumber: number, stopId: string) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const stops = day.stops.filter((s) => s.stop_id !== stopId);
      return { ...day, stops: stops.map((s, idx) => ({ ...s, sequence: idx })) };
    });
    persistPlan({ ...plan, days: nextDays });
  };

  // Thêm mốc Nghỉ trưa thủ công (PB11 Rest Planning)
  const handleAddLunchBreak = (dayNumber: number) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const alreadyHasRest = day.stops.some((s) => s.stop_type === 'rest');
      if (alreadyHasRest) return day;

      const lunchStop: ItineraryStop = {
        stop_id: `rest-${day.day_id}-${Date.now()}`,
        poi_id: null,
        title: 'Nghỉ trưa & phục hồi',
        city: trip.destination,
        address: 'Quán ăn đặc sản hoặc quán cà phê thanh tịnh',
        category: 'rest',
        stop_type: 'rest',
        source: 'manual',
        sequence: 0,
        duration_minutes: 90,
        start_time: '12:00',
        end_time: '13:30',
        comment: 'Ăn trưa chậm rãi, nạp lại năng lượng tại quán cà phê hoặc nơi lưu trú.',
        latitude: null,
        longitude: null,
      };

      const stops = [...day.stops];
      // Chèn vào vị trí gần 12h
      const laterIndex = stops.findIndex(
        (s) => s.start_time && minutesFromTime(s.start_time) >= 12 * 60
      );
      if (laterIndex >= 0) {
        stops.splice(laterIndex, 0, lunchStop);
      } else {
        stops.push(lunchStop);
      }

      return { ...day, stops: stops.map((s, idx) => ({ ...s, sequence: idx })) };
    });

    persistPlan({ ...plan, days: nextDays });
  };

  // Lưu chỉnh sửa giờ
  const handleSaveEditTime = (dayNumber: number, stopId: string) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const stops = day.stops.map((s) =>
        s.stop_id === stopId ? { ...s, start_time: editStartTime, end_time: editEndTime } : s
      );
      return { ...day, stops };
    });
    persistPlan({ ...plan, days: nextDays });
    setEditingStopId(null);
  };

  // Thêm ngày mới vào lịch
  const handleAddDay = () => {
    const nextNumber = plan.days.length + 1;
    const nextDays = [
      ...plan.days,
      {
        day_id: `${plan.trip_id}-day-${nextNumber}`,
        day_number: nextNumber,
        date: null,
        title: `Ngày ${nextNumber} • Trải nghiệm mở rộng`,
        stops: [],
      },
    ];
    persistPlan({ ...plan, days_count: nextDays.length, days: nextDays });
    setSelectedDayTab(nextNumber);
  };

  // ─── 6. TRỢ LÝ TỰ ĐỘNG LÊN KẾ HOẠCH (AI Assistant Optimization) ───
  const handleAssistantOptimize = () => {
    const pacing = pacingForTrip(trip);
    const capacity = dailyVisitCapacity(pacing);

    const result = optimizeDays(plan.days, ideaPois, capacity, trip.itineraryOutline);
    persistPlan({ ...plan, days: result.days });

    const parts = [
      result.assignedCount ? `${result.assignedCount} địa điểm` : '',
      result.restCount ? `${result.restCount} khoảng nghỉ trưa` : '',
    ].filter(Boolean);

    if (parts.length > 0) {
      setInsightMessage(
        `✨ Trợ lý đã tự động xếp ${parts.join(' và ')} vào lịch trình theo thứ tự địa lý gần nhau và nhịp đi ${pacing}.`
      );
    } else if (result.unassignedCount) {
      setInsightMessage(
        `Các ngày hiện tại đã kín lịch theo nhịp đi ${pacing}. Bạn có thể thêm ngày mới hoặc tự gán thêm điểm.`
      );
    } else {
      setInsightMessage('Tất cả ý tưởng đều đã được xếp vào lịch trình tối ưu!');
    }
  };

  // Thêm địa điểm mới vào kho Ý tưởng (từ modal tìm kiếm)
  const handleToggleIdeaInTrip = (poiId: string) => {
    setTripIdeas((prev) => {
      const next = prev.includes(poiId) ? prev.filter((id) => id !== poiId) : [...prev, poiId];
      if (onUpdateTrip) {
        onUpdateTrip({ ...trip, ideas: next });
      }
      return next;
    });
  };

  // Thêm địa điểm tự tạo
  const handleAddCustomIdea = () => {
    const name = customIdeaInput.trim();
    if (!name) return;
    const customId = `custom-${name}`;
    handleToggleIdeaInTrip(customId);
    setCustomIdeaInput('');
    setCustomIdeaAddress('');
    setShowAddIdeasModal(false);
  };

  // Nút Xong: Lưu và quay lại
  const handleDone = () => {
    persistPlan(plan);
    if (onUpdateTrip) {
      onUpdateTrip({ ...trip, ideas: tripIdeas });
    }
    onBack();
  };

  // ─── 7. Lọc POI hiển thị trên Bản đồ tương tác ───
  const mapPois = useMemo(() => {
    const displayedDays =
      selectedDayTab === 'all'
        ? plan.days
        : plan.days.filter((d) => d.day_number === selectedDayTab);

    const stopsPois: Poi[] = [];
    displayedDays.forEach((day) => {
      day.stops.forEach((stop) => {
        if (stop.stop_type === 'rest') return;
        const matched = allPois.find((p) => p.id === stop.poi_id);
        if (matched) {
          stopsPois.push(matched);
        } else if (stop.latitude != null && stop.longitude != null) {
          stopsPois.push({
            id: stop.poi_id || stop.stop_id,
            name: stop.title,
            city: (stop.city as PoiCity) || 'Đà Nẵng',
            category: (stop.category as PoiCategory) || 'Quán ăn',
            image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80',
            address: stop.address || '',
            description: '',
            lat: stop.latitude,
            lng: stop.longitude,
            rating: 4.8,
            visitDuration: '1.5 giờ',
            ecoScore: 85,
            isGreen: true,
          });
        }
      });
    });
    return stopsPois;
  }, [plan.days, selectedDayTab, allPois]);

  // Bộ lọc POI trong Modal "Thêm vào ý tưởng"
  const modalFilteredPois = useMemo(() => {
    return allPois.filter((p) => {
      if (modalCity !== 'all' && normalizeCity(p.city) !== modalCity) return false;
      if (modalCategory !== 'all' && normalizeCategory(p.category) !== modalCategory) return false;
      if (modalSearch.trim()) {
        const q = modalSearch.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.address || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [allPois, modalCity, modalCategory, modalSearch]);

  // Các ngày hiển thị ở cột Lịch trình
  const renderedDays = useMemo(() => {
    if (selectedDayTab === 'all') return plan.days;
    return plan.days.filter((d) => d.day_number === selectedDayTab);
  }, [plan.days, selectedDayTab]);

  return (
    <div className="flex flex-col h-full w-full bg-white text-gray-900 select-none overflow-hidden animate-fadeIn">
      {/* ─── TOP HEADER (Thanh tiêu đề chuẩn Mindtrip) ─── */}
      <header className="px-6 py-3.5 bg-white border-b border-gray-200/90 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-full border border-gray-200 hover:border-black hover:bg-gray-50 flex items-center justify-center text-gray-700 hover:text-black transition cursor-pointer shrink-0"
            title="Quay lại chuyến đi"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="font-extrabold text-[17px] sm:text-[19px] text-gray-950 truncate leading-snug">
              {trip.title || `Chuyến đi ${trip.destination}`}
            </h1>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5 font-medium">
              <span>{trip.destination}</span>
              <span>•</span>
              <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">
                {plan.days.length} ngày lịch trình
              </span>
              <span>•</span>
              <span>{trip.startDate || 'Tháng 11/2026'}</span>
            </div>
          </div>
        </div>

        {/* Nút hành động phải: AI Assistant & Xong */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleAssistantOptimize}
            className="h-9 px-4 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            title="Trợ lý tự xếp các ý tưởng còn lại và chèn mốc nghỉ trưa"
          >
            <Sparkles size={14} className="text-amber-200" />
            <span>AI Tự lên lịch</span>
          </button>

          <div className="text-xs text-gray-500 hidden sm:flex items-center gap-1 font-medium mr-1">
            {isSaving ? (
              <span className="flex items-center gap-1 text-amber-700">
                <RefreshCw size={12} className="animate-spin" /> Đang lưu...
              </span>
            ) : hasUnsavedChanges ? (
              <span className="text-gray-400">Chưa lưu</span>
            ) : (
              <span className="text-emerald-700 flex items-center gap-1">
                <Check size={13} /> Đã lưu
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleDone}
            className="h-9 px-5 rounded-full bg-black hover:bg-neutral-800 text-white text-xs font-bold transition cursor-pointer shadow-xs active:scale-95"
          >
            Xong
          </button>
        </div>
      </header>

      {/* Thông báo Insight Trợ lý AI */}
      {insightMessage && (
        <div className="bg-emerald-50/90 border-b border-emerald-200 px-6 py-2.5 flex items-center justify-between text-xs text-emerald-950 font-medium animate-fadeIn">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-emerald-700 shrink-0" />
            <span>{insightMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setInsightMessage(null)}
            className="text-emerald-800 hover:text-black text-xs font-bold ml-4 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Thông báo lỗi nếu có */}
      {errorMessage && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs text-amber-900 font-medium">
          {errorMessage}
        </div>
      )}

      {/* ─── NỘI DUNG CHÍNH (2 CỘT CHUẨN MINDTRIP) ─── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
        {/* ════════════════════════════════════════════════════════
            CỘT TRÁI: Ý TƯỞNG + LỊCH THEO NGÀY (THỦ CÔNG TRƯỚC)
        ════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-6 xl:col-span-6 border-r border-gray-100 flex flex-col h-full bg-white overflow-y-auto px-5 sm:px-6 py-5 [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-track]:bg-transparent">
          {/* ────────────────────────────────────────────────────────
              1. PHẦN Ý TƯỞNG (IDEAS CAROUSEL - CHUẨN MINDTRIP)
          ──────────────────────────────────────────────────────── */}
          <section className="shrink-0 mb-6">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setExpandIdeas(!expandIdeas)}
                className="flex items-center gap-2 group cursor-pointer text-left"
              >
                {expandIdeas ? (
                  <ChevronDown size={18} className="text-gray-600 group-hover:text-black transition" />
                ) : (
                  <ChevronUp size={18} className="text-gray-600 group-hover:text-black transition" />
                )}
                <h2 className="font-extrabold text-[16px] text-gray-950 flex items-center gap-2">
                  <span>Ý tưởng</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {ideaPois.length} địa điểm
                  </span>
                </h2>
              </button>

              <button
                type="button"
                onClick={() => setShowAddIdeasModal(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-gray-700 hover:text-black bg-gray-100 hover:bg-gray-200/80 px-3 py-1.5 rounded-full transition cursor-pointer"
              >
                <Plus size={13} />
                <span>Thêm địa điểm</span>
              </button>
            </div>

            {expandIdeas && (
              <div className="space-y-3">
                {ideaPois.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-dashed border-gray-300 text-center bg-gray-50/50">
                    <Lightbulb size={24} className="mx-auto text-amber-500 mb-2" />
                    <p className="text-xs text-gray-600 mb-3">
                      Chưa có địa điểm nào trong Ý tưởng của chuyến đi.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowAddIdeasModal(true)}
                      className="px-4 py-2 rounded-full bg-black text-white text-xs font-bold hover:bg-neutral-800 transition cursor-pointer"
                    >
                      + Khám phá địa điểm để thêm
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-2 pt-1 no-scrollbar -mx-1 px-1">
                    {ideaPois.map((poi) => {
                      const dayNumber = getDayNumberForPoi(poi.id);
                      const isPlaced = dayNumber !== null;
                      const isMenuOpen = openDayMenuForIdeaId === poi.id;

                      return (
                        <div
                          key={poi.id}
                          className={`w-[185px] shrink-0 rounded-2xl border transition-all flex flex-col overflow-hidden relative group bg-white ${
                            isPlaced
                              ? 'border-emerald-200 shadow-2xs opacity-85'
                              : 'border-gray-200 hover:border-gray-400 hover:shadow-sm'
                          }`}
                        >
                          {/* Ảnh thẻ ý tưởng */}
                          <div className="h-[105px] w-full relative overflow-hidden bg-gray-100">
                            <img
                              src={getPoiImage(poi)}
                              alt={poi.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                            {/* Tag danh mục */}
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-white text-[10.5px] font-medium flex items-center gap-1">
                              {getCategoryIcon(poi.category)}
                              <span className="capitalize">{poi.category || 'Địa điểm'}</span>
                            </div>

                            {/* Nút yêu thích */}
                            <button
                              type="button"
                              onClick={() => handleToggleIdeaInTrip(poi.id)}
                              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-rose-600 transition shadow-xs cursor-pointer"
                              title="Bỏ khỏi ý tưởng"
                            >
                              <Heart size={12} className="fill-rose-600" />
                            </button>
                          </div>

                          {/* Thông tin thẻ */}
                          <div className="p-3 flex flex-col flex-1 justify-between gap-2">
                            <div>
                              <h3
                                className="font-bold text-[13.5px] text-gray-950 truncate leading-snug"
                                title={poi.name}
                              >
                                {poi.name}
                              </h3>
                              <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                {poi.city} • {poi.visitDuration || '1.5 giờ'}
                              </p>
                            </div>

                            {/* Nút hành động: THỦ CÔNG THÊM VÀO NGÀY */}
                            <div className="relative pt-1">
                              {isPlaced ? (
                                <div className="flex items-center justify-between bg-emerald-50 text-emerald-800 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-emerald-200">
                                  <span>✓ Ngày {dayNumber}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePoiFromDay(poi.id)}
                                    className="text-emerald-700 hover:text-rose-700 ml-1 cursor-pointer font-extrabold"
                                    title="Bỏ khỏi ngày này"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOpenDayMenuForIdeaId(isMenuOpen ? null : poi.id)
                                    }
                                    className="w-full py-1.5 px-2.5 rounded-xl bg-gray-100 hover:bg-black hover:text-white text-gray-900 text-[11.5px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                                  >
                                    <Plus size={12} />
                                    <span>Thêm vào ngày</span>
                                    <ChevronDown size={11} />
                                  </button>

                                  {/* Dropdown Menu chọn ngày thủ công */}
                                  {isMenuOpen && (
                                    <div className="absolute bottom-full mb-1 left-0 w-full bg-white rounded-xl shadow-xl border border-gray-200 p-1.5 z-40 animate-fadeIn">
                                      <div className="text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider">
                                        Chọn ngày:
                                      </div>
                                      {plan.days.map((day) => (
                                        <button
                                          key={day.day_number}
                                          type="button"
                                          onClick={() => handleAddIdeaToDay(day.day_number, poi)}
                                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-800 hover:bg-emerald-50 hover:text-emerald-900 flex items-center justify-between cursor-pointer"
                                        >
                                          <span>Ngày {day.day_number}</span>
                                          <span className="text-[10px] text-gray-400">
                                            {day.stops.length} điểm
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          <hr className="border-gray-100 mb-6" />

          {/* ────────────────────────────────────────────────────────
              2. PHẦN LỊCH TRÌNH THEO NGÀY (ITINERARY TIMELINE)
          ──────────────────────────────────────────────────────── */}
          <section className="flex-1 flex flex-col min-h-0">
            {/* Header Lịch trình & Bộ lọc ngày */}
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="font-extrabold text-[16px] text-gray-950 flex items-center gap-2">
                <span>Lịch trình</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {plan.days.length} ngày
                </span>
              </h2>

              <button
                type="button"
                onClick={handleAddDay}
                className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
              >
                <Plus size={13} />
                <span>Thêm ngày</span>
              </button>
            </div>

            {/* Thanh chọn ngày (Pill Bar) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 mb-4 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedDayTab('all')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer shrink-0 ${
                  selectedDayTab === 'all'
                    ? 'bg-black text-white shadow-xs'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                Tất cả các ngày
              </button>

              {plan.days.map((day) => {
                const isActive = selectedDayTab === day.day_number;
                return (
                  <button
                    key={day.day_number}
                    type="button"
                    onClick={() => setSelectedDayTab(day.day_number)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-black text-white shadow-xs'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    <span>Ngày {day.day_number}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                        isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {day.stops.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Danh sách các ngày và điểm dừng */}
            <div className="space-y-6">
              {renderedDays.map((day) => {
                const hasStops = day.stops.length > 0;
                const hasLunchBreak = day.stops.some((s) => s.stop_type === 'rest');
                const isPickerActive = activeIdeaPickerForDay === day.day_id;

                // Các ý tưởng chưa được gán vào ngày này
                const unplacedIdeasForDay = ideaPois.filter(
                  (poi) => !day.stops.some((s) => s.poi_id === poi.id)
                );

                return (
                  <div
                    key={day.day_id}
                    className="rounded-2xl border border-gray-200/90 bg-white overflow-hidden shadow-2xs"
                  >
                    {/* Header Ngày */}
                    <div className="bg-gray-50/90 px-4 py-3 flex items-center justify-between border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-black text-white text-xs font-bold flex items-center justify-center">
                          {day.day_number}
                        </span>
                        <div>
                          <h3 className="font-extrabold text-[14.5px] text-gray-950">
                            Ngày {day.day_number}{' '}
                            {day.title ? `• ${day.title}` : `• Khám phá ${trip.destination}`}
                          </h3>
                          {day.date && (
                            <p className="text-[11px] text-gray-500 font-medium">
                              {displayDateVi(day.date)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium">
                          {day.stops.length} điểm ghé thăm
                        </span>
                      </div>
                    </div>

                    {/* Danh sách Điểm dừng trong Ngày */}
                    <div className="p-4 space-y-3">
                      {!hasStops ? (
                        <div className="py-8 px-4 text-center rounded-xl bg-gray-50/60 border border-dashed border-gray-200">
                          <p className="text-xs text-gray-600 mb-3">
                            Chưa có địa điểm nào trong Ngày {day.day_number}. Hãy chọn "+ Thêm vào
                            ngày" ở hàng Ý tưởng phía trên hoặc bấm nút dưới.
                          </p>
                          <button
                            type="button"
                            onClick={() => setActiveIdeaPickerForDay(isPickerActive ? null : day.day_id)}
                            className="px-4 py-1.5 rounded-full bg-black text-white text-xs font-bold hover:bg-neutral-800 transition cursor-pointer"
                          >
                            + Thêm điểm từ Ý tưởng
                          </button>
                        </div>
                      ) : (
                        day.stops.map((stop, sIdx) => {
                          const isRest = stop.stop_type === 'rest';
                          const matchedPoi = allPois.find((p) => p.id === stop.poi_id);
                          const isEditing = editingStopId === stop.stop_id;

                          // Khoảng cách tới điểm kế tiếp
                          const nextStop = day.stops[sIdx + 1];
                          let transitDist: number | null = null;
                          if (nextStop && !isRest && nextStop.stop_type !== 'rest') {
                            transitDist = distanceKm(stop, nextStop);
                          }

                          return (
                            <React.Fragment key={stop.stop_id}>
                              {/* Thẻ Điểm Dừng */}
                              <div
                                onMouseEnter={() => setHoveredStopId(stop.poi_id || stop.stop_id)}
                                onMouseLeave={() => setHoveredStopId(null)}
                                className={`rounded-xl p-3 border transition-all ${
                                  isRest
                                    ? 'bg-amber-50/70 border-amber-200'
                                    : 'bg-white border-gray-200 hover:border-gray-400 shadow-2xs'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  {/* Ảnh thumbnail */}
                                  {isRest ? (
                                    <div className="w-14 h-14 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 shrink-0">
                                      <Coffee size={24} />
                                    </div>
                                  ) : (
                                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                                      <img
                                        src={getPoiImage(matchedPoi)}
                                        alt={stop.title}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                      />
                                    </div>
                                  )}

                                  {/* Nội dung điểm */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <span className="w-4 h-4 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                                        {sIdx + 1}
                                      </span>
                                      <h4 className="font-extrabold text-[14px] text-gray-950 truncate">
                                        {stop.title}
                                      </h4>
                                    </div>

                                    {/* Giờ tham quan */}
                                    {isEditing ? (
                                      <div className="flex items-center gap-1.5 mt-1">
                                        <input
                                          type="time"
                                          value={editStartTime}
                                          onChange={(e) => setEditStartTime(e.target.value)}
                                          className="text-xs border border-gray-300 rounded px-1.5 py-0.5"
                                        />
                                        <span>–</span>
                                        <input
                                          type="time"
                                          value={editEndTime}
                                          onChange={(e) => setEditEndTime(e.target.value)}
                                          className="text-xs border border-gray-300 rounded px-1.5 py-0.5"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleSaveEditTime(day.day_number, stop.stop_id)
                                          }
                                          className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded cursor-pointer"
                                        >
                                          Lưu
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingStopId(null)}
                                          className="text-[11px] text-gray-500 cursor-pointer"
                                        >
                                          Hủy
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingStopId(stop.stop_id);
                                          setEditStartTime(stop.start_time || '09:00');
                                          setEditEndTime(stop.end_time || '10:30');
                                        }}
                                        className="flex items-center gap-1 text-xs text-gray-600 hover:text-black font-medium mt-0.5 cursor-pointer"
                                        title="Bấm để sửa giờ"
                                      >
                                        <Clock size={12} className="text-gray-400" />
                                        <span>
                                          {stop.start_time || '09:00'} – {stop.end_time || '10:30'}
                                        </span>
                                      </button>
                                    )}

                                    {/* Địa chỉ / Ghi chú */}
                                    <p className="text-[11.5px] text-gray-500 mt-1 truncate">
                                      {stop.address || stop.comment || stop.city || trip.destination}
                                    </p>
                                  </div>

                                  {/* Thao tác: Lên / Xuống / Xóa */}
                                  <div className="flex items-center gap-1 shrink-0 ml-1">
                                    <button
                                      type="button"
                                      disabled={sIdx === 0}
                                      onClick={() => handleMoveStop(day.day_number, sIdx, 'up')}
                                      className="w-7 h-7 rounded-lg border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                      title="Di chuyển lên trước"
                                    >
                                      <ArrowUp size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={sIdx === day.stops.length - 1}
                                      onClick={() => handleMoveStop(day.day_number, sIdx, 'down')}
                                      className="w-7 h-7 rounded-lg border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                      title="Di chuyển xuống sau"
                                    >
                                      <ArrowDown size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteStop(day.day_number, stop.stop_id)}
                                      className="w-7 h-7 rounded-lg border border-gray-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 flex items-center justify-center text-gray-400 transition cursor-pointer"
                                      title="Bỏ điểm dừng này"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Đường nối khoảng cách giữa 2 điểm (Transit line) */}
                              {transitDist !== null && (
                                <div className="ml-7 pl-4 py-1.5 border-l-2 border-dashed border-gray-300 flex items-center gap-2 text-[11px] text-gray-500 font-medium">
                                  <Car size={13} className="text-gray-400 shrink-0" />
                                  <span>
                                    ~{transitDist < 1 ? `${Math.round(transitDist * 1000)}m` : `${transitDist.toFixed(1)} km`}{' '}
                                    (~{Math.max(5, Math.round(transitDist * 3.5))} phút xe điện)
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-semibold">
                                    Giảm ~0.2kg CO2
                                  </span>
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}

                      {/* Dropdown nhanh thêm điểm từ Ý tưởng vào Ngày */}
                      {isPickerActive && (
                        <div className="mt-3 p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-2 animate-fadeIn">
                          <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                            <span>Chọn một ý tưởng để thêm vào Ngày {day.day_number}:</span>
                            <button
                              type="button"
                              onClick={() => setActiveIdeaPickerForDay(null)}
                              className="text-gray-400 hover:text-black cursor-pointer font-bold"
                            >
                              ✕
                            </button>
                          </div>
                          {unplacedIdeasForDay.length === 0 ? (
                            <p className="text-xs text-gray-500 py-2">
                              Tất cả các ý tưởng đã được thêm vào ngày này.
                            </p>
                          ) : (
                            <div className="max-h-48 overflow-y-auto space-y-1">
                              {unplacedIdeasForDay.map((poi) => (
                                <button
                                  key={poi.id}
                                  type="button"
                                  onClick={() => handleAddIdeaToDay(day.day_number, poi)}
                                  className="w-full text-left px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-black text-xs font-semibold text-gray-900 flex items-center justify-between cursor-pointer"
                                >
                                  <span className="truncate">{poi.name}</span>
                                  <span className="text-[10px] text-gray-500 shrink-0 ml-2">
                                    {poi.city}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Các nút thêm ở cuối ngày */}
                      <div className="pt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveIdeaPickerForDay(isPickerActive ? null : day.day_id)
                          }
                          className="px-3 py-1.5 rounded-full border border-gray-300 hover:border-black text-xs font-semibold text-gray-800 hover:bg-gray-50 transition flex items-center gap-1 cursor-pointer"
                        >
                          <Plus size={13} />
                          <span>Thêm điểm vào ngày {day.day_number}</span>
                        </button>

                        {!hasLunchBreak && (
                          <button
                            type="button"
                            onClick={() => handleAddLunchBreak(day.day_number)}
                            className="px-3 py-1.5 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                          >
                            <Coffee size={13} className="text-amber-700" />
                            <span>+ Thêm mốc nghỉ trưa (12:00 – 13:30)</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ════════════════════════════════════════════════════════
            CỘT PHẢI: BẢN ĐỒ LỘ TRÌNH ĐỒNG BỘ (POI MAP & ELEVATION)
        ════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-6 xl:col-span-6 h-full relative bg-gray-100 flex flex-col">
          {/* Bản đồ Leaflet đồng bộ */}
          <div className="flex-1 w-full h-full relative">
            <PoiMap
              pois={mapPois.length > 0 ? mapPois : allPois.slice(0, 10)}
              selectedPoiId={selectedMapPoiId}
              hoveredPoiId={hoveredStopId}
              onSelectPoi={(id) => setSelectedMapPoiId(id)}
              onHoverPoi={(id) => setHoveredStopId(id)}
            />

            {/* Widget cao độ & Hành trình xanh nổi trên bản đồ */}
            <div className="absolute bottom-5 left-5 right-5 z-[500] pointer-events-none">
              <div className="bg-black/85 backdrop-blur-md rounded-2xl p-4 text-white shadow-2xl border border-white/10 pointer-events-auto max-w-lg mx-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <h4 className="font-extrabold text-xs tracking-wider uppercase text-emerald-300">
                      Cao độ & Hành trình xanh
                    </h4>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    🌱 Giảm ~0.8kg CO2
                  </span>
                </div>

                <div className="h-10 w-full mb-2 opacity-90">
                  <ThreeElevationWave
                    className="w-full h-full"
                    co2SavedKg={0.8}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-gray-300 pt-1 border-t border-white/10 font-medium">
                  <span>
                    Lộ trình{' '}
                    {selectedDayTab === 'all' ? 'toàn chuyến' : `Ngày ${selectedDayTab}`}:{' '}
                    <strong className="text-white">{mapPois.length} điểm</strong>
                  </span>
                  <span>Di chuyển xanh: Xe điện & Đi bộ</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── MODAL TÌM KIẾM & THÊM VÀO Ý TƯỞNG (ADD IDEAS MODAL) ─── */}
      {showAddIdeasModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs py-6 px-4 animate-fadeIn"
          onClick={() => setShowAddIdeasModal(false)}
        >
          <div
            className="relative bg-white w-[760px] max-w-[calc(100vw-32px)] h-[calc(100vh-80px)] max-h-[780px] rounded-3xl shadow-2xl flex flex-col border border-gray-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="font-extrabold text-[17px] text-gray-950">
                Thêm địa điểm vào Ý tưởng
              </h3>
              <button
                type="button"
                onClick={() => setShowAddIdeasModal(false)}
                className="w-8 h-8 rounded-full border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-black cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Thanh tìm kiếm & Bộ lọc */}
            <div className="p-5 border-b border-gray-100 space-y-3 shrink-0 bg-gray-50/50">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm theo tên địa điểm, món ăn, di tích..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-300 text-sm focus:border-black focus:outline-none"
                />
              </div>

              {/* Hàng chọn Thành phố & Danh mục */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                <div className="flex items-center gap-1 border-r border-gray-200 pr-2 mr-1 shrink-0">
                  {(['all', 'Đà Nẵng', 'Huế'] as const).map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => setModalCity(city)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                        modalCity === city
                          ? 'bg-black text-white'
                          : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {city === 'all' ? 'Tất cả TP' : city}
                    </button>
                  ))}
                </div>

                {MODAL_CATEGORY_TABS.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setModalCategory(cat.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition cursor-pointer ${
                      modalCategory === cat.id
                        ? 'bg-black text-white'
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Danh sách địa điểm */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {modalFilteredPois.slice(0, 30).map((poi) => {
                  const isAdded = tripIdeas.includes(poi.id);
                  return (
                    <div
                      key={poi.id}
                      className="rounded-2xl border border-gray-200 p-3 flex gap-3 hover:border-gray-400 transition bg-white shadow-2xs"
                    >
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                        <img
                          src={getPoiImage(poi)}
                          alt={poi.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <h4 className="font-bold text-[13.5px] text-gray-950 truncate">
                            {poi.name}
                          </h4>
                          <p className="text-[11px] text-gray-500 truncate mt-0.5">
                            {poi.city} • {poi.category}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleIdeaInTrip(poi.id)}
                          className={`mt-2 py-1 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer w-fit ${
                            isAdded
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                              : 'bg-black text-white hover:bg-neutral-800'
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <Check size={12} /> Đã có trong Ý tưởng
                            </>
                          ) : (
                            <>
                              <Plus size={12} /> Thêm vào ý tưởng
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Mục tự tạo địa điểm */}
              <div className="mt-6 pt-5 border-t border-gray-100">
                <h4 className="font-bold text-sm text-gray-950 mb-2">
                  Tự thêm địa điểm yêu thích của bạn
                </h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nhập tên quán ăn hoặc điểm tham quan..."
                    value={customIdeaInput}
                    onChange={(e) => setCustomIdeaInput(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border border-gray-300 text-sm focus:border-black focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomIdea}
                    disabled={!customIdeaInput.trim()}
                    className="px-4 py-2 rounded-xl bg-black text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
                  >
                    + Thêm
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

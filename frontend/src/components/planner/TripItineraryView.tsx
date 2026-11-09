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
  Car,
  MoreHorizontal,
  FileText,
  Pencil,
  GripVertical,
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

function formatCategoryLabel(cat?: string | null): string {
  if (!cat) return 'Địa điểm';
  const c = cat.toLowerCase().replace(/[-_]/g, ' ');
  if (c.includes('quan an') || c.includes('quán ăn') || c.includes('ẩm thực') || c.includes('food') || c.includes('restaurant')) return 'Quán ăn';
  if (c.includes('di tich') || c.includes('di tích') || c.includes('lăng') || c.includes('đại nội')) return 'Di tích';
  if (c.includes('chua') || c.includes('chùa')) return 'Chùa chiền';
  if (c.includes('bien') || c.includes('biển')) return 'Bãi biển';
  if (c.includes('canh quan') || c.includes('cảnh quan')) return 'Cảnh quan';
  if (c.includes('ca phe') || c.includes('cà phê') || c.includes('coffee')) return 'Cà phê';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

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

function getDefaultDurationMinutes(category?: string | null): number {
  const c = (category || '').toLowerCase();
  if (c.includes('ăn') || c.includes('ẩm thực') || c.includes('quán') || c.includes('restaurant')) return 90;
  if (c.includes('di tích') || c.includes('lăng') || c.includes('đại nội') || c.includes('bảo tàng')) return 120;
  if (c.includes('bà nà') || c.includes('ngũ hành sơn') || c.includes('sơn trà')) return 180;
  if (c.includes('cà phê') || c.includes('cầu rồng') || c.includes('cầu quay')) return 60;
  return 90;
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

  // Tham chiếu tự động lưu
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersion = useRef(0);
  const latestPlan = useRef(plan);
  const currentTrip = useRef(trip);
  currentTrip.current = trip;

  // ─── 2. Quản lý Ý tưởng (Ideas List) ───
  const [tripIdeas, setTripIdeas] = useState<string[]>(() => {
    if (Array.isArray(trip.ideas) && trip.ideas.length > 0) return trip.ideas;
    const isHue = /hue|huế/i.test(trip.destination);
    const targetCity: PoiCity = isHue ? 'Huế' : 'Đà Nẵng';
    const cityPois = allPois.filter((p) => normalizeCity(p.city) === targetCity);
    const defaults = cityPois.slice(0, 8).map((p) => p.id);
    return defaults.length > 0 ? defaults : ['poi-1', 'poi-2', 'poi-3', 'poi-4'];
  });

  // State giao diện
  const [expandIdeas, setExpandIdeas] = useState(true);
  const [ideasFilter, setIdeasFilter] = useState<'all' | 'unplaced' | 'food' | 'attraction'>('all');
  const [selectedDayTab, setSelectedDayTab] = useState<number | 'all'>('all');
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());
  const [showDistances, setShowDistances] = useState(true);
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('km');
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);

  // Thao tác nhanh cho từng thẻ Ideas & Ngày
  const [expandingDayPickerIdeaId, setExpandingDayPickerIdeaId] = useState<string | null>(null);
  const [activeMenuStopId, setActiveMenuStopId] = useState<string | null>(null);
  const [showItinerarySettingsMenu, setShowItinerarySettingsMenu] = useState(false);
  const [activeDayAddModal, setActiveDayAddModal] = useState<number | null>(null);
  const [dayAddModalSearch, setDayAddModalSearch] = useState('');
  const [dragOverDayNumber, setDragOverDayNumber] = useState<number | null>(null);

  // Chỉnh sửa giờ & Ghi chú (Notes)
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editEndTime, setEditEndTime] = useState('10:30');
  const [editingNoteStopId, setEditingNoteStopId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');

  // Modal Thêm địa điểm vào Ý tưởng
  const [showAddIdeasModal, setShowAddIdeasModal] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalCity, setModalCity] = useState<'all' | 'Đà Nẵng' | 'Huế'>(
    /hue|huế/i.test(trip.destination) ? 'Huế' : 'Đà Nẵng'
  );
  const [modalCategory, setModalCategory] = useState<string>('all');
  const [customIdeaInput, setCustomIdeaInput] = useState('');
  const [customIdeaAddress, setCustomIdeaAddress] = useState('');

  // Tiêu đề chuyến đi chuẩn, tránh hiển thị chữ 'a' đơn lẻ
  const displayTitle = useMemo(() => {
    if (trip.title && trip.title.trim().length > 2 && trip.title.trim().toLowerCase() !== 'a') {
      return trip.title;
    }
    return `Chuyến đi ${trip.destination}`;
  }, [trip.title, trip.destination]);

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

  // Lọc thẻ ý tưởng theo dropdown All ▾
  const filteredIdeaPois = useMemo(() => {
    return ideaPois.filter((p) => {
      const dayNum = getDayNumberForPoi(p.id);
      if (ideasFilter === 'unplaced' && dayNum !== null) return false;
      if (ideasFilter === 'food') {
        const cat = (p.category || '').toLowerCase();
        return cat.includes('ăn') || cat.includes('ẩm thực') || cat.includes('food') || cat.includes('quán');
      }
      if (ideasFilter === 'attraction') {
        const cat = (p.category || '').toLowerCase();
        return cat.includes('di tích') || cat.includes('thắng cảnh') || cat.includes('cảnh quan') || cat.includes('chùa');
      }
      return true;
    });
  }, [ideaPois, ideasFilter, getDayNumberForPoi]);

  // Gợi ý thông minh cho Modal (Suggested Places)
  const suggestedPois = useMemo(() => {
    const isHue = /hue|huế/i.test(trip.destination);
    const targetCity: PoiCity = isHue ? 'Huế' : 'Đà Nẵng';
    return allPois
      .filter((p) => normalizeCity(p.city) === targetCity && !tripIdeas.includes(p.id))
      .slice(0, 6);
  }, [allPois, trip.destination, tripIdeas]);

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

  useEffect(() => {
    if (trip.ideas && trip.ideas.length > 0) {
      setTripIdeas(trip.ideas);
    }
  }, [trip.ideas]);

  // ─── 5. Thao tác THỦ CÔNG & KÉO THẢ (Manual & Drag and Drop) ───

  // Thêm ý tưởng vào ngày cụ thể
  const handleAddIdeaToDay = (dayNumber: number, poi: Poi, targetIndex?: number) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;

      const stops = [...day.stops];
      const newStop = stopFromPoi(poi, 'manual');

      // Tự động tính thời lượng thông minh & khung giờ nối tiếp
      const dur = getDefaultDurationMinutes(poi.category);
      newStop.duration_minutes = dur;

      let startH = 9;
      let startM = 0;
      const prevStop = stops.length > 0 ? stops[stops.length - 1] : null;

      if (prevStop && prevStop.end_time) {
        const [h, m] = prevStop.end_time.split(':').map(Number);
        const nextStartMinutes = (h || 9) * 60 + (m || 0) + 15;
        startH = Math.min(21, Math.floor(nextStartMinutes / 60));
        startM = nextStartMinutes % 60;
      }

      const endTotalM = startH * 60 + startM + dur;
      const endH = Math.min(23, Math.floor(endTotalM / 60));
      const endM = endTotalM % 60;

      newStop.start_time = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
      newStop.end_time = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= stops.length) {
        stops.splice(targetIndex, 0, newStop);
      } else {
        stops.push(newStop);
      }

      return { ...day, stops: stops.map((s, idx) => ({ ...s, sequence: idx })) };
    });

    const nextPlan = { ...plan, days: nextDays };
    persistPlan(nextPlan);
    setExpandingDayPickerIdeaId(null);
    setActiveDayAddModal(null);
  };

  // Di chuyển điểm dừng giữa các ngày hoặc trong cùng ngày
  const handleMoveStopBetweenDays = (
    stopId: string,
    fromDayNumber: number,
    toDayNumber: number,
    targetIndex?: number
  ) => {
    let movingStop: ItineraryStop | undefined;

    const cleanedDays = plan.days.map((day) => {
      if (day.day_number !== fromDayNumber) return day;
      const found = day.stops.find((s) => s.stop_id === stopId);
      if (found) movingStop = { ...found };
      return {
        ...day,
        stops: day.stops.filter((s) => s.stop_id !== stopId).map((s, idx) => ({ ...s, sequence: idx })),
      };
    });

    if (!movingStop) return;

    const nextDays = cleanedDays.map((day) => {
      if (day.day_number !== toDayNumber) return day;
      const stops = [...day.stops];
      if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= stops.length) {
        stops.splice(targetIndex, 0, movingStop!);
      } else {
        stops.push(movingStop!);
      }
      return { ...day, stops: stops.map((s, idx) => ({ ...s, sequence: idx })) };
    });

    persistPlan({ ...plan, days: nextDays });
    setActiveMenuStopId(null);
  };

  // Bỏ địa điểm khỏi ngày (đưa về lại kho ý tưởng tự do)
  const handleRemovePoiFromDay = (poiId: string) => {
    const nextDays = plan.days.map((day) => ({
      ...day,
      stops: day.stops
        .filter((s) => s.poi_id !== poiId && s.stop_id !== poiId)
        .map((s, idx) => ({ ...s, sequence: idx })),
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

  // Lưu Ghi chú (Note) cho điểm dừng
  const handleSaveNote = (dayNumber: number, stopId: string) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const stops = day.stops.map((s) =>
        s.stop_id === stopId ? { ...s, comment: noteInput.trim() || null } : s
      );
      return { ...day, stops };
    });
    persistPlan({ ...plan, days: nextDays });
    setEditingNoteStopId(null);
    setNoteInput('');
  };

  // Thu gọn / Mở rộng ngày
  const toggleDayCollapse = (dayNumber: number) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayNumber)) next.delete(dayNumber);
      else next.add(dayNumber);
      return next;
    });
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
    setShowItinerarySettingsMenu(false);
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
    setShowItinerarySettingsMenu(false);
  };

  // Thao tác với kho Ý tưởng
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
              {displayTitle}
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
              <div className="flex items-center gap-3">
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
                    <span>Ideas</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {ideaPois.length} địa điểm
                    </span>
                  </h2>
                </button>

                {/* Dropdown lọc nhanh All ▾ */}
                <div className="relative">
                  <select
                    value={ideasFilter}
                    onChange={(e) => setIdeasFilter(e.target.value as any)}
                    className="text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 border-none rounded-full px-2.5 py-1 appearance-none pr-6 cursor-pointer focus:outline-none"
                  >
                    <option value="all">Tất cả (All)</option>
                    <option value="unplaced">Chưa xếp lịch</option>
                    <option value="food">Ẩm thực</option>
                    <option value="attraction">Điểm tham quan</option>
                  </select>
                  <ChevronDown size={11} className="absolute right-2 top-2 pointer-events-none text-gray-500" />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAddIdeasModal(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-gray-800 hover:text-black bg-gray-100 hover:bg-gray-200/90 px-3 py-1.5 rounded-full transition cursor-pointer"
              >
                <Plus size={13} />
                <span>+ Add</span>
              </button>
            </div>

            {expandIdeas && (
              <div className="space-y-3">
                {filteredIdeaPois.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-dashed border-gray-300 text-center bg-gray-50/50">
                    <Lightbulb size={24} className="mx-auto text-amber-500 mb-2" />
                    <p className="text-xs text-gray-600 mb-3">
                      {ideaPois.length === 0
                        ? 'Chưa có địa điểm nào trong Ideas của chuyến đi.'
                        : 'Không có địa điểm phù hợp với bộ lọc hiện tại.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowAddIdeasModal(true)}
                      className="px-4 py-2 rounded-full bg-black text-white text-xs font-bold hover:bg-neutral-800 transition cursor-pointer"
                    >
                      + Khám phá thêm địa điểm
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-3 pt-1 no-scrollbar -mx-1 px-1">
                    {filteredIdeaPois.map((poi) => {
                      const dayNumber = getDayNumberForPoi(poi.id);
                      const isPlaced = dayNumber !== null;
                      const isExpanding = expandingDayPickerIdeaId === poi.id;

                      return (
                        <div
                          key={poi.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', poi.id);
                            e.dataTransfer.effectAllowed = 'copyMove';
                          }}
                          className={`w-[205px] shrink-0 rounded-2xl border transition-all flex flex-col bg-white cursor-grab active:cursor-grabbing ${
                            isPlaced
                              ? 'border-emerald-300/80 shadow-2xs bg-emerald-50/10'
                              : 'border-gray-200 hover:border-gray-400 hover:shadow-sm'
                          }`}
                        >
                          {/* Ảnh bìa */}
                          <div className="h-[110px] w-full relative overflow-hidden rounded-t-2xl bg-gray-100">
                            <img
                              src={getPoiImage(poi)}
                              alt={poi.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                              loading="lazy"
                            />
                            {/* Tag danh mục tiếng Việt chuẩn */}
                            <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-black/65 backdrop-blur-xs text-white text-[11px] font-semibold flex items-center gap-1 shadow-xs">
                              {getCategoryIcon(poi.category)}
                              <span>{formatCategoryLabel(poi.category)}</span>
                            </div>

                            {/* Nút yêu thích / bỏ khỏi Ideas */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleIdeaInTrip(poi.id);
                              }}
                              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-rose-600 transition shadow-xs cursor-pointer"
                              title="Bỏ khỏi Ideas"
                            >
                              <Heart size={12} className="fill-rose-600" />
                            </button>
                          </div>

                          {/* Thông tin thẻ */}
                          <div className="p-3 flex flex-col flex-1 justify-between gap-2">
                            <div>
                              <h3
                                className="font-extrabold text-[13.5px] text-gray-950 truncate leading-snug"
                                title={poi.name}
                              >
                                {poi.name}
                              </h3>
                              <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                {poi.city} • {poi.visitDuration || 'Khoảng 1.5 giờ'}
                              </p>
                            </div>

                            {/* Nút hành động trực quan THÊM VÀO NGÀY */}
                            <div className="pt-1">
                              {isPlaced ? (
                                <div className="flex items-center justify-between bg-emerald-50 text-emerald-800 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-emerald-200">
                                  <span className="flex items-center gap-1">
                                    <Check size={12} className="text-emerald-700" /> Ngày {dayNumber}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePoiFromDay(poi.id)}
                                    className="text-emerald-700 hover:text-rose-700 ml-1 cursor-pointer font-extrabold text-xs"
                                    title="Gỡ khỏi ngày này (vẫn giữ trong Ideas)"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandingDayPickerIdeaId(isExpanding ? null : poi.id)
                                    }
                                    className="w-full py-1.5 px-2.5 rounded-xl bg-gray-100 hover:bg-black hover:text-white text-gray-900 text-[11.5px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                                  >
                                    <Plus size={12} />
                                    <span>Thêm vào ngày</span>
                                    <ChevronDown
                                      size={11}
                                      className={isExpanding ? 'rotate-180 transition-transform' : 'transition-transform'}
                                    />
                                  </button>

                                  {/* Khung chọn ngày trực quan mở ngay dưới nút, 100% hiển thị rõ ràng */}
                                  {isExpanding && (
                                    <div className="mt-2 p-2 bg-gray-50 rounded-xl border border-gray-200 space-y-1 animate-fadeIn">
                                      <div className="text-[10px] font-bold text-gray-400 uppercase px-1">
                                        Chọn ngày muốn xếp:
                                      </div>
                                      {plan.days.map((day) => (
                                        <button
                                          key={day.day_number}
                                          type="button"
                                          onClick={() => {
                                            handleAddIdeaToDay(day.day_number, poi);
                                            setExpandingDayPickerIdeaId(null);
                                          }}
                                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-800 hover:bg-black hover:text-white transition flex items-center justify-between cursor-pointer"
                                        >
                                          <span>Ngày {day.day_number}</span>
                                          <span className="text-[10px] opacity-70">
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

          <hr className="border-gray-100 mb-5" />

          {/* ────────────────────────────────────────────────────────
              2. PHẦN LỊCH TRÌNH THEO NGÀY (ITINERARY TIMELINE)
          ──────────────────────────────────────────────────────── */}
          <section className="flex-1 flex flex-col min-h-0">
            {/* Header Lịch trình & Distances Toggle */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h2 className="font-extrabold text-[16px] text-gray-950 flex items-center gap-2">
                  <span>Itinerary</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {plan.days.length} days
                  </span>
                </h2>

                {/* Nút gạt Distances (Khoảng cách) */}
                <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-200">
                  <span className="text-xs font-semibold text-gray-600">Distances</span>
                  <button
                    type="button"
                    onClick={() => setShowDistances(!showDistances)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      showDistances ? 'bg-black' : 'bg-gray-300'
                    }`}
                    role="switch"
                    aria-checked={showDistances}
                    title="Bật/Tắt hiển thị khoảng cách giữa các điểm"
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        showDistances ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Menu ba chấm ... cạnh tiêu đề Itinerary */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowItinerarySettingsMenu(!showItinerarySettingsMenu)}
                  className="w-8 h-8 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black cursor-pointer transition"
                  title="Tùy chọn lịch trình"
                >
                  <MoreHorizontal size={15} />
                </button>

                {showItinerarySettingsMenu && (
                  <div
                    className="absolute right-0 top-9 w-48 bg-white rounded-2xl shadow-xl border border-gray-200 p-1.5 z-40 text-xs animate-fadeIn"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={handleAddDay}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-semibold text-gray-900 flex items-center gap-2 cursor-pointer"
                    >
                      <Plus size={14} /> Thêm ngày mới
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDistanceUnit((prev) => (prev === 'km' ? 'mi' : 'km'));
                        setShowItinerarySettingsMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-semibold text-gray-900 flex items-center justify-between cursor-pointer"
                    >
                      <span>Đơn vị đo:</span>
                      <span className="font-bold uppercase text-emerald-800">
                        {distanceUnit === 'km' ? 'Kilomet (km)' : 'Dặm (mi)'}
                      </span>
                    </button>
                    <div className="border-t border-gray-100 my-1"></div>
                    <button
                      type="button"
                      onClick={handleAssistantOptimize}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-50 text-emerald-800 font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <Sparkles size={14} /> AI Tự lên lịch
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Thanh chọn ngày (Pill Bar) - Đã căn chỉnh đệm pt-1 pb-3 để KHÔNG BAO GIỜ BỊ CẮT CHỮ */}
            <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-3 mb-3 no-scrollbar shrink-0">
              <button
                type="button"
                onClick={() => setSelectedDayTab('all')}
                className={`h-8 px-4 rounded-full text-xs font-bold transition cursor-pointer shrink-0 flex items-center justify-center ${
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
                    className={`h-8 px-4 rounded-full text-xs font-bold transition cursor-pointer shrink-0 flex items-center gap-1.5 justify-center ${
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
            <div className="space-y-5">
              {renderedDays.map((day) => {
                const hasStops = day.stops.length > 0;
                const hasLunchBreak = day.stops.some((s) => s.stop_type === 'rest');
                const isCollapsed = collapsedDays.has(day.day_number);
                const isDraggingOver = dragOverDayNumber === day.day_number;

                // Các ý tưởng chưa được gán vào ngày này
                const unplacedIdeasForDay = ideaPois.filter(
                  (poi) => !day.stops.some((s) => s.poi_id === poi.id)
                );

                return (
                  <div
                    key={day.day_id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverDayNumber(day.day_number);
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDragLeave={() => setDragOverDayNumber(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverDayNumber(null);
                      const poiId = e.dataTransfer.getData('text/plain');
                      if (poiId) {
                        const poi =
                          allPois.find((p) => p.id === poiId) ||
                          ideaPois.find((p) => p.id === poiId);
                        if (poi) handleAddIdeaToDay(day.day_number, poi);
                      }
                    }}
                    className={`rounded-2xl border transition-all ${
                      isDraggingOver
                        ? 'border-2 border-dashed border-emerald-600 bg-emerald-50/40 shadow-md'
                        : 'border-gray-200/90 bg-white shadow-2xs'
                    }`}
                  >
                    {/* Header Ngày với nút thu gọn / mở rộng v */}
                    <div
                      onClick={() => toggleDayCollapse(day.day_number)}
                      className="bg-gray-50/90 px-4 py-3 flex items-center justify-between border-b border-gray-100 cursor-pointer hover:bg-gray-100/70 transition rounded-t-2xl"
                    >
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          className="text-gray-500 hover:text-black transition"
                          title={isCollapsed ? 'Mở rộng ngày' : 'Thu gọn ngày'}
                        >
                          {isCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
                        </button>
                        <h3 className="font-extrabold text-[14.5px] text-gray-950 flex items-center gap-2">
                          <span>Day {day.day_number}</span>
                          {day.date && (
                            <span className="font-normal text-xs text-gray-500">
                              • {displayDateVi(day.date)}
                            </span>
                          )}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium">
                          {day.stops.length} điểm ghé thăm
                        </span>
                      </div>
                    </div>

                    {/* Vùng thả nổi bật khi kéo thả */}
                    {isDraggingOver && (
                      <div className="p-3 text-center text-xs font-bold text-emerald-800 bg-emerald-100/60 border-b border-emerald-200">
                        👉 Thả địa điểm vào đây để thêm vào Day {day.day_number}!
                      </div>
                    )}

                    {/* Nội dung ngày (chỉ hiện khi chưa thu gọn) */}
                    {!isCollapsed && (
                      <div className="p-4 space-y-3">
                        {!hasStops ? (
                          /* Trạng thái rỗng: 1 nút hành động duy nhất, trực quan */
                          <div
                            onClick={() => setActiveDayAddModal(day.day_number)}
                            className="py-7 px-4 text-center rounded-2xl bg-gray-50/80 border border-dashed border-gray-300 hover:border-black transition cursor-pointer group"
                          >
                            <Compass size={22} className="mx-auto text-gray-400 group-hover:text-black mb-2 transition" />
                            <p className="text-xs font-semibold text-gray-700 mb-2.5">
                              Chưa có địa điểm nào trong Day {day.day_number}.
                            </p>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDayAddModal(day.day_number);
                              }}
                              className="px-4 py-2 rounded-full bg-black text-white text-xs font-bold hover:bg-neutral-800 transition cursor-pointer shadow-xs"
                            >
                              + Thêm điểm vào Day {day.day_number}
                            </button>
                            <p className="text-[11px] text-gray-400 mt-2">
                              hoặc kéo thẻ từ mục Ideas ở trên xuống đây
                            </p>
                          </div>
                        ) : (
                          day.stops.map((stop, sIdx) => {
                            const isRest = stop.stop_type === 'rest';
                            const matchedPoi = allPois.find((p) => p.id === stop.poi_id);
                            const isEditingTime = editingStopId === stop.stop_id;
                            const isEditingNote = editingNoteStopId === stop.stop_id;
                            const isMenuOpen = activeMenuStopId === stop.stop_id;

                            // Khoảng cách tới điểm kế tiếp
                            const nextStop = day.stops[sIdx + 1];
                            let transitDistKm: number | null = null;
                            if (nextStop && !isRest && nextStop.stop_type !== 'rest') {
                              transitDistKm = distanceKm(stop, nextStop);
                            }

                            return (
                              <React.Fragment key={stop.stop_id}>
                                {/* Thẻ Timeline Card */}
                                <div
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData('text/plain', stop.poi_id || stop.stop_id);
                                  }}
                                  onMouseEnter={() => setHoveredStopId(stop.poi_id || stop.stop_id)}
                                  onMouseLeave={() => setHoveredStopId(null)}
                                  className={`rounded-2xl p-3 border transition-all relative group cursor-grab active:cursor-grabbing ${
                                    isRest
                                      ? 'bg-amber-50/70 border-amber-200'
                                      : 'bg-white border-gray-200 hover:border-gray-400 shadow-2xs'
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    {/* Grip icon */}
                                    <div className="text-gray-300 group-hover:text-gray-500 pt-3 shrink-0 cursor-grab">
                                      <GripVertical size={14} />
                                    </div>

                                    {/* Thumbnail vuông chuẩn Mindtrip */}
                                    {isRest ? (
                                      <div className="w-14 h-14 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 shrink-0">
                                        <Coffee size={24} />
                                      </div>
                                    ) : (
                                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
                                        <img
                                          src={getPoiImage(matchedPoi)}
                                          alt={stop.title}
                                          className="w-full h-full object-cover pointer-events-none"
                                          loading="lazy"
                                        />
                                      </div>
                                    )}

                                    {/* Nội dung điểm */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 mb-1">
                                        <h4 className="font-extrabold text-[14.5px] text-gray-950 truncate">
                                          {stop.title}
                                        </h4>
                                      </div>

                                      {/* Giờ tham quan: Bấm trực tiếp để sửa */}
                                      {isEditingTime ? (
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
                                          className="flex items-center gap-1 text-xs text-gray-600 hover:text-black font-medium mt-0.5 cursor-pointer group/time"
                                          title="Bấm để sửa khung giờ"
                                        >
                                          <Clock size={12} className="text-gray-400 group-hover/time:text-black" />
                                          <span>
                                            {stop.start_time || '09:00'} – {stop.end_time || '10:30'}
                                          </span>
                                          <Pencil size={10} className="text-gray-300 group-hover/time:text-gray-600 ml-0.5 opacity-0 group-hover/time:opacity-100" />
                                        </button>
                                      )}

                                      {/* Ghi chú Note nếu có */}
                                      {stop.comment && !isEditingNote && (
                                        <div
                                          onClick={() => {
                                            setEditingNoteStopId(stop.stop_id);
                                            setNoteInput(stop.comment || '');
                                          }}
                                          className="mt-2 p-2 rounded-xl bg-amber-50/80 border border-amber-200/70 text-amber-950 text-xs flex items-start gap-1.5 cursor-pointer hover:bg-amber-100/80 transition"
                                          title="Bấm để chỉnh sửa ghi chú"
                                        >
                                          <FileText size={13} className="text-amber-700 shrink-0 mt-0.5" />
                                          <span className="leading-snug">{stop.comment}</span>
                                        </div>
                                      )}

                                      {/* Ô nhập ghi chú khi đang mở */}
                                      {isEditingNote && (
                                        <div className="mt-2 space-y-1.5">
                                          <textarea
                                            value={noteInput}
                                            onChange={(e) => setNoteInput(e.target.value)}
                                            placeholder="Nhập ghi chú cho điểm này (ví dụ: đặt bàn trước, mang áo khoác...)"
                                            rows={2}
                                            className="w-full text-xs p-2 rounded-xl border border-gray-300 focus:border-black focus:outline-none"
                                          />
                                          <div className="flex justify-end gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => setEditingNoteStopId(null)}
                                              className="text-[11px] px-2.5 py-1 rounded-lg text-gray-600 hover:bg-gray-100 cursor-pointer"
                                            >
                                              Hủy
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleSaveNote(day.day_number, stop.stop_id)}
                                              className="text-[11px] px-3 py-1 rounded-lg bg-black text-white font-bold cursor-pointer"
                                            >
                                              Lưu ghi chú
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Nút thao tác nhanh trên thẻ */}
                                    <div className="relative shrink-0 flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={sIdx === 0}
                                        onClick={() => handleMoveStop(day.day_number, sIdx, 'up')}
                                        className="w-7 h-7 rounded-lg border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-500 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                                        title="Lên trên"
                                      >
                                        <ArrowUp size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={sIdx === day.stops.length - 1}
                                        onClick={() => handleMoveStop(day.day_number, sIdx, 'down')}
                                        className="w-7 h-7 rounded-lg border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-500 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                                        title="Xuống dưới"
                                      >
                                        <ArrowDown size={13} />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMenuStopId(isMenuOpen ? null : stop.stop_id);
                                        }}
                                        className="w-7 h-7 rounded-lg border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-black cursor-pointer"
                                        title="Tùy chọn khác"
                                      >
                                        <MoreHorizontal size={14} />
                                      </button>

                                      {/* Dropdown Menu ... */}
                                      {isMenuOpen && (
                                        <div
                                          className="absolute right-0 top-8 w-48 bg-white rounded-2xl shadow-xl border border-gray-200 p-1.5 z-40 text-xs animate-fadeIn"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingNoteStopId(stop.stop_id);
                                              setNoteInput(stop.comment || '');
                                              setActiveMenuStopId(null);
                                            }}
                                            className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-gray-100 font-medium text-gray-800 flex items-center gap-2 cursor-pointer"
                                          >
                                            <FileText size={13} /> {stop.comment ? 'Sửa ghi chú' : 'Thêm ghi chú'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingStopId(stop.stop_id);
                                              setEditStartTime(stop.start_time || '09:00');
                                              setEditEndTime(stop.end_time || '10:30');
                                              setActiveMenuStopId(null);
                                            }}
                                            className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-gray-100 font-medium text-gray-800 flex items-center gap-2 cursor-pointer"
                                          >
                                            <Clock size={13} /> Chỉnh sửa thời gian
                                          </button>
                                          <div className="border-t border-gray-100 my-1"></div>
                                          <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase">
                                            Chuyển sang ngày khác:
                                          </div>
                                          {plan.days
                                            .filter((d) => d.day_number !== day.day_number)
                                            .map((otherDay) => (
                                              <button
                                                key={otherDay.day_number}
                                                type="button"
                                                onClick={() =>
                                                  handleMoveStopBetweenDays(
                                                    stop.stop_id,
                                                    day.day_number,
                                                    otherDay.day_number
                                                  )
                                                }
                                                className="w-full text-left px-3 py-1 rounded-xl hover:bg-emerald-50 text-gray-700 font-medium cursor-pointer"
                                              >
                                                Ngày {otherDay.day_number}
                                              </button>
                                            ))}
                                          <div className="border-t border-gray-100 my-1"></div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              handleRemovePoiFromDay(stop.poi_id || stop.stop_id);
                                              setActiveMenuStopId(null);
                                            }}
                                            className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-amber-50 text-amber-800 font-medium flex items-center gap-2 cursor-pointer"
                                          >
                                            <Lightbulb size={13} /> Đưa ngược về Ideas
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              handleDeleteStop(day.day_number, stop.stop_id);
                                              setActiveMenuStopId(null);
                                            }}
                                            className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-rose-50 text-rose-600 font-medium flex items-center gap-2 cursor-pointer"
                                          >
                                            <Trash2 size={13} /> Xóa bỏ điểm này
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Đường nối khoảng cách giữa 2 điểm (Distances Connector) */}
                                {showDistances && transitDistKm !== null && (
                                  <div className="ml-7 pl-4 py-2 border-l-2 border-dashed border-gray-300 flex items-center gap-2 text-[11.5px] text-gray-600 font-semibold animate-fadeIn">
                                    <Car size={13} className="text-gray-400 shrink-0" />
                                    <span>
                                      {distanceUnit === 'km'
                                        ? transitDistKm < 1
                                          ? `${Math.round(transitDistKm * 1000)}m`
                                          : `${transitDistKm.toFixed(1)} km`
                                        : `${(transitDistKm * 0.621371).toFixed(2)} mi`}
                                    </span>
                                    <span className="text-gray-400">•</span>
                                    <span className="text-gray-500 font-normal">
                                      ~{Math.max(5, Math.round(transitDistKm * 3.5))} phút xe điện
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10.5px] font-bold">
                                      Giảm ~0.2kg CO2
                                    </span>
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })
                        )}

                        {/* Nút hành động ở chân ngày khi đã có điểm */}
                        {hasStops && (
                          <div className="pt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveDayAddModal(
                                  activeDayAddModal === day.day_number ? null : day.day_number
                                )
                              }
                              className="px-4 py-1.5 rounded-full bg-gray-100 hover:bg-black hover:text-white text-xs font-bold text-gray-900 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            >
                              <Plus size={13} />
                              <span>Thêm điểm vào Day {day.day_number}</span>
                            </button>

                            {!hasLunchBreak && (
                              <button
                                type="button"
                                onClick={() => handleAddLunchBreak(day.day_number)}
                                className="px-3.5 py-1.5 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                              >
                                <Coffee size={13} className="text-amber-700" />
                                <span>+ Nghỉ trưa (12:00 – 13:30)</span>
                              </button>
                            )}
                          </div>
                        )}

                        {/* Bảng chọn khi bấm Thêm điểm vào ngày */}
                        {activeDayAddModal === day.day_number && (
                          <div className="mt-3 p-3.5 rounded-2xl bg-gray-50 border border-gray-200 space-y-3 animate-fadeIn">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-extrabold text-gray-900">
                                Thêm điểm vào Day {day.day_number}:
                              </h4>
                              <button
                                type="button"
                                onClick={() => setActiveDayAddModal(null)}
                                className="text-gray-400 hover:text-black font-bold cursor-pointer text-xs"
                              >
                                ✕
                              </button>
                            </div>

                            {/* Ô tìm kiếm nhanh */}
                            <div className="relative">
                              <Search size={13} className="absolute left-2.5 top-2 text-gray-400" />
                              <input
                                type="text"
                                placeholder="Tìm địa điểm mới hoặc chọn từ Ideas bên dưới..."
                                value={dayAddModalSearch}
                                onChange={(e) => setDayAddModalSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-gray-300 text-xs focus:border-black focus:outline-none bg-white"
                              />
                            </div>

                            {/* Danh sách ưu tiên các địa điểm từ Ideas */}
                            {!dayAddModalSearch.trim() ? (
                              <div className="space-y-1">
                                <div className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wider">
                                  Từ kho Ideas ({unplacedIdeasForDay.length}):
                                </div>
                                {unplacedIdeasForDay.length === 0 ? (
                                  <p className="text-xs text-gray-500 py-1">
                                    Tất cả địa điểm trong Ideas đã được đưa vào ngày này.
                                  </p>
                                ) : (
                                  <div className="max-h-40 overflow-y-auto space-y-1 no-scrollbar">
                                    {unplacedIdeasForDay.map((poi) => (
                                      <button
                                        key={poi.id}
                                        type="button"
                                        onClick={() => handleAddIdeaToDay(day.day_number, poi)}
                                        className="w-full text-left px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-black text-xs font-semibold text-gray-900 flex items-center justify-between cursor-pointer"
                                      >
                                        <span className="truncate">{poi.name}</span>
                                        <span className="text-[10px] text-gray-500 ml-2">
                                          + Thêm ngay
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              /* Kết quả tìm kiếm trực tiếp từ allPois */
                              <div className="space-y-1 max-h-44 overflow-y-auto no-scrollbar">
                                {allPois
                                  .filter((p) =>
                                    p.name.toLowerCase().includes(dayAddModalSearch.toLowerCase())
                                  )
                                  .slice(0, 5)
                                  .map((p) => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => {
                                        if (!tripIdeas.includes(p.id)) {
                                          handleToggleIdeaInTrip(p.id);
                                        }
                                        handleAddIdeaToDay(day.day_number, p);
                                      }}
                                      className="w-full text-left px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-black text-xs font-semibold text-gray-900 flex items-center justify-between cursor-pointer"
                                    >
                                      <span className="truncate">{p.name}</span>
                                      <span className="text-[10px] text-emerald-800 font-bold ml-2">
                                        + Thêm vào lịch
                                      </span>
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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

            {/* Widget cao độ & Hành trình xanh nổi trên bản đồ - KHÔNG BỊ TRÙNG LẶP */}
            <div className="absolute bottom-6 left-5 right-5 z-[500] pointer-events-none max-w-lg mx-auto">
              <div className="pointer-events-auto shadow-2xl rounded-2xl overflow-hidden border border-emerald-500/30">
                <ThreeElevationWave
                  className="w-full"
                  co2SavedKg={0.8}
                />
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
                Thêm địa điểm vào Ideas
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
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Mục Gợi ý thông minh (Suggested Places khi chưa gõ tìm kiếm) */}
              {!modalSearch.trim() && suggestedPois.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-extrabold text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles size={13} className="text-amber-500" />
                    <span>Gợi ý tiêu biểu tại {trip.destination}</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {suggestedPois.map((poi) => (
                      <div
                        key={poi.id}
                        className="rounded-2xl border border-gray-200 p-3 flex gap-3 hover:border-black transition bg-white shadow-2xs"
                      >
                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                          <img
                            src={getPoiImage(poi)}
                            alt={poi.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <h5 className="font-bold text-[13px] text-gray-950 truncate">
                            {poi.name}
                          </h5>
                          <button
                            type="button"
                            onClick={() => handleToggleIdeaInTrip(poi.id)}
                            className="mt-1 py-1 px-2.5 rounded-lg text-xs font-bold bg-black text-white hover:bg-neutral-800 transition flex items-center justify-center gap-1 w-fit cursor-pointer"
                          >
                            <Plus size={11} /> Thêm vào Ideas
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lưới địa điểm chính */}
              <div>
                <h4 className="font-extrabold text-xs text-gray-400 uppercase tracking-wider mb-2">
                  Tất cả địa điểm:
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {modalFilteredPois.slice(0, 24).map((poi) => {
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
                                <Check size={12} /> Đã có trong Ideas
                              </>
                            ) : (
                              <>
                                <Plus size={12} /> Thêm vào Ideas
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mục tự tạo địa điểm */}
              <div className="pt-5 border-t border-gray-100">
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

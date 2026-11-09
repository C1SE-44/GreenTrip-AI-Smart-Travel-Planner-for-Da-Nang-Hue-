import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Clock,
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
  Lightbulb,
  ExternalLink,
  SlidersHorizontal,
  Star,
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
import {
  createEmptyItinerary,
  getTripItinerary,
  saveTripItinerary,
  stopFromPoi,
  alignItineraryToTrip,
  normalizeLegacyLunchBreaks,
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
// Danh mục cho Modal Thêm địa điểm (chuẩn Mindtrip Screenshot 3)
// ─────────────────────────────────────────────────────────────
const MODAL_CATEGORY_PILLS: { id: string; label: string }[] = [
  { id: 'all', label: 'Gợi ý cho bạn' },
  { id: 'experience', label: 'Trải nghiệm' },
  { id: 'restaurant', label: 'Quán ăn & Cafe' },
  { id: 'stay', label: 'Lưu trú' },
  { id: 'attraction', label: 'Điểm tham quan' },
];

function formatCategoryLabel(cat?: string | null): string {
  if (!cat) return 'Điểm đến';
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
    return <Utensils size={12} className="text-amber-300 shrink-0" />;
  }
  if (c.includes('di tích') || c.includes('lăng') || c.includes('đại nội') || c.includes('attraction')) {
    return <Landmark size={12} className="text-emerald-300 shrink-0" />;
  }
  if (c.includes('rest') || c.includes('nghỉ')) {
    return <Coffee size={12} className="text-amber-300 shrink-0" />;
  }
  return <Compass size={12} className="text-emerald-300 shrink-0" />;
}

// Thời lượng gợi ý mặc định: Lấy từ dữ liệu địa điểm, thiếu thì 1 giờ (60 phút)
function getPoiVisitDurationMinutes(poi?: Poi | null): number {
  if (!poi) return 60;
  if (poi.average_visit_minutes && poi.average_visit_minutes > 0) return poi.average_visit_minutes;
  const durText = poi.visitDuration || '';
  const match = durText.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const num = parseFloat(match[1]);
    if (durText.includes('giờ') || durText.includes('hour') || durText.includes('h')) {
      return Math.round(num * 60);
    }
    if (durText.includes('phút') || durText.includes('min')) {
      return Math.round(num);
    }
  }
  return 60;
}

// Link chỉ đường Google Maps thực tế
function getGoogleMapsDirectionsUrl(
  originLat?: number | null,
  originLng?: number | null,
  destLat?: number | null,
  destLng?: number | null
): string {
  if (originLat != null && originLng != null && destLat != null && destLng != null) {
    return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}&travelmode=driving`;
  }
  return 'https://www.google.com/maps';
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
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());
  const [showDistances, setShowDistances] = useState(true);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);

  // Bộ lọc xem ngày nổi trên Bản đồ (Floating Day Selector on Map)
  const [mapDayFilter, setMapDayFilter] = useState<number | 'all'>('all');

  // Thao tác nhanh cho từng thẻ Ideas & Ngày
  const ideasCarouselRef = useRef<HTMLDivElement>(null);
  const [activeIdeaMenuPoiId, setActiveIdeaMenuPoiId] = useState<string | null>(null);
  const [activeIdeaAddDayPoiId, setActiveIdeaAddDayPoiId] = useState<string | null>(null);
  const [activeMenuStopId, setActiveMenuStopId] = useState<string | null>(null);
  const [showItinerarySettingsMenu, setShowItinerarySettingsMenu] = useState(false);
  const [activeDayAddModal, setActiveDayAddModal] = useState<number | null>(null);

  // Chỉnh sửa giờ & Ghi chú (Notes / Comments)
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editStartTime, setEditStartTime] = useState('08:00');
  const [editEndTime, setEditEndTime] = useState('09:30');
  const [editingNoteStopId, setEditingNoteStopId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');

  // Modal Thêm địa điểm vào Ý tưởng / Ngày (Chuẩn Screenshot 3)
  const [showAddIdeasModal, setShowAddIdeasModal] = useState(false);
  const [modalMainTab, setModalMainTab] = useState<'search' | 'saved' | 'custom'>('search');
  const [modalSearch, setModalSearch] = useState('');
  const [modalCity, setModalCity] = useState<'all' | 'Đà Nẵng' | 'Huế'>(
    /hue|huế/i.test(trip.destination) ? 'Huế' : 'Đà Nẵng'
  );
  const [modalCategory, setModalCategory] = useState<string>('all');
  const [customIdeaInput, setCustomIdeaInput] = useState('');

  // Tiêu đề chuyến đi rõ ràng, tránh hiển thị chữ 'a' đơn lẻ
  const displayTitle = useMemo(() => {
    if (trip.title && trip.title.trim().length > 2 && trip.title.trim().toLowerCase() !== 'a') {
      return trip.title;
    }
    return `Chuyến đi ${trip.destination}`;
  }, [trip.title, trip.destination]);

  // Phụ đề gọn, không lặp lại 3 lần chữ ngày
  const displaySubtitle = useMemo(() => {
    const dates = trip.startDate || 'Tháng 11/2026';
    return `${trip.destination} • ${dates} (${plan.days.length} ngày)`;
  }, [trip.destination, trip.startDate, plan.days.length]);

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

  // Cuộn dải thẻ ý tưởng
  const handleScrollIdeas = (dir: 'left' | 'right') => {
    if (!ideasCarouselRef.current) return;
    const delta = dir === 'left' ? -260 : 260;
    ideasCarouselRef.current.scrollBy({ left: delta, behavior: 'smooth' });
  };

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

  // Lọc thẻ ý tưởng theo dropdown Tất cả ⌄
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

  // ─── 5. Thao tác THỦ CÔNG (Manual Planning First) ───

  // Thêm ý tưởng vào ngày cụ thể: Thời lượng lấy từ dữ liệu địa điểm, giờ bắt đầu nối tiếp
  const handleAddIdeaToDay = (dayNumber: number, poi: Poi, targetIndex?: number) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;

      const stops = [...day.stops];
      const newStop = stopFromPoi(poi, 'manual');

      // Thời lượng gợi ý thực tế từ dữ liệu
      const dur = getPoiVisitDurationMinutes(poi);
      newStop.duration_minutes = dur;

      // Giờ bắt đầu: Điểm đầu lúc 08:00; các điểm sau nối tiếp giờ kết thúc + 15p di chuyển
      let startMinutes = 8 * 60; // 08:00 sáng mặc định
      const prevStop = stops.length > 0 ? stops[stops.length - 1] : null;

      if (prevStop && prevStop.end_time) {
        const [h, m] = prevStop.end_time.split(':').map(Number);
        startMinutes = (h || 8) * 60 + (m || 0) + 15;
      }

      const startH = Math.min(22, Math.floor(startMinutes / 60));
      const startM = startMinutes % 60;
      const endTotalM = startMinutes + dur;
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

    // Đảm bảo poi cũng có mặt trong kho Ideas
    if (!tripIdeas.includes(poi.id)) {
      handleToggleIdeaInTrip(poi.id);
    }

    const nextPlan = { ...plan, days: nextDays };
    persistPlan(nextPlan);
    setActiveIdeaMenuPoiId(null);
    setActiveIdeaAddDayPoiId(null);
  };

  // Di chuyển điểm dừng giữa các ngày hoặc trong cùng ngày
  const handleMoveStopBetweenDays = (
    stopId: string,
    fromDayNumber: number,
    toDayNumber: number
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
      const stops = [...day.stops, movingStop!];
      return { ...day, stops: stops.map((s, idx) => ({ ...s, sequence: idx })) };
    });

    persistPlan({ ...plan, days: nextDays });
    setActiveMenuStopId(null);
  };

  // Bỏ địa điểm khỏi ngày (vẫn giữ trong kho Ideas)
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
      const targetIndex = direction === 'up' ? stopIndex - 1 : stopIndex + 1;
      if (targetIndex < 0 || targetIndex >= day.stops.length) return day;

      const stops = [...day.stops];
      const temp = stops[stopIndex];
      stops[stopIndex] = stops[targetIndex];
      stops[targetIndex] = temp;

      return { ...day, stops: stops.map((s, idx) => ({ ...s, sequence: idx })) };
    });

    persistPlan({ ...plan, days: nextDays });
  };

  // Xóa hẳn điểm dừng khỏi ngày
  const handleDeleteStop = (dayNumber: number, stopId: string) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      return {
        ...day,
        stops: day.stops.filter((s) => s.stop_id !== stopId).map((s, idx) => ({ ...s, sequence: idx })),
      };
    });
    persistPlan({ ...plan, days: nextDays });
    setActiveMenuStopId(null);
  };

  // Lưu chỉnh sửa giờ tham quan
  const handleSaveEditTime = (dayNumber: number, stopId: string) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const stops = day.stops.map((s) => {
        if (s.stop_id !== stopId) return s;
        const dur = Math.max(15, minutesFromTime(editEndTime) - minutesFromTime(editStartTime));
        return {
          ...s,
          start_time: editStartTime,
          end_time: editEndTime,
          duration_minutes: dur,
        };
      });
      return { ...day, stops };
    });
    persistPlan({ ...plan, days: nextDays });
    setEditingStopId(null);
  };

  // Lưu ghi chú cho điểm dừng (Add a comment)
  const handleSaveNote = (dayNumber: number, stopId: string) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const stops = day.stops.map((s) => {
        if (s.stop_id !== stopId) return s;
        return { ...s, comment: noteInput.trim() || null };
      });
      return { ...day, stops };
    });
    persistPlan({ ...plan, days: nextDays });
    setEditingNoteStopId(null);
  };

  // Thêm khoảng nghỉ trưa (12:00 - 13:30)
  const handleAddLunchBreak = (dayNumber: number) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const restStop: ItineraryStop = {
        stop_id: `rest-${dayNumber}-${Date.now()}`,
        poi_id: `rest-${dayNumber}`,
        title: 'Nghỉ trưa & Thưởng thức ẩm thực',
        city: null,
        address: null,
        category: 'Quán ăn',
        stop_type: 'rest',
        source: 'manual',
        start_time: '12:00',
        end_time: '13:30',
        duration_minutes: 90,
        sequence: day.stops.length,
        latitude: null,
        longitude: null,
        comment: 'Khoảng thời gian nghỉ ngơi thư giãn và thưởng thức ẩm thực địa phương.',
      };
      const stops = [...day.stops, restStop].sort((a, b) => {
        const timeA = minutesFromTime(a.start_time || '00:00');
        const timeB = minutesFromTime(b.start_time || '00:00');
        return timeA - timeB;
      });
      return { ...day, stops: stops.map((s, idx) => ({ ...s, sequence: idx })) };
    });
    persistPlan({ ...plan, days: nextDays });
  };

  // Thu gọn / mở rộng ngày
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
        title: `Ngày ${nextNumber}`,
        stops: [],
      },
    ];
    persistPlan({ ...plan, days_count: nextDays.length, days: nextDays });
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

  // ─── 6. Lọc POI hiển thị trên Bản đồ tương tác theo Bộ lọc ngày nổi ───
  const mapPois = useMemo(() => {
    const displayedDays =
      mapDayFilter === 'all'
        ? plan.days
        : plan.days.filter((d) => d.day_number === mapDayFilter);

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
  }, [plan.days, mapDayFilter, allPois]);

  // Bộ lọc POI trong Modal "Thêm vào chuyến đi" (Screenshot 3)
  const modalFilteredPois = useMemo(() => {
    return allPois.filter((p) => {
      if (modalCity !== 'all' && normalizeCity(p.city) !== modalCity) return false;
      if (modalCategory !== 'all') {
        const cat = (p.category || '').toLowerCase();
        if (modalCategory === 'experience' && !cat.includes('di tích') && !cat.includes('attraction') && !cat.includes('chùa') && !cat.includes('thắng cảnh')) return false;
        if (modalCategory === 'restaurant' && !cat.includes('ăn') && !cat.includes('ẩm thực') && !cat.includes('food') && !cat.includes('quán') && !cat.includes('cafe')) return false;
        if (modalCategory === 'stay' && !cat.includes('khách sạn') && !cat.includes('hotel') && !cat.includes('resort')) return false;
        if (modalCategory === 'attraction' && !cat.includes('cầu') && !cat.includes('biển') && !cat.includes('chợ') && !cat.includes('cảnh quan')) return false;
      }
      if (modalSearch.trim()) {
        const q = modalSearch.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.address || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [allPois, modalCity, modalCategory, modalSearch]);

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
            <p className="text-xs text-gray-500 mt-0.5 font-medium truncate">
              {displaySubtitle}
            </p>
          </div>
        </div>

        {/* Nút hành động phải: Trạng thái lưu & Nút Xong */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-500 hidden sm:flex items-center gap-1 font-medium">
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
            title="Lưu lịch trình và quay lại tổng quan"
          >
            Xong
          </button>
        </div>
      </header>

      {/* ─── NỘI DUNG CHÍNH (2 CỘT CHUẨN MINDTRIP) ─── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
        {/* ════════════════════════════════════════════════════════
            CỘT TRÁI: Ý TƯỞNG + LỊCH THEO NGÀY (THỦ CÔNG CHUẨN)
        ════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-6 xl:col-span-6 border-r border-gray-100 flex flex-col h-full bg-white overflow-y-auto px-5 sm:px-6 py-4 [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-track]:bg-transparent">
          {/* ────────────────────────────────────────────────────────
              1. PHẦN Ý TƯỞNG (IDEAS - KHO CHỜ CHUẨN MINDTRIP SCREENSHOT 1, 2)
          ──────────────────────────────────────────────────────── */}
          <section className="shrink-0 mb-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setExpandIdeas(!expandIdeas)}
                  className="flex items-center gap-2 group cursor-pointer text-left"
                >
                  {expandIdeas ? (
                    <ChevronDown size={17} className="text-gray-600 group-hover:text-black transition" />
                  ) : (
                    <ChevronRight size={17} className="text-gray-600 group-hover:text-black transition" />
                  )}
                  <h2 className="font-extrabold text-[15.5px] text-gray-950 flex items-center gap-2">
                    <span>Ý tưởng</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {ideaPois.length} địa điểm
                    </span>
                  </h2>
                </button>

                {/* Bộ lọc Tất cả ⌄ */}
                <div className="relative">
                  <select
                    value={ideasFilter}
                    onChange={(e) => setIdeasFilter(e.target.value as any)}
                    className="text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 border-none rounded-full px-2.5 py-1 appearance-none pr-6 cursor-pointer focus:outline-none"
                  >
                    <option value="all">Tất cả</option>
                    <option value="unplaced">Chưa xếp lịch</option>
                    <option value="food">Ẩm thực</option>
                    <option value="attraction">Điểm tham quan</option>
                  </select>
                  <ChevronDown size={11} className="absolute right-2 top-2 pointer-events-none text-gray-500" />
                </div>
              </div>

              {/* Menu thêm địa điểm */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveDayAddModal(null);
                    setShowAddIdeasModal(true);
                  }}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-black transition cursor-pointer"
                  title="Thêm địa điểm vào Ý tưởng"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {expandIdeas && (
              <div className="space-y-2">
                {filteredIdeaPois.length === 0 ? (
                  <div className="h-[72px] px-4 rounded-[20px] border border-dashed border-gray-300 text-center bg-gray-50/50 flex items-center justify-between">
                    <p className="text-xs text-gray-600">
                      {ideaPois.length === 0
                        ? 'Chưa có địa điểm nào trong Ý tưởng.'
                        : 'Không có địa điểm phù hợp với bộ lọc.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDayAddModal(null);
                        setShowAddIdeasModal(true);
                      }}
                      className="px-3 py-1.5 rounded-full bg-black text-white text-xs font-bold hover:bg-neutral-800 transition cursor-pointer"
                    >
                      + Khám phá thêm
                    </button>
                  </div>
                ) : (
                  /* Dải thẻ ý tưởng cuộn ngang chuẩn Mindtrip (Screenshot 1, 2) */
                  <div className="relative group/carousel">
                    <div
                      ref={ideasCarouselRef}
                      className="flex gap-3.5 overflow-x-auto pb-2 pt-1 no-scrollbar -mx-1 px-1 scroll-smooth"
                    >
                      {filteredIdeaPois.map((poi) => {
                        const isMenuOpen = activeIdeaMenuPoiId === poi.id;

                        return (
                          <div
                            key={poi.id}
                            className="w-[180px] h-[200px] shrink-0 rounded-2xl relative overflow-hidden group select-none shadow-sm hover:shadow-md transition-all border border-gray-100"
                          >
                            {/* Ảnh toàn thẻ */}
                            <img
                              src={getPoiImage(poi)}
                              alt={poi.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                              loading="lazy"
                            />

                            {/* Nút yêu thích & Menu ... góc trên phải (Chuẩn Screenshot 1) */}
                            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-20">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleIdeaInTrip(poi.id);
                                }}
                                className="w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-xs flex items-center justify-center text-white transition shadow-xs cursor-pointer"
                                title="Yêu thích / Bỏ khỏi Ý tưởng"
                              >
                                <Heart size={14} className="fill-rose-500 text-rose-500" />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveIdeaMenuPoiId(isMenuOpen ? null : poi.id);
                                }}
                                className="w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-xs flex items-center justify-center text-white transition shadow-xs cursor-pointer"
                                title="Tùy chọn địa điểm"
                              >
                                <MoreHorizontal size={14} />
                              </button>
                            </div>

                            {/* Menu popover khi bấm ... (Chuẩn Screenshot 2) */}
                            {isMenuOpen && (
                              <div
                                className="absolute right-2 top-10 w-52 bg-white rounded-2xl shadow-2xl border border-gray-100 p-1.5 z-50 text-xs animate-fadeIn text-gray-800"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedMapPoiId(poi.id);
                                    setActiveIdeaMenuPoiId(null);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-medium flex items-center gap-2 cursor-pointer"
                                >
                                  <ExternalLink size={13} />
                                  <span className="truncate">Xem {poi.name}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveIdeaAddDayPoiId(activeIdeaAddDayPoiId === poi.id ? null : poi.id);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-medium flex items-center justify-between cursor-pointer"
                                >
                                  <span className="flex items-center gap-2">
                                    <Clock size={13} /> Thêm vào lịch trình
                                  </span>
                                  <ChevronRight
                                    size={13}
                                    className={activeIdeaAddDayPoiId === poi.id ? 'rotate-90 transition-transform' : 'transition-transform'}
                                  />
                                </button>
                                {activeIdeaAddDayPoiId === poi.id && (
                                  <div className="pl-3 pr-1 py-1 space-y-1 bg-gray-50 rounded-xl my-1">
                                    {plan.days.map((d) => (
                                      <button
                                        key={d.day_number}
                                        type="button"
                                        onClick={() => handleAddIdeaToDay(d.day_number, poi)}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-black hover:text-white text-xs font-semibold flex items-center justify-between cursor-pointer"
                                      >
                                        <span>Ngày {d.day_number}</span>
                                        <span className="text-[10px] opacity-70">{d.stops.length} điểm</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <div className="border-t border-gray-100 my-1"></div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleToggleIdeaInTrip(poi.id);
                                    setActiveIdeaMenuPoiId(null);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 font-medium flex items-center gap-2 cursor-pointer"
                                >
                                  <Trash2 size={13} /> Xóa khỏi Ý tưởng
                                </button>
                              </div>
                            )}

                            {/* Lớp gradient tối dần với Tên và Phân loại đè lên ảnh (Chuẩn Screenshot 1) */}
                            <div className="absolute inset-x-0 bottom-0 pt-12 pb-2.5 px-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex flex-col justify-end pointer-events-none">
                              <h3
                                className="text-white font-bold text-[13.5px] leading-tight truncate drop-shadow-sm"
                                title={poi.name}
                              >
                                {poi.name}
                              </h3>
                              <p className="text-white/80 text-[11px] font-medium flex items-center gap-1 mt-0.5 truncate drop-shadow-xs">
                                {getCategoryIcon(poi.category)}
                                <span>{formatCategoryLabel(poi.category)}</span>
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Nút mũi tên sang phải (Chuẩn Screenshot 2) */}
                    <button
                      type="button"
                      onClick={() => handleScrollIdeas('right')}
                      className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-gray-700 hover:text-black transition z-10 cursor-pointer opacity-90 hover:opacity-100 hover:scale-105"
                      title="Xem tiếp các ý tưởng"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}

                {/* Nút + Thêm (Chuẩn Screenshot 1) */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDayAddModal(null);
                      setShowAddIdeasModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-800 transition cursor-pointer shadow-2xs"
                  >
                    <Plus size={13} />
                    <span>Thêm</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ────────────────────────────────────────────────────────
              2. PHẦN LỊCH TRÌNH THEO NGÀY (ITINERARY TIMELINE)
          ──────────────────────────────────────────────────────── */}
          <section className="flex-1 flex flex-col min-h-0 mt-5">
            {/* Header Lịch trình */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h2 className="font-extrabold text-[17px] text-gray-950 flex items-center gap-2">
                  <span>Lịch trình</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {plan.days.length} ngày
                  </span>
                </h2>

                {/* Nút gạt Khoảng cách (Distances Toggle) */}
                <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-200">
                  <span className="text-xs font-semibold text-gray-600">Khoảng cách</span>
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

              {/* Menu ba chấm ... cạnh tiêu đề Lịch trình */}
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
                    className="absolute right-0 top-9 w-44 bg-white rounded-2xl shadow-xl border border-gray-200 p-1.5 z-40 text-xs animate-fadeIn"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={handleAddDay}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-semibold text-gray-900 flex items-center gap-2 cursor-pointer"
                    >
                      <Plus size={14} /> Thêm ngày mới
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Danh sách các ngày theo chiều dọc (Chuẩn Screenshot 1, 4 - KHÔNG CÓ TAB NGÀY LẶP LẠI) */}
            <div className="space-y-4 pb-10">
              {plan.days.map((day) => {
                const hasStops = day.stops.length > 0;
                const isCollapsed = collapsedDays.has(day.day_number);
                const hasLunchBreak = day.stops.some((s) => s.stop_type === 'rest');

                return (
                  <div key={day.day_id} className="border-b border-gray-100 pb-3">
                    {/* Header Ngày: > Day 1 Sat, Nov 14 (Chuẩn Screenshot 1, 4) */}
                    <div
                      onClick={() => toggleDayCollapse(day.day_number)}
                      className="flex items-center justify-between py-2 cursor-pointer group select-none"
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-gray-500 group-hover:text-black transition cursor-pointer"
                          title={isCollapsed ? 'Mở rộng ngày' : 'Thu gọn ngày'}
                        >
                          {isCollapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
                        </button>
                        <h3 className="font-extrabold text-[15px] text-gray-950 flex items-center gap-2">
                          <span>Ngày {day.day_number}</span>
                          {day.date && (
                            <span className="font-normal text-xs text-gray-500">
                              {displayDateVi(day.date)}
                            </span>
                          )}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 font-medium">
                          {day.stops.length > 0 ? `${day.stops.length} điểm` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDayAddModal(day.day_number);
                            setShowAddIdeasModal(true);
                          }}
                          className="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-black transition"
                          title="Thêm điểm vào ngày này"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Nội dung ngày khi mở rộng */}
                    {!isCollapsed && (
                      <div className="mt-1 space-y-3 pl-2">
                        {!hasStops ? (
                          /* Trạng thái chưa có điểm: Đúng 1 nút + Thêm (Chuẩn Screenshot 1, 4) */
                          <div className="py-1 pl-4">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveDayAddModal(day.day_number);
                                setShowAddIdeasModal(true);
                              }}
                              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-800 transition cursor-pointer shadow-2xs"
                            >
                              <Plus size={13} />
                              <span>Thêm</span>
                            </button>
                          </div>
                        ) : (
                          <>
                            {day.stops.map((stop, sIdx) => {
                              const isRest = stop.stop_type === 'rest';
                              const matchedPoi = allPois.find((p) => p.id === stop.poi_id);
                              const isEditingTime = editingStopId === stop.stop_id;
                              const isEditingNote = editingNoteStopId === stop.stop_id;
                              const isMenuOpen = activeMenuStopId === stop.stop_id;

                              const nextStop = day.stops[sIdx + 1];
                              let transitDistKm: number | null = null;
                              if (nextStop && !isRest && nextStop.stop_type !== 'rest') {
                                transitDistKm = distanceKm(stop, nextStop);
                              }

                              return (
                                <React.Fragment key={stop.stop_id}>
                                  {/* Thẻ lịch trình trong ngày: Bo góc 22px, viền 1px #e6e6e6, padding 12px */}
                                  <div
                                    onMouseEnter={() => setHoveredStopId(stop.poi_id || stop.stop_id)}
                                    onMouseLeave={() => setHoveredStopId(null)}
                                    className={`min-h-[110px] rounded-[22px] border border-[#e6e6e6] p-3 flex items-start gap-3.5 transition-all relative group ${
                                      isRest ? 'bg-amber-50/70 border-amber-200' : 'bg-white hover:border-gray-400 shadow-2xs'
                                    }`}
                                  >
                                    {/* Ảnh nhỏ trong thẻ: 84 x 84px */}
                                    {isRest ? (
                                      <div className="w-[84px] h-[84px] rounded-[14px] bg-amber-100 flex items-center justify-center text-amber-800 shrink-0">
                                        <Coffee size={28} />
                                      </div>
                                    ) : (
                                      <div className="w-[84px] h-[84px] rounded-[14px] overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
                                        <img
                                          src={getPoiImage(matchedPoi)}
                                          alt={stop.title}
                                          className="w-full h-full object-cover pointer-events-none"
                                          loading="lazy"
                                        />
                                      </div>
                                    )}

                                    {/* Nội dung điểm dừng */}
                                    <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                                      <div>
                                        <div className="flex items-center gap-1.5 mb-1">
                                          <h4 className="font-extrabold text-[14.5px] text-gray-950 truncate">
                                            {stop.title}
                                          </h4>
                                        </div>

                                        {/* Giờ tham quan */}
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
                                              onClick={() => handleSaveEditTime(day.day_number, stop.stop_id)}
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
                                              setEditStartTime(stop.start_time || '08:00');
                                              setEditEndTime(stop.end_time || '09:30');
                                            }}
                                            className="flex items-center gap-1 text-xs text-gray-600 hover:text-black font-medium mt-0.5 cursor-pointer group/time"
                                            title="Bấm để sửa khung giờ"
                                          >
                                            <Clock size={12} className="text-gray-400 group-hover/time:text-black" />
                                            <span>
                                              {stop.start_time || '08:00'} – {stop.end_time || '09:30'}
                                            </span>
                                            <Pencil size={10} className="text-gray-300 group-hover/time:text-gray-600 ml-0.5 opacity-0 group-hover/time:opacity-100" />
                                          </button>
                                        )}

                                        <p className="text-[11px] text-gray-500 mt-1 truncate">
                                          {stop.address || stop.city || trip.destination}
                                        </p>
                                      </div>

                                      {/* Ghi chú Note */}
                                      {stop.comment && !isEditingNote && (
                                        <div
                                          onClick={() => {
                                            setEditingNoteStopId(stop.stop_id);
                                            setNoteInput(stop.comment || '');
                                          }}
                                          className="mt-1.5 p-2 rounded-xl bg-amber-50/80 border border-amber-200/70 text-amber-950 text-xs flex items-start gap-1.5 cursor-pointer hover:bg-amber-100/80 transition"
                                          title="Bấm để sửa bình luận"
                                        >
                                          <FileText size={13} className="text-amber-700 shrink-0 mt-0.5" />
                                          <span className="leading-snug">{stop.comment}</span>
                                        </div>
                                      )}

                                      {isEditingNote && (
                                        <div className="mt-2 space-y-1.5">
                                          <textarea
                                            value={noteInput}
                                            onChange={(e) => setNoteInput(e.target.value)}
                                            placeholder="Nhập ghi chú cho điểm này..."
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

                                    {/* Menu thao tác góc phải */}
                                    <div className="relative shrink-0 flex items-center gap-1 self-start">
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
                                            <FileText size={13} /> {stop.comment ? 'Sửa bình luận' : 'Thêm bình luận'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingStopId(stop.stop_id);
                                              setEditStartTime(stop.start_time || '08:00');
                                              setEditEndTime(stop.end_time || '09:30');
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
                                            <Lightbulb size={13} /> Chuyển về Ý tưởng
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              handleDeleteStop(day.day_number, stop.stop_id);
                                              setActiveMenuStopId(null);
                                            }}
                                            className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-rose-50 text-rose-600 font-medium flex items-center gap-2 cursor-pointer"
                                          >
                                            <Trash2 size={13} /> Xóa khỏi ngày
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Dòng khoảng cách giữa 2 thẻ: 44px, thụt lề 28px, vạch dọc 2px */}
                                  {showDistances && transitDistKm !== null && (
                                    <div className="h-[44px] ml-7 pl-6 border-l-2 border-[#ddd] flex items-center gap-3 text-xs text-gray-600 font-semibold animate-fadeIn">
                                      <Car size={13} className="text-gray-400 shrink-0" />
                                      <span>~{transitDistKm.toFixed(1)} km</span>
                                      <a
                                        href={getGoogleMapsDirectionsUrl(
                                          stop.latitude,
                                          stop.longitude,
                                          nextStop.latitude,
                                          nextStop.longitude
                                        )}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-emerald-700 hover:text-emerald-900 hover:underline flex items-center gap-1 font-bold ml-1"
                                        title="Mở chỉ đường trên Google Maps"
                                      >
                                        <span>Chỉ đường</span>
                                        <ExternalLink size={11} />
                                      </a>
                                    </div>
                                  )}
                                </React.Fragment>
                              );
                            })}

                            {/* Nút hành động ở cuối ngày khi đã có điểm */}
                            <div className="pt-2 pl-4 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDayAddModal(day.day_number);
                                  setShowAddIdeasModal(true);
                                }}
                                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-800 transition cursor-pointer shadow-2xs"
                              >
                                <Plus size={13} />
                                <span>Thêm</span>
                              </button>

                              {!hasLunchBreak && (
                                <button
                                  type="button"
                                  onClick={() => handleAddLunchBreak(day.day_number)}
                                  className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full border border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-900 transition cursor-pointer shadow-2xs"
                                >
                                  <Coffee size={13} className="text-amber-700" />
                                  <span>+ Nghỉ trưa (12:00 – 13:30)</span>
                                </button>
                              )}
                            </div>
                          </>
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
            CỘT PHẢI: BẢN ĐỒ LỘ TRÌNH ĐỒNG BỘ (BỘ LỌC NGÀY NỔI RIÊNG)
        ════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-6 xl:col-span-6 h-full relative bg-gray-100 flex flex-col">
          {/* Bộ chọn xem ngày nổi trên bản đồ (Floating Day Selector on Map) */}
          <div className="absolute top-4 left-4 z-[400] flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-full shadow-md border border-gray-200/80">
            <button
              type="button"
              onClick={() => setMapDayFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                mapDayFilter === 'all'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-gray-600 hover:text-black hover:bg-gray-100'
              }`}
            >
              Tất cả các ngày
            </button>
            {plan.days.map((day) => (
              <button
                key={day.day_number}
                type="button"
                onClick={() => setMapDayFilter(day.day_number)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  mapDayFilter === day.day_number
                    ? 'bg-black text-white shadow-xs'
                    : 'text-gray-600 hover:text-black hover:bg-gray-100'
                }`}
              >
                <span>Ngày {day.day_number}</span>
                {day.stops.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      mapDayFilter === day.day_number ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {day.stops.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Bản đồ Leaflet sạch sẽ */}
          <div className="flex-1 w-full h-full relative">
            <PoiMap
              pois={mapPois.length > 0 ? mapPois : allPois.slice(0, 10)}
              selectedPoiId={selectedMapPoiId}
              hoveredPoiId={hoveredStopId}
              onSelectPoi={(id) => setSelectedMapPoiId(id)}
              onHoverPoi={(id) => setHoveredStopId(id)}
            />
          </div>
        </div>
      </div>

      {/* ─── MODAL TÌM KIẾM & THÊM VÀO CHUYẾN ĐI (CHUẨN SCREENSHOT 3) ─── */}
      {showAddIdeasModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs py-6 px-4 animate-fadeIn"
          onClick={() => {
            setShowAddIdeasModal(false);
            setActiveDayAddModal(null);
          }}
        >
          <div
            className="relative bg-white w-[760px] max-w-[calc(100vw-32px)] h-[calc(100vh-80px)] max-h-[760px] rounded-3xl shadow-2xl flex flex-col border border-gray-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal với nút đóng X bên trái và tiêu đề căn giữa (Chuẩn Screenshot 3) */}
            <div className="px-6 py-3.5 border-b border-gray-100 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowAddIdeasModal(false);
                  setActiveDayAddModal(null);
                }}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-black cursor-pointer transition"
              >
                <X size={18} />
              </button>
              <h3 className="font-extrabold text-[16px] text-gray-950">
                {activeDayAddModal ? `Thêm vào Ngày ${activeDayAddModal}` : 'Thêm vào chuyến đi'}
              </h3>
              <div className="w-8" />
            </div>

            {/* Thanh Tab: Tìm kiếm (Search) | Đã lưu (Saved) | Tự tạo (Custom) (Chuẩn Screenshot 3) */}
            <div className="px-6 pt-2 border-b border-gray-100 flex items-center gap-6 text-sm font-semibold text-gray-500 shrink-0 bg-white">
              <button
                type="button"
                onClick={() => setModalMainTab('search')}
                className={`pb-2.5 transition cursor-pointer relative ${
                  modalMainTab === 'search' ? 'text-black font-bold' : 'hover:text-black'
                }`}
              >
                Tìm kiếm
                {modalMainTab === 'search' && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-black rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setModalMainTab('saved')}
                className={`pb-2.5 transition cursor-pointer relative ${
                  modalMainTab === 'saved' ? 'text-black font-bold' : 'hover:text-black'
                }`}
              >
                Đã lưu
                {modalMainTab === 'saved' && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-black rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setModalMainTab('custom')}
                className={`pb-2.5 transition cursor-pointer relative ${
                  modalMainTab === 'custom' ? 'text-black font-bold' : 'hover:text-black'
                }`}
              >
                Tự tạo
                {modalMainTab === 'custom' && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-black rounded-full" />
                )}
              </button>
            </div>

            {/* Nội dung theo Tab */}
            {modalMainTab === 'search' && (
              <>
                {/* Chọn Thành phố & Ô tìm kiếm có nút Bộ lọc (Chuẩn Screenshot 3) */}
                <div className="p-5 border-b border-gray-100 space-y-3.5 shrink-0 bg-white">
                  <div className="flex items-center gap-2">
                    <select
                      value={modalCity}
                      onChange={(e) => setModalCity(e.target.value as any)}
                      className="text-base font-extrabold text-gray-900 bg-transparent border-none appearance-none pr-5 cursor-pointer focus:outline-none"
                    >
                      <option value="all">Tất cả điểm đến</option>
                      <option value="Đà Nẵng">Đà Nẵng</option>
                      <option value="Huế">Huế</option>
                    </select>
                    <ChevronDown size={14} className="-ml-3 pointer-events-none text-gray-600" />
                  </div>

                  {/* Thanh tìm kiếm với nút Bộ lọc */}
                  <div className="relative flex items-center">
                    <Search size={16} className="absolute left-3.5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Tìm kiếm..."
                      value={modalSearch}
                      onChange={(e) => setModalSearch(e.target.value)}
                      className="w-full pl-10 pr-24 py-2.5 rounded-full border border-gray-300 text-sm focus:border-black focus:outline-none bg-white shadow-2xs"
                    />
                    <div className="absolute right-2 flex items-center">
                      <button
                        type="button"
                        className="px-3 py-1 rounded-full border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-700 flex items-center gap-1.5 cursor-pointer"
                      >
                        <SlidersHorizontal size={12} />
                        <span>Bộ lọc</span>
                      </button>
                    </div>
                  </div>

                  {/* Hàng chọn Pills danh mục (Chuẩn Screenshot 3: For you, Experiences, Restaurants...) */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {MODAL_CATEGORY_PILLS.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setModalCategory(cat.id)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition cursor-pointer ${
                          modalCategory === cat.id
                            ? 'bg-black text-white shadow-xs'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Danh sách 3 cột địa điểm (Chuẩn Screenshot 3) */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <h4 className="font-extrabold text-sm text-gray-950">
                    {modalCategory === 'all' ? 'Gợi ý nổi bật' : MODAL_CATEGORY_PILLS.find((c) => c.id === modalCategory)?.label}
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {modalFilteredPois.slice(0, 30).map((poi) => {
                      const isAddedToIdeas = tripIdeas.includes(poi.id);
                      const isAddedToCurrentDay =
                        activeDayAddModal !== null &&
                        plan.days
                          .find((d) => d.day_number === activeDayAddModal)
                          ?.stops.some((s) => s.poi_id === poi.id);

                      return (
                        <div
                          key={poi.id}
                          className="flex flex-col rounded-2xl bg-white border border-gray-100 hover:border-gray-300 transition shadow-2xs overflow-hidden group select-none"
                        >
                          {/* Ảnh thẻ với nút + Thêm góc trên phải (Chuẩn Screenshot 3) */}
                          <div className="h-36 relative overflow-hidden bg-gray-100">
                            <img
                              src={getPoiImage(poi)}
                              alt={poi.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                              loading="lazy"
                            />
                            <div className="absolute top-2.5 right-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  if (activeDayAddModal) {
                                    handleAddIdeaToDay(activeDayAddModal, poi);
                                  } else {
                                    handleToggleIdeaInTrip(poi.id);
                                  }
                                }}
                                className={`h-7 px-3 rounded-full text-xs font-bold transition flex items-center gap-1 shadow-sm cursor-pointer ${
                                  (activeDayAddModal ? isAddedToCurrentDay : isAddedToIdeas)
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-white/95 hover:bg-white text-gray-900'
                                }`}
                              >
                                {(activeDayAddModal ? isAddedToCurrentDay : isAddedToIdeas) ? (
                                  <>
                                    <Check size={12} /> Đã thêm
                                  </>
                                ) : (
                                  <>
                                    <Plus size={12} /> Thêm
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Chi tiết bên dưới ảnh */}
                          <div className="p-3 flex-1 flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between gap-1">
                                <h5 className="font-bold text-[13.5px] text-gray-950 truncate" title={poi.name}>
                                  {poi.name}
                                </h5>
                                <div className="flex items-center gap-0.5 text-xs font-bold text-gray-900 shrink-0">
                                  <Star size={11} className="fill-amber-400 text-amber-400" />
                                  <span>{poi.rating || 4.5}</span>
                                </div>
                              </div>
                              <p className="text-[11px] text-gray-500 font-medium mt-0.5 truncate">
                                {formatCategoryLabel(poi.category)}
                              </p>
                            </div>
                            <p className="text-[11px] text-gray-400 truncate mt-1">
                              {poi.city}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Tab Đã lưu (Saved) */}
            {modalMainTab === 'saved' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <h4 className="font-extrabold text-sm text-gray-950">
                  Địa điểm trong kho Ý tưởng ({ideaPois.length}):
                </h4>
                {ideaPois.length === 0 ? (
                  <p className="text-xs text-gray-500">Chưa có địa điểm nào được lưu.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {ideaPois.map((poi) => {
                      const isAddedToCurrentDay =
                        activeDayAddModal !== null &&
                        plan.days
                          .find((d) => d.day_number === activeDayAddModal)
                          ?.stops.some((s) => s.poi_id === poi.id);

                      return (
                        <div
                          key={poi.id}
                          className="flex flex-col rounded-2xl bg-white border border-gray-100 p-3 shadow-2xs"
                        >
                          <div className="h-28 rounded-xl overflow-hidden bg-gray-100 mb-2">
                            <img
                              src={getPoiImage(poi)}
                              alt={poi.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <h5 className="font-bold text-xs text-gray-950 truncate">{poi.name}</h5>
                          <p className="text-[10px] text-gray-500 truncate mt-0.5">{poi.city} • {formatCategoryLabel(poi.category)}</p>
                          {activeDayAddModal && (
                            <button
                              type="button"
                              onClick={() => handleAddIdeaToDay(activeDayAddModal, poi)}
                              className={`mt-2 py-1 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                                isAddedToCurrentDay
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                                  : 'bg-black text-white hover:bg-neutral-800'
                              }`}
                            >
                              {isAddedToCurrentDay ? (
                                <>
                                  <Check size={12} /> Đã có trong Ngày {activeDayAddModal}
                                </>
                              ) : (
                                <>
                                  <Plus size={12} /> Thêm vào Ngày {activeDayAddModal}
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tab Tự tạo (Custom) */}
            {modalMainTab === 'custom' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <h4 className="font-extrabold text-sm text-gray-950">
                  Tự thêm địa điểm mới vào chuyến đi:
                </h4>
                <div className="space-y-3 max-w-md">
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">
                      Tên địa điểm / Quán ăn:
                    </label>
                    <input
                      type="text"
                      placeholder="Ví dụ: Bún chả cá Bà Phiến, Cafe Góc Phố..."
                      value={customIdeaInput}
                      onChange={(e) => setCustomIdeaInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:border-black focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCustomIdea}
                    disabled={!customIdeaInput.trim()}
                    className="px-5 py-2.5 rounded-full bg-black text-white text-xs font-bold disabled:opacity-40 cursor-pointer shadow-xs"
                  >
                    + Lưu vào Ý tưởng
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { saveTripWorkspace } from '@/services/tripWorkspace';
import TravelAssistant from './TravelAssistant';
import { Sparkles } from 'lucide-react';
import { tripStartDate as getTripStartDate, dateAt, vietnamNow } from '@/utils/tripDates';
import ExpiredTripBanner from './ExpiredTripBanner';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Clock,
  Calendar as CalendarIcon,
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
  MapPin,
  Map as MapIcon,
  Info,
} from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import {
  type Poi,
  type PoiCategory,
  type PoiCity,
  getDeterministicImage,
  normalizeCategory,
  normalizeCity,
  normalizePoi,
  categoryLabels,
  isRawIdentifier,
} from '@/data/pois';
import { useSavedPlaces } from '@/context/SavedPlacesContext';
import { MorphTabIcon } from '@/components/ui/MorphButton';
import PoiMap from '@/components/poi/PoiMap';
import TripHeader from './TripHeader';
import { plannerStyles } from './plannerStyles';
import { usePlannerMapVisible } from './usePlannerMapVisible';
import PlannerPopover from './PlannerPopover';
import {
  createEmptyItinerary,
  getTripItinerary,
  saveTripItinerary,
  scheduleError,
  stopFromPoi,
  alignItineraryToTrip,
  normalizeLegacyLunchBreaks,
  distanceKm,
  minutesFromTime,
  parseStartDateFromTrip,
  getRoutePositionsForStops,
  buildFallbackRoadCorridor,
  type TripItinerary,
  type ItineraryDay,
  type ItineraryStop,
} from '@/services/itineraryService';

export interface TripItineraryViewProps {
  trip: UserTrip;
  allPois?: Poi[];
  onBack: () => void;
  onUpdateTrip?: (updatedTrip: UserTrip) => void;
  onCreatePrivateTrip?: (ideaIds: string[]) => void;
  isDrawerMode?: boolean;
  onClose?: () => void;
  initialFocus?: 'ideas' | 'itinerary';
  onNavigateToCalendar?: () => void;
  activeWorkspaceTab?: 'ideas' | 'itinerary' | 'calendar';
  onNavigateToTab?: (tab: 'ideas' | 'itinerary' | 'calendar') => void;
  onOpenWhen?: () => void;
}

// ─────────────────────────────────────────────────────────────
// 4 Danh mục chuẩn GreenTrip (Quán ăn, Di tích, Cảnh quan, Chùa)
// ─────────────────────────────────────────────────────────────
const GREEN_CATEGORY_TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'quan-an', label: 'Quán ăn' },
  { id: 'di-tich', label: 'Di tích' },
  { id: 'canh-quan', label: 'Cảnh quan' },
  { id: 'chua', label: 'Chùa' },
];

const MODAL_CATEGORY_TABS: { id: string; label: string }[] = [
  { id: 'for-you', label: 'Dành cho bạn' },
  { id: 'all', label: 'Tất cả' },
  { id: 'di-tich', label: 'Di tích' },
  { id: 'canh-quan', label: 'Cảnh quan' },
  { id: 'chua', label: 'Chùa' },
  { id: 'quan-an', label: 'Quán ăn' },
];

function formatCategoryLabel(cat?: string | null): string {
  if (!cat) return 'Điểm đến';
  const c = cat.toLowerCase().replace(/[-_]/g, ' ');
  if (c.includes('quan an') || c.includes('quán ăn') || c.includes('ẩm thực') || c.includes('food') || c.includes('restaurant')) return 'Quán ăn';
  if (c.includes('di tich') || c.includes('di tích') || c.includes('lăng') || c.includes('đại nội')) return 'Di tích';
  if (c.includes('chua') || c.includes('chùa')) return 'Chùa';
  if (c.includes('bien') || c.includes('biển') || c.includes('canh quan') || c.includes('cảnh quan')) return 'Cảnh quan';
  if (c.includes('ca phe') || c.includes('cà phê') || c.includes('coffee')) return 'Quán ăn';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function getPoiImage(poi?: Poi | null): string {
  if (!poi) return 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80';
  if (poi.image && poi.image.startsWith('http')) return poi.image;
  return getDeterministicImage(poi.name, poi.id, (poi.category as PoiCategory) || 'quan-an', poi.city);
}

function getCategoryIcon(cat?: string | null) {
  const c = (cat || '').toLowerCase();
  if (c.includes('ăn') || c.includes('ẩm thực') || c.includes('food') || c.includes('restaurant') || c.includes('culinary') || c.includes('quan-an')) {
    return <Utensils size={12} className="text-current shrink-0" />;
  }
  if (c.includes('di tích') || c.includes('lăng') || c.includes('đại nội') || c.includes('di-tich')) {
    return <Landmark size={12} className="text-current shrink-0" />;
  }
  if (c.includes('chùa') || c.includes('chua')) {
    return <Compass size={12} className="text-current shrink-0" />;
  }
  if (c.includes('rest') || c.includes('nghỉ')) {
    return <Coffee size={12} className="text-current shrink-0" />;
  }
  return <Compass size={12} className="text-current shrink-0" />;
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

function displayDateVi(dateStr: string | null, tripStartDate: string | undefined, dayNumber: number): string {
  if (!dateStr && !tripStartDate) return '';
  if (!dateStr && !getTripStartDate(tripStartDate)) return '';
  const start = parseStartDateFromTrip(tripStartDate);
  if (!dateStr) {
    const date = new Date(start.year, start.month - 1, start.day + dayNumber - 1, 12);
    dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
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
  onCreatePrivateTrip,
  isDrawerMode = false,
  onClose,
  initialFocus,
  onNavigateToCalendar,
  activeWorkspaceTab = 'itinerary',
  onNavigateToTab,
  onOpenWhen,
}: TripItineraryViewProps) {
  // ─── 0. Hệ thống địa điểm đã lưu (Favorites / Đã thích) của Thiện ───
  const { savedIds, pendingIds, toggleSaved, openCollectionPicker, places } = useSavedPlaces();

  // Đếm số lượng địa điểm đã thích từ hệ thống Đã lưu
  const savedCount = useMemo(() => {
    let count = savedIds.size;
    try {
      const rawFav = localStorage.getItem('greentrip_favorites');
      if (rawFav) {
        const parsed = JSON.parse(rawFav) as string[];
        count = Math.max(count, parsed.length);
      }
    } catch {}
    return count;
  }, [savedIds]);

  // ─── 1. Quản lý trạng thái Lịch trình (TripItinerary Plan) ───
  const [plan, setPlan] = useState<TripItinerary>(() => createEmptyItinerary(trip));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const loadFailed = useRef(false);
  const [loadRetry, setLoadRetry] = useState(0);
  const onTripUpdated = useRef(onUpdateTrip);
  onTripUpdated.current = onUpdateTrip;
  const loadingPlan = useRef(true);
  loadingPlan.current = isLoading;

  // Tham chiếu tự động lưu
  const saveVersion = useRef(0);
  const latestPlan = useRef(plan);
  const currentTrip = useRef(trip);
  currentTrip.current = trip;

  // ─── 2. Quản lý Ý tưởng (Ideas List) ───
  const [assistantOpen,setAssistantOpen]=useState(false);
  const [assistantRefresh,setAssistantRefresh]=useState(0);
  const [tripIdeas, setTripIdeas] = useState<string[]>(() => {
    if (Array.isArray(trip.ideas)) return trip.ideas;
    return [];
  });

  // State giao diện
  const [expandIdeas, setExpandIdeas] = useState(true);
  const [ideasFilter, setIdeasFilter] = useState<'all' | 'quan-an' | 'di-tich' | 'canh-quan' | 'chua'>('all');
  const [showIdeasFilterMenu, setShowIdeasFilterMenu] = useState(false);
  const [ideasCityFilter, setIdeasCityFilter] = useState<'all' | PoiCity>('all');
  const [showIdeasLocationMenu, setShowIdeasLocationMenu] = useState(false);
  const [showIdeasMoreMenu, setShowIdeasMoreMenu] = useState(false);

  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(() => {
    // Mặc định chỉ mở ngày 1 (ngày đang làm việc), các ngày sau (2, 3...) đóng lại
    const initial = new Set<number>();
    const count = trip.daysCount || 3;
    for (let d = 2; d <= Math.max(count, 10); d++) {
      initial.add(d);
    }
    return initial;
  });
  const [showDistances, setShowDistances] = useState(true);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const showMap = usePlannerMapVisible();

  // Bộ lọc xem ngày nổi trên Bản đồ (đặt góc trên bên phải)
  const [mapDayFilter, setMapDayFilter] = useState<number | 'all'>(1);
  const [showDayFilterDropdown, setShowDayFilterDropdown] = useState(false);

  // Thao tác nhanh cho từng thẻ Ideas & Ngày
  const ideasCarouselRef = useRef<HTMLDivElement>(null);
  const ideasSectionRef = useRef<HTMLDivElement>(null);
  const itinerarySectionRef = useRef<HTMLDivElement>(null);
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

  // Modal Thêm địa điểm vào Ý tưởng / Ngày (Chuẩn 1:1 TripOverviewView & Mindtrip)
  const [showAddIdeasModal, setShowAddIdeasModal] = useState(false);
  const [modalTab, setModalTab] = useState<'search' | 'ideas' | 'saved' | 'custom'>('search');
  const [modalSearch, setModalSearch] = useState('');
  const [modalCity, setModalCity] = useState<'all' | 'Đà Nẵng' | 'Huế'>('all');
  const [showModalCityDropdown, setShowModalCityDropdown] = useState(false);
  const [modalCategory, setModalCategory] = useState<string>('for-you');
  const [customIdeaInput, setCustomIdeaInput] = useState('');

  const [showCustomSettings, setShowCustomSettings] = useState(false);

  // Chuẩn hóa ngày phụ đề dưới tên
  const formatStartingDate = (dateStr?: string) => {
    if (!dateStr) return 'Bắt đầu từ 10 thg 11';
    const match = dateStr.match(/(\d+)\s*[-–]\s*\d+\s+(?:tháng|thg)\s*(\d+)/i);
    if (match) return `Bắt đầu từ ${match[1]} thg ${match[2]}`;
    const dayMatch = dateStr.match(/(\d+)/);
    if (dayMatch) return `Bắt đầu từ ${dayMatch[1]} thg 11`;
    return 'Bắt đầu từ 10 thg 11';
  };

  // Tiêu đề chuyến đi rõ ràng (tự động loại bỏ chữ 'ư', câu chat hoặc chuỗi ngắn)
  const displayTitle = useMemo(() => {
    const clean = trip.title?.trim();
    if (clean && clean.length > 2 && clean.toLowerCase() !== 'ư' && clean.toLowerCase() !== 'a' && !clean.toLowerCase().startsWith('bắt đầu')) {
      return clean;
    }
    return `Chuyến đi ${trip.destination || 'Đà Nẵng & Huế'}`;
  }, [trip.title, trip.destination]);

  // Phụ đề gọn (không bị lặp '4 ngày 4 ngày')
  const displaySubtitle = useMemo(() => {
    let dates = trip.startDate || 'Tháng 11/2026';
    dates = dates.replace(/\s*\(\d+\s*ngày\)/gi, '').trim();
    return `${trip.destination || 'Đà Nẵng & Huế'} • ${dates} (${plan.days.length} ngày)`;
  }, [trip.destination, trip.startDate, plan.days.length]);

  // ─── 3. Đồng bộ danh sách POI từ `tripIdeas` ───
  const ideaPois = useMemo(() => {
    return tripIdeas
      .map((id) => {
        const found = allPois.find((p) => String(p.id) === String(id) || p.name.toLowerCase() === id.toLowerCase());
        if (found) return found;
        if (id.startsWith('custom-')) {
          const customName = id.replace(/^custom-/, '');
          return {
            id,
            name: customName,
            city: /hue|huế/i.test(trip.destination) ? 'Huế' : 'Đà Nẵng',
            category: 'quan-an' as PoiCategory,
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
        if (isRawIdentifier(id)) {
          return {
            id,
            name: 'Đang tải...',
            city: /hue|huế/i.test(trip.destination) ? 'Huế' : 'Đà Nẵng',
            category: 'canh-quan' as PoiCategory,
            image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80',
            address: '',
            description: '',
            lat: 16.0678,
            lng: 108.2208,
            rating: 4.8,
            visitDuration: '1.0 giờ',
            ecoScore: 85,
            isGreen: false,
            _isLoading: true,
          } as Poi & { _isLoading?: boolean };
        }
        return null;
      })
      .filter((p): p is Poi => p !== null);
  }, [tripIdeas, allPois, trip.destination]);

  const [canScrollIdeasLeft, setCanScrollIdeasLeft] = useState(false);
  const [canScrollIdeasRight, setCanScrollIdeasRight] = useState(false);

  // Cuộn dải thẻ ý tưởng
  const handleScrollIdeas = (dir: 'left' | 'right') => {
    if (!ideasCarouselRef.current) return;
    const delta = dir === 'left' ? -260 : 260;
    ideasCarouselRef.current.scrollBy({ left: delta, behavior: 'smooth' });
  };

  // Lọc kho Ý tưởng theo thành phố và danh mục; không loại điểm đã xếp lịch
  const filteredIdeaPois = useMemo(() => {
    return ideaPois.filter((p) => {
      if (ideasCityFilter !== 'all' && normalizeCity(p.city) !== ideasCityFilter) return false;
      if (ideasFilter === 'all') return true;

      const norm = normalizeCategory(p.category);
      if (ideasFilter === 'quan-an') {
        const c = (p.category || '').toLowerCase();
        return norm === 'quan-an' || c.includes('ăn') || c.includes('ẩm thực') || c.includes('food') || c.includes('quán') || c.includes('cafe');
      }
      if (ideasFilter === 'di-tich') {
        const c = (p.category || '').toLowerCase();
        return norm === 'di-tich' || c.includes('di tích') || c.includes('lăng') || c.includes('đại nội') || c.includes('attraction');
      }
      if (ideasFilter === 'canh-quan') {
        const c = (p.category || '').toLowerCase();
        return norm === 'canh-quan' || c.includes('cảnh quan') || c.includes('biển') || c.includes('cầu') || c.includes('sơn trà') || c.includes('bà nà');
      }
      if (ideasFilter === 'chua') {
        const c = (p.category || '').toLowerCase();
        return norm === 'chua' || c.includes('chùa');
      }
      return true;
    });
  }, [ideaPois, ideasFilter, ideasCityFilter]);

  useEffect(() => {
    const carousel = ideasCarouselRef.current;
    if (!carousel) return;
    const update = () => {
      setCanScrollIdeasLeft(carousel.scrollLeft > 1);
      setCanScrollIdeasRight(carousel.scrollLeft + carousel.clientWidth < carousel.scrollWidth - 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(carousel);
    carousel.addEventListener('scroll', update, { passive: true });
    return () => { observer.disconnect(); carousel.removeEventListener('scroll', update); };
  }, [filteredIdeaPois.length, expandIdeas]);

  // ─── 4. Tự động lưu và tải từ Backend / LocalStorage ───
  const persistPlan = useCallback(
    (nextPlan: TripItinerary) => {
      if (loadingPlan.current || loadFailed.current) { setErrorMessage('Đang tải lịch trình, vui lòng chờ.'); return false; }
      const validation = scheduleError(nextPlan, latestPlan.current);
      if (validation) { setErrorMessage(validation); return false; }
      const version = ++saveVersion.current;
      latestPlan.current = nextPlan;
      setPlan(nextPlan);
      setHasUnsavedChanges(true);
      setErrorMessage('');

      void (async () => {
        setIsSaving(true);
        try {
          const saved = await saveTripItinerary(nextPlan);
          if (nextPlan.days_count !== currentTrip.current.daysCount) {
            const updated = await saveTripWorkspace({...currentTrip.current, daysCount: nextPlan.days_count});
            onTripUpdated.current?.(updated);
          }
          if (version === saveVersion.current) {
            setPlan((prev) => ({ ...prev, updated_at: saved.updated_at }));
            setHasUnsavedChanges(false);
          }
        } catch (cause) {
          if (version === saveVersion.current) {
            console.warn('Lỗi lưu lịch trình:', cause);
            setErrorMessage(cause instanceof Error ? cause.message : 'Chưa thể lưu lịch trình.');
          }
        } finally {
          if (version === saveVersion.current) setIsSaving(false);
        }
      })();
      return true;
    },
    []
  );

  // Tải kế hoạch khi mở trang
  useEffect(() => {
    let isCancelled = false;
    async function loadData() {
      setIsLoading(true);
      setErrorMessage('');
      loadFailed.current = false;
      try {
        const saved = await getTripItinerary(trip.id);
        if (isCancelled) return;
        const normalized = normalizeLegacyLunchBreaks(saved);
        const aligned = alignItineraryToTrip(normalized.itinerary, currentTrip.current);
        latestPlan.current = aligned.itinerary;
        setPlan(aligned.itinerary);
      } catch (cause) {
        if (isCancelled) return;
        if ((cause as {status?: number}).status !== 404) {
          loadFailed.current = true;
          setErrorMessage(cause instanceof Error ? cause.message : 'Chưa tải được lịch trình.');
          return;
        }
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
    };
  }, [trip.id, assistantRefresh, loadRetry]);

  useEffect(() => {
    if (Array.isArray(trip.ideas)) {
      setTripIdeas(trip.ideas);
    }
  }, [trip.ideas]);

  // Đồng bộ số ngày khi trip.daysCount thay đổi từ bên ngoài (ví dụ: đổi popup 'Khi' ở Ý tưởng)
  useEffect(() => {
    if (!isLoading && !isSaving && !hasUnsavedChanges && trip.daysCount && (trip.daysCount !== plan.days.length || getTripStartDate(trip.startDate) !== plan.start_date)) {
      const aligned = alignItineraryToTrip(latestPlan.current, trip);
      if (aligned.changed) {
        latestPlan.current = aligned.itinerary;
        setPlan(aligned.itinerary);
        persistPlan(aligned.itinerary);
      }
    }
  }, [trip.daysCount, trip.startDate, isLoading, isSaving, hasUnsavedChanges, persistPlan, trip]);

  useEffect(() => {
    if (initialFocus === 'ideas') {
      setExpandIdeas(true);
      const timer = setTimeout(() => {
        ideasSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
      return () => clearTimeout(timer);
    } else if (initialFocus === 'itinerary') {
      const timer = setTimeout(() => {
        itinerarySectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [initialFocus]);

  // ─── 5. Thao tác THỦ CÔNG (Manual Planning First) ───

  // Thêm ý tưởng vào ngày cụ thể
  const handleAddIdeaToDay = (dayNumber: number, poi: Poi, targetIndex?: number) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;

      const stops = [...day.stops];
      const newStop = stopFromPoi(poi, 'manual');

      const dur = getPoiVisitDurationMinutes(poi);
      newStop.duration_minutes = dur;

      let startMinutes = 8 * 60; // 08:00 sáng
      const prevStop = stops.length > 0 ? stops[stops.length - 1] : null;

      if (prevStop && prevStop.end_time) {
        const [h, m] = prevStop.end_time.split(':').map(Number);
        startMinutes = (h || 8) * 60 + (m || 0) + 15;
      }

      const now = vietnamNow();
      if (day.date === now.date && startMinutes < now.minutes + 15) {
        startMinutes = Math.min(22 * 60, now.minutes + 15);
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

  // Di chuyển điểm dừng giữa các ngày
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

    const targetDay = plan.days.find((d) => d.day_number === toDayNumber);
    const targetDate = targetDay?.date || (plan.start_date ? dateAt(plan.start_date, toDayNumber - 1) : null);
    const dur = movingStop.duration_minutes || 90;
    const targetExistingStops = targetDay?.stops || [];
    const prevStop = targetExistingStops.length > 0 ? targetExistingStops[targetExistingStops.length - 1] : null;

    let startMinutes = 8 * 60;
    if (prevStop && prevStop.end_time) {
      const [h, m] = prevStop.end_time.split(':').map(Number);
      startMinutes = (h || 8) * 60 + (m || 0) + 15;
    }
    const now = vietnamNow();
    if (targetDate === now.date && startMinutes < now.minutes + 15) {
      startMinutes = Math.min(22 * 60, now.minutes + 15);
    }
    const startH = Math.min(22, Math.floor(startMinutes / 60));
    const startM = startMinutes % 60;
    const endTotalM = startMinutes + dur;
    const endH = Math.min(23, Math.floor(endTotalM / 60));
    const endM = endTotalM % 60;

    movingStop.start_time = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
    movingStop.end_time = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

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
    if (persistPlan({ ...plan, days: nextDays })) setEditingStopId(null);
  };

  // Lưu ghi chú cho điểm dừng
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
        category: 'quan-an',
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
    if (isLoading || isSaving || loadFailed.current) return;
    const nextNumber = plan.days.length + 1;
    const start = getTripStartDate(trip.startDate);
    const nextDays = [
      ...plan.days,
      {
        day_id: `${plan.trip_id}-day-${nextNumber}`,
        day_number: nextNumber,
        date: start ? dateAt(start, nextNumber - 1) : null,
        title: `Ngày ${nextNumber}`,
        stops: [],
      },
    ];
    persistPlan(alignItineraryToTrip({ ...plan, days_count: nextDays.length, days: nextDays }, {...trip, daysCount: nextDays.length}).itinerary);
    setShowItinerarySettingsMenu(false);


  };

  // Xóa ngày khỏi lịch
  const handleDeleteDay = (dayNumber: number) => {
    if (isLoading || isSaving || loadFailed.current || plan.days.length <= 1) return;
    const filteredDays = plan.days.filter((d) => d.day_number !== dayNumber);
    const nextDays = filteredDays.map((d, idx) => ({
      ...d,
      day_number: idx + 1,
      title: `Ngày ${idx + 1}`,
    }));
    persistPlan(alignItineraryToTrip({ ...plan, days_count: nextDays.length, days: nextDays }, {...trip, daysCount: nextDays.length}).itinerary);


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
    if (activeDayAddModal) {
      const customPoi: Poi = {
        id: customId,
        name,
        city: /hue|huế/i.test(trip.destination) ? 'Huế' : 'Đà Nẵng',
        category: 'quan-an',
        image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80',
        address: 'Địa điểm tự thêm',
        description: '',
        lat: 16.0678,
        lng: 108.2208,
        rating: 4.8,
        visitDuration: '1.0 giờ',
        ecoScore: 85,
        isGreen: true,
      };
      handleAddIdeaToDay(activeDayAddModal, customPoi);
    } else {
      handleToggleIdeaInTrip(customId);
    }
    setCustomIdeaInput('');
    setShowAddIdeasModal(false);
  };

  // Nút Xong: Lưu và quay lại
  const handleDone = async () => {
    if (loadingPlan.current || loadFailed.current) {
      setErrorMessage('Chưa tải được lịch đầy đủ. Thử tải lại trước khi lưu.');
      return;
    }
    setIsSaving(true);
    try {
      const saved = await saveTripItinerary(latestPlan.current);
      const updated = await saveTripWorkspace({...currentTrip.current, daysCount: saved.days_count, ideas: tripIdeas});
      onTripUpdated.current?.(updated);
      setHasUnsavedChanges(false);
      if (onClose) onClose(); else onBack();
    } catch (cause) {
      setHasUnsavedChanges(true);
      setErrorMessage(cause instanceof Error ? cause.message : 'Chưa lưu được lịch trình.');
    } finally { setIsSaving(false); }
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
            category: (stop.category as PoiCategory) || 'quan-an',
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

  // Danh sách stops hợp lệ (có tọa độ) theo ngày đang chọn hoặc tất cả các ngày
  const currentFilteredStops = useMemo(() => {
    const displayedDays =
      mapDayFilter === 'all'
        ? plan.days
        : plan.days.filter((d) => d.day_number === mapDayFilter);

    const stopsList: { latitude: number; longitude: number; poi_id?: string; stop_id: string; title: string }[] = [];
    displayedDays.forEach((day) => {
      day.stops.forEach((stop) => {
        if (stop.stop_type === 'rest') return;
        const matched = allPois.find((p) => p.id === stop.poi_id);
        const lat = matched?.lat ?? stop.latitude;
        const lng = matched?.lng ?? stop.longitude;
        if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
          stopsList.push({
            stop_id: stop.stop_id,
            poi_id: stop.poi_id || stop.stop_id,
            title: stop.title,
            latitude: lat,
            longitude: lng,
          });
        }
      });
    });
    return stopsList;
  }, [plan.days, mapDayFilter, allPois]);

  // Bảng đánh số thứ tự (Numbered Markers 1, 2, 3...) theo ngày
  const numberedOrderMap = useMemo(() => {
    const orderMap = new Map<string, number>();
    currentFilteredStops.forEach((s, idx) => {
      const order = idx + 1;
      if (s.poi_id) orderMap.set(String(s.poi_id), order);
      if (s.stop_id) orderMap.set(String(s.stop_id), order);
      if (s.title) orderMap.set(s.title, order);
    });
    return orderMap;
  }, [currentFilteredStops]);

  // Tọa độ vẽ đường Polyline thực tế (chuẩn OSRM / backend)
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [routeDurationText, setRouteDurationText] = useState<string | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;
    if (currentFilteredStops.length < 2) {
      setRouteCoordinates([]);
      setRouteDurationText(undefined);
      return;
    }

    // Hiển thị ngay lộ trình hành lang đường bộ thực tế (0ms) để không bị đứt đoạn hay cắt ngang vịnh biển
    const instantCorridor = buildFallbackRoadCorridor(currentFilteredStops);
    if (instantCorridor.coordinates.length >= 2) {
      setRouteCoordinates(instantCorridor.coordinates);
      setRouteDurationText(instantCorridor.durationText);
    }

    const dayNum = typeof mapDayFilter === 'number' ? mapDayFilter : undefined;
    getRoutePositionsForStops(currentFilteredStops, trip.id, dayNum)
      .then((res) => {
        if (isMounted && res?.coordinates && res.coordinates.length >= 2) {
          const coords = Array.isArray(res) ? res : res.coordinates;
          const durText = Array.isArray(res) ? undefined : res.durationText;
          setRouteCoordinates(coords);
          setRouteDurationText(durText);
        }
      })
      .catch(() => {
        // Giữ nguyên instantCorridor an toàn trên đất liền
      });

    return () => {
      isMounted = false;
    };
  }, [currentFilteredStops, trip.id, mapDayFilter]);

  const isDaNang = useCallback((c?: string) => /da\s*nang|đà\s*nẵng/i.test(c || ''), []);
  const isHue = useCallback((c?: string) => /hue|huế/i.test(c || ''), []);

  // Lọc danh sách POI cho Modal "Thêm vào chuyến đi" chuẩn 1:1 TripOverviewView
  const modalFilteredPois = useMemo(() => {
    let list: Poi[] = [];

    if (modalTab === 'ideas') {
      list = ideaPois;
    } else if (modalTab === 'saved') {
      let favSet = new Set<string>();
      try {
        const rawFav = localStorage.getItem('greentrip_favorites');
        if (rawFav) favSet = new Set<string>(JSON.parse(rawFav));
      } catch (e) {
        console.error(e);
      }
      const poisFromAll = allPois.filter(
        (p) => savedIds.has(String(p.id)) || savedIds.has(p.name) || favSet.has(String(p.id)) || favSet.has(p.name)
      );
      const normalizedBackendPlaces = (places || [])
        .map((item) => normalizePoi(item, true))
        .filter((p): p is Poi => p !== null && !poisFromAll.some((ap) => String(ap.id) === String(p.id)));
      list = [...poisFromAll, ...normalizedBackendPlaces];
    } else {
      list = allPois;
    }

    // 1. Lọc theo Thành phố
    if (modalCity === 'Đà Nẵng') {
      list = list.filter((p) => isDaNang(p.city));
    } else if (modalCity === 'Huế') {
      list = list.filter((p) => isHue(p.city));
    }

    // 2. Lọc theo Danh mục chuẩn Explore & Mindtrip
    if (modalCategory === 'for-you') {
      list = [...list].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    } else if (modalCategory === 'di-tich') {
      list = list.filter((p) => p.category === 'di-tich');
    } else if (modalCategory === 'canh-quan' || modalCategory === 'scenic') {
      list = list.filter((p) => p.category === 'canh-quan');
    } else if (modalCategory === 'chua') {
      list = list.filter((p) => p.category === 'chua');
    } else if (modalCategory === 'quan-an' || modalCategory === 'restaurants') {
      list = list.filter((p) => p.category === 'quan-an');
    }

    // 3. Lọc theo từ khóa tìm kiếm
    if (modalSearch.trim()) {
      const q = modalSearch.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.address || '').toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q)
      );
    }

    return list;
  }, [allPois, ideaPois, places, savedIds, modalCity, modalCategory, modalSearch, modalTab, isDaNang, isHue]);

  return (
    <div
      onClick={() => {
        setShowIdeasFilterMenu(false);
        setShowIdeasMoreMenu(false);
        setActiveIdeaMenuPoiId(null);
        setActiveMenuStopId(null);
      }}
      className={
        isDrawerMode
          ? "fixed inset-y-0 right-0 w-full sm:w-[620px] lg:w-[calc(50vw)] xl:w-[calc(50vw)] z-50 bg-white rounded-l-[24px] border-l border-gray-200/90 shadow-[-16px_0_40px_rgba(0,0,0,0.08),-4px_0_12px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden animate-slideInRight select-none"
          : "flex flex-col h-full w-full bg-white text-gray-900 select-none overflow-hidden animate-fadeIn"
      }
    >
      {/* ─── TOP HEADER (DRAWER MODE HOẶC FULL PAGE CHUẨN MINDTRIP) ─── */}
      {isDrawerMode ? (
        <header className="px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 z-30">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose || onBack}
              className="w-9 h-9 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer"
              title="Đóng lịch trình"
            >
              <X size={17} />
            </button>
            <button
              type="button"
              onClick={onClose || onBack}
              className="w-9 h-9 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer"
              title="Quay lại"
            >
              <ChevronLeft size={18} />
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button type="button" aria-label="Trợ lý lên lịch" title={hasUnsavedChanges?'Lưu các thay đổi hiện tại trước khi mở trợ lý':'Trợ lý lên lịch'} disabled={isSaving || hasUnsavedChanges} onClick={()=>setAssistantOpen(true)} className="h-11 w-11 sm:w-auto shrink-0 flex items-center justify-center gap-2 rounded-full border border-neutral-300 px-3 text-xs font-semibold disabled:opacity-50"><Sparkles size={16}/><span className="hidden sm:inline">Trợ lý lên lịch</span></button>
            <div className="text-xs text-gray-500 hidden sm:flex items-center gap-1 font-medium">
              {isSaving ? (
                <span className="flex items-center gap-1 text-amber-700">
                  <RefreshCw size={12} className="animate-spin" /> Đang lưu...
                </span>
              ) : isLoading ? <span>Đang tải…</span> : errorMessage ? <span className="text-red-700">Chưa đồng bộ</span> : hasUnsavedChanges ? (
                <span className="text-gray-400">Chưa lưu</span>
              ) : (
                <span className="text-emerald-700 flex items-center gap-1">
                  <Check size={13} /> Đã lưu
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveDayAddModal(null);
                setModalTab('search');
                setShowAddIdeasModal(true);
              }}
              className="flex items-center gap-1 px-3.5 py-1.5 rounded-full border border-gray-200 hover:border-black text-[12.5px] font-semibold text-gray-900 hover:bg-gray-50 transition cursor-pointer active:scale-95 shadow-2xs"
              title="Thêm ý tưởng mới"
            >
              <Plus size={13} />
              <span>Thêm ý tưởng</span>
            </button>

            <button
              type="button"
              onClick={handleDone}
              className="h-8 px-4 rounded-full bg-black hover:bg-neutral-800 text-white text-xs font-bold transition cursor-pointer shadow-xs active:scale-95"
              title="Xong và đóng lịch trình"
            >
              Xong
            </button>
          </div>
        </header>
      ) : (
        <TripHeader
          trip={trip}
          activeTab="itinerary"
          onNavigateToTab={(tab) => {
            if (onNavigateToTab) onNavigateToTab(tab);
            else if (tab === 'ideas') onBack();
            else if (tab === 'calendar') onNavigateToCalendar?.();
          }}
          onBack={handleDone}
          showCustomSettings={showCustomSettings}
          setShowCustomSettings={setShowCustomSettings}
          onOpenWhere={() => onNavigateToTab?.('ideas')}
          onOpenWhen={onOpenWhen || (() => onNavigateToTab?.('ideas'))}
          onOpenWho={() => onNavigateToTab?.('ideas')}
          onOpenBudget={() => onNavigateToTab?.('ideas')}
          isSaving={isSaving}
          daysCount={plan.days.length}
        />
      )}

      {!isDrawerMode && (
        <ExpiredTripBanner
          trip={trip}
          plan={plan}
          onUpdateTrip={onUpdateTrip}
          onPlanUpdated={(next) => {
            latestPlan.current = next;
            setPlan(next);
          }}
          onOpenWhen={onOpenWhen || (() => onNavigateToTab?.('ideas'))}
        />
      )}

      {/* Drawer Title Section */}
      {isDrawerMode && (
        <div className="px-6 pt-3.5 pb-2.5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
          <div>
            <h2 className={plannerStyles.title}>
              Lịch trình chi tiết
            </h2>
            <p className="text-[13px] text-gray-500 mt-0.5 font-medium">
              {displayTitle} • {plan.days.length} ngày
            </p>
          </div>
        </div>
      )}

      {/* ─── NỘI DUNG CHÍNH (2 CỘT HOẶC 1 CỘT CHO DRAWER) ─── */}
      <div className={isDrawerMode ? "flex-1 w-full min-h-0 overflow-hidden flex flex-col" : "flex-1 min-h-0 flex items-stretch overflow-hidden bg-white"}>
        {/* ════════════════════════════════════════════════════════
            CỘT TRÁI: KHO Ý TƯỞNG + LỊCH TRÌNH THEO NGÀY
        ════════════════════════════════════════════════════════ */}
        <div className={`${isDrawerMode ? 'w-full' : (isMapExpanded && showMap ? 'hidden' : plannerStyles.column)} flex flex-col h-full bg-white overflow-y-auto px-4 sm:px-7 pt-6 pb-6 auto-hide-scrollbar select-none transition-[width] duration-300 ease-in-out`}>
          {isLoading && <p role="status" className="text-[13px] text-neutral-600 mb-3">Đang tải lịch trình…</p>}
          {errorMessage && <p role="alert" className="text-[13px] text-red-700 mb-3">{errorMessage}{loadFailed.current && <button type="button" className="ml-3 min-h-11 underline" onClick={()=>setLoadRetry(value=>value+1)}>Thử tải lại</button>}</p>}
          {/* ────────────────────────────────────────────────────────
              1. TIÊU ĐỀ LỊCH TRÌNH VÀ CÁC THAO TÁC ĐIỀU KHIỂN
          ──────────────────────────────────────────────────────── */}
          {!isDrawerMode && <h1 className={`mb-6 ${plannerStyles.title}`}>Lịch trình chi tiết</h1>}

          {/* ────────────────────────────────────────────────────────
              2. KHO Ý TƯỞNG CHUNG (CÓ THỂ THU GỌN)
          ──────────────────────────────────────────────────────── */}
          <section ref={ideasSectionRef} className="shrink-0 mb-7">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
              {/* Tiêu đề bên trái */}
              <button
                type="button"
                onClick={() => setExpandIdeas(!expandIdeas)}
                aria-expanded={expandIdeas}
                className="flex min-h-10 flex-wrap items-center gap-2 group cursor-pointer text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
              >
                <div className="flex items-center gap-1.5">
                  {expandIdeas ? (
                    <ChevronDown size={16} className="text-gray-500 group-hover:text-black transition" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-500 group-hover:text-black transition" />
                  )}
                  <h2 className={plannerStyles.sectionTitle}>
                    Ý tưởng
                  </h2>
                </div>
                <span className={plannerStyles.meta}>
                  {filteredIdeaPois.length} địa điểm
                </span>
              </button>

              {/* Các nút và Bộ lọc BÊN PHẢI (Chuẩn Mindtrip Ảnh 3, 4) */}
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <div className="relative">
                  <button type="button" id="ideas-location-filter" aria-expanded={showIdeasLocationMenu}
                    onClick={() => { setShowIdeasLocationMenu(!showIdeasLocationMenu); setShowIdeasFilterMenu(false); setShowIdeasMoreMenu(false); }}
                    className="flex min-h-10 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-neutral-800 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-black">
                    {ideasCityFilter === 'all' ? 'Địa điểm' : ideasCityFilter}<ChevronDown size={12} />
                  </button>
                  {showIdeasLocationMenu && <PlannerPopover anchorId="ideas-location-filter" onClose={() => setShowIdeasLocationMenu(false)}>
                    {(['all', 'Đà Nẵng', 'Huế'] as const).map((city) => <button key={city} type="button"
                      onClick={() => { setIdeasCityFilter(city); setShowIdeasLocationMenu(false); }}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-neutral-50">
                      {city === 'all' ? 'Tất cả địa điểm' : city}{ideasCityFilter === city && <Check size={14} />}
                    </button>)}
                  </PlannerPopover>}
                </div>
                {/* Bộ lọc loại địa điểm dùng dữ liệu hiện có */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowIdeasFilterMenu(!showIdeasFilterMenu);
                      setShowIdeasLocationMenu(false);
                      setShowIdeasMoreMenu(false);
                    }}
                    className="flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-neutral-800 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-black"
                  >
                    <span>
                      {ideasFilter === 'all'
                        ? 'Tất cả'
                        : ideasFilter === 'quan-an'
                        ? 'Quán ăn'
                        : ideasFilter === 'di-tich'
                        ? 'Di tích'
                        : ideasFilter === 'canh-quan'
                        ? 'Cảnh quan'
                        : ideasFilter === 'chua'
                        ? 'Chùa'
                        : 'Chưa xếp lịch'}
                    </span>
                    <ChevronDown size={12} className={showIdeasFilterMenu ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>

                  {/* Menu Dropdown chuẩn Ảnh 4 */}
                  {showIdeasFilterMenu && (
                    <div
                      className="absolute right-0 top-9 w-44 bg-white rounded-2xl shadow-xl border border-gray-100 p-1.5 z-50 text-xs animate-fadeIn"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {([
                        { id: 'all', label: 'Tất cả' },
                        { id: 'quan-an', label: 'Quán ăn' },
                        { id: 'di-tich', label: 'Di tích' },
                        { id: 'canh-quan', label: 'Cảnh quan' },
                        { id: 'chua', label: 'Chùa' },
                      ] as const).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setIdeasFilter(item.id);
                            setShowIdeasFilterMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-medium flex items-center justify-between cursor-pointer text-gray-800"
                        >
                          <span>{item.label}</span>
                          {ideasFilter === item.id && <Check size={13} className="text-black font-bold" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Menu ba chấm ... bên phải (Chuẩn Mindtrip Ảnh 3: Remove all ideas) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowIdeasMoreMenu(!showIdeasMoreMenu);
                      setShowIdeasLocationMenu(false);
                      setShowIdeasFilterMenu(false);
                    }}
                    className={plannerStyles.icon}
                    title="Tùy chọn kho Ý tưởng"
                  >
                    <MoreHorizontal size={15} />
                  </button>

                  {showIdeasMoreMenu && (
                    <div
                      className="absolute right-0 top-9 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 p-1.5 z-50 text-xs animate-fadeIn"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Bạn có chắc chắn muốn xóa tất cả địa điểm trong Ý tưởng?')) {
                            setTripIdeas([]);
                            if (onUpdateTrip) onUpdateTrip({ ...trip, ideas: [] });
                          }
                          setShowIdeasMoreMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 font-medium flex items-center gap-2 cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>Xóa tất cả ý tưởng</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {expandIdeas && (
              <div className="space-y-2">
                {filteredIdeaPois.length === 0 ? (
                  <div className="min-h-[72px] px-4 py-3 rounded-2xl border border-dashed border-neutral-200 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-gray-600">
                      {ideaPois.length === 0
                        ? 'Chưa có địa điểm nào trong Ý tưởng.'
                        : 'Không có địa điểm phù hợp với bộ lọc.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDayAddModal(null);
                        setModalTab('search');
                        setShowAddIdeasModal(true);
                      }}
                      className="px-3 py-1.5 rounded-full bg-black text-white text-xs font-bold hover:bg-neutral-800 transition cursor-pointer"
                    >
                      + Khám phá thêm
                    </button>
                  </div>
                ) : (
                  /* Kho Ý tưởng chung; các menu dùng portal để không bị vùng cuộn cắt */
                  <div className="relative group/carousel">
                    <div
                      ref={ideasCarouselRef}
                      className="flex gap-2.5 overflow-x-auto pb-2 pt-1 no-scrollbar -mx-1 px-1 scroll-smooth"
                    >
                      {filteredIdeaPois.map((poi) => {
                        const isSkeleton = Boolean((poi as any)._isLoading || isRawIdentifier(poi.name));
                        if (isSkeleton) {
                          return (
                            <div
                              key={poi.id}
                              className="relative h-[156px] w-[164px] sm:h-[168px] sm:w-[176px] shrink-0 rounded-2xl bg-neutral-100 overflow-hidden animate-pulse select-none border border-neutral-200/60"
                              aria-label="Đang tải thông tin địa điểm..."
                            >
                              <div className="absolute inset-0 bg-gradient-to-br from-neutral-200 via-neutral-100 to-neutral-200" />
                              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/75 via-black/25 to-transparent pointer-events-none">
                                <div className="h-4 w-3/4 rounded-md bg-white/60 mb-2 animate-pulse" />
                                <div className="h-3 w-1/3 rounded-md bg-white/40 animate-pulse" />
                              </div>
                            </div>
                          );
                        }

                        const isMenuOpen = activeIdeaMenuPoiId === poi.id;
                        const isSaved = savedIds.has(String(poi.id)) || savedIds.has(poi.name);
                        const isSavePending = pendingIds.has(String(poi.id));

                        return (
                          <div
                            key={poi.id}
                            className="group/idea relative h-[156px] w-[164px] sm:h-[168px] sm:w-[176px] shrink-0 rounded-2xl bg-neutral-100 select-none"
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedMapPoiId(poi.id)}
                              className="absolute inset-0 rounded-2xl overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                              aria-label={`Xem ${poi.name} trên bản đồ`}
                            >
                              <img src={getPoiImage(poi)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover/idea:scale-105" />
                              <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/10" />
                              <span className="absolute inset-x-0 bottom-0 p-3 text-white">
                                <span className={`${plannerStyles.itemTitle} !text-white line-clamp-2`} title={poi.name}>{poi.name}</span>
                                <span className="mt-1.5 flex items-center gap-1.5 text-[12px] leading-4 text-white/90">{getCategoryIcon(poi.category)} {formatCategoryLabel(poi.category)}</span>
                              </span>
                            </button>
                            <button type="button" aria-pressed={isSaved} disabled={isSavePending}
                              aria-label={`${isSaved ? 'Bỏ lưu' : 'Lưu'} ${poi.name}`}
                              onClick={(event) => { event.stopPropagation(); void toggleSaved(String(poi.id), poi); }}
                              className="absolute right-12 top-2 flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50">
                              <Heart size={25} strokeWidth={1.8} className={isSaved ? 'fill-red-500 text-white' : 'fill-black/10'} />
                            </button>
                            <button
                              id={`idea-menu-${poi.id}`}
                              type="button"
                              aria-expanded={isMenuOpen}
                              onClick={(event) => {
                                event.stopPropagation();
                                setActiveIdeaAddDayPoiId(null);
                                setActiveIdeaMenuPoiId(isMenuOpen ? null : poi.id);
                              }}
                              className="absolute top-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-white"
                              title={`Tùy chọn ${poi.name}`}
                            ><MoreHorizontal size={18} /></button>

                            {/* Menu popover khi bấm ... */}
                            {isMenuOpen && (
                              <PlannerPopover anchorId={`idea-menu-${poi.id}`} onClose={() => { setActiveIdeaMenuPoiId(null); setActiveIdeaAddDayPoiId(null); }}>
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
                                        <span className="text-[12px] opacity-70">{d.stops.length} điểm</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <div className="border-t border-gray-100 my-1"></div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void toggleSaved(String(poi.id), poi);
                                    setActiveIdeaMenuPoiId(null);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-medium flex items-center gap-2 cursor-pointer"
                                >
                                  <Heart
                                    size={13}
                                    className={
                                      savedIds.has(String(poi.id)) || savedIds.has(poi.name)
                                        ? 'fill-rose-500 text-rose-500'
                                        : 'text-gray-500'
                                    }
                                  />
                                  <span>
                                    {savedIds.has(String(poi.id)) || savedIds.has(poi.name)
                                      ? 'Bỏ khỏi Đã lưu'
                                      : 'Lưu vào Đã lưu'}
                                  </span>
                                </button>
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
                              </PlannerPopover>
                            )}


                          </div>
                        );
                      })}
                    </div>

                    {canScrollIdeasLeft && (
                      <button type="button" onClick={() => handleScrollIdeas('left')}
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-sm border border-neutral-200 flex items-center justify-center text-neutral-700 hover:text-black z-10 focus-visible:ring-2 focus-visible:ring-black"
                        title="Xem các ý tưởng trước"><ChevronLeft size={14} /></button>
                    )}
                    {canScrollIdeasRight && <button
                      type="button"
                      onClick={() => handleScrollIdeas('right')}
                      className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-sm border border-neutral-200 flex items-center justify-center text-neutral-700 hover:text-black transition-colors z-10 cursor-pointer focus-visible:ring-2 focus-visible:ring-black"
                      title="Xem tiếp các ý tưởng"
                    >
                      <ChevronRight size={14} />
                    </button>}
                  </div>
                )}

                {/* Nút + Thêm ở chân dải Ý tưởng (Chuẩn Ảnh 1) */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDayAddModal(null);
                      setModalTab('search');
                      setShowAddIdeasModal(true);
                    }}
                    className={plannerStyles.pill}
                  >
                    <Plus size={13} />
                    <span>Thêm</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ────────────────────────────────────────────────────────
              3. PHẦN CÁC NGÀY TRONG LỊCH TRÌNH
          ──────────────────────────────────────────────────────── */}
          <section ref={itinerarySectionRef} className="shrink-0 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 shrink-0">
            <div className="flex items-baseline gap-2">
              <h2 className={plannerStyles.sectionTitle}>
                Lịch trình
              </h2>
              <span className={plannerStyles.meta}>
                {plan.days.length} ngày
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Nút gạt Khoảng cách: hạ độ nổi bật khi chưa có tuyến để xem */}
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-gray-600 font-medium">Khoảng cách</span>
                <button
                  type="button"
                  onClick={() => setShowDistances(!showDistances)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    showDistances ? 'bg-black' : 'bg-gray-300'
                  }`}
                  role="switch"
                  aria-label="Hiển thị khoảng cách"
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

              {/* Menu tùy chọn lịch trình */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowItinerarySettingsMenu(!showItinerarySettingsMenu)}
                  className={plannerStyles.icon}
                  title="Tùy chọn lịch trình"
                >
                  <MoreHorizontal size={15} />
                </button>

                {showItinerarySettingsMenu && (
                  <div
                    className="absolute right-0 top-9 w-44 bg-white rounded-2xl shadow-xl border border-gray-100 p-1.5 z-40 text-xs animate-fadeIn"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={handleAddDay} disabled={isLoading || isSaving || loadFailed.current}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-semibold text-gray-900 flex items-center gap-2 cursor-pointer"
                    >
                      <Plus size={14} /> Thêm ngày mới
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
            <div className="space-y-3 pb-8">
              {plan.days.map((day) => {
                const hasStops = day.stops.length > 0;
                const isCollapsed = collapsedDays.has(day.day_number);
                const hasLunchBreak = day.stops.some((s) => s.stop_type === 'rest');

                // Ngày đóng: chiếm đúng 1 hàng 44–48px, gồm chevron, Ngày X và ngày tháng, không nút thêm, không divider
                if (isCollapsed) {
                  return (
                    <div
                      key={day.day_id}
                      onClick={() => toggleDayCollapse(day.day_number)}
                      role="button" tabIndex={0} aria-expanded={!isCollapsed}
                      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggleDayCollapse(day.day_number); } }}
                      className="h-11 sm:h-12 flex items-center justify-between px-1 cursor-pointer group select-none hover:bg-gray-50/70 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                    >
                      <div className="flex items-baseline gap-2">
                        <div className="flex items-center gap-2">
                          <ChevronRight size={16} className="text-gray-400 group-hover:text-black transition" />
                          <h3 className={plannerStyles.dayTitle}>
                            Ngày {day.day_number}
                          </h3>
                        </div>
                        {(day.date || trip.startDate) && (
                          <span className={plannerStyles.meta}>
                            {displayDateVi(day.date, trip.startDate, day.day_number)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[13px] text-gray-400 font-normal">
                          {day.stops.length > 0 ? `${day.stops.length} điểm` : ''}
                        </span>
                      </div>
                    </div>
                  );
                }

                // Ngày mở:
                return (
                  <div key={day.day_id} className="pb-4">
                    {/* Header Ngày mở */}
                    <div
                      onClick={() => toggleDayCollapse(day.day_number)}
                      role="button" tabIndex={0} aria-expanded={!isCollapsed}
                      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggleDayCollapse(day.day_number); } }}
                      className="h-11 sm:h-12 flex items-center justify-between px-1 cursor-pointer group select-none hover:bg-gray-50/70 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                    >
                      <div className="flex items-baseline gap-2">
                        <div className="flex items-center gap-2">
                          <ChevronDown size={16} className="text-gray-500 group-hover:text-black transition" />
                          <h3 className={plannerStyles.dayTitle}>
                            Ngày {day.day_number}
                          </h3>
                        </div>
                        {(day.date || trip.startDate) && (
                          <span className={plannerStyles.meta}>
                            {displayDateVi(day.date, trip.startDate, day.day_number)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[13px] text-gray-400 font-normal">
                          {day.stops.length > 0 ? `${day.stops.length} điểm` : ''}
                        </span>
                        {plan.days.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (day.stops.length === 0 || window.confirm(`Bạn có chắc muốn xóa Ngày ${day.day_number}? Các địa điểm trong ngày này vẫn được lưu trong kho Ý tưởng.`)) {
                                handleDeleteDay(day.day_number);
                              }
                            }}
                            className="w-7 h-7 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition cursor-pointer opacity-0 group-hover:opacity-100"
                            disabled={isLoading || isSaving || loadFailed.current}
                            title={`Xóa Ngày ${day.day_number}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Nội dung ngày khi mở rộng */}
                    <div className="mt-2 space-y-2 pl-0 sm:pl-5">
                      {!hasStops ? (
                        /* Trạng thái chưa có điểm: Dòng Chưa có hoạt động + nút Thêm địa điểm */
                        <div className="py-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveDayAddModal(day.day_number);
                              setModalTab(ideaPois.length > 0 ? 'ideas' : 'search');
                              setModalCategory('for-you');
                              setModalSearch('');
                              setShowAddIdeasModal(true);
                            }}
                            className={plannerStyles.pill}
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
                                  {/* Thẻ lịch trình trong ngày */}
                                  <div
                                    onMouseEnter={() => setHoveredStopId(stop.poi_id || stop.stop_id)}
                                    onMouseLeave={() => setHoveredStopId(null)}
                                    className={`min-h-[88px] rounded-2xl border border-neutral-200 p-2.5 flex items-start gap-3 transition-colors relative group ${
                                      isRest ? 'bg-neutral-50' : 'bg-white hover:border-neutral-300'
                                    }`}
                                  >
                                    {/* Ảnh 64px dùng chung tỷ lệ với danh sách Ý tưởng */}
                                    {isRest ? (
                                      <div className="w-16 h-16 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-600 shrink-0">
                                        <Coffee size={28} />
                                      </div>
                                    ) : (
                                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
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
                                        <div className="flex items-start gap-1.5 mb-1">
                                          <span className="mt-1 text-neutral-600" aria-hidden="true">{getCategoryIcon(stop.category)}</span>
                                          <h4 className={`${plannerStyles.itemTitle} line-clamp-2`} title={stop.title}>
                                            {stop.title}
                                          </h4>
                                        </div>

                                        {/* Giờ tham quan */}
                                        {isEditingTime ? (
                                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                            <input
                                              type="time"
                                              aria-label="Giờ bắt đầu"
                                              value={editStartTime}
                                              onChange={(e) => setEditStartTime(e.target.value)}
                                              className="text-xs border border-gray-300 rounded px-1.5 py-0.5"
                                            />
                                            <span>–</span>
                                            <input
                                              type="time"
                                              aria-label="Giờ kết thúc"
                                              value={editEndTime}
                                              onChange={(e) => setEditEndTime(e.target.value)}
                                              className="text-xs border border-gray-300 rounded px-1.5 py-0.5"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleSaveEditTime(day.day_number, stop.stop_id)}
                                              className="text-[12px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded cursor-pointer"
                                            >
                                              Lưu
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setEditingStopId(null)}
                                              className="text-[12px] text-gray-500 cursor-pointer"
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
                                              {stop.start_time && stop.end_time ? `${stop.start_time} – ${stop.end_time}` : 'Chưa xếp giờ'}
                                            </span>
                                            <Pencil size={10} className="text-gray-300 group-hover/time:text-gray-600 ml-0.5 opacity-0 group-hover/time:opacity-100" />
                                          </button>
                                        )}

                                        <p className="text-[12px] leading-4 text-neutral-600 mt-1 truncate">
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
                                              className="text-[12px] px-2.5 py-1 rounded-lg text-gray-600 hover:bg-gray-100 cursor-pointer"
                                            >
                                              Hủy
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleSaveNote(day.day_number, stop.stop_id)}
                                              className="text-[12px] px-3 py-1 rounded-lg bg-black text-white font-bold cursor-pointer"
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
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMenuStopId(isMenuOpen ? null : stop.stop_id);
                                        }}
                                        id={`stop-menu-${stop.stop_id}`} aria-expanded={isMenuOpen}
                                        className={plannerStyles.icon}
                                        title="Tùy chọn khác"
                                      >
                                        <MoreHorizontal size={14} />
                                      </button>

                                      {isMenuOpen && (
                                        <PlannerPopover anchorId={`stop-menu-${stop.stop_id}`} onClose={() => setActiveMenuStopId(null)}>
                                      <button
                                        type="button"
                                        disabled={sIdx === 0}
                                        onClick={() => handleMoveStop(day.day_number, sIdx, 'up')}
                                        className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                        title="Lên trên"
                                      >
                                        <ArrowUp size={14} /> Lên trên
                                      </button>
                                      <button
                                        type="button"
                                        disabled={sIdx === day.stops.length - 1}
                                        onClick={() => handleMoveStop(day.day_number, sIdx, 'down')}
                                        className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                        title="Xuống dưới"
                                      >
                                        <ArrowDown size={14} /> Xuống dưới
                                      </button>

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
                                          <div className="px-3 py-1 text-[12px] font-bold text-gray-400 uppercase">
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
                                        </PlannerPopover>
                                      )}
                                    </div>
                                  </div>

                                  {/* Dòng khoảng cách giữa 2 thẻ */}
                                  {showDistances && transitDistKm !== null && (
                                    <div className="h-8 ml-[42px] pl-5 border-l border-neutral-200 flex items-center gap-2 text-[12px] text-neutral-600 font-normal">
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
                                        className="text-neutral-600 hover:text-black hover:underline flex items-center gap-1 font-medium ml-1"
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
                            <div className="pt-2 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDayAddModal(day.day_number);
                                  setModalTab(ideaPois.length > 0 ? 'ideas' : 'search');
                                  setModalCategory('for-you');
                                  setModalSearch('');
                                  setShowAddIdeasModal(true);
                                }}
                                className={plannerStyles.pill}
                              >
                                <Plus size={13} />
                                <span>Thêm</span>
                              </button>

                              {!hasLunchBreak && (
                                <button
                                  type="button"
                                  onClick={() => handleAddLunchBreak(day.day_number)}
                                  className={plannerStyles.pill}
                                >
                                  <Coffee size={14} className="text-neutral-600" />
                                  <span>+ Nghỉ trưa (12:00 – 13:30)</span>
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                  </div>
                );
              })}

              {/* Nút thêm ngày mới ở cuối danh sách ngày */}
              <div className="pt-2 flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleAddDay} disabled={isLoading || isSaving || loadFailed.current}
                  className="inline-flex items-center gap-2 h-9 px-5 rounded-full border border-dashed border-gray-300 hover:border-black bg-gray-50/70 hover:bg-gray-100 text-xs font-bold text-gray-800 transition cursor-pointer active:scale-95 shadow-2xs"
                >
                  <Plus size={14} />
                  <span>+ Thêm Ngày {plan.days.length + 1}</span>
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* ════════════════════════════════════════════════════════
            CỘT PHẢI: BẢN ĐỒ LỘ TRÌNH ĐỒNG BỘ (CHỈ HIỆN KHI KHÔNG PHẢI DRAWER MODE)
        ════════════════════════════════════════════════════════ */}
        {!isDrawerMode && showMap && (
          <section 
            className={plannerStyles.map}
            data-purpose="right-panel-container"
          >
            <div className={plannerStyles.mapSurface}>
              {/* Bộ chọn xem đường đi theo ngày dạng Dropdown dọc (Chuẩn yêu cầu: "thay cái dãy ngày, thành kiểu xem đường đi của ngày, khi mở thì sẽ hiện hàng dọc ngày nào ngày nào") */}
              <div className="absolute top-3.5 left-1/2 -translate-x-1/2 z-[400] flex flex-col items-center max-w-[calc(100%-120px)]">
                <button
                  type="button"
                  onClick={() => setShowDayFilterDropdown((prev) => !prev)}
                  className="flex min-h-10 max-w-full items-center gap-2 px-3 rounded-full bg-white text-neutral-900 font-medium text-[12px] shadow-sm border border-neutral-200 transition-colors cursor-pointer group focus-visible:ring-2 focus-visible:ring-black"
                  title="Bấm để chọn xem đường đi theo từng ngày"
                >
                  <MapIcon size={15} className="text-neutral-600 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {mapDayFilter === 'all' ? 'Đường đi: Tất cả các ngày' : `Đường đi: Ngày ${mapDayFilter}`}
                  </span>
                  <ChevronDown size={13} className={`text-gray-400 group-hover:text-black transition-transform duration-200 ${showDayFilterDropdown ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown danh sách hàng dọc các ngày */}
                {showDayFilterDropdown && (
                  <div 
                    className="mt-2 w-[220px] max-h-[340px] overflow-y-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-200/90 p-1.5 space-y-1 z-[500] auto-hide-scrollbar animate-fadeIn"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMapDayFilter('all');
                        setShowDayFilterDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-left ${
                        mapDayFilter === 'all'
                          ? 'bg-black text-white shadow-xs'
                          : 'text-gray-700 hover:text-black hover:bg-gray-100/80'
                      }`}
                    >
                      <span>Tất cả các ngày</span>
                      <span className={`text-[12px] px-1.5 py-0.2 rounded-full ${
                        mapDayFilter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                      }`}>
                        Toàn bộ
                      </span>
                    </button>

                    <div className="h-px bg-gray-100 my-1"></div>

                    {plan.days.map((day) => {
                      const isSelected = mapDayFilter === day.day_number;
                      return (
                        <button
                          key={day.day_number}
                          type="button"
                          onClick={() => {
                            setMapDayFilter(day.day_number);
                            setShowDayFilterDropdown(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-left ${
                            isSelected
                              ? 'bg-black text-white shadow-xs'
                              : 'text-gray-700 hover:text-black hover:bg-gray-100/80'
                          }`}
                        >
                          <span className="truncate">
                            Ngày {day.day_number}
                            {day.stops.length > 0 && (
                              <span className="font-normal opacity-70 ml-1 text-[12px]">
                                ({day.stops.length} điểm)
                              </span>
                            )}
                          </span>
                          {day.stops.length > 0 && (
                            <span className={`text-[12px] px-1.5 py-0.2 rounded-full shrink-0 ml-1.5 ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                            }`}>
                              {day.stops.length}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bản đồ Leaflet sạch sẽ */}
              <div className="w-full h-full relative">
                <PoiMap
              clipByParent
                  pois={mapPois.length > 0 ? mapPois : (allPois || []).slice(0, 10)}
                  selectedPoiId={selectedMapPoiId}
                  hoveredPoiId={hoveredStopId}
                  onSelectPoi={(id) => setSelectedMapPoiId(id)}
                  onHoverPoi={(id) => setHoveredStopId(id)}
                  showMapLoader={false}
                  isExpanded={isMapExpanded}
                  onToggleExpand={() => {
                    setIsMapExpanded((prev) => !prev);
                    setTimeout(() => {
                      window.dispatchEvent(new Event('resize'));
                    }, 200);
                  }}
                  favorites={savedIds}
                  pendingFavorites={pendingIds}
                  onToggleFavorite={(_id, p) => { if (p) openCollectionPicker(p); }}
                  addedTrips={new Set(tripIdeas)}
                  onToggleAddTrip={(id) => handleToggleIdeaInTrip(id)}
                  routeCoordinates={routeCoordinates}
                  numberedOrderMap={numberedOrderMap}
                  routeDurationText={routeDurationText}
                />
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ─── MODAL TÌM KIẾM & THÊM VÀO CHUYẾN ĐI (CHUẨN 1:1 TRIPOVERVIEWVIEW & MINDTRIP) ─── */}
      {showAddIdeasModal && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-xs py-6 px-4 animate-fadeIn"
          onClick={() => {
            setShowAddIdeasModal(false);
            setActiveDayAddModal(null);
          }}
        >
          <div
            className="relative bg-white w-[750px] max-w-[calc(100vw-32px)] h-[calc(100vh-80px)] max-h-[820px] rounded-[24px] shadow-2xl flex flex-col border border-gray-100 overflow-hidden z-[1010]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Phần cố định: Tiêu đề + tab (có đường kẻ ngang dưới #eee, cao ~72px) */}
            <div className="relative h-[72px] shrink-0 border-b border-gray-200 bg-white rounded-t-[24px] flex flex-col justify-between">
              {/* Nút đóng × */}
              <button
                type="button"
                onClick={() => {
                  setShowAddIdeasModal(false);
                  setActiveDayAddModal(null);
                }}
                className="absolute top-3.5 left-4 w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition cursor-pointer z-20"
                title="Đóng"
              >
                <X size={17} />
              </button>

              {/* Tiêu đề căn giữa */}
              <div className="pt-3 text-center">
                <h3 className="font-bold text-[15px] text-gray-950">
                  {activeDayAddModal ? `Thêm vào Ngày ${activeDayAddModal}` : 'Thêm vào chuyến đi'}
                </h3>
              </div>

              {/* Tabs: Tìm kiếm, (Từ Ý tưởng nếu có), Đã thích, Tùy chỉnh */}
              <div className="px-6 flex items-center gap-6 text-[13.5px]">
                <button
                  type="button"
                  onClick={() => setModalTab('search')}
                  className={`pb-2.5 border-b-2 transition font-semibold cursor-pointer -mb-[1px] ${
                    modalTab === 'search'
                      ? 'border-black text-black font-bold'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Tìm kiếm
                </button>
                {activeDayAddModal !== null && (
                  <button
                    type="button"
                    onClick={() => setModalTab('ideas')}
                    className={`pb-2.5 border-b-2 transition font-semibold cursor-pointer flex items-center gap-1.5 -mb-[1px] ${
                      modalTab === 'ideas'
                        ? 'border-black text-black font-bold'
                        : 'border-transparent text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <span>Từ Ý tưởng ({ideaPois.length})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setModalTab('saved')}
                  className={`pb-2.5 border-b-2 transition font-semibold cursor-pointer flex items-center gap-1.5 -mb-[1px] ${
                    modalTab === 'saved'
                      ? 'border-black text-black font-bold'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <Heart size={14} className={modalTab === 'saved' ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
                  <span>Đã thích</span>
                  {savedCount > 0 ? (
                    <span className="w-4.5 h-4.5 rounded-full bg-red-500 text-white text-[12px] font-bold flex items-center justify-center">
                      {savedCount}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('custom')}
                  className={`pb-2.5 border-b-2 transition font-semibold cursor-pointer -mb-[1px] ${
                    modalTab === 'custom'
                      ? 'border-black text-black font-bold'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Tùy chỉnh
                </button>
              </div>
            </div>

            {/* Vùng cuộn: Tên khu vực → Tìm kiếm → Lọc → Lưới thẻ */}
            <div className="flex-1 overflow-y-auto px-6 pb-10 [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-track]:bg-transparent">
              {modalTab !== 'custom' ? (
                <>
                  {/* Tên khu vực */}
                  <div className="pt-4 shrink-0">
                    <div className="relative inline-block">
                      <div
                        onClick={() => setShowModalCityDropdown((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 cursor-pointer select-none group"
                      >
                        <h2 className={`${plannerStyles.modalTitle} group-hover:text-black`}>
                          {modalCity === 'all' ? 'Đà Nẵng & Huế' : modalCity}
                        </h2>
                        <ChevronDown size={18} className="text-gray-950 group-hover:translate-y-0.5 transition-transform" />
                      </div>

                      {showModalCityDropdown && (
                        <div className="absolute top-10 left-0 bg-white shadow-xl border border-gray-100 rounded-xl py-1.5 w-48 z-50 animate-fadeIn">
                          <button
                            type="button"
                            onClick={() => {
                              setModalCity('all');
                              setShowModalCityDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-[13.5px] hover:bg-gray-50 flex items-center justify-between cursor-pointer ${
                              modalCity === 'all' ? 'font-bold text-black' : 'text-gray-700'
                            }`}
                          >
                            <span>Tất cả khu vực (Đà Nẵng & Huế)</span>
                            {modalCity === 'all' && <Check size={14} className="font-bold" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalCity('Đà Nẵng');
                              setShowModalCityDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-[13.5px] hover:bg-gray-50 flex items-center justify-between cursor-pointer ${
                              modalCity === 'Đà Nẵng' ? 'font-bold text-black' : 'text-gray-700'
                            }`}
                          >
                            <span>Đà Nẵng</span>
                            {modalCity === 'Đà Nẵng' && <Check size={14} className="font-bold" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalCity('Huế');
                              setShowModalCityDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-[13.5px] hover:bg-gray-50 flex items-center justify-between cursor-pointer ${
                              modalCity === 'Huế' ? 'font-bold text-black' : 'text-gray-700'
                            }`}
                          >
                            <span>Huế</span>
                            {modalCity === 'Huế' && <Check size={14} className="font-bold" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ô tìm kiếm & Nút bộ lọc */}
                  <div className="mt-3 flex items-center gap-2.5 shrink-0">
                    <div className="flex-1 relative flex items-center min-w-0">
                      <Search size={16} className="text-gray-400 absolute left-4 pointer-events-none" />
                      <input
                        type="text"
                        value={modalSearch}
                        onChange={(e) => setModalSearch(e.target.value)}
                        placeholder="Tìm kiếm địa điểm, di tích, ẩm thực..."
                        className="w-full h-[42px] pl-10 pr-9 bg-white text-[13.5px] placeholder-gray-400 text-gray-900 rounded-full border border-gray-300 focus:border-black focus:outline-none shadow-2xs transition"
                      />
                      {modalSearch && (
                        <button
                          type="button"
                          onClick={() => setModalSearch('')}
                          className="absolute right-3.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setModalCategory('for-you');
                        setModalSearch('');
                        setModalCity('all');
                      }}
                      className="h-[42px] px-4 rounded-full border border-gray-300 hover:border-black hover:bg-gray-50 text-[13px] font-medium text-gray-800 transition cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs"
                    >
                      <SlidersHorizontal size={15} />
                      <span>Bộ lọc</span>
                    </button>
                  </div>

                  {/* Hàng danh mục tabs (6 danh mục chuẩn) */}
                  <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar shrink-0">
                    {MODAL_CATEGORY_TABS.map((tab) => {
                      const isActive = modalCategory === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setModalCategory(tab.id)}
                          className={`whitespace-nowrap h-[32px] px-3.5 text-[12.5px] rounded-full transition-all cursor-pointer shrink-0 flex items-center justify-center ${
                            isActive
                              ? 'bg-black text-white font-medium shadow-xs'
                              : 'text-gray-700 hover:text-black hover:bg-gray-100 font-medium'
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tiêu đề nhóm */}
                  <div className="mt-4 shrink-0">
                    <h4 className="font-bold text-[16px] text-gray-950 tracking-tight">
                      {modalTab === 'ideas'
                        ? `Ý tưởng trong chuyến đi (${ideaPois.length})`
                        : modalTab === 'saved'
                        ? 'Địa điểm đã thích ở trang Khám phá'
                        : modalCategory === 'quan-an' || modalCategory === 'restaurants'
                        ? 'Ẩm thực & Cafe'
                        : modalCategory === 'di-tich' || modalCategory === 'experiences'
                        ? 'Trải nghiệm'
                        : modalCategory === 'canh-quan' || modalCategory === 'scenic'
                        ? 'Địa điểm'
                        : modalCategory === 'chua'
                        ? 'Tâm linh'
                        : modalCategory === 'all'
                        ? 'Tất cả địa điểm'
                        : 'Trải nghiệm đề xuất'}
                    </h4>
                  </div>

                  {/* Lưới thẻ 3 cột chuẩn 1:1 TripOverviewView & Mindtrip */}
                  <div className="mt-3 grid grid-cols-3 gap-x-3.5 gap-y-5">
                    {modalFilteredPois.length === 0 ? (
                      <div className="col-span-full py-16 text-center text-gray-500 text-sm">
                        {modalTab === 'ideas'
                          ? 'Kho Ý tưởng hiện chưa có địa điểm nào phù hợp với bộ lọc.'
                          : modalTab === 'saved'
                          ? savedCount === 0
                            ? 'Bạn chưa thích địa điểm nào ở trang Khám phá. Hãy bấm thả tim ❤️ tại trang Explore để chọn nhanh vào Ý tưởng tại đây!'
                            : 'Không tìm thấy địa điểm đã thích nào phù hợp với bộ lọc hiện tại.'
                          : 'Không tìm thấy địa điểm phù hợp với bộ lọc hiện tại.'}
                      </div>
                    ) : (
                      modalFilteredPois.map((poi) => {
                        const isAddedToCurrentDay = activeDayAddModal !== null
                          ? plan.days.find((d) => d.day_number === activeDayAddModal)?.stops.some((s) => s.poi_id === poi.id)
                          : false;
                        const isAddedToIdeas = tripIdeas.includes(poi.id);
                        const isAdded = activeDayAddModal !== null ? isAddedToCurrentDay : isAddedToIdeas;
                        const ratingVal = (typeof poi.rating === 'number' ? poi.rating : Number(poi.rating || 4.5)).toFixed(1);

                        return (
                          <div
                            key={poi.id}
                            onClick={() => {
                              setSelectedMapPoiId(poi.id);
                              setShowAddIdeasModal(false);
                              setActiveDayAddModal(null);
                            }}
                            className="flex flex-col group cursor-pointer text-left select-none"
                          >
                            {/* Ảnh thẻ tỉ lệ 1.05 : 1, bo góc 16px */}
                            <div className="relative aspect-[1.05/1] w-full rounded-[16px] overflow-hidden bg-gray-100 shadow-2xs">
                              <img
                                src={getPoiImage(poi)}
                                alt={poi.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                onError={(e) => {
                                  e.currentTarget.src = 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80';
                                }}
                              />

                              {/* Nút “+ Thêm” trên thẻ */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (activeDayAddModal !== null) {
                                    handleAddIdeaToDay(activeDayAddModal, poi);
                                  } else {
                                    handleToggleIdeaInTrip(poi.id);
                                  }
                                }}
                                className={`absolute top-2.5 right-2.5 h-[28px] px-2.5 rounded-full font-semibold text-[12px] transition shadow-xs cursor-pointer active:scale-95 flex items-center justify-center gap-1 z-10 ${
                                  isAdded
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'bg-white text-gray-900 hover:bg-black hover:text-white'
                                }`}
                              >
                                {isAdded ? (
                                  <>
                                    <Check size={13} strokeWidth={2.5} />
                                    <span>Đã thêm</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus size={13} strokeWidth={2.5} />
                                    <span>Thêm</span>
                                  </>
                                )}
                              </button>

                              {/* 5 chấm phân trang dưới đáy ảnh chuẩn Mindtrip */}
                              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none z-10">
                                <span className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
                                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                              </div>

                              {/* Icon ⓘ ở góc dưới bên phải */}
                              <div className="absolute bottom-2.5 right-2.5 pointer-events-none z-10 text-white/90 drop-shadow-xs">
                                <Info size={13} />
                              </div>
                            </div>

                            {/* Dưới ảnh thẻ */}
                            <div className="mt-2 flex items-baseline justify-between gap-1.5 min-w-0">
                              <h4 className="font-bold text-[13px] text-gray-950 truncate leading-snug group-hover:text-black" title={poi.name}>
                                {poi.name}
                              </h4>
                              {Number(poi.rating) > 0 && (
                                <span className="text-[12px] font-bold text-gray-950 shrink-0 flex items-center gap-0.5">
                                  <Star size={11} className="fill-black text-black" />
                                  <span>{ratingVal}</span>
                                </span>
                              )}
                            </div>

                            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-gray-500 font-normal">
                              <MapPin size={11} className="text-gray-400 shrink-0" />
                              <span className="truncate">
                                {(() => {
                                  const isCafe = Boolean(
                                    poi.sub_category?.includes('cafe') || 
                                    poi.sub_category?.includes('coffee') || 
                                    /coffee|cafe|cà phê|tiệm trà|workspace/i.test(poi.name)
                                  );
                                  if (isCafe) return '☕ Quán cà phê';
                                  if (poi.category === 'quan-an') return '🍽️ Ẩm thực';
                                  if (poi.category === 'di-tich') return '🏛️ Di tích lịch sử';
                                  if (poi.category === 'canh-quan') return '🌿 Cảnh quan & Thắng cảnh';
                                  return '⛩️ Chùa & Tâm linh';
                                })()}
                              </span>
                            </div>

                            <div className="mt-0.5 text-[12px] text-gray-400 font-normal truncate">
                              {poi.address || `${poi.city}, Việt Nam`}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                /* Tab Tùy chỉnh (Custom) */
                <div className="pt-4 flex flex-col space-y-4 max-w-lg">
                  <p className="text-[13.5px] text-gray-700 leading-relaxed">
                    Bạn có một địa điểm riêng muốn lưu vào chuyến đi này? Nhập tên bên dưới để thêm ngay vào Ý tưởng:
                  </p>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={customIdeaInput}
                      onChange={(e) => setCustomIdeaInput(e.target.value)}
                      placeholder="Ví dụ: Quán cà phê Yên, Tiệm bánh mì..."
                      className="w-full h-[42px] px-4 rounded-xl border border-gray-300 focus:border-black focus:outline-none text-[13.5px] shadow-2xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customIdeaInput.trim()) {
                          handleAddCustomIdea();
                        }
                      }}
                    />
                    <div className="flex justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomIdeaInput('');
                          setShowAddIdeasModal(false);
                          setActiveDayAddModal(null);
                        }}
                        className="h-[38px] px-5 rounded-full border border-gray-200 text-gray-600 text-[13px] font-medium hover:bg-gray-50 transition cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleAddCustomIdea}
                        className="h-[38px] px-6 rounded-full bg-black text-white font-bold text-[13px] hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-2xs"
                      >
                        {activeDayAddModal ? `+ Thêm vào Ngày ${activeDayAddModal}` : '+ Thêm vào ý tưởng'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {assistantOpen && <aside className="fixed inset-y-0 right-0 z-[60] flex w-full flex-col overflow-hidden border-l border-neutral-200 bg-white shadow-xl sm:w-[540px]" aria-label="Trợ lý lên lịch">
        <button type="button" className="min-h-11 shrink-0 self-end px-4 text-sm underline" onClick={()=>setAssistantOpen(false)}>Đóng</button>
        <TravelAssistant mode="planner" trip={trip} ideaIds={tripIdeas}
          onCreatePrivateTrip={onCreatePrivateTrip ? ()=>onCreatePrivateTrip(tripIdeas) : undefined}
          onIdeasChange={(ids,revision)=>{setTripIdeas(ids);onUpdateTrip?.({...trip,ideas:ids,workspaceRevision:revision ?? trip.workspaceRevision});}}
          onBudgetChange={budget=>onUpdateTrip?.({...trip,totalBudget:budget})}
          onApplied={()=>setAssistantRefresh(value=>value+1)}/>
      </aside>}
    </div>
  );
}

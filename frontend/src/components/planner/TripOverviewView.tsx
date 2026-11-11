// TripOverviewView - Updated with Ideas & 2-Stage PB09 Recommendations
import React, { useState, useMemo, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Lightbulb, 
  Calendar as CalendarIcon, 
  MapPin, 
  Info,
  Heart, 

  Plus, 
  Minus,
  Send, 
  Car, 
  Mic, 
  X,
  Compass,
  Check,
  Search,
  SlidersHorizontal,
  Trash2,
  Star,
  ChevronDown,
  MessageSquare,
  ArrowRight,
  Building2,
  Circle,
  CheckCircle2,
  MoreVertical,
  ExternalLink,
} from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import PlannerCopilotDrawer from './PlannerCopilotDrawer';
import { buildDefaultMindtripItinerary } from './CreateTripCopilotModal';
import type { CopilotDayOutline, CopilotStop } from './copilotTripData';
import type { CopilotSuggestedPoi } from '@/services/copilotService';
import { 
  pois as defaultAllPois, 
  normalizePois, 
  normalizeCategory, 
  normalizeCity, 
  getDeterministicImage,
  type Poi,
  type PoiCity
} from '@/data/pois';
import { getPois, getPoisByIds } from '@/services/poi';
import { fetchJson } from '@/lib/api';
import PoiMap from '@/components/poi/PoiMap';
import PoiCard from '@/components/poi/PoiCard';
import PoiDetailSection from '@/components/poi/PoiDetailSection';
import ExplanationModal from '@/components/poi/ExplanationModal';
import { useSavedPlaces } from '@/context/SavedPlacesContext';

export interface TripOverviewViewProps {
  trip: UserTrip;
  allPois?: Poi[];
  onBack: () => void;
  onOpenItineraryDetails: () => void;
  onUpdateTrip?: (updatedTrip: UserTrip) => void;
}

// Bản đồ thông tin đối sánh nhanh cho các POI phổ biến khi tải bất đồng bộ
const KNOWN_POI_FALLBACKS: Record<string, Partial<Poi>> = {
  '029a28df-b091-49d9-a911-738572c72464': {
    name: 'Nhà Hàng Bếp Cuốn Đà Nẵng',
    category: 'quan-an',
    city: 'Đà Nẵng',
    image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80',
    description: 'Ẩm thực Việt truyền thống chuẩn MICHELIN Bib Gourmand.',
    rating: 4.8,
  },
  'd58fe815-4aa1-45b2-831a-11b97e130918': {
    name: 'Đi Lạc Coffee – Specialty Roastery',
    category: 'quan-an',
    city: 'Đà Nẵng',
    image: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80',
    description: 'Không gian cà phê đặc sản rang xay thủ công.',
    rating: 4.7,
  },
  'bfed964e-ff10-44f4-8654-2136245ab062': {
    name: 'Nhà Thờ Giáo Xứ An Hải',
    category: 'chua',
    city: 'Đà Nẵng',
    image: 'https://images.unsplash.com/photo-1548625361-195972855799?auto=format&fit=crop&w=800&q=80',
    description: 'Công trình kiến trúc tôn giáo và đền thánh lịch sử tại Sơn Trà.',
    rating: 4.6,
  },
};

// 5 lựa chọn ngân sách chuẩn Mindtrip theo ảnh người dùng gửi
const BUDGET_OPTIONS = [
  { id: 'any', label: 'Bất kỳ ngân sách nào', pillLabel: 'Ngân sách' },
  { id: 'budget', label: '$  Với ngân sách hạn chế', pillLabel: '$ Ngân sách hạn chế' },
  { id: 'standard', label: '$$  Giá cả hợp lý', pillLabel: '$$ Giá cả hợp lý' },
  { id: 'upgrade', label: '$$$  Nâng cấp', pillLabel: '$$$ Nâng cấp' },
  { id: 'luxury', label: '$$$$  Sang trọng', pillLabel: '$$$$ Sang trọng' },
];

// Danh mục bộ lọc trong Modal Thêm vào chuyến đi chuẩn Mindtrip theo ảnh
// Danh mục bộ lọc trong Modal chuẩn Explore & Mindtrip
export type ModalCategoryType = 'for-you' | 'experiences' | 'restaurants' | 'scenic' | 'all' | 'di-tich' | 'canh-quan' | 'chua' | 'quan-an';

const MODAL_CATEGORY_TABS: { id: ModalCategoryType; label: string }[] = [
  { id: 'for-you', label: 'Dành cho bạn' },
  { id: 'all', label: 'Tất cả' },
  { id: 'di-tich', label: 'Di tích' },
  { id: 'canh-quan', label: 'Cảnh quan' },
  { id: 'chua', label: 'Chùa' },
  { id: 'quan-an', label: 'Quán ăn' },
];

const MINDTRIP_MODAL_TABS: { id: 'for-you' | 'experiences' | 'restaurants' | 'scenic' | 'all'; label: string }[] = [
  { id: 'for-you', label: 'Dành cho bạn' },
  { id: 'experiences', label: 'Trải nghiệm' },
  { id: 'restaurants', label: 'Quán ăn' },
  { id: 'scenic', label: 'Địa điểm' },
  { id: 'all', label: 'Tất cả' },
];

export interface CategoryBudgets {
  dining: string;
  lodging: string;
  activities: string;
}

type RecommendedPoi = Poi & { matchScore?: number };

export function parseCategoryBudgets(raw?: string): CategoryBudgets {
  const def: CategoryBudgets = { dining: 'any', lodging: 'any', activities: 'any' };
  if (!raw) return def;
  if (raw.includes('dining:') || raw.includes('lodging:') || raw.includes('activities:')) {
    const parts = raw.split(';');
    for (const p of parts) {
      const [k, v] = p.split(':');
      if (k === 'dining') def.dining = v || 'any';
      if (k === 'lodging') def.lodging = v || 'any';
      if (k === 'activities') def.activities = v || 'any';
    }
    return def;
  }
  if (raw === '$' || raw === 'budget') {
    return { dining: '$', lodging: '$', activities: '$' };
  }
  if (raw === '$$$' || raw === 'luxury' || raw === 'upgrade') {
    return { dining: '$$$', lodging: '$$$', activities: '$$$' };
  }
  if (raw === '$$' || raw === 'standard') {
    return { dining: '$$', lodging: '$$', activities: '$$' };
  }
  return def;
}

const DINING_BUDGET_OPTIONS = [
  { id: 'any', label: 'Tất cả', desc: 'Mọi mức giá' },
  { id: '$', label: '$', desc: '< 100k', sub: 'Bình dân / chợ đêm' },
  { id: '$$', label: '$$', desc: '150k – 300k', sub: 'Tiêu chuẩn / nhà hàng' },
  { id: '$$$', label: '$$$', desc: '> 500k', sub: 'Cao cấp / Michelin' },
];

const LODGING_BUDGET_OPTIONS = [
  { id: 'any', label: 'Tất cả', desc: 'Mọi loại phòng' },
  { id: '$', label: '$', desc: '< 400k/đêm', sub: 'Homestay / Hostel' },
  { id: '$$', label: '$$', desc: '500k – 1tr/đêm', sub: 'Khách sạn 3 sao' },
  { id: '$$$', label: '$$$', desc: '> 1.5tr/đêm', sub: 'Resort / 4–5 sao' },
];

const ACTIVITIES_BUDGET_OPTIONS = [
  { id: 'any', label: 'Tất cả', desc: 'Mọi hoạt động' },
  { id: '$', label: '$', desc: '< 100k/vé', sub: 'Miễn phí / vé rẻ' },
  { id: '$$', label: '$$', desc: '150k – 400k/vé', sub: 'Tour / Vé phổ thông' },
  { id: '$$$', label: '$$$', desc: '> 500k/vé', sub: 'Trải nghiệm cao cấp' },
];

export default function TripOverviewView({
  trip,
  allPois: allPoisProp,
  onBack,
  onOpenItineraryDetails,
  onUpdateTrip,
}: TripOverviewViewProps) {
  const { savedIds, pendingIds, openCollectionPicker } = useSavedPlaces();
  const handleOpenSavedCollections = (_poiId: string, poi?: Poi) => {
    if (poi) openCollectionPicker(poi);
  };
  // Bộ dữ liệu POI hoàn chỉnh từ Explore / backend
  const [loadedPois, setLoadedPois] = useState<Poi[]>([]);

  useEffect(() => {
    if (allPoisProp && allPoisProp.length > 0) {
      setLoadedPois(allPoisProp);
      return;
    }
    getPois({ limit: 100 })
      .then((res) => {
        const normalized = normalizePois(res.items);
        if (normalized.length > 0) {
          setLoadedPois(normalized);
        }
      })
      .catch((err) => {
        console.warn('TripOverviewView: fallback static pois:', err);
      });
  }, [allPoisProp]);

  const allPois = useMemo(() => {
    return loadedPois.length > 0 
      ? loadedPois 
      : (allPoisProp && allPoisProp.length > 0 ? allPoisProp : defaultAllPois);
  }, [loadedPois, allPoisProp]);

  // ─── STATE CỦA 4 POPUP ĐIỀU CHỈNH THÔNG SỐ CHUYẾN ĐI ───
  // 1. Popup Ở đâu
  const [showWhereModal, setShowWhereModal] = useState(false);
  const [whereTarget, setWhereTarget] = useState<string>(trip.destination || 'Đà Nẵng');
  const [byCar, setByCar] = useState(false);

  // 2. Popup Khi
  const [showWhenModal, setShowWhenModal] = useState(false);
  const [whenTab, setWhenTab] = useState<'dates' | 'flex'>('dates');
  const [calendarBaseMonth, setCalendarBaseMonth] = useState<Date>(new Date(2026, 10, 1));
  const [rangeStart, setRangeStart] = useState<Date | null>(new Date(2026, 10, 2));
  const [rangeEnd, setRangeEnd] = useState<Date | null>(new Date(2026, 10, 5));
  const [flexibleDays, setFlexibleDays] = useState(trip.daysCount || 4);
  const [selectedMonth, setSelectedMonth] = useState('Tháng 11');

  // 3. Popup Ai (Du khách)
  const [showWhoModal, setShowWhoModal] = useState(false);
  const [adults, setAdults] = useState(trip.peopleCount || 2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [pets, setPets] = useState(0);

  // 4. Popup Ngân sách 3 dòng độc lập (Ăn uống, Lưu trú, Hoạt động)
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudgets>(() => parseCategoryBudgets(trip.budgetTier));

  // Đồng bộ khi trip prop thay đổi
  useEffect(() => {
    setWhereTarget(trip.destination);
    setFlexibleDays(trip.daysCount || 4);
    setCategoryBudgets(parseCategoryBudgets(trip.budgetTier));
    setAdults(trip.peopleCount || 2);
  }, [trip]);

  // Slide pagination cho khối AI Insight (1 trong 2)
  const [currentSlide, setCurrentSlide] = useState(2);
  const totalSlides = 2;

  // Active quick action popover (Thời tiết, Đóng gói, Sân bay, Miễn nhiệm)
  const [activeQuickTip, setActiveQuickTip] = useState<string | null>(null);

  // Chat message state
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([
    {
      sender: 'ai',
      text: `Chào bạn! Tôi đã chuẩn bị xong kế hoạch hành trình ${trip.destination} ${trip.daysCount} ngày. Bạn cần hỏi thêm về ăn uống, đi lại hay điều chỉnh hoạt động nào không?`,
    },
  ]);

  // Tab con kích hoạt khi bấm vào Ý tưởng hoặc Lịch
  const [activeRightDrawer, setActiveRightDrawer] = useState<'ideas' | 'calendar' | null>(null);
  const [isCopilotDrawerOpen, setIsCopilotDrawerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // ─── DANH SÁCH Ý TƯỞNG (IDEAS / WISHLIST) CỦA CHUYẾN ĐI ───
  const [tripIdeas, setTripIdeas] = useState<string[]>(() => trip.ideas || []);
  const [tripSavedPlaces, setTripSavedPlaces] = useState<string[]>(() => trip.savedPlaces || []);

  // ─── STATE CHO GỢI Ý ĐỊA ĐIỂM (TOP 10 TỐI ƯU THEO BACKEND PB09) ───
  const [recommendedPois, setRecommendedPois] = useState<RecommendedPoi[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [recommendationTitle, setRecommendationTitle] = useState('Gợi ý cho bạn');
  const [recommendationSubtitle, setRecommendationSubtitle] = useState('Theo gu và hành trình của bạn.');
  const [explanationPoi, setExplanationPoi] = useState<{ id: string; name: string; snippet?: string } | null>(null);

  // State điều khiển hiển thị panel Ý tưởng ở cột phải (thay thế 4 ô + bản đồ)
  const [showIdeasView, setShowIdeasView] = useState(false);

  // State điều khiển Modal "Thêm vào chuyến đi" (Add to trip)
  const [showAddIdeasModal, setShowAddIdeasModal] = useState(false);
  const [modalTab, setModalTab] = useState<'search' | 'saved' | 'custom'>('search');
  const [showModalCityDropdown, setShowModalCityDropdown] = useState(false);
  const [modalCity, setModalCity] = useState<'all' | 'Đà Nẵng' | 'Huế'>('all');
  const [modalSearch, setModalSearch] = useState('');
  const [modalCategory, setModalCategory] = useState<ModalCategoryType>('for-you');
  const [customIdeaInput, setCustomIdeaInput] = useState('');

  const selectedBudgetTier = trip.budgetTier || 'standard';

  // State bản đồ & chọn POI chi tiết
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);
  const [hoveredMapPoiId, setHoveredMapPoiId] = useState<string | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  // Che do hien thi cot phai: 'itinerary' (Lich trinh) hoac 'map' (Ban do)
  const [rightViewMode, setRightViewMode] = useState<'itinerary' | 'map'>('itinerary');
  const [showDistances, setShowDistances] = useState(true);
  const [checkedInStopIds, setCheckedInStopIds] = useState<string[]>([]);
  const [activeDayTab, setActiveDayTab] = useState<number>(1);
  const [modalTargetDay, setModalTargetDay] = useState<number | null>(null);
  const [openMenuStopId, setOpenMenuStopId] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = () => setOpenMenuStopId(null);
    if (openMenuStopId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuStopId]);

  const handleToggleCheckIn = (stopId: string) => {
    setCheckedInStopIds((prev) =>
      prev.includes(stopId) ? prev.filter((id) => id !== stopId) : [...prev, stopId]
    );
  };

  const getDayAssistantTip = (dayNumber: number, city?: string) => {
    switch (dayNumber) {
      case 1:
        return 'Thời tiết chiều nay rất đẹp, thích hợp tản bộ dọc bờ sông Hàn và đón hoàng hôn tại Cầu Rồng.';
      case 2:
        return 'Khu bảo tồn Sơn Trà nghiêm cấm xả rác và không cho thú hoang ăn. Bạn nên chuẩn bị sẵn nước uống cá nhân.';
      case 3:
        return 'Tuyến tàu hỏa Di sản Hải Vân rất đông khách ngắm cảnh, bạn nên có mặt tại Ga Đà Nẵng trước 20 phút.';
      case 4:
        return 'Khuôn viên Đại Nội Huế và lăng tẩm rất rộng, bạn nên mang nón và giày thể thao êm chân.';
      default:
        return `Tận hưởng ngày thứ ${dayNumber} tại ${city || 'miền Trung'} với nhịp độ thong thả và ẩm thực bản địa chuẩn xanh.`;
    }
  };

  const curatedQuickPois = useMemo(() => {
    const picks = ['bảo tàng điêu khắc chăm', 'tàu hỏa', 'bà cam', 'thiên mụ', 'linh ứng', 'cơm gà'];
    const found = allPois.filter((p) =>
      picks.some((k) => p.name.toLowerCase().includes(k)) && !tripIdeas.includes(p.id)
    );
    if (found.length < 3) {
      const more = allPois.filter((p) => !tripIdeas.includes(p.id)).slice(0, 3 - found.length);
      return [...found, ...more];
    }
    return found.slice(0, 3);
  }, [allPois, tripIdeas]);

  const handleAddQuickIdea = (poiId: string, poiName: string) => {
    if (!tripIdeas.includes(poiId)) {
      const nextIdeas = [...tripIdeas, poiId];
      setTripIdeas(nextIdeas);
      if (onUpdateTrip) {
        onUpdateTrip({
          ...trip,
          ideas: nextIdeas,
        });
      }
      setToastMessage(`Đã thêm "${poiName}" vào danh sách Ý tưởng!`);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };


  // Lich trinh co cau truc day du cac stop theo ngay chuan Mindtrip
  const activeItinerary = useMemo(() => {
    const defaultData = buildDefaultMindtripItinerary(trip.destination || 'Đà Nẵng & Huế', trip.daysCount || 4);
    if (Array.isArray(trip.itineraryOutline) && trip.itineraryOutline.length > 0) {
      return trip.itineraryOutline.map((dayItem: CopilotDayOutline, idx: number) => {
        const defDay = defaultData[idx] || defaultData[0];
        return {
          ...dayItem,
          hotel: dayItem.hotel || defDay?.hotel,
          stops: (dayItem.stops && dayItem.stops.length > 0) ? dayItem.stops : (defDay?.stops || []),
        };
      });
    }
    return defaultData;
  }, [trip.itineraryOutline, trip.destination, trip.daysCount]);

  useEffect(() => {
    setTripIdeas(trip.ideas ?? []);
    setTripSavedPlaces(trip.savedPlaces ?? []);
  }, [trip.ideas, trip.savedPlaces]);

  // Tự động tải thông tin chi tiết đầy đủ cho các POIs trong ý tưởng nếu chưa có trong allPois
  useEffect(() => {
    if (!tripIdeas || tripIdeas.length === 0) return;
    const currentKnown = new Set(allPois.map((p) => String(p.id)));
    const missingIds = tripIdeas.filter((id) => !id.startsWith('custom-') && !currentKnown.has(String(id)));
    if (missingIds.length === 0) return;

    getPoisByIds(missingIds)
      .then((items) => {
        if (items && items.length > 0) {
          const normalized = normalizePois(items);
          setLoadedPois((prev) => {
            const map = new Map(prev.map((p) => [String(p.id), p]));
            normalized.forEach((p) => map.set(String(p.id), p));
            return Array.from(map.values());
          });
        }
      })
      .catch((err) => {
        console.warn('TripOverviewView: could not fetch missing idea POIs:', err);
      });
  }, [tripIdeas, allPois]);

  const handleToggleIdea = (poiId: string) => {
    setTripIdeas((prev) => {
      const next = prev.includes(poiId) ? prev.filter((id) => id !== poiId) : [...prev, poiId];
      if (onUpdateTrip) {
        onUpdateTrip({ ...trip, ideas: next });
      }
      return next;
    });
  };

  const handleScrollToDay = (dayNum: number) => {
    setActiveDayTab(dayNum);
    const el = document.getElementById(`day-section-${dayNum}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleDeleteStop = (dayNumber: number, stopId: string) => {
    const baseItinerary = (Array.isArray(trip.itineraryOutline) && trip.itineraryOutline.length > 0)
      ? trip.itineraryOutline
      : activeItinerary;

    const nextItinerary = baseItinerary.map((dayItem: CopilotDayOutline) => {
      if (dayItem.day === dayNumber) {
        const nextStops = Array.isArray(dayItem.stops)
          ? dayItem.stops.filter((s: CopilotStop) => s.id !== stopId)
          : [];
        return { ...dayItem, stops: nextStops };
      }
      return dayItem;
    });

    if (onUpdateTrip) {
      onUpdateTrip({ ...trip, itineraryOutline: nextItinerary });
    }
    setOpenMenuStopId(null);
    setToastMessage(`Đã xóa điểm dừng khỏi Ngày ${dayNumber}`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleAddPoiToDay = (dayNumber: number, poi: Poi) => {
    const baseItinerary = (Array.isArray(trip.itineraryOutline) && trip.itineraryOutline.length > 0)
      ? trip.itineraryOutline
      : activeItinerary;

    const nextIdeas = tripIdeas.includes(poi.id) ? tripIdeas : [...tripIdeas, poi.id];
    setTripIdeas(nextIdeas);

    const nextItinerary = baseItinerary.map((dayItem: CopilotDayOutline) => {
      if (dayItem.day === dayNumber) {
        const existingStops = Array.isArray(dayItem.stops) ? [...dayItem.stops] : [];
        const newStopObj = {
          id: `stop-${dayNumber}-${Date.now()}`,
          poiId: poi.id,
          timeSlot: existingStops.length === 0 
            ? '09:00 - 10:30' 
            : existingStops.length === 1 
            ? '11:30 - 13:00' 
            : existingStops.length === 2 
            ? '15:00 - 17:00' 
            : '18:30 - 20:00',
          name: poi.name,
          category: poi.category || 'di-tich',
          distanceKm: 1.5,
          note: poi.description || `Tham quan & trải nghiệm ${poi.name}`,
          estimatedCost: poi.ai_metadata?.price_range_display || (poi.estimatedCost ? `${poi.estimatedCost.toLocaleString('vi-VN')} đ` : '50.000 đ'),
          image: poi.image,
          greenScore: poi.ecoScore || 90,
        };
        return { ...dayItem, stops: [...existingStops, newStopObj] };
      }
      return dayItem;
    });

    if (onUpdateTrip) {
      onUpdateTrip({ ...trip, ideas: nextIdeas, itineraryOutline: nextItinerary });
    }
    setShowAddIdeasModal(false);
    setModalTargetDay(null);
    setToastMessage(`Đã thêm ${poi.name} vào Ngày ${dayNumber}!`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Helper kiểm tra điểm đến linh hoạt
  const isDaNang = (c?: string) => /da\s*nang|đà\s*nẵng/i.test(c || '');
  const isHue = (c?: string) => /hue|huế/i.test(c || '');

  // Lọc POIs trên bản đồ Planner: CHỈ HIỂN THỊ CÁC ĐỊA ĐIỂM GỢI Ý & Ý TƯỞNG CỦA CHUYẾN ĐI (KHÔNG HIỆN TRÀN LAN)
  const relevantPois = useMemo(() => {
    const map = new Map<string, Poi>();

    // 1. Đưa toàn bộ các địa điểm gợi ý vào bản đồ để khớp chính xác 1:1 với danh sách thẻ bên trái
    recommendedPois.forEach((p) => {
      if (p.lat && p.lng) map.set(p.id, p);
    });

    // 2. Thêm các POIs đã được lưu trong ý tưởng (tripIdeas)
    tripIdeas.forEach((id) => {
      if (!map.has(id)) {
        const found = allPois.find((p) => p.id === id);
        if (found && found.lat && found.lng) map.set(found.id, found);
      }
    });

    return Array.from(map.values());
  }, [allPois, recommendedPois, tripIdeas]);

  // Danh sách các địa điểm trong Ý tưởng chuyến đi (tripIdeas)
  const ideaPois = useMemo(() => {
    return tripIdeas.map((id) => {
      // 1. Tìm trong allPois
      const foundInAll = allPois.find(
        (p) => String(p.id) === String(id) || p.name.toLowerCase() === String(id).toLowerCase()
      );
      if (foundInAll) return foundInAll;

      // 2. Tìm trong recommendedPois
      const foundInRec = recommendedPois.find(
        (p) => String(p.id) === String(id) || p.name.toLowerCase() === String(id).toLowerCase()
      );
      if (foundInRec) return foundInRec;

      // 3. Tìm trong từ điển ánh xạ nhanh các POI nổi tiếng
      if (KNOWN_POI_FALLBACKS[id]) {
        const k = KNOWN_POI_FALLBACKS[id];
        return {
          id,
          name: k.name || 'Điểm đến hấp dẫn',
          category: k.category || ('canh-quan' as const),
          city: (k.city || (isHue(trip.destination) ? 'Huế' : 'Đà Nẵng')) as PoiCity,
          lat: 16.0544,
          lng: 108.2022,
          image: k.image || getDeterministicImage(k.name || id, id, k.category || 'canh-quan', k.city),
          description: k.description || 'Địa điểm ẩm thực / tham quan bạn đã lưu.',
          rating: k.rating || 4.7,
          visitDuration: '1–2 giờ',
          ecoScore: 85,
        };
      }

      // 4. Fallback cho custom idea hoặc POI thêm từ bên ngoài
      const cleanName = id.startsWith('custom-') 
        ? (id.replace(/^custom-\d+-?/, '') || id)
        : (id.length > 20 && id.includes('-') ? 'Điểm đến trải nghiệm' : id);
      const cat = 'canh-quan' as const;
      const targetCity = (isHue(trip.destination) ? 'Huế' : 'Đà Nẵng') as PoiCity;
      return {
        id,
        name: cleanName,
        category: cat,
        city: targetCity,
        lat: 16.0544,
        lng: 108.2022,
        image: getDeterministicImage(cleanName, id, cat, targetCity),
        description: 'Địa điểm bạn đã thêm vào ý tưởng chuyến đi.',
        rating: 4.8,
        visitDuration: '1–2 giờ',
        ecoScore: 85,
      };
    });
  }, [tripIdeas, allPois, recommendedPois, trip.destination]);

  // POI đang được chọn để mở Card chi tiết lớn (PoiDetailSection) tái sử dụng chuẩn trang Explore
  const selectedPoi = useMemo(() => {
    if (!selectedMapPoiId) return null;
    // 1. Tìm trong allPois để lấy dữ liệu gốc đầy đủ (5 ảnh gallery, địa chỉ, tabs, mô tả...)
    const fullPoi = allPois.find(
      (p) => p.id === selectedMapPoiId || p.name.toLowerCase() === selectedMapPoiId.toLowerCase() || p.cleanTitle?.toLowerCase() === selectedMapPoiId.toLowerCase() || p.cleanName?.toLowerCase() === selectedMapPoiId.toLowerCase()
    );
    // 2. Tìm trong recommendedPois để lấy thêm matchScore nếu có
    const recPoi = recommendedPois.find(
      (p) => p.id === selectedMapPoiId || (fullPoi && p.name.toLowerCase() === fullPoi.name.toLowerCase())
    );
    if (fullPoi) {
      return {
        ...fullPoi,
        gallery: fullPoi.gallery || recPoi?.gallery,
        matchScore: recPoi?.matchScore ?? (fullPoi as RecommendedPoi).matchScore,
      };
    }
    const ideaPoi = ideaPois.find((p) => p.id === selectedMapPoiId || p.name.toLowerCase() === selectedMapPoiId.toLowerCase());
    return recPoi || ideaPoi || relevantPois.find((p) => p.id === selectedMapPoiId) || null;
  }, [allPois, relevantPois, recommendedPois, ideaPois, selectedMapPoiId]);

  // Gọi trực tiếp Backend API (/api/v1/recommendations/poi) khi Điểm đến, Ngân sách hoặc Ý tưởng thay đổi
  useEffect(() => {
    let isCancelled = false;

    async function fetchBackendRecommendations() {
      setIsLoadingRecommendations(true);
      try {
        const payload = {
          destination: trip.destination || 'Đà Nẵng & Huế',
          budget_tier: categoryBudgets.activities !== 'any' ? categoryBudgets.activities : (categoryBudgets.dining !== 'any' ? categoryBudgets.dining : 'any'),
          trip_days: trip.daysCount || 4,
          ideas: tripIdeas.map((id) => {
            const found = allPois.find((p) => p.id === id);
            return found ? found.name : id;
          }),
          top_k: 10,
        };

        const res = await // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchJson<{ status: string; total: number; data: any[] }>(
          '/api/v1/recommendations/poi',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );

        if (isCancelled) return;

        if (res && res.data && res.data.length > 0) {
          const mapped: RecommendedPoi[] = res.data.map((item, idx) => {
            const foundLocal = allPois.find(
              (p) => p.id === item.poi_id || p.name.toLowerCase() === item.name.toLowerCase() || p.cleanTitle?.toLowerCase() === item.name.toLowerCase() || p.cleanName?.toLowerCase() === item.name.toLowerCase()
            );
            const category = normalizeCategory(item.category_name);
            const city = normalizeCity(item.city);
            const galleryList = (Array.isArray(foundLocal?.gallery) && foundLocal.gallery.length > 0)
              ? foundLocal.gallery
              : (Array.isArray(item.gallery) && item.gallery.length > 0)
                ? item.gallery
                : (Array.isArray(item.gallery_urls) && item.gallery_urls.length > 0)
                  ? item.gallery_urls
                  : undefined;
            return {
              ...(foundLocal || {}),
              id: foundLocal?.id || item.poi_id || `rec-${idx}`,
              name: foundLocal?.name || item.name,
              category: foundLocal?.category || category,
              city: foundLocal?.city || city,
              lat: item.lat || foundLocal?.lat || 16.0,
              lng: item.lng || foundLocal?.lng || 108.0,
              image: item.image || foundLocal?.image || getDeterministicImage(item.name, item.poi_id || idx, category, city),
              gallery: galleryList,
              description: foundLocal?.description || item.explanation_snippet || 'Địa điểm hấp dẫn cho chuyến đi của bạn.',
              rating: item.satisfaction_score || foundLocal?.rating || 4.6,
              visitDuration: foundLocal?.visitDuration || '1–2 giờ',
              ecoScore: Math.round((item.green_score || 0.85) <= 1 ? (item.green_score || 0.85) * 100 : item.green_score),
              estimatedCost: item.estimated_cost || foundLocal?.estimatedCost || 50000,
              matchScore: typeof item.match_score === 'number' ? Math.round(item.match_score) : undefined,
              address: foundLocal?.address || item.address || '',
              ai_metadata: foundLocal?.ai_metadata || item.ai_metadata,
            };
          });

          setRecommendedPois(mapped.slice(0, 10));
          setRecommendationTitle('Gợi ý cho bạn');
          setRecommendationSubtitle('Theo gu và hành trình của bạn.');
          setIsLoadingRecommendations(false);
          return;
        }
      } catch (err) {
        console.warn('Backend recommendation fetch error, using local fallback:', err);
      }

      if (isCancelled) return;

      // Fallback cục bộ nếu backend chưa kịp phản hồi
      const rawPois = allPois;
      const dest = trip.destination || '';
      const hasDn = isDaNang(dest);
      const hasHue = isHue(dest);

      let destinationPois = rawPois;
      if (hasDn && hasHue) destinationPois = rawPois;
      else if (hasHue) destinationPois = rawPois.filter((p) => isHue(p.city));
      else if (hasDn) destinationPois = rawPois.filter((p) => isDaNang(p.city));
      if (destinationPois.length === 0) destinationPois = rawPois;

      // Lọc theo ngân sách riêng từng danh mục: Ăn uống -> Ngân sách Ăn; Điểm đến -> Ngân sách Hoạt động
      const ranked = [...destinationPois].filter((p) => {
        const cost = p.estimatedCost ?? 0;
        if (p.category === 'quan-an') {
          if (categoryBudgets.dining === '$') return cost <= 120000;
          if (categoryBudgets.dining === '$$') return cost >= 80000 && cost <= 350000;
          if (categoryBudgets.dining === '$$$') return cost >= 300000;
          return true;
        } else {
          if (categoryBudgets.activities === '$') return cost <= 100000;
          if (categoryBudgets.activities === '$$') return cost >= 80000 && cost <= 450000;
          if (categoryBudgets.activities === '$$$') return cost >= 400000;
          return true;
        }
      });
      ranked.sort((a, b) => (b.rating || 0) - (a.rating || 0));

      setRecommendedPois(ranked.slice(0, 10));
      setRecommendationTitle(`Top 10 địa điểm gợi ý cho ${trip.destination}`);
      setRecommendationSubtitle(`Được tối ưu tự động dựa trên mức ngân sách & điểm đến của bạn.`);
      setIsLoadingRecommendations(false);
    }

    void fetchBackendRecommendations();

    return () => {
      isCancelled = true;
    };
  }, [trip.destination, categoryBudgets.dining, categoryBudgets.lodging, categoryBudgets.activities, tripIdeas]);

  const getRecommendationReason = (poi: Poi) => {
    let text = poi.description || 'Địa điểm hấp dẫn cho hành trình của bạn.';
    text = text.replace(/📍\s*/g, '');
    // Làm sạch từ khóa phụ trong ngoặc đơn rườm rà từ scraper/Google Maps
    text = text.replace(/\s*\([^)]*(?:Cây Cầu|Phun Lửa|Độc Nhất|Vô Nhị|check-in|view đẹp|nổi tiếng|Công Viên Biển)[^)]*\)/gi, '');
    text = text.replace(/Cùng khu vực với ['"]?([^'",(]+)['"]?\s*\(trong bán kính ~?([0-9.]+)km\):?(?:\s*[^:]+:)?\s*/gi, 'Cách $1 ~$2km. ');
    text = text.replace(/Thuận tiện kết hợp cùng cụm di chuyển với ['"]?([^'",]+)['"]?:?(?:\s*[^:]+:)?\s*/gi, 'Gần $1. ');
    text = text.replace(/Cùng trung tâm thành phố, rất tiện ghé thăm sau ['"]?([^'",]+)['"]?:?(?:\s*[^:]+:)?\s*/gi, 'Tiện ghé sau $1. ');
    text = text.replace(/Ngay gần\s+([^–-]+)[–-][^.]+\.\s*/gi, 'Ngay gần $1. ');
    text = text.replace(/Cách\s+([^–-]+)[–-][^.]+\s+~([0-9.]+km)/gi, 'Cách $1 ~$2');
    text = text.replace(/Trải nghiệm nổi bật tại\s+[^:]+:\s*/gi, '');
    text = text.replace(/tại\s+Da\s*Nang\s*:\s*/gi, '');
    text = text.replace(/tại\s+Đà\s*Nẵng\s*:\s*/gi, '');
    text = text.replace(/tại\s+Huế\s*:\s*/gi, '');
    text = text.replace(/\(phân khúc[^)]*\):\s*/gi, '');
    text = text.replace(/\(phân khúc[^)]*\)/gi, '');
    text = text.replace(/\(\d+(\.\d+)?\s*[★⭐]?\)/gi, '');
    text = text.replace(/\s{2,}/g, ' ').trim();
    return text;
  };

  // ─── LỌC POIS CHO MODAL "THÊM VÀO CHUYẾN ĐI" (ADD TO TRIP MODAL) ───
  const modalFilteredPois = useMemo(() => {
    let list: Poi[] = modalTab === 'saved'
      ? tripSavedPlaces.map((savedPlaceId) => {
        const savedPoi = allPois.find(
          (poi) => poi.id === savedPlaceId || poi.name.toLowerCase() === savedPlaceId.toLowerCase(),
        );
        if (savedPoi) return savedPoi;

        return {
          id: savedPlaceId,
          name: savedPlaceId,
          category: 'canh-quan',
          city: isHue(trip.destination) ? 'Huế' : 'Đà Nẵng',
          lat: 16.0544,
          lng: 108.2022,
          image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80',
          description: 'Địa điểm bạn đã lưu cho chuyến đi này.',
          rating: 0,
          visitDuration: '1–2 giờ',
          ecoScore: 0,
        };
      })
      : allPois;

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
    } else if (modalCategory === 'experiences') {
      list = list.filter((p) => p.category === 'di-tich' || p.category === 'chua');
    }

    // 3. Lọc theo từ khóa tìm kiếm
    if (modalSearch.trim()) {
      const q = modalSearch.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q)
      );
    }

    return list;
  }, [allPois, modalCity, modalCategory, modalSearch, modalTab, tripSavedPlaces, trip.destination]);

  // Tiêu đề lớn hiển thị (1 dòng rút gọn chuẩn Mindtrip)
  const displayTitle = `Chuyến đi ${trip.destination || 'Đà Nẵng & Huế'}`;

  // Rút gọn ngày bắt đầu cho viên thuốc metadata (ví dụ: "Từ 2 thg 11")
  const formatDateBrief = (dateStr?: string) => {
    if (!dateStr) return 'Từ 2 thg 11';
    const match = dateStr.match(/^(\d+)\s*-\s*\d+\s+thg\s+(\d+)/i);
    if (match) return `Từ ${match[1]} thg ${match[2]}`;
    if (dateStr.toLowerCase().startsWith('từ')) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length > 0 && parts[0].trim()) return `Từ ${parts[0].trim()}`;
    return dateStr;
  };
  const getBudgetBrief = () => {
    const { dining, lodging, activities } = categoryBudgets;
    if (dining === 'any' && lodging === 'any' && activities === 'any') return 'Ngân sách';
    const activeTiers = [dining, lodging, activities].filter((t) => t !== 'any');
    if (activeTiers.length === 0) return 'Ngân sách';
    return Array.from(new Set(activeTiers)).join('/');
  };
  const budgetBriefText = getBudgetBrief();

  // ─── CÁC HÀM CẬP NHẬT THÔNG SỐ KHI BẤM NÚT "CẬP NHẬT" ───
  // 1. Cập nhật Điểm đến
  const handleSaveWhere = () => {
    const norm = whereTarget.trim() || 'Đà Nẵng';
    const updated: UserTrip = {
      ...trip,
      destination: norm,
      title: `Chuyến đi ${norm}, ${trip.startDate || 'tháng 11 năm 2026'}`,
    };
    onUpdateTrip?.(updated);
    setShowWhereModal(false);
  };

  // 2. Cập nhật Thời gian
  const handleSaveWhen = () => {
    let newStartDate = trip.startDate || 'Tháng 11, 2026';
    let newDays = flexibleDays;

    if (whenTab === 'dates' && rangeStart && rangeEnd) {
      const sDay = rangeStart.getDate();
      const eDay = rangeEnd.getDate();
      const m = rangeStart.getMonth() + 1;
      const diffMs = Math.abs(rangeEnd.getTime() - rangeStart.getTime());
      newDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
      newStartDate = `Ngày ${sDay} – ${eDay} tháng ${m}`;
    } else {
      newStartDate = `${flexibleDays} ngày • ${selectedMonth}`;
    }

    const updated: UserTrip = {
      ...trip,
      startDate: newStartDate,
      daysCount: newDays,
      title: `Chuyến đi ${trip.destination}, ${newStartDate}`,
    };
    onUpdateTrip?.(updated);
    setShowWhenModal(false);
  };

  // 3. Cập nhật Du khách
  const handleSaveWho = () => {
    const totalGuests = Math.max(1, adults + children + infants + pets);
    const updated: UserTrip = {
      ...trip,
      peopleCount: totalGuests,
    };
    onUpdateTrip?.(updated);
    setShowWhoModal(false);
  };

  // 4. Cập nhật Ngân sách 3 dòng
  const handleSaveBudget = () => {
    const encoded = `dining:${categoryBudgets.dining};lodging:${categoryBudgets.lodging};activities:${categoryBudgets.activities}`;
    const updated: UserTrip = {
      ...trip,
      budgetTier: encoded,
    };
    onUpdateTrip?.(updated);
    setShowBudgetModal(false);
  };

  // ─── HELPER CHO LỊCH 2 THÁNG LIỀN KỀ BÊN TAB "NGÀY THÁNG" ───
  const month1Year = calendarBaseMonth.getFullYear();
  const month1Index = calendarBaseMonth.getMonth();
  const nextMonthDate = new Date(month1Year, month1Index + 1, 1);
  const month2Year = nextMonthDate.getFullYear();
  const month2Index = nextMonthDate.getMonth();

  const getMonthMeta = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    return { firstDay, totalDays };
  };

  const meta1 = getMonthMeta(month1Year, month1Index);
  const meta2 = getMonthMeta(month2Year, month2Index);

  const isSameDay = (d1: Date | null, d2: Date | null) => {
    if (!d1 || !d2) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const isDayInRange = (date: Date) => {
    if (!rangeStart || !rangeEnd) return false;
    const t = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const s = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()).getTime();
    const e = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate()).getTime();
    return t > s && t < e;
  };

  const handleSelectDate = (year: number, month: number, day: number) => {
    const clicked = new Date(year, month, day);
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(clicked);
      setRangeEnd(null);
    } else if (rangeStart && !rangeEnd) {
      if (clicked.getTime() < rangeStart.getTime()) {
        setRangeStart(clicked);
        setRangeEnd(null);
      } else {
        setRangeEnd(clicked);
        const diffMs = clicked.getTime() - rangeStart.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
        setFlexibleDays(Math.min(14, Math.max(1, diffDays)));
      }
    }
  };

  const handlePrevMonth = () => {
    setCalendarBaseMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarBaseMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleClearDates = () => {
    setRangeStart(null);
    setRangeEnd(null);
  };

  // 3 tháng giới hạn chuẩn
  const threeMonthsList = [
    { id: 'm1', label: 'Tháng 11' },
    { id: 'm2', label: 'Tháng 12' },
    { id: 'm3', label: 'Tháng 1' },
  ];

  // Xử lý gửi tin nhắn trò chuyện cho chuyến đi này
  const handleSendChatMessage = () => {
    if (!chatInput.trim()) return;
    const userText = chatInput.trim();
    setChatMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setChatInput('');

    setTimeout(() => {
      let aiReply = `Tôi đã ghi nhận câu hỏi về "${userText}". Dựa trên dữ liệu chuyến đi ${trip.destination}, các điểm đến như Cầu Rồng, Đại Nội và các quán ẩm thực xanh đều đang sẵn sàng cho ngày tham quan của bạn!`;
      if (userText.toLowerCase().includes('ăn') || userText.toLowerCase().includes('uống')) {
        aiReply = `Tại ${trip.destination}, bạn nhất định nên thử mì Quảng, bún bò, bánh bèo chén và ghé các quán ăn địa phương đạt tiêu chuẩn xanh nhé!`;
      } else if (userText.toLowerCase().includes('xe') || userText.toLowerCase().includes('đi lại')) {
        aiReply = `Hệ thống đề xuất bạn sử dụng taxi điện hoặc xe đạp công cộng để giảm phát thải carbon cho chuyến đi ${trip.destination}.`;
      }
      setChatMessages((prev) => [...prev, { sender: 'ai', text: aiReply }]);
    }, 700);
  };

  // Xử lý áp dụng thay thế điểm dừng từ Trợ lý AI (PB14 Task 3.34)
  const handleApplySwapStop = (dayIndex: number, slot: string, newPoi: CopilotSuggestedPoi) => {
    // 1. Cập nhật ý tưởng
    const nextIdeas = tripIdeas.includes(newPoi.id) ? tripIdeas : [...tripIdeas, newPoi.id];
    setTripIdeas(nextIdeas);

    // 2. Cập nhật itineraryOutline liên tục (kế thừa activeItinerary nếu chưa lưu)
    const baseItinerary = (Array.isArray(trip.itineraryOutline) && trip.itineraryOutline.length > 0)
      ? trip.itineraryOutline
      : activeItinerary;

    const nextItinerary = baseItinerary.map((dayItem: CopilotDayOutline) => {
          if (dayItem.day === dayIndex) {
            const slotLabel = slot === 'dinner' ? 'Bữa tối' : slot === 'breakfast' ? 'Bữa sáng' : slot === 'afternoon' ? 'Buổi chiều' : 'Bữa trưa';
            const catLower = (newPoi.category || '').toLowerCase();
            const isDining = catLower.includes('ẩm thực') || catLower.includes('ăn');
            const isCafe = catLower.includes('cafe') || catLower.includes('khát');
            const actAction = isDining
              ? 'Thưởng thức ẩm thực tại'
              : isCafe
              ? 'Thư giãn & thưởng thức cà phê tại'
              : 'Tham quan & trải nghiệm';
            const newAct = `${slotLabel}: ${actAction} ${newPoi.name} (${newPoi.address})`;
            const existingActs = Array.isArray(dayItem.suggested_activities) ? [...dayItem.suggested_activities] : [];
            const idx = existingActs.findIndex((a: string) => a.toLowerCase().includes(slotLabel.toLowerCase()));
            if (idx >= 0) {
              existingActs[idx] = newAct;
            } else {
              existingActs.push(newAct);
            }
            const existingStops = Array.isArray(dayItem.stops) ? [...dayItem.stops] : [];
            const newStopObj = {
              id: `stop-${dayIndex}-${Date.now()}`,
              timeSlot: slot === 'breakfast' ? '08:00 - 09:30' : slot === 'dinner' ? '18:30 - 20:00' : slot === 'afternoon' ? '15:00 - 17:00' : '11:45 - 13:00',
              name: newPoi.name,
              category: newPoi.category,
              distanceKm: 1.5,
              note: newPoi.swap_reason || `Thưởng thức ${newPoi.name}`,
              estimatedCost: newPoi.price_range_display || '80.000 đ',
              image: newPoi.image_url,
              greenScore: newPoi.green_score || 90,
            };
            const slotIndex = existingStops.findIndex((s: CopilotStop) => {
              const time = (s.timeSlot || '').toLowerCase();
              if (slot === 'dinner') return time.includes('18:') || time.includes('19:') || time.includes('tối');
              if (slot === 'breakfast') return time.includes('08:') || time.includes('09:') || time.includes('sáng');
              return time.includes('11:') || time.includes('12:') || time.includes('trưa');
            });
            if (slotIndex >= 0) {
              existingStops[slotIndex] = newStopObj;
            } else {
              existingStops.push(newStopObj);
            }
            return { ...dayItem, suggested_activities: existingActs, stops: existingStops };
          }
          return dayItem;
        });

    // 3. Cập nhật matchedPois nếu có
    const nextMatched = Array.isArray(trip.matchedPois) ? [...trip.matchedPois] : [];
    if (!nextMatched.some((p: { id?: string | number; name?: string }) => p.name === newPoi.name || p.id === newPoi.id)) {
      nextMatched.push({
        name: newPoi.name,
        category: newPoi.category,
        city: trip.destination,
        address: newPoi.address,
        description: newPoi.swap_reason,
        highlight_tag: 'Đã đổi qua Trợ lý AI',
        estimated_price_range: newPoi.price_range_display || 'Phù hợp',
        green_score: newPoi.green_score,
        image_url: newPoi.image_url,
      });
    }

    const updatedTrip: UserTrip = {
      ...trip,
      ideas: nextIdeas,
      itineraryOutline: nextItinerary.length > 0 ? nextItinerary : trip.itineraryOutline,
      matchedPois: nextMatched,
    };

    if (onUpdateTrip) {
      onUpdateTrip(updatedTrip);
    }

    // Tu dong dinh vi va ghim ngay dia diem moi len ban do
    setSelectedMapPoiId(newPoi.id);
    setHoveredMapPoiId(newPoi.id);

    setToastMessage(`Đã cập nhật "${newPoi.name}" vào lịch trình Ngày ${dayIndex}!`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="flex-1 h-full bg-white overflow-hidden select-none animate-fadeIn flex flex-col">
      {/* ─── TOP BAR HEADER: TOÀN CHIỀU RỘNG CHUẨN MINDTRIP ─── */}
      <header className="h-[58px] sm:h-[62px] px-4 sm:px-6 border-b border-gray-200/90 bg-white flex items-center justify-between shrink-0 z-30">
        {/* Left: Nút Back + Tiêu đề + Metadata Group Pills */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700 hover:text-black transition cursor-pointer shrink-0"
            title="Quay lại danh sách chuyến đi"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Tiêu đề chuyến đi */}
          <div className="flex items-center gap-1.5 min-w-0">
            <h1 className="text-[16px] sm:text-[17px] font-bold text-gray-950 tracking-tight truncate max-w-[180px] sm:max-w-[260px]">
              {displayTitle}
            </h1>
          </div>

          {/* Phân tách dọc */}
          <div className="h-4 w-[1px] bg-gray-200 hidden md:block shrink-0 mx-1" />

          {/* Khung tóm tắt thông tin: Gộp 1 khung viền mảnh chuẩn Mindtrip */}
          <div className="hidden md:inline-flex items-center rounded-full border border-gray-200 divide-x divide-gray-200 bg-white shadow-2xs h-[32px] overflow-hidden shrink-0">
            {/* 1. Điểm đến */}
            <button
              type="button"
              onClick={() => setShowWhereModal(true)}
              className="px-3 h-full flex items-center gap-1 hover:bg-gray-50 text-gray-800 text-[12px] font-medium transition cursor-pointer"
              title="Bấm để thay đổi điểm đến"
            >
              <span>{trip.destination}</span>
              <ChevronDown size={11} className="text-gray-400 shrink-0" />
            </button>

            {/* 2. Ngày bắt đầu */}
            <button
              type="button"
              onClick={() => setShowWhenModal(true)}
              className="px-3 h-full flex items-center gap-1 hover:bg-gray-50 text-gray-800 text-[12px] font-medium transition cursor-pointer"
              title="Bấm để thay đổi ngày và thời gian"
            >
              <span>{formatDateBrief(trip.startDate)}</span>
              <ChevronDown size={11} className="text-gray-400 shrink-0" />
            </button>

            {/* 3. Số khách */}
            <button
              type="button"
              onClick={() => setShowWhoModal(true)}
              className="px-3 h-full flex items-center gap-1 hover:bg-gray-50 text-gray-800 text-[12px] font-medium transition cursor-pointer"
              title="Bấm để thay đổi số lượng người đi"
            >
              <span>{trip.peopleCount ? `${trip.peopleCount} khách` : '2 khách'}</span>
              <ChevronDown size={11} className="text-gray-400 shrink-0" />
            </button>

            {/* 4. Ngân sách */}
            <button
              type="button"
              onClick={() => setShowBudgetModal(true)}
              className="px-3 h-full flex items-center gap-1 hover:bg-gray-50 text-gray-600 hover:text-gray-900 text-[12px] font-medium transition cursor-pointer"
              title="Bấm để thay đổi phạm vi ngân sách"
            >
              <span>{budgetBriefText}</span>
              <ChevronDown size={11} className="text-gray-400 shrink-0" />
            </button>
          </div>
        </div>

        {/* Right: Bộ chuyển chế độ hiển thị Cột Phải (Lịch trình / Bản đồ / Ý tưởng) */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-0.5 bg-neutral-100 rounded-xl border border-neutral-200/70">
            {/* Lịch trình */}
            <button
              type="button"
              onClick={() => setRightViewMode('itinerary')}
              className={`py-1 px-2.5 rounded-lg font-bold text-[12px] transition flex items-center gap-1 cursor-pointer ${
                rightViewMode === 'itinerary'
                  ? 'bg-white text-black shadow-xs ring-1 ring-black/5'
                  : 'text-gray-600 hover:text-black hover:bg-white/60'
              }`}
              title="Xem lịch trình chi tiết theo ngày"
            >
              <Compass size={13} className={rightViewMode === 'itinerary' ? 'text-emerald-700' : 'text-gray-500'} />
              <span>Lịch trình</span>
              <span className="px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-800 text-[9.5px] font-bold">
                {activeItinerary.length}N
              </span>
            </button>

            {/* Bản đồ */}
            <button
              type="button"
              onClick={() => setRightViewMode('map')}
              className={`py-1 px-2.5 rounded-lg font-bold text-[12px] transition flex items-center gap-1 cursor-pointer ${
                rightViewMode === 'map'
                  ? 'bg-white text-black shadow-xs ring-1 ring-black/5'
                  : 'text-gray-600 hover:text-black hover:bg-white/60'
              }`}
              title="Xem bản đồ tương tác"
            >
              <MapPin size={13} className={rightViewMode === 'map' ? 'text-emerald-700' : 'text-gray-500'} />
              <span>Bản đồ</span>
            </button>

            {/* Ý tưởng */}
            <button
              type="button"
              onClick={() => setShowIdeasView(true)}
              className="py-1 px-2.5 rounded-lg text-gray-700 hover:text-black font-semibold text-[12px] transition flex items-center gap-1 cursor-pointer hover:bg-white/60"
              title="Xem ý tưởng đã lưu"
            >
              <Lightbulb size={13} className="text-amber-500" />
              <span>Ý tưởng</span>
              {tripIdeas.length > 0 && (
                <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-emerald-600 text-white text-[9.5px] font-bold flex items-center justify-center">
                  {tripIdeas.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ─── NỘI DUNG CHÍNH: 2 CỘT CHIA ĐỀU 50-50 CHUẨN MINDTRIP (FULL HEIGHT KỊCH ĐÁY MÀN HÌNH) ─── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden w-full h-[calc(100vh-62px)]">
        {/* ────── CỘT TRÁI: TRỢ LÝ AI COPILOT (CHIA ĐỀU 50%, FULL HEIGHT, SEAMLESS) ────── */}
        <div className="w-full h-full flex flex-col bg-white border-r border-gray-200/80 overflow-hidden relative">
          <PlannerCopilotDrawer
            key={trip.id}
            inline={true}
            trip={trip}
            activeDayIndex={1}
            savedIdeas={tripIdeas}
            onApplySwapStop={handleApplySwapStop}
            onViewPoiDetail={(poiId) => setSelectedMapPoiId(poiId)}
            onHighlightOnMap={(poiId) => {
              setHoveredMapPoiId(poiId);
              setSelectedMapPoiId(poiId);
            }}
            onUpdateTrip={onUpdateTrip}
            onSelectDay={(day) => handleScrollToDay(day)}
          />
        </div>

        {/* ────── CỘT PHẢI: LỊCH TRÌNH HOẶC BẢN ĐỒ (CHIA ĐỀU 50%, FULL HEIGHT, SEAMLESS) ────── */}
        <div className="w-full h-full flex flex-col bg-neutral-50/30 overflow-hidden relative">
          {rightViewMode === 'itinerary' ? (
            <div className="w-full h-full flex flex-col overflow-hidden bg-white">
              {/* Sticky Day Navigation Tabs */}
              <div className="bg-white/95 backdrop-blur-xs py-2 px-4 sm:px-6 border-b border-gray-100 flex items-center justify-between gap-2 overflow-x-auto auto-hide-scrollbar shrink-0 shadow-2xs z-20">
                <div className="flex items-center gap-1.5 overflow-x-auto auto-hide-scrollbar py-0.5">
                  <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider shrink-0 mr-1 hidden sm:inline">
                    Ngày:
                  </span>
                  {activeItinerary.map((dayItem: CopilotDayOutline) => {
                    const isDayActive = activeDayTab === dayItem.day;
                    return (
                      <button
                        key={dayItem.day}
                        type="button"
                        onClick={() => handleScrollToDay(dayItem.day)}
                        className={`px-3 py-1.2 rounded-full text-[11.5px] font-bold whitespace-nowrap transition cursor-pointer active:scale-95 flex items-center gap-1.5 shrink-0 ${
                          isDayActive
                            ? 'bg-black text-white shadow-xs'
                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-black'
                        }`}
                      >
                        <span>Ngày {dayItem.day}</span>
                        <span className={`text-[10px] font-normal ${isDayActive ? 'text-neutral-300' : 'text-neutral-500'}`}>
                          • {dayItem.focus_city || (dayItem.day <= 2 ? 'Đà Nẵng' : 'Huế')}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Phân tách + Khoảng cách toggle + Ưu tiên chuyến đi */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowDistances(!showDistances)}
                    className={`py-1 px-2.5 rounded-lg font-semibold text-[11.5px] transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                      showDistances ? 'bg-neutral-100 text-black border border-neutral-300' : 'text-gray-500 hover:text-black hover:bg-gray-50'
                    }`}
                    title={showDistances ? 'Bật hiển thị khoảng cách di chuyển' : 'Ẩn khoảng cách di chuyển'}
                  >
                    <Car size={12} className={showDistances ? 'text-emerald-700' : 'text-gray-400'} />
                    <span className="hidden sm:inline">Khoảng cách</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBudgetModal(true)}
                    className="py-1 px-2.5 rounded-lg hover:bg-gray-50 text-gray-600 hover:text-black font-semibold text-[11.5px] transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    title="Thiết lập ngân sách và ưu tiên chuyến đi"
                  >
                    <SlidersHorizontal size={12} className="text-gray-500" />
                    <span className="hidden sm:inline">Ưu tiên</span>
                  </button>
                </div>
              </div>

              {/* Danh sách Timeline chi tiết từng ngày */}
              <div className="flex-1 overflow-y-auto auto-hide-scrollbar p-4 sm:p-6 space-y-6">
                <div className="max-w-[680px] mx-auto w-full space-y-6">
                    {activeItinerary.map((dayItem: CopilotDayOutline) => (
                      <div key={dayItem.day} id={`day-section-${dayItem.day}`} className="space-y-3 pt-1">
                        {/* Day Header */}
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                          <div className="flex items-center gap-2.5">
                            <span className="px-2.5 py-1 rounded-lg bg-black text-white text-[11.5px] font-bold tracking-tight">
                              Ngày {dayItem.day}
                            </span>
                            <h4 className="font-bold text-[14.5px] text-gray-950 truncate max-w-[280px] sm:max-w-[340px]" title={dayItem.theme}>
                              {dayItem.theme || `Khám phá ${dayItem.focus_city || trip.destination}`}
                            </h4>
                          </div>
                          <span className="text-[11.5px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            {dayItem.focus_city || (dayItem.day <= 2 ? 'Đà Nẵng' : 'Huế')}
                          </span>
                        </div>

                        {/* Hotel / Stay Card chuẩn Mindtrip (P1: Gửi đồ & Nhận phòng rõ ràng) */}
                        {dayItem.hotel && (
                          <div className="relative flex items-center justify-between p-3 rounded-2xl border border-neutral-200/90 bg-neutral-50/70 ml-5 sm:ml-6 mb-2 group hover:border-black transition shadow-2xs">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-white border border-neutral-200 flex items-center justify-center shrink-0 shadow-2xs">
                                <Building2 size={18} className="text-neutral-800" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Khách sạn lưu trú:</span>
                                  <h5 className="font-bold text-[13px] text-neutral-950 truncate">
                                    {dayItem.hotel.name}
                                  </h5>
                                  {dayItem.hotel.isEcoCertified && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[9.5px] font-bold shrink-0">
                                      🌱 Eco-stay
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11.5px] text-neutral-500 truncate mt-0.5">
                                  {dayItem.hotel.checkInNote || 'Gửi hành lý từ 08:00 • Nhận phòng sau 14:00 • 2 đêm lưu trú'}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setToastMessage(`Đã mở thông tin phòng tại ${dayItem.hotel?.name}`);
                                setTimeout(() => setToastMessage(null), 3000);
                              }}
                              className="px-3 py-1 rounded-full text-[11.5px] font-semibold text-black bg-white border border-neutral-300 hover:bg-neutral-100 transition shadow-2xs shrink-0 cursor-pointer active:scale-95"
                            >
                              Xem phòng
                            </button>
                          </div>
                        )}

                        {/* Connector khoảng cách từ Khách sạn đến điểm tham quan đầu tiên */}
                        {showDistances && dayItem.hotel && (
                          <div className="flex items-center gap-2 pl-7 my-1 text-[11px] text-gray-500 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            <span className="px-2 py-0.5 rounded-md bg-neutral-100 border border-neutral-200 text-neutral-700 font-mono">
                              🚗 1.5 km (~10 phút taxi điện)
                            </span>
                          </div>
                        )}

                        {/* Stops in Day */}
                        <div className="space-y-2.5 pl-2 sm:pl-3 relative before:absolute before:left-[19px] sm:before:left-[23px] before:top-4 before:bottom-4 before:w-[2px] before:bg-gradient-to-b before:from-emerald-400 before:via-neutral-300 before:to-emerald-500">
                          {Array.isArray(dayItem.stops) && dayItem.stops.map((stop: CopilotStop, stopIdx: number) => {
                            const fullPoi = allPois.find((p) => p.id === stop.poiId || p.name.toLowerCase() === stop.name.toLowerCase() || p.cleanTitle?.toLowerCase() === stop.name.toLowerCase());
                            const displayImg = fullPoi?.image || stop.image || 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80';
                            const displayScore = fullPoi?.ecoScore || stop.greenScore || 90;
                            const isCheckedIn = checkedInStopIds.includes(stop.id);
                            const isFirstPending = !isCheckedIn && !dayItem.stops.slice(0, stopIdx).some((s: CopilotStop) => !checkedInStopIds.includes(s.id));

                            return (
                              <React.Fragment key={stop.id || stopIdx}>
                                {/* Distance pill between stops */}
                                {showDistances && stopIdx > 0 && typeof stop.distanceKm === 'number' && (
                                  <div className="flex items-center gap-2 my-1 pl-7 text-[11px] text-gray-500 font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                    <span className="px-2 py-0.5 rounded-md bg-neutral-100 border border-neutral-200 text-neutral-700 font-mono">
                                      {stop.distanceKm >= 50 ? `🚆 ${stop.distanceKm} km (Tàu hỏa)` : `🚗 ${stop.distanceKm} km (~${Math.round(stop.distanceKm * 2.5)} phút)`}
                                    </span>
                                    <a
                                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.name)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-emerald-700 hover:underline flex items-center gap-0.5 ml-1"
                                    >
                                      <span>Chỉ đường</span>
                                      <ArrowRight size={10} />
                                    </a>
                                  </div>
                                )}

                                {/* Stop Card with 3-Tier Visual Hierarchy & Tinted Green Shadow */}
                                <div
                                  onClick={() => {
                                    if (fullPoi) {
                                      setSelectedMapPoiId(fullPoi.id);
                                    }
                                  }}
                                  className={`relative flex items-start gap-3.5 p-3.5 rounded-2xl transition-all duration-300 group ml-5 sm:ml-6 cursor-pointer ${
                                    isCheckedIn
                                      ? 'border border-dashed border-neutral-300 bg-neutral-50/70 opacity-60 shadow-none'
                                      : isFirstPending
                                      ? 'border-2 border-emerald-500/80 bg-emerald-50/20 shadow-[0_6px_22px_-2px_rgba(6,78,59,0.12),0_2px_8px_rgba(0,0,0,0.03)] ring-4 ring-emerald-500/10'
                                      : 'border border-gray-200/90 bg-white hover:border-neutral-400 shadow-[0_4px_18px_-2px_rgba(6,78,59,0.06),0_2px_6px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_-4px_rgba(6,78,59,0.12),0_4px_8px_rgba(0,0,0,0.04)]'
                                  }`}
                                >
                                  {/* Thumbnail */}
                                  <div className="relative w-16 h-16 min-w-[64px] min-h-[64px] max-w-[64px] max-h-[64px] rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-100 shadow-2xs">
                                    <img
                                      src={displayImg}
                                      alt={stop.name}
                                      className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${isCheckedIn ? 'grayscale' : ''}`}
                                      onError={(e) => {
                                        e.currentTarget.src = 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80';
                                      }}
                                    />
                                    <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/75 text-[9px] font-bold text-white">
                                      {stopIdx + 1}
                                    </span>
                                    {isCheckedIn && (
                                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
                                        <Check size={18} strokeWidth={3} className="text-emerald-400" />
                                      </div>
                                    )}
                                  </div>

                                  {/* Stop Info (3-tier Visual Hierarchy) */}
                                  <div className="flex-1 min-w-0">
                                    {/* Tier 1 Header: TimeSlot, Active Indicator, Check-in Button & Cost */}
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[11.5px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-100/80 px-2 py-0.5 rounded-md">
                                          {stop.timeSlot}
                                        </span>
                                        {isFirstPending && (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-2xs animate-pulse">
                                            <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                                            <span>Đang diễn ra</span>
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-1.5">
                                        {stop.estimatedCost && (
                                          <span className="text-[11.5px] font-semibold text-neutral-700 font-mono">
                                            {stop.estimatedCost}
                                          </span>
                                        )}
                                        {/* Check-in Toggle Button (P0: Circle khi chưa ghé, CheckCircle2 khi đã ghé) */}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleCheckIn(stop.id);
                                            const msg = isCheckedIn ? `Đã bỏ đánh dấu ${stop.name}` : `Đã hoàn thành ghé thăm ${stop.name}!`;
                                            setToastMessage(msg);
                                            setTimeout(() => setToastMessage(null), 2500);
                                          }}
                                          className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold flex items-center gap-1 transition cursor-pointer active:scale-95 ${
                                            isCheckedIn
                                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs'
                                              : 'bg-neutral-100/90 text-neutral-600 hover:bg-emerald-50 hover:text-emerald-700 border border-neutral-200'
                                          }`}
                                          title={isCheckedIn ? 'Nhấp để bỏ đánh dấu' : 'Đánh dấu đã ghé thăm'}
                                        >
                                          {isCheckedIn ? (
                                            <CheckCircle2 size={11.5} className="text-emerald-700" />
                                          ) : (
                                            <Circle size={11.5} className="text-neutral-400" />
                                          )}
                                          <span>{isCheckedIn ? 'Đã ghé' : 'Chưa ghé'}</span>
                                        </button>

                                        {/* More Actions Menu Button (P1: Đổi / Xóa điểm dừng) */}
                                        <div className="relative">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setOpenMenuStopId(openMenuStopId === stop.id ? null : stop.id);
                                            }}
                                            className="w-6 h-6 rounded-full flex items-center justify-center text-neutral-400 hover:text-black hover:bg-neutral-200/70 transition cursor-pointer"
                                            title="Tùy chọn thao tác"
                                          >
                                            <MoreVertical size={13} />
                                          </button>

                                          {openMenuStopId === stop.id && (
                                            <div 
                                              onClick={(e) => e.stopPropagation()}
                                              className="absolute right-0 top-7 z-30 w-48 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 text-[12px] font-medium animate-fadeIn select-none"
                                            >
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setModalTargetDay(dayItem.day);
                                                  setModalCity(dayItem.day <= 2 ? 'Đà Nẵng' : 'Huế');
                                                  setOpenMenuStopId(null);
                                                  setShowAddIdeasModal(true);
                                                }}
                                                className="w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-emerald-50 hover:text-emerald-800 flex items-center gap-2 cursor-pointer transition"
                                              >
                                                <Sparkles size={13} className="text-emerald-600" />
                                                <span>Đổi địa điểm tương đương</span>
                                              </button>
                                              <a
                                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.name)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={() => setOpenMenuStopId(null)}
                                                className="w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-100 flex items-center gap-2 cursor-pointer transition"
                                              >
                                                <ExternalLink size={13} className="text-neutral-500" />
                                                <span>Mở trên Google Maps</span>
                                              </a>
                                              <div className="h-[1px] bg-gray-100 my-1" />
                                              <button
                                                type="button"
                                                onClick={() => handleDeleteStop(dayItem.day, stop.id)}
                                                className="w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer transition"
                                              >
                                                <Trash2 size={13} className="text-red-500" />
                                                <span>Xóa khỏi Ngày {dayItem.day}</span>
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Tier 1 Primary: Stop Name */}
                                    <h5 className="font-bold text-[14.5px] text-gray-950 truncate group-hover:text-emerald-950 leading-tight" title={stop.name}>
                                      {stop.name}
                                    </h5>

                                    {/* Tier 3 Description: Cultural / Eco Note */}
                                    <p className="text-[12px] text-gray-600 line-clamp-1 mt-0.5 leading-snug">
                                      {stop.note || fullPoi?.description || 'Điểm trải nghiệm trong ngày'}
                                    </p>

                                    {/* Tier 3 Actions: Green Score Badge & CTA buttons */}
                                    <div className="flex items-center justify-between mt-2.5 pt-1.5 border-t border-gray-100">
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                                        🌱 Điểm xanh: {displayScore}/100
                                      </span>

                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (fullPoi) {
                                              setSelectedMapPoiId(fullPoi.id);
                                              setHoveredMapPoiId(fullPoi.id);
                                            }
                                            setRightViewMode('map');
                                          }}
                                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-gray-700 hover:text-black bg-gray-100 hover:bg-gray-200 transition flex items-center gap-1 cursor-pointer"
                                          title="Xem vị trí trên bản đồ"
                                        >
                                          <MapPin size={11} className="text-emerald-700" />
                                          <span>Vị trí</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </React.Fragment>
                            );
                          })}
                        </div>

                        {/* Add Stop Button (P1: Gắn target day vào modal) */}
                        <div className="pt-1 pl-7">
                          <button
                            type="button"
                            onClick={() => {
                              setModalTargetDay(dayItem.day);
                              setModalCity(dayItem.day <= 2 ? 'Đà Nẵng' : 'Huế');
                              setShowAddIdeasModal(true);
                            }}
                            className="w-full py-2 px-3 rounded-xl border border-dashed border-gray-300 hover:border-black text-gray-600 hover:text-black font-semibold text-[12px] transition flex items-center justify-center gap-1.5 bg-neutral-50/50 hover:bg-white cursor-pointer active:scale-98"
                          >
                            <Plus size={13} strokeWidth={2.5} />
                            <span>Thêm hoạt động vào Ngày {dayItem.day}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              ) : (
                /* Bản đồ tương tác trực quan (Interactive Map với đầy đủ thuộc tính chuẩn Explore) */
                <div 
                  className={`w-full transition-all duration-300 ${
                    isMapExpanded 
                      ? 'fixed inset-4 z-50 rounded-3xl h-[calc(100vh-32px)] shadow-2xl' 
                      : 'w-full h-full'
                  } overflow-hidden relative [transform:translateZ(0)]`}
                >
                  <PoiMap
                    pois={relevantPois}
                    selectedPoiId={selectedMapPoiId}
                    hoveredPoiId={hoveredMapPoiId}
                    onSelectPoi={setSelectedMapPoiId}
                    onHoverPoi={setHoveredMapPoiId}
                    isExpanded={isMapExpanded}
                    onToggleExpand={() => {
                      setIsMapExpanded((prev) => !prev);
                      setTimeout(() => {
                        window.dispatchEvent(new Event('resize'));
                      }, 200);
                    }}
                    favorites={savedIds}
                    pendingFavorites={pendingIds}
                    onToggleFavorite={handleOpenSavedCollections}
                    addedTrips={new Set(tripIdeas)}
                    onToggleAddTrip={handleToggleIdea}
                  />
                </div>
              )}
          </div>
        </div>

      {/* ─── MODAL 1: Ở ĐÂU (KHI BẤM VÀO PILL ĐIỂM ĐẾN) ─── */}
      {showWhereModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn select-none"
          onClick={() => setShowWhereModal(false)}
        >
          <div 
            className="w-full max-w-[480px] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl mx-4 flex flex-col border border-gray-100 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <button 
                onClick={() => setShowWhereModal(false)} 
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"
              >
                <X size={18} />
              </button>
              <div className="text-[16px] font-bold text-black">Ở đâu</div>
              <div className="w-8"></div>
            </div>

            {/* Input + Ô tô toggle chuẩn OnboardingModal */}
            <div className="relative mb-5">
              <input
                type="text"
                placeholder="Vị trí"
                value={whereTarget}
                onChange={(e) => setWhereTarget(e.target.value)}
                className="w-full rounded-full border border-gray-200 px-5 py-3 pr-36 text-[14px] font-light text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <span className="text-[12px] font-bold text-black">Đi bằng ô tô?</span>
                <button 
                  type="button"
                  onClick={() => setByCar(!byCar)} 
                  className={`w-9 h-5 rounded-full flex items-center p-0.5 transition-colors cursor-pointer ${byCar ? 'bg-black' : 'bg-gray-200'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${byCar ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>
            </div>

            {/* 3 Nút chọn vị trí: Huế, Đà Nẵng, Cả 2 */}
            <div className="flex gap-2 mb-6 flex-wrap">
              <button 
                type="button"
                onClick={() => setWhereTarget('Huế')} 
                className={`px-4 py-2 rounded-full border text-[13px] font-semibold transition-all cursor-pointer ${
                  whereTarget === 'Huế' ? 'bg-black text-white border-black shadow-xs' : 'border-gray-200 text-gray-800 hover:border-black'
                }`}
              >
                Huế
              </button>
              <button 
                type="button"
                onClick={() => setWhereTarget('Đà Nẵng')} 
                className={`px-4 py-2 rounded-full border text-[13px] font-semibold transition-all cursor-pointer ${
                  whereTarget === 'Đà Nẵng' ? 'bg-black text-white border-black shadow-xs' : 'border-gray-200 text-gray-800 hover:border-black'
                }`}
              >
                Đà Nẵng
              </button>
              <button 
                type="button"
                onClick={() => setWhereTarget('Đà Nẵng & Huế')} 
                className={`px-4 py-2 rounded-full border text-[13px] font-semibold transition-all cursor-pointer ${
                  whereTarget === 'Đà Nẵng & Huế' ? 'bg-black text-white border-black shadow-xs' : 'border-gray-200 text-gray-800 hover:border-black'
                }`}
              >
                Cả 2
              </button>
            </div>

            <div className="mt-auto flex justify-end">
              <button 
                type="button"
                onClick={handleSaveWhere} 
                className="w-full sm:w-32 font-bold text-[14px] py-3 rounded-full bg-black text-white hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Cập nhật
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: KHI (KHI BẤM VÀO PILL NGÀY THÁNG - THEO ẢNH 2 USER GỬI) ─── */}
      {showWhenModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn select-none"
          onClick={() => setShowWhenModal(false)}
        >
          <div 
            className="w-full max-w-[620px] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl mx-4 border border-gray-100 flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Nút X đóng */}
            <button 
              onClick={() => setShowWhenModal(false)} 
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer absolute top-6 left-6"
            >
              <X size={18} />
            </button>

            {/* Header: Title Khi + Pill switch Ngày tháng / Linh hoạt */}
            <div className="flex flex-col items-center mb-6">
              <div className="text-[17px] font-bold text-black mb-3">Khi</div>
              <div className="bg-gray-100 p-1 rounded-full flex gap-1">
                <button 
                  type="button"
                  onClick={() => setWhenTab('dates')} 
                  className={`px-5 py-1.5 rounded-full text-[13px] font-bold transition-all cursor-pointer ${
                    whenTab === 'dates' ? 'bg-white shadow-xs text-black' : 'text-gray-500 hover:text-black'
                  }`}
                >
                  Ngày tháng
                </button>
                <button 
                  type="button"
                  onClick={() => setWhenTab('flex')} 
                  className={`px-5 py-1.5 rounded-full text-[13px] font-bold transition-all cursor-pointer ${
                    whenTab === 'flex' ? 'bg-white shadow-xs text-black' : 'text-gray-500 hover:text-black'
                  }`}
                >
                  Linh hoạt
                </button>
              </div>
            </div>

            {/* TAB NGÀY THÁNG (LỊCH KÉP 2 THÁNG) */}
            {whenTab === 'dates' && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-7 mb-7">
                  {/* THÁNG 1: TRÁI */}
                  <div>
                    <div className="flex items-center justify-between mb-3 px-1">
                      <button 
                        type="button" 
                        onClick={handlePrevMonth}
                        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 cursor-pointer text-gray-600"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span className="font-bold text-[14px] text-gray-900">
                        {`Tháng ${month1Index + 1} năm ${month1Year}`}
                      </span>
                      <div className="w-7"></div>
                    </div>

                    <div className="grid grid-cols-7 text-center text-[12px] text-gray-400 font-medium mb-1.5">
                      <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                    </div>

                    <div className="grid grid-cols-7 text-center">
                      {Array.from({ length: meta1.firstDay }).map((_, idx) => (
                        <div key={`empty-1-${idx}`} className="h-9"></div>
                      ))}

                      {Array.from({ length: meta1.totalDays }).map((_, idx) => {
                        const dayNum = idx + 1;
                        const thisDate = new Date(month1Year, month1Index, dayNum);
                        const isStart = isSameDay(thisDate, rangeStart);
                        const isEnd = isSameDay(thisDate, rangeEnd);
                        const inRange = isDayInRange(thisDate);

                        return (
                          <div key={`day-1-${dayNum}`} className="relative h-9 flex items-center justify-center">
                            {inRange && <div className="absolute inset-0 bg-[#f0f0f0]" />}
                            {isStart && rangeEnd && <div className="absolute top-0 bottom-0 right-0 left-1/2 bg-[#f0f0f0]" />}
                            {isEnd && rangeStart && <div className="absolute top-0 bottom-0 left-0 right-1/2 bg-[#f0f0f0]" />}

                            <button
                              type="button"
                              onClick={() => handleSelectDate(month1Year, month1Index, dayNum)}
                              className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-[13px] cursor-pointer transition-all ${
                                isStart || isEnd
                                  ? 'bg-black text-white font-bold shadow-xs'
                                  : 'text-gray-900 hover:bg-gray-200/80 font-normal'
                              }`}
                            >
                              {dayNum}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* THÁNG 2: PHẢI */}
                  <div>
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="w-7"></div>
                      <span className="font-bold text-[14px] text-gray-900">
                        {`Tháng ${month2Index + 1} năm ${month2Year}`}
                      </span>
                      <button 
                        type="button" 
                        onClick={handleNextMonth}
                        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 cursor-pointer text-gray-600"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>

                    <div className="grid grid-cols-7 text-center text-[12px] text-gray-400 font-medium mb-1.5">
                      <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                    </div>

                    <div className="grid grid-cols-7 text-center">
                      {Array.from({ length: meta2.firstDay }).map((_, idx) => (
                        <div key={`empty-2-${idx}`} className="h-9"></div>
                      ))}

                      {Array.from({ length: meta2.totalDays }).map((_, idx) => {
                        const dayNum = idx + 1;
                        const thisDate = new Date(month2Year, month2Index, dayNum);
                        const isStart = isSameDay(thisDate, rangeStart);
                        const isEnd = isSameDay(thisDate, rangeEnd);
                        const inRange = isDayInRange(thisDate);

                        return (
                          <div key={`day-2-${dayNum}`} className="relative h-9 flex items-center justify-center">
                            {inRange && <div className="absolute inset-0 bg-[#f0f0f0]" />}
                            {isStart && rangeEnd && <div className="absolute top-0 bottom-0 right-0 left-1/2 bg-[#f0f0f0]" />}
                            {isEnd && rangeStart && <div className="absolute top-0 bottom-0 left-0 right-1/2 bg-[#f0f0f0]" />}

                            <button
                              type="button"
                              onClick={() => handleSelectDate(month2Year, month2Index, dayNum)}
                              className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-[13px] cursor-pointer transition-all ${
                                isStart || isEnd
                                  ? 'bg-black text-white font-bold shadow-xs'
                                  : 'text-gray-900 hover:bg-gray-200/80 font-normal'
                              }`}
                            >
                              {dayNum}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer Trang 1: Clear bên trái, Cập nhật bên phải */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleClearDates}
                    className="text-[14px] font-semibold text-black hover:underline cursor-pointer"
                  >
                    Thông thoáng
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveWhen}
                    className="px-8 py-3 bg-black text-white rounded-full font-bold text-[14px] hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-xs"
                  >
                    Cập nhật
                  </button>
                </div>
              </div>
            )}

            {/* TAB LINH HOẠT (3 THÁNG) */}
            {whenTab === 'flex' && (
              <div className="pt-2">
                <div className="text-center mb-7">
                  <div className="text-[15px] font-bold text-gray-950 mb-3.5">
                    Bao nhiêu ngày?
                  </div>
                  <div className="flex items-center justify-center gap-4">
                    <button 
                      type="button"
                      onClick={() => setFlexibleDays(Math.max(1, flexibleDays - 1))} 
                      className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center hover:border-black transition cursor-pointer text-gray-700"
                    >
                      <Minus size={15}/>
                    </button>
                    <div className="w-20 py-2 border border-gray-300 rounded-full text-center font-bold text-[16px] text-black">
                      {flexibleDays}
                    </div>
                    <button 
                      type="button"
                      onClick={() => setFlexibleDays(Math.min(14, flexibleDays + 1))} 
                      className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center hover:border-black transition cursor-pointer text-gray-700"
                    >
                      <Plus size={15}/>
                    </button>
                  </div>
                </div>

                <div className="text-center mb-8">
                  <div className="text-[15px] font-bold text-gray-950 mb-4">
                    Du lịch bất cứ lúc nào
                  </div>
                  <div className="flex justify-center gap-3.5">
                    {threeMonthsList.map((m) => {
                      const isSelected = selectedMonth === m.label;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedMonth(m.label)}
                          className={`w-[110px] h-[105px] border rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${
                            isSelected
                              ? 'border-black bg-gray-50 ring-1 ring-black shadow-xs'
                              : 'border-gray-200 hover:border-gray-400 bg-white'
                          }`}
                        >
                          <CalendarIcon size={22} className={`mb-2.5 ${isSelected ? 'text-black' : 'text-gray-400'}`} />
                          <span className={`text-[13px] ${isSelected ? 'font-bold text-black' : 'font-medium text-gray-700'}`}>
                            {m.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button 
                    type="button"
                    onClick={handleSaveWhen} 
                    className="px-8 py-3 bg-black text-white font-bold text-[14px] rounded-full hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-xs"
                  >
                    Cập nhật
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL 3: AI (KHI BẤM VÀO PILL DU KHÁCH) ─── */}
      {showWhoModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn select-none"
          onClick={() => setShowWhoModal(false)}
        >
          <div 
            className="w-full max-w-[420px] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl mx-4 border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <button 
                onClick={() => setShowWhoModal(false)} 
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"
              >
                <X size={18} />
              </button>
              <div className="text-center">
                <div className="font-bold text-black text-[16px]">Ai</div>
                <div className="text-gray-400 text-[12px] font-light">{adults + children + infants + pets} du khách</div>
              </div>
              <div className="w-8 h-8"></div>
            </div>

            <div className="space-y-4 mb-6">
              {/* Người lớn */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-bold text-black">Người lớn</div>
                  <div className="text-[12px] text-gray-400 font-light">Từ 13 tuổi trở lên</div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => setAdults(Math.max(1, adults - 1))} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Minus size={14}/>
                  </button>
                  <span className="w-5 text-center text-[14px] font-bold">{adults}</span>
                  <button 
                    type="button"
                    onClick={() => setAdults(adults + 1)} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Plus size={14}/>
                  </button>
                </div>
              </div>

              {/* Những đứa trẻ */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-bold text-black">Những đứa trẻ</div>
                  <div className="text-[12px] text-gray-400 font-light">Độ tuổi 2–12</div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => setChildren(Math.max(0, children - 1))} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Minus size={14}/>
                  </button>
                  <span className="w-5 text-center text-[14px] font-bold">{children}</span>
                  <button 
                    type="button"
                    onClick={() => setChildren(children + 1)} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Plus size={14}/>
                  </button>
                </div>
              </div>

              {/* Trẻ sơ sinh */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-bold text-black">Trẻ sơ sinh</div>
                  <div className="text-[12px] text-gray-400 font-light">Dưới 2 tuổi</div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => setInfants(Math.max(0, infants - 1))} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Minus size={14}/>
                  </button>
                  <span className="w-5 text-center text-[14px] font-bold">{infants}</span>
                  <button 
                    type="button"
                    onClick={() => setInfants(infants + 1)} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Plus size={14}/>
                  </button>
                </div>
              </div>

              {/* Thú cưng */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-bold text-black">Thú cưng</div>
                  <div className="text-[12px] text-gray-400 font-light underline">Bạn có mang theo thú cưng không?</div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => setPets(Math.max(0, pets - 1))} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Minus size={14}/>
                  </button>
                  <span className="w-5 text-center text-[14px] font-bold">{pets}</span>
                  <button 
                    type="button"
                    onClick={() => setPets(pets + 1)} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Plus size={14}/>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button 
                type="button"
                onClick={handleSaveWho} 
                className="w-full sm:w-32 bg-black text-white font-bold text-[14px] py-3 rounded-full hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Cập nhật
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: NGÂN SÁCH 3 DÒNG ĐỘC LẬP (ĂN UỐNG, LƯU TRÚ, HOẠT ĐỘNG) ─── */}
      {showBudgetModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn select-none"
          onClick={() => setShowBudgetModal(false)}
        >
          <div 
            className="w-full max-w-[560px] bg-white rounded-[28px] p-6 sm:p-7 shadow-2xl relative border border-gray-100 flex flex-col max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Nút X đóng góc trên bên phải */}
            <button
              type="button"
              onClick={() => setShowBudgetModal(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition absolute top-5 right-5 cursor-pointer"
              title="Đóng"
            >
              <X size={18} strokeWidth={2.5} />
            </button>

            {/* Tiêu đề & Phụ đề */}
            <div className="mb-5 pr-8">
              <h3 className="text-[19px] font-bold text-gray-950">Phân loại ngân sách chuyến đi</h3>
              <p className="text-[12.5px] text-gray-500 mt-0.5">
                Chọn mức chi tiêu riêng theo từng nhóm để nhận gợi ý địa điểm chính xác theo nhu cầu thực tế
              </p>
            </div>

            {/* 3 dòng lựa chọn độc lập */}
            <div className="space-y-4 mb-5">
              {/* DÒNG 1: 🍽️ Ăn uống */}
              <div className="p-3.5 bg-gray-50/80 rounded-2xl border border-gray-200/70">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[13.5px] font-bold text-gray-900 flex items-center gap-1.5">
                    <span>🍽️</span> Ăn uống & Ẩm thực
                  </span>
                  <span className="text-[11px] font-medium text-gray-500">
                    {categoryBudgets.dining === 'any' ? 'Mọi mức giá' : DINING_BUDGET_OPTIONS.find(o => o.id === categoryBudgets.dining)?.sub}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {DINING_BUDGET_OPTIONS.map((opt) => {
                    const isSelected = categoryBudgets.dining === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCategoryBudgets(prev => ({ ...prev, dining: opt.id }))}
                        className={`py-2 px-1.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          isSelected
                            ? 'bg-black text-white border-black shadow-xs font-bold'
                            : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-200/80 font-medium'
                        }`}
                      >
                        <span className="text-[13px] leading-tight">{opt.label}</span>
                        <span className={`text-[10px] leading-tight truncate max-w-full ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                          {opt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* DÒNG 2: 🏨 Lưu trú */}
              <div className="p-3.5 bg-gray-50/80 rounded-2xl border border-gray-200/70">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[13.5px] font-bold text-gray-900 flex items-center gap-1.5">
                    <span>🏨</span> Lưu trú & Khách sạn
                  </span>
                  <span className="text-[11px] font-medium text-gray-500">
                    {categoryBudgets.lodging === 'any' ? 'Mọi loại phòng' : LODGING_BUDGET_OPTIONS.find(o => o.id === categoryBudgets.lodging)?.sub}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {LODGING_BUDGET_OPTIONS.map((opt) => {
                    const isSelected = categoryBudgets.lodging === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCategoryBudgets(prev => ({ ...prev, lodging: opt.id }))}
                        className={`py-2 px-1.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          isSelected
                            ? 'bg-black text-white border-black shadow-xs font-bold'
                            : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-200/80 font-medium'
                        }`}
                      >
                        <span className="text-[13px] leading-tight">{opt.label}</span>
                        <span className={`text-[10px] leading-tight truncate max-w-full ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                          {opt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* DÒNG 3: 🎡 Hoạt động / Tham quan */}
              <div className="p-3.5 bg-gray-50/80 rounded-2xl border border-gray-200/70">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[13.5px] font-bold text-gray-900 flex items-center gap-1.5">
                    <span>🎡</span> Hoạt động & Tham quan
                  </span>
                  <span className="text-[11px] font-medium text-gray-500">
                    {categoryBudgets.activities === 'any' ? 'Mọi hoạt động' : ACTIVITIES_BUDGET_OPTIONS.find(o => o.id === categoryBudgets.activities)?.sub}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {ACTIVITIES_BUDGET_OPTIONS.map((opt) => {
                    const isSelected = categoryBudgets.activities === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCategoryBudgets(prev => ({ ...prev, activities: opt.id }))}
                        className={`py-2 px-1.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          isSelected
                            ? 'bg-black text-white border-black shadow-xs font-bold'
                            : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-200/80 font-medium'
                        }`}
                      >
                        <span className="text-[13px] leading-tight">{opt.label}</span>
                        <span className={`text-[10px] leading-tight truncate max-w-full ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                          {opt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Chú thích thông minh */}
            <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl text-[11.5px] text-amber-900 leading-relaxed mb-5">
              💡 <strong>Cơ chế gợi ý theo danh mục:</strong> Gợi ý Nhà hàng sẽ áp dụng ngân sách Ăn uống; Gợi ý Di tích & Cảnh quan sẽ áp dụng ngân sách Hoạt động để không bị áp một mức chung cho cả chuyến đi.
            </div>

            {/* Nút Cập nhật góc dưới bên phải */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSaveBudget}
                className="px-8 py-2.5 bg-black text-white font-bold text-[13.5px] rounded-full hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-xs"
              >
                Cập nhật ngân sách
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL PHỤ CHO Ý TƯỞNG & LỊCH ─── */}
      {activeRightDrawer && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={() => setActiveRightDrawer(null)}
        >
          <div 
            className="w-full max-w-[540px] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl relative border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
              <h3 className="font-bold text-[17px] text-gray-950">
                {activeRightDrawer === 'ideas' && '💡 Ý tưởng & Điểm gợi ý'}
                {activeRightDrawer === 'calendar' && '📅 Lịch trình tổng quát'}
              </h3>
              <button 
                onClick={() => setActiveRightDrawer(null)} 
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-500 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Nội dung Lịch */}
            {activeRightDrawer === 'calendar' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Khung thời gian cho chuyến đi:</p>
                <div className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CalendarIcon size={20} className="text-emerald-700" />
                    <div>
                      <div className="text-[14px] font-bold text-gray-900">{trip.startDate || `${trip.daysCount} ngày`}</div>
                      <div className="text-xs text-gray-500">{trip.destination} • {trip.daysCount} ngày</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setActiveRightDrawer(null);
                      onOpenItineraryDetails();
                    }} 
                    className="text-xs font-bold text-black underline cursor-pointer"
                  >
                    Xem chi tiết ngày
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL "THÊM VÀO CHUYẾN ĐI" (ADD TO TRIP MODAL CHUẨN MINDTRIP COMPACT) ─── */}
      {showAddIdeasModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs py-6 px-4 animate-fadeIn select-none"
          onClick={() => setShowAddIdeasModal(false)}
        >
          {/* Khung hộp gọn gàng chuẩn Mindtrip: Rộng ~750px, Bo góc 24px */}
          <div
            className="relative bg-white w-[750px] max-w-[calc(100vw-32px)] h-[calc(100vh-80px)] max-h-[820px] rounded-[24px] shadow-2xl flex flex-col border border-gray-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Phần cố định: Tiêu đề + tab (có đường kẻ ngang dưới #eee, cao ~72px) */}
            <div className="relative h-[72px] shrink-0 border-b border-gray-200 bg-white rounded-t-[24px] flex flex-col justify-between">
              {/* Nút đóng × */}
              <button
                type="button"
                onClick={() => setShowAddIdeasModal(false)}
                className="absolute top-3.5 left-4 w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition cursor-pointer z-20"
                title="Đóng"
              >
                <X size={17} />
              </button>

              {/* Tiêu đề căn giữa: Thêm vào chuyến đi (P1: Hiện ngày mục tiêu nếu có) */}
              <div className="pt-3 text-center">
                <h3 className="font-bold text-[15px] text-gray-950 flex items-center justify-center gap-2">
                  <span>Thêm vào chuyến đi</span>
                  {modalTargetDay && (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                      Ngày {modalTargetDay}
                    </span>
                  )}
                </h3>
              </div>

              {/* Tabs: Tìm kiếm, Đã lưu, Tùy chỉnh */}
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
                <button
                  type="button"
                  onClick={() => setModalTab('saved')}
                  className={`pb-2.5 border-b-2 transition font-semibold cursor-pointer flex items-center gap-1.5 -mb-[1px] ${
                    modalTab === 'saved'
                      ? 'border-black text-black font-bold'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <span>Đã lưu</span>
                  {tripSavedPlaces.length > 0 && (
                    <span className="w-4.5 h-4.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {tripSavedPlaces.length}
                    </span>
                  )}
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

            {/* Vùng cuộn duy nhất: Tên khu vực → Tìm kiếm → Lọc → Lưới thẻ */}
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
                        <h2 className="text-[22px] font-bold text-gray-950 tracking-tight leading-tight group-hover:text-black">
                          {modalCity === 'all' ? 'Tất cả điểm đến' : modalCity}
                        </h2>
                        <i className="ph ph-caret-down text-[18px] font-bold text-gray-950 group-hover:translate-y-0.5 transition-transform"></i>
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
                            <span>Tất cả điểm đến</span>
                            {modalCity === 'all' && <i className="ph ph-check font-bold"></i>}
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
                            {modalCity === 'Đà Nẵng' && <i className="ph ph-check font-bold"></i>}
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
                            {modalCity === 'Huế' && <i className="ph ph-check font-bold"></i>}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ô tìm kiếm & Nút bộ lọc */}
                  <div className="mt-3 flex items-center gap-2.5 shrink-0">
                    <div className="flex-1 relative flex items-center min-w-0">
                      <i className="ph ph-magnifying-glass text-gray-400 absolute left-4 text-lg"></i>
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
                          <i className="ph ph-x-circle text-lg"></i>
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
                      <i className="ph ph-faders text-lg"></i>
                      <span>Bộ lọc</span>
                    </button>
                  </div>

                  {/* Hàng danh mục tabs */}
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
                      {modalTab === 'saved'
                        ? 'Địa điểm đã lưu cho chuyến đi'
                        : modalCategory === 'quan-an' || modalCategory === 'restaurants'
                        ? 'Quán ăn'
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

                  {/* Lưới thẻ 3 cột */}
                  <div className="mt-3 grid grid-cols-3 gap-x-3.5 gap-y-5">
                    {modalFilteredPois.length === 0 ? (
                      <div className="col-span-full py-16 text-center text-gray-500 text-sm">
                        {modalTab === 'saved'
                          ? 'Chưa có địa điểm nào được lưu cho chuyến đi này. Thêm địa điểm từ bộ sưu tập Đã lưu để xem tại đây.'
                          : 'Không tìm thấy địa điểm phù hợp với bộ lọc hiện tại.'}
                      </div>
                    ) : (
                      modalFilteredPois.map((poi) => {
                        const isAdded = tripIdeas.includes(poi.id);
                        const ratingVal = (typeof poi.rating === 'number' ? poi.rating : Number(poi.rating || 4.5)).toFixed(1);

                        return (
                          <div
                            key={poi.id}
                            onClick={() => {
                              setSelectedMapPoiId(poi.id);
                              setShowAddIdeasModal(false);
                            }}
                            className="flex flex-col group cursor-pointer text-left select-none"
                          >
                            {/* Ảnh thẻ tỉ lệ 1.05 : 1, bo góc 16px */}
                            <div className="relative aspect-[1.05/1] w-full rounded-[16px] overflow-hidden bg-gray-100 shadow-2xs">
                              <img
                                src={poi.image}
                                alt={poi.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                onError={(e) => {
                                  e.currentTarget.src = 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80';
                                }}
                              />

                              {/* Nút “+ Thêm” trên thẻ (P1: Hỗ trợ thêm trực tiếp vào Ngày mục tiêu) */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (modalTargetDay) {
                                    handleAddPoiToDay(modalTargetDay, poi);
                                  } else {
                                    handleToggleIdea(poi.id);
                                  }
                                }}
                                className={`absolute top-2.5 right-2.5 h-[28px] px-2.5 rounded-full font-semibold text-[12px] transition shadow-xs cursor-pointer active:scale-95 flex items-center justify-center gap-1 z-10 ${
                                  modalTargetDay
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : isAdded
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'bg-white text-gray-900 hover:bg-black hover:text-white'
                                }`}
                              >
                                {modalTargetDay ? (
                                  <>
                                    <Plus size={13} strokeWidth={2.5} />
                                    <span>Thêm vào Ngày {modalTargetDay}</span>
                                  </>
                                ) : isAdded ? (
                                  <>
                                    <Check size={13} strokeWidth={2.5} />
                                    <span>Đã thêm</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus size={13} strokeWidth={2.5} />
                                  <span>Thêm vào Ý tưởng</span>
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

                            <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-gray-500 font-normal">
                              <MapPin size={11} className="text-gray-400 shrink-0" />
                              <span className="truncate">
                                {poi.category === 'quan-an' 
                                  ? 'Ẩm thực' 
                                  : poi.category === 'di-tich' 
                                  ? 'Di tích lịch sử' 
                                  : poi.category === 'canh-quan' 
                                  ? 'Cảnh quan & Thắng cảnh' 
                                  : 'Chùa & Tâm linh'}
                              </span>
                            </div>

                            <div className="mt-0.5 text-[11.5px] text-gray-400 font-normal truncate">
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
                          const name = customIdeaInput.trim();
                          const found = allPois.find((p) => p.name.toLowerCase() === name.toLowerCase());
                          const customId = found ? found.id : `custom-${name}`;
                          handleToggleIdea(customId);
                          setCustomIdeaInput('');
                          setShowAddIdeasModal(false);
                          setShowIdeasView(true);
                        }
                      }}
                    />
                    <div className="flex justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomIdeaInput('');
                          setShowAddIdeasModal(false);
                        }}
                        className="h-[38px] px-5 rounded-full border border-gray-200 text-gray-600 text-[13px] font-medium hover:bg-gray-50 transition cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!customIdeaInput.trim()) return;
                          const name = customIdeaInput.trim();
                          const found = allPois.find((p) => p.name.toLowerCase() === name.toLowerCase());
                          const customId = found ? found.id : `custom-${name}`;
                          handleToggleIdea(customId);
                          setCustomIdeaInput('');
                          setShowAddIdeasModal(false);
                          setShowIdeasView(true);
                        }}
                        className="h-[38px] px-6 rounded-full bg-black text-white font-bold text-[13px] hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-2xs"
                      >
                        + Thêm vào ý tưởng
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── GIAO DIỆN Ý TƯỞNG (DRAWER TOÀN CHIỀU CAO CHUẨN MINDTRIP THEO ẢNH) ─── */}
      {showIdeasView && !selectedPoi && (
        <div 
          className="fixed inset-y-0 right-0 w-full sm:w-[620px] lg:w-[calc(50vw)] xl:w-[calc(50vw)] z-50 bg-white rounded-l-[24px] border-l border-gray-200/90 shadow-[-16px_0_40px_rgba(0,0,0,0.08),-4px_0_12px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden animate-slideInRight"
        >
          {/* Top Bar: Nút Đóng (X), Quay lại (<), Nút Thêm ý tưởng (+) */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowIdeasView(false)}
                className="w-9 h-9 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer"
                title="Đóng ý tưởng"
              >
                <X size={17} />
              </button>
              <button
                type="button"
                onClick={() => setShowIdeasView(false)}
                className="w-9 h-9 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer"
                title="Quay lại"
              >
                <ChevronLeft size={18} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowAddIdeasModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-gray-200 hover:border-black text-[13px] font-semibold text-gray-900 hover:bg-gray-50 transition cursor-pointer active:scale-95 shadow-2xs"
            >
              <Plus size={14} />
              <span>Thêm ý tưởng</span>
            </button>
          </div>

          {/* Drawer Title Section */}
          <div className="px-6 pt-4 pb-2">
            <h2 className="text-[28px] sm:text-[32px] font-extrabold text-gray-950 tracking-tight leading-tight">
              Ý tưởng
            </h2>
            <p className="text-[13.5px] text-gray-500 mt-1">
              {ideaPois.length} địa điểm bạn dự kiến ghé thăm
            </p>
          </div>

          {/* Drawer Body: Empty State vs Cards Grid */}
          <div className="flex-1 overflow-y-auto px-6 py-4 auto-hide-scrollbar">
            {ideaPois.length === 0 ? (
              /* Empty State với đồ họa 3 polaroids chuẩn Mindtrip */
              <div className="h-full min-h-[380px] flex flex-col items-center justify-center text-center py-12 px-4">
                <div className="relative w-64 h-48 mb-6 flex items-center justify-center select-none pointer-events-none">
                  {/* Left card: Sea / Beach (Tilted left) */}
                  <div className="absolute w-[110px] h-[135px] bg-white p-2 rounded-2xl shadow-lg border border-gray-100 transform -rotate-12 -translate-x-12 translate-y-3 z-0">
                    <img
                      src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=300&q=80"
                      alt="Biển Mỹ Khê"
                      className="w-full h-[95px] object-cover rounded-xl"
                    />
                  </div>
                  {/* Right card: Scenic mountain (Tilted right) */}
                  <div className="absolute w-[110px] h-[135px] bg-white p-2 rounded-2xl shadow-lg border border-gray-100 transform rotate-12 translate-x-12 translate-y-2 z-0">
                    <img
                      src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=300&q=80"
                      alt="Cầu Rồng & Núi Non"
                      className="w-full h-[95px] object-cover rounded-xl"
                    />
                  </div>
                  {/* Center card: Di tích Cố Đô (Straight / Slight tilt) */}
                  <div className="relative z-10 w-[115px] h-[140px] bg-white p-2 rounded-2xl shadow-xl border border-gray-200 transform -rotate-2">
                    <img
                      src="https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=300&q=80"
                      alt="Đại Nội Huế"
                      className="w-full h-[100px] object-cover rounded-xl"
                    />
                  </div>
                </div>

                <h3 className="text-[20px] font-bold text-gray-950 mb-2">
                  Khám phá & lưu ý tưởng cho chuyến đi
                </h3>
                <p className="text-[14px] text-gray-500 max-w-sm mb-4 leading-relaxed">
                  Lưu các địa điểm bạn muốn trải nghiệm. Bạn có thể kéo chúng vào lịch trình bất cứ khi nào.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddIdeasModal(true)}
                  className="px-6 py-2 rounded-full bg-black text-white text-[13.5px] font-bold hover:bg-neutral-800 transition cursor-pointer active:scale-95 shadow-xs mb-6"
                >
                  + Thêm ý tưởng tùy chọn
                </button>

                {/* 3 Selectable Quick-Add Cards */}
                <div className="w-full max-w-md text-left border-t border-neutral-100 pt-5">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className="text-[13px] font-bold text-neutral-900">
                      Gợi ý điểm đến tiêu biểu cho chuyến đi:
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                      Chuẩn xanh
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {curatedQuickPois.map((qp) => (
                      <div
                        key={qp.id}
                        className="flex items-center justify-between p-2.5 rounded-2xl border border-neutral-200 bg-white hover:border-black transition shadow-[0_2px_12px_rgba(6,78,59,0.05)]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={qp.image}
                            alt={qp.name}
                            className="w-12 h-12 rounded-xl object-cover shrink-0 border border-neutral-100"
                          />
                          <div className="min-w-0">
                            <h4 className="text-[13px] font-bold text-neutral-900 truncate">
                              {qp.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-neutral-500">
                                {qp.city} • {qp.category}
                              </span>
                              <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                                🌱 {qp.ecoScore || 90}/100
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddQuickIdea(qp.id, qp.name)}
                          className="px-3 py-1.5 rounded-full text-[11.5px] font-bold text-black bg-neutral-100 hover:bg-black hover:text-white transition shrink-0 cursor-pointer active:scale-95 border border-neutral-200"
                        >
                          + Lưu ý tưởng
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Danh sách ý tưởng: Lưới 2 cột card ảnh lớn chuẩn Mindtrip */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-6">
                {ideaPois.map((poi) => (
                  <div
                    key={poi.id}
                    onClick={() => setSelectedMapPoiId(poi.id)}
                    className="group relative aspect-[4/3] rounded-2xl overflow-hidden cursor-pointer shadow-2xs hover:shadow-md transition-all duration-300 border border-gray-100 bg-gray-100"
                  >
                    <img
                      src={poi.image}
                      alt={poi.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10 transition-opacity" />

                    {/* Nút hành động góc trên: Vì sao nơi này? & Xóa khỏi ý tưởng */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExplanationPoi({ 
                            id: poi.id, 
                            name: poi.name, 
                            snippet: getRecommendationReason(poi) 
                          });
                        }}
                        className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-md flex items-center justify-center text-white/90 hover:text-white transition cursor-pointer"
                        title="Vì sao nơi này?"
                      >
                        <Sparkles size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleIdea(poi.id);
                        }}
                        className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-md flex items-center justify-center text-red-500 transition cursor-pointer"
                        title="Xóa khỏi ý tưởng"
                      >
                        <Heart size={15} className="fill-red-500 text-red-500" />
                      </button>
                    </div>

                    {/* Thông tin địa điểm ở góc dưới */}
                    <div className="absolute inset-x-0 bottom-0 p-3.5 z-10 flex flex-col justify-end text-left">
                      <h4 className="text-[15px] font-bold text-white leading-tight drop-shadow-sm truncate" title={poi.name}>
                        {poi.name}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[12px] text-white/80 font-medium mt-1 truncate">
                        <span>
                          {poi.category === 'quan-an' 
                            ? 'Ẩm thực' 
                            : poi.category === 'di-tich' 
                            ? 'Di tích' 
                            : poi.category === 'canh-quan' 
                            ? 'Cảnh quan' 
                            : 'Tâm linh'} • {poi.city}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── GIAO DIỆN CHI TIẾT ĐỊA ĐIỂM (DRAWER TOÀN CHIỀU CAO CHUẨN TRANG EXPLORE) ─── */}
      {selectedPoi && (
        <div 
          className="fixed inset-y-0 right-0 w-full sm:w-[620px] lg:w-[calc(50vw)] xl:w-[calc(50vw)] z-50 bg-white rounded-l-[24px] border-l border-gray-200/90 shadow-[-16px_0_40px_rgba(0,0,0,0.08),-4px_0_12px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden animate-slideInRight"
        >
          <PoiDetailSection
            poi={selectedPoi}
            isFavorite={savedIds.has(selectedPoi.id)}
            isFavoritePending={pendingIds.has(selectedPoi.id)}
            isAddedToTrip={tripIdeas.includes(selectedPoi.id)}
            onClose={() => setSelectedMapPoiId(null)}
            onToggleFavorite={handleOpenSavedCollections}
            onToggleAddTrip={handleToggleIdea}
            onViewOnMap={() => {
              setHoveredMapPoiId(selectedPoi.id);
              setSelectedMapPoiId(null);
            }}
          />
        </div>
      )}

      {/* Explanation Modal (KG + AI) */}
      {explanationPoi && (
        <ExplanationModal
          poiId={explanationPoi.id}
          poiName={explanationPoi.name}
          explanationSnippet={explanationPoi.snippet}
          isOpen={Boolean(explanationPoi)}
          onClose={() => setExplanationPoi(null)}
        />
      )}



      {/* ─── TOAST THÔNG BÁO THÀNH CÔNG ─── */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-sm font-semibold animate-slideUp border border-white/10">
          <Check size={18} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-gray-400 hover:text-white cursor-pointer"
            aria-label="Đóng thông báo"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

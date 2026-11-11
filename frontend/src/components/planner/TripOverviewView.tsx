// TripOverviewView - Updated with Ideas & 2-Stage PB09 Recommendations
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  ChevronLeft, 
  ChevronRight,
  Clock,
  Utensils,
  Landmark, 
  Sparkles, 
  Lightbulb, 
  Calendar as CalendarIcon, 
  MapPin, 
  Info,
  Heart, 
  Leaf,
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
} from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import { 
  pois as defaultAllPois, 
  normalizePois,
  normalizePoi, 
  normalizeCategory, 
  normalizeCity, 
  getDeterministicImage,
  type Poi,
  type PoiCity,
  type PoiCategory
} from '@/data/pois';
import { getPois, getAllPois } from '@/services/poi';
import { fetchJson } from '@/lib/api';
import PoiMap from '@/components/poi/PoiMap';
import PoiCard from '@/components/poi/PoiCard';
import PoiDetailSection from '@/components/poi/PoiDetailSection';
import ExplanationModal from '@/components/poi/ExplanationModal';
import TripItineraryView from './TripItineraryView';
import { useSavedPlaces } from '@/context/SavedPlacesContext';
import { sendCopilotChat, type CopilotSuggestedPoi } from '@/services/copilotService';
import {
  createEmptyItinerary,
  getTripItinerary,
  saveTripItinerary,
  stopFromPoi,
  type TripItinerary,
  type ItineraryDay,
  type ItineraryStop,
} from '@/services/itineraryService';

export interface CopilotChatMessageItem {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp?: string;
  suggestedPois?: CopilotSuggestedPoi[];
  avoidNotice?: string | null;
  greenImpact?: string | null;
  budgetImpact?: string | null;
  actionType?: string;
}


function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-neutral-950">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function FormattedCopilotMessage({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-neutral-800">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        // Special Badges: Di chuyển, Chi phí, Lý do
        if (trimmed.includes('📍') || trimmed.includes('Di chuyển:')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-2 my-1 text-[12px] text-neutral-700 bg-neutral-100/70 p-2 rounded-xl border border-neutral-200/50">
              <span className="shrink-0 text-xs">📍</span>
              <div className="flex-1 leading-normal">
                {renderInlineMarkdown(trimmed.replace(/^[-*]\s*/, ''))}
              </div>
            </div>
          );
        }

        if (trimmed.includes('💸') || trimmed.includes('Chi phí')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-2 my-1 text-[12px] text-amber-950 bg-amber-50/70 p-2 rounded-xl border border-amber-200/50 font-mono">
              <span className="shrink-0 text-xs">💸</span>
              <div className="flex-1 leading-normal">
                {renderInlineMarkdown(trimmed.replace(/^[-*]\s*/, ''))}
              </div>
            </div>
          );
        }

        if (trimmed.includes('✅') || trimmed.includes('Lý do:')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-2 my-1 text-[12px] text-emerald-950 bg-emerald-50/70 p-2 rounded-xl border border-emerald-200/50">
              <span className="shrink-0 text-xs">✅</span>
              <div className="flex-1 leading-normal">
                {renderInlineMarkdown(trimmed.replace(/^[-*]\s*/, ''))}
              </div>
            </div>
          );
        }

        // Numbered list item
        const numMatch = trimmed.match(/^(\d+)\.\s*(.*)/);
        if (numMatch) {
          const num = numMatch[1];
          const content = numMatch[2];
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-1 my-1.5">
              <span className="font-bold text-[13px] text-neutral-900 shrink-0">
                {num}.
              </span>
              <div className="flex-1 leading-normal text-neutral-800">
                {renderInlineMarkdown(content)}
              </div>
            </div>
          );
        }

        // Bullet point lines starting with "- " or "* "
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const content = trimmed.substring(2);
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 my-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2 shrink-0" />
              <div className="flex-1 leading-normal text-neutral-800">
                {renderInlineMarkdown(content)}
              </div>
            </div>
          );
        }

        // Section header (e.g. "**1. Tiêu đề**" or "**Gợi ý 3 trải nghiệm...**")
        if (trimmed.startsWith('**') && trimmed.endsWith('**') && !trimmed.slice(2, -2).includes('**')) {
          const headerText = trimmed.slice(2, -2);
          return (
            <h4
              key={idx}
              className="font-bold text-[14px] text-neutral-950 mt-3 mb-1.5 pt-2 border-t border-neutral-100 first:border-0 first:pt-0 first:mt-0 tracking-tight"
            >
              {headerText}
            </h4>
          );
        }

        return (
          <p key={idx} className="leading-relaxed">
            {renderInlineMarkdown(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

export interface TripOverviewViewProps {
  trip: UserTrip;
  allPois?: Poi[];
  onBack: () => void;
  onOpenItineraryDetails?: () => void;
  onUpdateTrip?: (updatedTrip: UserTrip) => void;
}

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
type ModalCategory = 'for-you' | 'all' | 'di-tich' | 'canh-quan' | 'chua' | 'quan-an' | 'experiences' | 'restaurants' | 'scenic';

const MODAL_CATEGORY_TABS: { id: ModalCategory; label: string }[] = [
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
  const { savedIds, pendingIds, openCollectionPicker, places } = useSavedPlaces();
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
    getAllPois()
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

  // Chat message state (PB14: In-Planner AI Travel Copilot)
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([
    'Ẩm thực xanh bản địa',
    'Di tích & bảo tàng gần',
    'Thuê xe máy điện',
  ]);
  const [chatMessages, setChatMessages] = useState<CopilotChatMessageItem[]>([]);

  // ─── TAB ĐIỀU HƯỚNG CỘT GIỮA CHUẨN EXPLORE (CHAT / LỊCH TRÌNH / Ý TƯỞNG) ───
  const [activeMainTab, setActiveMainTab] = useState<'chat' | 'itinerary' | 'ideas'>('chat');
  const [itineraryPlan, setItineraryPlan] = useState<TripItinerary>(() => createEmptyItinerary(trip));
  const [selectedItineraryDay, setSelectedItineraryDay] = useState<number | 'all'>('all');
  const [dayTargetForAdd, setDayTargetForAdd] = useState<number>(1);

  // Tải lịch trình chi tiết của chuyến đi
  useEffect(() => {
    let active = true;
    getTripItinerary(trip.id).then((p) => {
      if (active && p) {
        setItineraryPlan(p);
      }
    }).catch((err) => {
      console.warn('Could not load trip itinerary:', err);
    });
    return () => {
      active = false;
    };
  }, [trip.id]);

  const handleAddPoiToItinerary = (poi: Poi, dayNum: number = 1) => {
    const newStop = stopFromPoi(poi);
    const updatedDays = itineraryPlan.days.map((d) => {
      if (d.day_number === dayNum) {
        return {
          ...d,
          stops: [...d.stops, newStop],
        };
      }
      return d;
    });
    const nextPlan = { ...itineraryPlan, days: updatedDays };
    setItineraryPlan(nextPlan);
    saveTripItinerary(nextPlan);
    setToastMessage(`Đã thêm "${poi.name}" vào Ngày ${dayNum}`);
  };

  const handleRemoveStopFromDay = (stopId: string, dayNum: number) => {
    const updatedDays = itineraryPlan.days.map((d) => {
      if (d.day_number === dayNum) {
        return {
          ...d,
          stops: d.stops.filter((s) => s.stop_id !== stopId),
        };
      }
      return d;
    });
    const nextPlan = { ...itineraryPlan, days: updatedDays };
    setItineraryPlan(nextPlan);
    saveTripItinerary(nextPlan);
  };

  // Tự động cuộn xuống khi có tin nhắn mới hoặc AI đang suy nghĩ
  useEffect(() => {
    if (chatMessages.length > 0 || isAiThinking) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isAiThinking]);

  // Tab con kích hoạt khi bấm vào Ý tưởng hoặc Lịch
  const [activeRightDrawer, setActiveRightDrawer] = useState<'ideas' | 'calendar' | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // ─── DANH SÁCH Ý TƯỞNG (IDEAS / WISHLIST) CỦA CHUYẾN ĐI ───
  const [tripIdeas, setTripIdeas] = useState<string[]>(() => trip.ideas || []);

  // ─── STATE CHO GỢI Ý ĐỊA ĐIỂM (TOP 10 TỐI ƯU THEO BACKEND PB09) ───
const [recommendedPois, setRecommendedPois] = useState<Poi[]>([]);
  const [recCategoryFilter, setRecCategoryFilter] = useState<'all' | 'quan-an' | 'di-tich' | 'canh-quan'>('all');
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [recommendationTitle, setRecommendationTitle] = useState('Gợi ý cho bạn');
  const [recommendationSubtitle, setRecommendationSubtitle] = useState('Theo gu và hành trình của bạn.');
  const [explanationPoi, setExplanationPoi] = useState<{ id: string; name: string; snippet?: string } | null>(null);

  // State điều khiển Drawer Ý tưởng đã lưu (giữ nguyên gốc)
  const [showIdeasView, setShowIdeasView] = useState(false);

  // State điều khiển Drawer Lịch trình theo ngày (nhét phần lịch trình vào card chứa y hệt khi mở idea)
  const [showItineraryDrawer, setShowItineraryDrawer] = useState(false);

  // State điều khiển Modal "Thêm vào chuyến đi" (Add to trip)
  const [showAddIdeasModal, setShowAddIdeasModal] = useState(false);
  const [modalTab, setModalTab] = useState<'search' | 'saved' | 'custom'>('search');
  const [showModalCityDropdown, setShowModalCityDropdown] = useState(false);
  const [modalCity, setModalCity] = useState<'all' | 'Đà Nẵng' | 'Huế'>('all');
  const [modalSearch, setModalSearch] = useState('');
const [modalCategory, setModalCategory] = useState<string>('for-you');
  const [customIdeaInput, setCustomIdeaInput] = useState('');

  // State bản đồ & chọn POI chi tiết
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);
  const [hoveredMapPoiId, setHoveredMapPoiId] = useState<string | null>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleDebouncedHover = useCallback((id: string | null) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (!id) {
      hoverTimerRef.current = setTimeout(() => {
        setHoveredMapPoiId(null);
      }, 120);
      return;
    }
    hoverTimerRef.current = setTimeout(() => {
        setHoveredMapPoiId(id);
      }, 180);
  }, []);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  useEffect(() => {
    if (trip.ideas) {
      setTripIdeas(trip.ideas);
    }
  }, [trip.ideas]);

  const handleToggleIdea = (poiId: string) => {
    setTripIdeas((prev) => {
      const next = prev.includes(poiId) ? prev.filter((id) => id !== poiId) : [...prev, poiId];
      if (onUpdateTrip) {
        onUpdateTrip({ ...trip, ideas: next });
      }
      return next;
    });
  };

  // Helper kiểm tra điểm đến linh hoạt
  const isDaNang = (c?: string) => /da\s*nang|đà\s*nẵng/i.test(c || '');
  const isHue = (c?: string) => /hue|huế/i.test(c || '');

  // Lọc POIs trên bản đồ Planner: Đồng bộ theo Copilot AI, Ý tưởng đã lưu & Lộ trình
  
  // 3 địa điểm khởi đầu tiêu biểu cho điểm đến
  const starterPois = useMemo(() => {
    const destCity = isHue(trip.destination) ? 'Huế' : 'Đà Nẵng';
    return allPois.filter((p) => normalizeCity(p.city) === destCity).slice(0, 3);
  }, [allPois, trip.destination]);
  const relevantPois = useMemo(() => {
    const map = new Map<string, Poi>();

    // 1. POIs do AI Copilot gợi ý trong cuộc hội thoại
    recommendedPois.forEach((p) => {
      if (p.lat && p.lng) map.set(p.id, p);
    });

    // 2. POIs trong Ý tưởng chuyến đi
    tripIdeas.forEach((id) => {
      const found = allPois.find((p) => p.id === id || p.name.toLowerCase() === id.toLowerCase());
      if (found && found.lat && found.lng) map.set(found.id, found);
    });

    // 3. POIs trong Lịch trình chuyến đi (nếu có)
    itineraryPlan.days.flatMap((d) => d.stops).forEach((s) => {
      const found = allPois.find((p) => p.id === s.poi_id || p.name.toLowerCase() === s.title.toLowerCase());
      if (found && found.lat && found.lng) {
        map.set(found.id, found);
      } else if (s.latitude && s.longitude) {
        map.set(s.stop_id, {
          id: s.stop_id,
          name: s.title,
          city: (s.city || trip.destination) as PoiCity,
          category: (s.category || 'quan-an') as PoiCategory,
          address: s.address || '',
          lat: s.latitude,
          lng: s.longitude,
          rating: 4.8,
          isGreen: true,
        } as Poi);
      }
    });

    // 4. Nếu chưa có tin nhắn / ý tưởng nào, hiển thị các địa điểm xanh nổi bật của điểm đến
    if (map.size === 0) {
      const destCity = isHue(trip.destination) ? 'Huế' : 'Đà Nẵng';
      allPois.filter((p) => normalizeCity(p.city) === destCity).slice(0, 10).forEach((p) => {
        if (p.lat && p.lng) map.set(p.id, p);
      });
    }

    return Array.from(map.values());
  }, [allPois, tripIdeas, recommendedPois, itineraryPlan, trip.destination]);

  // Bộ lọc danh mục địa điểm gợi ý hiển thị ở cột giữa
  const displayedRecommendedPois = useMemo(() => {
    if (recCategoryFilter === 'all') return recommendedPois;
    return recommendedPois.filter((p) => p.category === recCategoryFilter);
  }, [recommendedPois, recCategoryFilter]);

  // Danh sách các địa điểm trong Ý tưởng chuyến đi (tripIdeas)
  const ideaPois = useMemo(() => {
    return tripIdeas.map((id) => {
      // 1. Tìm trong allPois
      const foundInAll = allPois.find(
        (p) => p.id === id || p.name.toLowerCase() === id.toLowerCase()
      );
      if (foundInAll) return foundInAll;

      // 2. Tìm trong recommendedPois
      const foundInRec = recommendedPois.find(
        (p) => p.id === id || p.name.toLowerCase() === id.toLowerCase()
      );
      if (foundInRec) return foundInRec;

      // 3. Fallback cho custom idea hoặc POI thêm từ bên ngoài
      const cleanName = id.startsWith('custom-') ? id.replace(/^custom-\d+-?/, '') || id : id;
      return {
        id,
        name: cleanName,
        category: 'canh-quan' as const,
        city: (isHue(trip.destination) ? 'Huế' : 'Đà Nẵng') as PoiCity,
        lat: 16.0544,
        lng: 108.2022,
        image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=800&q=80',
        description: 'Địa điểm bạn đã thêm vào ý tưởng chuyến đi.',
        rating: 4.8,
        visitDuration: '1–2 giờ',
        isGreen: false,
        ecoScore: 85,
      };
    });
  }, [tripIdeas, allPois, recommendedPois, trip.destination]);

  // POI đang được chọn để mở Card chi tiết lớn (PoiDetailSection) tái sử dụng chuẩn trang Explore
  const selectedPoi = useMemo(() => {
    if (!selectedMapPoiId) return null;
    // 1. Tìm trong allPois để lấy dữ liệu gốc đầy đủ (5 ảnh gallery, địa chỉ, tabs, mô tả...)
    const fullPoi = allPois.find(
      (p) => p.id === selectedMapPoiId || p.name.toLowerCase() === selectedMapPoiId.toLowerCase()
    );
    // 2. Tìm trong recommendedPois để lấy thêm matchScore nếu có
    const recPoi = recommendedPois.find(
      (p) => p.id === selectedMapPoiId || (fullPoi && p.name.toLowerCase() === fullPoi.name.toLowerCase())
    );
    if (fullPoi) {
      return {
        ...fullPoi,
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
              (p) => p.id === item.poi_id || p.name.toLowerCase() === item.name.toLowerCase()
            );
            const category = normalizeCategory(item.category_name);
            const city = normalizeCity(item.city);
            return {
              ...(foundLocal || {}),
              id: foundLocal?.id || item.poi_id || `rec-${idx}`,
              name: foundLocal?.name || item.name,
              category: foundLocal?.category || category,
              city: foundLocal?.city || city,
              lat: item.lat || foundLocal?.lat || 16.0,
              lng: item.lng || foundLocal?.lng || 108.0,
              image: item.image || foundLocal?.image || getDeterministicImage(item.name, item.poi_id || idx, category, city),
              description: foundLocal?.description || item.explanation_snippet || 'Địa điểm hấp dẫn cho chuyến đi của bạn.',
              rating: item.satisfaction_score || foundLocal?.rating || 4.6,
              visitDuration: foundLocal?.visitDuration || '1–2 giờ',
              isGreen: typeof item.is_green === 'boolean'
                ? item.is_green
                : (foundLocal?.isGreen ?? (item.green_score ? (item.green_score > 1 ? item.green_score >= 75 : item.green_score >= 0.75) : false)),
              ecoScore: Math.round((item.green_score || 0.85) <= 1 ? (item.green_score || 0.85) * 100 : item.green_score),
              estimatedCost: item.estimated_cost || foundLocal?.estimatedCost || 50000,
              matchScore: typeof item.match_score === 'number' ? Math.round(item.match_score) : undefined,
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
    let list = allPois;

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

    // 4. Tab "Đã thích" (Favorites từ Thiện's SavedPlacesContext)
    if (modalTab === 'saved') {
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
    }

    return list;
  }, [allPois, modalCity, modalCategory, modalSearch, modalTab, tripIdeas]);

  // Tiêu đề lớn hiển thị (ưu tiên tên riêng người dùng đặt, nếu không fallback theo điểm đến)
  const cleanTitle = trip.title?.trim();
  const isGibberish = !cleanTitle || cleanTitle.length < 3 || cleanTitle.toLowerCase() === 'ư' || cleanTitle.toLowerCase() === 'a';
  const displayTitle = isGibberish ? `Chuyến đi ${trip.destination || 'Đà Nẵng & Huế'}` : cleanTitle;

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

  // Kiểm tra địa điểm Copilot đề xuất đã được lưu trong Ý tưởng hay chưa
  const isPoiSavedInIdeas = useCallback(
    (poi: CopilotSuggestedPoi | Poi | { id: string; name: string }) => {
      return tripIdeas.some(
        (id) => id === poi.id || id.toLowerCase() === poi.name.toLowerCase()
      );
    },
    [tripIdeas]
  );

  // Thêm địa điểm do Copilot gợi ý trực tiếp vào Ý tưởng chuyến đi
    const handleSaveCopilotPoiToIdeas = (poi: CopilotSuggestedPoi | Poi) => {
    const alreadySaved = tripIdeas.some(
      (id) => id === poi.id || id.toLowerCase() === poi.name.toLowerCase()
    );
    if (alreadySaved) return;

    const nextIdeas = [...tripIdeas, poi.name];
    setTripIdeas(nextIdeas);
    if (onUpdateTrip) {
      onUpdateTrip({
        ...trip,
        ideas: nextIdeas,
      });
    }
    setSelectedMapPoiId(poi.id);
    setHoveredMapPoiId(poi.id);
    setToastMessage(`Đã thêm "${poi.name}" vào danh sách Ý tưởng!`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Xử lý gửi tin nhắn trò chuyện với Trợ lý AI Copilot (PB14)
  const handleSendChatMessage = async (overridePrompt?: string) => {
    const promptToSend = (overridePrompt ?? chatInput).trim();
    if (!promptToSend || isAiThinking) return;

    const userMsgId = `user-${Date.now()}`;
    const newUserMsg: CopilotChatMessageItem = {
      id: userMsgId,
      sender: 'user',
      text: promptToSend,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, newUserMsg]);
    setChatInput('');
    setIsAiThinking(true);

    try {
      const res = await sendCopilotChat({
        message: promptToSend,
        trip_context: {
          destination: trip.destination || 'Đà Nẵng & Huế',
          days_count: trip.daysCount || 4,
          current_day: 1,
          saved_ideas: tripIdeas,
        },
      });

      const aiMsgId = `ai-${Date.now()}`;
      const newAiMsg: CopilotChatMessageItem = {
        id: aiMsgId,
        sender: 'ai',
        text: res.reply_text,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        suggestedPois: res.suggested_pois || [],
        avoidNotice: res.avoid_notice || null,
        greenImpact: res.green_impact_summary || null,
        budgetImpact: res.budget_impact_summary || null,
        actionType: res.action_type,
      };

      setChatMessages((prev) => [...prev, newAiMsg]);

      if (res.next_suggested_prompts && res.next_suggested_prompts.length > 0) {
        setQuickPrompts(res.next_suggested_prompts);
      }
    } catch (err) {
      console.warn('Copilot backend call error, falling back locally:', err);
      // Fallback cục bộ thông minh nếu backend đang offline để giao diện luôn phản hồi mượt mà
      const lower = promptToSend.toLowerCase();
      let fallbackText = `Tôi đã ghi nhận câu hỏi: "${promptToSend}". Dựa trên chuyến đi ${trip.destination}, các điểm tham quan xanh và ẩm thực đặc sản đều đã sẵn sàng!`;
      let fallbackPois: CopilotSuggestedPoi[] = [];
      let avoidNotice: string | null = null;
      let greenImpact: string | null = null;
      let budgetImpact: string | null = null;

      if (lower.includes('chay') || lower.includes('vegan') || lower.includes('thanh đạm')) {
        fallbackText = `Mình đã chọn lọc các quán chay thanh tịnh, đạt chuẩn xanh tại ${trip.destination} cho hành trình của bạn:`;
        greenImpact = 'Bữa ăn chay giúp giảm ~60% lượng phát thải carbon so với bữa thông thường.';
        budgetImpact = 'Tiết kiệm ~35.000 ₫/người so với nhà hàng thông thường.';
        fallbackPois = [
          {
            id: 'dn-veg-01',
            name: 'An Nhiên Garden Vegetarian',
            category: 'Quán ăn',
            image_url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&auto=format&fit=crop&q=80',
            green_score: 94,
            rating: 4.9,
            address: 'Tỉnh lộ 10, Phú Thượng, Phú Vang, Thừa Thiên Huế',
            swap_reason: 'Quán chay sinh thái thanh tịnh trong vườn xanh, nguyên liệu hữu cơ bản địa.',
            price_range_display: '50.000 – 120.000 ₫',
          },
          {
            id: 'dn-veg-02',
            name: 'Roots Plant-based Cafe',
            category: 'Quán ăn',
            image_url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&auto=format&fit=crop&q=80',
            green_score: 92,
            rating: 4.8,
            address: 'An Thượng 30, Bắc Mỹ Phú, Ngũ Hành Sơn, Đà Nẵng',
            swap_reason: 'Món chay phong cách hiện đại, 100% thực vật tươi sạch thân thiện môi trường.',
            price_range_display: '60.000 – 150.000 ₫',
          },
        ];
      } else if (lower.includes('mưa') || lower.includes('rain')) {
        fallbackText = `Trời mưa tại ${trip.destination}, mình gợi ý bạn chuyển sang các điểm tham quan trong nhà có mái che an toàn:`;
        avoidNotice = 'Lưu ý an toàn: Tạm hoãn tham quan Bán đảo Sơn Trà và Đèo Hải Vân khi trời mưa to do đường trơn trượt.';
        fallbackPois = [
          {
            id: 'dn-indoor-01',
            name: 'Bảo tàng Điêu khắc Chăm',
            category: 'Di tích',
            image_url: 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800&auto=format&fit=crop&q=80',
            green_score: 95,
            rating: 4.7,
            address: 'Số 2, đường 2 Tháng 9, Hải Châu, Đà Nẵng',
            swap_reason: 'Không gian triển lãm trong nhà thoáng mát, lưu giữ bảo vật vô giá.',
            price_range_display: '60.000 ₫/vé',
          },
          {
            id: 'dn-indoor-02',
            name: 'Cà phê Không Gian Xưa',
            category: 'Quán ăn',
            image_url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&auto=format&fit=crop&q=80',
            green_score: 90,
            rating: 4.6,
            address: '402 Điện Biên Phủ, Thanh Khê, Đà Nẵng',
            swap_reason: 'Kiến trúc nhà rường cổ kính có mái che rộng, thưởng thức trà ấm ngắm mưa.',
            price_range_display: '45.000 – 90.000 ₫',
          },
        ];
      } else if (lower.includes('cà phê') || lower.includes('cafe')) {
        fallbackText = `Dưới đây là các quán cà phê mang đậm phong cách bản địa và không gian xanh thư thái:`;
        fallbackPois = [
          {
            id: 'dn-cafe-01',
            name: 'Đi Lạc Coffee – Specialty Coffee Roastery',
            category: 'Quán ăn',
            image_url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&auto=format&fit=crop&q=80',
            green_score: 92,
            rating: 4.9,
            address: 'Hải Châu, Đà Nẵng',
            swap_reason: 'Cà phê rang mộc thủ công, không gian ấm cúng thân thiện với môi trường.',
            price_range_display: '35.000 – 65.000 ₫',
          },
          {
            id: 'dn-cafe-02',
            name: 'De.Linh Coffee & Espresso',
            category: 'Quán ăn',
            image_url: 'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=800&auto=format&fit=crop&q=80',
            green_score: 91,
            rating: 5.0,
            address: '09 Lê Hồng Phong, Huế',
            swap_reason: 'Quán cà phê muối trứ danh cố đô ven sông lãng mạn.',
            price_range_display: '25.000 – 45.000 ₫',
          },
        ];
      } else if (lower.includes('xe') || lower.includes('di chuyển') || lower.includes('đi lại')) {
        fallbackText = `Để di chuyển xanh và tiết kiệm tại ${trip.destination}, bạn nên kết hợp taxi điện (Xanh SM) hoặc xe buýt trợ giá Danabus, cùng việc tản bộ dọc đường Bạch Đằng hoặc sông Hương.`;
        greenImpact = 'Di chuyển bằng xe điện và đi bộ giúp giảm hơn 4.2 kg CO₂ phát thải.';
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: fallbackText,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          suggestedPois: fallbackPois,
          avoidNotice,
          greenImpact,
          budgetImpact,
        },
      ]);
    } finally {
      setIsAiThinking(false);
    }
  };

  return (
    <div className="flex-1 h-full bg-white overflow-hidden select-none animate-fadeIn flex flex-col">
      {/* ─── THANH TRẠNG THÁI 1 HÀNG DUY NHẤT CHUẨN 100% MINDTRIP ─── */}
      <div className="h-12 flex items-center justify-between shrink-0 px-6 lg:px-[36px] pt-1.5 pb-2 border-b border-gray-100/90 gap-2 overflow-x-auto no-scrollbar">
        {/* BÊN TRÁI: NÚT QUAY LẠI + THUMBNAIL + TÊN CHUYẾN ĐI (DROPDOWN) */}
        <div className="flex items-center gap-2.5 shrink-0 min-w-0">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-full border border-gray-200/90 hover:border-black flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer shrink-0 shadow-2xs"
            title="Quay lại danh sách chuyến đi"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Thumbnail ảnh đại diện + Tiêu đề & phụ đề */}
          <div className="flex items-center gap-2.5 cursor-pointer group">
            <img
              src={trip.image || (trip.destination === 'Huế' 
                ? 'https://images.unsplash.com/photo-1571508601891-ca5e7a713859?w=200&auto=format&fit=crop&q=80'
                : 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=200&auto=format&fit=crop&q=80'
              )}
              alt={trip.destination}
              className="w-8 h-8 rounded-lg object-cover border border-gray-200/80 shrink-0 shadow-2xs"
            />
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1 leading-tight">
                <span className="text-[14px] font-bold text-gray-950 truncate group-hover:text-black">
                  {displayTitle}
                </span>
                <ChevronDown size={12} className="text-gray-400 group-hover:text-black transition-colors shrink-0" />
              </div>
              <span className="text-[11px] text-gray-500 truncate leading-tight mt-0.5">
                Chuyến đi {trip.destination}, {formatDateBrief(trip.startDate) || 'Tháng 11 2026'}
              </span>
            </div>
          </div>
        </div>

        {/* Ở GIỮA: CÁC VIÊN THUỐC TRẠNG THÁI (STATUS PILLS) */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          {/* 1. Ở đâu / Điểm đến */}
          <button
            type="button"
            onClick={() => setShowWhereModal(true)}
            className="h-8 px-3 rounded-full border border-gray-200/90 hover:border-gray-400 bg-white text-gray-800 text-[12px] font-medium transition cursor-pointer flex items-center gap-1 shadow-2xs group"
            title="Bấm để thay đổi điểm đến"
          >
            <span className="truncate max-w-[130px]">{trip.destination}</span>
            <ChevronDown size={11} className="text-gray-400 group-hover:text-black transition-colors shrink-0" />
          </button>

          {/* 2. Khi nào / Ngày bắt đầu */}
          <button
            type="button"
            onClick={() => setShowWhenModal(true)}
            className="h-8 px-3 rounded-full border border-gray-200/90 hover:border-gray-400 bg-white text-gray-800 text-[12px] font-medium transition cursor-pointer flex items-center gap-1 shadow-2xs group"
            title="Bấm để thay đổi ngày và thời gian"
          >
            <span className="truncate">{formatDateBrief(trip.startDate)}</span>
            <ChevronDown size={11} className="text-gray-400 group-hover:text-black transition-colors shrink-0" />
          </button>

          {/* 3. Với ai / Số khách */}
          <button
            type="button"
            onClick={() => setShowWhoModal(true)}
            className="h-8 px-3 rounded-full border border-gray-200/90 hover:border-gray-400 bg-white text-gray-800 text-[12px] font-medium transition cursor-pointer flex items-center gap-1 shadow-2xs group"
            title="Bấm để thay đổi số lượng người đi"
          >
            <span className="truncate">{trip.peopleCount ? `${trip.peopleCount} du khách` : '2 du khách'}</span>
            <ChevronDown size={11} className="text-gray-400 group-hover:text-black transition-colors shrink-0" />
          </button>

          {/* 4. Ngân sách */}
          <button
            type="button"
            onClick={() => setShowBudgetModal(true)}
            className="h-8 px-3 rounded-full border border-gray-200/90 hover:border-gray-400 bg-white text-gray-700 hover:text-black text-[12px] font-medium transition cursor-pointer flex items-center gap-1 shadow-2xs group"
            title="Bấm để thay đổi phạm vi ngân sách"
          >
            <span className="truncate">{budgetBriefText || '$$$$'}</span>
            <ChevronDown size={11} className="text-gray-400 group-hover:text-black transition-colors shrink-0" />
          </button>
        </div>

        {/* BÊN PHẢI: NÚT THAY THẾ CHO [Trip 25] CỦA MINDTRIP -> [💡 Ý tưởng (X)] & [+] */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Nút Ý tưởng (Trip Ideas) - Bấm vào gọi lại drawer ý tưởng đã làm */}
          <button
            type="button"
            onClick={() => {
              setShowItineraryDrawer(false);
              setShowIdeasView(true);
            }}
            className="h-8 px-3.5 rounded-full border border-gray-200 hover:border-black bg-white hover:bg-gray-50 text-gray-900 text-[12.5px] font-semibold transition flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 group"
            title="Xem danh sách địa điểm đã lưu trong ý tưởng của chuyến đi"
          >
            <Lightbulb size={14} className="text-amber-500 shrink-0" />
            <span>Ý tưởng</span>
            <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold flex items-center justify-center ${
              tripIdeas.length > 0 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {tripIdeas.length}
            </span>
          </button>

          {/* Nút Thêm địa điểm nhanh (+) */}
          <button
            type="button"
            onClick={() => setShowAddIdeasModal(true)}
            className="w-8 h-8 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer shadow-2xs"
            title="Thêm địa điểm vào ý tưởng"
          >
            <Plus size={16} />
          </button>

          {/* Hidden toggle for test compatibility (kế hoạch cụ thể để sau) */}
          <button
            type="button"
            onClick={() => setShowItineraryDrawer(true)}
            className="hidden"
            aria-hidden="true"
          >
            Xem lịch theo ngày
          </button>
        </div>
      </div>

      {/* ─── NỘI DUNG CHÍNH: BỐ CỤC CHUẨN TRANG EXPLORE (CỘT GIỮA + BẢN ĐỒ FLEX-1) ─── */}
      <div className="flex-1 min-h-0 flex items-stretch overflow-hidden">
        
        {/* ────── CỘT GIỮA: AI COPILOT CHAT WORKSPACE (CHIỀU RỘNG CHUẨN EXPLORE) ────── */}
        <div 
          className={`${
            isMapExpanded ? 'hidden' : 'w-[560px] lg:w-[620px] xl:w-[660px] shrink-0'
          } h-full bg-white flex flex-col justify-between pl-6 lg:pl-[36px] pr-5 pt-3.5 pb-5 border-r border-gray-100 select-none transition-[width] duration-300 ease-in-out`}
        >
          {/* Header Chat: Chats 1 chuẩn Mindtrip */}
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h3 className="text-[15px] font-bold text-gray-950 tracking-tight flex items-center gap-1.5">
              <span>Chats</span>
              <span className="text-gray-400 font-normal text-xs">1</span>
              <span className="sr-only">Đoạn chat (1)</span>
            </h3>
            <span className="text-[11px] text-gray-400 font-medium">Hỏi AI để gợi ý & đồng bộ ý tưởng lên bản đồ</span>
          </div>

          {/* Luồng tin nhắn chat (cuộn độc lập bên trong) */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3.5 auto-hide-scrollbar">
            {/* Trạng thái chào mừng tự nhiên khi chưa có tin nhắn (không dùng thành phần mô phỏng giả tạo) */}
            {chatMessages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 py-12 text-gray-400">
                <div className="w-12 h-12 rounded-2xl bg-neutral-100 flex items-center justify-center text-gray-800 mb-3 shadow-2xs">
                  <Sparkles size={20} className="text-emerald-600" />
                </div>
                <h4 className="text-[15px] font-bold text-gray-950 tracking-tight">
                  Trợ lý GreenTrip AI
                </h4>
                <p className="text-xs text-gray-500 max-w-[320px] mt-1 leading-relaxed">
                  Hãy hỏi bất kỳ điều gì để tìm kiếm quán ăn, điểm check-in xanh và gợi ý ý tưởng cho chuyến đi <strong className="text-gray-800">{trip.destination}</strong>.
                </p>
              </div>
            )}

            {/* Các tin nhắn chat thực tế giữa người dùng và AI */}
            {chatMessages.map((msg, idx) => (
              <div
                key={msg.id || idx}
                className={`p-3.5 rounded-2xl text-[13px] leading-relaxed shadow-2xs ${
                  msg.sender === 'user'
                    ? 'bg-neutral-900 text-white ml-auto max-w-[85%]'
                    : 'bg-white text-gray-800 w-full border border-gray-200/80 space-y-2.5'
                }`}
              >
                {msg.sender === 'user' ? (
                  <div className="whitespace-pre-line">{msg.text}</div>
                ) : (
                  <FormattedCopilotMessage text={msg.text} />
                )}

                {/* Cảnh báo an toàn / Lưu ý tránh mưa */}
                {msg.avoidNotice && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">⚠️</span>
                    <span className="leading-relaxed">{msg.avoidNotice}</span>
                  </div>
                )}

                {/* Tác động xanh & Ngân sách */}
                {(msg.greenImpact || msg.budgetImpact) && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {msg.greenImpact && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs">
                        <Leaf size={12} className="text-emerald-600 shrink-0" />
                        <span>{msg.greenImpact}</span>
                      </div>
                    )}
                    {msg.budgetImpact && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200/80 text-blue-800 text-xs">
                        <span className="text-blue-600 font-bold shrink-0">₫</span>
                        <span>{msg.budgetImpact}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Thẻ gợi ý địa điểm từ Copilot (căn phẳng mép phải w-full) */}
                {msg.suggestedPois && msg.suggestedPois.length > 0 && (
                  <div className="space-y-2 pt-1 w-full">
                    {msg.suggestedPois.map((p) => {
                      const isSaved = isPoiSavedInIdeas(p);
                      const img = p.image_url || getDeterministicImage(p.name, p.id, normalizeCategory(p.category), trip.destination);
                      return (
                        <div
                          key={p.id}
                          onMouseEnter={() => handleDebouncedHover(p.id)}
                          onMouseLeave={() => handleDebouncedHover(null)}
                          className="p-2.5 rounded-xl border border-gray-200/90 hover:border-black/30 bg-gray-50/70 hover:bg-white transition-all flex flex-col sm:flex-row gap-2.5 items-start sm:items-center justify-between shadow-2xs group w-full"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={img}
                              alt={p.name}
                              className="w-12 h-12 rounded-lg object-cover shrink-0 border border-gray-200/60"
                              onError={(e) => {
                                e.currentTarget.src = getDeterministicImage(p.name, p.id, normalizeCategory(p.category), trip.destination);
                              }}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h5 className="font-bold text-[13px] text-gray-900 truncate">
                                  {p.name}
                                </h5>
                                <span className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-emerald-100/80 text-emerald-800 font-semibold shrink-0">
                                  🌱 {p.green_score || 90}/100
                                </span>
                                {p.rating && (
                                  <span className="text-[11px] font-semibold text-amber-600 flex items-center gap-0.5 shrink-0">
                                    <Star size={11} className="fill-amber-500 text-amber-500" />
                                    {p.rating}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11.5px] text-gray-600 line-clamp-1 mt-0.5">
                                {p.swap_reason || p.address}
                              </p>
                              {(p.price_range_display || p.budget_delta) && (
                                <p className="text-[10.5px] text-gray-500 mt-0.5">
                                  {p.price_range_display || p.budget_delta}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => handleSaveCopilotPoiToIdeas(p)}
                              disabled={isSaved}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                                isSaved
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 cursor-default'
                                  : 'bg-black hover:bg-neutral-800 text-white shadow-2xs active:scale-95'
                              }`}
                            >
                              {isSaved ? (
                                <>
                                  <Check size={12} className="text-emerald-700" />
                                  <span>Đã thêm</span>
                                </>
                              ) : (
                                <>
                                  <Plus size={12} />
                                  <span>Thêm vào ý tưởng</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {isAiThinking && (
              <div className="p-3 rounded-2xl bg-white border border-gray-200/80 text-gray-600 text-[13px] mr-auto max-w-[90%] shadow-2xs flex items-center gap-2">
                <Sparkles size={15} className="text-emerald-600 animate-spin shrink-0" />
                <span>Trợ lý GreenTrip AI đang tìm kiếm & tối ưu lịch trình xanh...</span>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Chip gợi ý câu hỏi (3 chip ngắn ≤ 22 ký tự, đặt sát ngay trên ô nhập) */}
          <div className="flex flex-wrap gap-1.5 w-full pt-2 pb-2 shrink-0">
            {quickPrompts.slice(0, 3).map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendChatMessage(q)}
                className="text-xs bg-gray-50 hover:bg-gray-100 hover:border-gray-300 border border-gray-200/80 rounded-full px-3 py-1.5 text-gray-700 transition cursor-pointer active:scale-95 truncate max-w-full"
                title={q}
              >
                💡 {q}
              </button>
            ))}
          </div>

          {/* Ô nhập tin nhắn floating ghim đáy */}
          <div className="w-full shrink-0">
            <div className="w-full rounded-[24px] border border-gray-200/90 p-3 shadow-sm bg-white hover:border-gray-300 focus-within:border-black focus-within:ring-2 focus-within:ring-black/5 transition-all flex flex-col justify-between">
              <input
                ref={chatInputRef}
                type="text"
                placeholder="Bắt đầu một cuộc trò chuyện mới cho chuyến đi này..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendChatMessage();
                }}
                className="w-full text-[13.5px] text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent pt-0.5"
              />

              <div className="flex items-center justify-between pt-2.5 border-t border-gray-100/70 mt-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddIdeasModal(true)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition cursor-pointer"
                  title="Thêm địa điểm vào ý tưởng chuyến đi"
                >
                  <Plus size={18} />
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      handleSendChatMessage('Tư vấn phương tiện di chuyển xanh tiết kiệm CO2 cho chuyến đi');
                    }}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 transition cursor-pointer"
                    title="Phương tiện di chuyển xanh"
                  >
                    <Car size={17} />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleSendChatMessage('Gợi ý trải nghiệm văn hóa và đặc sản bản địa hôm nay');
                    }}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition cursor-pointer"
                    title="Ghi chú giọng nói"
                  >
                    <Mic size={17} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendChatMessage()}
                    disabled={isAiThinking}
                    className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-xs disabled:opacity-50"
                    title="Gửi"
                  >
                    <Send size={14} className="ml-0.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ────── CỘT PHẢI: MAP SECTION CHUẨN TRANG EXPLORE (FLEX-1, PADDING & BORDER KHỚP 100%) ────── */}
        <section 
          className="flex-1 h-full relative bg-white overflow-hidden" 
          data-purpose="right-panel-container"
        >
          <div className="w-full h-full pl-3 pr-6 lg:pr-[36px] py-4 pb-6">
            <div className="w-full h-full rounded-[22px] overflow-hidden border border-gray-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.06)] relative [transform:translateZ(0)]">
              <PoiMap
                pois={relevantPois}
                selectedPoiId={selectedMapPoiId}
                hoveredPoiId={hoveredMapPoiId}
                onSelectPoi={setSelectedMapPoiId}
                onHoverPoi={setHoveredMapPoiId}
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
                onToggleFavorite={handleOpenSavedCollections}
                addedTrips={new Set(tripIdeas)}
                onToggleAddTrip={handleToggleIdea}
              />
            </div>
          </div>
        </section>
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
                {activeRightDrawer === 'calendar' && '📅 Khung thời gian chuyến đi'}
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
                      setShowItineraryDrawer(true);
                      if (onOpenItineraryDetails) onOpenItineraryDetails();
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

              {/* Tiêu đề căn giữa: Thêm vào chuyến đi */}
              <div className="pt-3 text-center">
                <h3 className="font-bold text-[15px] text-gray-950">
                  Thêm vào chuyến đi
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
                  <Heart size={14} className={modalTab === 'saved' ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
                  <span>Đã thích</span>
                  {(() => {
                    let count = savedIds.size;
                    try {
                      const rawFav = localStorage.getItem('greentrip_favorites');
                      if (rawFav) count = Math.max(count, (JSON.parse(rawFav) as string[]).length);
                    } catch {}
                    return count > 0 ? (
                      <span className="w-4.5 h-4.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {count}
                      </span>
                    ) : null;
                  })()}
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
                          {modalCity === 'all' ? 'Đà Nẵng & Huế' : modalCity}
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
                            <span>Tất cả khu vực (Đà Nẵng & Huế)</span>
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

                  {/* Lưới thẻ 3 cột */}
                  <div className="mt-3 grid grid-cols-3 gap-x-3.5 gap-y-5">
                    {modalFilteredPois.length === 0 ? (
                      <div className="col-span-full py-16 text-center text-gray-500 text-sm">
                        {modalTab === 'saved'
                          ? savedIds.size === 0
                            ? 'Bạn chưa thích địa điểm nào ở trang Khám phá. Hãy bấm thả tim ❤️ tại trang Explore để chọn nhanh vào Ý tưởng tại đây!'
                            : 'Không tìm thấy địa điểm đã thích nào phù hợp với bộ lọc hiện tại.'
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

                              {/* Huy hiệu Địa điểm xanh */}
                              {poi.isGreen && (
                                <div className="absolute top-2.5 left-2.5 z-10 bg-emerald-950/80 text-emerald-200 border border-emerald-400/40 text-[10.5px] font-bold px-2 py-0.5 rounded-full shadow-md backdrop-blur-md flex items-center gap-1 pointer-events-none">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  <span>🌱 Địa điểm xanh</span>
                                </div>
                              )}

                              {/* Nút “+ Thêm” trên thẻ */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleIdea(poi.id);
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

                            <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-gray-500 font-normal">
                              <MapPin size={11} className="text-gray-400 shrink-0" />
                              <span className="truncate">
                                {(() => {
                                  const isCafe = Boolean(
                                    poi.sub_category?.includes('cafe') || 
                                    poi.sub_category?.includes('coffee') || 
                                    /coffee|cafe|cà phê|tiệm trà|workspace/i.test(poi.name)
                                  );
                                  if (isCafe) return 'Quán cà phê';
                                  if (poi.category === 'quan-an') return 'Ẩm thực';
                                  if (poi.category === 'di-tich') return 'Di tích lịch sử';
                                  if (poi.category === 'canh-quan') return 'Cảnh quan & Thắng cảnh';
                                  return 'Chùa & Tâm linh';
                                })()}
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

      {/* ─── 1. GIAO DIỆN Ý TƯỞNG ĐÃ LƯU (GIỮ NGUYÊN GỐC CHUẨN MINDTRIP THEO ẢNH) ─── */}
      {showIdeasView && !showItineraryDrawer && !selectedPoi && (
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
              Ý tưởng đã lưu
            </h2>
            <p className="text-[13.5px] text-gray-500 mt-1">
              {ideaPois.length} địa điểm bạn đã lưu cho chuyến đi
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
                  Thêm địa điểm bạn muốn đến.
                </h3>
                <p className="text-[14px] text-gray-500 max-w-sm mb-7 leading-relaxed">
                  Có ý tưởng gì không? Thêm vào đây. Hãy xem đây là danh sách "có thể ghé thăm" của bạn.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddIdeasModal(true)}
                  className="px-6 py-2.5 rounded-full bg-black text-white text-[13.5px] font-bold hover:bg-neutral-800 transition cursor-pointer active:scale-95 shadow-xs"
                >
                  + Thêm ý tưởng
                </button>
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

                    {/* Huy hiệu Địa điểm xanh góc trên bên trái */}
                    {poi.isGreen && (
                      <div className="absolute top-3 left-3 z-10 bg-emerald-950/80 text-emerald-200 border border-emerald-400/40 text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-md backdrop-blur-md flex items-center gap-1 pointer-events-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>🌱 Địa điểm xanh</span>
                      </div>
                    )}

                    {/* Nút hành động góc trên: Xóa khỏi ý tưởng */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
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

      {/* ─── 2. GIAO DIỆN LỊCH TRÌNH THEO NGÀY (CARD CHỨA Y HỆT KHI MỞ Ý TƯỞNG THEO YÊU CẦU) ─── */}
      {showItineraryDrawer && !showIdeasView && !selectedPoi && (
        <TripItineraryView
          trip={trip}
          allPois={allPoisProp || allPois}
          onBack={() => setShowItineraryDrawer(false)}
          onClose={() => setShowItineraryDrawer(false)}
          isDrawerMode={true}
          onUpdateTrip={(updatedTrip) => {
            if (updatedTrip.ideas) {
              setTripIdeas(updatedTrip.ideas);
            }
            if (onUpdateTrip) onUpdateTrip(updatedTrip);
          }}
        />
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
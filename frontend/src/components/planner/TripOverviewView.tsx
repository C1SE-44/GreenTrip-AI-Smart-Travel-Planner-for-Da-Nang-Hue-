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
import type { UserProfile } from '@/services/auth';
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
import CentralVietnamAdvisoryBanner from './CentralVietnamAdvisoryBanner';
import { evaluateCentralVietnamAdvisories } from '@/utils/centralVietnamAdvisories';
import { useSavedPlaces } from '@/context/SavedPlacesContext';
import { streamCopilotChat, type CopilotSuggestedPoi } from '@/services/copilotService';
import {
  createEmptyItinerary,
  getTripItinerary,
  saveTripItinerary,
  stopFromPoi,
  type TripItinerary,
  type ItineraryDay,
  type ItineraryStop,
} from '@/services/itineraryService';
import { FormattedCopilotMessage, type CopilotChatMessageItem } from './copilotMessageMarkdown';
import {
  MODAL_CATEGORY_TABS,
  parseCategoryBudgets,
  type CategoryBudgets,
} from './tripOverviewConstants';
import { TripWhereModal, TripWhenModal, TripWhoModal } from './TripParameterModals';
import TripBudgetModal from './TripBudgetModal';
import PlannerAddIdeasModal from './PlannerAddIdeasModal';
import TripLearnDrawer from './TripLearnDrawer';
import ExpiredTripBanner from './ExpiredTripBanner';
import TripHeader from './TripHeader';
import PoiImage from '@/components/ui/PoiImage';

export { FormattedCopilotMessage, type CopilotChatMessageItem };
export { parseCategoryBudgets, type CategoryBudgets };

export interface TripOverviewViewProps {
  trip: UserTrip;
  allPois?: Poi[];
  currentUser?: UserProfile | null;
  onBack: () => void;
  onOpenItineraryDetails?: () => void;
  onNavigateToTab?: (tab: 'ideas' | 'itinerary' | 'calendar') => void;
  onUpdateTrip?: (updatedTrip: UserTrip) => void;
}

type RecommendedPoi = Poi & { matchScore?: number };

export default function TripOverviewView({
  trip,
  allPois: allPoisProp,
  currentUser,
  onBack,
  onOpenItineraryDetails,
  onNavigateToTab,
  onUpdateTrip,
}: TripOverviewViewProps) {
  const { savedIds, pendingIds, openCollectionPicker, places } = useSavedPlaces();
  const handleOpenSavedCollections = (_poiId: string, poi?: Poi) => {
    if (poi) openCollectionPicker(poi);
  };
  // Bộ dữ liệu POI hoàn chỉnh từ Explore / backend
  const [loadedPois, setLoadedPois] = useState<Poi[]>([]);

  useEffect(() => {
    if (allPoisProp !== undefined) {
      if (allPoisProp.length > 0) {
        setLoadedPois(allPoisProp);
      }
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
  const [showCustomSettings, setShowCustomSettings] = useState(false);
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
  const [isPlannerDesktopViewport, setIsPlannerDesktopViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true,
  );

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const syncViewport = () => setIsPlannerDesktopViewport(media.matches);
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, []);
  const [streamingText, setStreamingText] = useState('');
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  const [activeConstraints, setActiveConstraints] = useState<string[]>([]);
  const [tripMemory, setTripMemory] = useState<Record<string, string>>({});
  const [quickPrompts, setQuickPrompts] = useState<string[]>(() => {
    const dest = (trip.destination || '').toLowerCase();
    if (dest.includes('huế') && !dest.includes('đà nẵng')) {
      return [
        'Quán cafe ngắm hoàng hôn sông Hương?',
        'Đặc sản Cố đô Huế chuẩn vị bản địa?',
        'Lịch trình Huế nhẹ nhàng cho gia đình',
      ];
    }
    if (dest.includes('đà nẵng') && !dest.includes('huế')) {
      return [
        'Quán cafe yên tĩnh nhiều cây xanh ở Đà Nẵng?',
        'Ăn hải sản & đặc sản Đà Nẵng ở đâu ngon?',
        'Phương án đi Bán đảo Sơn Trà & Ngũ Hành Sơn',
      ];
    }
    return [
      'So sánh nhịp độ Đà Nẵng hay Huế hợp gu hơn?',
      'Gợi ý quán cafe chill yên tĩnh không ồn ào',
      'Chia lịch trình Đà Nẵng & Huế theo cụm gần nhau',
    ];
  });
  const [chatMessages, setChatMessages] = useState<CopilotChatMessageItem[]>([]);

  const handleRemoveMemoryConstraint = (constraintKey: string) => {
    setActiveConstraints((prev) => prev.filter((c) => c !== constraintKey));
    setTripMemory((prev) => {
      const next = { ...prev };
      delete next[constraintKey];
      return next;
    });
  };

  const [actionCardIdx, setActionCardIdx] = useState<0 | 1>(0);
  const [showActionCards, setShowActionCards] = useState<boolean>(false);
  const [showLearnDrawer, setShowLearnDrawer] = useState<boolean>(false);

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
      if ((err as { status?: number })?.status !== 404) {
        console.warn('Could not load trip itinerary:', err);
      }
    });
    return () => {
      active = false;
    };
  }, [trip.id]);

  const handleAddPoiToItinerary = (poi: Poi, dayNum: number = 1) => {
    const newStop = stopFromPoi(poi);
    const updatedDays = itineraryPlan.days.map((d) => {
      if (d.day_number === dayNum) {
        const stops = [...d.stops, newStop].map((s, idx) => ({ ...s, sequence: idx }));
        return {
          ...d,
          stops,
        };
      }
      return d;
    });
    const nextPlan = { ...itineraryPlan, days: updatedDays };
    setItineraryPlan(nextPlan);
    saveTripItinerary(nextPlan).catch((err) => {
      setToastMessage(err instanceof Error ? err.message : 'Chưa thể lưu lịch trình.');
    });
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
    saveTripItinerary(nextPlan).catch((err) => {
      setToastMessage(err instanceof Error ? err.message : 'Chưa thể lưu lịch trình.');
    });
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
  const [modalCity, setModalCity] = useState<'all' | 'Đà Nẵng' | 'Huế'>('all');
  const [modalSearch, setModalSearch] = useState('');
const [modalCategory, setModalCategory] = useState<string>('for-you');
  const [customIdeaInput, setCustomIdeaInput] = useState('');

  // State bản đồ & chọn POI chi tiết
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);
  const [hoveredMapPoiId, setHoveredMapPoiId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (Array.isArray(trip.ideas)) {
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

  // Gọi trực tiếp Backend API (/v1/recommendations/poi) khi Điểm đến, Ngân sách hoặc Ý tưởng thay đổi
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

        interface RecommendedPoiApiItem {
          poi_id?: string;
          name: string;
          category_name?: string | null;
          city?: string | null;
          lat?: number | null;
          lng?: number | null;
          image?: string | null;
          explanation_snippet?: string | null;
          satisfaction_score?: number | null;
          is_green?: boolean | null;
          green_score?: number | null;
          estimated_cost?: number | null;
          match_score?: number | null;
        }

        const res = await fetchJson<{ status: string; total: number; data: RecommendedPoiApiItem[] }>(
          '/v1/recommendations/poi',
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
              ecoScore: (() => {
                const rawGreen = item.green_score ?? 0.85;
                return Math.round(rawGreen <= 1 ? rawGreen * 100 : rawGreen);
              })(),
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
    let list: Poi[] = [];

    // Tab "Đã thích" (Favorites từ Thiện's SavedPlacesContext & trip.savedPlaces)
    if (modalTab === 'saved') {
      let favSet = new Set<string>();
      try {
        const rawFav = localStorage.getItem('greentrip_favorites');
        if (rawFav) favSet = new Set<string>(JSON.parse(rawFav));
      } catch (e) {
        console.error(e);
      }
      const tripSavedSet = new Set<string>(trip.savedPlaces || []);
      const poisFromAll = allPois.filter(
        (p) => savedIds.has(String(p.id)) || savedIds.has(p.name) || favSet.has(String(p.id)) || favSet.has(p.name) || tripSavedSet.has(String(p.id))
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
    } else if (modalCategory === 'luu-tru') {
      list = list.filter((p) => p.category === 'luu-tru');
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
  }, [allPois, places, savedIds, modalCity, modalCategory, modalSearch, modalTab, tripIdeas, isDaNang, isHue, trip.savedPlaces]);

  // Tiêu đề lớn hiển thị (ưu tiên tên riêng người dùng đặt, nếu không fallback theo điểm đến)
  const cleanTitle = trip.title?.trim();
  const isGibberish = !cleanTitle || cleanTitle.length < 3 || cleanTitle.toLowerCase() === 'ư' || cleanTitle.toLowerCase() === 'a';
  const _displayTitle = isGibberish ? `Chuyến đi ${trip.destination || 'Đà Nẵng & Huế'}` : cleanTitle;

  // Rút gọn ngày bắt đầu cho viên thuốc metadata (ví dụ: "Từ 2 thg 11")
  const _formatDateBrief = (dateStr?: string) => {
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
  const _budgetBriefText = getBudgetBrief();

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

    const nextIdeas = [...tripIdeas, poi.id || poi.name];
    setTripIdeas(nextIdeas);
    if (onUpdateTrip) {
      onUpdateTrip({
        ...trip,
        ideas: nextIdeas,
      });
    }
    setHoveredMapPoiId(poi.id);
    setToastMessage(`Đã thêm "${poi.name}" vào danh sách Ý tưởng!`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Thêm trực tiếp địa điểm từ thẻ Copilot vào Ngày X trong Kế hoạch chi tiết
  const handleAddCopilotPoiToDay = (p: CopilotSuggestedPoi, targetDayNum: number = 1) => {
    const matchedFullPoi = allPois.find(
      (ap) => ap.id === p.id || ap.name.toLowerCase() === p.name.toLowerCase()
    );
    const poiForStop: Poi = matchedFullPoi || {
      id: p.id,
      name: p.name,
      category: normalizeCategory(p.category),
      city: normalizeCity(p.city || trip.destination),
      lat: p.lat || 16.0615,
      lng: p.lng || 108.2235,
      image: p.image_url || getDeterministicImage(p.name, p.id, normalizeCategory(p.category), trip.destination),
      description: p.kg_explanation || p.swap_reason || p.address,
      address: p.address,
      rating: p.rating || 4.8,
      visitDuration: '1–2 giờ',
      isGreen: (p.green_score || 90) >= 80,
      ecoScore: p.green_score || 90,
      estimatedCost: p.estimated_cost || 60000,
    };
    handleAddPoiToItinerary(poiForStop, targetDayNum);
    setSelectedMapPoiId(poiForStop.id);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Bảng tra cứu thực thể cho Inline Entity Linking trong tin nhắn Copilot
  const chatEntityLookup = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    allPois.forEach((p) => map.set(p.id, { id: p.id, name: p.name }));
    recommendedPois.forEach((p) => map.set(p.id, { id: p.id, name: p.name }));
    chatMessages.forEach((m) => {
      (m.suggestedPois || []).forEach((sp) => {
        const found = allPois.find(
          (ap) => ap.id === sp.id || ap.name.toLowerCase() === sp.name.toLowerCase()
        );
        const targetId = found ? found.id : sp.id;
        map.set(targetId, { id: targetId, name: sp.name });
      });
    });
    return Array.from(map.values());
  }, [allPois, recommendedPois, chatMessages]);

  // Đường nối thứ tự điểm dừng (1 -> 2 -> 3) trên PoiMap khi Copilot trả về gợi ý
  const { copilotRouteCoordinates, copilotNumberedOrderMap } = useMemo(() => {
    const lastAiWithPois = [...chatMessages]
      .reverse()
      .find((m) => m.sender === 'ai' && m.suggestedPois && m.suggestedPois.length >= 2);
    const coords: [number, number][] = [];
    const orderMap = new Map<string, number>();
    if (lastAiWithPois && lastAiWithPois.suggestedPois) {
      lastAiWithPois.suggestedPois.forEach((sp, idx) => {
        const matched = relevantPois.find(
          (rp) => rp.id === sp.id || rp.name.toLowerCase() === sp.name.toLowerCase()
        );
        const lat = matched?.lat || sp.lat;
        const lng = matched?.lng || sp.lng;
        const keyId = matched?.id || sp.id;
        if (lat && lng) {
          coords.push([lat, lng]);
          orderMap.set(keyId, idx + 1);
        }
      });
    }
    return { copilotRouteCoordinates: coords, copilotNumberedOrderMap: orderMap };
  }, [chatMessages, relevantPois]);

  // Xử lý gửi tin nhắn trò chuyện với Trợ lý AI Copilot (PB14 - 6 Core Mindtrip MVPs)
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

    const historyForRequest = chatMessages.slice(-8).map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    setChatMessages((prev) => [...prev, newUserMsg]);
    setChatInput('');
    setStreamingText('');
    setStreamingStatus(null);
    setIsAiThinking(true);

    try {
      const res = await streamCopilotChat(
        {
          message: promptToSend,
          trip_context: {
            destination: trip.destination || 'Đà Nẵng & Huế',
            days_count: trip.daysCount || 4,
            current_day: dayTargetForAdd || 1,
            traveler_name: currentUser?.full_name?.trim() || undefined,
            saved_ideas: tripIdeas,
            total_budget: trip.totalBudget && trip.totalBudget > 0 ? trip.totalBudget : undefined,
            num_people: trip.peopleCount || 2,
            budget_tier:
              trip.budgetTier === 'budget' || trip.budgetTier === 'standard' || trip.budgetTier === 'luxury'
                ? trip.budgetTier
                : undefined,
            active_constraints: activeConstraints,
            trip_memory: tripMemory,
            conversation_history: historyForRequest,
            current_itinerary_state: itineraryPlan.days as unknown as Array<Record<string, unknown>>,
          },
        },
        {
          onStatus: (statusMsg) => setStreamingStatus(statusMsg),
          onDelta: (chunk) => setStreamingText((prev) => prev + chunk),
        }
      );

      // 1. Đồng bộ Multi-turn Session Memory & Active Constraints (MVP #3)
      if (res.detected_constraints) {
        setActiveConstraints(res.detected_constraints);
      }
      if (res.trip_memory) {
        setTripMemory(res.trip_memory);
      }

      // 2. Đồng bộ gợi ý địa điểm của Copilot lên Bản đồ PoiMap ngay lập tức (MVP #2 & #4)
      if (res.suggested_pois && res.suggested_pois.length > 0) {
        const mappedCopilotPois: Poi[] = res.suggested_pois.map((sp, i) => {
          const foundInAll = allPois.find(
            (ap) => ap.id === sp.id || ap.name.toLowerCase() === sp.name.toLowerCase()
          );
          const cat = foundInAll?.category || normalizeCategory(sp.category);
          const city = foundInAll?.city || normalizeCity(sp.city || trip.destination);
          return {
            ...(foundInAll || {}),
            id: foundInAll?.id || sp.id,
            name: foundInAll?.name || sp.name,
            category: cat,
            city,
            lat: sp.lat || foundInAll?.lat || 16.0615 + i * 0.004,
            lng: sp.lng || foundInAll?.lng || 108.2235 + i * 0.004,
            image:
              sp.image_url ||
              foundInAll?.image ||
              getDeterministicImage(sp.name, sp.id, cat, city),
            description: sp.kg_explanation || sp.swap_reason || foundInAll?.description || sp.address,
            address: sp.address || foundInAll?.address || '',
            rating: sp.rating || foundInAll?.rating || 4.8,
            visitDuration: foundInAll?.visitDuration || '1–2 giờ',
            isGreen: (sp.green_score || 90) >= 80,
            ecoScore: sp.green_score || 90,
            estimatedCost: sp.estimated_cost || foundInAll?.estimatedCost || 50000,
          };
        });
        setRecommendedPois(mappedCopilotPois);
      }

      // 3. Đồng bộ Conversational Trip Mutation: cập nhật Header + lưu Itinerary (MVP #1)
      let hasMutated = false;
      if (res.updated_itinerary_state && res.updated_itinerary_state.length > 0) {
        hasMutated = true;
        const seenStopIds = new Set<string>();
        const toHHMM = (raw: unknown): string | null => {
          if (typeof raw !== 'string') return null;
          const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
          if (!m) return null;
          const hh = Number(m[1]);
          const mm = Number(m[2]);
          if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
          return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        };

        const sortedRawDays = [...res.updated_itinerary_state].sort(
          (a, b) => Number(a.day_number || a.day || 0) - Number(b.day_number || b.day || 0)
        );
        const nextDays: ItineraryDay[] = sortedRawDays.map((rawDay, idx) => {
          const dayNum = idx + 1;
          const existingDay = itineraryPlan.days.find((d) => d.day_number === dayNum);
          const rawStops = Array.isArray(rawDay.stops)
            ? (rawDay.stops as Array<Record<string, unknown>>)
            : [];
          const scheduledRanges: Array<[string, string]> = [];
          const normalizedStops: ItineraryStop[] = rawStops.map((st, sIdx) => {
            let stopId = String(st.stop_id || st.poi_id || `mut-d${dayNum}-s${sIdx}`);
            if (seenStopIds.has(stopId)) stopId = `${stopId}-d${dayNum}-s${sIdx}`;
            seenStopIds.add(stopId);

            let startTime = toHHMM(st.start_time);
            let endTime = toHHMM(st.end_time);
            if (!startTime || !endTime || endTime <= startTime) {
              startTime = null;
              endTime = null;
            } else if (scheduledRanges.some(([rs, re]) => startTime! < re && rs < endTime!)) {
              // Avoid 422 overlap rejection when prepending mutated stops into existing day
              startTime = null;
              endTime = null;
            } else {
              scheduledRanges.push([startTime, endTime]);
            }

            const rawDur = Number(st.duration_minutes ?? st.duration_mins);
            const durationMinutes = Number.isFinite(rawDur) && rawDur > 0 && rawDur <= 1440 ? Math.round(rawDur) : 120;
            const rawType = st.stop_type;
            const stopType = rawType === 'rest' || rawType === 'custom' ? rawType : 'poi';
            const rawSource = st.source;
            const source = rawSource === 'idea' || rawSource === 'manual' ? rawSource : 'assistant';

            return {
              stop_id: stopId,
              poi_id: st.poi_id ? String(st.poi_id) : null,
              title: String(st.title || st.name || 'Điểm dừng lịch trình').slice(0, 200),
              city: st.city ? String(st.city) : rawDay.focus_city ? String(rawDay.focus_city) : trip.destination,
              address: st.address ? String(st.address) : null,
              category: st.category ? String(st.category) : 'Điểm tham quan',
              stop_type: stopType,
              source,
              sequence: sIdx,
              duration_minutes: durationMinutes,
              start_time: startTime,
              end_time: endTime,
              comment: st.comment ? String(st.comment) : st.notes ? String(st.notes) : null,
              latitude: typeof st.latitude === 'number' && Number.isFinite(st.latitude) ? st.latitude : null,
              longitude: typeof st.longitude === 'number' && Number.isFinite(st.longitude) ? st.longitude : null,
            };
          });
          return {
            day_id: String(rawDay.day_id || existingDay?.day_id || `${trip.id}-day-${dayNum}`),
            day_number: dayNum,
            date: existingDay?.date ?? null,
            title: String(rawDay.title || `Ngày ${dayNum}: ${rawDay.focus_city || trip.destination}`),
            note: String(rawDay.note || existingDay?.note || ''),
            stops: normalizedStops,
          };
        });
        const nextPlan: TripItinerary = {
          ...itineraryPlan,
          destination: res.updated_destination || trip.destination,
          days_count: nextDays.length,
          days: nextDays,
        };
        setItineraryPlan(nextPlan);
        void saveTripItinerary(nextPlan).catch((saveErr: unknown) => {
          const errMsg = saveErr instanceof Error ? saveErr.message : '';
          setToastMessage(
            errMsg.includes('quá khứ')
              ? 'Lịch trình đang ở ngày quá khứ — hãy bấm "Dời sang hôm nay" để lưu thay đổi.'
              : 'Không thể lưu tự động lịch trình lúc này.'
          );
          setTimeout(() => setToastMessage(null), 4500);
        });
      }

      if (res.updated_days_count || res.updated_destination) {
        hasMutated = true;
        const nextDaysCount = res.updated_days_count || trip.daysCount || 4;
        const nextDest = res.updated_destination || trip.destination;
        setFlexibleDays(nextDaysCount);
        setWhereTarget(nextDest);
        onUpdateTrip?.({
          ...trip,
          destination: nextDest,
          daysCount: nextDaysCount,
          startDate: `${nextDaysCount} ngày • ${selectedMonth}`,
          title: `Chuyến đi ${nextDest} (${nextDaysCount} ngày)`,
        });
        setToastMessage(`Đã cập nhật lịch trình: ${nextDest} (${nextDaysCount} ngày)`);
        setTimeout(() => setToastMessage(null), 3500);
      }

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
        factCheckWarning: res.fact_check_warning || null,
        mutationSummary: res.mutation_summary || [],
        updatedDaysCount: res.updated_days_count || null,
        updatedDestination: res.updated_destination || null,
        hasMutatedItinerary: hasMutated || res.action_type === 'mutate_itinerary',
        reasoningTrace: res.reasoning_trace,
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
      setStreamingText('');
      setStreamingStatus(null);
      setIsAiThinking(false);
    }
  };

  return (
    <div className="flex-1 min-w-0 w-full h-full bg-white overflow-hidden select-none animate-fadeIn flex flex-col">
      {/* ─── THANH HEADER 3 TAB CHUẨN EXPLORE & MOCKUP (TRIPHEADER) ─── */}
      <TripHeader
        trip={trip}
        activeTab="ideas"
        onNavigateToTab={(tab) => {
          if (tab === 'itinerary') {
            if (onOpenItineraryDetails) onOpenItineraryDetails();
            else setShowItineraryDrawer(true);
          } else {
            onNavigateToTab?.(tab);
          }
        }}
        onBack={onBack}
        showCustomSettings={showCustomSettings}
        setShowCustomSettings={setShowCustomSettings}
        onOpenWhere={() => setShowWhereModal(true)}
        onOpenWhen={() => setShowWhenModal(true)}
        onOpenWho={() => setShowWhoModal(true)}
        onOpenBudget={() => setShowBudgetModal(true)}
        rightActions={
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowItineraryDrawer(false);
                setShowIdeasView(true);
              }}
              className="h-9 px-3 rounded-full border border-gray-200 hover:border-black bg-white hover:bg-gray-50 text-gray-900 text-[12.5px] font-semibold transition flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 group"
              title="Xem danh sách địa điểm đã lưu trong ý tưởng của chuyến đi"
            >
              <Lightbulb size={14} className="text-amber-500 shrink-0" />
              <span className="hidden sm:inline">Ý tưởng</span>
              <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold flex items-center justify-center ${
                tripIdeas.length > 0 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {tripIdeas.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddIdeasModal(true)}
              className="w-9 h-9 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer shadow-2xs"
              title="Thêm địa điểm vào ý tưởng"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (onOpenItineraryDetails) {
                  onOpenItineraryDetails();
                } else {
                  setShowItineraryDrawer(true);
                }
              }}
              className="sr-only"
            >
              Xem lịch theo ngày
            </button>
          </div>
        }
      />

      <ExpiredTripBanner
        trip={trip}
        plan={itineraryPlan}
        onUpdateTrip={onUpdateTrip}
        onPlanUpdated={(next) => setItineraryPlan(next)}
        onOpenWhen={() => setShowWhenModal(true)}
      />

      <CentralVietnamAdvisoryBanner
        advisories={evaluateCentralVietnamAdvisories(trip, itineraryPlan, allPois)}
        className="px-4 sm:px-6 py-2 bg-white border-b border-gray-100 shrink-0"
      />

      {/* ─── NỘI DUNG CHÍNH: BỐ CỤC CHUẨN TRANG EXPLORE (CỘT GIỮA + BẢN ĐỒ FLEX-1) ─── */}
      <div className="flex-1 min-w-0 w-full min-h-0 flex items-stretch overflow-hidden">
        
        {/* ────── CỘT GIỮA: AI COPILOT CHAT WORKSPACE (CHIỀU RỘNG CHUẨN EXPLORE) ────── */}
        <div 
          className={`${
            isMapExpanded ? 'hidden' : 'w-full min-w-0 md:w-[560px] lg:w-[620px] xl:w-[660px] shrink-0'
          } h-full bg-white flex flex-col justify-between px-4 md:pl-6 lg:pl-[36px] md:pr-5 pt-3.5 pb-20 md:pb-5 border-r border-gray-100 select-none transition-[width] duration-300 ease-in-out`}
        >
          {/* Header Chat: Chats 1 chuẩn Mindtrip */}
          <div className="flex items-center justify-between mb-1.5 shrink-0">
            <h3 className="text-[15px] font-bold text-gray-950 tracking-tight flex items-center gap-1.5">
              <span>Chats</span>
              <span className="text-gray-400 font-normal text-xs">1</span>
              <span className="sr-only">Đoạn chat (1)</span>
            </h3>
            <span className="text-[11px] text-gray-400 font-medium">Hỏi AI để gợi ý & đồng bộ ý tưởng lên bản đồ</span>
          </div>

          {/* MVP #3: Removable Session Memory Badges (Bộ nhớ ngữ cảnh xuyên suốt) */}
          {Object.keys(tripMemory).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2.5 pb-2 border-b border-gray-100 shrink-0">
              <span className="text-[10.5px] font-bold text-emerald-800 uppercase tracking-wider mr-0.5">
                AI đang ghi nhớ:
              </span>
              {Object.entries(tripMemory).map(([key, label]) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/90 text-emerald-900 text-[11px] font-medium shadow-2xs"
                >
                  <span>{label}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMemoryConstraint(key)}
                    className="w-3.5 h-3.5 rounded-full hover:bg-emerald-200/80 flex items-center justify-center text-emerald-700 hover:text-emerald-950 cursor-pointer ml-0.5"
                    title="Gỡ bỏ ràng buộc này"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Mindtrip Action Cards (1 / 2 & 2 / 2): Gợi ý bước tiếp theo gọn gàng */}
          {showActionCards && !isAiThinking && (
            <div
              className="rounded-2xl border border-emerald-200/80 bg-emerald-50/45 px-3.5 py-2.5 mb-2.5 shrink-0 shadow-2xs"
              role="region"
              aria-label="Gợi ý bước tiếp theo"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <Compass size={14} className="text-emerald-700 shrink-0" />
                  <span>Gợi ý tiếp theo ({actionCardIdx + 1} / 2)</span>
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setActionCardIdx((prev) => (prev === 0 ? 1 : 0))}
                    aria-label="Xem thẻ gợi ý trước"
                    className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-neutral-700 hover:bg-emerald-100/70 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionCardIdx((prev) => (prev === 0 ? 1 : 0))}
                    aria-label="Xem thẻ gợi ý tiếp theo"
                    className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-neutral-700 hover:bg-emerald-100/70 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowActionCards(false)}
                    aria-label="Ẩn thẻ gợi ý bước tiếp theo"
                    className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {actionCardIdx === 0 ? (
                <div className="mt-1 space-y-2">
                  <div>
                    <p className="text-xs font-bold text-neutral-900 leading-snug">
                      Lịch trình {trip.destination || 'Đà Nẵng & Huế'} đã sẵn sàng đồng bộ
                    </p>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Xem nhanh điểm di sản tiêu biểu hoặc mở cẩm nang phong thủy, trang phục &amp; mẹo đi lại bản địa.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const preferred = relevantPois[0] || allPois[0];
                        setShowLearnDrawer(false);
                        setShowIdeasView(false);
                        setShowItineraryDrawer(false);
                        if (preferred) setSelectedMapPoiId(preferred.id);
                      }}
                      className="min-h-[40px] px-3.5 rounded-xl bg-white hover:bg-neutral-100 border border-neutral-200/90 text-neutral-900 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      <MapPin size={14} className="text-emerald-700 shrink-0" />
                      <span>Xem điểm tiêu biểu</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMapPoiId(null);
                        setShowIdeasView(false);
                        setShowItineraryDrawer(false);
                        setShowLearnDrawer(true);
                      }}
                      className="min-h-[40px] px-3.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      <Info size={14} className="shrink-0" />
                      <span>Tìm hiểu Huế – Đà Nẵng</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 space-y-2">
                  <div>
                    <p className="text-xs font-bold text-neutral-900 leading-snug">
                      Sẵn sàng khám phá thêm ý tưởng du lịch xanh?
                    </p>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Duyệt danh sách điểm ăn chay, làng sinh thái &amp; di tích bản địa để thêm vào Ý tưởng trước khi xếp giờ.
                    </p>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowAddIdeasModal(true)}
                      className="min-h-[40px] px-3.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      <Plus size={14} className="shrink-0" />
                      <span>Thêm ý tưởng</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
                  <>
                    {msg.reasoningTrace && (
                      <details className="mb-1.5 group">
                        <summary className="list-none min-h-[40px] inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200/90 text-xs font-semibold text-neutral-700 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 [&::-webkit-details-marker]:hidden">
                          <Sparkles size={13} className="text-emerald-700 shrink-0" />
                          <span>
                            {msg.hasMutatedItinerary
                              ? '🔄 Đã đồng bộ cập nhật lịch trình'
                              : '🧠 Đã phân tích · Đồng bộ Đồ thị Tri thức'}
                          </span>
                          <ChevronDown
                            size={14}
                            className="text-neutral-600 transition-transform duration-200 shrink-0 group-open:rotate-180"
                          />
                        </summary>
                        <div className="mt-1.5 px-3 py-2 rounded-xl bg-neutral-50/90 border border-neutral-200/80 text-xs text-neutral-700 leading-relaxed whitespace-pre-line">
                          {msg.reasoningTrace}
                        </div>
                      </details>
                    )}
                    <FormattedCopilotMessage
                      text={msg.text}
                      entityLookup={chatEntityLookup}
                      onHoverPoi={handleDebouncedHover}
                      onSelectPoi={(poiId) => setSelectedMapPoiId(poiId)}
                    />
                  </>
                )}

                {/* Cảnh báo đính chính địa lý / Fact-Check Guardrail */}
                {msg.factCheckWarning && (
                  <div className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-300/80 text-amber-950 text-xs flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">🧭</span>
                    <span className="leading-relaxed font-medium">{msg.factCheckWarning}</span>
                  </div>
                )}

                {/* Cảnh báo an toàn / Lưu ý tránh mưa */}
                {msg.avoidNotice && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">⚠️</span>
                    <span className="leading-relaxed">{msg.avoidNotice}</span>
                  </div>
                )}

                {/* MVP #1: Tóm tắt thao tác sửa lịch trình & Nút [Xem kế hoạch chi tiết (X ngày)] chuẩn Mindtrip */}
                {(msg.hasMutatedItinerary || (msg.mutationSummary && msg.mutationSummary.length > 0)) && (
                  <div className="p-3 rounded-xl bg-emerald-50/90 border border-emerald-200 text-emerald-950 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-bold flex items-center gap-1.5 text-emerald-900">
                        <Check size={14} className="text-emerald-700 shrink-0" />
                        <span>Đã đồng bộ trực tiếp vào Kế hoạch chi tiết</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowIdeasView(false);
                          setShowItineraryDrawer(true);
                        }}
                        className="px-3 py-1.5 rounded-full bg-black hover:bg-neutral-800 text-white font-bold text-[11.5px] flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 transition"
                      >
                        <Compass size={13} className="text-emerald-400 shrink-0" />
                        <span>
                          Xem kế hoạch chi tiết ({msg.updatedDaysCount || itineraryPlan.days.length || trip.daysCount || 4} ngày)
                        </span>
                        <ChevronRight size={12} />
                      </button>
                    </div>
                    {msg.mutationSummary && msg.mutationSummary.length > 0 && (
                      <ul className="space-y-1 pl-1 text-[11.5px] text-emerald-900/90">
                        {msg.mutationSummary.map((line, mIdx) => (
                          <li key={mIdx} className="flex items-start gap-1.5">
                            <span className="text-emerald-600 font-bold">•</span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    )}
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

                {/* Thẻ gợi ý địa điểm từ Copilot (MVP #5: KG Explanation + Giá chuẩn đơn vị + Nút đôi [+ Ý tưởng] & [+ Ngày X]) */}
                {msg.suggestedPois && msg.suggestedPois.length > 0 && (
                  <div className="space-y-2 pt-1 w-full">
                    {msg.suggestedPois.map((p, pIdx) => {
                      const isSaved = isPoiSavedInIdeas(p);
                      const img = p.image_url || getDeterministicImage(p.name, p.id, normalizeCategory(p.category), trip.destination);
                      return (
                        <div
                          key={p.id}
                          onMouseEnter={() => handleDebouncedHover(p.id)}
                          onMouseLeave={() => handleDebouncedHover(null)}
                          onClick={() => setSelectedMapPoiId(p.id)}
                          className="p-2.5 rounded-xl border border-gray-200/90 hover:border-black/40 bg-gray-50/70 hover:bg-white transition-all flex flex-col sm:flex-row gap-2.5 items-start sm:items-center justify-between shadow-2xs group w-full cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative shrink-0">
                              <PoiImage
                                src={img}
                                alt={p.name}
                                poiId={p.id}
                                poiName={p.name}
                                category={normalizeCategory(p.category)}
                                city={normalizeCity(trip.destination)}
                                className="w-12 h-12 rounded-lg object-cover shrink-0 border border-gray-200/60"
                              />
                              <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-black text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs">
                                {pIdx + 1}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h5 className="font-bold text-[13px] text-gray-900 truncate group-hover:text-emerald-800 transition-colors">
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
                              <p className="text-[11.5px] text-gray-600 line-clamp-2 mt-0.5">
                                {p.kg_explanation || p.swap_reason || p.address}
                              </p>
                              {(p.price_range_display || p.budget_delta) && (
                                <p className="text-[10.5px] font-medium text-gray-500 mt-0.5">
                                  💰 {p.price_range_display || p.budget_delta}
                                </p>
                              )}
                            </div>
                          </div>

                          <div
                            className="flex items-center gap-1.5 shrink-0 self-end sm:self-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleAddCopilotPoiToDay(p, dayTargetForAdd || 1)}
                              className="px-2 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-300 hover:border-black bg-white hover:bg-gray-50 text-gray-800 transition cursor-pointer flex items-center gap-1 active:scale-95"
                              title={`Chèn trực tiếp vào Ngày ${dayTargetForAdd || 1} trong Kế hoạch chi tiết`}
                            >
                              <CalendarIcon size={11} className="text-emerald-700" />
                              <span>+ Ngày {dayTargetForAdd || 1}</span>
                            </button>

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
                                  <span>Đã lưu</span>
                                </>
                              ) : (
                                <>
                                  <Plus size={12} />
                                  <span>+ Ý tưởng</span>
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
              <div
                aria-live="polite"
                className="p-3.5 rounded-2xl bg-white border border-emerald-200/90 text-gray-800 text-[13px] leading-relaxed w-full shadow-2xs space-y-2"
              >
                {streamingText ? (
                  <div className="space-y-1">
                    <FormattedCopilotMessage
                      text={streamingText}
                      entityLookup={chatEntityLookup}
                      onHoverPoi={handleDebouncedHover}
                      onSelectPoi={(poiId) => setSelectedMapPoiId(poiId)}
                    />
                    <span
                      aria-hidden="true"
                      className="inline-block w-1.5 h-4 align-middle bg-emerald-600 rounded-xs animate-pulse"
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-emerald-900">
                      <Sparkles size={15} className="text-emerald-700 animate-spin shrink-0" />
                      <span>{streamingStatus || 'Trợ lý GreenTrip AI đang suy nghĩ & cập nhật lịch trình...'}</span>
                    </div>
                    <p className="text-xs text-neutral-600 pl-6">
                      Đang truy vấn Neo4j Knowledge Graph · Kiểm chứng địa lý &amp; phương tiện xanh
                    </p>
                  </div>
                )}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Chip gợi ý câu hỏi (3 chip động bám sát ngữ cảnh hội thoại) */}
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
          className="hidden md:block flex-1 h-full relative bg-white overflow-hidden"
          data-purpose="right-panel-container"
        >
          <div className="w-full h-full pl-3 pr-6 lg:pr-[36px] py-4 pb-6">
            <div className="w-full h-full rounded-[22px] overflow-hidden border border-gray-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.06)] relative [transform:translateZ(0)]">
              {isPlannerDesktopViewport && (
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
                  routeCoordinates={copilotRouteCoordinates.length >= 2 ? copilotRouteCoordinates : undefined}
                  numberedOrderMap={copilotNumberedOrderMap.size > 0 ? copilotNumberedOrderMap : undefined}
                />
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ─── MODAL 1-4: THÔNG SỐ CHUYẾN ĐI (Ở ĐÂU / KHI / AI / NGÂN SÁCH) ─── */}
      {showWhereModal && (
        <TripWhereModal
          whereTarget={whereTarget}
          onChangeWhereTarget={setWhereTarget}
          byCar={byCar}
          onToggleByCar={() => setByCar(!byCar)}
          onClose={() => setShowWhereModal(false)}
          onSave={handleSaveWhere}
        />
      )}

      {showWhenModal && (
        <TripWhenModal
          whenTab={whenTab}
          onChangeWhenTab={setWhenTab}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onChangeRangeStart={setRangeStart}
          onChangeRangeEnd={setRangeEnd}
          flexibleDays={flexibleDays}
          onChangeFlexibleDays={setFlexibleDays}
          selectedMonth={selectedMonth}
          onChangeSelectedMonth={setSelectedMonth}
          onClose={() => setShowWhenModal(false)}
          onSave={handleSaveWhen}
        />
      )}

      {showWhoModal && (
        <TripWhoModal
          adults={adults}
          childrenCount={children}
          infants={infants}
          pets={pets}
          onChangeAdults={setAdults}
          onChangeChildren={setChildren}
          onChangeInfants={setInfants}
          onChangePets={setPets}
          onClose={() => setShowWhoModal(false)}
          onSave={handleSaveWho}
        />
      )}

      {showBudgetModal && (
        <TripBudgetModal
          categoryBudgets={categoryBudgets}
          onChangeCategoryBudgets={setCategoryBudgets}
          onClose={() => setShowBudgetModal(false)}
          onSave={handleSaveBudget}
        />
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
        <PlannerAddIdeasModal
          modalTab={modalTab}
          onChangeTab={setModalTab}
          modalCity={modalCity}
          onChangeCity={setModalCity}
          modalSearch={modalSearch}
          onChangeSearch={setModalSearch}
          modalCategory={modalCategory}
          onChangeCategory={setModalCategory}
          categoryTabs={MODAL_CATEGORY_TABS}
          filteredPois={modalFilteredPois}
          savedIdsSize={savedIds.size}
          customIdeaInput={customIdeaInput}
          onChangeCustomIdeaInput={setCustomIdeaInput}
          onClose={() => setShowAddIdeasModal(false)}
          isPoiAdded={(poiId) => tripIdeas.includes(poiId)}
          onTogglePoi={(poi) => handleToggleIdea(poi.id)}
          onSelectPoi={(poiId) => {
            setSelectedMapPoiId(poiId);
            setShowAddIdeasModal(false);
          }}
          onResetFilters={() => {
            setModalCategory('for-you');
            setModalSearch('');
            setModalCity('all');
          }}
          onSubmitCustomIdea={() => {
            const name = customIdeaInput.trim();
            if (!name) return;
            const found = allPois.find((p) => p.name.toLowerCase() === name.toLowerCase());
            const customId = found ? found.id : `custom-${name}`;
            handleToggleIdea(customId);
            setCustomIdeaInput('');
            setShowAddIdeasModal(false);
            setShowIdeasView(true);
          }}
        />
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
                    <PoiImage
                      src={poi.image}
                      alt={poi.name}
                      poiId={poi.id}
                      poiName={poi.name}
                      category={poi.category}
                      city={poi.city}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
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
                            : poi.category === 'luu-tru'
                            ? 'Lưu trú'
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
          recommendations={recommendedPois}
          recommendationsLoading={isLoadingRecommendations}
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
            onAskCopilot={(question) => {
              setSelectedMapPoiId(null);
              void handleSendChatMessage(question);
            }}
            nearbyPois={allPois
              .filter(
                (p) =>
                  normalizeCity(p.city) === normalizeCity(selectedPoi.city) &&
                  p.id !== selectedPoi.id
              )
              .slice(0, 3)}
            onSelectNearbyPoi={(poiId) => setSelectedMapPoiId(poiId)}
          />
        </div>
      )}

      {/* ─── NGĂN CẨM NANG VĂN HÓA & DU LỊCH XANH HUẾ – ĐÀ NẴNG (MINDTRIP LEARN PRIMER) ─── */}
      {showLearnDrawer && !selectedPoi && (
        <TripLearnDrawer
          onClose={() => setShowLearnDrawer(false)}
          onAskCopilot={(prompt) => {
            void handleSendChatMessage(prompt);
          }}
        />
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

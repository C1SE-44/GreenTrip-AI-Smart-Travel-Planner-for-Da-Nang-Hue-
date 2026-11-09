import { Leaf } from 'lucide-react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TripOverviewView from '@/components/planner/TripOverviewView';
import TripItineraryView from '@/components/planner/TripItineraryView';
import { MorphFavoriteButton, MorphAddButton } from '@/components/ui/MorphButton';
import CreateTripMindtripModal from '@/components/planner/CreateTripMindtripModal';
import type { PoiCategory, PoiCity, Poi } from '@/data/pois';
import { pois, categoryLabels, normalizePois, getGalleryImages, SUB_CATEGORY_LABELS, type PaginatedPoisResponse, isCuratedHighlight } from '@/data/pois';
import PoiMap from '@/components/poi/PoiMap';
import PoiDetailSection from '@/components/poi/PoiDetailSection';
import SavedPlacesView from '@/components/saved/SavedPlacesView';
import HomeDashboardView from '@/components/home/HomeDashboardView';
import { useSavedPlaces } from '@/context/SavedPlacesContext';
import { PoiCardSkeleton } from '@/components/ui/Skeleton';
import Logo from '@/components/ui/Logo';
import { fetchJson } from '@/lib/api';
import { getMe, type UserProfile } from '@/services/auth';
import { getPois, getAllPois } from '@/services/poi';
import ExploreFilterModal, {
  type ExploreFilterValues,
  type PoiCategoryFilter,
  type TimeOfDay,
  DEFAULT_FILTER_VALUES,
  SPECIFIC_FACETS_BY_CATEGORY,
  FEATURES_BY_CATEGORY,
  matchesPoiSubCategory,
  matchesPoiFeature,
} from '@/components/poi/ExploreFilterModal';
import QuickFilterBar from '@/components/poi/QuickFilterBar';
import {
  computePoiWeightedScore,
  ECO_PRIORITY_WEIGHT_MAP,
  isPoiEcoCertified,
  isPoiGreenTransit,
  normalizeSliderWeights,
} from '@/services/poi';


type CityFilter = 'all' | PoiCity;
type CategoryFilter = 'all' | PoiCategory;

export interface UserTrip {
  id: string;
  title: string;
  destination: string;
  startDate?: string;
  peopleCount: number;
  tags?: string[];
  budgetTier?: string;
  flexibleDays?: number;
  flexibleMonth?: string;
  notes?: string;
  createdAt: string;
  image?: string;
  daysCount?: number;
  coverImage?: string;
  status?: string;
  prompt?: string;
  totalBudget?: number;
  itineraryOutline?: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  matchedPois?: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  costBreakdown?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  pacingLabel?: string;
  pacingLevel?: string;
  ideas?: string[];
}


const TABS: { id: 'all' | 'for-you' | 'quan-an' | 'di-tich' | 'canh-quan'; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'for-you', label: 'Dành cho bạn' },
  { id: 'quan-an', label: 'Ẩm thực & Cafe' },
  { id: 'di-tich', label: 'Di tích & Văn hóa' },
  { id: 'canh-quan', label: 'Cảnh quan & Thiên nhiên' },
];


const CATEGORY_META: Record<PoiCategory, { icon: string; label: string }> = {
  'quan-an': { icon: 'ph-fork-knife', label: 'Quán ăn' },
  'di-tich': { icon: 'ph-landmark', label: 'Di tích' },
  'chua': { icon: 'ph-hands-praying', label: 'Chùa & Tâm linh' },
  'canh-quan': { icon: 'ph-mountains', label: 'Cảnh quan' },
};


const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  'Đà Nẵng': { lat: 16.0678, lng: 108.2208 }, // Cầu Rồng / Trung tâm Hải Châu
  'Huế': { lat: 16.4637, lng: 107.5909 },     // Đại Nội / Bờ Nam sông Hương
  default: { lat: 16.0678, lng: 108.2208 },
};

function getDistanceFromLatLonInKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Bán kính trái đất (km)
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function matchesTimeOfDay(poi: Poi, timeOfDayList: TimeOfDay[]): boolean {
  if (timeOfDayList.length === 0) return true;

  return timeOfDayList.some((tod) => {
    // 1. Explicit best_time match if provided
    if (poi.best_time && poi.best_time.length > 0) {
      const matchExplicit = poi.best_time.some((t) => t.toLowerCase().includes(tod));
      if (matchExplicit) return true;
    }

    const name = poi.name.toLowerCase();
    const desc = (poi.description || '').toLowerCase();
    const sub = (poi.sub_category || '').toLowerCase();

    if (tod === 'morning') {
      // Buổi sáng: Chùa, danh thắng đón bình minh, quán ăn sáng, cafe sáng
      if (poi.category === 'chua') return true;
      if (
        sub === 'traditional_noodles' ||
        name.includes('bún') ||
        name.includes('mì') ||
        name.includes('phở') ||
        name.includes('cháo')
      )
        return true;
      if (
        sub === 'workspace_study_cafe' ||
        sub === 'specialty_roastery' ||
        sub === 'retro_street_cafe'
      )
        return true;
      if (
        name.includes('bình minh') ||
        desc.includes('bình minh') ||
        name.includes('mỹ khê') ||
        name.includes('chợ')
      )
        return true;
      if (poi.category === 'di-tich') return true;
      return false;
    }

    if (tod === 'afternoon') {
      // Buổi chiều: Cảnh quan biển, đèo, vịnh, bảo tàng, cafe view đẹp
      if (poi.category === 'canh-quan') return true;
      if (poi.category === 'di-tich') return true;
      if (sub === 'scenic_view_cafe' || sub === 'desserts_bakery') return true;
      if (name.includes('hoàng hôn') || desc.includes('hoàng hôn') || desc.includes('chiều'))
        return true;
      if (poi.category === 'quan-an') return true;
      return false;
    }

    if (tod === 'evening') {
      // Buổi tối: Cầu Rồng, Cầu Sông Hàn, phố đêm, bar/pub, ăn tối, hải sản
      if (
        name.includes('cầu rồng') ||
        name.includes('sông hàn') ||
        name.includes('cầu trường tiền')
      )
        return true;
      if (
        name.includes('chợ đêm') ||
        name.includes('phố đi bộ') ||
        desc.includes('đêm') ||
        desc.includes('tối')
      )
        return true;
      if (
        sub === 'nightlife_bars_pubs' ||
        sub === 'scenic_view_cafe' ||
        sub === 'heritage_fine_dining' ||
        sub === 'coastal_seafood'
      )
        return true;
      if (poi.category === 'quan-an') return true;
      return false;
    }

    return true;
  });
}

export default function ExplorePage({ initialView = 'explore' }: { initialView?: 'home' | 'explore' | 'trips' | 'saved' }) {
  const navigate = useNavigate();
  const { savedIds, pendingIds, openCollectionPicker } = useSavedPlaces();
  const [viewMode, setViewMode] = useState<'home' | 'explore' | 'trips' | 'saved'>(initialView);
  const [activeOverviewTrip, setActiveOverviewTrip] = useState<UserTrip | null>(null);
  const [isCreateTripModalOpen, setIsCreateTripModalOpen] = useState(false);
  const [tripsSubTab, setTripsSubTab] = useState<'trips' | 'calendar'>('trips');
  const [selectedTripForDetails, setSelectedTripForDetails] = useState<UserTrip | null>(null);

  useEffect(() => {
    setViewMode(initialView);
  }, [initialView]);

  useEffect(() => {
    if (initialView !== 'saved') return;
    const checkSavedPageAccess = () => {
      if (!(localStorage.getItem('access_token') || sessionStorage.getItem('access_token'))) {
        navigate('/login', { state: { returnTo: '/saved' }, replace: true });
      }
    };
    checkSavedPageAccess();
    window.addEventListener('auth-change', checkSavedPageAccess);
    return () => window.removeEventListener('auth-change', checkSavedPageAccess);
  }, [initialView, navigate]);

  const [userTrips, setUserTrips] = useState<UserTrip[]>(() => {
    try {
      const raw = localStorage.getItem('greentrip_user_trips');
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error(e);
    }
    return [
      {
        id: 'trip-danang-default',
        title: 'Chuyến đi Đà Nẵng, tháng 11 năm 2026',
        destination: 'Đà Nẵng',
        startDate: 'Ngày 2 – 5 tháng 11',
        peopleCount: 1,
        tags: ['Đà Nẵng', 'Ngày 2 – 5 tháng 11', 'Ai', 'Ngân sách'],
        createdAt: '2026-11-01',
        image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80',
      },
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('greentrip_user_trips', JSON.stringify(userTrips));
    } catch (e) {
      console.error(e);
    }
  }, [userTrips]);

  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState<CityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [activeTab, setActiveTab] = useState<'all' | 'for-you' | 'quan-an' | 'di-tich' | 'canh-quan'>('all');
  // 1. POI hiển thị ô cơ bản trên bản đồ khi người dùng bấm vào
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);
  // 2. POI hiển thị bảng chi tiết sâu toàn màn hình (PoiDetailSection)
  const [fullDetailPoiId, setFullDetailPoiId] = useState<string | null>(null);
  const [hoveredPoiId, setHoveredPoiId] = useState<string | null>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleDebouncedHover = useCallback((id: string | null) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (!id) {
      hoverTimerRef.current = setTimeout(() => {
        setHoveredPoiId(null);
      }, 120);
      return;
    }
    setHoveredPoiId(id);
  }, []);
  const [addedTrips, setAddedTrips] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('greentrip_added_trips');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('greentrip_added_trips', JSON.stringify(Array.from(addedTrips)));
    } catch (e) {
      console.error(e);
    }
  }, [addedTrips]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (initialView !== 'saved') return;
    const media = window.matchMedia('(max-width: 767px)');
    const updateSidebar = () => setIsSidebarCollapsed(media.matches);
    updateSidebar();
    media.addEventListener('change', updateSidebar);
    return () => media.removeEventListener('change', updateSidebar);
  }, [initialView]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 320);
  };

  const toggleAddTrip = (id: string) => {
    setAddedTrips((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allPois, setAllPois] = useState<Poi[]>(pois);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<ExploreFilterValues>(DEFAULT_FILTER_VALUES);

  const [isHovered, setIsHovered] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [thumbTop, setThumbTop] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(0);

  const mainScrollRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef(0);
  const dragStartScrollTopRef = useRef(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateThumb = useCallback(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 4) {
      setThumbHeight(0);
      return;
    }
    const trackPadding = 12;
    const availableTrack = clientHeight - trackPadding * 2;
    const calculatedHeight = Math.max(36, (clientHeight / scrollHeight) * availableTrack);
    const maxScroll = scrollHeight - clientHeight;
    const maxThumbTop = availableTrack - calculatedHeight;
    const calculatedTop = trackPadding + (scrollTop / maxScroll) * maxThumbTop;

    setThumbHeight(calculatedHeight);
    setThumbTop(calculatedTop);
  }, []);

  const handleScroll = useCallback(() => {
    updateThumb();
    setIsScrolling(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 700);
  }, [updateThumb]);

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartYRef.current = e.clientY;
    dragStartScrollTopRef.current = mainScrollRef.current?.scrollTop || 0;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const el = mainScrollRef.current;
      if (!el) return;
      const { scrollHeight, clientHeight } = el;
      const trackPadding = 12;
      const availableTrack = clientHeight - trackPadding * 2;
      const calculatedHeight = Math.max(36, (clientHeight / scrollHeight) * availableTrack);
      const maxScroll = scrollHeight - clientHeight;
      const maxThumbTop = availableTrack - calculatedHeight;

      const deltaY = moveEvent.clientY - dragStartYRef.current;
      const scrollRatio = maxScroll / maxThumbTop;
      el.scrollTop = dragStartScrollTopRef.current + deltaY * scrollRatio;
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  useEffect(() => {
    updateThumb();
    const el = mainScrollRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      updateThumb();
    });
    observer.observe(el);

    window.addEventListener('resize', updateThumb);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateThumb);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [updateThumb, allPois]);

  useEffect(() => {
    let active = true;

    async function loadUserProfile() {
      try {
        const profile = await getMe();
        if (active) setCurrentUser(profile);
      } catch {
        if (active) setCurrentUser(null);
      }
    }

    loadUserProfile();

    const onAuthChange = () => {
      loadUserProfile();
    };

    window.addEventListener('auth-change', onAuthChange);
    return () => {
      active = false;
      window.removeEventListener('auth-change', onAuthChange);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    sessionStorage.removeItem('access_token');
    window.dispatchEvent(new Event('auth-change'));
    setCurrentUser(null);
    setShowProfileMenu(false);
  };

  useEffect(() => {
    let active = true;

    async function loadPois() {
      try {
        setLoading(true);
        setError(null);

        const response = await getAllPois({
          city: cityFilter !== 'all' ? cityFilter : undefined,
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          eco_priority: filterValues.ecoPriority,
          budget_tier: filterValues.budget,
          eco_certified_only: filterValues.ecoCertifiedOnly,
          green_transit_only: filterValues.greenTransitOnly,
        });

        const normalized = normalizePois(response.items);
        if (!active) return;
        setAllPois(normalized.length > 0 ? normalized : pois);
      } catch (loadError) {
        if (!active) return;
        console.warn('Backend POIs fetch failed, using fallback data:', loadError);
        setError(pois && pois.length > 0 ? null : (loadError instanceof Error ? loadError.message : 'Failed to load POIs'));
        setAllPois(pois);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadPois();

    return () => {
      active = false;
    };
  }, [cityFilter, categoryFilter, filterValues]);

  const handleTabChange = (tabId: 'all' | 'for-you' | 'quan-an' | 'di-tich' | 'canh-quan') => {
    setActiveTab(tabId);
    if (tabId === 'for-you') {
      setCategoryFilter('all');
      return;
    }
    setCategoryFilter(tabId);
    if (tabId === 'all') {
      setFilterValues((prev) => ({ ...prev, vibes: [], subCategories: [], features: [], minRating: null }));
    }
  };

  const filteredPois = useMemo(() => {
    const matched = allPois.filter((poi) => {
      const matchCity = cityFilter === 'all' || poi.city === cityFilter;
      let matchCat = true;
      if (categoryFilter === 'di-tich') {
        matchCat = poi.category === 'di-tich' || poi.category === 'chua';
      } else if (categoryFilter === 'quan-an') {
        matchCat = poi.category === 'quan-an';
      } else if (categoryFilter === 'canh-quan') {
        matchCat = poi.category === 'canh-quan';
      }
      const s = search.trim().toLowerCase();
      const matchSearch =
        !s ||
        poi.name.toLowerCase().includes(s) ||
        (poi.cleanName && poi.cleanName.toLowerCase().includes(s)) ||
        poi.description.toLowerCase().includes(s) ||
        (poi.address && poi.address.toLowerCase().includes(s));

      // Eco Priority
      let matchEco = true;
      if (filterValues.ecoPriority === 'basic') matchEco = poi.ecoScore !== null && poi.ecoScore >= 30;
      else if (filterValues.ecoPriority === 'balanced') matchEco = poi.ecoScore !== null && poi.ecoScore >= 55;
      else if (filterValues.ecoPriority === 'eco') matchEco = poi.ecoScore !== null && poi.ecoScore >= 75;
      else if (filterValues.ecoPriority === 'pure') matchEco = poi.ecoScore !== null && poi.ecoScore >= 90;

      // Budget
      let matchBudget = true;
      const cost = poi.estimatedCost ?? 0;
      if (filterValues.freeTicketOnly || filterValues.budget === 'free') {
        matchBudget = poi.budget_tier === 'free' || cost === 0;
      } else if (filterValues.budget === '$') {
        if (categoryFilter === 'quan-an') {
          matchBudget = poi.budget_tier === '$' || cost <= 50000;
        } else {
          matchBudget = poi.budget_tier === '$' || cost <= 50000;
        }
      } else if (filterValues.budget === '$$') {
        if (categoryFilter === 'quan-an') {
          matchBudget = poi.budget_tier === '$$' || (cost > 50000 && cost <= 150000);
        } else {
          matchBudget = poi.budget_tier === '$$' || (cost > 50000 && cost <= 200000);
        }
      } else if (filterValues.budget === '$$$') {
        if (categoryFilter === 'quan-an') {
          matchBudget = poi.budget_tier === '$$$' || cost > 150000;
        } else {
          matchBudget = poi.budget_tier === '$$$' || cost > 200000;
        }
      } else if (filterValues.budget === '$$$$') {
        matchBudget = poi.budget_tier === '$$$$' || cost > 500000;
      }

      // Rating filter (chỉ khi không phải tab all)
      if (categoryFilter !== 'all' && filterValues.minRating !== null && (poi.rating === null || poi.rating < filterValues.minRating)) {
        return false;
      }

      // Eco Certified Only
      if (filterValues.ecoCertifiedOnly && !isPoiEcoCertified(poi)) {
        return false;
      }
      if (filterValues.greenTransitOnly && !isPoiGreenTransit(poi)) {
        return false;
      }
      if (filterValues.rainyDayFriendly && poi.ai_metadata?.rainy_day_friendly !== true) {
        return false;
      }
      if (filterValues.openNowOnly && poi.opening_hours?.open_now === false) {
        return false;
      }

      // Free Ticket Only
      if (filterValues.freeTicketOnly) {
        const isFree = poi.budget_tier === 'free' || (poi.estimatedCost ?? 0) === 0;
        if (!isFree) return false;
      }

      // Cuisines filter
      if (filterValues.cuisines.length > 0) {
        const matchCuisine = filterValues.cuisines.some((c) => {
          const cLower = c.toLowerCase();
          const pCuisine = (poi.cuisine || '').toLowerCase();
          const pSub = (poi.sub_category || '').toLowerCase();
          const pName = poi.name.toLowerCase();
          return pCuisine === cLower || pSub === cLower || pName.includes(cLower);
        });
        if (!matchCuisine) return false;
      }

      // Sub-categories filter (Loại hình chuyên sâu theo nhóm)
      if (categoryFilter !== 'all' && filterValues.subCategories && filterValues.subCategories.length > 0) {
        const matchSub = filterValues.subCategories.some((scId) =>
          matchesPoiSubCategory(poi, scId, categoryFilter)
        );
        if (!matchSub) return false;
      }

      // Features filter (Đặc trưng trải nghiệm chuẩn Mindtrip)
      if (categoryFilter !== 'all' && filterValues.features && filterValues.features.length > 0) {
        const matchFeatures = filterValues.features.every((fId) =>
          matchesPoiFeature(poi, fId, categoryFilter)
        );
        if (!matchFeatures) return false;
      }

      // Category multi-select filter
      const matchCatFilter =
        filterValues.categories.length === 0 ||
        filterValues.categories.includes(poi.category as PoiCategoryFilter);

      // Radius filter (khoảng cách tính bằng km từ trung tâm thành phố)
      if (filterValues.radiusKm !== null) {
        const center = poi.city === 'Huế' ? CITY_CENTERS['Huế'] : CITY_CENTERS['Đà Nẵng'];
        const distance = getDistanceFromLatLonInKm(center.lat, center.lng, poi.lat, poi.lng);
        if (distance > filterValues.radiusKm) {
          return false;
        }
      }

      // Time of day filter (buổi sáng, chiều, tối)
      if (filterValues.timeOfDay && filterValues.timeOfDay.length > 0) {
        if (!matchesTimeOfDay(poi, filterValues.timeOfDay)) {
          return false;
        }
      }

      return matchCity && matchCat && matchSearch && matchEco && matchBudget && matchCatFilter;
    });

    const isCustomWeights =
      filterValues.greenWeight !== 50 ||
      filterValues.budgetWeight !== 50 ||
      filterValues.ecoPriority !== 'all';

    if (activeTab === 'for-you') {
      return [...matched].sort((a, b) => {
        // Thuật toán gợi ý cá nhân hóa chạy ẩn:
        // 1. Điểm xanh (ưu tiên du lịch bền vững)
        const greenA = a.isGreen ? 35 : 0;
        const greenB = b.isGreen ? 35 : 0;
        // 2. Điểm đánh giá thực tế
        const ratingA = (a.rating || 4.0) * 10;
        const ratingB = (b.rating || 4.0) * 10;
        // 3. Địa điểm yêu thích / đã lưu của người dùng
        const savedA = savedIds.has(a.id) ? 20 : 0;
        const savedB = savedIds.has(b.id) ? 20 : 0;
        // 4. Địa điểm biểu tượng / curated highlights
        const highlightA = isCuratedHighlight(a) ? 25 : 0;
        const highlightB = isCuratedHighlight(b) ? 25 : 0;

        const scoreA = greenA + ratingA + savedA + highlightA;
        const scoreB = greenB + ratingB + savedB + highlightB;
        return scoreB - scoreA;
      });
    }

    if (!isCustomWeights) {
      return matched;
    }

    const effectiveGreenWeight =
      filterValues.greenWeight !== 50 || filterValues.budgetWeight !== 50
        ? filterValues.greenWeight
        : ECO_PRIORITY_WEIGHT_MAP[filterValues.ecoPriority];
    const effectiveBudgetWeight = filterValues.budgetWeight;

    return [...matched].sort((a, b) => {
      const scoreDiff =
        computePoiWeightedScore(b, effectiveGreenWeight, effectiveBudgetWeight) -
        computePoiWeightedScore(a, effectiveGreenWeight, effectiveBudgetWeight);
      if (Math.abs(scoreDiff) > 1e-6) {
        return scoreDiff;
      }
      return a.name.localeCompare(b.name, 'vi');
    });
  }, [allPois, search, cityFilter, categoryFilter, filterValues, activeTab, savedIds]);

  // Đếm số lượng filter đang active chuẩn Mindtrip
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterValues.budget !== 'all') count++;
    if (filterValues.ecoPriority !== 'all') count++;
    if (filterValues.ecoCertifiedOnly) count++;
    if (filterValues.greenTransitOnly) count++;
    if (filterValues.categories.length > 0) count++;
    if (filterValues.timeOfDay.length > 0) count++;
    if (filterValues.radiusKm !== null) count++;
    if (filterValues.cuisines.length > 0) count += filterValues.cuisines.length;
    if (filterValues.minRating !== null) count++;
    if (filterValues.openNowOnly) count++;
    if (categoryFilter !== 'all' && filterValues.vibes.length > 0) count += filterValues.vibes.length;
    if (categoryFilter !== 'all' && filterValues.subCategories.length > 0) count += filterValues.subCategories.length;
    if (categoryFilter !== 'all' && filterValues.features && filterValues.features.length > 0) count += filterValues.features.length;
    if (filterValues.rainyDayFriendly) count++;
    if (filterValues.freeTicketOnly) count++;
    if (filterValues.greenWeight !== 50 || filterValues.budgetWeight !== 50) count++;
    return count;
  }, [filterValues]);

  // Xác định chế độ xem tuyển chọn theo từng chuyên mục (Curated Sections Overview - Chuẩn Mindtrip):
  // Kích hoạt khi ở tab "Tất cả", không tìm kiếm từ khóa, không ở mục 'đã lưu' và không chọn bộ lọc chuyên sâu
  const isCuratedOverview = useMemo(() => {
    return (
      categoryFilter === 'all' &&
      activeTab === 'all' &&
      !search.trim() &&
      viewMode !== 'saved' &&
      activeFilterCount === 0
    );
  }, [categoryFilter, activeTab, search, viewMode, activeFilterCount]);

  // Nhóm các danh mục tuyển chọn đặc biệt cho chế độ xem tổng quan:
  const curatedSections = useMemo(() => {
    if (!isCuratedOverview) return null;

    const sortHighlights = (list: Poi[]) => {
      return [...list].sort((a, b) => {
        const aH = isCuratedHighlight(a) ? 1 : 0;
        const bH = isCuratedHighlight(b) ? 1 : 0;
        if (aH !== bH) return bH - aH;
        return (b.rating || 4.5) - (a.rating || 4.5);
      });
    };

    // 1. Di tích & Biểu tượng văn hóa (Heritage & Iconic Landmarks)
    const allHeritage = filteredPois.filter(
      (p) => p.category === 'di-tich' || p.category === 'chua'
    );
    const topHeritage = sortHighlights(allHeritage).slice(0, 6);

    // 2. Ẩm thực & Quán ăn trứ danh (Dining & Local Culinary)
    const allFood = filteredPois.filter(
      (p) =>
        p.category === 'quan-an' &&
        !p.name.toLowerCase().includes('cafe') &&
        !p.name.toLowerCase().includes('cà phê') &&
        !p.name.toLowerCase().includes('coffee') &&
        !p.sub_category?.includes('cafe')
    );
    const topFood = sortHighlights(allFood).slice(0, 6);

    // 3. Cảnh quan & Thiên nhiên xanh (Nature & Eco Escapes)
    const allNature = filteredPois.filter((p) => p.category === 'canh-quan');
    const topNature = sortHighlights(allNature).slice(0, 6);

    // 4. Cà phê & Không gian Chill (Specialty Coffee & Chill Spots)
    const allCafes = filteredPois.filter(
      (p) =>
        (p.category === 'quan-an' || (p as any).cat_name?.includes('cafe')) &&
        (p.name.toLowerCase().includes('cafe') ||
          p.name.toLowerCase().includes('cà phê') ||
          p.name.toLowerCase().includes('coffee') ||
          p.name.toLowerCase().includes('roastery') ||
          p.sub_category?.includes('cafe') ||
          p.name.toLowerCase().includes('trà'))
    );
    const topCafes = sortHighlights(allCafes).slice(0, 6);

    return {
      heritage: {
        title: 'Điểm đến biểu tượng & Di tích lịch sử',
        subtitle: 'Khám phá những di sản, danh thắng và công trình kiến trúc vượt thời gian',
        total: allHeritage.length,
        items: topHeritage,
        categoryKey: 'di-tich' as PoiCategoryFilter,
      },
      food: {
        title: 'Ẩm thực & Quán ăn trứ danh',
        subtitle: 'Hương vị bản địa xứ Quảng - Đà Thành và Cố đô Huế đạt chuẩn Michelin',
        total: allFood.length,
        items: topFood,
        categoryKey: 'quan-an' as PoiCategoryFilter,
      },
      nature: {
        title: 'Trải nghiệm Xanh & Cảnh quan thiên nhiên',
        subtitle: 'Những bãi biển cát trắng, đỉnh núi mây ngàn và sinh thái nguyên sơ',
        total: allNature.length,
        items: topNature,
        categoryKey: 'canh-quan' as PoiCategoryFilter,
      },
      cafes: {
        title: 'Cà phê & Không gian thư giãn',
        subtitle: 'Tận hưởng nhịp sống chậm với hương cà phê rang mộc và view tuyệt đẹp',
        total: allCafes.length,
        items: topCafes,
        categoryKey: 'quan-an' as PoiCategoryFilter,
        subCategoryKey: 'cafe',
      },
    };
  }, [isCuratedOverview, filteredPois]);


  const handleSelectPoi = (id: string | null) => {
    setSelectedMapPoiId((prev) => (prev === id ? null : id));
  };

  const handleOpenFullDetail = (id: string) => {
    setFullDetailPoiId(id);
  };

  const fullDetailPoi = useMemo(() => {
    if (!fullDetailPoiId) return null;
    return allPois.find((poi) => poi.id === fullDetailPoiId) || null;
  }, [allPois, fullDetailPoiId]);

const currentCityLabel = cityFilter === 'all' ? 'Đà Nẵng & Huế' : cityFilter;

  return (
    <div className="flex h-screen overflow-hidden font-sans bg-white select-none">
      {/* 1. LEFT SIDEBAR: Padding px-4 cố định, các icon giữ nguyên tọa độ 100%, không bị dịch chuyển */}
      <aside 
        className={`${
          isSidebarCollapsed ? "w-[68px]" : "w-[204px]"
        } px-4 shrink-0 h-full border-r border-gray-100/90 flex flex-col justify-between pt-2.5 pb-6 bg-white z-20 select-none transition-[width] duration-300 ease-in-out group/sidebar relative`} 
        data-purpose="sidebar"
      >
        <div className="flex flex-col">
          {/* Header Sidebar: Brand Logo + Hiệu ứng xoáy sang phải mượt mà khi hover vào logo */}
          <div className="flex items-center justify-between mb-[35px] relative h-10">
            <div className="relative flex items-center h-10">
              {/* Vị trí khung Logo luôn cố định 36x36px ở tọa độ không đổi */}
              <div className="relative w-9 h-9 flex items-center justify-center shrink-0 group/logo">
                {/* 1. Icon Lá: Khi rời chuột là hình lá bình thường; khi menu thu gọn và chạm vào thì xoáy sang phải (120deg) rồi mờ đi */}
                <div 
                  className={`flex items-center justify-center transition-all duration-300 ease-out transform ${
                    isSidebarCollapsed 
                      ? "group-hover/logo:rotate-[120deg] group-hover/logo:scale-0 group-hover/logo:opacity-0" 
                      : ""
                  }`}
                >
                  <Leaf size={24} strokeWidth={2.5} className="text-black" />
                </div>

                {/* 2. Nút tròn ( > ): Chỉ kích hoạt khi thu gọn, tự xoay từ góc -120deg ra 0deg độc lập */}
                {isSidebarCollapsed && (
                  <>
                    <button
                      onClick={toggleSidebar}
                      aria-label="Mở rộng menu"
                      className="absolute inset-0 w-9 h-9 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-800 hover:text-black hover:bg-gray-50 transition-all duration-300 ease-out transform -rotate-[120deg] scale-0 opacity-0 group-hover/logo:rotate-0 group-hover/logo:scale-100 group-hover/logo:opacity-100 cursor-pointer active:scale-90 z-30"
                    >
                      <i className="ph ph-caret-right text-xs font-bold"></i>
                    </button>

                    {/* 3. Ô popup đen "Mở rộng" (tiếng Việt): Nằm ngoài nút xoay nên KHÔNG BỊ XOÁY THEO!
                        Khi nút xoay xong (delay-200), ô Mở rộng trôi nhẹ sang bên cạnh mượt mà */}
                    <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 bg-black text-white text-[12px] font-medium px-2.5 py-1 rounded-md shadow-lg whitespace-nowrap pointer-events-none transition-all duration-200 delay-200 ease-out transform -translate-x-1.5 opacity-0 group-hover/logo:translate-x-0 group-hover/logo:opacity-100 z-50">
                      Mở rộng
                    </div>
                  </>
                )}
              </div>

              {/* Chữ greentrip: Chiều cao và đệm pb-1 pt-0.5 đảm bảo chữ 'g' và 'p' không bao giờ bị cắt mất phần dưới */}
              <span
                className={`font-body font-bold text-black tracking-tighter text-[24px] leading-tight pb-1 pt-0.5 transition-all duration-300 overflow-hidden whitespace-nowrap block ${
                  isSidebarCollapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[130px] opacity-100 ml-1.5"
                }`}
              >
                greentrip
              </span>
            </div>

            {/* Nút thu gọn ( < ) khi menu đang mở rộng */}
            {!isSidebarCollapsed && (
              <button
                onClick={toggleSidebar}
                aria-label="Thu gọn menu"
                className="w-7 h-7 rounded-full bg-white border border-gray-200/90 shadow-xs flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 opacity-0 group-hover/sidebar:opacity-100 transition-all duration-200 cursor-pointer shrink-0 group/collapse relative ml-auto"
                title="Thu gọn menu"
              >
                <i className="ph ph-caret-left text-xs font-bold"></i>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white text-[11px] font-semibold px-2 py-0.5 rounded-md shadow-md whitespace-nowrap pointer-events-none opacity-0 group-hover/collapse:opacity-100 transition-opacity z-50">
                  Thu gọn
                </div>
              </button>
            )}
          </div>

          {/* Navigation Links - Khung icon 36x36px cố định vĩnh viễn, không dịch chuyển một pixel nào */}
          <nav className="flex flex-col space-y-[21px] text-sm">
            {[
              { 
                key: 'home', 
                onClick: () => { setViewMode('home'); navigate('/home'); }, 
                icon: viewMode === 'home' ? 'ph-fill ph-house' : 'ph ph-house', 
                label: 'Trang chủ', 
                active: viewMode === 'home' 
              },
              { 
                key: 'explore', 
                onClick: () => { setViewMode('explore'); navigate('/explore'); }, 
                icon: viewMode === 'explore' ? 'ph-fill ph-compass' : 'ph ph-compass', 
                label: 'Khám phá', 
                active: viewMode === 'explore' 
              },
              { 
                key: 'saved', 
                onClick: () => {
                  setViewMode('saved');
                  navigate('/saved');
                },
                icon: viewMode === 'saved' ? 'ph-fill ph-heart text-rose-600' : 'ph ph-heart',
                label: 'Đã lưu', 
                active: viewMode === 'saved',
                badge: savedIds.size > 0 ? String(savedIds.size) : undefined
              },
                            { 
                key: 'trips', 
                onClick: () => { 
                  setViewMode('trips'); 
                  setActiveOverviewTrip(null);
                  setSelectedTripForDetails(null);
                  navigate('/planner'); 
                }, 
                icon: viewMode === 'trips' ? 'ph-fill ph-calendar-plus' : 'ph ph-calendar-plus', 
                label: 'Lịch trình', 
                active: viewMode === 'trips',
                badge: userTrips.length > 0 ? String(userTrips.length) : undefined
              },
            ].map((item) => {
              const itemContent = (
                <div className={`flex items-center py-0.5 text-black transition-colors group/item relative ${item.active ? 'font-semibold' : ''}`}>
                  {/* Khung icon cố định 36x36px ở tọa độ không đổi */}
                  <div className="w-9 h-9 flex items-center justify-center shrink-0 relative">
                    <i className={`${item.icon} text-[23px] text-black ${item.active ? '' : 'group-hover/item:opacity-75'} transition-opacity`}></i>
                    {item.badge && (
                      <span className="absolute -top-1 -right-1 bg-neutral-900 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  
                  <span
                    className={`text-[14px] tracking-tight text-black transition-all duration-300 overflow-hidden whitespace-nowrap ${
                      item.active ? 'font-bold' : 'font-medium'
                    } ${
                      isSidebarCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[120px] opacity-100 ml-2.5'
                    }`}
                  >
                    {item.label}
                  </span>

                  {/* Tooltip khi thu gọn menu (Icon-only mode) */}
                  {isSidebarCollapsed && (
                    <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 bg-black text-white text-[12px] font-medium px-2.5 py-1 rounded-md shadow-lg whitespace-nowrap pointer-events-none opacity-0 group-hover/item:opacity-100 transition-all duration-200 -translate-x-1 group-hover/item:translate-x-0 z-50">
                      {item.label}
                    </div>
                  )}
                </div>
              );

              return (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className="w-full text-left bg-transparent border-0 cursor-pointer p-0 select-none"
                >
                  {itemContent}
                </button>
              );
            })}
          </nav>

          {/* Button Tạo chuyến đi - Nút hành động chính chuẩn Mindtrip */}
          <div className="pt-6">
            {isSidebarCollapsed ? (
              <div className="w-9 h-9 flex items-center justify-center shrink-0">
                <button
                  onClick={() => setIsCreateTripModalOpen(true)}
                  className="w-9 h-9 bg-black hover:bg-neutral-800 text-white rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 group/newchat relative"
                  title="Tạo chuyến đi"
                >
                  <i className="ph ph-plus text-[18px] text-white font-bold"></i>
                  <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 bg-black text-white text-[11.5px] font-medium px-2.5 py-1 rounded-md shadow-md whitespace-nowrap pointer-events-none opacity-0 group-hover/newchat:opacity-100 transition-opacity z-50">
                    Tạo chuyến đi
                  </div>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsCreateTripModalOpen(true)}
                className="w-full py-2.5 px-3 bg-black hover:bg-neutral-800 text-white font-semibold text-[13px] rounded-full transition-all text-center border border-black shadow-xs cursor-pointer flex items-center justify-center gap-2 active:scale-98 group/create-btn"
                title="Tạo chuyến đi mới đến Đà Nẵng hoặc Huế"
              >
                <i className="ph ph-plus text-white text-[15px] font-bold"></i>
                <span className="truncate">Tạo chuyến đi</span>
              </button>
            )}
          </div>
        </div>

        {/* Sidebar Bottom / User & Footer - Cố định tọa độ */}
        <div className="flex flex-col gap-4 relative">
          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className={`absolute bottom-20 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-fadeIn ${
              isSidebarCollapsed ? "left-2 w-48" : "left-0 right-0"
            }`}>
              {currentUser ? (
                <div className="flex flex-col">
                  <div className="px-2.5 py-2 border-b border-gray-100">
                    <p className="text-xs font-bold text-gray-900 truncate">{currentUser.full_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{currentUser.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl transition mt-1 cursor-pointer"
                  >
                    Đăng xuất
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="block text-center px-3 py-2 text-xs font-bold text-white bg-black hover:bg-gray-800 rounded-xl transition"
                >
                  Đăng nhập
                </Link>
              )}
            </div>
          )}

          {/* Profile Button - Cố định tọa độ Avatar */}
          <div
            onClick={() => setShowProfileMenu((prev) => !prev)}
            className="flex items-center cursor-pointer hover:opacity-80 transition-all duration-300 py-0.5 justify-start px-0"
            title={currentUser?.full_name || 'Du khách'}
          >
            <div className="w-9 h-9 flex items-center justify-center shrink-0">
              <div className="w-[34px] h-[34px] rounded-full overflow-hidden bg-zinc-900 text-white flex items-center justify-center font-bold text-[12px] shrink-0 shadow-xs">
                {currentUser?.full_name ? currentUser.full_name.charAt(0).toUpperCase() : 'G'}
              </div>
            </div>
            <div
              className={`flex flex-col justify-center h-[34px] text-left min-w-0 transition-all duration-300 overflow-hidden ${
                isSidebarCollapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[120px] opacity-100 ml-2.5"
              }`}
            >
              <span className="text-[14px] font-normal text-black leading-[17px] truncate whitespace-nowrap">
                {currentUser?.full_name || 'Du khách'}
              </span>
              <span className="text-[12px] text-gray-500 font-normal leading-[15px] truncate whitespace-nowrap">
                {currentUser?.email ? `@${currentUser.email.split('@')[0]}` : '@greentrip-user'}
              </span>
            </div>
            
            <div
              className={`flex items-center gap-[2.5px] shrink-0 ml-auto p-1 transition-all duration-300 overflow-hidden ${
                isSidebarCollapsed ? "max-w-0 opacity-0" : "max-w-[24px] opacity-100"
              }`}
              title="Tuỳ chọn"
            >
              <span className="w-[3px] h-[3px] rounded-full bg-black inline-block"></span>
              <span className="w-[3px] h-[3px] rounded-full bg-black inline-block"></span>
              <span className="w-[3px] h-[3px] rounded-full bg-black inline-block"></span>
            </div>
          </div>

          {/* Legal footer */}
          <div className="overflow-hidden transition-all duration-300">
            {!isSidebarCollapsed ? (
              <div className="px-0 text-[11px] text-gray-400 leading-relaxed font-normal mt-1 animate-fadeIn">
                <p>© 2026 GreenTrip • Du lịch thông minh & Bền vững</p>
              </div>
            ) : (
              <div className="w-9 h-9 flex items-center justify-center shrink-0">
                <div className="flex justify-center text-gray-400 hover:text-black transition cursor-pointer text-xs" title="© 2026 GreenTrip • Du lịch thông minh & Bền vững">
                  <i className="ph ph-info text-[16px]"></i>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {viewMode === 'home' ? (
        <HomeDashboardView
          onNavigateToExplore={() => {
            setViewMode('explore');
            navigate('/explore');
          }}
          onNavigateToTrips={() => {
            setViewMode('trips');
            setActiveOverviewTrip(null);
            setSelectedTripForDetails(null);
            navigate('/planner');
          }}
          onNavigateToSaved={() => {
            setViewMode('saved');
            navigate('/saved');
          }}
          onCreateTrip={(defaultDest, defaultTitle) => {
            setIsCreateTripModalOpen(true);
          }}
          currentUser={currentUser}
        />
      ) : viewMode === 'trips' ? (
        selectedTripForDetails ? (
          <TripItineraryView
            trip={selectedTripForDetails}
            allPois={allPois}
            onBack={() => setSelectedTripForDetails(null)}
            onUpdateTrip={(updatedTrip) => {
              setSelectedTripForDetails(updatedTrip);
              setActiveOverviewTrip(updatedTrip);
              setUserTrips((prev) => prev.map((t) => (t.id === updatedTrip.id ? updatedTrip : t)));
              try {
                const raw = localStorage.getItem('greentrip_user_trips');
                if (raw) {
                  const trips: UserTrip[] = JSON.parse(raw);
                  const updatedList = trips.map((t) => (t.id === updatedTrip.id ? updatedTrip : t));
                  localStorage.setItem('greentrip_user_trips', JSON.stringify(updatedList));
                }
              } catch (e) {
                console.error(e);
              }
            }}
          />
        ) : activeOverviewTrip ? (
          <TripOverviewView
            trip={activeOverviewTrip}
            onBack={() => setActiveOverviewTrip(null)}
            onOpenItineraryDetails={() => setSelectedTripForDetails(activeOverviewTrip)}
            onUpdateTrip={(updatedTrip) => {
              setActiveOverviewTrip(updatedTrip);
              setUserTrips((prev) => prev.map((t) => (t.id === updatedTrip.id ? updatedTrip : t)));
              try {
                const raw = localStorage.getItem('greentrip_user_trips');
                if (raw) {
                  const trips: UserTrip[] = JSON.parse(raw);
                  const updatedList = trips.map((t) => (t.id === updatedTrip.id ? updatedTrip : t));
                  localStorage.setItem('greentrip_user_trips', JSON.stringify(updatedList));
                }
              } catch (e) {
                console.error(e);
              }
            }}
          />
        ) : (
        /* ─── MINDTRIP TRIPS VIEW ─── */
        <main className="flex-1 h-full bg-white overflow-y-auto auto-hide-scrollbar select-none animate-fadeIn">
          {/* Section 1: Lề & khung nội dung - Lề trái 115px (pl-[64px]), lề phải 134px (pr-[74px]), tâm tiêu đề cách mép trên 160px (pt-[74px]) */}
          <div className="w-full pl-6 sm:pl-10 lg:pl-[64px] pr-6 sm:pr-10 lg:pr-[74px] pt-[74px] pb-24">
            {/* Section 2.1: Tiêu đề & nút Chuyến đi mới - Tiêu đề 52px (text-[28px] sm:text-[32px] lg:text-[34px], -5%); nút cao 71px (h-[40px]), mb-[38px] đến hàng tab (120px) */}
            <div className="flex items-center justify-between mb-[38px]">
              <h1 className="text-[28px] sm:text-[32px] lg:text-[34px] font-bold text-gray-950 tracking-tight leading-none">
                Lịch trình của bạn
              </h1>
              <button
                onClick={() => setIsCreateTripModalOpen(true)}
                className="ml-auto w-auto whitespace-nowrap bg-black text-white hover:bg-neutral-800 h-[40px] px-[36px] rounded-full text-[13.5px] font-semibold flex items-center gap-[14px] transition active:scale-95 shadow-xs cursor-pointer shrink-0"
              >
                <i className="ph ph-plus font-bold text-sm"></i>
                <span>Chuyến đi mới</span>
              </button>
            </div>

            {/* Section 2.2: Hàng Tab - Cỡ chữ 147px (text-[16px]), padding ngang 14px (px-[8px]), khoảng cách 2 chữ 48px (gap-[11px]), chữ cách gạch chân 38px (pb-[8px], -5%), gạch chân dày 3px (border-b-[1.5px]) */}
            <div className="flex items-center gap-[11px]">
              <button
                onClick={() => setTripsSubTab('trips')}
                className={`px-[8px] pb-[8px] text-[16px] cursor-pointer transition-colors ${
                  tripsSubTab === 'trips'
                    ? 'border-b-[1.5px] border-black font-bold text-black'
                    : 'font-medium text-gray-500 hover:text-black border-b-[1.5px] border-transparent'
                }`}
              >
                Chuyến đi
              </button>
              <button
                onClick={() => setTripsSubTab('calendar')}
                className={`px-[8px] pb-[8px] text-[16px] cursor-pointer transition-colors ${
                  tripsSubTab === 'calendar'
                    ? 'border-b-[1.5px] border-black font-bold text-black'
                    : 'font-medium text-gray-500 hover:text-black border-b-[1.5px] border-transparent'
                }`}
              >
                Lịch
              </button>
            </div>

            {/* Section 2.3: Ô "Tất cả ⌄" - Cách hàng tab 108px (mt-[32px], -14%), thụt lề 24px so với mép phải nút (pr-[13px]), cỡ chữ 13px */}
            <div className="flex justify-end pr-[13px] mt-[32px] mb-[20px]">
              <button className="flex items-center gap-1.5 text-[13px] text-gray-800 hover:text-black font-medium transition cursor-pointer">
                <span>Tất cả</span>
                <i className="ph ph-caret-down text-xs"></i>
              </button>
            </div>

            {tripsSubTab === 'trips' ? (
              userTrips.length === 0 ? (
                /* Section 3: Khối trạng thái trống ("Bạn chưa có chuyến đi nào") chuẩn Mindtrip */
                <div className="pt-[138px] pb-[120px] flex flex-col items-center justify-center text-center">
                  {/* Cụm hai tấm ảnh du lịch nghiêng chồng lên nhau - Kích thước chuẩn Mindtrip (195px x 180px thực tế hiển thị), thu nhỏ 46% so với trước, tâm cách "Tất cả" 324px, đáy cách tiêu đề nhỏ 150px (mb-[78px]) */}
                  <div
                    aria-hidden="true"
                    className="relative mx-auto w-[101px] h-[90px] mb-[78px] group/cards select-none"
                  >
                    {/* Tấm sau: Cảnh Cầu Rồng / Đại Nội Huế (tông ấm), vuông 58px, left 0, top 32px, viền 3.2px, rotate(7deg), hover rotate(4deg) */}
                    <div
                      className="absolute left-0 top-[32px] w-[58px] h-[58px] rounded-[8px] border-[3.2px] border-white bg-[#E5E7EB] overflow-hidden shadow-[0_6px_14px_rgba(0,0,0,0.14)] rotate-[7deg] group-hover/cards:rotate-[4deg] motion-safe:transition-transform motion-safe:duration-200 motion-reduce:transform-none z-0"
                    >
                      <img
                        src="/images/empty-trips/back-landmark.jpg"
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      {/* Gradient từ trong suốt lên đen 55% ở 40% chiều cao phía dưới */}
                      <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
                      {/* Góc dưới trái cách mép 5px: Icon vali viền trắng mảnh 7px + thanh trắng 19x4px cách 3px */}
                      <div className="absolute bottom-[5px] left-[5px] flex items-center gap-[3px] z-10 pointer-events-none">
                        <svg
                          className="w-[7px] h-[7px] text-white shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M6 20h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" />
                          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                        </svg>
                        <div className="w-[19px] h-[4px] rounded-full bg-white/85 shrink-0" />
                      </div>
                    </div>

                    {/* Tấm trước: Cảnh biển / đèo Hải Vân (tông xanh sáng), vuông 58px, right 0, top 0, viền 3.2px, rotate(15deg), hover rotate(18deg), z-index cao hơn đè 1/3 góc phải trên của tấm sau */}
                    <div
                      className="absolute right-0 top-0 w-[58px] h-[58px] rounded-[8px] border-[3.2px] border-white bg-[#E5E7EB] overflow-hidden shadow-[0_6px_14px_rgba(0,0,0,0.14)] rotate-[15deg] group-hover/cards:rotate-[18deg] motion-safe:transition-transform motion-safe:duration-200 motion-reduce:transform-none z-10"
                    >
                      <img
                        src="/images/empty-trips/front-sea.jpg"
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      {/* Gradient từ trong suốt lên đen 55% ở 40% chiều cao phía dưới */}
                      <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
                      {/* Góc dưới trái cách mép 5px: Icon vali viền trắng mảnh 7px + thanh trắng 19x4px cách 3px */}
                      <div className="absolute bottom-[5px] left-[5px] flex items-center gap-[3px] z-10 pointer-events-none">
                        <svg
                          className="w-[7px] h-[7px] text-white shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M6 20h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" />
                          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                        </svg>
                        <div className="w-[19px] h-[4px] rounded-full bg-white/85 shrink-0" />
                      </div>
                    </div>
                  </div>

                  {/* Tiêu đề nhỏ: rộng 395px (text-[18px]), cách mô tả 62px (mb-[10px], -6%) */}
                  <h3 className="text-[18px] font-bold text-gray-950 mb-[10px] tracking-tight">
                    Bạn chưa có chuyến đi nào
                  </h3>
                  {/* Mô tả: giữ nguyên cỡ chữ đã khớp với Mindtrip, cách nút 60px (mb-[19px], -19%) */}
                  <p className="text-[16px] text-[#333333] max-w-md mb-[19px] leading-relaxed font-normal">
                    Bắt đầu lên kế hoạch cho chuyến phiêu lưu tiếp theo đến Đà Nẵng hoặc Huế bằng AI.
                  </p>
                  {/* Nút Tạo chuyến đi đầu tiên: cao 100px (h-[54px]), padding 48px, cỡ chữ 15px, không bị cắt đáy */}
                  <button
                    onClick={() => setIsCreateTripModalOpen(true)}
                    className="bg-black text-white px-[48px] h-[54px] rounded-full text-[15px] font-semibold hover:bg-neutral-800 transition active:scale-95 shadow-xs cursor-pointer flex items-center justify-center shrink-0"
                  >
                    Tạo chuyến đi đầu tiên
                  </button>
                </div>
              ) : (
                /* Grid of Trip Cards */
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {userTrips.map((trip) => (
                      <div
                        key={trip.id}
                        onClick={() => setActiveOverviewTrip(trip)}
                        className="group border border-gray-200/90 hover:border-gray-300 rounded-[22px] overflow-hidden bg-white shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col"
                      >
                        <div className="relative aspect-[16/10] w-full bg-gray-100 overflow-hidden">
                          <img
                            src={trip.image || 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80'}
                            alt={trip.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">
                            {trip.destination}
                          </span>
                        </div>
                        <div className="p-4 flex-1 flex flex-col justify-between">
                          <div>
                            <h3 className="font-bold text-[16px] text-gray-900 group-hover:text-black line-clamp-1 mb-1">
                              {trip.title}
                            </h3>
                            <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-2">
                              <i className="ph ph-calendar-blank"></i> {trip.startDate || 'Tháng 11, 2026'} • {trip.peopleCount} người
                            </p>
                          </div>
                          <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setUserTrips((prev) => prev.filter((t) => t.id !== trip.id));
                              }}
                              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                              title="Xóa chuyến đi"
                            >
                              <i className="ph ph-trash"></i> Xóa
                            </button>
                            <span className="text-xs font-bold text-black flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                              Xem lịch trình <i className="ph ph-arrow-right text-[11px]"></i>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )            ) : (
              /* Calendar SubTab View: Render Prototype Lịch trình chi tiết */
              userTrips.length > 0 ? (
                <div className="h-[calc(100vh-140px)] flex flex-col -mx-[64px] sm:-mx-[74px] -my-4 overflow-hidden">
                  <TripItineraryView
                    trip={userTrips[0]}
                    allPois={allPois}
                    onBack={() => setTripsSubTab('trips')}
                    onUpdateTrip={(updatedTrip) => {
                      setUserTrips((prev) => prev.map((t) => (t.id === updatedTrip.id ? updatedTrip : t)));
                      try {
                        localStorage.setItem(
                          'greentrip_user_trips',
                          JSON.stringify(userTrips.map((t) => (t.id === updatedTrip.id ? updatedTrip : t)))
                        );
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="py-24 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 text-2xl mb-4">
                    <i className="ph ph-calendar"></i>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">Xem theo lịch trình</h3>
                  <p className="text-xs text-gray-500 max-w-sm mb-5 leading-relaxed">
                    Bạn chưa có chuyến đi nào. Hãy tạo chuyến đi mới để tự do sắp xếp lịch trình nhé!
                  </p>
                  <button
                    onClick={() => setIsCreateTripModalOpen(true)}
                    className="px-5 py-2 bg-black hover:bg-neutral-800 text-white rounded-full text-xs font-semibold transition cursor-pointer"
                  >
                    + Tạo chuyến đi ngay
                  </button>
                </div>
              )
            )}
          </div>
        </main>
        )
      ) : viewMode === 'saved' ? (
        <SavedPlacesView addedTrips={addedTrips} onToggleAddTrip={toggleAddTrip} />
      ) : (
        <>
      {/* 2. MIDDLE LIST (EXPLORE): Khi thu gọn sidebar, phần giữa to rộng hơn (715px) có hiệu ứng chuyển động mượt mà, map chỉ nhích nhẹ */}
      <main
        className={`${
          isMapExpanded 
            ? "hidden" 
            : isSidebarCollapsed 
              ? "w-[715px] shrink-0" 
              : "w-[605px] shrink-0"
        } h-full relative bg-white flex flex-col select-none transition-[width] duration-300 ease-in-out`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        data-purpose="content-list-stream"
      >
        {/* Scrollable Container (no native scrollbar) */}
        <div
          ref={mainScrollRef}
          onScroll={handleScroll}
          className="w-full h-full overflow-y-auto no-scrollbar scroll-smooth"
        >
        {/* Top Bar: Title & Search (di chuyển theo toàn bộ luồng cuộn như landing page) */}
        <header className="w-full bg-white px-6 pt-10 pb-3 space-y-3.5">
          {/* Location Title Dropdown */}
          <div className="relative">
            <div 
              onClick={() => setShowCityDropdown(!showCityDropdown)}
              className="inline-flex items-center gap-1.5 cursor-pointer select-none group"
            >
              <h1 className="text-[22px] font-bold tracking-tight text-gray-950 group-hover:text-black">
                {currentCityLabel}
              </h1>
              <i className="ph ph-caret-down font-bold text-gray-950 text-sm"></i>
            </div>

            {showCityDropdown && (
              <div className="absolute top-10 left-0 bg-white shadow-xl border border-gray-100 rounded-2xl py-2 w-48 z-50">
                <button
                  onClick={() => { setCityFilter('all'); setShowCityDropdown(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${cityFilter === 'all' ? 'font-bold text-black' : 'text-gray-700'}`}
                >
                  <span>Tất cả khu vực (Đà Nẵng & Huế)</span>
                  {cityFilter === 'all' && <i className="ph ph-check font-bold"></i>}
                </button>
                <button
                  onClick={() => { setCityFilter('Đà Nẵng'); setShowCityDropdown(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${cityFilter === 'Đà Nẵng' ? 'font-bold text-black' : 'text-gray-700'}`}
                >
                  <span>Đà Nẵng</span>
                  {cityFilter === 'Đà Nẵng' && <i className="ph ph-check font-bold"></i>}
                </button>
                <button
                  onClick={() => { setCityFilter('Huế'); setShowCityDropdown(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${cityFilter === 'Huế' ? 'font-bold text-black' : 'text-gray-700'}`}
                >
                  <span>Huế</span>
                  {cityFilter === 'Huế' && <i className="ph ph-check font-bold"></i>}
                </button>
              </div>
            )}
          </div>

          {/* Search Box & Filter (+25% height, scaled text & icons) */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative flex items-center">
              <i className="ph ph-magnifying-glass text-gray-400 absolute left-4 text-xl"></i>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 h-[50px] bg-[#F3F4F6] text-[15px] placeholder-gray-400 text-gray-900 rounded-full border-none focus:outline-none focus:ring-1 focus:ring-gray-300 transition"
                placeholder="Tìm kiếm địa điểm, di tích..."
                type="text"
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  className="absolute right-4 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <i className="ph ph-x-circle text-lg"></i>
                </button>
              )}
            </div>

            <button 
              onClick={() => setIsFilterPopoverOpen(true)}
              className={`flex items-center gap-2 px-5 h-[50px] rounded-full border transition text-[15px] font-medium cursor-pointer ${
                activeFilterCount > 0 || isFilterPopoverOpen
                  ? 'bg-black text-white border-black shadow-sm'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-800'
              }`}
            >
              <i className="ph ph-faders text-lg"></i>
              <span>Bộ lọc</span>
              {activeFilterCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white ml-1">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Scrollable Category Tabs: Nhóm lớn cấp 1 */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[14px] font-medium no-scrollbar">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`whitespace-nowrap transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'px-4 py-2 bg-neutral-950 text-white rounded-full font-semibold shadow-xs text-[13px] border border-neutral-950'
                      : 'px-4 py-2 bg-neutral-100/90 hover:bg-neutral-200/90 text-neutral-700 hover:text-neutral-950 rounded-full font-medium text-[13px] border border-neutral-200/60'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>


        </header>

        {/* Cards Scrollable Area */}
        <div className="px-6 py-1">
          {/* Section Subheading & Active Filter Reset (Quiet Luxury & Mindtrip Style) */}
          <div className="mb-3.5 mt-5 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[17px] font-bold text-neutral-950 tracking-tight font-heading">
                {isCuratedOverview
                  ? 'Khám phá nổi bật'
                  : search.trim()
                  ? `Kết quả tìm kiếm cho "${search.trim()}"`
                  : activeTab === 'for-you'
                  ? 'Gợi ý dành riêng cho bạn'
                  : activeTab !== 'all'
                  ? (TABS.find((t) => t.id === activeTab)?.label || 'Địa điểm')
                  : 'Tất cả địa điểm'}
              </h2>
              <span className="text-[13.5px] font-semibold text-neutral-400">
                ({filteredPois.length})
              </span>
            </div>
            {(filterValues.minRating !== null || filterValues.radiusKm !== null || filterValues.ecoCertifiedOnly || filterValues.budget !== 'all' || filterValues.subCategories.length > 0 || (filterValues.features && filterValues.features.length > 0) || filterValues.timeOfDay.length > 0) && (
              <button
                type="button"
                onClick={() => setFilterValues(DEFAULT_FILTER_VALUES)}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-500 hover:text-black transition-colors cursor-pointer group select-none active:scale-95"
                title="Đặt lại toàn bộ bộ lọc"
              >
                <i className="ph ph-arrow-counter-clockwise text-[13px] text-neutral-400 group-hover:text-black group-hover:-rotate-45 transition-transform duration-200"></i>
                <span>Đặt lại</span>
              </button>
            )}
          </div>

          {/* Active Filter Chips Bar - Minimal Floating Pills */}
          {(filterValues.minRating !== null || filterValues.radiusKm !== null || filterValues.ecoCertifiedOnly || filterValues.budget !== 'all' || filterValues.subCategories.length > 0 || (filterValues.features && filterValues.features.length > 0) || filterValues.timeOfDay.length > 0) && (
            <div className="flex items-center gap-2 flex-wrap mb-4 animate-fadeIn">
              {filterValues.minRating !== null && (
                <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-white border border-neutral-200/90 text-neutral-800 text-[12px] font-medium shadow-2xs hover:border-neutral-300 transition-all">
                  <span className="text-amber-500 text-[11px]">★</span>
                  <span>{filterValues.minRating}+ sao</span>
                  <button
                    type="button"
                    onClick={() => setFilterValues(p => ({ ...p, minRating: null }))}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors ml-0.5 cursor-pointer"
                    title="Gỡ lọc đánh giá"
                    aria-label="Gỡ lọc đánh giá"
                  >
                    <i className="ph ph-x text-[10px] font-bold"></i>
                  </button>
                </span>
              )}
              {filterValues.budget !== 'all' && (
                <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-white border border-neutral-200/90 text-neutral-800 text-[12px] font-medium shadow-2xs hover:border-neutral-300 transition-all">
                  <span className="text-neutral-400 text-[11px]">🏷️</span>
                  <span>Giá: {filterValues.budget === 'free' ? 'Miễn phí' : filterValues.budget}</span>
                  <button
                    type="button"
                    onClick={() => setFilterValues(p => ({ ...p, budget: 'all' }))}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors ml-0.5 cursor-pointer"
                    title="Gỡ lọc ngân sách"
                    aria-label="Gỡ lọc ngân sách"
                  >
                    <i className="ph ph-x text-[10px] font-bold"></i>
                  </button>
                </span>
              )}
              {filterValues.radiusKm !== null && (
                <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-white border border-neutral-200/90 text-neutral-800 text-[12px] font-medium shadow-2xs hover:border-neutral-300 transition-all">
                  <span className="text-neutral-400 text-[11px]">📍</span>
                  <span>Trong {filterValues.radiusKm} km</span>
                  <button
                    type="button"
                    onClick={() => setFilterValues(p => ({ ...p, radiusKm: null }))}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors ml-0.5 cursor-pointer"
                    title="Gỡ lọc khoảng cách"
                    aria-label="Gỡ lọc khoảng cách"
                  >
                    <i className="ph ph-x text-[10px] font-bold"></i>
                  </button>
                </span>
              )}
              {filterValues.ecoCertifiedOnly && (
                <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-emerald-50/90 border border-emerald-200 text-emerald-900 text-[12px] font-medium shadow-2xs hover:border-emerald-300 transition-all">
                  <span className="text-[12px]">🌱</span>
                  <span>Địa điểm xanh</span>
                  <button
                    type="button"
                    onClick={() => setFilterValues(p => ({ ...p, ecoCertifiedOnly: false }))}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-emerald-600 hover:text-emerald-950 hover:bg-emerald-100/70 transition-colors ml-0.5 cursor-pointer"
                    title="Gỡ lọc địa điểm xanh"
                    aria-label="Gỡ lọc địa điểm xanh"
                  >
                    <i className="ph ph-x text-[10px] font-bold"></i>
                  </button>
                </span>
              )}
              {filterValues.timeOfDay.length > 0 && (
                <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-white border border-neutral-200/90 text-neutral-800 text-[12px] font-medium shadow-2xs hover:border-neutral-300 transition-all">
                  <span className="text-neutral-400 text-[11px]">
                    {filterValues.timeOfDay.includes('evening') ? '🌙' : '☀️'}
                  </span>
                  <span>
                    {filterValues.timeOfDay.includes('morning')
                      ? 'Buổi sáng'
                      : filterValues.timeOfDay.includes('afternoon')
                      ? 'Buổi chiều'
                      : 'Buổi tối'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilterValues(p => ({ ...p, timeOfDay: [] }))}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors ml-0.5 cursor-pointer"
                    title="Gỡ lọc thời điểm"
                    aria-label="Gỡ lọc thời điểm"
                  >
                    <i className="ph ph-x text-[10px] font-bold"></i>
                  </button>
                </span>
              )}
              {activeTab !== 'all' && filterValues.subCategories.map((sc) => {
                const facets = SPECIFIC_FACETS_BY_CATEGORY[activeTab] || [];
                const label = facets.find((f) => f.id === sc)?.label || SUB_CATEGORY_LABELS[sc] || sc;
                return (
                  <span
                    key={sc}
                    className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-white border border-neutral-200/90 text-neutral-800 text-[12px] font-medium shadow-2xs hover:border-neutral-300 transition-all"
                  >
                    <span>{label}</span>
                    <button
                      type="button"
                      onClick={() => setFilterValues(p => ({ ...p, subCategories: p.subCategories.filter(item => item !== sc) }))}
                      className="w-4 h-4 rounded-full flex items-center justify-center text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors ml-0.5 cursor-pointer"
                      title={'Gỡ lọc ' + label}
                      aria-label={'Gỡ lọc ' + label}
                    >
                      <i className="ph ph-x text-[10px] font-bold"></i>
                    </button>
                  </span>
                );
              })}
              {activeTab !== 'all' && filterValues.features && filterValues.features.map((fId) => {
                const feats = FEATURES_BY_CATEGORY[activeTab] || [];
                const label = feats.find((f) => f.id === fId)?.label || fId;
                return (
                  <span
                    key={fId}
                    className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-white border border-neutral-200/90 text-neutral-800 text-[12px] font-medium shadow-2xs hover:border-neutral-300 transition-all"
                  >
                    <span className="text-neutral-400 text-[11px]">✨</span>
                    <span>{label}</span>
                    <button
                      type="button"
                      onClick={() => setFilterValues(p => ({ ...p, features: (p.features || []).filter(item => item !== fId) }))}
                      className="w-4 h-4 rounded-full flex items-center justify-center text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors ml-0.5 cursor-pointer"
                      title={'Gỡ lọc ' + label}
                      aria-label={'Gỡ lọc ' + label}
                    >
                      <i className="ph ph-x text-[10px] font-bold"></i>
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {loading ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 pb-12">
              {Array.from({ length: 6 }).map((_, i) => <PoiCardSkeleton key={i} />)}
            </div>
          ) : isCuratedOverview && curatedSections ? (
            <div className="space-y-10 pb-16">
              {Object.entries(curatedSections).map(([secKey, sec]) => {
                if (sec.items.length === 0) return null;
                return (
                  <section key={secKey} className="space-y-4">
                    <div className="flex items-end justify-between border-b border-zinc-100 pb-2.5">
                      <div>
                        <h3 className="text-[16.5px] font-bold text-neutral-950 tracking-tight font-heading">
                          {sec.title}
                        </h3>
                        <p className="text-[12px] text-neutral-500 font-normal mt-0.5">
                          {sec.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                      {sec.items.map((poi, idx) => (
                        <div key={poi.id} data-poi-id={poi.id}>
                          <PoiCard
                            poi={poi}
                            index={idx}
                            active={poi.id === selectedMapPoiId}
                            favorite={savedIds.has(poi.id)}
                            favoritePending={pendingIds.has(poi.id)}
                            isAdded={addedTrips.has(poi.id)}
                            onClick={() => {
                              handleSelectPoi(poi.id);
                              handleOpenFullDetail(poi.id);
                            }}
                            onHover={handleDebouncedHover}
                            onToggleFavorite={(_id, p) => { if (p) openCollectionPicker(p); }}
                            onToggleAddTrip={toggleAddTrip}
                          />
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const targetTab = sec.categoryKey === 'chua' ? 'di-tich' : (sec.categoryKey as 'quan-an' | 'di-tich' | 'canh-quan');
                        handleTabChange(targetTab);
                        if ('subCategoryKey' in sec && sec.subCategoryKey) {
                          setFilterValues((prev) => ({ ...prev, subCategories: [sec.subCategoryKey!] }));
                        }
                      }}
                      className="w-full py-2.5 px-4 rounded-xl border border-zinc-200/90 hover:border-zinc-400 bg-white hover:bg-zinc-50 text-zinc-900 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer group active:scale-[0.99]"
                    >
                      <span>Xem thêm {sec.title.split('&')[0].trim()} ({sec.total})</span>
                      <i className="ph-bold ph-arrow-right text-[13px] group-hover:translate-x-0.5 transition-transform"></i>
                    </button>
                  </section>
                );
              })}
            </div>
          ) : filteredPois.length === 0 ? (
            error ? (
              <ErrorState message={error} />
            ) : (
              <div className="col-span-2 py-12 px-6 text-center bg-neutral-50/80 rounded-3xl border border-neutral-200/80 my-2">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center mx-auto mb-3">
                  <i className="ph ph-compass text-3xl text-emerald-800"></i>
                </div>
                <h4 className="text-base font-bold text-neutral-900 mb-1">
                  Không tìm thấy địa điểm phù hợp
                </h4>
                <p className="text-xs text-neutral-500 max-w-md mx-auto mb-4">
                  {filterValues.radiusKm
                    ? `Không có địa điểm nào trong bán kính ${filterValues.radiusKm} km. Bạn có muốn nới rộng bán kính để xem thêm gợi ý?`
                    : 'Thử điều chỉnh hoặc xóa bớt tiêu chí lọc để khám phá thêm nhiều địa điểm hấp dẫn.'}
                </p>
                <div className="flex items-center justify-center gap-2">
                  {filterValues.radiusKm && (
                    <button
                      type="button"
                      onClick={() => setFilterValues(prev => ({ ...prev, radiusKm: null }))}
                      className="px-4 py-2 rounded-full bg-black text-white text-xs font-bold hover:bg-neutral-800 transition cursor-pointer"
                    >
                      Mở rộng toàn thành phố
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFilterValues(DEFAULT_FILTER_VALUES)}
                    className="px-4 py-2 rounded-full border border-neutral-300 text-neutral-800 text-xs font-bold hover:bg-neutral-100 transition cursor-pointer"
                  >
                    Xem tất cả địa điểm
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 pb-12">
              {filteredPois.map((poi, idx) => (
                <div key={poi.id} data-poi-id={poi.id}>
                  <PoiCard
                    poi={poi}
                    index={idx}
                    active={poi.id === selectedMapPoiId}
                    favorite={savedIds.has(poi.id)}
                    favoritePending={pendingIds.has(poi.id)}
                    isAdded={addedTrips.has(poi.id)}
                    onClick={() => {
                      handleSelectPoi(poi.id);
                      handleOpenFullDetail(poi.id);
                    }}
                    onHover={handleDebouncedHover}
                    onToggleFavorite={(_id, poi) => { if (poi) openCollectionPicker(poi); }}
                    onToggleAddTrip={toggleAddTrip}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        </div>

        {/* Floating Auto-Hiding Scrollbar (Mindtrip Style) */}
        {thumbHeight > 0 && (
          <div
            className={`absolute top-0 right-1 bottom-0 w-1.5 pointer-events-none z-30 transition-opacity duration-250 ease-out ${
              isHovered || isScrolling || isDragging ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div
              onMouseDown={handleThumbMouseDown}
              className="w-full rounded-full bg-black/25 hover:bg-black/45 active:bg-black/60 cursor-grab active:cursor-grabbing pointer-events-auto shadow-xs"
              style={{
                height: `${thumbHeight}px`,
                transform: `translateY(${thumbTop}px)`,
                transition: isDragging ? 'none' : 'transform 0.05s linear',
              }}
            />
          </div>
        )}
      </main>

      {/* 3. RIGHT SECTION: Map giữ khoảng cách p-6 bo góc 22px. Khi xem chi tiết: Card trượt từ bên phải qua, bo cong 24px mép trái chuẩn Mindtrip, đổ bóng mờ khuếch tán sang trái */}
      <section 
        className={`flex-1 h-full relative bg-white ${fullDetailPoi ? 'overflow-visible z-30' : 'overflow-hidden'}`} 
        data-purpose="right-panel-container"
      >
        {/* Interactive Map: Luôn hiển thị trừ khi người dùng chủ động mở bảng chi tiết sâu */}
        <div className={`w-full h-full p-6 ${fullDetailPoi ? "invisible pointer-events-none" : "visible"}`}>
          <div className="w-full h-full rounded-[22px] overflow-hidden border border-gray-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.06)] relative [transform:translateZ(0)]">
            <PoiMap
              pois={filteredPois}
              selectedPoiId={selectedMapPoiId}
              hoveredPoiId={hoveredPoiId}
              onSelectPoi={handleSelectPoi}
              onHoverPoi={setHoveredPoiId}
              onOpenDetails={handleOpenFullDetail}
              isExpanded={isMapExpanded}
              onToggleExpand={() => {
                setIsMapExpanded((prev) => !prev);
                setTimeout(() => {
                  window.dispatchEvent(new Event("resize"));
                }, 200);
              }}
              favorites={savedIds}
              pendingFavorites={pendingIds}
              onToggleFavorite={(_id, poi) => { if (poi) openCollectionPicker(poi); }}
              addedTrips={addedTrips}
              onToggleAddTrip={toggleAddTrip}
            />
          </div>
        </div>

        {/* Right Detail Section: Card trượt từ bên phải qua khi bấm "Chi tiết ->" */}
        {fullDetailPoi && (
          <div 
            className="absolute inset-y-0 right-0 w-full z-40 bg-white rounded-l-[24px] border-l border-t border-b border-gray-200/90 shadow-[-16px_0_40px_rgba(0,0,0,0.08),-4px_0_12px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden animate-slideInRight"
          >
            <PoiDetailSection
              poi={fullDetailPoi}
              isFavorite={savedIds.has(fullDetailPoi.id)}
              isFavoritePending={pendingIds.has(fullDetailPoi.id)}
              onClose={() => setFullDetailPoiId(null)}
              onToggleFavorite={(_id, poi) => { if (poi) openCollectionPicker(poi); }}
              onViewOnMap={() => setFullDetailPoiId(null)}
            />
          </div>
        )}
      </section>
        </>
      )}

      {/* 4. Explore Filter Modal (Đa Tab chuẩn Quiet Luxury & Mindtrip) */}
      <ExploreFilterModal
        isOpen={isFilterPopoverOpen}
        allPois={allPois}
        onClose={() => setIsFilterPopoverOpen(false)}
        activeTab={activeTab === 'for-you' ? 'all' : activeTab}
        values={filterValues}
        onApply={(newValues) => {
          setFilterValues(newValues);
          setIsFilterPopoverOpen(false);
        }}
        onClearAll={() => setFilterValues(DEFAULT_FILTER_VALUES)}
        matchingCount={filteredPois.length}
      />

      {/* 5. Create Trip Modal */}
      {isCreateTripModalOpen && (
        <CreateTripMindtripModal
          isOpen={isCreateTripModalOpen}
          onClose={() => setIsCreateTripModalOpen(false)}
          onCreateTrip={(newTrip) => {
            const trip: UserTrip = {
              ...newTrip,
              id: newTrip.id || `trip-${Date.now()}`,
              image:
                newTrip.coverImage ||
                newTrip.image ||
                (newTrip.destination === 'Huế'
                  ? 'https://images.unsplash.com/photo-1571508601891-ca5e7a713859?w=800&auto=format&fit=crop&q=80'
                  : 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80'),
              tags: newTrip.tags || [
                newTrip.destination,
                newTrip.startDate || '4 ngày • Tháng 12',
                `${newTrip.peopleCount} du khách`,
                'Ngân sách',
              ],
            };
            setUserTrips((prev) => [trip, ...prev]);
            setActiveOverviewTrip(trip);
            setViewMode('trips');
            setIsCreateTripModalOpen(false);
          }}
          onCreated={(newTrip) => {
            const trip: UserTrip = {
              ...newTrip,
              id: newTrip.id || `trip-${Date.now()}`,
              image:
                newTrip.coverImage ||
                newTrip.image ||
                (newTrip.destination === 'Huế'
                  ? 'https://images.unsplash.com/photo-1571508601891-ca5e7a713859?w=800&auto=format&fit=crop&q=80'
                  : 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80'),
              tags: newTrip.tags || [
                newTrip.destination,
                newTrip.startDate || '4 ngày • Tháng 12',
                `${newTrip.peopleCount} du khách`,
                'Ngân sách',
              ],
            };
            setUserTrips((prev) => [trip, ...prev]);
            setActiveOverviewTrip(trip);
            setViewMode('trips');
            setIsCreateTripModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="col-span-2 flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-16 text-center animate-fadeIn">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <i className="ph ph-magnifying-glass text-xl text-gray-400"></i>
      </div>
      <p className="text-[14px] font-bold text-black">Không tìm thấy địa điểm</p>
      <p className="text-xs text-gray-400 mt-1">Thử tìm kiếm với từ khóa khác hoặc bỏ bộ lọc</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="col-span-2 flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 py-12 text-center animate-fadeIn">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
        <i className="ph ph-warning-circle text-2xl text-red-600"></i>
      </div>
      <p className="text-sm font-medium text-red-700">Không thể tải địa điểm</p>
      <p className="mt-1 text-xs text-red-600">{message}</p>
    </div>
  );
}


function PoiCard({
  poi,
  active = false,
  favorite = false,
  favoritePending = false,
  isAdded = false,
  onClick,
  onHover,
  onToggleFavorite,
  onToggleAddTrip,
}: {
  poi: Poi;
  index?: number;
  active?: boolean;
  favorite?: boolean;
  favoritePending?: boolean;
  isAdded?: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
  onToggleFavorite: (id: string, poi?: Poi) => void;
  onToggleAddTrip?: (id: string) => void;
}) {
  const [imgIdx, setImgIdx] = useState(0);
  const [isCardHovered, setIsCardHovered] = useState(false);

  const gallery = useMemo(() => getGalleryImages(poi), [poi]);

  return (
    <article
      onClick={onClick}
      onMouseEnter={() => {
        setIsCardHovered(true);
        onHover(poi.id);
      }}
      onMouseLeave={() => {
        setIsCardHovered(false);
        onHover(null);
      }}
      className="flex flex-col group cursor-pointer"
    >
      {/* 1. Card Image Box: aspect-[1.05/1], rounded-[20px], isolate để các nút con không bao giờ thoát ra ngoài đè lên header */}
      <div className={`relative w-full aspect-[1.05/1] rounded-[20px] overflow-hidden bg-gray-100 shadow-sm transition-all duration-200 isolate ${active ? 'ring-2 ring-black' : ''}`}>
        <img
          src={gallery[imgIdx] || poi.image}
          alt={poi.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Nút tròn chuyển ảnh ‹ (chỉ hiện khi hover và từ ảnh thứ 2 trở đi) */}
        {isCardHovered && imgIdx > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((prev) => Math.max(0, prev - 1));
            }}
            className="absolute left-3.5 top-[45%] -translate-y-1/2 w-8 h-8 rounded-full bg-black/45 hover:bg-black/75 backdrop-blur-md text-white shadow-sm flex items-center justify-center hover:scale-110 active:scale-90 transition-all z-10 cursor-pointer"
            title="Ảnh trước"
          >
            <i className="ph ph-caret-left text-lg font-bold"></i>
          </button>
        )}

        {/* Nút tròn chuyển ảnh › (chỉ hiện khi hover và chưa đến ảnh cuối) */}
        {isCardHovered && imgIdx < gallery.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((prev) => Math.min(gallery.length - 1, prev + 1));
            }}
            className="absolute right-3.5 top-[45%] -translate-y-1/2 w-8 h-8 rounded-full bg-black/45 hover:bg-black/75 backdrop-blur-md text-white shadow-sm flex items-center justify-center hover:scale-110 active:scale-90 transition-all z-10 cursor-pointer"
            title="Ảnh kế tiếp"
          >
            <i className="ph ph-caret-right text-lg font-bold"></i>
          </button>
        )}

        {/* Gradient bóng râm bảo vệ tương phản cho nút bấm */}
        <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/35 via-black/10 to-transparent pointer-events-none z-[5]" />

        {/* Huy hiệu Điểm Xanh (EcoScore) chuẩn Quiet Luxury 3 Tầng */}
        {poi.isGreen && (
          <div 
            className="absolute top-3 left-3 z-10 pointer-events-auto cursor-help"
            title="Địa điểm du lịch xanh: Thân thiện môi trường, tiết kiệm năng lượng và bảo tồn văn hóa địa phương"
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 backdrop-blur-md text-emerald-200 border border-emerald-400/40 text-[11px] font-bold tracking-tight shadow-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              <Leaf size={11} className="text-emerald-400 shrink-0" />
              <span>Địa điểm xanh</span>
            </span>
          </div>
        )}

        {/* Nút tim và "+" với Morphicons spring physics */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
          <button
            type="button"
            aria-label={favorite ? `Bỏ lưu ${poi.name}` : `Lưu ${poi.name}`}
            aria-pressed={favorite}
            aria-busy={favoritePending}
            disabled={favoritePending}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(poi.id, poi);
            }}
            className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-wait disabled:opacity-70 ${
              favorite ? 'bg-white text-rose-600' : 'bg-black/35 hover:bg-black/55 text-white'
            }`}
            title="Lưu yêu thích"
          >
            <i className={`ph ${favorite ? 'ph-fill ph-heart text-rose-600' : 'ph-heart'} text-lg`} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleAddTrip?.(poi.id);
            }}
            className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 text-white ${
              isAdded ? 'bg-emerald-600' : 'bg-black/35 hover:bg-black/55'
            }`}
            title={isAdded ? 'Đã thêm vào chuyến đi' : 'Thêm vào chuyến đi'}
          >
            <i className={`ph ${isAdded ? 'ph-check font-bold' : 'ph-plus font-bold'} text-base`} />
          </button>
        </div>

        {/* Chấm phân trang bên dưới đổi theo ảnh đang xem */}
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none z-10">
          {gallery.slice(0, 5).map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === imgIdx ? 'bg-white scale-125 shadow-xs' : 'bg-white/40'
              }`}
            />
          ))}
        </div>


      </div>

      {/* 2. Card Details: Tên, Rating, loại hình, địa chỉ chuẩn Quiet Luxury */}
      <div className="mt-2.5 space-y-1">
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <h3 className="font-bold text-[15px] text-gray-950 tracking-tight truncate leading-tight group-hover:text-emerald-800 transition-colors">
            {poi.name}
          </h3>
          {Number(poi.rating) > 0 && (
            <span className="flex items-center gap-1 text-[13px] font-bold text-gray-900 shrink-0">
              <i className="ph ph-fill ph-star text-[12px] text-amber-500"></i>
              <span>{(typeof poi.rating === 'number' ? poi.rating : Number(poi.rating || 4.5)).toFixed(1)}</span>
            </span>
          )}
        </div>

        {(() => {
          const isCafe = Boolean(
            poi.sub_category?.includes('cafe') || 
            poi.sub_category?.includes('coffee') || 
            /coffee|cafe|cà phê|tiệm trà|workspace/i.test(poi.name)
          );
          const resolvedCategoryLabel = poi.sub_category && SUB_CATEGORY_LABELS[poi.sub_category]
            ? SUB_CATEGORY_LABELS[poi.sub_category]
            : isCafe
              ? 'Quán cà phê'
              : CATEGORY_META[poi.category]?.label || 'Điểm tham quan';
          const resolvedCategoryIcon = isCafe
            ? 'ph-coffee'
            : (CATEGORY_META[poi.category]?.icon || 'ph-map-pin');

          return (
            <div className="flex items-center gap-1.5 text-[13px] text-gray-500 font-normal">
              <i className={`ph ${resolvedCategoryIcon} text-gray-400 text-[14px] shrink-0`}></i>
              <span className="truncate">{resolvedCategoryLabel}</span>
            </div>
          );
        })()}

        <div className="text-[12.5px] text-gray-400 font-normal truncate">
          <span>{poi.address || `${poi.city === 'Đà Nẵng' ? 'Hải Châu, Đà Nẵng' : `${poi.city}, Việt Nam`}`}</span>
        </div>
      </div>
    </article>
  );
}
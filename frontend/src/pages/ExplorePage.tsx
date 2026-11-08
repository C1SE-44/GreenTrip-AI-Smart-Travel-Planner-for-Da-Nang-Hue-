import { Leaf } from 'lucide-react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TripOverviewView from '@/components/planner/TripOverviewView';
import CreateTripMindtripModal from '@/components/planner/CreateTripMindtripModal';
import type { PoiCategory, PoiCity, Poi } from '@/data/pois';
import { pois, categoryLabels, normalizePois, getGalleryImages, SUB_CATEGORY_LABELS, type PaginatedPoisResponse } from '@/data/pois';
import PoiMap from '@/components/poi/PoiMap';
import PoiDetailSection from '@/components/poi/PoiDetailSection';
import { PoiCardSkeleton } from '@/components/ui/Skeleton';
import Logo from '@/components/ui/Logo';
import { fetchJson } from '@/lib/api';
import { getMe, type UserProfile } from '@/services/auth';
import { getPois } from '@/services/poi';
import ExploreFilterModal, {
  type ExploreFilterValues,
  type PoiCategoryFilter,
  type TimeOfDay,
  DEFAULT_FILTER_VALUES,
  VIBES_BY_CATEGORY,
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
  ideas?: string[];
}


const TABS: { id: 'all' | 'quan-an' | 'di-tich' | 'canh-quan'; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'quan-an', label: 'Ẩm thực & Cafe' },
  { id: 'di-tich', label: 'Di tích & Văn hóa' },
  { id: 'canh-quan', label: 'Cảnh quan & Thiên nhiên' },
];

const SUB_CHIPS_CONFIG: Record<string, { id: string; label: string }[]> = {
  'di-tich': [
    { id: 'all', label: 'Tất cả di tích' },
    { id: 'chua', label: 'Chùa & Tâm linh' },
    { id: 'dai-noi', label: 'Đại Nội & Hoàng cung' },
    { id: 'lang-tam', label: 'Lăng tẩm Hoàng gia' },
    { id: 'bao-tang', label: 'Bảo tàng & Di sản' },
    { id: 'cau', label: 'Cầu biểu tượng' },
    { id: 'lang-nghe', label: 'Làng nghề truyền thống' },
  ],
  'quan-an': [
    { id: 'all', label: 'Tất cả ẩm thực' },
    { id: 'dac-san', label: 'Mì & Bún đặc sản' },
    { id: 'hai-san', label: 'Hải sản tươi sống' },
    { id: 'chay', label: 'Quán chay & Thực dưỡng' },
    { id: 'mon-cuon', label: 'Bánh bèo, Nậm, Lọc' },
    { id: 'cafe-view', label: 'Cafe view đẹp & Sống ảo' },
    { id: 'cafe-work', label: 'Cafe làm việc 24/7' },
    { id: 'che', label: 'Chè & Ăn vặt' },
  ],
  'canh-quan': [
    { id: 'all', label: 'Tất cả cảnh quan' },
    { id: 'bien', label: 'Bãi biển & Vịnh' },
    { id: 'deo-ban-dao', label: 'Đèo Hải Vân & Sơn Trà' },
    { id: 'song-dam-pha', label: 'Sông Hương & Đầm phá' },
    { id: 'doi-thong', label: 'Đồi thông & Công viên' },
    { id: 'thac-suoi', label: 'Thác nước & Suối khoáng' },
  ],
};

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

export default function ExplorePage({ initialView = 'explore' }: { initialView?: 'explore' | 'trips' | 'saved' }) {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'explore' | 'trips' | 'saved'>(initialView);
  const [activeOverviewTrip, setActiveOverviewTrip] = useState<UserTrip | null>(null);
  const [isCreateTripModalOpen, setIsCreateTripModalOpen] = useState(false);
  const [tripsSubTab, setTripsSubTab] = useState<'trips' | 'calendar'>('trips');
  const [selectedTripForDetails, setSelectedTripForDetails] = useState<UserTrip | null>(null);

  useEffect(() => {
    setViewMode(initialView);
  }, [initialView]);

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
  const [activeTab, setActiveTab] = useState<'all' | 'quan-an' | 'di-tich' | 'canh-quan'>('all');
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [hoveredPoiId, setHoveredPoiId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('greentrip_favorites');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
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
      localStorage.setItem('greentrip_favorites', JSON.stringify(Array.from(favorites)));
    } catch (e) {
      console.error(e);
    }
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem('greentrip_added_trips', JSON.stringify(Array.from(addedTrips)));
    } catch (e) {
      console.error(e);
    }
  }, [addedTrips]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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

        const queryParams = {
          limit: 100,
          city: cityFilter !== 'all' ? cityFilter : undefined,
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          eco_priority: filterValues.ecoPriority,
          budget_tier: filterValues.budget,
          eco_certified_only: filterValues.ecoCertifiedOnly,
          green_transit_only: filterValues.greenTransitOnly,
        };

        // 1. Tải trang 1 tức thì để hiển thị ngay trong 100ms
        const firstPage = await getPois({
          ...queryParams,
          page: 1,
        });

        if (!active) return;

        const firstItems = firstPage.items || [];
        const initialNormalized = normalizePois(firstItems);
        if (initialNormalized.length > 0) {
          setAllPois(initialNormalized);
        } else {
          setAllPois(pois);
        }
        setLoading(false);

        // 2. Tải song song các trang còn lại nếu có >100 địa điểm (482 POIs = 5 trang)
        const totalPages = firstPage.pagination?.total_pages || 1;
        if (totalPages > 1) {
          try {
            const remainingPromises = [];
            for (let p = 2; p <= totalPages; p++) {
              remainingPromises.push(
                getPois({
                  ...queryParams,
                  page: p,
                })
              );
            }
            const remainingResponses = await Promise.all(remainingPromises);
            if (!active) return;

            const allItems = [...firstItems];
            for (const res of remainingResponses) {
              if (res.items && res.items.length > 0) {
                allItems.push(...res.items);
              }
            }
            const fullNormalized = normalizePois(allItems);
            if (fullNormalized.length > 0) {
              setAllPois(fullNormalized);
            }
          } catch (secondaryError) {
            console.warn('Could not fetch remaining POI pages, keeping page 1 items:', secondaryError);
          }
        }
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

  const handleTabChange = (tabId: 'all' | 'quan-an' | 'di-tich' | 'canh-quan') => {
    setActiveTab(tabId);
    setCategoryFilter(tabId);
    if (tabId === 'all') {
      setFilterValues((prev) => ({ ...prev, vibes: [], subCategories: [] }));
    }
  };

  const filteredPois = useMemo(() => {
    const matched = allPois.filter((poi) => {
      if (viewMode === 'saved' && !favorites.has(poi.id)) {
        return false;
      }
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
      if (filterValues.budget === '$') {
        matchBudget = poi.budget_tier === '$' || poi.budget_tier === 'free' || (poi.estimatedCost ?? 0) <= 100000;
      } else if (filterValues.budget === '$$') {
        matchBudget = poi.budget_tier === '$$' || ((poi.estimatedCost ?? 0) > 100000 && (poi.estimatedCost ?? 0) <= 400000);
      } else if (filterValues.budget === '$$$') {
        matchBudget = poi.budget_tier === '$$$' || ((poi.estimatedCost ?? 0) > 400000 && (poi.estimatedCost ?? 0) <= 1000000);
      } else if (filterValues.budget === '$$$$') {
        matchBudget = poi.budget_tier === '$$$$' || (poi.estimatedCost ?? 0) > 1000000;
      }

      // Rating filter
      if (filterValues.minRating !== null && (poi.rating === null || poi.rating < filterValues.minRating)) {
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

      // Sub-categories filter
      if (categoryFilter !== 'all' && filterValues.subCategories.length > 0) {
        const matchSub = filterValues.subCategories.some((sc) => {
          const scLower = sc.toLowerCase();
          const pSub = (poi.sub_category || '').toLowerCase();
          const pName = poi.name.toLowerCase();
          if (scLower === 'chua') {
            return (
              poi.category === 'chua' ||
              pSub.includes('temple') ||
              pSub.includes('monaster') ||
              pName.includes('chùa') ||
              pName.includes('thiền viện')
            );
          }
          return pSub === scLower || (poi.cuisine && poi.cuisine.toLowerCase() === scLower) || pName.includes(scLower);
        });
        if (!matchSub) return false;
      }

      // Vibes filter (Khớp theo keywords ngữ nghĩa trong database)
      if (categoryFilter !== 'all' && filterValues.vibes.length > 0) {
        const pVibes = (poi.vibes || []).map((v) => v.toLowerCase());
        const allVibesList = Object.values(VIBES_BY_CATEGORY).flat();
        const matchVibe = filterValues.vibes.some((vId) => {
          const item = allVibesList.find((v) => v.id === vId);
          const keywords = (item?.keywords || [vId]).map((k) => k.toLowerCase());
          return keywords.some((kw) => pVibes.some((pv) => pv.includes(kw) || kw.includes(pv)));
        });
        if (!matchVibe) return false;
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
  }, [allPois, search, cityFilter, categoryFilter, filterValues, viewMode, favorites]);

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
    if (filterValues.rainyDayFriendly) count++;
    if (filterValues.freeTicketOnly) count++;
    if (filterValues.greenWeight !== 50 || filterValues.budgetWeight !== 50) count++;
    return count;
  }, [filterValues]);


  const handleSelectPoi = (id: string | null) => {
    setSelectedPoiId((prev) => (prev === id ? null : id));
  };

  const selectedPoi = useMemo(() => {
    if (!selectedPoiId) return null;
    return allPois.find((poi) => poi.id === selectedPoiId) || null;
  }, [allPois, selectedPoiId]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentCityLabel = cityFilter === 'all' ? 'Tất cả địa điểm' : cityFilter;

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
                key: 'explore', 
                onClick: () => { setViewMode('explore'); navigate('/explore'); }, 
                icon: viewMode === 'explore' ? 'ph-fill ph-compass' : 'ph ph-compass', 
                label: 'Khám phá', 
                active: viewMode === 'explore' 
              },
              { 
                key: 'saved', 
                onClick: () => setViewMode('saved'), 
                icon: viewMode === 'saved' ? 'ph-fill ph-heart text-[#b45309]' : 'ph ph-heart', 
                label: 'Đã lưu', 
                active: viewMode === 'saved',
                badge: favorites.size > 0 ? String(favorites.size) : undefined
              },
              { 
                key: 'trips', 
                onClick: () => { 
                  setViewMode('trips'); 
                  setActiveOverviewTrip(null);
                  navigate('/planner'); 
                }, 
                icon: viewMode === 'trips' ? 'ph-fill ph-calendar-plus' : 'ph ph-calendar-plus', 
                label: 'Lịch trình', 
                active: viewMode === 'trips',
                badge: userTrips.length > 0 ? String(userTrips.length) : undefined
              },
              { 
                key: 'create',
                onClick: () => setIsCreateTripModalOpen(true),
                icon: 'ph ph-plus-square', 
                label: 'Tạo chuyến đi' 
              },
            ].map((item) => {
              const itemContent = (
                <div className={`flex items-center py-0.5 text-black transition-colors group/item relative ${item.active ? 'font-semibold' : ''}`}>
                  {/* Khung icon cố định 36x36px ở tọa độ không đổi */}
                  <div className="w-9 h-9 flex items-center justify-center shrink-0 relative">
                    <i className={`${item.icon} text-[23px] text-black ${item.active ? '' : 'group-hover/item:opacity-75'} transition-opacity`}></i>
                    {item.badge && (
                      <span className="absolute -top-1 -right-1 bg-[#b45309] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
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

      {viewMode === 'trips' ? (
        activeOverviewTrip ? (
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
              /* Calendar SubTab View */
              <div className="py-24 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 text-2xl mb-4">
                  <i className="ph ph-calendar"></i>
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-1">Xem theo lịch trình</h3>
                <p className="text-xs text-gray-500 max-w-sm mb-5 leading-relaxed">
                  Các mốc thời gian, ngày di chuyển và địa điểm tham quan sẽ được biểu diễn theo dòng thời gian trực quan.
                </p>
                <button
                  onClick={() => setTripsSubTab('trips')}
                  className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-full text-xs font-semibold transition cursor-pointer"
                >
                  Quay lại danh sách chuyến đi
                </button>
              </div>
            )}
          </div>
        </main>
        )
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
                  <span>Tất cả địa điểm</span>
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
                  className={`whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'px-3.5 py-1.5 bg-black text-white rounded-full font-bold shadow-xs text-[13px]'
                      : 'px-3 py-1.5 text-gray-700 hover:text-black hover:bg-gray-100/60 rounded-full font-medium text-[13.5px]'
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
          {/* Section Subheading & Active Filter Badges */}
          <div className="mb-3 mt-4 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-gray-950 tracking-tight">
              Địa điểm ({filteredPois.length})
            </h2>
            {(filterValues.minRating !== null || filterValues.radiusKm !== null || filterValues.ecoCertifiedOnly || filterValues.budget !== 'all' || filterValues.subCategories.length > 0 || filterValues.vibes.length > 0) && (
              <button
                type="button"
                onClick={() => setFilterValues(DEFAULT_FILTER_VALUES)}
                className="text-xs font-semibold text-rose-600 hover:text-rose-800 underline cursor-pointer"
              >
                Xóa tất cả bộ lọc
              </button>
            )}
          </div>

          {/* Active Filter Chips Bar */}
          {(filterValues.minRating !== null || filterValues.radiusKm !== null || filterValues.ecoCertifiedOnly || filterValues.budget !== 'all' || filterValues.subCategories.length > 0 || filterValues.vibes.length > 0 || filterValues.timeOfDay.length > 0) && (
            <div className="flex items-center gap-1.5 flex-wrap mb-4 py-1.5 px-3 bg-neutral-50 rounded-xl border border-neutral-200/60">
              <span className="text-[11px] font-bold text-neutral-500 uppercase">Đang lọc:</span>
              {filterValues.minRating !== null && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-neutral-200 text-neutral-800 text-[11px] font-semibold">
                  <span>★ {filterValues.minRating}+</span>
                  <button type="button" onClick={() => setFilterValues(p => ({ ...p, minRating: null }))} className="hover:text-black font-bold">×</button>
                </span>
              )}
              {filterValues.budget !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-neutral-200 text-neutral-800 text-[11px] font-semibold">
                  <span>Giá: {filterValues.budget}</span>
                  <button type="button" onClick={() => setFilterValues(p => ({ ...p, budget: 'all' }))} className="hover:text-black font-bold">×</button>
                </span>
              )}
              {filterValues.radiusKm !== null && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-neutral-200 text-neutral-800 text-[11px] font-semibold">
                  <span>Trong {filterValues.radiusKm} km</span>
                  <button type="button" onClick={() => setFilterValues(p => ({ ...p, radiusKm: null }))} className="hover:text-black font-bold">×</button>
                </span>
              )}
              {filterValues.ecoCertifiedOnly && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                  <span>🍃 Chuẩn Xanh</span>
                  <button type="button" onClick={() => setFilterValues(p => ({ ...p, ecoCertifiedOnly: false }))} className="hover:text-emerald-950 font-bold">×</button>
                </span>
              )}
              {filterValues.timeOfDay.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-neutral-200 text-neutral-800 text-[11px] font-semibold">
                  <span>{filterValues.timeOfDay.includes('evening') ? 'Buổi tối' : 'Ban ngày'}</span>
                  <button type="button" onClick={() => setFilterValues(p => ({ ...p, timeOfDay: [] }))} className="hover:text-black font-bold">×</button>
                </span>
              )}
              {activeTab !== 'all' && filterValues.vibes.map((v) => {
                const allVibes = Object.values(VIBES_BY_CATEGORY).flat();
                const label = allVibes.find((item) => item.id === v)?.label || v;
                return (
                  <span key={v} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-neutral-200 text-neutral-800 text-[11px] font-semibold">
                    <span>Vibe: {label}</span>
                    <button type="button" onClick={() => setFilterValues(p => ({ ...p, vibes: p.vibes.filter(item => item !== v) }))} className="hover:text-black font-bold">×</button>
                  </span>
                );
              })}
              {activeTab !== 'all' && filterValues.subCategories.map((sc) => (
                <span key={sc} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-neutral-200 text-neutral-800 text-[11px] font-semibold">
                  <span>{SUB_CATEGORY_LABELS[sc] || (sc === 'chua' ? 'Chùa & Điểm tâm linh' : sc)}</span>
                  <button type="button" onClick={() => setFilterValues(p => ({ ...p, subCategories: p.subCategories.filter(item => item !== sc) }))} className="hover:text-black font-bold">×</button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setFilterValues(DEFAULT_FILTER_VALUES)}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 underline ml-auto cursor-pointer"
              >
                Xóa tất cả
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 pb-12">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <PoiCardSkeleton key={i} />)
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
              filteredPois.map((poi, idx) => (
                <div key={poi.id} data-poi-id={poi.id}>
                  <PoiCard
                    poi={poi}
                    index={idx}
                    active={poi.id === selectedPoiId}
                    favorite={favorites.has(poi.id)}
                    isAdded={addedTrips.has(poi.id)}
                    onClick={() => handleSelectPoi(poi.id)}
                    onHover={setHoveredPoiId}
                    onToggleFavorite={toggleFavorite}
                    onToggleAddTrip={toggleAddTrip}
                  />
                </div>
              ))
            )}
          </div>
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
        className={`flex-1 h-full relative bg-white ${selectedPoi ? 'overflow-visible z-30' : 'overflow-hidden'}`} 
        data-purpose="right-panel-container"
      >
        {/* Interactive Map (giữ nguyên khoảng cách p-6 và card bo góc 22px như cũ, ẩn khi mở chi tiết để ko lộ màu) */}
        <div className={`w-full h-full p-6 ${selectedPoi ? "invisible pointer-events-none" : "visible"}`}>
          <div className="w-full h-full rounded-[22px] overflow-hidden border border-gray-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.06)] relative [transform:translateZ(0)]">
            <PoiMap
              pois={filteredPois}
              selectedPoiId={selectedPoiId}
              hoveredPoiId={hoveredPoiId}
              onSelectPoi={handleSelectPoi}
              onHoverPoi={setHoveredPoiId}
              isExpanded={isMapExpanded}
              onToggleExpand={() => {
                setIsMapExpanded((prev) => !prev);
                setTimeout(() => {
                  window.dispatchEvent(new Event("resize"));
                }, 200);
              }}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              addedTrips={addedTrips}
              onToggleAddTrip={toggleAddTrip}
            />
          </div>
        </div>

        {/* Right Detail Section: Card trượt từ bên phải qua, bo cong 24px ở mép trái chuẩn Mindtrip, bóng mờ khuếch tán sang trái */}
        {selectedPoi && (
          <div 
            className="absolute inset-y-0 right-0 w-full z-40 bg-white rounded-l-[24px] border-l border-t border-b border-gray-200/90 shadow-[-16px_0_40px_rgba(0,0,0,0.08),-4px_0_12px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden animate-slideInRight"
          >
            <PoiDetailSection
              poi={selectedPoi}
              isFavorite={favorites.has(selectedPoi.id)}
              onClose={() => setSelectedPoiId(null)}
              onToggleFavorite={toggleFavorite}
              onViewOnMap={() => setSelectedPoiId(null)}
            />
          </div>
        )}
      </section>
        </>
      )}

      {/* 4. Explore Filter Modal (Đa Tab chuẩn Quiet Luxury & Mindtrip) */}
      <ExploreFilterModal
        isOpen={isFilterPopoverOpen}
        onClose={() => setIsFilterPopoverOpen(false)}
        activeTab={activeTab}
        values={filterValues}
        onApply={(newValues) => {
          setFilterValues(newValues);
          setIsFilterPopoverOpen(false);
        }}
        onClearAll={() => setFilterValues(DEFAULT_FILTER_VALUES)}
        matchingCount={filteredPois.length}
        allPois={allPois}
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
  isAdded?: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
  onToggleFavorite: (id: string) => void;
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
            className="absolute left-3.5 top-[45%] -translate-y-1/2 w-10 h-10 rounded-full bg-white text-zinc-900 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-10 cursor-pointer"
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
            className="absolute right-3.5 top-[45%] -translate-y-1/2 w-10 h-10 rounded-full bg-white text-zinc-900 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-10 cursor-pointer"
            title="Ảnh kế tiếp"
          >
            <i className="ph ph-caret-right text-lg font-bold"></i>
          </button>
        )}

        {/* Nút tim và "+" ở góc trên (giữ nguyên khi hover, chuyển trạng thái khi đã lưu / thêm) */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(poi.id);
            }}
            className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 ${
              favorite ? 'bg-white text-[#b45309]' : 'bg-black/35 hover:bg-black/55 text-white'
            }`}
            title="Lưu yêu thích"
          >
            <i className={`ph ${favorite ? 'ph-fill ph-heart text-[18px] text-[#b45309]' : 'ph-heart text-[18px]'}`}></i>
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onToggleAddTrip?.(poi.id);
            }}
            className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 ${
              isAdded ? 'bg-emerald-600 text-white' : 'bg-black/35 hover:bg-black/55 text-white'
            }`}
            title="Thêm vào chuyến đi"
          >
            <i className={`ph ${isAdded ? 'ph-check text-[18px] font-bold' : 'ph-plus text-[18px]'}`}></i>
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

      {/* 2. Card Details: Tên, loại hình, địa chỉ */}
      <div className="mt-2.5 space-y-1">
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <h3 className="font-bold text-[15px] text-gray-950 tracking-tight truncate leading-tight group-hover:text-black">
            {poi.name}
          </h3>
        </div>

        <div className="flex items-center gap-1.5 text-[13px] text-gray-500 font-normal">
          <i className={`ph ${CATEGORY_META[poi.category]?.icon || 'ph-map-pin'} text-gray-400 text-[14px] shrink-0`}></i>
          <span className="truncate">{CATEGORY_META[poi.category]?.label || 'Điểm tham quan'}</span>
        </div>

        <div className="text-[12.5px] text-gray-400 font-normal truncate">
          <span>{poi.address || `${poi.city === 'Đà Nẵng' ? 'Hải Châu, Đà Nẵng' : `${poi.city}, Việt Nam`}`}</span>
        </div>
      </div>
    </article>
  );
}

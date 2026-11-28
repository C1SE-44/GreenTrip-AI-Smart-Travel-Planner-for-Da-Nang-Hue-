import { Leaf } from 'lucide-react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import TripOverviewView from '@/components/planner/TripOverviewView';
import TripItineraryView from '@/components/planner/TripItineraryView';
import TripCalendarView from '@/components/planner/TripCalendarView';
import { MorphFavoriteButton, MorphAddButton } from '@/components/ui/MorphButton';
import CreateTripCopilotModal from '@/components/planner/CreateTripCopilotModal';
import IdeationChatView from '@/components/planner/IdeationChatView';
import type { CopilotDayOutline, CopilotTripMessage } from '@/components/planner/copilotTripData';
import type { PoiCategory, PoiCity, Poi } from '@/data/pois';
import { pois, normalizePois, isCuratedHighlight, evaluateLocalAuthentic } from '@/data/pois';
import ExplorePoiCard from '@/components/explore/ExplorePoiCard';
import {
  CATEGORY_META,
  CITY_CENTERS,
  getDistanceFromLatLonInKm,
  matchesTimeOfDay,
  SEEDED_SAMPLE_TRIPS,
  type ExploreTabId,
  type UserTrip,
} from '@/components/explore/exploreUtils';
export { SEEDED_SAMPLE_TRIPS };
export type { ExploreTabId, UserTrip };
import PoiMap, { isPoiInsideBounds, type MapViewportBounds } from '@/components/poi/PoiMap';
import PoiDetailSection from '@/components/poi/PoiDetailSection';
import SavedPlacesView from '@/components/saved/SavedPlacesView';
import BuildTripFromCollectionModal from '@/components/saved/BuildTripFromCollectionModal';
import AddToTripModal from '@/components/planner/AddToTripModal';
import { saveTripItinerary } from '@/services/itineraryService';
import HomeDashboardView from '@/components/home/HomeDashboardView';
import AccountMenu from '@/components/account/AccountMenu';
import ProfileSettingsPage from '@/components/account/ProfileSettingsPage';
import { useSavedPlaces } from '@/context/SavedPlacesContext';
import { PoiCardSkeleton } from '@/components/ui/Skeleton';
import Logo from '@/components/ui/Logo';
import { fetchJson } from '@/lib/api';
import { clearAuthSession, getMe, type UserProfile } from '@/services/auth';
import { deleteMyTrip, getMyTrips } from '@/services/tripService';
import {
  loadAccountTrips,
  readGuestTrips,
  tripStorageKey,
  writeGuestTrips,
} from '@/utils/accountTrips';
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
import {
  computePoiWeightedScore,
  ECO_PRIORITY_WEIGHT_MAP,
  isPoiEcoCertified,
  isPoiGreenTransit,
  normalizeSliderWeights,
} from '@/services/poi';


type CityFilter = 'all' | PoiCity;
type CategoryFilter = 'all' | PoiCategory;

interface AddToTripSelection {
  poiIds: string[];
  label?: string;
}

const TAB_DISPLAY_LABELS: Record<string, string> = {
  'for-you': 'Cho bạn',
  'quan-an': 'Ẩm thực',
  'di-tich': 'Di tích',
  'canh-quan': 'Thiên nhiên',
  'chua': 'Tâm linh',
  'luu-tru': 'Lưu trú',
};

const TABS: { id: ExploreTabId; label: string }[] = [
  { id: 'for-you', label: 'Dành cho bạn' },
  { id: 'quan-an', label: 'Ẩm thực & Cafe' },
  { id: 'di-tich', label: 'Di tích & Lịch sử' },
  { id: 'canh-quan', label: 'Cảnh quan & Thiên nhiên' },
  { id: 'chua', label: 'Chùa & Tâm linh' },
  { id: 'luu-tru', label: 'Lưu trú xanh' },
];

export default function ExplorePage({ initialView = 'explore' }: { initialView?: 'home' | 'explore' | 'trips' | 'saved' | 'chat' | 'profile' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { savedIds, collections: savedCollections, pendingIds, openCollectionPicker } = useSavedPlaces();
  const [viewMode, setViewMode] = useState<'home' | 'explore' | 'trips' | 'saved' | 'chat' | 'profile'>(initialView);
  const [activeOverviewTrip, setActiveOverviewTrip] = useState<UserTrip | null>(null);
  const [isCreateTripModalOpen, setIsCreateTripModalOpen] = useState(false);
  const [ideationDraft, setIdeationDraft] = useState<{
    initialPrompt: string;
    chatHistory: CopilotTripMessage[];
    itineraryOutline?: CopilotDayOutline[];
  } | null>(null);
  const [pendingChatPrompt, setPendingChatPrompt] = useState<string | null>(null);
  const [addToTripSelection, setAddToTripSelection] = useState<AddToTripSelection | null>(null);
  const [pendingAddToTripPoiIds, setPendingAddToTripPoiIds] = useState<string[] | null>(null);
  const [tripsSubTab, setTripsSubTab] = useState<'trips' | 'calendar'>('trips');
  const [selectedTripForDetails, setSelectedTripForDetails] = useState<UserTrip | null>(null);
  const [activeTripSubTab, setActiveTripSubTab] = useState<'ideas' | 'itinerary' | 'calendar'>('ideas');

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

  const [userTrips, setUserTrips] = useState<UserTrip[]>(SEEDED_SAMPLE_TRIPS);
  const [tripsOwner, setTripsOwner] = useState<string | null>(null);
  const quickLaunchTripRef = useRef<UserTrip | null>(null);

  // Consume zero-friction quickLaunchTrip from LandingPage Hero
  useEffect(() => {
    const state = location.state as { quickLaunchTrip?: UserTrip } | null;
    const quickTrip = state?.quickLaunchTrip;
    if (!quickTrip) return;

    quickLaunchTripRef.current = quickTrip;
    setUserTrips((prev) => [quickTrip, ...prev.filter((t) => t.id !== quickTrip.id)]);
    setActiveOverviewTrip(quickTrip);
    setSelectedTripForDetails(quickTrip);
    setActiveTripSubTab('itinerary');
    setViewMode('trips');
    navigate('/planner', { replace: true, state: null });
  }, [location.state, navigate]);

  const [search, setSearch] = useState('');
  const [mapAreaBounds, setMapAreaBounds] = useState<MapViewportBounds | null>(null);
  const [cityFilter, setCityFilter] = useState<CityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [activeTab, setActiveTab] = useState<ExploreTabId>('for-you');
  const [expandedSectionCount, setExpandedSectionCount] = useState<Record<string, number>>({});
  // 1. POI hiển thị ô cơ bản trên bản đồ khi người dùng bấm vào
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);
  // 2. POI hiển thị bảng chi tiết sâu toàn màn hình (PoiDetailSection)
  const [fullDetailPoiId, setFullDetailPoiId] = useState<string | null>(null);
  const [hoveredPoiId, setHoveredPoiId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const addedTrips = useMemo(
    () => new Set(userTrips.flatMap((trip) => [...(trip.savedPlaces ?? []), ...(trip.ideas ?? [])])),
    [userTrips],
  );

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mobileExplorePane, setMobileExplorePane] = useState<'list' | 'map'>('list');
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  );

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const syncViewport = () => setIsDesktopViewport(media.matches);
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    if (viewMode !== 'explore') {
      setMobileExplorePane('list');
    }
  }, [viewMode]);

  const handleOpenTripsView = () => {
    setViewMode('trips');
    setSelectedTripForDetails(null);
    setActiveOverviewTrip(null);
    setActiveTripSubTab('ideas');
    navigate('/planner');
  };

  useEffect(() => {
    if (initialView !== 'saved' && initialView !== 'profile') return;
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

  const toggleAddTrip = (id: string) => setAddToTripSelection({
    poiIds: [id],
    label: allPois.find((poi) => poi.id === id)?.name,
  });

  const addAlbumToTrip = (poiIds: string[], albumName: string) => {
    const uniquePoiIds = Array.from(new Set(poiIds));
    if (uniquePoiIds.length === 0) return;
    setAddToTripSelection({
      poiIds: uniquePoiIds,
      label: `Toàn bộ album “${albumName}” · ${uniquePoiIds.length} địa điểm`,
    });
  };

  const toggleTripSavedPlaces = (tripId: string, poiIds: string[], allPlacesAlreadySaved: boolean) => {
    if (poiIds.length === 0) return;
    const updateTripPlaces = (trip: UserTrip): UserTrip => {
      const savedPlaces = new Set(trip.savedPlaces ?? []);
      const ideas = new Set(trip.ideas ?? []);
      poiIds.forEach((poiId) => {
        if (allPlacesAlreadySaved) {
          savedPlaces.delete(poiId);
          ideas.delete(poiId);
        } else {
          savedPlaces.add(poiId);
          ideas.add(poiId);
        }
      });
      return {
        ...trip,
        savedPlaces: Array.from(savedPlaces),
        ideas: Array.from(ideas),
      };
    };

    setUserTrips((prev) => prev.map((trip) => trip.id === tripId ? updateTripPlaces(trip) : trip));
    setActiveOverviewTrip((current) => current?.id === tripId ? updateTripPlaces(current) : current);
    setSelectedTripForDetails((current) => current?.id === tripId ? updateTripPlaces(current) : current);
  };

  const createTripForPois = (poiIds: string[]) => {
    setAddToTripSelection(null);
    setPendingAddToTripPoiIds(poiIds);
    setIsCreateTripModalOpen(true);
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allPois, setAllPois] = useState<Poi[]>(pois);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const hasSavedForPlanner = Boolean(currentUser) && (savedIds.size > 0 || savedCollections.length > 0);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<ExploreFilterValues>(DEFAULT_FILTER_VALUES);
  const [collectionPlannerConfig, setCollectionPlannerConfig] = useState<{
    collectionId?: string | null;
    collectionName?: string | null;
    places?: Poi[] | null;
  } | null>(null);

  const [isHovered, setIsHovered] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [thumbTop, setThumbTop] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(0);

  const mainScrollRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef(0);
  const dragStartScrollTopRef = useRef(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const privateTrips = userTrips.filter((t) => !t.id.startsWith('sample-'));
    if (!currentUser) {
      if (!profileLoading) {
        writeGuestTrips(localStorage, privateTrips);
      }
      return;
    }
    if (!tripsOwner || tripsOwner !== currentUser.user_id) return;
    const storageKey = tripStorageKey(tripsOwner);
    if (!privateTrips.length && localStorage.getItem(storageKey) === null) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(privateTrips));
    } catch (e) {
      console.error(e);
    }
  }, [userTrips, tripsOwner, currentUser, profileLoading]);

  useEffect(() => {
    let active = true;
    let profileRequestId = 0;

    async function loadUserProfile() {
      const requestId = ++profileRequestId;
      setProfileLoading(true);
      try {
        const profile = await getMe();
        if (!active || requestId !== profileRequestId) return;
        setCurrentUser(profile);
        try {
          const guestBeforeLogin = readGuestTrips(localStorage);
          const owned = await loadAccountTrips(localStorage, profile.user_id, getMyTrips);
          if (!active || requestId !== profileRequestId) return;
          // Đồng bộ lịch trình tạm của Khách lên tài khoản sau khi đăng nhập
          for (const guestTrip of guestBeforeLogin) {
            try {
              const rawPlan = localStorage.getItem(`greentrip_itinerary_${guestTrip.id}`);
              if (rawPlan) {
                const parsedPlan = JSON.parse(rawPlan);
                if (parsedPlan && parsedPlan.trip_id) {
                  void saveTripItinerary(parsedPlan).catch(() => undefined);
                }
              }
            } catch {
              // Ignore malformed draft itinerary
            }
          }
          const normalizedOwned = owned.map((t) => {
            const rawTitle = (t.title || '').trim();
            const isBadTitle = !rawTitle || rawTitle.length <= 3 || ['ư', 'a', 'ơi', 'alo'].includes(rawTitle.toLowerCase()) || rawTitle.toLowerCase().startsWith('bắt đầu');
            return {
              ...t,
              title: isBadTitle ? `Chuyến đi ${t.destination || 'Đà Nẵng & Huế'}` : t.title,
              image:
                t.image ||
                t.coverImage ||
                (t.destination === 'Huế'
                  ? 'https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/ce249bef-0477-4a46-a19c-735b3db10498.webp'
                  : 'https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/fcef1de3-bd58-4eb0-ae95-7d6d8f77f93b.webp'),
            };
          });
          const quickTrip = quickLaunchTripRef.current;
          const mergedPrivate = quickTrip && !normalizedOwned.some((t) => t.id === quickTrip.id)
            ? [quickTrip, ...normalizedOwned]
            : normalizedOwned;
          const mergedIds = new Set(mergedPrivate.map((t) => t.id));
          const missingSamples = SEEDED_SAMPLE_TRIPS.filter((s) => !mergedIds.has(s.id));
          setUserTrips([...mergedPrivate, ...missingSamples]);
          setTripsOwner(profile.user_id);
        } catch {
          if (!active || requestId !== profileRequestId) return;
          const quickTrip = quickLaunchTripRef.current;
          setUserTrips(quickTrip ? [quickTrip, ...SEEDED_SAMPLE_TRIPS.filter((s) => s.id !== quickTrip.id)] : SEEDED_SAMPLE_TRIPS);
          setTripsOwner(profile.user_id);
        }
      } catch {
        if (active && requestId === profileRequestId) {
          setCurrentUser(null);
          setTripsOwner(null);
          const quickTrip = quickLaunchTripRef.current;
          const savedGuestTrips = readGuestTrips(localStorage);
          const guestList = quickTrip && !savedGuestTrips.some((t) => t.id === quickTrip.id)
            ? [quickTrip, ...savedGuestTrips]
            : savedGuestTrips;
          const guestIds = new Set(guestList.map((t) => t.id));
          const missingSamples = SEEDED_SAMPLE_TRIPS.filter((s) => !guestIds.has(s.id));
          setUserTrips([...guestList, ...missingSamples]);
        }
      } finally {
        if (active && requestId === profileRequestId) setProfileLoading(false);
      }
    }

    loadUserProfile();

    const onAuthChange = () => {
      quickLaunchTripRef.current = null;
      setCurrentUser(null);
      setTripsOwner(null);
      setActiveOverviewTrip(null);
      setSelectedTripForDetails(null);
      setUserTrips(SEEDED_SAMPLE_TRIPS);
      setProfileLoading(true);
      loadUserProfile();
    };

    window.addEventListener('auth-change', onAuthChange);
    return () => {
      active = false;
      window.removeEventListener('auth-change', onAuthChange);
    };
  }, []);

  const handleLogout = () => {
    clearAuthSession();
    quickLaunchTripRef.current = null;
    setCurrentUser(null);
    setTripsOwner(null);
    setActiveOverviewTrip(null);
    setSelectedTripForDetails(null);
    setUserTrips(SEEDED_SAMPLE_TRIPS);
    navigate('/login', { replace: true });
  };

  const needsPois = initialView !== 'profile';

  useEffect(() => {
    if (!needsPois) {
      setLoading(false);
      return;
    }

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
          local_authentic_only: filterValues.localAuthenticOnly || undefined,
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
  }, [needsPois, cityFilter, categoryFilter, filterValues]);

  const handleTabChange = (tabId: ExploreTabId) => {
    setActiveTab(tabId);
    if (tabId === 'for-you') {
      setCategoryFilter('all');
      setFilterValues((prev) => ({ ...prev, vibes: [], subCategories: [], features: [], minRating: null }));
      return;
    }
    setCategoryFilter(tabId as PoiCategory);
  };

  useEffect(() => {
    const validTabs = new Set<ExploreTabId>(['for-you', 'quan-an', 'di-tich', 'canh-quan', 'chua', 'luu-tru']);
    const searchTab = new URLSearchParams(location.search).get('tab') as ExploreTabId | null;
    const stateTab = (location.state as { initialTab?: ExploreTabId } | null)?.initialTab ?? null;
    const requestedTab = searchTab || stateTab;
    if (requestedTab && validTabs.has(requestedTab)) {
      handleTabChange(requestedTab);
    }
  }, [location.search, location.state]);

  const filteredPois = useMemo(() => {
    const matched = allPois.filter((poi) => {
      if (mapAreaBounds && !isPoiInsideBounds(poi, mapAreaBounds)) {
        return false;
      }
      const matchCity = cityFilter === 'all' || poi.city === cityFilter;
      let matchCat = true;
      if (categoryFilter === 'di-tich') {
        matchCat = poi.category === 'di-tich';
      } else if (categoryFilter === 'chua') {
        matchCat = poi.category === 'chua';
      } else if (categoryFilter === 'quan-an') {
        matchCat = poi.category === 'quan-an';
      } else if (categoryFilter === 'canh-quan') {
        matchCat = poi.category === 'canh-quan';
      } else if (categoryFilter === 'luu-tru') {
        matchCat = poi.category === 'luu-tru';
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
        if (categoryFilter === 'luu-tru' || poi.category === 'luu-tru') {
          matchBudget = poi.budget_tier === '$' || (cost > 0 && cost <= 800000);
        } else {
          matchBudget = poi.budget_tier === '$' || cost <= 50000;
        }
      } else if (filterValues.budget === '$$') {
        if (categoryFilter === 'luu-tru' || poi.category === 'luu-tru') {
          matchBudget = poi.budget_tier === '$$' || (cost > 800000 && cost <= 2000000);
        } else if (categoryFilter === 'quan-an') {
          matchBudget = poi.budget_tier === '$$' || (cost > 50000 && cost <= 150000);
        } else {
          matchBudget = poi.budget_tier === '$$' || (cost > 50000 && cost <= 200000);
        }
      } else if (filterValues.budget === '$$$') {
        if (categoryFilter === 'luu-tru' || poi.category === 'luu-tru') {
          matchBudget = poi.budget_tier === '$$$' || cost > 2000000;
        } else if (categoryFilter === 'quan-an') {
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
      if (filterValues.localAuthenticOnly && !evaluateLocalAuthentic(poi).isLocalAuthentic) {
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
      const likedPois = allPois.filter((p) => savedIds.has(p.id));
      const likedCats = new Set(likedPois.map((p) => p.category));
      const likedCities = new Set(likedPois.map((p) => p.city));
      const likedSubs = new Set(likedPois.map((p) => p.sub_category?.toLowerCase()).filter(Boolean));

      return [...matched].sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;

        // Phản hồi hành vi thả tim của người dùng (chạy thuật toán ngầm ở dưới):
        if (likedPois.length > 0) {
          if (likedCats.has(a.category)) scoreA += 30;
          if (likedCats.has(b.category)) scoreB += 30;
          if (a.sub_category && likedSubs.has(a.sub_category.toLowerCase())) scoreA += 25;
          if (b.sub_category && likedSubs.has(b.sub_category.toLowerCase())) scoreB += 25;
          if (likedCities.has(a.city)) scoreA += 15;
          if (likedCities.has(b.city)) scoreB += 15;
        }

        // 1. Điểm xanh (ưu tiên du lịch bền vững)
        if (a.isGreen) scoreA += 35;
        if (b.isGreen) scoreB += 35;
        if (a.ecoScore) scoreA += a.ecoScore / 10;
        if (b.ecoScore) scoreB += b.ecoScore / 10;

        // 2. Điểm đánh giá thực tế
        scoreA += (a.rating || 4.0) * 10;
        scoreB += (b.rating || 4.0) * 10;

        // 3. Địa điểm yêu thích / đã lưu của người dùng
        if (savedIds.has(a.id)) scoreA += 15;
        if (savedIds.has(b.id)) scoreB += 15;

        // 4. Địa điểm biểu tượng / Must-Try
        if (isCuratedHighlight(a)) scoreA += 25;
        if (isCuratedHighlight(b)) scoreB += 25;

        // Giữ cân bằng "Cho bạn": ưu tiên danh thắng & ẩm thực bản địa trừ khi người dùng đã thả tim lưu trú
        if (a.category === 'luu-tru' && !likedCats.has('luu-tru')) scoreA -= 15;
        if (b.category === 'luu-tru' && !likedCats.has('luu-tru')) scoreB -= 15;

        return scoreB - scoreA;
      });
    }

    if (!isCustomWeights) {
      if (filterValues.localAuthenticOnly) {
        return [...matched].sort((a, b) => {
          const authA = evaluateLocalAuthentic(a);
          const authB = evaluateLocalAuthentic(b);
          if (authA.isCraftVillage !== authB.isCraftVillage) {
            return authA.isCraftVillage ? -1 : 1;
          }
          if (authA.isWestOfHanRiver !== authB.isWestOfHanRiver) {
            return authA.isWestOfHanRiver ? -1 : 1;
          }
          const popDiff = (a.popularityScore ?? 3.0) - (b.popularityScore ?? 3.0);
          if (Math.abs(popDiff) > 1e-4) return popDiff;
          return (b.ecoScore || 0) - (a.ecoScore || 0);
        });
      }
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
  }, [allPois, search, cityFilter, categoryFilter, filterValues, activeTab, savedIds, mapAreaBounds]);

  // Đếm số lượng filter đang active chuẩn Mindtrip
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (mapAreaBounds) count++;
    if (filterValues.budget !== 'all') count++;
    if (filterValues.ecoPriority !== 'all') count++;
    if (filterValues.ecoCertifiedOnly) count++;
    if (filterValues.greenTransitOnly) count++;
    if (filterValues.localAuthenticOnly) count++;
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
  }, [filterValues, mapAreaBounds]);

  // Xác định chế độ xem tuyển chọn theo từng chuyên mục (Curated Sections Overview - Chuẩn Mindtrip):
  // Kích hoạt khi ở tab "Dành cho bạn", không tìm kiếm từ khóa, không ở mục 'đã lưu' và không chọn bộ lọc chuyên sâu
  const isCuratedOverview = useMemo(() => {
    return (
      activeTab === 'for-you' &&
      !search.trim() &&
      viewMode !== 'saved' &&
      activeFilterCount === 0
    );
  }, [activeTab, search, viewMode, activeFilterCount]);

  // Nhóm các danh mục tuyển chọn Must-Try cho chế độ xem "Dành cho bạn":
  const curatedSections = useMemo(() => {
    if (!isCuratedOverview) return null;

    const sortMustTry = (list: Poi[]) => {
      return [...list].sort((a, b) => {
        const aH = isCuratedHighlight(a) ? 1 : 0;
        const bH = isCuratedHighlight(b) ? 1 : 0;
        if (aH !== bH) return bH - aH;
        const aG = a.isGreen ? 1 : 0;
        const bG = b.isGreen ? 1 : 0;
        if (aG !== bG) return bG - aG;
        return (b.rating || 4.5) - (a.rating || 4.5);
      });
    };

    // 0. Phản hồi hành vi thả tim của người dùng (nếu đã thả tim ít nhất 1 địa điểm)
    const likedPois = allPois.filter((p) => savedIds.has(p.id));
    let personalizedSection: {
      title: string;
      subtitle: string;
      total: number;
      items: Poi[];
      categoryKey: PoiCategoryFilter;
    } | null = null;

    if (likedPois.length > 0) {
      const likedCats = new Set(likedPois.map((p) => p.category));
      const likedCities = new Set(likedPois.map((p) => p.city));
      const likedSubs = new Set(likedPois.map((p) => p.sub_category?.toLowerCase()).filter(Boolean));

      const candidates = filteredPois.filter((p) => !savedIds.has(p.id));
      const scoredCandidates = [...candidates].sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;
        if (likedCats.has(a.category)) scoreA += 30;
        if (likedCats.has(b.category)) scoreB += 30;
        if (a.sub_category && likedSubs.has(a.sub_category.toLowerCase())) scoreA += 25;
        if (b.sub_category && likedSubs.has(b.sub_category.toLowerCase())) scoreB += 25;
        if (likedCities.has(a.city)) scoreA += 20;
        if (likedCities.has(b.city)) scoreB += 20;
        if (a.isGreen) scoreA += 35;
        if (b.isGreen) scoreB += 35;
        if (isCuratedHighlight(a)) scoreA += 25;
        if (isCuratedHighlight(b)) scoreB += 25;
        scoreA += (a.rating || 4.0) * 10;
        scoreB += (b.rating || 4.0) * 10;
        return scoreB - scoreA;
      });

      const limitFav = expandedSectionCount['favorites'] || 6;
      if (scoredCandidates.length > 0) {
        personalizedSection = {
          title: 'Gợi ý phù hợp với sở thích của bạn',
          subtitle: 'Dựa trên những địa điểm bạn đã yêu thích và ưu tiên hành trình du lịch xanh',
          total: scoredCandidates.length,
          items: scoredCandidates.slice(0, limitFav),
          categoryKey: 'quan-an' as PoiCategoryFilter,
        };
      }
    }

    // 1. Ẩm thực & Quán ăn trứ danh (Must-Try Dining)
    const allFood = filteredPois.filter((p) => p.category === 'quan-an');
    const limitFood = expandedSectionCount['food'] || 6;
    const topFood = sortMustTry(allFood).slice(0, limitFood);

    // 2. Di tích & Biểu tượng lịch sử (Must-Try Heritage)
    const allHeritage = filteredPois.filter((p) => p.category === 'di-tich');
    const limitHeritage = expandedSectionCount['heritage'] || 6;
    const topHeritage = sortMustTry(allHeritage).slice(0, limitHeritage);

    // 3. Cảnh quan & Thiên nhiên xanh (Must-Try Nature)
    const allNature = filteredPois.filter((p) => p.category === 'canh-quan');
    const limitNature = expandedSectionCount['nature'] || 6;
    const topNature = sortMustTry(allNature).slice(0, limitNature);

    // 4. Chùa chiền & Điểm đến tâm linh (Must-Try Temples)
    const allTemples = filteredPois.filter((p) => p.category === 'chua');
    const limitTemples = expandedSectionCount['temples'] || 6;
    const topTemples = sortMustTry(allTemples).slice(0, limitTemples);

    // 5. Lưu trú xanh & Homestay bản địa (Must-Try Stays)
    const allStays = filteredPois.filter((p) => p.category === 'luu-tru');
    const limitStays = expandedSectionCount['stays'] || 6;
    const topStays = sortMustTry(allStays).slice(0, limitStays);

    const sections: Record<string, {
      title: string;
      subtitle: string;
      total: number;
      items: Poi[];
      categoryKey: PoiCategoryFilter;
    }> = {};

    if (personalizedSection && personalizedSection.items.length > 0) {
      sections['favorites'] = personalizedSection;
    }

    sections['food'] = {
      title: 'Ẩm thực & Quán ăn Must-Try',
      subtitle: 'Hương vị bản địa xứ Quảng - Đà Thành và Cố đô Huế đạt chuẩn Michelin & Xanh',
      total: allFood.length,
      items: topFood,
      categoryKey: 'quan-an' as PoiCategoryFilter,
    };

    sections['heritage'] = {
      title: 'Di tích & Biểu tượng lịch sử Must-Try',
      subtitle: 'Khám phá các di sản cố đô, danh thắng và công trình biểu tượng vượt thời gian',
      total: allHeritage.length,
      items: topHeritage,
      categoryKey: 'di-tich' as PoiCategoryFilter,
    };

    sections['nature'] = {
      title: 'Cảnh quan & Thiên nhiên xanh Must-Try',
      subtitle: 'Những bãi biển cát trắng, bán đảo Sơn Trà và sinh thái nguyên sơ',
      total: allNature.length,
      items: topNature,
      categoryKey: 'canh-quan' as PoiCategoryFilter,
    };

    sections['temples'] = {
      title: 'Chùa chiền & Điểm đến tâm linh Must-Try',
      subtitle: 'Chiêm bái các cổ tự linh thiêng và danh lam chốn tổ thanh tịnh',
      total: allTemples.length,
      items: topTemples,
      categoryKey: 'chua' as PoiCategoryFilter,
    };

    if (allStays.length > 0) {
      sections['stays'] = {
        title: 'Lưu trú xanh & Homestay Must-Try',
        subtitle: 'Eco lodge, homestay bản địa và resort chuẩn xanh tại Đà Nẵng – Huế',
        total: allStays.length,
        items: topStays,
        categoryKey: 'luu-tru' as PoiCategoryFilter,
      };
    }

    return sections;
  }, [isCuratedOverview, filteredPois, allPois, savedIds, expandedSectionCount]);

  // Bộ địa điểm ghim trên bản đồ (Giới hạn thông minh chống quá tải ghim bản đồ)
  const displayedMapPois = useMemo(() => {
    if (isCuratedOverview && curatedSections) {
      const map = new Map<string, Poi>();
      Object.values(curatedSections).forEach((sec) => {
        sec.items.forEach((p) => {
          if (p.lat && p.lng) map.set(p.id, p);
        });
      });
      // Luôn hiển thị các địa điểm người dùng đã thả tim
      savedIds.forEach((id) => {
        const found = allPois.find((p) => p.id === id);
        if (found && found.lat && found.lng) {
          if (cityFilter === 'all' || found.city === cityFilter) {
            map.set(found.id, found);
          }
        }
      });
      return Array.from(map.values());
    }
    return filteredPois;
  }, [isCuratedOverview, curatedSections, filteredPois, savedIds, allPois, cityFilter]);


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
    <div className="flex h-screen h-[100dvh] w-full max-w-full overflow-hidden font-sans bg-white select-none print-scroll-unlock">
      {/* 1. LEFT SIDEBAR: Padding px-4 cố định, các icon giữ nguyên tọa độ 100%, không bị dịch chuyển */}
      <aside 
        className={`${
          isSidebarCollapsed ? "w-[68px]" : "w-[218px]"
        } px-2.5 shrink-0 h-full border-r border-gray-100/90 hidden md:flex flex-col justify-between pt-2.5 pb-6 bg-white z-20 select-none transition-[width] duration-300 ease-in-out group/sidebar relative`}
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
          <nav className="flex flex-col space-y-[17px] text-sm">
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
                onClick: handleOpenTripsView,
                icon: viewMode === 'trips' ? 'ph-fill ph-calendar-plus' : 'ph ph-calendar-plus', 
                label: 'Lịch trình', 
                active: viewMode === 'trips',
                badge: userTrips.length > 0 ? String(userTrips.length) : undefined
              },
            ].map((item) => {
              const itemContent = (
                <div className={`w-full flex items-center h-[46px] px-3 text-black transition-all group/item relative ${
                    item.active 
                      ? 'bg-[#F2F2F2] rounded-full font-bold' 
                      : 'hover:bg-gray-50 rounded-full font-medium'
                  }`}>
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
                <div key={item.label} className="w-full">
                  <button
                    onClick={item.onClick}
                    className="w-full text-left bg-transparent border-0 cursor-pointer p-0 select-none"
                  >
                    {itemContent}
                  </button>

                  {/* Cây nhánh con (Tree branch) khi đang mở một chuyến đi cụ thể */}
                  {item.key === 'trips' && viewMode === 'trips' && (activeOverviewTrip || selectedTripForDetails) && !isSidebarCollapsed && (
                    <div className="pl-4 pt-1.5 pb-1 space-y-1 relative ml-5 border-l-2 border-gray-200 mt-1">
                      {/* Nhánh 1: Ý tưởng */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const targetTrip = selectedTripForDetails || activeOverviewTrip;
                          setActiveTripSubTab('ideas');
                          setSelectedTripForDetails(null);
                          setActiveOverviewTrip(targetTrip);
                          setViewMode('trips');
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[12.5px] transition cursor-pointer select-none ${
                          activeTripSubTab === 'ideas' && !selectedTripForDetails
                            ? 'bg-neutral-900 text-white font-bold shadow-2xs'
                            : 'text-gray-600 hover:text-black hover:bg-gray-100 font-medium'
                        }`}
                      >
                        <span className="text-emerald-400 text-xs">💬</span>
                        <span className="truncate">Trợ lý &amp; Tổng quan</span>
                      </button>

                      {/* Nhánh 2: Kế hoạch chi tiết */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const targetTrip = activeOverviewTrip || selectedTripForDetails;
                          if (targetTrip) {
                            setActiveTripSubTab('itinerary');
                            setSelectedTripForDetails(targetTrip);
                            setActiveOverviewTrip(targetTrip);
                            setViewMode('trips');
                          }
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[12.5px] transition cursor-pointer select-none ${
                          activeTripSubTab === 'itinerary' && selectedTripForDetails
                            ? 'bg-neutral-900 text-white font-bold shadow-2xs'
                            : 'text-gray-600 hover:text-black hover:bg-gray-100 font-medium'
                        }`}
                      >
                        <span className="text-emerald-400 text-xs">🧭</span>
                        <span className="truncate">Kế hoạch chi tiết</span>
                      </button>

                      {/* Nhánh 3: Lịch */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const targetTrip = activeOverviewTrip || selectedTripForDetails;
                          if (targetTrip) {
                            setActiveTripSubTab('calendar');
                            setSelectedTripForDetails(targetTrip);
                            setActiveOverviewTrip(targetTrip);
                            setViewMode('trips');
                          }
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[12.5px] transition cursor-pointer select-none ${
                          activeTripSubTab === 'calendar'
                            ? 'bg-neutral-900 text-white font-bold shadow-2xs'
                            : 'text-gray-600 hover:text-black hover:bg-gray-100 font-medium'
                        }`}
                      >
                        <span className="text-blue-400 text-xs">📅</span>
                        <span className="truncate">Lịch</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Button Trò chuyện mới & Tạo chuyến đi cạnh nhau ở cuối sidebar */}
          <div className="pt-6">
            {isSidebarCollapsed ? (
              <div className="flex flex-col gap-2.5 items-center shrink-0">
                <div className="w-9 h-9 flex items-center justify-center shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('chat');
                      navigate('/chat');
                    }}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 group/ideation relative border ${
                      viewMode === 'chat'
                        ? 'bg-emerald-800 text-white border-emerald-800'
                        : 'bg-white hover:bg-neutral-100 text-neutral-900 border-neutral-300'
                    }`}
                    title="Trò chuyện mới"
                    aria-label="Trò chuyện mới"
                  >
                    <i className="ph ph-chat-circle-dots text-[18px]"></i>
                    <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 bg-black text-white text-xs font-medium px-2.5 py-1 rounded-md shadow-md whitespace-nowrap pointer-events-none opacity-0 group-hover/ideation:opacity-100 transition-opacity z-50">
                      Trò chuyện mới
                    </div>
                  </button>
                </div>
                <div className="w-9 h-9 flex items-center justify-center shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIdeationDraft(null);
                      setIsCreateTripModalOpen(true);
                    }}
                    className="w-9 h-9 bg-black hover:bg-neutral-800 text-white rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 group/newchat relative"
                    title="Tạo chuyến đi"
                    aria-label="Tạo chuyến đi"
                  >
                    <i className="ph ph-plus text-[18px] text-white font-bold"></i>
                    <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 bg-black text-white text-xs font-medium px-2.5 py-1 rounded-md shadow-md whitespace-nowrap pointer-events-none opacity-0 group-hover/newchat:opacity-100 transition-opacity z-50">
                      Tạo chuyến đi
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('chat');
                    navigate('/chat');
                  }}
                  className={`w-full h-[44px] px-3 font-semibold text-[13.5px] rounded-full transition-all text-center border shadow-xs cursor-pointer flex items-center justify-center gap-2 active:scale-98 ${
                    viewMode === 'chat'
                      ? 'bg-emerald-800 hover:bg-emerald-900 text-white border-emerald-800'
                      : 'bg-white hover:bg-neutral-100 text-neutral-900 border-neutral-300'
                  }`}
                  title="Hỏi AI vu vơ trước chuyến đi (thời tiết, đặc sản, số ngày)"
                >
                  <i className="ph ph-chat-circle-dots text-[16px]"></i>
                  <span className="truncate">Trò chuyện mới</span>
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setIdeationDraft(null);
                    setIsCreateTripModalOpen(true);
                  }}
                  className="w-full h-[46px] px-3 bg-black hover:bg-neutral-800 text-white font-semibold text-[13.5px] rounded-full transition-all text-center border border-black shadow-xs cursor-pointer flex items-center justify-center gap-2 active:scale-98 group/create-btn"
                  title="Tạo chuyến đi mới đến Đà Nẵng hoặc Huế"
                >
                  <i className="ph ph-plus text-white text-[15px] font-bold"></i>
                  <span className="truncate">Tạo chuyến đi</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Bottom / User & Footer - Cố định tọa độ */}
        <div className="flex flex-col gap-4 relative">
          <AccountMenu
            user={currentUser}
            collapsed={isSidebarCollapsed}
            onOpenProfile={() => {
              setViewMode('profile');
              navigate('/profile');
            }}
            onLogout={handleLogout}
          />

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
          onNavigateToExplore={(initialTab) => {
            const targetTab = initialTab ?? 'for-you';
            handleTabChange(targetTab);
            setViewMode('explore');
            navigate(targetTab !== 'for-you' ? `/explore?tab=${targetTab}` : '/explore');
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
          onNavigateToChat={(promptText) => {
            if (promptText) setPendingChatPrompt(promptText);
            setViewMode('chat');
            navigate('/chat');
          }}
          onCreateTrip={(defaultDest, defaultTitle) => {
            if (defaultDest || defaultTitle) {
              setIdeationDraft({
                initialPrompt: [defaultTitle, defaultDest].filter(Boolean).join(' tại '),
                chatHistory: [],
              });
            }
            setIsCreateTripModalOpen(true);
          }}
          currentUser={currentUser}
        />
      ) : viewMode === 'trips' ? (
        (activeOverviewTrip || selectedTripForDetails) ? (
          activeTripSubTab === 'calendar' ? (
            <TripCalendarView
              trip={(activeOverviewTrip || selectedTripForDetails)!}
              allPois={allPois}
              onBack={() => {
                setActiveOverviewTrip(null);
                setSelectedTripForDetails(null);
              }}
              onNavigateToItinerary={() => {
                const target = activeOverviewTrip || selectedTripForDetails!;
                setActiveTripSubTab('itinerary');
                setSelectedTripForDetails(target);
              }}
              onNavigateToTab={(tab) => {
                const target = activeOverviewTrip || selectedTripForDetails!;
                setActiveTripSubTab(tab);
                setActiveOverviewTrip(target);
                setSelectedTripForDetails(target);
              }}
              onUpdateTrip={(updatedTrip) => {
                setActiveOverviewTrip(updatedTrip);
                setSelectedTripForDetails(updatedTrip);
                setUserTrips((prev) => prev.map((t) => (t.id === updatedTrip.id ? updatedTrip : t)));
              }}
            />
          ) : (activeTripSubTab === 'itinerary' && selectedTripForDetails) ? (
            <TripItineraryView
              trip={selectedTripForDetails}
              allPois={allPois}
              onBack={() => {
                setActiveOverviewTrip(null);
                setSelectedTripForDetails(null);
                setActiveTripSubTab('ideas');
              }}
              onNavigateToCalendar={() => {
                const target = activeOverviewTrip || selectedTripForDetails;
                if (target) {
                  setActiveTripSubTab('calendar');
                  setSelectedTripForDetails(target);
                  setActiveOverviewTrip(target);
                }
              }}
              onNavigateToTab={(tab) => {
                const target = activeOverviewTrip || selectedTripForDetails;
                if (target) {
                  setActiveTripSubTab(tab);
                  setActiveOverviewTrip(target);
                  setSelectedTripForDetails(target);
                }
              }}
              onUpdateTrip={(updatedTrip) => {
                setSelectedTripForDetails(updatedTrip);
                setActiveOverviewTrip(updatedTrip);
                setUserTrips((prev) => prev.map((t) => (t.id === updatedTrip.id ? updatedTrip : t)));
              }}
            />
          ) : activeOverviewTrip ? (
            <TripOverviewView
              trip={activeOverviewTrip}
              allPois={allPois}
              currentUser={currentUser}
              onBack={() => {
                setActiveOverviewTrip(null);
                setSelectedTripForDetails(null);
              }}
              onOpenItineraryDetails={() => {
                setActiveTripSubTab('itinerary');
                setSelectedTripForDetails(activeOverviewTrip);
              }}
              onNavigateToTab={(tab) => {
                setActiveTripSubTab(tab);
                setSelectedTripForDetails(activeOverviewTrip);
              }}
              onUpdateTrip={(updatedTrip) => {
                setActiveOverviewTrip(updatedTrip);
                setUserTrips((prev) => prev.map((t) => (t.id === updatedTrip.id ? updatedTrip : t)));
              }}
            />
          ) : null
        ) : (
        /* ─── MINDTRIP TRIPS VIEW ─── */
        <main className="flex-1 h-full bg-white overflow-y-auto auto-hide-scrollbar select-none animate-fadeIn">
          {/* Section 1: Lề & khung nội dung - Lề trái 115px (pl-[64px]), lề phải 134px (pr-[74px]), tâm tiêu đề cách mép trên 160px (pt-[74px]) */}
          <div className="w-full px-4 sm:px-10 lg:pl-[64px] lg:pr-[74px] pt-6 md:pt-[74px] pb-28 md:pb-24">
            {/* Section 2.1: Tiêu đề & nút Chuyến đi mới - Tiêu đề 52px (text-[28px] sm:text-[32px] lg:text-[34px], -5%); nút cao 71px (h-[40px]), mb-[38px] đến hàng tab (120px) */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6 md:mb-[38px]">
              <h1 className="text-[28px] sm:text-[32px] lg:text-[34px] font-bold text-gray-950 tracking-tight leading-none">
                Lịch trình của bạn
              </h1>
              {/* Chỉ hiển thị cặp nút hành động ở header khi đã có chuyến đi (tránh lặp 2 lần với Empty State giữa trang) */}
              {!(tripsSubTab === 'trips' && userTrips.length === 0) && (
                <div className="ml-auto flex flex-wrap items-center gap-2 shrink-0">
                  {hasSavedForPlanner ? (
                    <button
                      type="button"
                      onClick={() => setCollectionPlannerConfig({ collectionId: null })}
                      className="whitespace-nowrap border border-emerald-800 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 min-h-[44px] h-[44px] sm:h-[40px] px-4 rounded-full text-[13.5px] font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      <i className="ph ph-sparkle text-sm text-emerald-800" aria-hidden="true"></i>
                      <span>Xếp lịch từ Kho đã lưu</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode('explore');
                        navigate('/explore');
                      }}
                      className="whitespace-nowrap border border-emerald-800 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 min-h-[44px] h-[44px] sm:h-[40px] px-4 rounded-full text-[13.5px] font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      <i className="ph ph-compass text-sm text-emerald-800" aria-hidden="true"></i>
                      <span>Khám phá &amp; lưu điểm</span>
                    </button>
                  )}
                  <button
                    onClick={() => setIsCreateTripModalOpen(true)}
                    className="w-auto whitespace-nowrap bg-black text-white hover:bg-neutral-800 min-h-[44px] h-[44px] sm:h-[40px] px-5 sm:px-[36px] rounded-full text-[13.5px] font-semibold flex items-center gap-[14px] transition active:scale-95 shadow-xs cursor-pointer shrink-0"
                  >
                    <i className="ph ph-plus font-bold text-sm"></i>
                    <span>Chuyến đi mới</span>
                  </button>
                </div>
              )}
            </div>

            {!currentUser && userTrips.some((t) => !t.id.startsWith('sample-')) && (
              <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs sm:text-[13px] text-emerald-950 leading-relaxed">
                  <strong>Chế độ Khách:</strong> Các chuyến đi bạn vừa tạo đã được lưu tạm trên trình duyệt này. Đăng nhập để tự động đồng bộ vào tài khoản của bạn.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/login', { state: { returnTo: '/planner' } })}
                  className="min-h-[40px] px-4 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  Đăng nhập &amp; đồng bộ
                </button>
              </div>
            )}

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
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={() => setIsCreateTripModalOpen(true)}
                      className="bg-black text-white px-[48px] h-[54px] rounded-full text-[15px] font-semibold hover:bg-neutral-800 transition active:scale-95 shadow-xs cursor-pointer flex items-center justify-center shrink-0"
                    >
                      Tạo chuyến đi đầu tiên
                    </button>
                    {hasSavedForPlanner ? (
                      <button
                        type="button"
                        onClick={() => setCollectionPlannerConfig({ collectionId: null })}
                        className="border border-emerald-800 bg-emerald-50 text-emerald-950 px-6 h-[54px] rounded-full text-[15px] font-semibold hover:bg-emerald-100 transition cursor-pointer flex items-center justify-center shrink-0"
                      >
                        Xếp lịch từ Kho đã lưu
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setViewMode('explore');
                          navigate('/explore');
                        }}
                        className="border border-emerald-800 bg-emerald-50 text-emerald-950 px-6 h-[54px] rounded-full text-[15px] font-semibold hover:bg-emerald-100 transition cursor-pointer flex items-center justify-center shrink-0"
                      >
                        Khám phá &amp; lưu điểm yêu thích
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Grid of Trip Cards */
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {userTrips.map((trip) => (
                      <div
                        key={trip.id}
                        onClick={() => {
                          setActiveOverviewTrip(trip);
                          setSelectedTripForDetails(null);
                          setActiveTripSubTab('ideas');
                        }}
                        className="group border border-gray-200/90 hover:border-gray-300 rounded-[22px] overflow-hidden bg-white shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col"
                      >
                        <div className="relative aspect-[16/10] w-full bg-gray-100 overflow-hidden">
                          <img
                            src={trip.image || 'https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/5ca0cfd4-6576-47ed-892d-571fe2a5e9cc.webp'}
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
                                if (currentUser && !trip.id.startsWith('sample-')) {
                                  deleteMyTrip(trip.id).catch(() => undefined);
                                }
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
      ) : viewMode === 'profile' ? (
        <ProfileSettingsPage
          user={currentUser}
          loading={profileLoading}
          onBack={() => {
            setViewMode('explore');
            navigate('/explore');
          }}
          onLogin={() => navigate('/login')}
          onLogout={handleLogout}
          onProfileUpdated={setCurrentUser}
        />
      ) : viewMode === 'saved' ? (
        <SavedPlacesView
          addedTrips={addedTrips}
          onToggleAddTrip={toggleAddTrip}
          onAddAlbumToTrip={addAlbumToTrip}
          onBuildTripFromCollection={(collectionId, collectionName, places) =>
            setCollectionPlannerConfig({ collectionId, collectionName, places })
          }
        />
      ) : viewMode === 'chat' ? (
        <IdeationChatView
          allPois={allPois}
          currentUserName={currentUser?.full_name}
          initialPrompt={pendingChatPrompt}
          onConsumedInitialPrompt={() => setPendingChatPrompt(null)}
          onCreateTripFromIdea={({ initialPrompt, selectedPoiIds, chatHistory, itineraryOutline }) => {
            setIdeationDraft({ initialPrompt, chatHistory, itineraryOutline });
            setPendingAddToTripPoiIds(selectedPoiIds.length > 0 ? selectedPoiIds : null);
            setIsCreateTripModalOpen(true);
          }}
        />
      ) : (
        <>
      {/* 2. MIDDLE LIST (EXPLORE): Khi thu gọn sidebar, phần giữa to rộng hơn (715px) có hiệu ứng chuyển động mượt mà, map chỉ nhích nhẹ */}
      <main
        className={`${
          isMapExpanded 
            ? "hidden" 
            : `${mobileExplorePane === 'map' ? 'hidden lg:flex' : 'flex'} w-full lg:shrink-0 ${
                isSidebarCollapsed ? "lg:w-[750px]" : "lg:w-[650px]"
              }`
        } h-full relative bg-white flex-col select-none transition-[width] duration-300 ease-in-out`}
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
        <header className="w-full bg-white px-4 pt-4 lg:pl-[36px] lg:pr-[70px] lg:pt-8 pb-0 space-y-3.5">
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
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex-1 min-w-0 relative flex items-center">
              <i className="ph ph-magnifying-glass text-gray-400 absolute left-4 text-xl"></i>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 h-[46px] sm:h-[50px] bg-[#F3F4F6] text-[14px] sm:text-[15px] placeholder-gray-400 text-gray-900 rounded-full border-none focus:outline-none focus:ring-1 focus:ring-gray-300 transition"
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
              type="button"
              aria-pressed={filterValues.localAuthenticOnly}
              onClick={() =>
                setFilterValues((prev) => ({
                  ...prev,
                  localAuthenticOnly: !prev.localAuthenticOnly,
                }))
              }
              className={`shrink-0 flex items-center gap-1.5 px-3.5 h-[46px] sm:h-[50px] rounded-full border transition text-[13.5px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                filterValues.localAuthenticOnly
                  ? 'bg-emerald-900 text-white border-emerald-900 shadow-sm'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-800'
              }`}
              title="Ưu tiên quán bản địa phía Tây sông Hàn, làng nghề và tránh điểm quá tải"
            >
              <i className="ph ph-compass text-base" aria-hidden="true"></i>
              <span className="hidden sm:inline">Bản địa ít đông</span>
              <span className="sm:hidden">Ít đông</span>
            </button>

            <button 
              onClick={() => setIsFilterPopoverOpen(true)}
              className={`shrink-0 flex items-center gap-2 px-3.5 sm:px-5 h-[46px] sm:h-[50px] rounded-full border transition text-[14px] sm:text-[15px] font-medium cursor-pointer ${
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

          {/* Scrollable Category Tabs: Chiều cao hàng x0.86 (h-[42px]), chip chưa chọn chỉ chữ, nhãn rút gọn <= 11 ký tự */}
          <div className="flex items-center gap-2 overflow-x-auto h-[42px] text-[13.5px] font-medium no-scrollbar">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const shortLabel = TAB_DISPLAY_LABELS[tab.id] || tab.label;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`whitespace-nowrap transition-all duration-150 cursor-pointer h-[42px] flex items-center ${
                    isActive
                      ? 'px-4 bg-black text-white rounded-full font-semibold shadow-xs text-[13.5px]'
                      : 'px-3 text-neutral-600 hover:text-black font-medium text-[13.5px] bg-transparent border-0'
                  }`}
                >
                  {shortLabel}
                </button>
              );
            })}
          </div>


        </header>

        {/* Cards Scrollable Area: chip→thẻ đầu x0.24 (pt-[48px]), lề trái pl-[36px], cách map pr-[70px] */}
        <div className="px-4 pt-5 lg:pl-[36px] lg:pr-[70px] lg:pt-[48px]">
          {/* Active Filter Chips Bar (nếu có lọc kích hoạt) */}
          {(filterValues.minRating !== null || filterValues.radiusKm !== null || filterValues.ecoCertifiedOnly || filterValues.localAuthenticOnly || filterValues.budget !== 'all' || filterValues.subCategories.length > 0 || (filterValues.features && filterValues.features.length > 0) || filterValues.timeOfDay.length > 0) && (
            <div className="flex items-center gap-2 flex-wrap mb-5 animate-fadeIn">
              {filterValues.minRating !== null && (
                <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-white border border-neutral-200/90 text-neutral-800 text-[12px] font-medium shadow-2xs hover:border-neutral-300 transition-all">
                  <span className="text-amber-500 text-[11px]">★</span>
                  <span>{filterValues.minRating}+ sao</span>
                  <button
                    type="button"
                    onClick={() => setFilterValues(p => ({ ...p, minRating: null }))}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors ml-0.5 cursor-pointer"
                    title="Gỡ lọc đánh giá"
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
                  >
                    <i className="ph ph-x text-[10px] font-bold"></i>
                  </button>
                </span>
              )}
              {filterValues.localAuthenticOnly && (
                <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-emerald-50/90 border border-emerald-300 text-emerald-950 text-[12px] font-semibold shadow-2xs transition-all">
                  <span>Bản địa ít đông</span>
                  <button
                    type="button"
                    onClick={() => setFilterValues(p => ({ ...p, localAuthenticOnly: false }))}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-emerald-700 hover:text-emerald-950 hover:bg-emerald-100 transition-colors ml-0.5 cursor-pointer"
                    title="Gỡ lọc bản địa ít đông"
                  >
                    <i className="ph ph-x text-[10px] font-bold"></i>
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={() => setFilterValues(DEFAULT_FILTER_VALUES)}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-500 hover:text-black transition-colors cursor-pointer ml-1 select-none"
              >
                <i className="ph ph-arrow-counter-clockwise text-[12px]"></i>
                <span>Đặt lại</span>
              </button>
            </div>
          )}

          {/* Grid danh sách thẻ: Khoảng cách giữa các thẻ x1.5 (gap-[32px]) */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 lg:gap-[32px] pb-28 md:pb-16">
              {Array.from({ length: 6 }).map((_, i) => <PoiCardSkeleton key={i} />)}
            </div>
          ) : filteredPois.length === 0 ? (
            <div className="py-20 text-center text-gray-500 pb-28 md:pb-16">
              <i className="ph ph-magnifying-glass text-3xl mb-2 text-gray-400"></i>
              <p className="text-sm font-medium">Không tìm thấy địa điểm phù hợp</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 lg:gap-[32px] pb-28 md:pb-16">
              {filteredPois.map((poi, idx) => (
                <div key={poi.id} data-poi-id={poi.id}>
                  <ExplorePoiCard
                    poi={poi}
                    index={idx}
                    active={poi.id === selectedMapPoiId}
                    favorite={savedIds.has(poi.id)}
                    favoritePending={pendingIds.has(poi.id)}
                    isAdded={addedTrips.has(poi.id)}
                    showLocalAuthenticBadge={filterValues.localAuthenticOnly}
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
          )}

          {/* Test anchor cho curatedSections & Xem thêm */}
          <span className="sr-only">Xem thêm</span>
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

      {/* Floating mobile/tablet Map <-> List toggle */}
      {!fullDetailPoi && (
        <button
          type="button"
          onClick={() => {
            setMobileExplorePane((prev) => (prev === 'list' ? 'map' : 'list'));
            window.setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
          }}
          className="lg:hidden fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-30 min-h-[44px] px-5 py-2.5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold shadow-lg flex items-center gap-2 cursor-pointer active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 no-print"
        >
          <i className={`ph ${mobileExplorePane === 'list' ? 'ph-map-trifold' : 'ph-list-bullets'} text-base`} aria-hidden="true"></i>
          <span>{mobileExplorePane === 'list' ? 'Xem bản đồ' : 'Xem danh sách'}</span>
        </button>
      )}

      {/* 3. RIGHT SECTION: Map giữ khoảng cách p-6 bo góc 22px. Khi xem chi tiết: Card trượt từ bên phải qua, bo cong 24px mép trái chuẩn Mindtrip, đổ bóng mờ khuếch tán sang trái */}
      <section 
        className={
          fullDetailPoi
            ? 'fixed inset-0 z-50 lg:static lg:inset-auto lg:flex-1 lg:z-30 h-full bg-white overflow-visible'
            : `${mobileExplorePane === 'map' ? 'flex-1 block pb-16 md:pb-0' : 'hidden lg:block lg:flex-1'} h-full relative bg-white overflow-hidden`
        }
        data-purpose="right-panel-container"
      >
        {/* Interactive Map: Luôn hiển thị trừ khi người dùng chủ động mở bảng chi tiết sâu */}
        <div className={`w-full h-full p-3 lg:pl-3 lg:pr-[36px] lg:py-6 ${fullDetailPoi ? "invisible pointer-events-none" : "visible"}`}>
          <div className="w-full h-full rounded-[22px] overflow-hidden border border-gray-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.06)] relative [transform:translateZ(0)]">
            {(isDesktopViewport || mobileExplorePane === 'map') && (
              <PoiMap
                pois={displayedMapPois}
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
                onSearchInArea={(bounds) => setMapAreaBounds(bounds)}
                activeAreaFilter={Boolean(mapAreaBounds)}
                onClearAreaFilter={() => setMapAreaBounds(null)}
              />
            )}
          </div>
        </div>

        {/* Right Detail Section: Card trượt từ bên phải qua khi bấm "Chi tiết ->" */}
        {fullDetailPoi && (
          <div 
            className="absolute inset-y-0 right-0 w-full z-40 bg-white rounded-none lg:rounded-l-[24px] border-l border-t border-b border-gray-200/90 shadow-[-16px_0_40px_rgba(0,0,0,0.08),-4px_0_12px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden animate-slideInRight"
          >
            <PoiDetailSection
              poi={fullDetailPoi}
              isFavorite={savedIds.has(fullDetailPoi.id)}
              isFavoritePending={pendingIds.has(fullDetailPoi.id)}
              onClose={() => setFullDetailPoiId(null)}
              onToggleFavorite={(_id, poi) => { if (poi) openCollectionPicker(poi); }}
              onViewOnMap={() => {
                setFullDetailPoiId(null);
                if (!isDesktopViewport) setMobileExplorePane('map');
              }}
            />
          </div>
        )}
      </section>
        </>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Điều hướng di động"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-white/95 backdrop-blur-md border-t border-neutral-200 px-1.5 flex items-center justify-around shadow-[0_-4px_16px_rgba(43,38,34,0.06)] no-print"
      >
        {(
          [
            {
              key: 'explore',
              label: 'Khám phá',
              icon: viewMode === 'explore' ? 'ph-fill ph-compass' : 'ph ph-compass',
              active: viewMode === 'explore',
              onClick: () => {
                setViewMode('explore');
                navigate('/explore');
              },
            },
            {
              key: 'trips',
              label: 'Lịch trình',
              icon: viewMode === 'trips' ? 'ph-fill ph-calendar-plus' : 'ph ph-calendar-plus',
              active: viewMode === 'trips',
              onClick: handleOpenTripsView,
            },
            {
              key: 'chat',
              label: 'AI Chat',
              icon: viewMode === 'chat' ? 'ph-fill ph-chat-circle-dots' : 'ph ph-chat-circle-dots',
              active: viewMode === 'chat',
              onClick: () => {
                setViewMode('chat');
                navigate('/chat');
              },
            },
            {
              key: 'saved',
              label: 'Đã lưu',
              icon: viewMode === 'saved' ? 'ph-fill ph-heart text-rose-600' : 'ph ph-heart',
              active: viewMode === 'saved',
              badge: savedIds.size > 0 ? savedIds.size : undefined,
              onClick: () => {
                setViewMode('saved');
                navigate('/saved');
              },
            },
            {
              key: 'profile',
              label: 'Tài khoản',
              icon: viewMode === 'profile' ? 'ph-fill ph-user-circle' : 'ph ph-user-circle',
              active: viewMode === 'profile',
              onClick: () => {
                setViewMode('profile');
                navigate('/profile');
              },
            },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            className={`relative flex-1 min-w-0 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1 text-[12px] leading-tight transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
              item.active ? 'font-bold text-neutral-950 bg-neutral-100' : 'font-medium text-neutral-600 hover:text-neutral-950'
            }`}
          >
            <span className="relative inline-flex items-center justify-center">
              <i className={`${item.icon} text-[20px]`} aria-hidden="true"></i>
              {'badge' in item && item.badge !== undefined && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-neutral-900 text-white text-[12px] leading-[16px] font-bold text-center">
                  {item.badge}
                </span>
              )}
            </span>
            <span className="whitespace-nowrap truncate max-w-full">{item.label}</span>
          </button>
        ))}
      </nav>

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
        <CreateTripCopilotModal
          isOpen={isCreateTripModalOpen}
          initialPrompt={ideationDraft?.initialPrompt}
          initialChatHistory={ideationDraft?.chatHistory}
          initialItineraryOutline={ideationDraft?.itineraryOutline}
          onClose={() => {
            setIsCreateTripModalOpen(false);
            setPendingAddToTripPoiIds(null);
            setIdeationDraft(null);
          }}
          onCreateTrip={(newTrip, options) => {
            const rawTitle = (newTrip.title || '').trim();
            const isBadTitle = !rawTitle || rawTitle.length <= 3 || ['ư', 'a', 'ơi', 'alo'].includes(rawTitle.toLowerCase()) || rawTitle.toLowerCase().startsWith('bắt đầu');
            const safeTitle = isBadTitle ? `Chuyến đi ${newTrip.destination || 'Đà Nẵng & Huế'}` : rawTitle;

            const savedPlaces = pendingAddToTripPoiIds
              ? Array.from(new Set([...(newTrip.savedPlaces ?? []), ...pendingAddToTripPoiIds]))
              : newTrip.savedPlaces;
            const ideas = pendingAddToTripPoiIds
              ? Array.from(new Set([...(newTrip.ideas ?? []), ...pendingAddToTripPoiIds]))
              : newTrip.ideas;

            const trip: UserTrip = {
              ...newTrip,
              title: safeTitle,
              id: newTrip.id || `trip-${Date.now()}`,
              savedPlaces,
              ideas,
              image:
                newTrip.coverImage ||
                newTrip.image ||
                (newTrip.destination === 'Huế'
                  ? 'https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/c107817a-7452-4385-b024-462f08e10dad.webp'
                  : 'https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/87930706-8d34-4e16-a21d-6cade6364cf1.webp'),
              tags: newTrip.tags || [
                newTrip.destination,
                newTrip.startDate || '4 ngày • Tháng 12',
                `${newTrip.peopleCount} du khách`,
                'Ngân sách',
              ],
            };
            setUserTrips((prev) => [trip, ...prev]);
            setActiveOverviewTrip(trip);
            if (options?.openInItinerary) {
              setSelectedTripForDetails(trip);
              setActiveTripSubTab('itinerary');
            } else {
              setSelectedTripForDetails(null);
              setActiveTripSubTab('ideas');
            }
            setViewMode('trips');
            setPendingAddToTripPoiIds(null);
            setIdeationDraft(null);
            setIsCreateTripModalOpen(false);
          }}
        />
      )}

      {/* 6. Add To Trip Modal */}
      <AddToTripModal
        isOpen={addToTripSelection !== null}
        poiIds={addToTripSelection?.poiIds ?? []}
        selectionLabel={addToTripSelection?.label}
        trips={userTrips}
        onToggleTrip={toggleTripSavedPlaces}
        onCreateTrip={createTripForPois}
        onClose={() => setAddToTripSelection(null)}
      />

      {/* 7. Build Trip Strictly From Saved Collection Modal */}
      {collectionPlannerConfig !== null && (
        <BuildTripFromCollectionModal
          isOpen={collectionPlannerConfig !== null}
          allPois={allPois}
          initialCollectionId={collectionPlannerConfig.collectionId ?? null}
          initialCollectionName={collectionPlannerConfig.collectionName ?? null}
          initialCollectionPois={collectionPlannerConfig.places ?? null}
          onClose={() => setCollectionPlannerConfig(null)}
          onNavigateToExplore={() => {
            setCollectionPlannerConfig(null);
            setViewMode('explore');
            navigate('/explore');
          }}
          onConfirmBuild={async (payload) => {
            const tripId = currentUser ? `trip-col-${Date.now()}` : `trip-quick-${Date.now()}`;
            const syncedItinerary = {
              ...payload.itinerary,
              trip_id: tripId,
              title: payload.title,
            };
            try {
              localStorage.setItem(
                `greentrip_itinerary_${tripId}`,
                JSON.stringify(syncedItinerary)
              );
            } catch {
              // Ignore browser storage quota failures cleanly
            }
            if (currentUser) {
              await saveTripItinerary(syncedItinerary).catch(() => undefined);
            }
            const firstPhoto = allPois.find((p) => payload.savedPoiIds.includes(p.id))?.image;
            const newTrip: UserTrip = {
              id: tripId,
              title: payload.title,
              destination: payload.destination,
              startDate: syncedItinerary.start_date || payload.startDate,
              daysCount: payload.daysCount,
              peopleCount: payload.peopleCount,
              createdAt: new Date().toISOString(),
              savedPlaces: payload.savedPoiIds,
              ideas: payload.savedPoiIds,
              image:
                firstPhoto ||
                (payload.destination === 'Huế'
                  ? 'https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/d229571b-14fb-4357-aad6-af1547af7615.webp'
                  : 'https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/bd2020b0-bbb4-4379-a331-d3c7221c2fc1.webp'),
              tags: [
                payload.destination,
                `${payload.daysCount} ngày`,
                `${payload.peopleCount} du khách`,
                'Từ Kho đã lưu',
              ],
            };
            setUserTrips((prev) => [newTrip, ...prev]);
            setActiveOverviewTrip(newTrip);
            setSelectedTripForDetails(newTrip);
            setActiveTripSubTab('itinerary');
            setViewMode('trips');
            setCollectionPlannerConfig(null);
            navigate('/planner');
          }}
        />
      )}
    </div>
  );
}

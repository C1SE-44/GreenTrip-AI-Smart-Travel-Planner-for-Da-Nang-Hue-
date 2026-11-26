import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  RefreshCw,
  Car,
  MoreHorizontal,
  MessageCircle,
  Eraser,
  FileText,
  Pencil,
  Lightbulb,
  ExternalLink,
  MapPin,
  AlertTriangle,
  Route as RouteIcon,
  Bike,
  Bus,
  Footprints,
  CloudRain,
  RotateCcw,
  Share2,
  Sparkles,
  Briefcase,
} from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import { rankPoisForYou } from '@/components/explore/exploreUtils';
import {
  fetchPoiRecommendations,
  type RecommendationBudgetTier,
  type RecommendationRequest,
  type RecommendedPoiRecord,
} from '@/services/recommendations';
import {
  uniqueTripRecommendationPois,
  updateTripIdeaIds,
  type TripIdeaSelectionAction,
} from './tripIdeaSelection';
import {
  type Poi,
  type PoiCategory,
  type PoiCity,
  evaluateLocalAuthentic,
  getDeterministicImage,
  normalizeCategory,
  normalizeCity,
  normalizePoi,
  normalizePois,
} from '@/data/pois';
import { getPoisByIds } from '@/services/poi';
import { useSavedPlaces } from '@/context/SavedPlacesContext';
import { TripExportToolbar } from '@/components/planner/EcoPackingChecklistModal';
import CentralVietnamAdvisoryBanner from '@/components/planner/CentralVietnamAdvisoryBanner';
import { evaluateCentralVietnamAdvisories } from '@/utils/centralVietnamAdvisories';
import {
  createEmptyItinerary,
  buildItineraryFromOutline,
  hydrateItineraryWithPois,
  matchPoiForStop,
  getTripItinerary,
  saveTripItinerary,
  stopFromPoi,
  alignItineraryToTrip,
  normalizeLegacyLunchBreaks,
  distanceKm,
  minutesFromTime,
  findRestSlot,
  insertRestInOrder,
  updateDateRangeWithDays,
  getRoutePositionsForStops,
  calculateStopsPathKm,
  optimizeDayRouteOrder,
  optimizeItineraryRouteOrder,
  estimateCarbonFootprint,
  formatCarbonAmount,
  checkStopOpeningHours,
  isPoiOutdoor,
  suggestIndoorAlternativesForDay,
  suggestNearbyAlternativesForStop,
  getStopShortReason,
  computeTripBudgetSummary,
  computeDayFatigue,
  clearOverlappingVisitTimes,
  dailyVisitCapacity,
  pacingForTrip,
  selectAutomaticPois,
  optimizeDays,
  buildFallbackRoadCorridor,
  type RouteTransportMode,
  type TripItinerary,
  type ItineraryDay,
  type ItineraryStop,
} from '@/services/itineraryService';
import {
  getPoiImage,
  getPoiVisitDurationMinutes,
  getGoogleMapsDirectionsUrl,
  displayDateVi,
  formatTripDateRange,
} from './tripItineraryUtils';
import ItineraryCarbonBudgetPanel from './ItineraryCarbonBudgetPanel';
import ItineraryMapPanel from './ItineraryMapPanel';
import ItineraryAddPlacesModal from './ItineraryAddPlacesModal';
import TripDayEditorModal from './TripDayEditorModal';
import ExpiredTripBanner from './ExpiredTripBanner';
import TripHeader from './TripHeader';
import { TripWhereModal, TripWhenModal, TripWhoModal } from './TripParameterModals';
import TripBudgetModal from './TripBudgetModal';
import TripPreferencesModal from './TripPreferencesModal';
import { parseCategoryBudgets, type CategoryBudgets } from './tripOverviewConstants';
import { dateAt, tripStartDate, vietnamNow } from '@/utils/tripDates';
import PoiImage from '@/components/ui/PoiImage';
import ExplanationModal from '@/components/poi/ExplanationModal';
import PoiDetailSection from '@/components/poi/PoiDetailSection';
import type { RecommendationScoreBreakdown } from '@/services/recommendations';
import type { ValidatedTripData } from '@/services/tripService';
import RecommendationPoiCard from './RecommendationPoiCard';
import PlannerTripPanel from './PlannerTripPanel';
import {
  addSubmittedTripSearch,
  addViewedTripPoi,
  hasTripRecommendationSignals,
  rankTripRelatedPois,
  readTripRecommendationSignals,
  saveTripRecommendationSignals,
  type TripRecommendationSignals,
} from './tripRelatedRecommendations';

export type PlannerRecommendationPoi = Poi & {
  recommendationScoreBreakdown?: RecommendationScoreBreakdown | null;
  recommendationEstimatedCost?: number | null;
  recommendationExplanationSnippet?: string | null;
};

interface FetchedRecommendationPage {
  contextKey: string;
  pois: PlannerRecommendationPoi[];
}

interface RecommendationPageInfo {
  contextKey: string;
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
  snapshotId: string;
}

function mapRecommendationRecords(
  records: RecommendedPoiRecord[],
  allPois: Poi[],
  fallbackDestination: string,
): PlannerRecommendationPoi[] {
  return records.flatMap((item, index): PlannerRecommendationPoi[] => {
    const name = item.name?.trim();
    if (!name) return [];
    const found = allPois.find((poi) => poi.id === String(item.poi_id));
    const lat = typeof item.lat === 'number' ? item.lat : found?.lat;
    const lng = typeof item.lng === 'number' ? item.lng : found?.lng;
    if (lat == null || lng == null) return [];
    const category = found?.category || normalizeCategory(item.category_name);
    const city = found?.city || normalizeCity(item.city || fallbackDestination);
    const greenScore = item.green_score == null
      ? found?.ecoScore ?? 85
      : Math.round(item.green_score <= 1 ? item.green_score * 100 : item.green_score);
    return [{
      ...(found || {}),
      id: found?.id || String(item.poi_id || `recommended-${index}`),
      name,
      city,
      category,
      lat,
      lng,
      image: item.image || found?.image || getDeterministicImage(name, item.poi_id || index, category, city),
      imageSourceAvailable: Boolean(item.image?.trim()) || found?.imageSourceAvailable === true,
      description: found?.description || item.explanation_snippet || 'Địa điểm được gợi ý cho chuyến đi của bạn.',
      rating: item.satisfaction_score ?? found?.rating ?? 4.5,
      matchScore: item.match_score == null ? found?.matchScore : Math.round(item.match_score),
      estimatedCost: item.estimated_cost ?? found?.estimatedCost ?? null,
      isGreen: item.is_green ?? found?.isGreen ?? false,
      ecoScore: greenScore,
      visitDuration: found?.visitDuration || '1–2 giờ',
      recommendationScoreBreakdown: item.score_breakdown,
      recommendationEstimatedCost: item.estimated_cost,
      recommendationExplanationSnippet: item.explanation_snippet,
    }];
  });
}

function normalizeRecommendationBudgetTier(value?: string): RecommendationBudgetTier | undefined {
  if (value === 'any' || value === 'budget' || value === 'standard' || value === 'upgrade' || value === 'luxury') {
    return value;
  }
  return undefined;
}

function categoryBudgetToRecommendationTier(value: string): ValidatedTripData['budget_tier'] | undefined {
  if (value === '$') return 'budget';
  if (value === '$$') return 'standard';
  if (value === '$$$') return 'luxury';
  return undefined;
}

function withUpdatedRecommendationData(trip: UserTrip, categoryBudgets?: CategoryBudgets): UserTrip {
  const previous = trip.recommendationTripData;
  if (!previous) return trip;

  const days = Math.max(1, trip.daysCount || previous.days);
  const people = Math.max(1, trip.peopleCount || previous.num_people);
  const tier = previous.budget_tier;
  const tierDailyAmount = tier === 'budget' ? 500_000 : tier === 'luxury' ? 3_000_000 : 1_200_000;
  const totalBudget = trip.totalBudget ?? tierDailyAmount * days * people;
  const categoryTier = categoryBudgets
    ? categoryBudgetToRecommendationTier(
        categoryBudgets.activities !== 'any' ? categoryBudgets.activities : categoryBudgets.dining,
      )
    : undefined;
  const startDate = tripStartDate(trip.startDate);
  const minBudget = 200_000 * days * people;

  return {
    ...trip,
    recommendationTripData: {
      ...previous,
      destination: trip.destination,
      days,
      num_people: people,
      total_budget: totalBudget,
      daily_budget_per_person: totalBudget / (days * people),
      budget_tier: categoryTier ?? tier,
      preferences: trip.preferences ?? [],
      start_date: startDate,
      end_date: startDate ? dateAt(startDate, days - 1) : null,
      min_recommended_budget: minBudget,
      is_budget_sufficient: totalBudget >= minBudget,
      budget_warning: totalBudget >= minBudget ? null : `Ngân sách thấp hơn mức tham khảo ${minBudget.toLocaleString('vi-VN')} VNĐ.`,
    },
  };
}

function poiMatchesDestination(poi: Poi, destination: string): boolean {
  const includesDaNang = /đà\s*nẵng|da\s*nang/i.test(destination);
  const includesHue = /huế|hue/i.test(destination);
  const inDaNang = /đà\s*nẵng|da\s*nang/i.test(poi.city);
  const inHue = /huế|hue/i.test(poi.city);
  return (!includesDaNang && !includesHue) || (includesDaNang && inDaNang) || (includesHue && inHue);
}

export interface TripItineraryViewProps {
  trip: UserTrip;
  allPois?: Poi[];
  recommendations?: Poi[];
  recommendationsLoading?: boolean;
  onBack: () => void;
  onUpdateTrip?: (updatedTrip: UserTrip) => void;
  onPersistTripMetadata?: (
    updatedTrip: UserTrip,
    options?: { itineraryAlreadySaved?: boolean },
  ) => Promise<void>;
  isDrawerMode?: boolean;
  onClose?: () => void;
  initialFocus?: 'ideas' | 'itinerary';
  activeTab?: 'ideas' | 'itinerary';
  onOpenCopilot?: (plan: TripItinerary) => void;
  externalCopilotPlan?: TripItinerary | null;
  onExternalCopilotPlanConsumed?: (plan: TripItinerary) => void;
  onNavigateToCalendar?: () => void;
  onNavigateToTab?: (tab: 'ideas' | 'itinerary' | 'calendar') => void;
}

export default function TripItineraryView({
  trip,
  allPois = [],
  recommendations,
  recommendationsLoading = false,
  onBack,
  onUpdateTrip,
  onPersistTripMetadata,
  isDrawerMode = false,
  onClose,
  initialFocus,
  activeTab = 'itinerary',
  onOpenCopilot,
  externalCopilotPlan,
  onExternalCopilotPlanConsumed,
  onNavigateToCalendar,
  onNavigateToTab,
}: TripItineraryViewProps) {
  // ─── 0. Hệ thống địa điểm đã lưu (Favorites / Đã thích) của Thiện ───
  const navigate = useNavigate();
  const { savedIds, pendingIds, openCollectionPicker, places } = useSavedPlaces();

  // Đếm số lượng địa điểm đã thích từ hệ thống Đã lưu
  const savedCount = useMemo(() => {
    let count = savedIds.size;
    try {
      const rawFav = localStorage.getItem('greentrip_favorites');
      if (rawFav) {
        const parsed = JSON.parse(rawFav) as string[];
        count = Math.max(count, parsed.length);
      }
    } catch {
      // ignore parsing errors
    }
    return count;
  }, [savedIds]);

  // ─── 1. Quản lý trạng thái Lịch trình (TripItinerary Plan) ───
  const [plan, setPlan] = useState<TripItinerary>(() => createEmptyItinerary(trip));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSchedulePreview, setIsSchedulePreview] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [saveErrorAction, setSaveErrorAction] = useState<'retry' | 'repair' | null>(null);

  // Tham chiếu tự động lưu
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersion = useRef(0);
  const latestPlan = useRef(plan);
  const savedPlan = useRef(createEmptyItinerary(trip));
  const previewBasePlan = useRef<TripItinerary | null>(null);
  const isSchedulePreviewRef = useRef(false);
  const currentTrip = useRef(trip);
  currentTrip.current = trip;
  const latestAllPois = useRef(allPois);
  latestAllPois.current = allPois;

  // ─── 2. Quản lý Ý tưởng (Ideas List) ───
  const [tripIdeas, setTripIdeas] = useState<string[]>(() => {
    if (Array.isArray(trip.ideas)) return trip.ideas;
    return [];
  });
  // Keep the latest selection available to another click before React commits this render.
  const tripIdeasRef = useRef(tripIdeas);
  const [tripRecommendationSession, setTripRecommendationSession] = useState<{
    tripId: string;
    signals: TripRecommendationSignals;
  }>(() => ({ tripId: trip.id, signals: readTripRecommendationSignals(trip.id) }));
  const [fetchedRecommendationPage, setFetchedRecommendationPage] = useState<FetchedRecommendationPage>({
    contextKey: '',
    pois: [],
  });
  const [recommendationPageInfo, setRecommendationPageInfo] = useState<RecommendationPageInfo | null>(null);
  const [isFetchingRecommendations, setIsFetchingRecommendations] = useState(false);
  const [isFetchingMoreRecommendations, setIsFetchingMoreRecommendations] = useState(false);
  const [recommendationFetchError, setRecommendationFetchError] = useState(false);
  const [recommendationMoreError, setRecommendationMoreError] = useState(false);
  const [recommendationRefreshNotice, setRecommendationRefreshNotice] = useState('');
  const [hasAttemptedRecommendations, setHasAttemptedRecommendations] = useState(false);
  const [recommendationRetryKey, setRecommendationRetryKey] = useState(0);
  const [explanationPoi, setExplanationPoi] = useState<PlannerRecommendationPoi | null>(null);
  const [selectedDetailPoiId, setSelectedDetailPoiId] = useState<string | null>(null);
  const [detailPoiLookup, setDetailPoiLookup] = useState<{
    poiId: string;
    status: 'loading' | 'ready' | 'not_found' | 'error';
    poi: Poi | null;
  } | null>(null);
  const [detailRetryKey, setDetailRetryKey] = useState(0);
  const detailRequestVersionRef = useRef(0);
  const detailReturnFocusRef = useRef<HTMLElement | null>(null);
  const detailDialogRef = useRef<HTMLDivElement | null>(null);
  const [isMobileDetailViewport, setIsMobileDetailViewport] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false,
  );
  const [pacingOverride, setPacingOverride] = useState<'Relaxed' | 'Balanced' | 'Fast' | null>(null);
  const [assistantInsight, setAssistantInsight] = useState('');
  const [dismissedRecommendationIds, setDismissedRecommendationIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(`greentrip_dismissed_recommendations_${trip.id}`);
      return stored ? JSON.parse(stored) as string[] : [];
    } catch {
      return [];
    }
  });
  const recommendationRequestVersionRef = useRef(0);
  const isFetchingMoreRecommendationsRef = useRef(false);
  const recommendationMoreAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setTripRecommendationSession({
      tripId: trip.id,
      signals: readTripRecommendationSignals(trip.id),
    });
  }, [trip.id]);

  const updateTripRecommendationSignals = useCallback((
    update: (current: TripRecommendationSignals) => TripRecommendationSignals,
  ) => {
    const currentSignals = tripRecommendationSession.tripId === trip.id
      ? tripRecommendationSession.signals
      : readTripRecommendationSignals(trip.id);
    const signals = update(currentSignals);
    saveTripRecommendationSignals(trip.id, signals);
    setTripRecommendationSession({ tripId: trip.id, signals });
  }, [trip.id, tripRecommendationSession]);

  const recordTripSearch = useCallback((query: string) => {
    updateTripRecommendationSignals((current) => addSubmittedTripSearch(current, query));
  }, [updateTripRecommendationSignals]);

  const recordViewedTripPoi = useCallback((poiId: string) => {
    updateTripRecommendationSignals((current) => addViewedTripPoi(current, poiId));
  }, [updateTripRecommendationSignals]);

  const openPoiDetail = useCallback((poiId: string, trigger?: HTMLElement) => {
    if (trigger) detailReturnFocusRef.current = trigger;
    setSelectedDetailPoiId(poiId);
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
  }, []);

  const closePoiDetail = useCallback(() => {
    setSelectedDetailPoiId(null);
    window.requestAnimationFrame(() => {
      detailReturnFocusRef.current?.focus();
      detailReturnFocusRef.current = null;
      window.dispatchEvent(new Event('resize'));
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 767px)');
    const updateViewport = (event: MediaQueryList | MediaQueryListEvent) => {
      setIsMobileDetailViewport(event.matches);
    };
    updateViewport(media);
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    if (!selectedDetailPoiId) {
      detailRequestVersionRef.current += 1;
      setDetailPoiLookup(null);
      return;
    }

    const requestVersion = ++detailRequestVersionRef.current;
    const fromCurrentCatalogue = allPois.find((poi) => poi.id === selectedDetailPoiId && poi.detailEvidence);
    if (fromCurrentCatalogue) {
      setDetailPoiLookup({ poiId: selectedDetailPoiId, status: 'ready', poi: fromCurrentCatalogue });
      return () => {
        if (detailRequestVersionRef.current === requestVersion) detailRequestVersionRef.current += 1;
      };
    }

    setDetailPoiLookup({ poiId: selectedDetailPoiId, status: 'loading', poi: null });
    void getPoisByIds([selectedDetailPoiId]).then((records) => {
      if (detailRequestVersionRef.current !== requestVersion) return;
      const fullPoi = normalizePois(records).find((poi) => poi.id === selectedDetailPoiId) ?? null;
      setDetailPoiLookup({
        poiId: selectedDetailPoiId,
        status: fullPoi ? 'ready' : 'not_found',
        poi: fullPoi,
      });
    }).catch(() => {
      if (detailRequestVersionRef.current !== requestVersion) return;
      setDetailPoiLookup({ poiId: selectedDetailPoiId, status: 'error', poi: null });
    });

    return () => {
      if (detailRequestVersionRef.current === requestVersion) detailRequestVersionRef.current += 1;
    };
  }, [allPois, detailRetryKey, selectedDetailPoiId]);

  const activeDetailLookup = selectedDetailPoiId
    ? detailPoiLookup?.poiId === selectedDetailPoiId
      ? detailPoiLookup
      : { poiId: selectedDetailPoiId, status: 'loading' as const, poi: null }
    : null;

  const handleDetailPanelKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePoiDetail();
      return;
    }
    if (!isMobileDetailViewport || event.key !== 'Tab' || !detailDialogRef.current) return;

    const focusable = Array.from(detailDialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (focusable.length === 0) {
      event.preventDefault();
      detailDialogRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [closePoiDetail, isMobileDetailViewport]);

  useEffect(() => {
    if (!selectedDetailPoiId) return;
    const focusFrame = window.requestAnimationFrame(() => detailDialogRef.current?.focus());
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !explanationPoi) closePoiDetail();
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onEscape);
    };
  }, [closePoiDetail, explanationPoi, selectedDetailPoiId]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`greentrip_dismissed_recommendations_${trip.id}`);
      setDismissedRecommendationIds(stored ? JSON.parse(stored) as string[] : []);
    } catch {
      setDismissedRecommendationIds([]);
    }
  }, [trip.id]);

  useEffect(() => {
    try {
      localStorage.setItem(`greentrip_dismissed_recommendations_${trip.id}`, JSON.stringify(dismissedRecommendationIds));
    } catch {
      // Keep this preference best-effort when browser storage is unavailable.
    }
  }, [dismissedRecommendationIds, trip.id]);

  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());
  const [showDistances, setShowDistances] = useState(true);
  const [preferLocalAuthentic, setPreferLocalAuthentic] = useState(false);
  const [isChecklistModalOpen, setIsChecklistModalOpen] = useState(false);
  const [transportMode, setTransportMode] = useState<RouteTransportMode>('motorcycle');
  const [optimizeFeedback, setOptimizeFeedback] = useState<string | null>(null);
  const [showGuestSyncPrompt, setShowGuestSyncPrompt] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [rainSwapBackup, setRainSwapBackup] = useState<{
    dayNumber: number;
    previousStops: ItineraryStop[];
    message: string;
  } | null>(null);
  const [nearbyPickerTarget, setNearbyPickerTarget] = useState<{
    dayNumber: number;
    stopId: string;
  } | null>(null);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [ideasRightPanelMode, setIdeasRightPanelMode] = useState<'map' | 'trip'>('map');
  const [tripPanelSection, setTripPanelSection] = useState<'ideas' | 'itinerary'>('ideas');
  const [showCustomSettings, setShowCustomSettings] = useState(false);
  const [headerModal, setHeaderModal] = useState<'where' | 'when' | 'who' | 'budget' | 'preferences' | null>(null);
  const [whereDraft, setWhereDraft] = useState(trip.destination);
  const [byCarDraft, setByCarDraft] = useState(false);
  const [whenTabDraft, setWhenTabDraft] = useState<'dates' | 'flex'>('flex');
  const [rangeStartDraft, setRangeStartDraft] = useState<Date | null>(null);
  const [rangeEndDraft, setRangeEndDraft] = useState<Date | null>(null);
  const [flexibleDaysDraft, setFlexibleDaysDraft] = useState(trip.daysCount || 4);
  const [selectedMonthDraft, setSelectedMonthDraft] = useState(trip.flexibleMonth || 'Tháng 11');
  const [peopleDraft, setPeopleDraft] = useState(trip.peopleCount || 2);
  const [childrenDraft, setChildrenDraft] = useState(0);
  const [infantsDraft, setInfantsDraft] = useState(0);
  const [petsDraft, setPetsDraft] = useState(0);
  const [categoryBudgetDraft, setCategoryBudgetDraft] = useState<CategoryBudgets>(() => parseCategoryBudgets(trip.budgetTier));
  const [totalBudgetDraft, setTotalBudgetDraft] = useState<number | null>(trip.totalBudget ?? null);
  const [preferencesDraft, setPreferencesDraft] = useState<string[]>(trip.preferences ?? []);
  const [preferenceTextDraft, setPreferenceTextDraft] = useState(trip.preferenceText ?? '');
  const [isSavingTripMetadata, setIsSavingTripMetadata] = useState(false);
  const [tripMetadataError, setTripMetadataError] = useState('');
  const [pendingTripMetadata, setPendingTripMetadata] = useState<UserTrip | null>(null);
  const recommendationTrip = pendingTripMetadata ?? trip;
  const recommendationRequest = useMemo<RecommendationRequest>(() => {
    const preferenceText = recommendationTrip.preferenceText?.trim();
    const interests = Array.from(new Set([
      ...(recommendationTrip.preferences ?? []),
      ...(preferenceText ? [preferenceText] : []),
    ]));
    const budgetTier = recommendationTrip.recommendationTripData?.budget_tier
      ?? normalizeRecommendationBudgetTier(recommendationTrip.budgetTier);
    return {
      destination: recommendationTrip.destination || 'Đà Nẵng & Huế',
      interests,
      ...(budgetTier ? { budget_tier: budgetTier } : {}),
      trip_days: recommendationTrip.daysCount || plan.days.length,
      top_k: 10,
      offset: 0,
      trip_data: recommendationTrip.recommendationTripData,
    };
  }, [
    plan.days.length,
    recommendationTrip.budgetTier,
    recommendationTrip.daysCount,
    recommendationTrip.destination,
    recommendationTrip.preferenceText,
    recommendationTrip.preferences,
    recommendationTrip.recommendationTripData,
  ]);
  const recommendationContextKey = JSON.stringify({ tripId: trip.id, request: recommendationRequest });
  const recommendationContextKeyRef = useRef(recommendationContextKey);
  recommendationContextKeyRef.current = recommendationContextKey;

  // Bộ lọc xem ngày nổi trên Bản đồ (đặt góc trên bên phải)
  const [mapDayFilter, setMapDayFilter] = useState<number | 'all'>(1);

  // Thao tác nhanh cho từng thẻ Ideas & Ngày
  const recommendationsSectionRef = useRef<HTMLDivElement>(null);
  const itinerarySectionRef = useRef<HTMLDivElement>(null);
  const [activeMenuStopId, setActiveMenuStopId] = useState<string | null>(null);
  const [showItinerarySettingsMenu, setShowItinerarySettingsMenu] = useState(false);
  const [activeDayMenuNumber, setActiveDayMenuNumber] = useState<number | null>(null);
  const [dayEditor, setDayEditor] = useState<{ dayNumber: number; field: 'title' | 'note' } | null>(null);
  const [dayEditorValue, setDayEditorValue] = useState('');
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
  const [modalCategory, setModalCategory] = useState<string>('for-you');
  const [customIdeaInput, setCustomIdeaInput] = useState('');

  useEffect(() => {
    if (activeDayMenuNumber === null) return;
    const closeMenu = () => setActiveDayMenuNumber(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [activeDayMenuNumber]);

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

  const poiById = useMemo(() => new Map(allPois.map((poi) => [poi.id, poi])), [allPois]);

  // ─── 3. Đồng bộ danh sách POI từ `tripIdeas` ───
  const ideaPois = useMemo(() => {
    const resolved = tripIdeas
      .map((id) => {
        const found = poiById.get(id)
          ?? allPois.find((poi) => poi.name.toLocaleLowerCase('vi-VN') === id.toLocaleLowerCase('vi-VN'));
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
        return null;
      })
      .filter((p): p is Poi => p !== null);
    return Array.from(new Map(resolved.map((poi) => [poi.id, poi])).values());
  }, [tripIdeas, allPois, poiById, trip.destination]);

  const fetchedRecommendations = fetchedRecommendationPage.contextKey === recommendationContextKey
    ? fetchedRecommendationPage.pois
    : [];
  const recommendationResults: PlannerRecommendationPoi[] = recommendations ?? fetchedRecommendations;
  const currentRecommendationPage = recommendationPageInfo?.contextKey === recommendationContextKey
    ? recommendationPageInfo
    : null;
  const recommendationHasMore = recommendations === undefined && currentRecommendationPage?.hasMore === true;
  const tripRecommendationSignals = tripRecommendationSession.tripId === trip.id
    ? tripRecommendationSession.signals
    : { submittedSearches: [], viewedPoiIds: [] };
  const hasForYouSignals = hasTripRecommendationSignals(
    tripRecommendationSignals,
    ideaPois.length,
  );
  const forYouSignalSources = [
    ideaPois.length > 0 ? 'POI bạn đã thêm' : '',
    tripRecommendationSignals.viewedPoiIds.length > 0 ? 'POI bạn đã mở' : '',
    tripRecommendationSignals.submittedSearches.length > 0 ? 'từ khóa tìm kiếm đã gửi' : '',
  ].filter(Boolean);
  const forYouDescription = forYouSignalSources.length > 0
    ? `Dựa trên ${forYouSignalSources.join(', ')} trong chuyến đi này.`
    : 'Tìm kiếm, mở hoặc thêm địa điểm để nhận gợi ý liên quan cho chuyến đi này.';
  const forYouPois = useMemo(() => {
    const destination = trip.destination || '';
    const includesDaNang = /đà\s*nẵng|da\s*nang/i.test(destination);
    const includesHue = /huế|hue/i.test(destination);
    const inDestination = allPois.filter((poi) =>
      (!includesDaNang && !includesHue)
      || (includesDaNang && /đà\s*nẵng|da\s*nang/i.test(poi.city))
      || (includesHue && /huế|hue/i.test(poi.city)),
    );
    const excludedNames = new Set([
      ...ideaPois.map((poi) => poi.name),
      ...recommendationResults.map((poi) => poi.name),
    ].map((name) => name.trim().toLocaleLowerCase('vi-VN')));
    const excludedIds = new Set([
      ...ideaPois.map((poi) => poi.id),
      ...recommendationResults.map((poi) => poi.id),
      ...tripRecommendationSignals.viewedPoiIds,
    ]);
    const candidates = inDestination.filter((poi) => !excludedIds.has(poi.id)
      && !excludedNames.has(poi.name.trim().toLocaleLowerCase('vi-VN')));
    const selectedPoiIds = new Set(ideaPois.map((poi) => poi.id));
    const baseline = rankPoisForYou(candidates, allPois, selectedPoiIds);
    return rankTripRelatedPois(
      baseline,
      allPois,
      selectedPoiIds,
      new Set(tripRecommendationSignals.viewedPoiIds),
      tripRecommendationSignals.submittedSearches,
    );
  }, [allPois, ideaPois, recommendationResults, trip.destination, tripRecommendationSignals]);
  const ideasMapPois = useMemo(() => {
    const byId = new Map<string, Poi>();
    [...ideaPois, ...recommendationResults, ...forYouPois.map((item) => item.poi)].forEach((poi) => {
      if (Number.isFinite(poi.lat) && Number.isFinite(poi.lng)) byId.set(poi.id, poi);
    });
    return Array.from(byId.values());
  }, [ideaPois, recommendationResults, forYouPois]);
  const hasScheduledStops = plan.days.some((day) => day.stops.some((stop) => stop.stop_type !== 'rest'));
  const recommendationCards = useMemo(() => {
    return uniqueTripRecommendationPois(recommendationResults);
  }, [recommendationResults]);
  const selectedTripPoiIds = useMemo(() => new Set([
    ...tripIdeas,
    ...ideaPois.map((poi) => poi.id),
  ]), [ideaPois, tripIdeas]);
  const isScheduleRecommendationsLoading = recommendationsLoading
    || (recommendations === undefined && (isFetchingRecommendations || (!hasAttemptedRecommendations && allPois.length > 0)));
  const pacingLevel = pacingOverride || pacingForTrip(trip);

  // ─── 4. Tự động lưu và tải từ Backend / LocalStorage ───
  const persistPlan = useCallback(
    (nextPlan: TripItinerary) => {
      const version = ++saveVersion.current;
      latestPlan.current = nextPlan;
      setPlan(nextPlan);
      setHasUnsavedChanges(true);
      setErrorMessage('');
      setSaveErrorAction(null);

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (isSchedulePreviewRef.current) return;
      saveTimer.current = setTimeout(async () => {
        saveTimer.current = null;
        setIsSaving(true);
        try {
          const saved = await saveTripItinerary(nextPlan);
          if (version === saveVersion.current) {
            savedPlan.current = saved;
            setPlan((prev) => ({ ...prev, updated_at: saved.updated_at }));
            setHasUnsavedChanges(false);
          }
        } catch (cause) {
          if (version === saveVersion.current) {
            console.warn('Lỗi lưu lịch trình:', cause);
            const apiError = cause as { status?: number; detail?: string; message?: string };
            const isOverlap = apiError.status === 422 && /khung giờ bị trùng/i.test(apiError.detail || '');
            setErrorMessage(isOverlap
              ? apiError.detail || 'Một số hoạt động đang bị trùng giờ. Hãy chỉnh giờ hoặc dùng chức năng tự sửa.'
              : apiError.status === 401
                ? 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để đồng bộ lịch.'
                : apiError.status === 403
                  ? 'Tài khoản hiện tại không có quyền sửa lịch trình này.'
                  : `Không đồng bộ được lịch với máy chủ. Thay đổi còn trên trang này${apiError.message ? `: ${apiError.message}` : '.'}`);
            setSaveErrorAction(isOverlap ? 'repair' : 'retry');
          }
        } finally {
          if (version === saveVersion.current) setIsSaving(false);
        }
      }, 350);
    },
    []
  );

  const persistTripMetadata = async (
    updatedTrip: UserTrip,
    itineraryAlreadySaved = false,
  ) => {
    if (onPersistTripMetadata) {
      await onPersistTripMetadata(updatedTrip, { itineraryAlreadySaved });
      return;
    }
    onUpdateTrip?.(updatedTrip);
  };

  const closeTripMetadataModal = () => {
    setHeaderModal(null);
    setTripMetadataError('');
  };

  const openTripMetadataModal = (modal: NonNullable<typeof headerModal>) => {
    const start = tripStartDate(trip.startDate);
    const startDate = start ? new Date(`${start}T12:00:00`) : null;
    const days = trip.daysCount || 4;
    setWhereDraft(trip.destination || 'Đà Nẵng & Huế');
    setByCarDraft(false);
    setWhenTabDraft(startDate ? 'dates' : 'flex');
    setRangeStartDraft(startDate);
    setRangeEndDraft(start ? new Date(`${dateAt(start, days - 1)}T12:00:00`) : null);
    setFlexibleDaysDraft(days);
    setSelectedMonthDraft(trip.flexibleMonth || (startDate ? `Tháng ${startDate.getMonth() + 1}` : 'Tháng 11'));
    setPeopleDraft(trip.peopleCount || 2);
    setChildrenDraft(0);
    setInfantsDraft(0);
    setPetsDraft(0);
    setCategoryBudgetDraft(parseCategoryBudgets(trip.budgetTier));
    setTotalBudgetDraft(trip.totalBudget ?? null);
    setPreferencesDraft(trip.preferences ?? []);
    setPreferenceTextDraft(trip.preferenceText ?? '');
    setTripMetadataError('');
    setHeaderModal(modal);
  };

  const commitTripMetadata = async (nextTrip: UserTrip, categories?: CategoryBudgets) => {
    const scheduleInputsChanged = nextTrip.destination !== trip.destination
      || nextTrip.daysCount !== trip.daysCount
      || nextTrip.startDate !== trip.startDate;

    if (hasScheduledStops && scheduleInputsChanged) {
      if (!isSchedulePreviewRef.current) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = null;
        saveVersion.current += 1;
        previewBasePlan.current = plan;
        isSchedulePreviewRef.current = true;
        setIsSchedulePreview(true);
      }

      const overrides = { ...(nextTrip.localMetadataOverrides ?? {}) };
      delete overrides.daysCount;
      if (nextTrip.startDate && !tripStartDate(nextTrip.startDate)) {
        overrides.startDate = nextTrip.startDate;
      } else {
        delete overrides.startDate;
      }
      const targetTrip = withUpdatedRecommendationData({
        ...nextTrip,
        localMetadataOverrides: overrides,
      }, categories);
      const emptyPlan = createEmptyItinerary(targetTrip);
      const existingDays = [...plan.days].sort((a, b) => a.day_number - b.day_number);
      const baseDays = emptyPlan.days.map((day, index) => {
        const existing = existingDays[index];
        const preservedStops = existing?.stops.filter((stop) =>
          stop.stop_type === 'rest' || (!stop.poi_id && stop.stop_type !== 'custom' && stop.source === 'manual'),
        ) ?? [];
        return {
          ...day,
          day_id: existing?.day_id || day.day_id,
          title: existing?.title || day.title,
          note: existing?.note || day.note,
          stops: preservedStops,
        };
      });
      const selectedPois = new Map(ideaPois.map((poi) => [poi.id, poi]));
      plan.days.flatMap((day) => day.stops)
        .filter((stop) => Boolean(stop.poi_id))
        .forEach((stop) => {
          const poi = allPois.find((item) => item.id === stop.poi_id);
          if (poi) selectedPois.set(poi.id, poi);
        });
      const eligibleSelectedPois = Array.from(selectedPois.values())
        .filter((poi) => poiMatchesDestination(poi, targetTrip.destination));
      const previewPacing = pacingOverride || pacingForTrip(targetTrip);
      const capacity = dailyVisitCapacity(previewPacing);
      const selection = selectAutomaticPois(baseDays, eligibleSelectedPois, [], targetTrip, previewPacing, capacity);
      const scheduled = optimizeDays(baseDays, selection.selected, capacity, targetTrip.itineraryOutline || []);
      const routed = optimizeItineraryRouteOrder(scheduled.days, new Map(allPois.map((poi) => [poi.id, poi])));
      const nextPlan: TripItinerary = {
        ...emptyPlan,
        days: routed.days,
        days_count: routed.days.length,
      };

      setPendingTripMetadata(targetTrip);
      setHeaderModal(null);
      setTripMetadataError('');
      setAssistantInsight(
        `${scheduled.unassignedCount > 0 ? `${scheduled.unassignedCount} địa điểm vẫn ở danh sách Trip để bạn xử lý. ` : ''}Đây là bản xem trước; lịch đã lưu chỉ thay đổi khi bạn chọn “Sử dụng lịch trình này”.`,
      );
      persistPlan(nextPlan);
      return;
    }

    setIsSavingTripMetadata(true);
    setTripMetadataError('');
    try {
      const overrides = { ...(nextTrip.localMetadataOverrides ?? {}) };
      if (nextTrip.daysCount) overrides.daysCount = nextTrip.daysCount;
      if (nextTrip.startDate && !tripStartDate(nextTrip.startDate)) {
        overrides.startDate = nextTrip.startDate;
      } else {
        delete overrides.startDate;
      }
      const updatedTrip = withUpdatedRecommendationData({
        ...nextTrip,
        localMetadataOverrides: overrides,
      }, categories);
      await persistTripMetadata(updatedTrip);
      setHeaderModal(null);
    } catch (cause) {
      const error = cause as { detail?: string; message?: string };
      setTripMetadataError(error.detail || error.message || 'Không thể lưu thông tin chuyến đi. Vui lòng thử lại.');
    } finally {
      setIsSavingTripMetadata(false);
    }
  };

  const handleSaveWhere = () => {
    const destination = whereDraft.trim() || trip.destination;
    const generatedTitle = !trip.title?.trim() || /^Chuyến đi\b/i.test(trip.title.trim());
    void commitTripMetadata({
      ...trip,
      destination,
      title: generatedTitle ? `Chuyến đi ${destination}` : trip.title,
    });
  };

  const handleSaveWhen = () => {
    const days = whenTabDraft === 'dates' && rangeStartDraft && rangeEndDraft
      ? Math.max(1, Math.round((rangeEndDraft.getTime() - rangeStartDraft.getTime()) / 86_400_000) + 1)
      : whenTabDraft === 'dates' && rangeStartDraft
        ? trip.daysCount || flexibleDaysDraft
        : flexibleDaysDraft;
    const startDate = whenTabDraft === 'dates' && rangeStartDraft
      ? `${rangeStartDraft.getFullYear()}-${String(rangeStartDraft.getMonth() + 1).padStart(2, '0')}-${String(rangeStartDraft.getDate()).padStart(2, '0')}`
      : `${days} ngày • ${selectedMonthDraft}`;
    const updatedTrip = withUpdatedRecommendationData({
      ...trip,
      startDate,
      daysCount: days,
      flexibleDays: days,
      flexibleMonth: selectedMonthDraft,
      localMetadataOverrides: { ...(trip.localMetadataOverrides ?? {}), daysCount: days },
    });
    void commitTripMetadata(updatedTrip);
  };

  const handleSaveWho = () => {
    const peopleCount = Math.max(1, peopleDraft + childrenDraft + infantsDraft + petsDraft);
    void commitTripMetadata(withUpdatedRecommendationData({ ...trip, peopleCount }));
  };

  const handleSaveBudget = () => {
    const budgetTier = `dining:${categoryBudgetDraft.dining};lodging:${categoryBudgetDraft.lodging};activities:${categoryBudgetDraft.activities}`;
    void commitTripMetadata(withUpdatedRecommendationData({
      ...trip,
      budgetTier,
      totalBudget: totalBudgetDraft ?? undefined,
    }, categoryBudgetDraft), categoryBudgetDraft);
  };

  const handleSavePreferences = () => {
    void commitTripMetadata(withUpdatedRecommendationData({
      ...trip,
      preferences: preferencesDraft,
      preferenceText: preferenceTextDraft.trim(),
    }));
  };

  const cancelSchedulePreview = useCallback(() => {
    if (!isSchedulePreviewRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    saveVersion.current += 1;
    const baseline = previewBasePlan.current ?? savedPlan.current;
    previewBasePlan.current = null;
    isSchedulePreviewRef.current = false;
    setIsSchedulePreview(false);
    setErrorMessage('');
    setSaveErrorAction(null);
    setPendingTripMetadata(null);
    latestPlan.current = baseline;
    setPlan(baseline);
    const hasPriorEdits = JSON.stringify(baseline) !== JSON.stringify(savedPlan.current);
    setHasUnsavedChanges(hasPriorEdits);
    if (hasPriorEdits) persistPlan(baseline);
  }, [persistPlan]);

  const confirmSchedulePreview = async () => {
    if (!isSchedulePreviewRef.current || isSaving) return;
    setIsSaving(true);
    setErrorMessage('');
    setSaveErrorAction(null);
    try {
      const saved = await saveTripItinerary(latestPlan.current);
      if (pendingTripMetadata) {
        await persistTripMetadata(pendingTripMetadata, true);
      }
      savedPlan.current = saved;
      latestPlan.current = saved;
      setPlan(saved);
      previewBasePlan.current = null;
      isSchedulePreviewRef.current = false;
      setIsSchedulePreview(false);
      setPendingTripMetadata(null);
      setHasUnsavedChanges(false);
      setTripMetadataError('');
    } catch (cause) {
      const apiError = cause as { status?: number; detail?: string; message?: string };
      const isOverlap = apiError.status === 422 && /khung giờ bị trùng/i.test(apiError.detail || '');
      setErrorMessage(isOverlap
        ? apiError.detail || 'Một số hoạt động đang bị trùng giờ. Hãy chỉnh giờ hoặc dùng chức năng tự sửa.'
        : apiError.status === 401
          ? 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để đồng bộ lịch.'
          : apiError.status === 403
            ? 'Tài khoản hiện tại không có quyền sửa lịch trình này.'
            : `Không đồng bộ được lịch với máy chủ${apiError.message ? `: ${apiError.message}` : '.'}`);
      setSaveErrorAction(isOverlap ? 'repair' : 'retry');
    } finally {
      setIsSaving(false);
    }
  };

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
        savedPlan.current = aligned.itinerary;
        latestPlan.current = aligned.itinerary;
        setPlan(aligned.itinerary);
      } catch {
        if (isCancelled) return;
        const fresh = buildItineraryFromOutline(currentTrip.current, latestAllPois.current);
        const aligned = alignItineraryToTrip(fresh, currentTrip.current);
        savedPlan.current = aligned.itinerary;
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
    const incomingIdeas = Array.isArray(trip.ideas) ? trip.ideas : [];
    tripIdeasRef.current = incomingIdeas;
    setTripIdeas((current) => {
      const hasSameIdeas = current.length === incomingIdeas.length
        && current.every((idea, index) => idea === incomingIdeas[index]);
      return hasSameIdeas ? current : incomingIdeas;
    });
  }, [trip.id, trip.ideas]);

  useEffect(() => {
    if (!externalCopilotPlan || externalCopilotPlan.trip_id !== trip.id) return;
    if (isSchedulePreviewRef.current) {
      persistPlan(externalCopilotPlan);
      onExternalCopilotPlanConsumed?.(externalCopilotPlan);
      return;
    }

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const version = ++saveVersion.current;
    latestPlan.current = externalCopilotPlan;
    setPlan(externalCopilotPlan);
    setHasUnsavedChanges(true);
    setIsSaving(true);
    setErrorMessage('');
    setSaveErrorAction(null);
    void saveTripItinerary(externalCopilotPlan)
      .then((saved) => {
        if (version !== saveVersion.current) return;
        savedPlan.current = saved;
        latestPlan.current = saved;
        setPlan(saved);
        setHasUnsavedChanges(false);
      })
      .catch((cause: unknown) => {
        if (version !== saveVersion.current) return;
        const apiError = cause as { status?: number; message?: string };
        setErrorMessage((apiError.message || '').includes('quá khứ')
          ? 'Lịch trình đang ở ngày quá khứ — hãy bấm "Dời sang hôm nay" để lưu thay đổi.'
          : apiError.status === 401
          ? 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để đồng bộ lịch.'
          : apiError.status === 403
            ? 'Tài khoản hiện tại không có quyền sửa lịch trình này.'
            : `Không đồng bộ được lịch với máy chủ. Thay đổi còn trên trang này${apiError.message ? `: ${apiError.message}` : '.'}`);
        setSaveErrorAction('retry');
      })
      .finally(() => {
        if (version === saveVersion.current) setIsSaving(false);
      });
    onExternalCopilotPlanConsumed?.(externalCopilotPlan);
  }, [externalCopilotPlan, onExternalCopilotPlanConsumed, persistPlan, trip.id]);

  // Hydrate stops with real coordinates/ids once allPois finishes loading asynchronously
  useEffect(() => {
    if (isLoading || allPois.length === 0) return;
    setPlan((prev) => {
      const hydrated = hydrateItineraryWithPois(prev, allPois);
      if (!hydrated.changed) return prev;
      latestPlan.current = hydrated.itinerary;
      return hydrated.itinerary;
    });
  }, [allPois, isLoading]);

  useEffect(() => {
    const requestVersion = ++recommendationRequestVersionRef.current;
    recommendationMoreAbortRef.current?.abort();
    recommendationMoreAbortRef.current = null;
    isFetchingMoreRecommendationsRef.current = false;
    setIsFetchingMoreRecommendations(false);
    setRecommendationPageInfo(null);
    setRecommendationMoreError(false);

    if (recommendations !== undefined || !allPois.length) {
      setRecommendationFetchError(false);
      setIsFetchingRecommendations(false);
      if (recommendations !== undefined) setHasAttemptedRecommendations(true);
      return;
    }

    const controller = new AbortController();
    const contextKey = recommendationContextKey;
    async function fetchRecommendations() {
      setRecommendationFetchError(false);
      setIsFetchingRecommendations(true);
      setHasAttemptedRecommendations(false);
      setFetchedRecommendationPage({ contextKey, pois: [] });
      try {
        const response = await fetchPoiRecommendations(recommendationRequest, controller.signal);
        if (controller.signal.aborted
          || requestVersion !== recommendationRequestVersionRef.current
          || recommendationContextKeyRef.current !== contextKey) return;
        const mapped = mapRecommendationRecords(
          response.data,
          allPois,
          recommendationRequest.destination || 'Đà Nẵng & Huế',
        );
        setRecommendationFetchError(false);
        setFetchedRecommendationPage({
          contextKey,
          pois: uniqueTripRecommendationPois(mapped),
        });
        setRecommendationPageInfo({
          contextKey,
          total: response.total,
          hasMore: response.has_more,
          nextOffset: response.next_offset,
          snapshotId: response.snapshot_id,
        });
        setRecommendationRefreshNotice('');
      } catch (error) {
        if (!controller.signal.aborted && requestVersion === recommendationRequestVersionRef.current) {
          console.warn('TripItineraryView: PB09 recommendation request failed.', error);
          setRecommendationFetchError(true);
          setFetchedRecommendationPage({ contextKey, pois: [] });
        }
      } finally {
        if (!controller.signal.aborted && requestVersion === recommendationRequestVersionRef.current) {
          setIsFetchingRecommendations(false);
          setHasAttemptedRecommendations(true);
        }
      }
    }
    void fetchRecommendations();
    return () => {
      controller.abort();
      recommendationMoreAbortRef.current?.abort();
      if (recommendationRequestVersionRef.current === requestVersion) {
        recommendationRequestVersionRef.current += 1;
      }
    };
  }, [
    allPois,
    recommendations,
    recommendationContextKey,
    recommendationRequest,
    recommendationRetryKey,
  ]);

  const handleLoadMoreRecommendations = useCallback(async () => {
    const page = currentRecommendationPage;
    if (!page?.hasMore || page.nextOffset === null || isFetchingMoreRecommendationsRef.current) return;

    const requestVersion = recommendationRequestVersionRef.current;
    const contextKey = recommendationContextKey;
    if (recommendationContextKeyRef.current !== contextKey) return;

    const controller = new AbortController();
    recommendationMoreAbortRef.current = controller;
    isFetchingMoreRecommendationsRef.current = true;
    setIsFetchingMoreRecommendations(true);
    setRecommendationMoreError(false);

    try {
      const response = await fetchPoiRecommendations({
        ...recommendationRequest,
        offset: page.nextOffset,
        snapshot_id: page.snapshotId,
      }, controller.signal);
      if (controller.signal.aborted
        || requestVersion !== recommendationRequestVersionRef.current
        || recommendationContextKeyRef.current !== contextKey) return;

      const mapped = mapRecommendationRecords(
        response.data,
        allPois,
        recommendationRequest.destination || 'Đà Nẵng & Huế',
      );
      setFetchedRecommendationPage((current) => current.contextKey !== contextKey
        ? current
        : {
            contextKey,
            pois: uniqueTripRecommendationPois([...current.pois, ...mapped]),
          });
      setRecommendationPageInfo({
        contextKey,
        total: response.total,
        hasMore: response.has_more,
        nextOffset: response.next_offset,
        snapshotId: response.snapshot_id,
      });
    } catch (error) {
      if (!controller.signal.aborted
        && requestVersion === recommendationRequestVersionRef.current
        && recommendationContextKeyRef.current === contextKey) {
        const status = typeof error === 'object' && error !== null && 'status' in error
          ? error.status
          : undefined;
        if (status === 409) {
          recommendationRequestVersionRef.current += 1;
          setFetchedRecommendationPage({ contextKey: '', pois: [] });
          setRecommendationPageInfo(null);
          setRecommendationRefreshNotice('Danh sách POI đã thay đổi. Đang tải lại để giữ thứ tự nhất quán.');
          setRecommendationRetryKey((current) => current + 1);
        } else {
          setRecommendationMoreError(true);
        }
      }
    } finally {
      if (recommendationMoreAbortRef.current === controller) {
        recommendationMoreAbortRef.current = null;
        isFetchingMoreRecommendationsRef.current = false;
        setIsFetchingMoreRecommendations(false);
      }
    }
  }, [
    allPois,
    currentRecommendationPage,
    recommendationContextKey,
    recommendationRequest,
  ]);

  // Keep an unscheduled trip's local plan in step with metadata without creating an itinerary save.
  useEffect(() => {
    if (!isLoading) {
      const aligned = alignItineraryToTrip(latestPlan.current, trip);
      if (aligned.changed) {
        latestPlan.current = aligned.itinerary;
        setPlan(aligned.itinerary);
        if (hasScheduledStops) {
          persistPlan(aligned.itinerary);
        } else {
          savedPlan.current = aligned.itinerary;
          setHasUnsavedChanges(false);
        }
      }
    }
  }, [hasScheduledStops, isLoading, persistPlan, trip, plan.days.length]);

  useEffect(() => {
    if (initialFocus === 'ideas') {
      const timer = setTimeout(() => {
        recommendationsSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
      return () => clearTimeout(timer);
    } else if (initialFocus === 'itinerary' && !isLoading && hasScheduledStops) {
      const timer = setTimeout(() => {
        itinerarySectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [initialFocus, isLoading, hasScheduledStops]);

  // ─── 5. Thao tác THỦ CÔNG (Manual Planning First) ───

  // Thêm ý tưởng vào ngày cụ thể
  const handleAddIdeaToDay = (dayNumber: number, poi: Poi, targetIndex?: number) => {
    setDismissedRecommendationIds((current) => current.filter((id) => id !== poi.id));
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
      handleToggleIdeaInTrip(poi.id, 'add');
    }

    const nextPlan = { ...plan, days: nextDays };
    persistPlan(nextPlan);
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
      if (found) movingStop = { ...found, source: found.source === 'assistant' ? 'manual' : found.source };
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
    setDismissedRecommendationIds((current) => [...new Set([...current, poiId])]);
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
      [stops[stopIndex], stops[targetIndex]] = [
        { ...stops[stopIndex], source: stops[stopIndex].source === 'assistant' ? 'manual' : stops[stopIndex].source },
        { ...stops[targetIndex], source: stops[targetIndex].source === 'assistant' ? 'manual' : stops[targetIndex].source },
      ];

      return { ...day, stops: stops.map((s, idx) => ({ ...s, sequence: idx })) };
    });

    persistPlan({ ...plan, days: nextDays });
  };

  // Xóa hẳn điểm dừng khỏi ngày
  const handleDeleteStop = (dayNumber: number, stopId: string) => {
    const removed = plan.days.find((day) => day.day_number === dayNumber)?.stops.find((stop) => stop.stop_id === stopId);
    if (removed?.poi_id) {
      setDismissedRecommendationIds((current) => [...new Set([...current, removed.poi_id!])]);
    }
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
          source: s.source === 'assistant' ? 'manual' : s.source,
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

  // Lưu ghi chú cho điểm dừng
  const handleSaveNote = (dayNumber: number, stopId: string) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const stops = day.stops.map((s) => {
        if (s.stop_id !== stopId) return s;
        return { ...s, source: s.source === 'assistant' ? 'manual' : s.source, comment: noteInput.trim() || null };
      });
      return { ...day, stops };
    });
    persistPlan({ ...plan, days: nextDays });
    setEditingNoteStopId(null);
  };

  // Thêm khoảng nghỉ 90 phút không trùng khung giờ hiện có
  const handleAddLunchBreak = (dayNumber: number) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const slot =
        findRestSlot(day, '11:00–15:00', 90) ?? findRestSlot(day, '09:00–20:00', 90);
      const isAfternoon = Boolean(slot?.start && slot.start >= '14:30');
      const restStop: ItineraryStop = {
        stop_id: `rest-${dayNumber}-${Date.now()}`,
        poi_id: null,
        title: isAfternoon ? 'Nghỉ chiều & Cà phê thư giãn' : 'Nghỉ trưa & Thưởng thức ẩm thực',
        city: day.stops.find((s) => s.city)?.city || null,
        address: null,
        category: 'quan-an',
        stop_type: 'rest',
        source: 'manual',
        start_time: slot?.start ?? null,
        end_time: slot?.end ?? null,
        duration_minutes: 90,
        sequence: day.stops.length,
        latitude: null,
        longitude: null,
        comment: 'Khoảng thời gian nghỉ ngơi thư giãn và thưởng thức ẩm thực địa phương.',
      };
      const stops = [...day.stops];
      insertRestInOrder(stops, restStop);
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

  const usedPoiIds = useMemo(
    () =>
      new Set(
        plan.days.flatMap((d) =>
          d.stops.map((s) => s.poi_id).filter((id): id is string => Boolean(id))
        )
      ),
    [plan.days]
  );

  const budgetSummary = useMemo(
    () =>
      computeTripBudgetSummary(
        plan.days,
        poiById,
        trip.peopleCount || 1,
        trip.totalBudget ?? null
      ),
    [plan.days, poiById, trip.peopleCount, trip.totalBudget]
  );

  const formatVnd = useCallback(
    (amount: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))} ₫`,
    []
  );

  // Thống kê tổng quãng đường, phát thải CO₂ và cảnh báo giờ mở cửa toàn chuyến
  const tripRouteSummary = useMemo(() => {
    let totalRoadKm = 0;
    let openingConflictCount = 0;

    for (const day of plan.days) {
      totalRoadKm += calculateStopsPathKm(day.stops, poiById, true);
      for (const stop of day.stops) {
        if (stop.stop_type === 'rest') continue;
        const matched = stop.poi_id ? poiById.get(stop.poi_id) : undefined;
        const check = checkStopOpeningHours(stop, matched, day.date);
        if (check.status === 'closed' || check.status === 'outside_hours') {
          openingConflictCount += 1;
        }
      }
    }

    const carbon = estimateCarbonFootprint(totalRoadKm * 1000, transportMode);
    return {
      totalRoadKm: Math.round(totalRoadKm * 10) / 10,
      carbon,
      openingConflictCount,
    };
  }, [plan.days, poiById, transportMode]);

  // Tối ưu cụm điểm giảm zig-zag cho toàn bộ các ngày
  const handleOptimizeAllDays = () => {
    const res = optimizeItineraryRouteOrder(plan.days, poiById);
    if (res.reorderedDaysCount > 0) {
      persistPlan({ ...plan, days: res.days });
      const savedCarbon = estimateCarbonFootprint(res.totalSavedKm * 1000, transportMode);
      setOptimizeFeedback(
        `Đã gom cụm tránh đi zig-zag ở ${res.reorderedDaysCount} ngày: ${res.totalBeforeKm.toFixed(1)} → ${res.totalAfterKm.toFixed(1)} km (giảm ${res.totalSavedKm.toFixed(1)} km · ${formatCarbonAmount(savedCarbon.co2Grams)}).`
      );
    } else {
      setOptimizeFeedback('Thứ tự các điểm hiện tại đã tối ưu theo cụm gần nhất, chưa phát hiện đoạn vòng lặp.');
    }
  };

  // Tối ưu cụm điểm giảm zig-zag cho một ngày cụ thể
  const handleOptimizeSingleDay = (dayNumber: number) => {
    const targetDay = plan.days.find((d) => d.day_number === dayNumber);
    if (!targetDay) return;
    const res = optimizeDayRouteOrder(targetDay, poiById);
    if (res.reordered) {
      const nextDays = plan.days.map((d) => (d.day_number === dayNumber ? res.day : d));
      persistPlan({ ...plan, days: nextDays });
      const savedCarbon = estimateCarbonFootprint(res.savedKm * 1000, transportMode);
      setOptimizeFeedback(
        `Đã tối ưu Ngày ${dayNumber}: ${res.beforeKm.toFixed(1)} → ${res.afterKm.toFixed(1)} km (giảm ${res.savedKm.toFixed(1)} km · ${formatCarbonAmount(savedCarbon.co2Grams)}).`
      );
    } else {
      setOptimizeFeedback(`Ngày ${dayNumber} đã được sắp xếp theo thứ tự gần nhất.`);
    }
  };

  // Lưu & Chia sẻ (Soft-Prompt cho khách chưa đăng nhập)
  const handleSaveAndShare = async () => {
    if (isSchedulePreviewRef.current) return;
    const token =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('access_token') || sessionStorage.getItem('access_token')
        : null;
    if (!token) {
      setShowGuestSyncPrompt(true);
      return;
    }
    setIsSaving(true);
    try {
      const saved = await saveTripItinerary(plan);
      savedPlan.current = saved;
      setHasUnsavedChanges(false);
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof window !== 'undefined') {
        await navigator.clipboard.writeText(window.location.href).catch(() => {});
      }
      setSyncFeedback('Đã đồng bộ lịch trình & sao chép liên kết chia sẻ.');
      window.setTimeout(() => setSyncFeedback(null), 3500);
    } finally {
      setIsSaving(false);
    }
  };

  // Đổi điểm ngoài trời sang điểm trong nhà khi trời mưa (1-tap + Hoàn tác)
  const handleSwapRainyDay = (dayNumber: number) => {
    const targetDay = plan.days.find((d) => d.day_number === dayNumber);
    if (!targetDay) return;
    const swaps = suggestIndoorAlternativesForDay(
      targetDay,
      allPois,
      usedPoiIds,
      trip.destination
    );
    if (swaps.length === 0) {
      setOptimizeFeedback(
        `Ngày ${dayNumber} chưa tìm thấy điểm trong nhà khác chưa có trong lịch trình.`
      );
      return;
    }

    const swapByStopId = new Map(swaps.map((s) => [s.originalStop.stop_id, s]));
    const nextDays = plan.days.map((d) => {
      if (d.day_number !== dayNumber) return d;
      return {
        ...d,
        stops: d.stops.map((st, idx) => {
          const match = swapByStopId.get(st.stop_id);
          if (!match) return st;
          const rep = match.replacement;
          return {
            ...st,
            poi_id: rep.id,
            title: rep.name,
            city: rep.city,
            address: rep.address || null,
            category: rep.category,
            stop_type: 'poi' as const,
            source: 'assistant' as const,
            sequence: idx,
            comment: null,
            latitude: Number.isFinite(rep.lat) ? rep.lat : null,
            longitude: Number.isFinite(rep.lng) ? rep.lng : null,
          };
        }),
      };
    });

    setRainSwapBackup({
      dayNumber,
      previousStops: targetDay.stops,
      message: `Đã đổi ${swaps.length} điểm ngoài trời sang không gian trong nhà cho Ngày ${dayNumber}.`,
    });
    persistPlan({ ...plan, days: nextDays });
  };

  const handleUndoRainSwap = () => {
    if (!rainSwapBackup) return;
    const nextDays = plan.days.map((d) =>
      d.day_number === rainSwapBackup.dayNumber
        ? { ...d, stops: rainSwapBackup.previousStops }
        : d
    );
    persistPlan({ ...plan, days: nextDays });
    setRainSwapBackup(null);
  };

  // Đổi 1 điểm dừng sang điểm gợi ý gần đó
  const handleSwapStopToNearby = (
    dayNumber: number,
    stopId: string,
    replacement: Poi
  ) => {
    const nextDays = plan.days.map((d) => {
      if (d.day_number !== dayNumber) return d;
      return {
        ...d,
        stops: d.stops.map((st) => {
          if (st.stop_id !== stopId) return st;
          return {
            ...st,
            poi_id: replacement.id,
            title: replacement.name,
            city: replacement.city,
            address: replacement.address || null,
            category: replacement.category,
            stop_type: 'poi' as const,
            source: 'assistant' as const,
            comment: null,
            latitude: Number.isFinite(replacement.lat) ? replacement.lat : null,
            longitude: Number.isFinite(replacement.lng) ? replacement.lng : null,
          };
        }),
      };
    });
    persistPlan({ ...plan, days: nextDays });
    setNearbyPickerTarget(null);
  };

  const openDayEditor = (dayNumber: number, field: 'title' | 'note') => {
    const day = plan.days.find((item) => item.day_number === dayNumber);
    setDayEditor({ dayNumber, field });
    setDayEditorValue(field === 'title' ? day?.title || '' : day?.note || '');
    setActiveDayMenuNumber(null);
  };

  const saveDayEditor = () => {
    if (!dayEditor) return;
    const value = dayEditor.field === 'title' ? dayEditorValue.trim().slice(0, 200) : dayEditorValue.trim().slice(0, 2000);
    const nextDays = plan.days.map((day) => day.day_number === dayEditor.dayNumber
      ? { ...day, [dayEditor.field]: value }
      : day);
    persistPlan({ ...plan, days: nextDays });
    setDayEditor(null);
  };

  const shiftDate = (value: string | null, amount: number): string | null => {
    if (!value) return null;
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    date.setDate(date.getDate() + amount);
    return date.toISOString().slice(0, 10);
  };

  const insertDay = (anchorDayNumber: number, position: 'before' | 'after') => {
    if (plan.days.length >= 31) return;
    const anchor = plan.days.find((day) => day.day_number === anchorDayNumber);
    if (!anchor) return;
    const insertAt = position === 'before' ? anchorDayNumber - 1 : anchorDayNumber;
    const newDate = position === 'before' ? shiftDate(anchor.date, anchorDayNumber === 1 ? -1 : 0) : shiftDate(anchor.date, 1);
    const newDay: ItineraryDay = {
      day_id: globalThis.crypto?.randomUUID?.() || `${plan.trip_id}-day-${Date.now()}`,
      day_number: insertAt + 1,
      date: newDate,
      title: '',
      note: '',
      stops: [],
    };
    const nextDays = [...plan.days];
    nextDays.splice(insertAt, 0, newDay);
    const normalizedDays = nextDays.map((day, index) => {
      const shifted = position === 'before'
        ? day.day_id !== newDay.day_id && day.day_number >= anchorDayNumber
        : day.day_id !== newDay.day_id && day.day_number > anchorDayNumber;
      return {
        ...day,
        day_number: index + 1,
        date: shifted ? shiftDate(day.date, 1) : day.date,
      };
    });
    const startDate = normalizedDays[0]?.date || plan.start_date;
    persistPlan({ ...plan, start_date: startDate, days_count: normalizedDays.length, days: normalizedDays });
    setActiveDayMenuNumber(null);
    if (onUpdateTrip) {
      const dateLabel = position === 'before' && anchorDayNumber === 1 && startDate
        ? formatTripDateRange(startDate, normalizedDays.length)
        : updateDateRangeWithDays(trip.startDate, normalizedDays.length);
      onUpdateTrip({
        ...trip,
        daysCount: normalizedDays.length,
        startDate: dateLabel,
      });
    }
  };

  const clearDay = (dayNumber: number) => {
    const nextDays = plan.days.map((day) => day.day_number === dayNumber ? { ...day, stops: [] } : day);
    persistPlan({ ...plan, days: nextDays });
    setActiveDayMenuNumber(null);
  };

  // Thêm ngày mới vào lịch
  const handleAddDay = () => {
    if (plan.days.length >= 31) return;
    const nextNumber = plan.days.length + 1;
    const nextDays = [
      ...plan.days,
      {
        day_id: globalThis.crypto?.randomUUID?.() || `${plan.trip_id}-day-${Date.now()}`,
        day_number: nextNumber,
        date: null,
        title: '',
        note: '',
        stops: [],
      },
    ];
    persistPlan({ ...plan, days_count: nextDays.length, days: nextDays });
    setShowItinerarySettingsMenu(false);

    // Đồng bộ ngược ra UserTrip: daysCount & startDate (ví dụ: du lịch từ 1-5, thêm 1 ngày thành 1-6)
    if (onUpdateTrip) {
      const nextDateStr = updateDateRangeWithDays(trip.startDate, nextDays.length);
      onUpdateTrip({
        ...trip,
        daysCount: nextDays.length,
        startDate: nextDateStr,
      });
    }
  };

  // Xóa ngày khỏi lịch
  const handleDeleteDay = (dayNumber: number) => {
    if (plan.days.length <= 1) return;
    const filteredDays = plan.days.filter((d) => d.day_number !== dayNumber);
    const nextDays = filteredDays.map((day, idx) => ({
      ...day,
      day_number: idx + 1,
      date: dayNumber > 1 && day.day_number > dayNumber ? shiftDate(day.date, -1) : day.date,
    }));
    const startDate = nextDays[0]?.date || plan.start_date;
    persistPlan({ ...plan, start_date: startDate, days_count: nextDays.length, days: nextDays });

    // Đồng bộ ngược ra UserTrip: daysCount & startDate
    if (onUpdateTrip) {
      const nextDateStr = dayNumber === 1 && startDate
        ? formatTripDateRange(startDate, nextDays.length)
        : updateDateRangeWithDays(trip.startDate, nextDays.length);
      onUpdateTrip({
        ...trip,
        daysCount: nextDays.length,
        startDate: nextDateStr,
      });
    }
  };

  // Thao tác với kho Ý tưởng
  const handleToggleIdeaInTrip = (poiId: string, action: TripIdeaSelectionAction = 'toggle') => {
    const poi = poiById.get(poiId)
      ?? allPois.find((item) => item.name.toLocaleLowerCase('vi-VN') === poiId.toLocaleLowerCase('vi-VN'));
    const currentIdeas = tripIdeasRef.current;
    const nextIdeas = updateTripIdeaIds(currentIdeas, poiId, poi?.id, poi?.name, action);
    if (nextIdeas === currentIdeas) return;

    const wasSelected = currentIdeas.some((ideaId) => ideaId === poiId || ideaId === poi?.id
      || Boolean(poi && ideaId.toLocaleLowerCase('vi-VN') === poi.name.toLocaleLowerCase('vi-VN')));
    if (!wasSelected) {
      setDismissedRecommendationIds((current) => current.includes(poiId)
        ? current.filter((id) => id !== poiId)
        : current);
    }

    tripIdeasRef.current = nextIdeas;
    setTripIdeas(nextIdeas);
    onUpdateTrip?.({ ...trip, ideas: nextIdeas });
  };

  const runSmartSchedule = (requestedPacing: 'Relaxed' | 'Balanced' | 'Fast' = pacingLevel) => {
    if (isLoading || (!ideaPois.length && !hasScheduledStops)) return;
    if (!isSchedulePreviewRef.current) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      saveVersion.current += 1;
      previewBasePlan.current = plan;
      isSchedulePreviewRef.current = true;
      setIsSchedulePreview(true);
    }
    setPacingOverride(requestedPacing);
    const capacity = dailyVisitCapacity(requestedPacing);
    const ideaIds = new Set(ideaPois.map((poi) => poi.id));
    const baseDays = plan.days.map((day) => ({
      ...day,
      // Keep non-POI entries and selected POIs. Unselected POIs remain in Ý tưởng
      // but do not participate in a generated schedule.
      stops: day.stops.filter((stop) => stop.stop_type === 'rest' || !stop.poi_id || ideaIds.has(stop.poi_id)),
    }));
    const dismissed = new Set(dismissedRecommendationIds);
    const availableIdeas = ideaPois.filter((poi) => !dismissed.has(poi.id));
    const selection = selectAutomaticPois(
      baseDays,
      availableIdeas,
      [],
      trip,
      requestedPacing,
      capacity,
    );
    const result = optimizeDays(baseDays, selection.selected, capacity, trip.itineraryOutline || []);
    const nextPlan = { ...plan, days: result.days };
    persistPlan(nextPlan);

    const placedCount = result.days.reduce((total, day) => total + day.stops.filter((stop) => stop.stop_type !== 'rest').length, 0);
    const restCount = result.days.reduce((total, day) => total + day.stops.filter((stop) => stop.stop_type === 'rest').length, 0);
    const addedRecommendationIds = new Set(selection.added.map((poi) => poi.id));
    const placedRecommendationCount = result.days
      .flatMap((day) => day.stops)
      .filter((stop) => stop.source === 'assistant' && stop.poi_id && addedRecommendationIds.has(stop.poi_id))
      .length;
    const knownCostPois = selection.selected.filter((poi) => poi.estimatedCost != null && Number.isFinite(poi.estimatedCost));
    const unknownCostCount = selection.selected.length - knownCostPois.length;
    const groupSize = Math.max(1, trip.peopleCount || 1);
    const costMessage = unknownCostCount > 0
      ? knownCostPois.length > 0
        ? ` Có dữ liệu giá cho ${knownCostPois.length} địa điểm, khoảng ${selection.selectedCost.toLocaleString('vi-VN')} VNĐ cho ${groupSize} người; ${unknownCostCount} địa điểm chưa có dữ liệu giá nên chi phí thực tế có thể cao hơn.`
        : ` Chưa có dữ liệu giá cho ${unknownCostCount} địa điểm nên GreenTrip chưa thể ước tính tổng chi phí.`
      : ` Ước tính ${selection.selectedCost.toLocaleString('vi-VN')} VNĐ cho ${groupSize} người theo dữ liệu giá hiện có.`;
    const limitingReasons = [
      selection.limits.target > 0 ? `Đã đạt mục tiêu khoảng ${selection.targetStops} địa điểm cho ${plan.days.length} ngày ở nhịp ${requestedPacing}.` : '',
      selection.limits.budget > 0 ? `${selection.limits.budget} gợi ý vượt ngân sách hoạt động còn lại.` : '',
      selection.limits.time > 0 ? `${selection.limits.time} gợi ý vượt thời lượng tham quan còn lại theo nhịp ${requestedPacing}.` : '',
      selection.limits.destination > 0 ? `${selection.limits.destination} gợi ý nằm ngoài điểm đến của chuyến đi.` : '',
      selection.limits.category > 0 ? `${selection.limits.category} gợi ý bị lược bớt để giữ lịch đa dạng.` : '',
    ].filter(Boolean).join(' ');
    const pickedMessage = selection.added.length
      ? ` Trợ lý chọn thêm ${selection.added.length} gợi ý mới và xếp ${placedRecommendationCount} địa điểm vào lịch.${costMessage}`
      : selection.selected.length
        ? ` Trợ lý ưu tiên ${selection.selected.length} địa điểm trong Ý tưởng của bạn.${costMessage}`
        : ' Không có địa điểm mới để thêm; GreenTrip giữ các hoạt động hiện tại.';
    const paceMessage = `Nhịp ${requestedPacing} đặt mục tiêu khoảng ${requestedPacing === 'Relaxed' ? 2 : requestedPacing === 'Fast' ? 5 : 3} điểm/ngày và tối đa ${(capacity / 60).toLocaleString('vi-VN')} giờ tham quan; lịch vẫn giới hạn 2 quán cà phê/ngày.`;
    setAssistantInsight(
      `Đã xếp ${placedCount} địa điểm${restCount ? ` và giữ ${restCount} khoảng nghỉ` : ''}.${pickedMessage} GreenTrip ưu tiên khung giờ phù hợp, gom các điểm gần nhau và giữ giờ bạn đã tự đặt. ${paceMessage}${result.unassignedCount ? ` Còn ${result.unassignedCount} địa điểm chưa xếp do giới hạn giờ tham quan hoặc số quán cà phê.` : ''}${limitingReasons ? ` ${limitingReasons}` : ''} Khoảng cách gần nhau là đường chim bay; thời gian di chuyển thực tế có thể lâu hơn.`,
    );
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
      handleToggleIdeaInTrip(customId, 'add');
    }
    setCustomIdeaInput('');
    setShowAddIdeasModal(false);
  };

  const retrySave = () => {
    if (isSchedulePreviewRef.current) {
      void confirmSchedulePreview();
      return;
    }
    persistPlan(latestPlan.current);
  };

  const repairConflictingTimes = () => {
    const repaired = clearOverlappingVisitTimes(latestPlan.current);
    if (!repaired.repairedCount) {
      setErrorMessage('Không còn khung giờ trùng để tự sửa. Bạn có thể chỉnh giờ từng địa điểm bên dưới.');
      setSaveErrorAction(null);
      return;
    }
    setAssistantInsight(`Đã gỡ ${repaired.repairedCount} khung giờ bị trùng. Địa điểm và ghi chú vẫn được giữ; bạn có thể đặt lại giờ cho điểm vừa gỡ.`);
    persistPlan(repaired.plan);
  };

  // Nút Xong: Lưu và quay lại
  const handleDone = () => {
    if (isSchedulePreviewRef.current && isSaving) return;
    if (isSchedulePreviewRef.current) {
      cancelSchedulePreview();
    } else {
      persistPlan(plan);
    }
    if (onUpdateTrip) {
      onUpdateTrip({ ...trip, ideas: tripIdeas });
    }
    if (onClose) {
      onClose();
    } else {
      onBack();
    }
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
    } else if (modalCategory === 'luu-tru') {
      list = list.filter((p) => p.category === 'luu-tru');
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

  const detailPoi = activeDetailLookup?.status === 'ready' ? activeDetailLookup.poi : null;
  const detailPanel = selectedDetailPoiId && activeDetailLookup ? (
    <div
      ref={detailDialogRef}
      role="dialog"
      aria-modal={isMobileDetailViewport || undefined}
      aria-label={detailPoi ? `Chi tiết ${detailPoi.name}` : 'Chi tiết địa điểm'}
      tabIndex={-1}
      onKeyDown={handleDetailPanelKeyDown}
      className="flex h-full min-h-0 flex-col bg-white outline-none"
    >
      {detailPoi ? (
        <PoiDetailSection
          key={detailPoi.id}
          poi={detailPoi}
          plannerEvidenceMode
          isFavorite={savedIds.has(detailPoi.id)}
          isFavoritePending={pendingIds.has(detailPoi.id)}
          isAddedToTrip={selectedTripPoiIds.has(detailPoi.id)}
          onClose={closePoiDetail}
          onToggleFavorite={(_id, selectedPoi) => {
            if (selectedPoi) openCollectionPicker(selectedPoi);
          }}
          onViewOnMap={() => {
            setSelectedMapPoiId(detailPoi.id);
            closePoiDetail();
          }}
          onToggleAddTrip={(poiId) => handleToggleIdeaInTrip(
            poiId,
            selectedTripPoiIds.has(poiId) ? 'remove' : 'add',
          )}
          onExplain={() => {
            setExplanationPoi(recommendationResults.find((poi) => poi.id === detailPoi.id) ?? detailPoi);
          }}
        />
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-neutral-200 px-4 sm:px-6">
            <h2 className="text-base font-bold text-neutral-950">Chi tiết địa điểm</h2>
            <button
              type="button"
              onClick={closePoiDetail}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              aria-label="Đóng chi tiết địa điểm"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center" aria-live="polite">
            {activeDetailLookup.status === 'loading' ? (
              <>
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-emerald-800" aria-hidden="true" />
                <p className="text-sm font-medium text-neutral-800">Đang tải thông tin địa điểm…</p>
              </>
            ) : activeDetailLookup.status === 'error' ? (
              <>
                <p className="text-sm text-neutral-800">Chưa tải được thông tin địa điểm.</p>
                <button
                  type="button"
                  onClick={() => setDetailRetryKey((value) => value + 1)}
                  className="min-h-11 rounded-full border border-neutral-300 px-4 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  Thử lại
                </button>
              </>
            ) : (
              <p className="text-sm text-neutral-800">Không tìm thấy dữ liệu chi tiết cho địa điểm này.</p>
            )}
          </div>
        </div>
      )}
    </div>
  ) : undefined;

  return (
    <div
      onClick={() => {
        setActiveMenuStopId(null);
      }}
      className={
        isDrawerMode
          ? "no-print fixed inset-y-0 right-0 w-full sm:w-[620px] lg:w-[calc(50vw)] xl:w-[calc(50vw)] z-50 bg-white rounded-l-[24px] border-l border-gray-200/90 shadow-[-16px_0_40px_rgba(0,0,0,0.08),-4px_0_12px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden animate-slideInRight select-none"
          : "flex flex-col flex-1 min-w-0 min-h-0 h-full w-full bg-white text-gray-900 select-none overflow-hidden animate-fadeIn print-scroll-unlock"
      }
    >
      {/* ─── TOP HEADER (DRAWER MODE HOẶC FULL PAGE CHUẨN MINDTRIP) ─── */}
      {isDrawerMode ? (
        <header className="no-print px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 z-30">
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
              onClick={handleSaveAndShare}
              disabled={isSchedulePreview}
              className="min-h-[40px] flex items-center gap-1.5 px-3.5 rounded-full border border-emerald-700/30 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-900 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              title="Lưu & Chia sẻ lịch trình"
            >
              <Share2 size={13} aria-hidden="true" />
              <span>Lưu &amp; Chia sẻ</span>
            </button>

            <button
              type="button"
              onClick={handleDone}
              className="min-h-[40px] px-4 rounded-full bg-black hover:bg-neutral-800 text-white text-xs font-bold transition cursor-pointer shadow-xs active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              title="Xong và đóng lịch trình"
            >
              Xong
            </button>
          </div>
        </header>
      ) : (
        <TripHeader
          trip={recommendationTrip}
          activeTab={activeTab}
          onNavigateToTab={(tab) => {
            if (tab === 'calendar' && onNavigateToCalendar) {
              onNavigateToCalendar();
            } else {
              onNavigateToTab?.(tab);
            }
          }}
          onBack={onBack}
          onOpenWhere={isSchedulePreview ? undefined : () => openTripMetadataModal('where')}
          onOpenWhen={isSchedulePreview ? undefined : () => openTripMetadataModal('when')}
          onOpenWho={isSchedulePreview ? undefined : () => openTripMetadataModal('who')}
          onOpenBudget={isSchedulePreview ? undefined : () => openTripMetadataModal('budget')}
          onOpenPreferences={isSchedulePreview ? undefined : () => openTripMetadataModal('preferences')}
          showCustomSettings={showCustomSettings}
          setShowCustomSettings={setShowCustomSettings}
          isSaving={isSaving || isSavingTripMetadata}
          saveError={tripMetadataError || errorMessage || null}
          daysCount={plan.days.length}
          rightActions={
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {onOpenCopilot && (
                <button
                  type="button"
                  onClick={() => onOpenCopilot(latestPlan.current)}
                  className="min-h-[40px] flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 2xl:px-3 text-xs font-semibold text-neutral-800 hover:border-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  aria-label="Hỏi GreenTrip AI"
                >
                  <MessageCircle size={14} aria-hidden="true" />
                  <span className="hidden 2xl:inline">Hỏi GreenTrip AI</span>
                </button>
              )}

              {activeTab === 'ideas' && (
                <button
                  type="button"
                  onClick={() => {
                    setIdeasRightPanelMode((current) => current === 'trip' ? 'map' : 'trip');
                    if (window.matchMedia('(max-width: 767px)').matches) setIsMapExpanded(true);
                    setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
                  }}
                  aria-pressed={ideasRightPanelMode === 'trip'}
                  aria-label={`Trip, ${ideaPois.length} địa điểm đã chọn`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-neutral-900 bg-white px-3 text-sm font-semibold text-neutral-950 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  <Briefcase size={15} aria-hidden="true" />
                  <span>Trip</span>
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-600 px-1 text-[11px] font-bold text-white">
                    {ideaPois.length}
                  </span>
                </button>
              )}

              {activeTab === 'ideas' && ideasRightPanelMode === 'map' && isMapExpanded && (
                <button
                  type="button"
                  onClick={() => setIsMapExpanded(false)}
                  className="md:hidden min-h-10 rounded-full border border-gray-200 px-2.5 text-xs font-bold text-gray-800 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  aria-label="Quay lại danh sách địa điểm"
                >
                  Danh sách
                </button>
              )}

              {activeTab !== 'ideas' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMapExpanded((prev) => !prev);
                    setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
                  }}
                  aria-pressed={isMapExpanded}
                  className="md:hidden min-h-10 flex items-center gap-1 px-2.5 rounded-full border border-gray-200 hover:border-black text-xs font-bold text-gray-800 hover:bg-gray-50 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  title={isMapExpanded ? 'Quay lại lịch trình' : 'Xem lộ trình'}
                >
                  <MapPin size={14} className="text-emerald-700" aria-hidden="true" />
                  <span>{isMapExpanded ? 'Danh sách' : 'Lộ trình'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSaveAndShare}
                disabled={isSchedulePreview}
                className="min-h-[40px] flex items-center gap-1.5 px-3.5 rounded-full border border-emerald-700/30 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-900 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                title="Lưu & Chia sẻ lịch trình"
              >
                <Share2 size={13} aria-hidden="true" />
                <span className="hidden 2xl:inline">Lưu &amp; Chia sẻ</span>
              </button>
            </div>
          }
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
        />
      )}

      {!isDrawerMode && (
        <CentralVietnamAdvisoryBanner
          advisories={evaluateCentralVietnamAdvisories(trip, plan, allPois)}
          onOpenChecklist={() => setIsChecklistModalOpen(true)}
          onAddHueDay={handleAddDay}
          className="px-4 sm:px-6 py-2 bg-white border-b border-gray-100 shrink-0"
        />
      )}

      {/* Guest Soft-Prompt & Sync Feedback Banner (non-blocking) */}
      {showGuestSyncPrompt && (
        <div
          role="dialog"
          aria-label="Đăng nhập để đồng bộ và chia sẻ lịch trình"
          className="no-print px-4 sm:px-6 py-3 bg-amber-50/90 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3 shrink-0"
        >
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-bold text-neutral-900">
              Đăng nhập để đồng bộ &amp; chia sẻ lịch trình
            </p>
            <p className="text-xs text-neutral-700 mt-0.5">
              Bạn vẫn có thể chỉnh sửa, xuất .ics và in PDF tự do ở chế độ khách.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/login', { state: { returnTo: '/planner' } })}
              className="min-h-[40px] px-4 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              Đăng nhập / Tạo tài khoản
            </button>
            <button
              type="button"
              onClick={() => setShowGuestSyncPrompt(false)}
              className="min-h-[40px] px-3.5 rounded-full border border-neutral-300 bg-white hover:bg-neutral-100 text-xs font-semibold text-neutral-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              Tiếp tục dùng khách
            </button>
          </div>
        </div>
      )}

      {syncFeedback && (
        <div
          role="status"
          aria-live="polite"
          className="no-print px-4 sm:px-6 py-2.5 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between gap-2 text-xs font-semibold text-emerald-900 shrink-0"
        >
          <span>{syncFeedback}</span>
          <button
            type="button"
            onClick={() => setSyncFeedback(null)}
            aria-label="Đóng thông báo đồng bộ"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-neutral-600 hover:text-neutral-900 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="mx-5 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="min-w-0 flex-1">{errorMessage}</span>
          {saveErrorAction === 'repair' ? (
            <button type="button" onClick={repairConflictingTimes} className="min-h-10 rounded-full bg-amber-100 px-3 font-semibold text-amber-950 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-800">Sửa giờ trùng</button>
          ) : saveErrorAction === 'retry' ? (
            <button type="button" onClick={retrySave} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-800"><RefreshCw size={14} />Thử lưu lại</button>
          ) : null}
        </div>
      )}

      {/* Drawer Title Section */}
      {isDrawerMode && (
        <div className="px-6 pt-3.5 pb-2.5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
          <div>
            <h2 className="text-[24px] sm:text-[26px] font-extrabold text-gray-950 tracking-tight leading-tight">
              Lịch trình chi tiết
            </h2>
            <p className="text-[13px] text-gray-500 mt-0.5 font-medium">
              {displayTitle} • {plan.days.length} ngày
            </p>
          </div>
        </div>
      )}

      {/* ─── NỘI DUNG CHÍNH (2 CỘT HOẶC 1 CỘT CHO DRAWER) ─── */}
      <div className={isDrawerMode ? "flex-1 w-full min-h-0 overflow-hidden flex flex-col" : "flex-1 min-h-0 flex flex-col md:flex-row items-stretch overflow-hidden bg-white print-scroll-unlock"}>
        {/* ════════════════════════════════════════════════════════
            CỘT: Ý TƯỞNG + LỊCH THEO NGÀY (THỦ CÔNG CHUẨN)
        ════════════════════════════════════════════════════════ */}
        <div className={`${isDrawerMode ? 'w-full' : (isMapExpanded ? 'hidden' : 'w-full md:w-[560px] lg:w-[620px] xl:w-[660px] shrink-0')} flex flex-col h-full bg-white overflow-y-auto px-4 sm:px-6 py-4 ${isDrawerMode ? '' : 'pb-24 md:pb-4'} border-r border-gray-100 auto-hide-scrollbar select-none transition-[width] duration-300 ease-in-out print-scroll-unlock print-full-width`}>
          {/* Header chỉ hiển thị khi In / Lưu PDF */}
          <div className="hidden print:block mb-5 pb-3 border-b-2 border-neutral-900">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              GreenTrip AI • Lịch trình du lịch xanh
            </p>
            <h1 className="text-xl font-extrabold text-neutral-950 mt-1">{displayTitle}</h1>
            <p className="text-xs text-neutral-700 mt-1">{displaySubtitle}</p>
          </div>

          {/* PB09 recommendations and the existing Explore for-you suggestions */}
          {activeTab === 'ideas' && (
            <section ref={recommendationsSectionRef} className="no-print shrink-0 space-y-4" aria-label="Gợi ý địa điểm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-extrabold text-neutral-950">Gợi ý địa điểm</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveDayAddModal(null);
                    setModalTab('search');
                    setShowAddIdeasModal(true);
                  }}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  <Plus size={14} aria-hidden="true" />
                  Khám phá thêm địa điểm
                </button>
              </div>

              <section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 sm:p-4" aria-label="Địa điểm phù hợp với chuyến đi của bạn" aria-live="polite">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-neutral-900">Địa điểm phù hợp với chuyến đi của bạn</h3>
                  <p className="mt-1 text-xs text-neutral-700">Chọn địa điểm để thêm vào Trip. Gợi ý chưa được chọn sẽ không tự đưa vào lịch trình.</p>
                </div>

                {isScheduleRecommendationsLoading ? (
                  <p className="flex min-h-16 items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm text-neutral-700" role="status">
                    <RefreshCw size={15} className="animate-spin" aria-hidden="true" />
                    Đang tải gợi ý địa điểm…
                  </p>
                ) : recommendationFetchError ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3">
                    <p className="text-sm text-amber-950">Chưa tải được gợi ý từ PB09. Bạn có thể thử lại hoặc tự khám phá địa điểm.</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setRecommendationRetryKey((value) => value + 1)}
                        className="min-h-10 rounded-full border border-amber-800 px-3 text-sm font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-800"
                      >
                        Thử lại PB09
                      </button>
                      <button
                        type="button"
                        onClick={() => { setModalTab('search'); setShowAddIdeasModal(true); }}
                        className="min-h-10 rounded-full bg-neutral-900 px-3 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                      >
                        Khám phá địa điểm
                      </button>
                    </div>
                  </div>
                ) : recommendationResults.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-3">
                    <p className="text-sm text-neutral-700">Chưa có POI phù hợp với thông tin chuyến đi này. Bạn vẫn có thể tìm và chọn địa điểm khác.</p>
                    <button
                      type="button"
                      onClick={() => { setModalTab('search'); setShowAddIdeasModal(true); }}
                      className="min-h-10 rounded-full bg-neutral-900 px-3 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      Khám phá địa điểm
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {recommendationCards.map((poi) => (
                        <RecommendationPoiCard
                          key={poi.id}
                          poi={poi}
                          estimatedCost={poi.recommendationEstimatedCost}
                          isAdded={selectedTripPoiIds.has(poi.id)}
                          onOpenDetail={(poiId, trigger) => openPoiDetail(poiId, trigger)}
                          onExplain={() => {
                            recordViewedTripPoi(poi.id);
                            setExplanationPoi(poi);
                          }}
                          onAdd={() => handleToggleIdeaInTrip(poi.id, 'add')}
                        />
                      ))}
                    </div>
                    {recommendationRefreshNotice && (
                      <p className="mt-3 text-center text-sm text-neutral-700" role="status" aria-live="polite">
                        {recommendationRefreshNotice}
                      </p>
                    )}
                    {recommendationHasMore ? (
                      <div className="mt-3 flex flex-col items-center gap-2">
                        {recommendationMoreError && (
                          <p className="text-sm text-amber-900" role="alert">
                            Chưa tải được các địa điểm tiếp theo. Những kết quả đã tải vẫn được giữ nguyên.
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => { void handleLoadMoreRecommendations(); }}
                          disabled={isFetchingMoreRecommendations}
                          aria-busy={isFetchingMoreRecommendations}
                          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-800 bg-white px-5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                        >
                          {isFetchingMoreRecommendations && <RefreshCw size={15} className="animate-spin" aria-hidden="true" />}
                          {isFetchingMoreRecommendations
                            ? 'Đang tải thêm địa điểm…'
                            : recommendationMoreError ? 'Thử tải thêm' : 'Xem thêm địa điểm'}
                        </button>
                      </div>
                    ) : currentRecommendationPage && currentRecommendationPage.total > 0 ? (
                      <p className="mt-3 text-center text-sm text-neutral-700" role="status">
                        Đã hiển thị hết các địa điểm đủ điều kiện.
                      </p>
                    ) : null}
                  </>
                )}
              </section>

              <section className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4" aria-label="Có thể bạn sẽ thích">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-neutral-900">Có thể bạn sẽ thích</h3>
                  <p className="mt-1 text-xs text-neutral-700">{forYouDescription}</p>
                </div>
                {allPois.length === 0 ? (
                  <p className="rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-700" role="status">
                    Chưa có dữ liệu địa điểm để hiển thị gợi ý.
                  </p>
                ) : !hasForYouSignals ? (
                  <p className="rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-700" role="status">
                    Tìm kiếm hoặc thêm một vài POI để nhận gợi ý liên quan trong chuyến đi này.
                  </p>
                ) : forYouPois.length === 0 ? (
                  <p className="rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-700" role="status">
                    Chưa tìm thấy POI có dữ liệu liên quan với các địa điểm hoặc từ khóa bạn đã chọn.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {forYouPois.map(({ poi, reason }) => (
                      <RecommendationPoiCard
                        key={poi.id}
                        poi={poi}
                        estimatedCost={poi.estimatedCost}
                        reason={reason}
                        isAdded={selectedTripPoiIds.has(poi.id)}
                        onOpenDetail={(poiId, trigger) => openPoiDetail(poiId, trigger)}
                        onExplain={() => setExplanationPoi(poi)}
                        onAdd={() => handleToggleIdeaInTrip(poi.id, 'add')}
                      />
                    ))}
                  </div>
                )}
              </section>
            </section>
          )}
          {/* ────────────────────────────────────────────────────────
              2. PHẦN LỊCH TRÌNH THEO NGÀY (ITINERARY TIMELINE)
          ──────────────────────────────────────────────────────── */}
          {activeTab === 'itinerary' && (
          <section ref={itinerarySectionRef} className="flex-1 flex flex-col min-h-0 mt-5">
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

                <button
                  type="button"
                  aria-pressed={preferLocalAuthentic}
                  onClick={() => setPreferLocalAuthentic((prev) => !prev)}
                  className={`min-h-[36px] px-3 rounded-full border text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                    preferLocalAuthentic
                      ? 'border-emerald-800 bg-emerald-50 text-emerald-950'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                  title="Ưu tiên gợi ý quán bản địa phía Tây sông Hàn, làng nghề và điểm ít đông"
                >
                  Bản địa ít đông
                </button>
              </div>

              <div className="flex items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() => runSmartSchedule()}
                  disabled={isLoading || isSaving || (!ideaPois.length && !hasScheduledStops)}
                  aria-describedby="smart-schedule-help"
                  aria-busy={isLoading}
                  className="flex min-h-10 items-center gap-1.5 rounded-full bg-gray-950 px-3 text-xs font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  {isLoading ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
                  <span>{isSchedulePreview ? 'Tạo lại bản xem trước' : hasScheduledStops ? 'Tạo lại lịch trình' : 'Tạo lịch trình'}</span>
                </button>
                {/* Menu ba chấm ... cạnh tiêu đề Lịch trình */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowItinerarySettingsMenu(!showItinerarySettingsMenu)}
                    className="w-9 h-9 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    title="Tùy chọn lịch trình"
                    aria-label="Tùy chọn lịch trình"
                    aria-expanded={showItinerarySettingsMenu}
                  >
                    <MoreHorizontal size={15} />
                  </button>

                  {showItinerarySettingsMenu && (
                    <div
                      className="absolute right-0 top-10 w-48 bg-white rounded-2xl shadow-xl border border-gray-200 p-1.5 z-40 text-sm animate-fadeIn"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={handleAddDay}
                        className="min-h-10 w-full text-left px-3 rounded-xl hover:bg-gray-100 font-semibold text-gray-900 flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                      >
                        <Plus size={14} /> Thêm ngày mới
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Trợ lý sắp xếp lịch trình & nhịp độ — Gọn 1 hàng để ưu tiên hiển thị lịch theo ngày */}
            <section className="mb-2.5 rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2" aria-label="Trợ lý sắp xếp lịch trình">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Chọn nhịp chuyến đi">
                  <span className="text-xs font-bold text-gray-800 mr-1">Nhịp:</span>
                  {([
                    ['Relaxed', '🌿 Thong thả', '~2 điểm'],
                    ['Balanced', '⚖️ Cân bằng', '~3 điểm'],
                    ['Fast', '⚡ Dày đặc', '≤5 điểm'],
                  ] as const).map(([level, label, target]) => (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={pacingLevel === level}
                      disabled={isLoading || isSaving || (!ideaPois.length && !hasScheduledStops)}
                      onClick={() => runSmartSchedule(level)}
                      className={`min-h-8 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 ${pacingLevel === level ? 'border-emerald-800 bg-emerald-100 text-emerald-950' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100'}`}
                    >
                      <span>{label}</span>
                      <span className="ml-1 font-normal text-gray-600">({target})</span>
                    </button>
                  ))}
                </div>
                <TripExportToolbar
                  trip={trip}
                  plan={plan}
                  isChecklistOpen={isChecklistModalOpen}
                  onChecklistOpenChange={setIsChecklistModalOpen}
                  onBeforePrint={() => setCollapsedDays(new Set())}
                />
              </div>
              {isScheduleRecommendationsLoading && <p className="mt-1.5 text-xs text-gray-700" role="status">Đang tải gợi ý địa điểm...</p>}
              {!isScheduleRecommendationsLoading && recommendationFetchError && <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-950" role="status"><span>Chưa tải được gợi ý từ PB09; danh sách địa điểm hiện có vẫn dùng được.</span><button type="button" onClick={() => setRecommendationRetryKey((value) => value + 1)} className="min-h-8 rounded-full px-2.5 font-semibold text-amber-950 underline underline-offset-2 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-800">Thử lại</button></div>}
              {assistantInsight && <p className="mt-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs leading-5 text-emerald-950" aria-live="polite"><strong>Vì sao GreenTrip xếp như vậy?</strong> {assistantInsight}</p>}
            </section>

            {isSchedulePreview && (
              <section className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3" aria-live="polite">
                <div>
                  <h3 className="text-sm font-bold text-amber-950">Bản xem trước · Chưa lưu</h3>
                  <p className="text-xs text-amber-900">Bạn có thể chỉnh sửa phương án. Lịch đã lưu chỉ đổi khi bạn sử dụng bản xem trước này.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelSchedulePreview}
                    disabled={isSaving}
                    className="min-h-10 rounded-full border border-amber-800 px-4 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-800"
                  >
                    Hủy bản xem trước
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmSchedulePreview()}
                    disabled={isSaving}
                    className="min-h-10 rounded-full bg-emerald-900 px-4 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    {isSaving ? 'Đang lưu...' : 'Sử dụng lịch trình này'}
                  </button>
                </div>
              </section>
            )}

            {/* Bảng Tối ưu Lộ trình & Ước tính Carbon (Phần 1) */}
            <ItineraryCarbonBudgetPanel
              totalRoadKm={tripRouteSummary.totalRoadKm}
              carbon={tripRouteSummary.carbon}
              openingConflictCount={tripRouteSummary.openingConflictCount}
              transportMode={transportMode}
              onChangeTransportMode={setTransportMode}
              onOptimizeAllDays={handleOptimizeAllDays}
              budgetSummary={budgetSummary}
              peopleCount={trip.peopleCount || 1}
              formatVnd={formatVnd}
              optimizeFeedback={optimizeFeedback}
              onDismissOptimizeFeedback={() => setOptimizeFeedback(null)}
            />

            {/* Danh sách các ngày theo chiều dọc (Chuẩn Ảnh 1, 4 - ĐÃ BỎ DẤU CỘNG Ở HEADER NGÀY) */}
            <div className="space-y-4 pb-10">
              {plan.days.map((day) => {
                const hasStops = day.stops.length > 0;
                const isCollapsed = collapsedDays.has(day.day_number);
                const hasLunchBreak = day.stops.some((s) => s.stop_type === 'rest');
                const nonRestCount = day.stops.filter((s) => s.stop_type !== 'rest').length;
                const dayRoadKm = calculateStopsPathKm(day.stops, poiById, true);
                const dayCarbon = estimateCarbonFootprint(dayRoadKm * 1000, transportMode);
                const dayFatigue = computeDayFatigue(day, poiById);
                const hasOutdoorStop = day.stops.some(
                  (s) => s.stop_type !== 'rest' && isPoiOutdoor(s.poi_id ? poiById.get(s.poi_id) : undefined, s)
                );

                return (
                  <div key={day.day_id || `day-${day.day_number}`} className="border-b border-gray-100 pb-3">
                    {/* Header Ngày */}
                    <div
                      onClick={() => toggleDayCollapse(day.day_number)}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 cursor-pointer group select-none"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); toggleDayCollapse(day.day_number); }}
                          className="text-neutral-600 group-hover:text-black transition cursor-pointer"
                          title={isCollapsed ? 'Mở rộng ngày' : 'Thu gọn ngày'}
                          aria-expanded={!isCollapsed}
                        >
                          {isCollapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
                        </button>
                        <h3 className="font-extrabold text-[15px] text-gray-950 flex flex-wrap items-center gap-2">
                          <span>Ngày {day.day_number}</span>
                          {day.title && <span className="font-medium text-gray-700">{day.title}</span>}
                          {!day.title && (
                            <button type="button" onClick={(event) => { event.stopPropagation(); openDayEditor(day.day_number, 'title'); }} className="font-normal text-gray-500 underline decoration-gray-300 underline-offset-4 hover:text-gray-900">
                              Thêm tiêu đề
                            </button>
                          )}
                          {day.date && (
                            <span className="font-normal text-xs text-neutral-600">
                              {displayDateVi(day.date)}
                            </span>
                          )}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {day.stops.length > 0 && (
                          <span
                            className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                              dayFatigue.needsRest && !dayFatigue.hasRestBlock
                                ? 'bg-amber-50 border-amber-300 text-amber-950'
                                : 'bg-neutral-100 border-neutral-200 text-neutral-800'
                            }`}
                            title="Chỉ số nhịp độ trong ngày F(d) = giờ hoạt động + 0.5 × điểm ngoài trời"
                          >
                            Nhịp {dayFatigue.fatigueHours.toFixed(1)}h
                          </span>
                        )}
                        {dayFatigue.needsRest && !dayFatigue.hasRestBlock && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddLunchBreak(day.day_number);
                            }}
                            className="no-print min-h-[40px] inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3 text-xs font-bold text-amber-950 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                            title="Thêm khoảng nghỉ trưa 90 phút để giảm mệt mỏi"
                          >
                            <Coffee size={12} aria-hidden="true" />
                            <span>+ Thêm nghỉ</span>
                          </button>
                        )}
                        {dayRoadKm > 0 && (
                          <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full">
                            ~{dayRoadKm.toFixed(1)} km · {formatCarbonAmount(dayCarbon.co2Grams)}
                          </span>
                        )}
                        <span className="text-xs text-neutral-600 font-medium">
                          {day.stops.length > 0 ? `${day.stops.length} điểm` : ''}
                        </span>
                        <div className="relative" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setActiveDayMenuNumber(activeDayMenuNumber === day.day_number ? null : day.day_number)}
                            className="w-9 h-9 rounded-full text-gray-600 hover:bg-gray-100 flex items-center justify-center transition cursor-pointer"
                            title={`Tùy chọn Ngày ${day.day_number}`}
                            aria-label={`Tùy chọn Ngày ${day.day_number}`}
                            aria-expanded={activeDayMenuNumber === day.day_number}
                          >
                            <MoreHorizontal size={18} />
                          </button>
                          {activeDayMenuNumber === day.day_number && (
                            <div className="absolute right-0 top-10 z-50 w-56 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl text-sm" role="menu">
                              <button type="button" role="menuitem" onClick={() => openDayEditor(day.day_number, 'title')} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-gray-800 hover:bg-gray-100">
                                <Pencil size={16} /> Thêm/sửa tiêu đề
                              </button>
                              <button type="button" role="menuitem" onClick={() => openDayEditor(day.day_number, 'note')} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-gray-800 hover:bg-gray-100">
                                <MessageCircle size={16} /> Thêm/sửa ghi chú
                              </button>
                              <button type="button" role="menuitem" disabled={plan.days.length >= 31} onClick={() => insertDay(day.day_number, 'before')} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-gray-800 hover:bg-gray-100 disabled:opacity-50">
                                <ChevronUp size={16} /> Thêm ngày trước
                              </button>
                              <button type="button" role="menuitem" disabled={plan.days.length >= 31} onClick={() => insertDay(day.day_number, 'after')} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-gray-800 hover:bg-gray-100 disabled:opacity-50">
                                <ChevronDown size={16} /> Thêm ngày sau
                              </button>
                              <button type="button" role="menuitem" disabled={!hasStops} onClick={() => clearDay(day.day_number)} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-gray-700 hover:bg-gray-100 disabled:opacity-50">
                                <Eraser size={16} /> Xóa hoạt động trong ngày
                              </button>
                              {plan.days.length > 1 && (
                                <>
                                  <div className="my-1 border-t border-gray-200" />
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      if (day.stops.length === 0 || window.confirm(`Bạn có chắc muốn xóa Ngày ${day.day_number}? Các địa điểm trong ngày này vẫn được lưu trong kho Ý tưởng.`)) handleDeleteDay(day.day_number);
                                      setActiveDayMenuNumber(null);
                                    }}
                                    className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 size={16} /> Xóa ngày
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {day.note && !isCollapsed && (
                      <p className="mb-2 ml-8 flex items-start gap-2 text-sm leading-5 text-gray-700">
                        <MessageCircle size={15} className="mt-0.5 shrink-0 text-gray-500" />
                        <span>{day.note}</span>
                      </p>
                    )}

                    {/* Nội dung ngày khi mở rộng */}
                    {!isCollapsed && (
                      <div className="mt-1 space-y-3 pl-2">
                        {/* 1-tap Rainy Day Switch + Inline Undo */}
                        {hasOutdoorStop && (
                          <div className="no-print flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSwapRainyDay(day.day_number)}
                              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white hover:bg-neutral-50 px-3.5 text-xs font-semibold text-neutral-900 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                            >
                              <CloudRain size={14} className="text-emerald-800 shrink-0" aria-hidden="true" />
                              <span>Trời mưa? Đổi điểm trong nhà</span>
                            </button>
                          </div>
                        )}

                        {rainSwapBackup?.dayNumber === day.day_number && (
                          <div
                            role="status"
                            aria-live="polite"
                            className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-950 font-medium"
                          >
                            <span>{rainSwapBackup.message}</span>
                            <button
                              type="button"
                              onClick={handleUndoRainSwap}
                              className="min-h-[40px] inline-flex items-center gap-1 rounded-full bg-neutral-900 hover:bg-neutral-800 px-3.5 text-xs font-bold text-white transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                            >
                              <RotateCcw size={12} aria-hidden="true" />
                              <span>Hoàn tác</span>
                            </button>
                          </div>
                        )}
                        {!hasStops ? (
                          /* Trạng thái chưa có điểm: Đúng 1 nút + Thêm (Chuẩn Ảnh 1, 4) */
                          <div className="no-print py-1 pl-4">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveDayAddModal(day.day_number);
                                setModalTab(ideaPois.length > 0 ? 'ideas' : 'search');
                                setModalCategory('for-you');
                                setModalSearch('');
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
                              const matchedPoi = isRest
                                ? undefined
                                : (stop.poi_id ? poiById.get(stop.poi_id) : undefined) ??
                                  matchPoiForStop(stop.poi_id, stop.title, allPois);
                              const openingCheck = checkStopOpeningHours(stop, matchedPoi, day.date);
                              const isEditingTime = editingStopId === stop.stop_id;
                              const isEditingNote = editingNoteStopId === stop.stop_id;
                              const isMenuOpen = activeMenuStopId === stop.stop_id;

                              const nextStop = day.stops[sIdx + 1];
                              const nextMatchedPoi = nextStop?.poi_id ? poiById.get(nextStop.poi_id) : undefined;
                              let transitDistKm: number | null = null;
                              if (nextStop && !isRest && nextStop.stop_type !== 'rest') {
                                const straightKm = distanceKm(
                                  {
                                    latitude: stop.latitude ?? matchedPoi?.lat ?? null,
                                    longitude: stop.longitude ?? matchedPoi?.lng ?? null,
                                  },
                                  {
                                    latitude: nextStop.latitude ?? nextMatchedPoi?.lat ?? null,
                                    longitude: nextStop.longitude ?? nextMatchedPoi?.lng ?? null,
                                  }
                                );
                                transitDistKm = straightKm != null ? Math.round(straightKm * 1.18 * 10) / 10 : null;
                              }

                              return (
                                <React.Fragment key={stop.stop_id || `stop-${sIdx}`}>
                                  {/* Thẻ lịch trình trong ngày */}
                                  <div
                                    onMouseEnter={() => setHoveredStopId(stop.poi_id || stop.stop_id)}
                                    onMouseLeave={() => setHoveredStopId(null)}
                                    className={`print-avoid-break min-h-[110px] rounded-[22px] border border-[#e6e6e6] p-3 flex items-start gap-3.5 transition-all relative group ${
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
                                        <PoiImage
                                          src={getPoiImage(matchedPoi)}
                                          alt={stop.title}
                                          poiId={stop.poi_id || stop.stop_id}
                                          poiName={stop.title}
                                          category={matchedPoi?.category}
                                          city={matchedPoi?.city}
                                          className="w-full h-full object-cover pointer-events-none"
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

                                        <p className="text-xs text-neutral-600 mt-1 truncate">
                                          {stop.address || stop.city || trip.destination}
                                        </p>

                                        {!stop.comment && !isRest && (
                                          <p className="text-xs text-neutral-600 mt-0.5 truncate">
                                            {getStopShortReason(
                                              stop,
                                              matchedPoi,
                                              sIdx > 0 ? day.stops[sIdx - 1] : null
                                            )}
                                          </p>
                                        )}

                                        {(openingCheck.status === 'closed' || openingCheck.status === 'outside_hours') &&
                                          openingCheck.warningMessage && (
                                            <div
                                              role="status"
                                              className="mt-1.5 inline-flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-950"
                                            >
                                              <AlertTriangle size={13} className="text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                                              <span className="leading-snug">{openingCheck.warningMessage}</span>
                                            </div>
                                          )}

                                        {!isRest && matchedPoi && evaluateLocalAuthentic(matchedPoi).isCrowded && (
                                          <div className="no-print mt-1.5 flex flex-wrap items-center gap-2">
                                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                                              Khu vực đông khách
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setPreferLocalAuthentic(true);
                                                setNearbyPickerTarget({
                                                  dayNumber: day.day_number,
                                                  stopId: stop.stop_id,
                                                });
                                              }}
                                              className="text-xs font-bold text-emerald-800 hover:text-emerald-950 underline underline-offset-2 cursor-pointer"
                                            >
                                              Đổi điểm bản địa ít đông
                                            </button>
                                          </div>
                                        )}
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
                                        className="min-w-[40px] min-h-[40px] rounded-xl border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-black cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                                        title="Tùy chọn khác"
                                      >
                                        <MoreHorizontal size={14} />
                                      </button>

                                      {isMenuOpen && (
                                        <div
                                          className="absolute right-0 top-8 w-48 bg-white rounded-2xl shadow-xl border border-gray-200 p-1.5 z-40 text-xs animate-fadeIn"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {!isRest && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setNearbyPickerTarget({
                                                  dayNumber: day.day_number,
                                                  stopId: stop.stop_id,
                                                });
                                                setActiveMenuStopId(null);
                                              }}
                                              className="w-full min-h-[40px] text-left px-3 py-1.5 rounded-xl hover:bg-emerald-50 font-semibold text-emerald-900 flex items-center gap-2 cursor-pointer"
                                            >
                                              <MapPin size={13} aria-hidden="true" /> Đổi điểm khác gần đây
                                            </button>
                                          )}
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

                                  {/* Inline Nearby Replacement Picker */}
                                  {!isRest &&
                                    nearbyPickerTarget?.dayNumber === day.day_number &&
                                    nearbyPickerTarget?.stopId === stop.stop_id && (() => {
                                      const nearbyList = suggestNearbyAlternativesForStop(
                                        stop,
                                        day,
                                        allPois,
                                        usedPoiIds,
                                        3,
                                        { preferLocalAuthentic }
                                      );
                                      return (
                                        <div
                                          role="region"
                                          aria-label={`Chọn điểm gần ${stop.title}`}
                                          className="no-print ml-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2"
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-xs font-bold text-neutral-900">
                                              {preferLocalAuthentic
                                                ? `Điểm bản địa ít đông gần ${stop.title}`
                                                : `Điểm gợi ý gần ${stop.title}`}
                                            </span>
                                            <div className="flex items-center gap-2">
                                              <button
                                                type="button"
                                                aria-pressed={preferLocalAuthentic}
                                                onClick={() => setPreferLocalAuthentic((p) => !p)}
                                                className={`min-h-[36px] px-2.5 rounded-full border text-xs font-semibold cursor-pointer ${
                                                  preferLocalAuthentic
                                                    ? 'border-emerald-800 bg-emerald-800 text-white'
                                                    : 'border-neutral-300 bg-white text-neutral-800'
                                                }`}
                                              >
                                                Bản địa ít đông
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setNearbyPickerTarget(null)}
                                                className="min-h-[40px] px-3 rounded-full border border-neutral-300 bg-white hover:bg-neutral-100 text-xs font-semibold text-neutral-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                                              >
                                                Đóng
                                              </button>
                                            </div>
                                          </div>
                                          {nearbyList.length === 0 ? (
                                            <p className="text-xs text-neutral-600">
                                              Chưa có điểm thay thế gần đây chưa nằm trong lịch trình.
                                            </p>
                                          ) : (
                                            <div className="space-y-1.5">
                                              {nearbyList.map((cand) => (
                                                <div
                                                  key={cand.poi.id}
                                                  className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white p-2.5"
                                                >
                                                  <div className="min-w-0">
                                                    <p className="text-xs font-bold text-neutral-950 truncate">
                                                      {cand.poi.name}
                                                    </p>
                                                    <p className="text-xs text-neutral-600 truncate">
                                                      {cand.reason}
                                                    </p>
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleSwapStopToNearby(
                                                        day.day_number,
                                                        stop.stop_id,
                                                        cand.poi
                                                      )
                                                    }
                                                    className="min-h-[40px] px-3.5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-xs font-bold text-white shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                                                  >
                                                    Đổi
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}

                                  {/* Dòng khoảng cách & CO₂ giữa 2 thẻ */}
                                  {showDistances && transitDistKm !== null && (() => {
                                    const legCarbon = estimateCarbonFootprint(transitDistKm * 1000, transportMode);
                                    const LegIcon =
                                      transportMode === 'driving'
                                        ? Car
                                        : transportMode === 'motorcycle'
                                          ? Bike
                                          : transportMode === 'transit'
                                            ? Bus
                                            : Footprints;
                                    return (
                                      <div className="min-h-[44px] ml-7 pl-6 border-l-2 border-[#ddd] flex flex-wrap items-center gap-2.5 text-xs text-gray-700 font-semibold animate-fadeIn">
                                        <LegIcon size={13} className="text-emerald-700 shrink-0" aria-hidden="true" />
                                        <span>~{transitDistKm.toFixed(1)} km</span>
                                        <span className="text-gray-400" aria-hidden="true">·</span>
                                        <span className="text-emerald-800">{formatCarbonAmount(legCarbon.co2Grams)}</span>
                                        <a
                                          href={getGoogleMapsDirectionsUrl(
                                            stop.latitude ?? matchedPoi?.lat,
                                            stop.longitude ?? matchedPoi?.lng,
                                            nextStop.latitude ?? nextMatchedPoi?.lat,
                                            nextStop.longitude ?? nextMatchedPoi?.lng,
                                            transportMode
                                          )}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-emerald-800 hover:text-emerald-950 hover:underline flex items-center gap-1 font-bold ml-1"
                                          title="Mở chỉ đường trên Google Maps"
                                        >
                                          <span>Chỉ đường</span>
                                          <ExternalLink size={12} />
                                        </a>
                                      </div>
                                    );
                                  })()}
                                </React.Fragment>
                              );
                            })}

                            {/* Nút hành động ở cuối ngày khi đã có điểm */}
                            <div className="pt-2 pl-4 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDayAddModal(day.day_number);
                                  setModalTab(ideaPois.length > 0 ? 'ideas' : 'search');
                                  setModalCategory('for-you');
                                  setModalSearch('');
                                  setShowAddIdeasModal(true);
                                }}
                                className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-800 transition cursor-pointer shadow-2xs"
                              >
                                <Plus size={13} />
                                <span>Thêm</span>
                              </button>

                              {!hasLunchBreak && !dayFatigue.needsRest && (
                                <button
                                  type="button"
                                  onClick={() => handleAddLunchBreak(day.day_number)}
                                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full border border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-900 transition cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                                >
                                  <Coffee size={13} className="text-amber-700" aria-hidden="true" />
                                  <span>+ Nghỉ trưa (90 phút)</span>
                                </button>
                              )}

                              {nonRestCount >= 3 && (
                                <button
                                  type="button"
                                  onClick={() => handleOptimizeSingleDay(day.day_number)}
                                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-900 transition cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                                  title="Tối ưu thứ tự các điểm trong ngày này để giảm đi vòng"
                                >
                                  <RouteIcon size={13} className="text-emerald-700" aria-hidden="true" />
                                  <span>Tối ưu ngày</span>
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

              {/* Nút thêm ngày mới ở cuối danh sách ngày */}
              <div className="no-print pt-2 flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleAddDay}
                  className="inline-flex items-center gap-2 h-9 px-5 rounded-full border border-dashed border-gray-300 hover:border-black bg-gray-50/70 hover:bg-gray-100 text-xs font-bold text-gray-800 transition cursor-pointer active:scale-95 shadow-2xs"
                >
                  <Plus size={14} />
                  <span>+ Thêm Ngày {plan.days.length + 1}</span>
                </button>
              </div>
            </div>
          </section>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════
            CỘT PHẢI: BẢN ĐỒ LỘ TRÌNH ĐỒNG BỘ (CHỈ HIỆN KHI KHÔNG PHẢI DRAWER MODE)
        ════════════════════════════════════════════════════════ */}
        {!isDrawerMode && (activeTab === 'itinerary' || activeTab === 'ideas') && (
          activeTab === 'ideas' && ideasRightPanelMode === 'trip' ? (
            <div
              className={`${isMapExpanded ? 'block' : 'hidden md:block'} flex-1 h-full min-w-0 overflow-hidden border-l border-neutral-200 bg-white`}
              data-purpose="right-panel-container"
            >
              <PlannerTripPanel
                trip={trip}
                pois={ideaPois}
                days={plan.days}
                section={tripPanelSection}
                onChangeSection={setTripPanelSection}
                onRemovePoi={(poiId) => handleToggleIdeaInTrip(poiId, 'remove')}
                onOpenPoiDetails={(poiId) => {
                  setIdeasRightPanelMode('map');
                  setSelectedMapPoiId(poiId);
                  recordViewedTripPoi(poiId);
                  setIsMapExpanded(window.matchMedia('(max-width: 767px)').matches);
                  setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
                }}
                onCreateSchedule={() => {
                  runSmartSchedule();
                  onNavigateToTab?.('itinerary');
                }}
                onOpenItinerary={() => onNavigateToTab?.('itinerary')}
                onReturnToSuggestions={() => {
                  setIdeasRightPanelMode('map');
                  setIsMapExpanded(false);
                }}
                isBusy={isLoading || isSaving}
              />
            </div>
          ) : (
            <ItineraryMapPanel
              mapPurpose={activeTab === 'ideas' ? 'ideas' : 'itinerary'}
              isDetailOpen={Boolean(selectedDetailPoiId)}
              detailPanel={detailPanel}
              isMapExpanded={isMapExpanded}
              onToggleExpand={() => {
                setIsMapExpanded((prev) => !prev);
                setTimeout(() => {
                  window.dispatchEvent(new Event('resize'));
                }, 200);
              }}
              mapDayFilter={mapDayFilter}
              onChangeMapDayFilter={setMapDayFilter}
              days={plan.days}
              pois={activeTab === 'ideas' ? ideasMapPois : mapPois.length > 0 ? mapPois : allPois.slice(0, 10)}
              selectedMapPoiId={selectedMapPoiId}
              hoveredStopId={hoveredStopId}
              onSelectPoi={(id) => {
                setSelectedMapPoiId(id);
                if (id) recordViewedTripPoi(id);
              }}
              onHoverPoi={(id) => setHoveredStopId(id)}
              savedIds={savedIds}
              pendingIds={pendingIds}
              onToggleFavorite={(_id, p) => {
                if (p) openCollectionPicker(p);
              }}
              tripIdeas={tripIdeas}
              onToggleAddTrip={handleToggleIdeaInTrip}
              routeCoordinates={activeTab === 'ideas' ? [] : routeCoordinates}
              numberedOrderMap={activeTab === 'ideas' ? new Map() : numberedOrderMap}
              routeDurationText={activeTab === 'ideas' ? undefined : routeDurationText}
            />
          )
        )}
      </div>

      {/* ─── MODAL TÌM KIẾM & THÊM VÀO CHUYẾN ĐI (CHUẨN 1:1 TRIPOVERVIEWVIEW & MINDTRIP) ─── */}
      {tripMetadataError && (
        <div
          className="fixed bottom-5 left-1/2 z-[130] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-medium text-rose-800 shadow-xl"
          role="alert"
          aria-live="assertive"
        >
          {tripMetadataError}
        </div>
      )}

      {headerModal === 'where' && (
        <TripWhereModal
          whereTarget={whereDraft}
          onChangeWhereTarget={setWhereDraft}
          byCar={byCarDraft}
          onToggleByCar={() => setByCarDraft((current) => !current)}
          onClose={closeTripMetadataModal}
          onSave={handleSaveWhere}
        />
      )}

      {headerModal === 'when' && (
        <TripWhenModal
          whenTab={whenTabDraft}
          onChangeWhenTab={setWhenTabDraft}
          rangeStart={rangeStartDraft}
          rangeEnd={rangeEndDraft}
          onChangeRangeStart={setRangeStartDraft}
          onChangeRangeEnd={setRangeEndDraft}
          flexibleDays={flexibleDaysDraft}
          onChangeFlexibleDays={setFlexibleDaysDraft}
          selectedMonth={selectedMonthDraft}
          onChangeSelectedMonth={setSelectedMonthDraft}
          onClose={closeTripMetadataModal}
          onSave={handleSaveWhen}
        />
      )}

      {headerModal === 'who' && (
        <TripWhoModal
          adults={peopleDraft}
          childrenCount={childrenDraft}
          infants={infantsDraft}
          pets={petsDraft}
          onChangeAdults={setPeopleDraft}
          onChangeChildren={setChildrenDraft}
          onChangeInfants={setInfantsDraft}
          onChangePets={setPetsDraft}
          onClose={closeTripMetadataModal}
          onSave={handleSaveWho}
        />
      )}

      {headerModal === 'budget' && (
        <TripBudgetModal
          categoryBudgets={categoryBudgetDraft}
          onChangeCategoryBudgets={setCategoryBudgetDraft}
          totalBudget={totalBudgetDraft}
          onChangeTotalBudget={setTotalBudgetDraft}
          onClose={closeTripMetadataModal}
          onSave={handleSaveBudget}
        />
      )}

      {headerModal === 'preferences' && (
        <TripPreferencesModal
          selectedInterests={preferencesDraft}
          preferenceText={preferenceTextDraft}
          onToggleInterest={(interestId) => setPreferencesDraft((current) => current.includes(interestId)
            ? current.filter((item) => item !== interestId)
            : [...current, interestId])}
          onChangePreferenceText={setPreferenceTextDraft}
          onClose={closeTripMetadataModal}
          onSave={handleSavePreferences}
        />
      )}

      {showAddIdeasModal && (
        <ItineraryAddPlacesModal
          activeDayAddModal={activeDayAddModal}
          modalTab={modalTab}
          onChangeModalTab={setModalTab}
          ideaPoisCount={ideaPois.length}
          savedCount={savedCount}
          modalCity={modalCity}
          onChangeModalCity={setModalCity}
          modalSearch={modalSearch}
          onChangeModalSearch={setModalSearch}
          modalCategory={modalCategory}
          onChangeModalCategory={setModalCategory}
          filteredPois={modalFilteredPois}
          days={plan.days}
          tripIdeas={tripIdeas}
          customIdeaInput={customIdeaInput}
          onChangeCustomIdeaInput={setCustomIdeaInput}
          onClose={() => {
            setShowAddIdeasModal(false);
            setActiveDayAddModal(null);
          }}
          onSelectPoi={(poiId) => {
            setSelectedMapPoiId(poiId);
            setShowAddIdeasModal(false);
            setActiveDayAddModal(null);
          }}
          onViewPoi={recordViewedTripPoi}
          onSubmitSearch={recordTripSearch}
          onAddToDay={handleAddIdeaToDay}
          onToggleIdeaInTrip={handleToggleIdeaInTrip}
          onSubmitCustomIdea={handleAddCustomIdea}
          onResetFilters={() => {
            setModalCategory('for-you');
            setModalSearch('');
            setModalCity('all');
          }}
        />
      )}

      {dayEditor && (
        <TripDayEditorModal
          dayEditor={dayEditor}
          dayDate={plan.days.find((day) => day.day_number === dayEditor.dayNumber)?.date}
          value={dayEditorValue}
          onChangeValue={setDayEditorValue}
          onClose={() => setDayEditor(null)}
          onSave={saveDayEditor}
        />
      )}

      {explanationPoi && (
        <ExplanationModal
          key={explanationPoi.id}
          poiId={explanationPoi.id}
          poiName={explanationPoi.name}
          scoreBreakdown={explanationPoi.recommendationScoreBreakdown ?? undefined}
          selectedInterests={Array.from(new Set([
            ...(recommendationTrip.recommendationTripData?.preferences ?? recommendationTrip.preferences ?? []),
            ...(recommendationTrip.preferenceText?.trim() ? [recommendationTrip.preferenceText.trim()] : []),
          ]))}
          tripDestination={recommendationTrip.destination}
          estimatedCost={explanationPoi.recommendationEstimatedCost}
          isOpen
          onClose={() => setExplanationPoi(null)}
        />
      )}
    </div>
  );
}

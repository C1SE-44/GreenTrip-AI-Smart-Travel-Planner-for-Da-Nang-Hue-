import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { getPoiExplanationFacts, type ExplanationFact, type PoiExplanationResponse } from '@/services/poiExplanation';
import type { RecommendationScoreBreakdown } from '@/services/recommendations';

/** Maps KG relationship types to user-friendly Vietnamese labels. */
const RELATIONSHIP_LABELS: Record<string, { icon: string; label: string }> = {
  IN_CATEGORY: { icon: 'ph-tag', label: 'Danh mục' },
  OFFERS_ACTIVITY: { icon: 'ph-bicycle', label: 'Hoạt động' },
  LOCATED_IN: { icon: 'ph-map-pin', label: 'Vị trí' },
  HAS_FEATURE: { icon: 'ph-star', label: 'Đặc điểm' },
  NEAR: { icon: 'ph-navigation-arrow', label: 'Lân cận' },
  BELONGS_TO: { icon: 'ph-folders', label: 'Thuộc về' },
};

function getRelMeta(rel: string): { icon: string; label: string } {
  return RELATIONSHIP_LABELS[rel] ?? { icon: 'ph-link-simple', label: rel.replace(/_/g, ' ') };
}

export interface ExplanationModalProps {
  poiId: string;
  poiName: string;
  explanationSnippet?: string;
  scoreBreakdown?: RecommendationScoreBreakdown;
  selectedInterests?: string[];
  tripDestination?: string;
  estimatedCost?: number | null;
  isOpen: boolean;
  onClose: () => void;
}

function normalizeForMatch(value: string): string {
  return value.toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[_\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const INTEREST_ALIASES: Record<string, string[]> = {
  beach: ['beach', 'sea', 'seaside', 'coast', 'biển'],
  nature: ['nature', 'thiên nhiên'],
  culture: ['culture', 'history', 'heritage', 'văn hóa', 'lịch sử', 'văn hóa lịch sử'],
  food: ['food', 'cuisine', 'ẩm thực'],
  coffee: ['coffee', 'cafe', 'cà phê'],
  checkin: ['checkin', 'check in', 'photography', 'chụp ảnh'],
  adventure: ['adventure', 'phiêu lưu'],
  relaxation: ['relaxation', 'relax', 'nghỉ dưỡng'],
  spiritual: ['spiritual', 'tâm linh'],
  local: ['local', 'trải nghiệm địa phương'],
};

const INTEREST_LABELS: Record<string, string> = {
  beach: 'Biển',
  nature: 'Thiên nhiên',
  culture: 'Văn hóa – Lịch sử',
  food: 'Ẩm thực',
  coffee: 'Cà phê',
  checkin: 'Check-in',
  adventure: 'Phiêu lưu',
  relaxation: 'Nghỉ dưỡng',
  spiritual: 'Tâm linh',
  local: 'Trải nghiệm địa phương',
};

// Keys mirror the category/activity taxonomy written by the Graph Builder.
const INTEREST_FACT_KEYS: Record<string, { activities: string[]; categories: string[] }> = {
  beach: { activities: ['water_recreation'], categories: [] },
  nature: { activities: ['nature_exploration'], categories: ['nature_landscape'] },
  culture: { activities: ['cultural_sightseeing'], categories: ['historical_culture'] },
  food: { activities: ['food_experience'], categories: ['food_dining'] },
  coffee: { activities: ['cafe_experience'], categories: ['cafe_refreshment'] },
  checkin: { activities: ['photography'], categories: [] },
  adventure: { activities: [], categories: [] },
  relaxation: { activities: ['wellness_relaxation'], categories: [] },
  spiritual: { activities: ['spiritual_visit'], categories: ['spiritual_religion'] },
  local: { activities: ['local_experience'], categories: [] },
};

const FACT_TARGET_LABELS: Record<string, string> = {
  water_recreation: 'Vui chơi dưới nước',
  nature_exploration: 'Khám phá thiên nhiên',
  cultural_sightseeing: 'Tham quan văn hóa, lịch sử',
  food_experience: 'Trải nghiệm ẩm thực',
  cafe_experience: 'Thưởng thức cà phê',
  photography: 'Chụp ảnh',
  wellness_relaxation: 'Chăm sóc sức khỏe và thư giãn',
  spiritual_visit: 'Trải nghiệm tâm linh',
  local_experience: 'Trải nghiệm địa phương',
  nightlife_entertainment: 'Giải trí buổi tối',
  nature_landscape: 'Cảnh quan và thiên nhiên',
  historical_culture: 'Văn hóa và lịch sử',
  food_dining: 'Ẩm thực',
  cafe_refreshment: 'Cà phê và giải khát',
  spiritual_religion: 'Tâm linh và tôn giáo',
};

const CATEGORY_TARGET_LABELS: Record<string, string> = {
  food_dining: 'Ẩm thực và quán ăn',
  cafe_refreshment: 'Quán cà phê và giải khát',
  historical_culture: 'Di tích lịch sử và văn hóa',
  nature_landscape: 'Cảnh quan và thiên nhiên',
  lodging_stay: 'Lưu trú và nghỉ dưỡng',
  spiritual_religion: 'Tâm linh và tôn giáo',
};

const LOCATION_TARGET_LABELS: Record<string, string> = {
  DANANG: 'Đà Nẵng',
  HUE: 'Huế',
};

const SCORE_FACTOR_LABELS: Record<string, string> = {
  preference_similarity: 'Mức phù hợp với sở thích',
  satisfaction: 'Đánh giá của khách',
  relative_popularity: 'Mức độ phổ biến trong nhóm địa điểm',
  green_score: 'Điểm xanh nội bộ',
  budget_alignment: 'Mức phù hợp ngân sách tham khảo',
};

function canonicalInterest(value: string): string | null {
  const normalized = normalizeForMatch(value);
  return Object.entries(INTEREST_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => normalizeForMatch(alias) === normalized),
  )?.[0] ?? null;
}

function personalizedInterests(
  scoreBreakdown: RecommendationScoreBreakdown | undefined,
  selectedInterests: string[] | undefined,
): string[] {
  if (!scoreBreakdown || !selectedInterests?.length) return [];
  const preferenceFactor = scoreBreakdown.factors.find((factor) => factor.key === 'preference_similarity');
  if (!preferenceFactor || preferenceFactor.contribution_points <= 0) return [];

  const selected = new Set(selectedInterests.map(canonicalInterest).filter((interest): interest is string => Boolean(interest)));
  return [...new Set((scoreBreakdown.matched_interests ?? [])
    .map(canonicalInterest)
    .filter((interest): interest is string => interest !== null && selected.has(interest)))];
}

function factSupportsInterest(interest: string, fact: ExplanationFact): boolean {
  const evidence = INTEREST_FACT_KEYS[interest];
  if (!evidence) return false;
  if (fact.relationship === 'OFFERS_ACTIVITY' && fact.target_type === 'Activity') {
    return evidence.activities.includes(fact.target_key);
  }
  if (fact.relationship === 'IN_CATEGORY' && fact.target_type === 'Category') {
    return evidence.categories.includes(fact.target_key);
  }
  return false;
}

function factTargetLabel(fact: ExplanationFact): string {
  const key = fact.target_key.trim();
  if (fact.target_type === 'Activity' && FACT_TARGET_LABELS[key]) {
    return FACT_TARGET_LABELS[key];
  }
  if (fact.target_type === 'Category' && CATEGORY_TARGET_LABELS[key]) {
    return CATEGORY_TARGET_LABELS[key];
  }
  if (fact.target_type === 'Location' && LOCATION_TARGET_LABELS[key.toUpperCase()]) {
    return LOCATION_TARGET_LABELS[key.toUpperCase()];
  }
  return FACT_TARGET_LABELS[fact.target_key] ?? fact.target_name ?? fact.target_key;
}

function personalizedFactDescription(interest: string, fact: ExplanationFact): string {
  const label = INTEREST_LABELS[interest];
  const evidence = factTargetLabel(fact);
  if (fact.relationship === 'OFFERS_ACTIVITY') {
    return `Bạn chọn ${label}. Sở thích này đã góp vào điểm gợi ý; dữ liệu địa điểm ghi nhận hoạt động ${evidence}.`;
  }
  return `Bạn chọn ${label}. Sở thích này đã góp vào điểm gợi ý; địa điểm thuộc danh mục ${evidence}.`;
}

function scoreFactorLabel(key: string, rawLabel: string): string {
  const knownLabel = SCORE_FACTOR_LABELS[key];
  if (knownLabel) return knownLabel;
  const cleaned = rawLabel
    .replace(/\bPB\s?09\b|\bTF[\s-]?IDF\b|\bCosine\b/gi, '')
    .replace(/\btaxonomy\b/gi, 'danh mục')
    .replace(/\s*\(\s*\)/g, '')
    .replace(/\s+([,.)])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || 'Yếu tố gợi ý';
}

function shouldShowSnippet(snippet?: string): boolean {
  return Boolean(snippet?.trim() && !/\bPB\s?09\b|TF[\s-]?IDF|cosine|độ tương đồng|tín hiệu nội dung/i.test(snippet));
}

function activityMatchesDestination(fact: ExplanationFact, destination?: string): boolean {
  if (fact.relationship !== 'LOCATED_IN' || !destination) return false;
  const normalizedArea = normalizeForMatch(fact.target_name ?? fact.target_key);
  const normalizedDestination = normalizeForMatch(destination);
  const isHue = normalizedArea.includes('hue') && normalizedDestination.includes('hue');
  const isDaNang = normalizedArea.includes('da nang') && normalizedDestination.includes('da nang');
  return isHue || isDaNang;
}

function factSourceDescription(source: PoiExplanationResponse['fact_source']): string | null {
  if (source === 'NEO4J') return 'Nguồn dữ kiện: quan hệ được đọc từ Neo4j Knowledge Graph.';
  if (source === 'POSTGRESQL_FALLBACK') return 'Nguồn dự phòng: dữ liệu PostgreSQL. Các dữ kiện này chưa được xác minh từ Neo4j.';
  if (source === 'CSV_FALLBACK') return 'Nguồn dự phòng: tệp POI CSV. Các dữ kiện này chưa được xác minh từ Neo4j.';
  return null;
}

function scoreFactorSourceDescription(source?: string | null): string | null {
  if (source === 'taxonomy_and_tfidf') return 'Đối chiếu danh mục và nội dung địa điểm với sở thích.';
  if (source === 'local_business_proxy') return 'Ước lượng dựa trên cờ cơ sở bản địa; đây không phải chứng nhận xanh.';
  if (source === 'default_proxy') return 'Dùng giá trị mặc định vì hồ sơ chưa có điểm xanh.';
  if (source === 'missing_default_zero') return 'Hồ sơ chưa có điểm hài lòng; yếu tố này không đóng góp vào gợi ý.';
  if (source === 'poi_rating') return 'Nguồn: điểm hài lòng của POI.';
  if (source === 'poi_green_score') return 'Điểm xanh nội bộ của địa điểm; không đồng nghĩa chứng nhận xanh.';
  return null;
}

function scoreBreakdownDescription(algorithm: string): string {
  if (algorithm === 'preference_first_hybrid') {
    return 'Sở thích được ưu tiên; đánh giá, thông tin xanh, mức phổ biến và ngân sách là các yếu tố bổ sung.';
  }
  if (algorithm === 'selected_ideas_context') {
    return 'Gợi ý cân nhắc khoảng cách tới địa điểm đã chọn, trải nghiệm, đánh giá và ngân sách.';
  }
  if (algorithm === 'legacy_budget_quality') {
    return 'Gợi ý cân nhắc đánh giá, mức phổ biến và phân khúc ngân sách.';
  }
  if (algorithm === 'content_quality_green') {
    return 'Gợi ý cân nhắc đánh giá, mức phổ biến, thông tin xanh và ngân sách.';
  }
  return 'Gợi ý được tính từ các yếu tố trong danh sách bên trên.';
}

type FetchState = 'idle' | 'loading' | 'success' | 'error' | 'empty';

export default function ExplanationModal({
  poiId,
  poiName,
  explanationSnippet,
  scoreBreakdown,
  selectedInterests,
  tripDestination,
  estimatedCost,
  isOpen,
  onClose,
}: ExplanationModalProps) {
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [facts, setFacts] = useState<ExplanationFact[]>([]);
  const [kgPoi, setKgPoi] = useState<PoiExplanationResponse['poi'] | null>(null);
  const [factSource, setFactSource] = useState<PoiExplanationResponse['fact_source']>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const [loadedPoiId, setLoadedPoiId] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const aiHeadingId = useId();
  const reasonHeadingId = useId();
  const kgHeadingId = useId();

  const fetchFacts = useCallback(async (targetPoiId: string) => {
    // Abort any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFetchState('loading');
    setLoadedPoiId(targetPoiId);
    setFacts([]);
    setKgPoi(null);
    setFactSource(null);
    setErrorMsg('');

    try {
      const data = await getPoiExplanationFacts(targetPoiId, controller.signal);

      // Guard against stale response
      if (controller.signal.aborted || abortRef.current !== controller) return;

      if (data.poi.id !== targetPoiId) {
        throw new Error('Dữ liệu giải thích không khớp địa điểm đang chọn. Vui lòng thử lại.');
      }

      setKgPoi(data.poi);
      setFactSource(data.fact_source ?? null);
      if (data.facts.length === 0) {
        setFetchState('empty');
      } else {
        setFacts(data.facts);
        setFetchState('success');
      }
    } catch (err: unknown) {
      if (controller.signal.aborted || abortRef.current !== controller) return;

      const status = typeof err === 'object' && err !== null && 'status' in err
        && typeof err.status === 'number'
        ? err.status
        : undefined;
      if (status === 404) {
        setFetchState('empty');
        setErrorMsg('Không tìm thấy địa điểm đang hoạt động.');
      } else if (status === 503) {
        setFetchState('error');
        setErrorMsg('Thông tin giải thích tạm thời chưa khả dụng. Vui lòng thử lại sau.');
      } else {
        setFetchState('error');
        setErrorMsg(status
          ? 'Không thể tải thông tin giải thích. Vui lòng thử lại.'
          : err instanceof Error
            ? err.message
            : 'Đã xảy ra lỗi khi tải thông tin giải thích.');
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen && poiId) {
      void fetchFacts(poiId);
    }

    return () => {
      abortRef.current?.abort();
    };
  }, [isOpen, poiId, fetchFacts]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Never render facts from the previous POI while the next effect starts.
  const visibleState = loadedPoiId === poiId ? fetchState : 'loading';
  const sourceDescription = factSourceDescription(factSource);
  const supportedPersonalizedInterests = personalizedInterests(scoreBreakdown, selectedInterests)
    .flatMap((interest) => {
      const supportedFact = facts.find((fact) => factSupportsInterest(interest, fact));
      return supportedFact ? [{ interest, fact: supportedFact }] : [];
    });
  const matchingDestinationFacts = tripDestination
    ? facts.filter((fact) => activityMatchesDestination(fact, tripDestination))
    : [];
  const displaySnippet = shouldShowSnippet(explanationSnippet) ? explanationSnippet : undefined;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={(event) => { event.stopPropagation(); onClose(); }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
        if (event.key === 'Tab') {
          const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]');
          const first = controls?.[0];
          const last = controls?.[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Vì sao nơi này: ${poiName}`}
      aria-describedby={headingId}
    >
      <div
        className="auto-hide-scrollbar relative mx-auto max-h-[90dvh] w-[calc(100%-1rem)] max-w-lg overflow-y-auto rounded-2xl bg-white shadow-[0_12px_40px_rgba(43,38,34,0.16)] sm:mx-4 sm:max-h-[85vh] sm:w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-base font-bold text-gray-900">
              Vì sao nơi này?
            </h2>
            <p className="mt-0.5 break-words text-[13px] text-gray-600">{poiName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label="Đóng"
          >
            <i className="ph ph-x text-lg" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4 sm:space-y-5 sm:px-5">
          {visibleState === 'success' && (supportedPersonalizedInterests.length > 0 || matchingDestinationFacts.length > 0) && (
            <section aria-labelledby={reasonHeadingId} className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <h3 id={reasonHeadingId} className="mb-2 flex items-center gap-1.5 text-sm font-bold text-emerald-950">
                <i className="ph ph-sparkle text-emerald-700" aria-hidden="true" />
                Vì sao phù hợp với chuyến đi?
              </h3>
              <ul className="space-y-2">
                {supportedPersonalizedInterests.map(({ interest, fact }) => (
                  <li key={`interest-${interest}-${fact.target_key}`} className="text-sm leading-relaxed text-emerald-950">
                    {personalizedFactDescription(interest, fact)}
                  </li>
                ))}
                {matchingDestinationFacts.map((fact) => (
                  <li key={`destination-${fact.target_key}`} className="text-sm leading-relaxed text-emerald-950">
                    Địa điểm nằm tại {factTargetLabel(fact)}, thuộc khu vực chuyến đi bạn đã chọn.
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby={kgHeadingId} aria-live="polite" aria-busy={visibleState === 'loading'}>
            <h3
              id={kgHeadingId}
              className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-900"
            >
              <i className="ph ph-graph text-gray-600" aria-hidden="true" />
              Thông tin về địa điểm
            </h3>
            {sourceDescription && (
              <p className="mb-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed text-gray-700">
                {sourceDescription}
              </p>
            )}

            {/* Loading state */}
            {(visibleState === 'loading' || visibleState === 'idle') && (
              <div className="space-y-2.5" aria-label="Đang tải thông tin địa điểm">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 animate-pulse">
                    <div className="h-5 w-5 rounded bg-gray-200" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-20 rounded bg-gray-200" />
                      <div className="h-3 w-36 rounded bg-gray-200" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Populated state */}
            {visibleState === 'success' && facts.length > 0 && (
              <ul className="space-y-2" role="list" aria-label="Thông tin địa điểm">
                {facts.map((fact, i) => {
                  const meta = getRelMeta(fact.relationship);
                  return (
                    <li
                      key={`${fact.relationship}-${fact.target_key}-${i}`}
                      className="flex items-start gap-3 rounded-xl bg-gray-50 px-4 py-3 text-[13px]"
                    >
                      <i
                        className={`ph ${meta.icon} mt-0.5 shrink-0 text-base text-gray-500`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1 break-words">
                        <span className="font-semibold text-gray-700">{meta.label}:</span>{' '}
                        <span className="text-gray-600">
                          {factTargetLabel(fact)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Empty state */}
            {visibleState === 'empty' && (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-200 py-6 text-center">
                <i className="ph ph-tree-structure mb-2 text-2xl text-gray-300" aria-hidden="true" />
                <p className="text-[13px] font-medium text-gray-600">
                  {errorMsg || 'Chưa có thông tin giải thích cho địa điểm này.'}
                </p>
                <button
                  type="button"
                  onClick={() => fetchFacts(poiId)}
                  className="mt-3 min-h-11 rounded-full bg-gray-100 px-4 py-1.5 text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  Thử lại
                </button>
              </div>
            )}

            {/* Error state */}
            {visibleState === 'error' && (
              <div className="flex flex-col items-center rounded-xl border border-red-200 bg-red-50 py-6 text-center">
                <i className="ph ph-warning-circle mb-2 text-2xl text-red-400" aria-hidden="true" />
                <p role="alert" className="text-[13px] font-medium text-red-700">
                  {errorMsg}
                </p>
                <button
                  type="button"
                  onClick={() => fetchFacts(poiId)}
                  className="mt-3 min-h-11 rounded-full bg-red-100 px-4 py-1.5 text-[12px] font-semibold text-red-700 transition-colors hover:bg-red-200 focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  Thử lại
                </button>
              </div>
            )}

            {/* KG POI metadata */}
            {visibleState === 'success' && kgPoi?.is_local_business && (
              <div className="mt-3 flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-800">
                <i className="ph ph-storefront" aria-hidden="true" />
                Doanh nghiệp địa phương
                {kgPoi.local_business_type && (
                  <span className="text-emerald-800"> · {kgPoi.local_business_type}</span>
                )}
              </div>
            )}
          </section>

          {!scoreBreakdown && displaySnippet && (
            <section aria-labelledby={aiHeadingId}>
              <h3 id={aiHeadingId} className="mb-2 flex items-center gap-1.5 text-sm font-bold text-emerald-900">
                <i className="ph ph-sparkle text-emerald-700" aria-hidden="true" />
                Lý do gợi ý
              </h3>
              <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-950">
                {displaySnippet}
              </p>
            </section>
          )}

          {scoreBreakdown && scoreBreakdown.factors.length > 0 && (
            <details className="rounded-2xl border border-gray-200 bg-white">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 [&::-webkit-details-marker]:hidden">
                <span>Chi tiết cách tính điểm</span>
                <i className="ph ph-caret-down text-base text-gray-600" aria-hidden="true" />
              </summary>
              <section aria-labelledby={aiHeadingId} className="border-t border-gray-100 px-4 pb-4 pt-3">
                <h3 id={aiHeadingId} className="mb-2 text-sm font-bold text-gray-900">
                  Các yếu tố trong điểm gợi ý
                </h3>
                <ul className="space-y-2" aria-label="Các yếu tố trong điểm gợi ý">
                  {scoreBreakdown.factors.map((factor) => (
                    <li key={factor.key} className="flex items-start justify-between gap-3 rounded-xl bg-gray-50 px-3 py-3 text-[13px]">
                      <div className="min-w-0">
                        <p className="text-gray-700">{scoreFactorLabel(factor.key, factor.label)}</p>
                        {typeof factor.normalized_value === 'number' && (
                          <p className="mt-0.5 text-xs text-gray-600">Mức độ: {(factor.normalized_value * 100).toFixed(0)}%.</p>
                        )}
                        {scoreFactorSourceDescription(factor.source) && (
                          <p className="mt-0.5 text-xs text-gray-600">{scoreFactorSourceDescription(factor.source)}</p>
                        )}
                      </div>
                      <span className="shrink-0 font-semibold text-gray-900">
                        {factor.contribution_points > 0 ? '+' : ''}{factor.contribution_points.toFixed(1)} điểm
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-gray-600">
                  {scoreBreakdownDescription(scoreBreakdown.algorithm)}
                </p>
                {scoreBreakdown.budget_time_filter_applied && (
                  <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[13px] leading-relaxed text-amber-950">
                    Địa điểm này phù hợp với ngân sách và thời lượng tham quan đã chọn.
                    {typeof estimatedCost === 'number' && ` Chi phí tham khảo: ${new Intl.NumberFormat('vi-VN').format(Math.round(estimatedCost))} ₫/người.`}
                  </p>
                )}
              </section>
            </details>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

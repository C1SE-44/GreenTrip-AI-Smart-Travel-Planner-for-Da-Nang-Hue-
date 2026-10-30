import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { getPoiExplanationFacts, type ExplanationFact, type PoiExplanationResponse } from '@/services/poiExplanation';

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
  isOpen: boolean;
  onClose: () => void;
}

type FetchState = 'idle' | 'loading' | 'success' | 'error' | 'empty';

export default function ExplanationModal({
  poiId,
  poiName,
  explanationSnippet,
  isOpen,
  onClose,
}: ExplanationModalProps) {
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [facts, setFacts] = useState<ExplanationFact[]>([]);
  const [kgPoi, setKgPoi] = useState<PoiExplanationResponse['poi'] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const [loadedPoiId, setLoadedPoiId] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const aiHeadingId = useId();
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
    setErrorMsg('');

    try {
      const data = await getPoiExplanationFacts(targetPoiId, controller.signal);

      // Guard against stale response
      if (controller.signal.aborted || abortRef.current !== controller) return;

      if (data.poi.id !== targetPoiId) {
        throw new Error('Dữ liệu giải thích không khớp địa điểm đang chọn. Vui lòng thử lại.');
      }

      if (data.facts.length === 0) {
        setFetchState('empty');
      } else {
        setFacts(data.facts);
        setKgPoi(data.poi);
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
        setErrorMsg('Chưa có dữ liệu Knowledge Graph cho địa điểm này.');
      } else if (status === 503) {
        setFetchState('error');
        setErrorMsg('Dịch vụ Knowledge Graph tạm thời không khả dụng. Vui lòng thử lại sau.');
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
        className="auto-hide-scrollbar relative mx-4 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-[0_12px_40px_rgba(43,38,34,0.16)]"
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

        <div className="px-5 py-4 space-y-5">
          {/* Section A: AI Recommendation Explanation */}
          {explanationSnippet && (
            <section aria-labelledby={aiHeadingId}>
              <h3
                id={aiHeadingId}
                className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-emerald-900"
              >
                <i className="ph ph-sparkle text-emerald-600" aria-hidden="true" />
                Lý do AI gợi ý
              </h3>
              <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[13px] leading-relaxed text-emerald-950">
                {explanationSnippet}
              </p>
            </section>
          )}

          {/* Section B: Knowledge Graph Facts */}
          <section aria-labelledby={kgHeadingId} aria-live="polite" aria-busy={visibleState === 'loading'}>
            <h3
              id={kgHeadingId}
              className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-gray-800"
            >
              <i className="ph ph-graph text-gray-600" aria-hidden="true" />
              Vì sao nơi này?
            </h3>

            {/* Loading state */}
            {(visibleState === 'loading' || visibleState === 'idle') && (
              <div className="space-y-2.5" aria-label="Đang tải dữ liệu Knowledge Graph">
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
              <ul className="space-y-2" role="list" aria-label="Thông tin Knowledge Graph">
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
                          {fact.target_name || fact.target_key}
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
                  {errorMsg || 'Chưa có dữ liệu Knowledge Graph cho địa điểm này.'}
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
        </div>
      </div>
    </div>,
    document.body,
  );
}

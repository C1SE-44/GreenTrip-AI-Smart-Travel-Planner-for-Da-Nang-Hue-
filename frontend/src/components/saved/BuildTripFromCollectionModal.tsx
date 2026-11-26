import { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, Coffee, Compass, Loader2, MapPin, Sparkles, Utensils, X } from 'lucide-react';
import { evaluateLocalAuthentic, normalizePoi, type Poi } from '@/data/pois';
import { useSavedPlaces } from '@/context/SavedPlacesContext';
import { getCollectionPlaces, type SavedPlaceCollection } from '@/services/savedPlaces';
import type { TripItinerary } from '@/services/itineraryService';
import { evaluateCentralVietnamAdvisories } from '@/utils/centralVietnamAdvisories';
import {
  applyOptionalMealGapsToPlan,
  buildItineraryFromSavedCollection,
  recommendDaysForSavedPois,
  type CollectionTripPacing,
} from '@/utils/savedCollectionScheduler';
import CentralVietnamAdvisoryBanner from '@/components/planner/CentralVietnamAdvisoryBanner';

export interface BuildTripFromCollectionResultPayload {
  title: string;
  destination: string;
  startDate: string;
  daysCount: number;
  peopleCount: number;
  pacing: CollectionTripPacing;
  savedPoiIds: string[];
  itinerary: TripItinerary;
}

export interface BuildTripFromCollectionModalProps {
  isOpen: boolean;
  allPois: Poi[];
  initialCollectionId?: string | null;
  initialCollectionName?: string | null;
  initialCollectionPois?: Poi[] | null;
  onClose: () => void;
  onNavigateToExplore?: () => void;
  onConfirmBuild: (payload: BuildTripFromCollectionResultPayload) => Promise<void> | void;
}

function getVietnamTodayIso(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default function BuildTripFromCollectionModal({
  isOpen,
  allPois,
  initialCollectionId = null,
  initialCollectionName = null,
  initialCollectionPois = null,
  onClose,
  onNavigateToExplore,
  onConfirmBuild,
}: BuildTripFromCollectionModalProps) {
  const { collections } = useSavedPlaces();

  const [selectedCollectionId, setSelectedCollectionId] = useState<string>(
    initialCollectionId || collections[0]?.collection_id || ''
  );
  const [collectionPois, setCollectionPois] = useState<Poi[]>(initialCollectionPois ?? []);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState<string>(() => getVietnamTodayIso());
  const [daysCount, setDaysCount] = useState(2);
  const [daysTouched, setDaysTouched] = useState(false);
  const [peopleCount, setPeopleCount] = useState(2);
  const [pacing, setPacing] = useState<CollectionTripPacing>('Balanced');
  const [includeRestBreaks, setIncludeRestBreaks] = useState(true);
  const [preferLocalAuthentic, setPreferLocalAuthentic] = useState(true);
  const [acceptedGapIds, setAcceptedGapIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const activeCollection: SavedPlaceCollection | undefined = useMemo(
    () => collections.find((c) => c.collection_id === selectedCollectionId),
    [collections, selectedCollectionId]
  );

  const collectionName =
    activeCollection?.name || initialCollectionName || 'Bộ sưu tập đã lưu';

  useEffect(() => {
    if (!isOpen) return;
    const defaultId = initialCollectionId || collections[0]?.collection_id || '';
    setSelectedCollectionId(defaultId);
    setDaysTouched(false);
    setAcceptedGapIds([]);
    setLoadError(null);
    if (initialCollectionPois && initialCollectionPois.length > 0 && initialCollectionId === defaultId) {
      setCollectionPois(initialCollectionPois);
      const recDays = recommendDaysForSavedPois(initialCollectionPois);
      setDaysCount(recDays);
      setTitle(`Hành trình ${initialCollectionName || activeCollection?.name || 'từ bộ sưu tập'}`);
    } else {
      setTitle('');
    }
  }, [isOpen, initialCollectionId, initialCollectionName, initialCollectionPois, collections, activeCollection?.name]);

  useEffect(() => {
    if (!isOpen) return;
    if (!selectedCollectionId) {
      setCollectionPois([]);
      return;
    }
    if (
      initialCollectionPois &&
      initialCollectionPois.length > 0 &&
      selectedCollectionId === initialCollectionId &&
      reloadKey === 0
    ) {
      setCollectionPois(initialCollectionPois);
      return;
    }

    let active = true;
    setLoadingPlaces(true);
    setLoadError(null);
    getCollectionPlaces(selectedCollectionId)
      .then((res) => {
        if (!active) return;
        const normalized = (res.items ?? [])
          .map((item) => normalizePoi(item, true))
          .filter((p): p is Poi => p !== null);
        setCollectionPois(normalized);
        if (!daysTouched) {
          setDaysCount(recommendDaysForSavedPois(normalized));
        }
      })
      .catch(() => {
        if (active) setLoadError('Chưa tải được danh sách địa điểm trong bộ sưu tập.');
      })
      .finally(() => {
        if (active) setLoadingPlaces(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, selectedCollectionId, initialCollectionId, initialCollectionPois, reloadKey, daysTouched]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const builtPreview = useMemo(
    () =>
      buildItineraryFromSavedCollection({
        collectionName,
        savedPois: collectionPois,
        allPois,
        daysCount,
        startDate,
        pacing,
        includeRestBreaks,
        preferLocalAuthentic,
      }),
    [
      collectionName,
      collectionPois,
      allPois,
      daysCount,
      startDate,
      pacing,
      includeRestBreaks,
      preferLocalAuthentic,
    ]
  );

  const advisories = useMemo(
    () =>
      evaluateCentralVietnamAdvisories(
        {
          destination: builtPreview.destinationSummary,
          startDate,
          daysCount,
        },
        builtPreview.itinerary,
        allPois
      ),
    [builtPreview, startDate, daysCount, allPois]
  );

  if (!isOpen) return null;

  const effectiveTitle =
    title.trim() || `Hành trình từ “${collectionName}”`;

  const toggleGapSuggestion = (id: string) => {
    setAcceptedGapIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleConfirm = async () => {
    if (collectionPois.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const accepted = builtPreview.optionalMealGapSuggestions.filter((sug) =>
        acceptedGapIds.includes(sug.suggestionId)
      );
      const finalPlan = applyOptionalMealGapsToPlan(
        { ...builtPreview.itinerary, title: effectiveTitle },
        accepted
      );
      const savedPoiIds = Array.from(
        new Set([
          ...collectionPois.map((p) => p.id),
          ...accepted.map((a) => a.poi.id),
        ])
      );
      await onConfirmBuild({
        title: effectiveTitle,
        destination: builtPreview.destinationSummary,
        startDate,
        daysCount,
        peopleCount,
        pacing,
        savedPoiIds,
        itinerary: finalPlan,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-[2px] p-2 sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="build-from-collection-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[700px] max-h-[92vh] bg-white rounded-3xl border border-neutral-200 shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-neutral-200 bg-emerald-50/40 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-800">
              <Sparkles size={14} aria-hidden="true" />
              <span>Xếp lịch từ Kho đã lưu</span>
            </span>
            <h2
              id="build-from-collection-title"
              className="text-lg font-extrabold text-neutral-950 mt-0.5 leading-snug"
            >
              Sắp xếp đúng các địa điểm bạn đã thích
            </h2>
            <p className="text-xs text-neutral-600 mt-0.5">
              Không tự bịa điểm tham quan ngoài bộ sưu tập · Tự gom cụm theo thành phố &amp; quãng đường ngắn nhất
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại xếp lịch từ bộ sưu tập"
            className="min-h-[44px] min-w-[44px] rounded-full bg-white border border-neutral-200 hover:border-neutral-900 text-neutral-700 hover:text-neutral-950 flex items-center justify-center transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {collections.length === 0 && collectionPois.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-center space-y-3">
              <p className="text-sm font-bold text-neutral-900">
                Bạn chưa có bộ sưu tập nào được lưu
              </p>
              <p className="text-xs text-neutral-600">
                Hãy khám phá các điểm đến xanh tại Đà Nẵng &amp; Huế và bấm thả tim để gom vào bộ sưu tập trước nhé.
              </p>
              {onNavigateToExplore && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={onNavigateToExplore}
                    className="min-h-[44px] px-5 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <Compass size={14} aria-hidden="true" />
                    <span>Đi tới trang Khám phá</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Bộ sưu tập + thông số cơ bản */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-neutral-800">Chọn bộ sưu tập</span>
                  <select
                    value={selectedCollectionId}
                    onChange={(e) => {
                      setSelectedCollectionId(e.target.value);
                      setDaysTouched(false);
                      setAcceptedGapIds([]);
                    }}
                    className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    {collections.map((c) => (
                      <option key={c.collection_id} value={c.collection_id}>
                        {c.name} ({c.place_count} điểm)
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-bold text-neutral-800">Tên chuyến đi</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={`Hành trình từ “${collectionName}”`}
                    className="min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm text-neutral-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-bold text-neutral-800 flex items-center gap-1">
                    <Calendar size={13} aria-hidden="true" /> Ngày bắt đầu
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm text-neutral-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-neutral-800">Số ngày</span>
                    <input
                      type="number"
                      min={1}
                      max={14}
                      value={daysCount}
                      onChange={(e) => {
                        setDaysTouched(true);
                        setDaysCount(Math.max(1, Math.min(14, Number(e.target.value) || 1)));
                      }}
                      className="min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm text-neutral-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-neutral-800">Số khách</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={peopleCount}
                      onChange={(e) =>
                        setPeopleCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                      }
                      className="min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm text-neutral-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    />
                  </label>
                </div>
              </div>

              {/* Nhịp độ & Tùy chọn */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Nhịp chuyến đi">
                  {([
                    ['Relaxed', '🌿 Thong thả'],
                    ['Balanced', '⚖️ Cân bằng'],
                    ['Fast', '⚡ Dày đặc'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={pacing === key}
                      onClick={() => setPacing(key)}
                      className={`min-h-[40px] px-3.5 rounded-full border text-xs font-bold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                        pacing === key
                          ? 'bg-neutral-900 border-neutral-900 text-white'
                          : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={includeRestBreaks}
                    onClick={() => setIncludeRestBreaks(!includeRestBreaks)}
                    className={`min-h-[40px] px-3.5 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                      includeRestBreaks
                        ? 'bg-emerald-50 border-emerald-700 text-emerald-950'
                        : 'bg-white border-neutral-300 text-neutral-700'
                    }`}
                  >
                    <Coffee size={13} aria-hidden="true" />
                    <span>Chèn giờ nghỉ trưa</span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={preferLocalAuthentic}
                    onClick={() => setPreferLocalAuthentic(!preferLocalAuthentic)}
                    className={`min-h-[40px] px-3.5 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                      preferLocalAuthentic
                        ? 'bg-emerald-50 border-emerald-700 text-emerald-950'
                        : 'bg-white border-neutral-300 text-neutral-700'
                    }`}
                  >
                    <Compass size={13} aria-hidden="true" />
                    <span>Ưu tiên quán bản địa ít đông</span>
                  </button>
                </div>
              </div>

              {/* Cảnh báo miền Trung tích hợp trực tiếp */}
              <CentralVietnamAdvisoryBanner
                advisories={advisories}
                onAddHueDay={() => {
                  setDaysTouched(true);
                  setDaysCount((d) => Math.min(14, d + 1));
                }}
              />

              {/* Trạng thái tải / lỗi / trống */}
              {loadingPlaces ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-700">
                  <Loader2 size={18} className="animate-spin" />
                  <span>Đang tải các địa điểm trong bộ sưu tập...</span>
                </div>
              ) : loadError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-900 flex items-center justify-between gap-3">
                  <span>{loadError}</span>
                  <button
                    type="button"
                    onClick={() => setReloadKey((k) => k + 1)}
                    className="min-h-[40px] px-3.5 rounded-full bg-white border border-red-300 font-bold text-red-900 cursor-pointer"
                  >
                    Thử lại
                  </button>
                </div>
              ) : collectionPois.length === 0 ? (
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-center text-xs text-neutral-700">
                  Bộ sưu tập này hiện chưa có địa điểm nào. Hãy thêm vài nơi yêu thích trước khi xếp lịch.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Lịch xem trước phân theo ngày */}
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-extrabold uppercase tracking-wide text-neutral-900">
                        Xem trước lịch trình ({builtPreview.scheduledSavedPois.length} điểm đã lưu)
                      </h3>
                      <span className="text-xs font-semibold text-emerald-800">
                        {builtPreview.destinationSummary} · {daysCount} ngày
                      </span>
                    </div>

                    <div className="space-y-2">
                      {builtPreview.itinerary.days.map((day) => (
                        <div
                          key={day.day_number}
                          className="rounded-xl border border-neutral-200 bg-white p-2.5 space-y-1"
                        >
                          <p className="text-xs font-bold text-neutral-900">{day.title}</p>
                          {day.stops.length === 0 ? (
                            <p className="text-xs text-neutral-500">Ngày trống · có thể bổ sung điểm sau</p>
                          ) : (
                            <ul className="space-y-1">
                              {day.stops.map((stop) => (
                                <li
                                  key={stop.stop_id}
                                  className="text-xs text-neutral-700 flex items-center justify-between gap-2"
                                >
                                  <span className="truncate">
                                    <span className="font-semibold text-neutral-900">
                                      {stop.start_time}
                                    </span>{' '}
                                    · {stop.title}
                                  </span>
                                  <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                      stop.stop_type === 'rest'
                                        ? 'bg-neutral-100 text-neutral-700'
                                        : 'bg-emerald-50 text-emerald-800'
                                    }`}
                                  >
                                    {stop.stop_type === 'rest' ? 'Nghỉ trưa' : 'Từ bộ sưu tập'}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>

                    {builtPreview.recommendedStays.length > 0 && (
                      <p className="text-xs text-neutral-700 pt-1">
                        <span className="font-bold text-neutral-900">Lưu trú đã lưu ({builtPreview.recommendedStays.length}): </span>
                        {builtPreview.recommendedStays.map((s) => s.name).join(', ')} (giữ trong Ý tưởng làm nơi nghỉ chính).
                      </p>
                    )}

                    {builtPreview.overflowPois.length > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-950">
                        <span className="font-bold">Còn {builtPreview.overflowPois.length} điểm chưa xếp vừa trong {daysCount} ngày: </span>
                        {builtPreview.overflowPois.map((p) => p.name).join(', ')}. Bạn vẫn có thể tăng số ngày hoặc lấy ra từ mục Ý tưởng.
                      </div>
                    )}
                  </div>

                  {/* Gợi ý quán ăn lấp bữa trống (opt-in) */}
                  {builtPreview.optionalMealGapSuggestions.length > 0 && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/45 p-3.5 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-950">
                        <Utensils size={14} className="text-emerald-700 shrink-0" aria-hidden="true" />
                        <span>Gợi ý chèn quán ăn vào khung giờ trống (không tự ép nếu bạn không chọn)</span>
                      </div>
                      <div className="space-y-1.5">
                        {builtPreview.optionalMealGapSuggestions.map((sug) => {
                          const checked = acceptedGapIds.includes(sug.suggestionId);
                          const auth = evaluateLocalAuthentic(sug.poi);
                          return (
                            <label
                              key={sug.suggestionId}
                              className={`min-h-[44px] flex items-center justify-between gap-2.5 rounded-xl border p-2.5 cursor-pointer transition ${
                                checked
                                  ? 'border-emerald-700 bg-white shadow-2xs'
                                  : 'border-neutral-200 bg-white/80 hover:border-neutral-400'
                              }`}
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleGapSuggestion(sug.suggestionId)}
                                  className="sr-only"
                                />
                                <span
                                  aria-hidden="true"
                                  className={`mt-0.5 h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ${
                                    checked
                                      ? 'bg-emerald-700 border-emerald-700 text-white'
                                      : 'bg-white border-neutral-400 text-transparent'
                                  }`}
                                >
                                  <Check size={13} strokeWidth={3} />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-neutral-950 truncate">
                                    Ngày {sug.dayNumber} ({sug.slotLabel} · {sug.suggestedStartTime}): {sug.poi.name}
                                  </p>
                                  <p className="text-xs text-neutral-600 truncate">
                                    {sug.reason}
                                    {auth.badgeLabel ? ` · ${auth.badgeLabel}` : ''}
                                  </p>
                                </div>
                              </div>
                              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
                                <MapPin size={11} aria-hidden="true" />
                                Gợi ý lấp bữa trống
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-neutral-200 bg-neutral-50/80 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-full border border-neutral-300 bg-white hover:bg-neutral-100 text-xs font-semibold text-neutral-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={submitting || loadingPlaces || collectionPois.length === 0}
            onClick={() => void handleConfirm()}
            className="min-h-[44px] px-5 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            <span>Tạo lịch trình từ bộ sưu tập</span>
          </button>
        </div>
      </div>
    </div>
  );
}

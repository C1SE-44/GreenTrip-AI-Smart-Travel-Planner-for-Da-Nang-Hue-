import React, { useEffect, useMemo, useRef, useState } from 'react';
import { searchLandingCatalogue } from '@/services/landingCatalogue';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, X } from 'lucide-react';
import {
  DESTINATION_OPTIONS,
  DURATION_OPTIONS,
  buildInitialDayPlans,
  moveSampleStop,
  applySamplePlace,
  findSamplePreset,
  getPresetKey,
  getSupportedDurationsForDestination,
  type DestinationScope,
  type DurationDays,
  type ItineraryDayPlan,
  type PlaceCatalogItem,
} from '@/data/landingSampleModel';

interface StudioSampleSheetProps {
  catalogue: PlaceCatalogItem[];
  active: boolean;
  saving: boolean;
  saveError: string;
  onSave: (plan: ItineraryDayPlan[], places: PlaceCatalogItem[], destination: DestinationScope, days: DurationDays) => void;
  initialDestination?: DestinationScope;
  initialDays?: DurationDays;
  onClose: () => void;
  onSelectionChange: (destination: DestinationScope, days: DurationDays) => void;
}

interface PickerTarget {
  mode: 'add' | 'replace';
  dayNumber: number;
  replaceInstanceId?: string;
}

interface PlaceDetailState {
  place: PlaceCatalogItem;
  timeSlot: string | null;
}

type ModalScreenView = 'sheet' | 'planner-preview';
type PickerRegionFilter = 'Tất cả' | 'Đà Nẵng' | 'Huế';

const formatStepNumber = (index: number): string => String(index + 1).padStart(2, '0');

export const StudioSampleSheet: React.FC<StudioSampleSheetProps> = ({
  catalogue, active, saving, saveError, onSave, onSelectionChange,
  initialDestination = 'danang',
  initialDays = 1,
  onClose,
}) => {
  const [destination, setDestination] = useState<DestinationScope>(initialDestination);
  const [days, setDays] = useState<DurationDays>(initialDays);
  const [screenView, setScreenView] = useState<ModalScreenView>('sheet');
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerRegion, setPickerRegion] = useState<PickerRegionFilter>('Tất cả');
  const [detailState, setDetailState] = useState<PlaceDetailState | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const [extraPlaces, setExtraPlaces] = useState<PlaceCatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [searchIds, setSearchIds] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchRetry, setSearchRetry] = useState(0);
  const ALL_CATALOG_PLACES = useMemo(() => [...new Map([...catalogue, ...extraPlaces].map(p => [p.id, p])).values()], [catalogue, extraPlaces]);
  const PLACE_CATALOG = useMemo(() => Object.fromEntries(ALL_CATALOG_PLACES.map(p => [p.id, p])), [ALL_CATALOG_PLACES]);
  useEffect(() => {
    setDestination(initialDestination);
    setDays(initialDestination === 'danang-hue' && initialDays === 1 ? 2 : initialDays);
    setScreenView('sheet'); setPickerTarget(null); setDetailState(null);
  }, [initialDestination, initialDays]);
  useEffect(() => {
    if (!pickerTarget) return;
    const controller = new AbortController();
    setSearchIds(null); setSearchError('');
    if (!query.trim()) { setSearching(false); return; }
    setSearching(true);
    const timer = window.setTimeout(() => {
      const city = destination === 'danang' ? 'Đà Nẵng' : destination === 'hue' ? 'Huế' : pickerRegion === 'Tất cả' ? undefined : pickerRegion;
      void searchLandingCatalogue(query.trim(), city, controller.signal).then(found => {
        if (controller.signal.aborted) return;
        setExtraPlaces(previous => [...new Map([...previous,...found].map(p => [p.id,p])).values()]);
        setSearchIds(found.map(p => p.id)); setSearching(false);
      }).catch(() => {
        if (!controller.signal.aborted) { setSearchError('Chưa tìm được địa điểm. Thử lại.'); setSearching(false); setSearchIds([]); }
      });
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, pickerRegion, destination, pickerTarget, searchRetry]);
  // Store each preset's active day plans separately so edits persist across tab toggles
  const [plansByPreset, setPlansByPreset] = useState<Record<string, ItineraryDayPlan[]>>(() => {
    const initialPreset = findSamplePreset(catalogue, initialDestination, initialDays);
    if (!initialPreset) return {};
    return {
      [getPresetKey(initialDestination, initialDays)]: buildInitialDayPlans(initialPreset),
    };
  });
  const [editedPresets, setEditedPresets] = useState<Record<string, boolean>>({});

  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const instanceCounterRef = useRef(1);

  const activePresetKey = getPresetKey(destination, days);
  const activePreset = useMemo(() => findSamplePreset(catalogue, destination, days), [catalogue, destination, days]);

  const currentPlan: ItineraryDayPlan[] | null = useMemo(() => {
    if (!activePreset) return null;
    return plansByPreset[activePresetKey] ?? buildInitialDayPlans(activePreset);
  }, [activePreset, activePresetKey, plansByPreset]);

  const isEdited = Boolean(editedPresets[activePresetKey]);
  const totalStops = useMemo(
    () => (currentPlan ? currentPlan.reduce((sum, d) => sum + d.stops.length, 0) : 0),
    [currentPlan],
  );

  const destinationLabel =
    DESTINATION_OPTIONS.find((opt) => opt.id === destination)?.label ?? 'Đà Nẵng';

  // Esc dismisses nested overlays step by step before closing main modal
  useEffect(() => {
    if (!active || saving) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (detailState) {
        setDetailState(null);
        return;
      }
      if (pickerTarget) {
        setPickerTarget(null);
        return;
      }
      if (screenView === 'planner-preview') {
        setScreenView('sheet');
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [active, saving, detailState, pickerTarget, screenView, onClose]);

  const ensurePresetInitialized = (
    dest: DestinationScope,
    dur: DurationDays,
    prevMap: Record<string, ItineraryDayPlan[]>,
  ): Record<string, ItineraryDayPlan[]> => {
    const key = getPresetKey(dest, dur);
    if (prevMap[key]) return prevMap;
    const preset = findSamplePreset(catalogue, dest, dur);
    if (!preset) return prevMap;
    return { ...prevMap, [key]: buildInitialDayPlans(preset) };
  };

  const handleSelectDestination = (nextDest: DestinationScope) => {
    const duration = nextDest === 'danang-hue' && days === 1 ? 2 : days;
    setDays(duration);
    setDestination(nextDest);
    onSelectionChange(nextDest, duration);
    setEditingDay(null);
    setPickerTarget(null);
    setScreenView('sheet');
    setPlansByPreset((prev) => ensurePresetInitialized(nextDest, duration, prev));
    sheetBodyRef.current?.scrollTo({ top: 0 });
  };

  const handleSelectDays = (nextDays: DurationDays) => {
    setDays(nextDays);
    onSelectionChange(destination, nextDays);
    setEditingDay(null);
    setPickerTarget(null);
    setScreenView('sheet');
    setPlansByPreset((prev) => ensurePresetInitialized(destination, nextDays, prev));
    sheetBodyRef.current?.scrollTo({ top: 0 });
  };

  const updateCurrentPlan = (updater: (daysPlan: ItineraryDayPlan[]) => ItineraryDayPlan[]) => {
    if (!activePreset) return;
    setPlansByPreset((prev) => {
      const base = prev[activePresetKey] ?? buildInitialDayPlans(activePreset);
      return {
        ...prev,
        [activePresetKey]: updater(base),
      };
    });
    setEditedPresets((prev) => ({ ...prev, [activePresetKey]: true }));
  };

  const handleResetCurrentPreset = () => {
    if (!activePreset) return;
    setPlansByPreset((prev) => ({
      ...prev,
      [activePresetKey]: buildInitialDayPlans(activePreset),
    }));
    setEditedPresets((prev) => ({ ...prev, [activePresetKey]: false }));
    setEditingDay(null);
    setPickerTarget(null);
  };

  const handleMoveStop = (dayNumber: number, index: number, direction: -1 | 1) => {
    updateCurrentPlan(plan => moveSampleStop(plan, dayNumber, index, direction));
  };

  const handleRemoveStop = (dayNumber: number, instanceId: string) => {
    updateCurrentPlan((prevDays) =>
      prevDays.map((day) =>
        day.dayNumber === dayNumber
          ? { ...day, stops: day.stops.filter((s) => s.instanceId !== instanceId) }
          : day,
      ),
    );
  };

  const handlePickPlace = (place: PlaceCatalogItem) => {
    if (!pickerTarget) return;
    const { mode, dayNumber, replaceInstanceId } = pickerTarget;

    updateCurrentPlan(plan => applySamplePlace(plan, dayNumber, place.id,
      `custom-${instanceCounterRef.current++}`, mode === 'replace' ? replaceInstanceId : undefined));

    setPickerTarget(null);
  };

  const openAddPickerForDay = (dayNumber: number) => {
    const defaultRegion: PickerRegionFilter =
      destination === 'hue' ? 'Huế' : destination === 'danang' ? 'Đà Nẵng' : 'Tất cả';
    setQuery(''); setSearchIds(null); setSearchError('');
    setPickerRegion(defaultRegion);
    setPickerTarget({ mode: 'add', dayNumber });
  };

  const openReplacePickerForStop = (dayNumber: number, instanceId: string) => {
    const defaultRegion: PickerRegionFilter =
      destination === 'hue' ? 'Huế' : destination === 'danang' ? 'Đà Nẵng' : 'Tất cả';
    setQuery(''); setSearchIds(null); setSearchError('');
    setPickerRegion(defaultRegion);
    setPickerTarget({ mode: 'replace', dayNumber, replaceInstanceId: instanceId });
  };

  const pickerDayStopPlaceIds = useMemo(() => {
    if (!pickerTarget || !currentPlan) return new Set<string>();
    return new Set(currentPlan.flatMap(d => d.stops).filter(s => s.instanceId !== pickerTarget.replaceInstanceId).map(s => s.placeId));
  }, [pickerTarget, currentPlan]);

  const filteredCatalogPlaces = useMemo(() => ALL_CATALOG_PLACES.filter(p =>
    (destination === 'danang-hue' || p.city === (destination === 'hue' ? 'Huế' : 'Đà Nẵng')) &&
    (pickerRegion === 'Tất cả' || p.city === pickerRegion) &&
    (!query.trim() || (!searching && searchIds?.includes(p.id)))),
    [ALL_CATALOG_PLACES, destination, pickerRegion, query, searching, searchIds]);

  const supportedDurationsForCurrentDest = useMemo(
    () => getSupportedDurationsForDestination(destination),
    [destination],
  );

  const markImageBroken = (key: string) => {
    setBrokenImages((prev) => ({ ...prev, [key]: true }));
  };

  return (
    <div
      hidden={!active}
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Lịch mẫu ${destinationLabel} ${days} ngày`}
      onClick={(e) => {
        if (!saving && e.target === e.currentTarget) onClose();
      }}
    >
      {/* SINGLE CONTINUOUS WARM PAPER SHEET */}
      <div
        data-sample-itinerary-sheet
        className="relative flex w-full max-w-[760px] max-h-[90svh] flex-col overflow-hidden rounded-[22px] border border-[#172820]/[0.14] bg-[#FBF9F2] text-[#172820] shadow-[0_24px_64px_rgba(23,40,32,0.22)]"
      >
        {screenView === 'sheet' ? (
          <>
            {/* HEADER ON PAPER */}
            <header className="shrink-0 border-b border-[#172820]/[0.12] px-5 pt-5 pb-4 sm:px-8 sm:pt-6 sm:pb-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-[0.02em] text-[#1F6B49]">
                    Lịch tham khảo
                  </p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2
                      data-itinerary-heading
                      className="text-[24px] sm:text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#172820] text-balance"
                    >
                      {destinationLabel} · {days} ngày
                    </h2>
                    <p
                      data-itinerary-stop-count
                      className="text-sm font-medium text-[#43544B] tabular-nums"
                    >
                      {currentPlan ? `${totalStops} điểm ghé` : 'Chưa có lịch'}
                      {isEdited && currentPlan && (
                        <span className="text-[#1F6B49]"> · Đã chỉnh sửa</span>
                      )}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  data-itinerary-close
                  disabled={saving}
                  onClick={onClose}
                  aria-label="Đóng lịch mẫu"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#43544B] transition-colors hover:bg-[#172820]/[0.06] hover:text-[#172820] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F6B49]"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {/* DESTINATION & DURATION SELECTORS */}
              <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-[#43544B]">Điểm đến</span>
                  <div
                    role="group"
                    aria-label="Chọn điểm đến"
                    className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-[#EFECE0] p-1"
                  >
                    {DESTINATION_OPTIONS.map((opt) => {
                      const active = destination === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          data-dest-option={opt.id}
                          aria-pressed={active}
                          onClick={() => handleSelectDestination(opt.id)}
                          className={`min-h-[40px] rounded-md px-3 py-1 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F6B49] ${
                            active
                              ? 'bg-[#1F6B49] text-[#FBF9F2]'
                              : 'text-[#172820] hover:bg-[#172820]/[0.06]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-[#43544B]">Thời lượng</span>
                  <div
                    role="group"
                    aria-label="Chọn thời lượng"
                    className="inline-flex items-center gap-1 rounded-lg bg-[#EFECE0] p-1"
                  >
                    {DURATION_OPTIONS.map((dur) => {
                      const active = days === dur;
                      const supported = supportedDurationsForCurrentDest.includes(dur);
                      return (
                        <button
                          key={dur}
                          type="button"
                          data-duration-option={dur}
                          disabled={!supported}
                          aria-pressed={active}
                          onClick={() => handleSelectDays(dur)}
                          className={`min-h-[40px] rounded-md px-2.5 py-1 text-xs font-semibold tabular-nums whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F6B49] ${
                            active
                              ? 'bg-[#1F6B49] text-[#FBF9F2]'
                              : supported
                              ? 'text-[#172820] hover:bg-[#172820]/[0.06]'
                              : 'text-[#43544B]/[0.70] hover:bg-[#172820]/[0.06]'
                          }`}
                        >
                          {dur} ngày
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </header>

            {/* SINGLE SCROLLABLE PAPER BODY */}
            <div
              key="sheet-body"
              ref={sheetBodyRef}
              data-itinerary-scroll-body
              className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-7"
            >
              <p className="mb-5 text-xs leading-relaxed text-[#43544B]">Lịch tham khảo từ địa điểm GreenTrip. Giờ gợi ý chưa tính giờ mở cửa, thời tiết và thời gian di chuyển. Bạn có thể thử chỉnh, đăng nhập khi lưu chuyến riêng.</p>
              {!currentPlan ? (
                <div
                  data-itinerary-unavailable
                  className="mx-auto max-w-xl rounded-xl border border-[#172820]/[0.14] bg-[#F4F0E3]/[0.80] px-5 py-6"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#43544B]">
                    Chưa có dữ liệu cho lựa chọn này
                  </p>
                  <h3 className="mt-1.5 text-lg font-bold text-[#172820]">
                    Chưa đủ địa điểm để ghép lịch cho {destinationLabel} · {days} ngày
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#43544B]">
                    Thử thời lượng khác hoặc chọn riêng một thành phố để xem lịch tham khảo:
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {supportedDurationsForCurrentDest.map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => handleSelectDays(dur)}
                        className="min-h-[40px] rounded-lg border border-[#1F6B49]/[0.35] bg-[#FBF9F2] px-4 py-2 text-xs font-semibold text-[#1F6B49] transition-colors hover:bg-[#1F6B49] hover:text-[#FBF9F2]"
                      >
                        Mở {destinationLabel} · {dur} ngày
                      </button>
                    ))}
                    {destination !== 'danang-hue' && (
                      <button
                        type="button"
                        onClick={() => {
                          setDestination('danang-hue');
                          setDays(3);
                          setPlansByPreset((prev) =>
                            ensurePresetInitialized('danang-hue', 3, prev),
                          );
                        }}
                        className="min-h-[40px] rounded-lg border border-[#172820]/[0.20] bg-[#FBF9F2] px-4 py-2 text-xs font-semibold text-[#172820] transition-colors hover:border-[#1F6B49] hover:text-[#1F6B49]"
                      >
                        Xem Đà Nẵng & Huế · 3 ngày
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-9">
                  {currentPlan.map((day, dayIdx) => {
                    const isDayEditing = editingDay === day.dayNumber;

                    return (
                      <section
                        key={day.dayNumber}
                        data-itinerary-day={day.dayNumber}
                        aria-label={day.title}
                        className={dayIdx > 0 ? 'border-t border-[#172820]/[0.12] pt-7' : undefined}
                      >
                        {/* DAY HEADER — Distinct editorial headline, NO circle around day number */}
                        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
                          <h3 className="text-[18px] sm:text-[20px] font-bold tracking-[-0.015em] text-[#172820]">
                            {day.title}
                          </h3>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-[#43544B] tabular-nums">
                              {day.stops.length} điểm ghé
                            </span>
                            {isDayEditing && (
                              <button
                                type="button"
                                onClick={() => setEditingDay(null)}
                                className="rounded-md bg-[#1F6B49] px-3 py-1 text-xs font-semibold text-[#FBF9F2] transition-colors hover:bg-[#175237]"
                              >
                                Xong
                              </button>
                            )}
                          </div>
                        </div>

                        {isDayEditing && (
                          <p className="mb-4 rounded-lg border border-[#172820]/[0.12] bg-[#F3EFE2]/[0.70] px-3.5 py-2 text-xs text-[#43544B]">
                            Đang chỉnh lịch {day.title.toLowerCase()}. Các điểm đổi vị trí hoặc thay mới sẽ chuyển sang trạng thái{' '}
                            <span className="font-semibold text-[#172820]">Chưa xếp giờ</span>.
                          </p>
                        )}

                        {/* VERTICAL TIMELINE SPINE ON THE LEFT RAIL */}
                        <ol className="space-y-0" aria-label={`Các điểm dừng ${day.title}`}>
                          {day.stops.length === 0 && (
                            <li className="relative flex gap-3.5 sm:gap-5">
                              <div className="relative flex w-8 shrink-0 flex-col items-center">
                                <span
                                  aria-hidden="true"
                                  className="h-3 w-px bg-[#B7C4BC]"
                                />
                                <span className="h-2.5 w-2.5 rounded-full border border-[#B7C4BC] bg-[#FBF9F2]" />
                                <span
                                  aria-hidden="true"
                                  className="w-[1.5px] flex-1 bg-[#B7C4BC]"
                                />
                              </div>
                              <p className="pb-6 text-sm text-[#43544B]">
                                Ngày này chưa có điểm ghé nào. Dùng nút + bên dưới để thêm địa điểm.
                              </p>
                            </li>
                          )}

                          {day.stops.map((stop, stopIdx) => {
                            const place = PLACE_CATALOG[stop.placeId];
                            if (!place) return null;
                            const stepLabel = formatStepNumber(stopIdx);
                            const hasTwoPhotos = place.photos.length >= 2;

                            return (
                              <li
                                key={stop.instanceId}
                                data-itinerary-stop={stop.instanceId}
                                data-stop-place-id={place.id}
                                data-stop-order={stopIdx + 1}
                                className="relative flex gap-3.5 sm:gap-5"
                              >
                                {/* LEFT VERTICAL AXIS + NUMBER */}
                                <div className="relative flex w-8 shrink-0 flex-col items-center">
                                  <span
                                    aria-hidden="true"
                                    className={`w-[1.5px] h-1.5 ${
                                      stopIdx === 0 ? 'bg-transparent' : 'bg-[#B7C4BC]'
                                    }`}
                                  />
                                  <span className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border border-[#172820]/[0.25] bg-[#FBF9F2] text-xs font-bold text-[#172820] tabular-nums">
                                    {stepLabel}
                                  </span>
                                  <span
                                    aria-hidden="true"
                                    className="w-[1.5px] flex-1 bg-[#B7C4BC]"
                                  />
                                </div>

                                {/* RIGHT STOP CONTENT: Top-to-bottom scan (Time -> Title -> Summary -> Photo) */}
                                <div className="min-w-0 flex-1 pb-7">
                                  {/* 1. Time slot + quiet category label (unboxed text, NO pills) */}
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium tabular-nums text-[#43544B]">
                                    <span
                                      data-stop-time
                                      className={
                                        stop.timeSlot === null
                                          ? 'font-semibold text-[#1F6B49]'
                                          : 'text-[#43544B]'
                                      }
                                    >
                                      {stop.timeSlot ?? 'Chưa xếp giờ'}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    <span>{place.category}</span>
                                  </div>

                                  {/* 2. Place Title + Xem địa điểm */}
                                  <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                    <button
                                      type="button"
                                      data-stop-title-btn={stop.instanceId}
                                      onClick={() =>
                                        setDetailState({ place, timeSlot: stop.timeSlot })
                                      }
                                      className="text-left text-[17px] sm:text-[18px] font-bold leading-snug text-[#172820] transition-colors hover:text-[#1F6B49] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F6B49]"
                                    >
                                      {place.name}
                                    </button>

                                    <button
                                      type="button"
                                      data-stop-detail-btn={stop.instanceId}
                                      onClick={() =>
                                        setDetailState({ place, timeSlot: stop.timeSlot })
                                      }
                                      className="shrink-0 whitespace-nowrap text-xs font-semibold text-[#1F6B49] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F6B49]"
                                    >
                                      Xem địa điểm
                                    </button>
                                  </div>

                                  {/* 3. Concise description */}
                                  <p className="mt-1 text-[14px] leading-relaxed text-[#43544B] max-w-[60ch]">
                                    {place.shortDesc}
                                  </p>

                                  {/* Edit mode actions for this stop */}
                                  {isDayEditing && (
                                    <div
                                      data-stop-edit-controls={stop.instanceId}
                                      className="mt-2.5 flex flex-wrap items-center gap-1.5"
                                    >
                                      <button
                                        type="button"
                                        data-move-up={stop.instanceId}
                                        disabled={stopIdx === 0}
                                        onClick={() => handleMoveStop(day.dayNumber, stopIdx, -1)}
                                        aria-label={`Đưa ${place.name} lên trên`}
                                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#172820]/[0.18] bg-[#FBF9F2] px-2.5 py-1 text-xs font-semibold text-[#172820] transition-colors hover:border-[#1F6B49] hover:text-[#1F6B49] disabled:cursor-not-allowed disabled:opacity-35"
                                      >
                                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                                        <span>Lên</span>
                                      </button>

                                      <button
                                        type="button"
                                        data-move-down={stop.instanceId}
                                        disabled={stopIdx === day.stops.length - 1}
                                        onClick={() => handleMoveStop(day.dayNumber, stopIdx, 1)}
                                        aria-label={`Đưa ${place.name} xuống dưới`}
                                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#172820]/[0.18] bg-[#FBF9F2] px-2.5 py-1 text-xs font-semibold text-[#172820] transition-colors hover:border-[#1F6B49] hover:text-[#1F6B49] disabled:cursor-not-allowed disabled:opacity-35"
                                      >
                                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                                        <span>Xuống</span>
                                      </button>

                                      <button
                                        type="button"
                                        data-replace-stop={stop.instanceId}
                                        onClick={() =>
                                          openReplacePickerForStop(day.dayNumber, stop.instanceId)
                                        }
                                        className="min-h-[36px] rounded-lg border border-[#172820]/[0.18] bg-[#FBF9F2] px-3 py-1 text-xs font-semibold text-[#172820] transition-colors hover:border-[#1F6B49] hover:text-[#1F6B49]"
                                      >
                                        Đổi điểm
                                      </button>

                                      <button
                                        type="button"
                                        data-remove-stop={stop.instanceId}
                                        onClick={() =>
                                          handleRemoveStop(day.dayNumber, stop.instanceId)
                                        }
                                        className="min-h-[36px] rounded-lg border border-[#7C2D12]/[0.25] bg-[#FBF9F2] px-3 py-1 text-xs font-semibold text-[#7C2D12] transition-colors hover:bg-[#7C2D12]/[0.06]"
                                      >
                                        Bỏ
                                      </button>
                                    </div>
                                  )}

                                  {/* 4. Photo(s) directly underneath name and description — clicking opens details, NEVER removes */}
                                  <div
                                    className={`mt-3 ${
                                      hasTwoPhotos
                                        ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-[560px]'
                                        : 'max-w-[440px]'
                                    }`}
                                  >
                                    {place.photos.map((photo, photoIdx) => {
                                      const imgKey = `${place.id}-${photoIdx}`;
                                      const isBroken = Boolean(brokenImages[imgKey]);
                                      // On narrow mobile, prioritize 1 clean horizontal photo so the vertical axis stays airy
                                      const mobileVisibilityClass =
                                        hasTwoPhotos && photoIdx > 0 ? 'hidden sm:block' : 'block';

                                      return (
                                        <button
                                          key={imgKey}
                                          type="button"
                                          data-stop-photo-btn={`${stop.instanceId}-${photoIdx}`}
                                          aria-label={`Xem ảnh và thông tin ${place.name}`}
                                          onClick={() =>
                                            setDetailState({ place, timeSlot: stop.timeSlot })
                                          }
                                          className={`${mobileVisibilityClass} group relative w-full overflow-hidden rounded-xl border border-[#172820]/[0.10] bg-[#ECE8DA] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F6B49]`}
                                        >
                                          <div
                                            className={
                                              hasTwoPhotos
                                                ? 'aspect-[16/10] w-full overflow-hidden'
                                                : 'aspect-[16/9] sm:aspect-[2/1] w-full overflow-hidden'
                                            }
                                          >
                                            {!isBroken ? (
                                              <img loading="lazy" decoding="async"
                                                src={photo.src}
                                                alt={photo.alt}
                                                referrerPolicy="no-referrer"
                                                onError={() => markImageBroken(imgKey)}
                                                style={{
                                                  objectPosition: photo.objectPosition ?? '50% 50%',
                                                }}
                                                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                              />
                                            ) : (
                                              <div className="flex h-full w-full items-center justify-center px-3 text-xs font-medium text-[#43544B]">
                                                {place.name}
                                              </div>
                                            )}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ol>

                        {/* END OF DAY CONNECTOR TERMINATING AT "+" ON THE SAME VERTICAL AXIS */}
                        <div
                          data-day-end-prompt={day.dayNumber}
                          className="relative flex items-start gap-3.5 sm:gap-5"
                        >
                          {/* Same left rail alignment: vertical line stops right at "+" */}
                          <div className="relative flex w-8 shrink-0 flex-col items-center">
                            <span
                              aria-hidden="true"
                              className="h-2.5 w-[1.5px] bg-[#B7C4BC]"
                            />
                            <button
                              type="button"
                              data-day-plus-btn={day.dayNumber}
                              onClick={() => openAddPickerForDay(day.dayNumber)}
                              aria-label={`Thêm địa điểm vào ${day.title}`}
                              className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[#1F6B49]/[0.50] bg-[#FBF9F2] text-[#1F6B49] transition-colors hover:bg-[#1F6B49] hover:text-[#FBF9F2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F6B49]"
                            >
                              <Plus className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>

                          {/* Light handwritten-style note box on the sheet */}
                          <div className="min-w-0 flex-1 rounded-xl border border-dashed border-[#172820]/[0.18] bg-[#F4F0E3]/[0.70] px-4 py-3.5">
                            <p className="text-[13.5px] font-medium text-[#172820]">
                              Bạn muốn thêm địa điểm hay chỉnh lịch ngày này không?
                            </p>
                            <div className="mt-2.5 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                data-day-add-btn={day.dayNumber}
                                onClick={() => openAddPickerForDay(day.dayNumber)}
                                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#1F6B49]/[0.40] bg-[#FBF9F2] px-3.5 py-1.5 text-xs font-semibold text-[#1F6B49] whitespace-nowrap transition-colors hover:bg-[#1F6B49] hover:text-[#FBF9F2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F6B49]"
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Thêm địa điểm</span>
                              </button>

                              <button
                                type="button"
                                data-day-edit-btn={day.dayNumber}
                                aria-pressed={isDayEditing}
                                onClick={() =>
                                  setEditingDay((prev) =>
                                    prev === day.dayNumber ? null : day.dayNumber,
                                  )
                                }
                                className={`min-h-[44px] rounded-lg border px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F6B49] ${
                                  isDayEditing
                                    ? 'border-[#1F6B49] bg-[#1F6B49] text-[#FBF9F2]'
                                    : 'border-[#172820]/[0.20] bg-[#FBF9F2] text-[#172820] hover:border-[#1F6B49] hover:text-[#1F6B49]'
                                }`}
                              >
                                {isDayEditing ? 'Xong chỉnh lịch' : 'Chỉnh lịch'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>

            {/* FOOTER WITH ONE PRIMARY USEFUL ACTION ("Dùng lịch này") — NEVER overlaps scroll body */}
            <footer className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-[#172820]/[0.12] bg-[#FBF9F2] px-5 py-3.5 sm:px-8 sm:py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#43544B]">
                {currentPlan ? (
                  <>
                    <span className="tabular-nums font-medium">
                      {isEdited
                        ? `Đang dùng bản vừa chỉnh (${totalStops} điểm ghé)`
                        : `Lịch mẫu gốc (${totalStops} điểm ghé)`}
                    </span>
                    {isEdited && (
                      <button
                        type="button"
                        data-itinerary-reset
                        onClick={handleResetCurrentPreset}
                        className="font-semibold text-[#1F6B49] underline-offset-4 hover:underline"
                      >
                        Khôi phục mẫu
                      </button>
                    )}
                  </>
                ) : (
                  <span>Chọn điểm đến và số ngày có sẵn dữ liệu để tiếp tục</span>
                )}
              </div>

              <button
                type="button"
                data-use-itinerary-btn
                disabled={!currentPlan || totalStops === 0}
                onClick={() => {
                  setPickerTarget(null);
                  setDetailState(null);
                  setScreenView('planner-preview');
                }}
                className="min-h-[42px] rounded-full bg-[#1F6B49] px-6 py-2 text-sm font-semibold text-[#FBF9F2] whitespace-nowrap shrink-0 transition-colors hover:bg-[#175237] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F6B49]"
              >
                Dùng lịch này
              </button>
            </footer>
          </>
        ) : (
          /* PLANNER HANDOFF PREVIEW (shown on clicking "Dùng lịch này") */
          <>
            <header className="shrink-0 border-b border-[#172820]/[0.12] px-5 pt-5 pb-4 sm:px-8 sm:pt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-[0.02em] text-[#1F6B49]">
                    Bản lịch đang thử · Chưa lưu
                  </p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-[24px] sm:text-[26px] font-bold tracking-[-0.02em] text-[#172820]">
                      {destinationLabel} · {days} ngày
                    </h2>
                    <span className="text-sm font-medium text-[#43544B] tabular-nums">
                      {totalStops} điểm ghé {isEdited ? '· từ bản vừa chỉnh' : '· từ lịch mẫu'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Đóng bản xem trước"
                  disabled={saving}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#43544B] transition-colors hover:bg-[#172820]/[0.06] hover:text-[#172820]"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div
              key="planner-preview-body"
              data-planner-preview-body
              className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 space-y-6"
            >
              <div className="rounded-xl border border-[#172820]/[0.14] bg-[#F4F0E3]/[0.80] px-4 py-3 text-sm text-[#2E3F36]">
                Các địa điểm lấy từ dữ liệu GreenTrip. Bạn có thể quay lại thêm, bỏ hoặc đổi thứ tự. Đăng nhập, chọn ngày bắt đầu rồi mở thẳng lịch trình với các chỉnh sửa này. Giờ trong mẫu chỉ để tham khảo, chưa kiểm tra giờ mở cửa và thời gian di chuyển.
              </div>

              {saveError && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}
              {currentPlan?.map((day) => (
                <section
                  key={day.dayNumber}
                  data-preview-day={day.dayNumber}
                  className="space-y-3 border-t border-[#172820]/[0.12] pt-5 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-[17px] font-bold text-[#172820]">{day.title}</h3>
                    <span className="text-xs font-medium text-[#43544B] tabular-nums">
                      {day.stops.length} điểm ghé
                    </span>
                  </div>

                  {day.stops.length === 0 ? (
                    <p className="text-sm text-[#43544B]">Không có điểm nào trong ngày này.</p>
                  ) : (
                    <ol className="divide-y divide-[#172820]/[0.10]">
                      {day.stops.map((stop, idx) => {
                        const place = PLACE_CATALOG[stop.placeId];
                        if (!place) return null;
                        return (
                          <li
                            key={stop.instanceId}
                            data-preview-stop={place.id}
                            className="flex items-baseline gap-3.5 py-2.5"
                          >
                            <span className="w-6 shrink-0 text-xs font-bold text-[#1F6B49] tabular-nums">
                              {formatStepNumber(idx)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#172820]">{place.name}</p>
                              <p className="mt-0.5 text-xs text-[#43544B] tabular-nums">
                                {stop.timeSlot ?? 'Chưa xếp giờ'} · {place.category} · {place.city}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>
              ))}
            </div>

            <footer className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-[#172820]/[0.12] bg-[#FBF9F2] px-5 py-3.5 sm:px-8 sm:py-4">
              <button
                type="button"
                data-preview-back-btn
                disabled={saving}
                onClick={() => {if (!saving) setScreenView('sheet');}}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#172820]/[0.18] bg-[#FBF9F2] px-4 py-2 text-xs font-semibold text-[#172820] transition-colors hover:border-[#1F6B49] hover:text-[#1F6B49]"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Quay lại chỉnh lịch</span>
              </button>

              <button
                type="button"
                disabled={saving || !totalStops}
                data-save-sample
                onClick={() => currentPlan && onSave(currentPlan, ALL_CATALOG_PLACES, destination, days)}
                className="min-h-[40px] rounded-full bg-[#1F6B49] px-5 py-2 text-xs font-semibold text-[#FBF9F2] transition-colors hover:bg-[#175237]"
              >
                {saving ? 'Đang lưu…' : 'Lưu thành chuyến riêng'}
              </button>
            </footer>
          </>
        )}

        {/* PLACE PICKER DRAWER (for "+" Add Stop or Edit "Đổi điểm") */}
        {pickerTarget && (
          <div
            data-place-picker-overlay
            role="dialog"
            aria-modal="true"
            aria-label={
              pickerTarget.mode === 'add'
                ? `Thêm địa điểm vào Ngày ${pickerTarget.dayNumber}`
                : `Đổi địa điểm cho Ngày ${pickerTarget.dayNumber}`
            }
            onClick={(e) => {
              if (e.target === e.currentTarget) setPickerTarget(null);
            }}
            className="absolute inset-0 z-30 flex items-end sm:items-center justify-center bg-[#172820]/[0.40] p-0 sm:p-6"
          >
            <div className="flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-t-[20px] sm:rounded-[18px] border border-[#172820]/[0.16] bg-[#FBF9F2] text-[#172820] shadow-2xl">
              <div className="shrink-0 flex items-start justify-between gap-3 border-b border-[#172820]/[0.12] px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1F6B49]">
                    {pickerTarget.mode === 'add' ? 'Thêm vào lịch' : 'Đổi điểm dừng'}
                  </p>
                  <h3 className="mt-0.5 text-lg font-bold text-[#172820]">
                    {pickerTarget.mode === 'add'
                      ? `Chọn địa điểm cho Ngày ${pickerTarget.dayNumber}`
                      : `Chọn điểm thay thế cho Ngày ${pickerTarget.dayNumber}`}
                  </h3>
                </div>
                <button
                  type="button"
                  data-picker-close
                  onClick={() => setPickerTarget(null)}
                  aria-label="Đóng bộ chọn địa điểm"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-[#43544B] hover:bg-[#172820]/[0.06] hover:text-[#172820]"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="px-5 pt-3"><label className="text-xs font-semibold" htmlFor="sample-place-query">Tìm trong dữ liệu GreenTrip</label><input id="sample-place-query" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tên địa điểm, món ăn…" className="mt-1 w-full min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm" /></div>
              <div className="shrink-0 flex flex-wrap items-center gap-1.5 border-b border-[#172820]/[0.10] px-5 py-2.5">
                {(destination === 'danang-hue' ? ['Tất cả', 'Đà Nẵng', 'Huế'] as const : [destination === 'hue' ? 'Huế' : 'Đà Nẵng'] as const).map((region) => (
                  <button
                    key={region}
                    type="button"
                    onClick={() => setPickerRegion(region)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                      pickerRegion === region
                        ? 'bg-[#1F6B49] text-[#FBF9F2]'
                        : 'text-[#43544B] hover:bg-[#172820]/[0.06] hover:text-[#172820]'
                    }`}
                  >
                    {region}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[#172820]/[0.10] px-5">
                {searching && <p role="status" className="py-4 text-sm">Đang tìm địa điểm…</p>}
                {searchError && <div role="alert" className="py-4 text-sm">{searchError} <button className="underline min-h-11" onClick={() => setSearchRetry(n => n+1)}>Thử lại</button></div>}
                {!searching && !searchError && !filteredCatalogPlaces.length && <p className="py-4 text-sm">Chưa có địa điểm phù hợp. Thử tên khác trong khu vực đã chọn.</p>}
                {filteredCatalogPlaces.map((place) => {
                  const alreadyInDay = pickerDayStopPlaceIds.has(place.id);
                  const cover = place.photos[0];
                  return (
                    <div
                      key={place.id}
                      data-picker-option={place.id}
                      className="flex items-center gap-3.5 py-3.5"
                    >
                      <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-[#172820]/[0.10] bg-[#ECE8DA]">
                        {cover && !brokenImages[`picker-${place.id}`] ? (
                          <img loading="lazy" decoding="async"
                            src={cover.src}
                            alt={cover.alt}
                            referrerPolicy="no-referrer"
                            onError={() => markImageBroken(`picker-${place.id}`)}
                            style={{ objectPosition: cover.objectPosition ?? '50% 50%' }}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-[#43544B]">
                            {place.city}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[#43544B]">
                          {place.city} · {place.category}
                          {alreadyInDay && (
                            <span className="text-[#1F6B49]"> · Đã có trong lịch</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-sm font-bold text-[#172820] truncate">
                          {place.name}
                        </p>
                        <p className="mt-0.5 text-xs text-[#43544B] line-clamp-1">
                          {place.shortDesc}
                        </p>
                      </div>

                      <button
                        type="button"
                        data-picker-choose={place.id}
                        disabled={alreadyInDay}
                        onClick={() => handlePickPlace(place)}
                        className="min-h-[44px] shrink-0 rounded-lg border border-[#1F6B49]/[0.40] bg-[#FBF9F2] px-3 py-1.5 text-xs font-semibold text-[#1F6B49] whitespace-nowrap transition-colors hover:bg-[#1F6B49] hover:text-[#FBF9F2]"
                      >
                        {pickerTarget.mode === 'add' ? '+ Thêm' : 'Chọn đổi'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* PLACE DETAIL OVERLAY ("Xem địa điểm") */}
        {detailState && (
          <div
            data-place-detail-overlay
            role="dialog"
            aria-modal="true"
            aria-label={`Thông tin ${detailState.place.name}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) setDetailState(null);
            }}
            className="absolute inset-0 z-40 flex items-end sm:items-center justify-center bg-[#172820]/[0.45] p-0 sm:p-6"
          >
            <div className="flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[20px] sm:rounded-[18px] border border-[#172820]/[0.16] bg-[#FBF9F2] text-[#172820] shadow-2xl">
              <div className="flex-1 overflow-y-auto">
                <div
                  className={
                    detailState.place.photos.length >= 2
                      ? 'grid grid-cols-1 sm:grid-cols-2 gap-1 bg-[#EAE5D5]'
                      : 'bg-[#EAE5D5]'
                  }
                >
                  {detailState.place.photos.map((photo, idx) => (
                    <div
                      key={`${detailState.place.id}-detail-${idx}`}
                      className={`aspect-[16/10] w-full overflow-hidden ${
                        detailState.place.photos.length >= 2 && idx > 0 ? 'sm:block' : ''
                      }`}
                    >
                      {!brokenImages[`detail-${detailState.place.id}-${idx}`] ? (
                        <img loading="lazy" decoding="async"
                          src={photo.src}
                          alt={photo.alt}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            markImageBroken(`detail-${detailState.place.id}-${idx}`)
                          }
                          style={{ objectPosition: photo.objectPosition ?? '50% 50%' }}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-[#43544B]">
                          {detailState.place.name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="px-5 py-5 sm:px-6">
                  <p className="text-xs font-medium text-[#1F6B49]">
                    {detailState.place.city} · {detailState.place.category}
                  </p>
                  <h3 className="mt-1 text-xl font-bold tracking-[-0.015em] text-[#172820]">
                    {detailState.place.name}
                  </h3>
                  <p className="mt-1.5 text-xs text-[#43544B] tabular-nums">
                    Trong lịch: {detailState.timeSlot ?? 'Chưa xếp giờ'}
                    {detailState.timeSlot === null && (
                      <span> · Gợi ý: {detailState.place.suggestedWindow}</span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-[#43544B]">
                    Địa chỉ: {detailState.place.address}
                  </p>
                  <p className="mt-4 text-[14.5px] leading-relaxed text-[#2C3C34]">
                    {detailState.place.fullDesc}
                  </p>
                </div>
              </div>

              <div className="shrink-0 flex items-center justify-end border-t border-[#172820]/[0.12] bg-[#FBF9F2] px-5 py-3">
                <button
                  type="button"
                  data-place-detail-close
                  onClick={() => setDetailState(null)}
                  className="min-h-[40px] rounded-full bg-[#1F6B49] px-5 py-2 text-xs font-semibold text-[#FBF9F2] transition-colors hover:bg-[#175237]"
                >
                  Quay lại lịch mẫu
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

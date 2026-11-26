import { useState, useMemo, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  MapPin,
  CalendarDays,
} from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import { type Poi } from '@/data/pois';
import {
  type TripItinerary,
  type ItineraryStop,
  getTripItinerary,
  saveTripItinerary,
  createEmptyItinerary,
  alignItineraryToTrip,
  parseStartDateFromTrip,
} from '@/services/itineraryService';
import ExpiredTripBanner from './ExpiredTripBanner';
import TripHeader from './TripHeader';
import PoiMap from '@/components/poi/PoiMap';
import { TripExportToolbar } from '@/components/planner/EcoPackingChecklistModal';
import { useSavedPlaces } from '@/context/SavedPlacesContext';

export interface TripCalendarViewProps {
  trip: UserTrip;
  allPois: Poi[];
  onBack: () => void;
  onUpdateTrip?: (trip: UserTrip) => void;
  onNavigateToItinerary?: () => void;
  onNavigateToTab?: (tab: 'ideas' | 'itinerary' | 'calendar') => void;
}

const CALENDAR_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

function formatCalendarHour(h: number) {
  return `${String(h).padStart(2, '0')}:00`;
}

function formatStopTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function getStopSlot(stop: ItineraryStop, idx: number) {
  if (stop.start_time) {
    const parts = stop.start_time.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1] || '0', 10);
    return { hour: isNaN(h) ? 8 + idx * 2 : h, minute: isNaN(m) ? 0 : m, duration: stop.duration_minutes || 90 };
  }
  const defaultSlots = [
    { hour: 8, minute: 30, duration: 90 },
    { hour: 11, minute: 30, duration: 75 },
    { hour: 14, minute: 30, duration: 90 },
    { hour: 18, minute: 30, duration: 90 },
    { hour: 20, minute: 30, duration: 60 },
  ];
  return defaultSlots[idx % defaultSlots.length];
}

function getStopCategoryTheme(category: string | null) {
  const cat = (category || '').toLowerCase();
  if (cat.includes('luu-tru') || cat.includes('lưu trú') || cat.includes('nghỉ dưỡng') || cat.includes('homestay') || cat.includes('resort') || cat.includes('hotel')) {
    return 'bg-violet-50/95 hover:bg-violet-100/90 border-violet-200/90 border-l-violet-600 text-violet-950';
  }
  if (cat.includes('quan-an') || cat.includes('ẩm thực') || cat.includes('ăn') || cat.includes('cafe')) {
    return 'bg-amber-50/95 hover:bg-amber-100/90 border-amber-200/90 border-l-amber-600 text-amber-950';
  }
  if (cat.includes('di-tich') || cat.includes('canh-quan') || cat.includes('chua') || cat.includes('xanh') || cat.includes('văn hóa')) {
    return 'bg-emerald-50/95 hover:bg-emerald-100/90 border-emerald-200/90 border-l-emerald-700 text-emerald-950';
  }
  return 'bg-sky-50/95 hover:bg-sky-100/90 border-sky-200/90 border-l-sky-600 text-sky-950';
}

export default function TripCalendarView({
  trip,
  allPois,
  onBack,
  onUpdateTrip,
  onNavigateToItinerary,
  onNavigateToTab,
}: TripCalendarViewProps) {
  const { savedIds, pendingIds, openCollectionPicker } = useSavedPlaces();

  // 1. Quản lý trạng thái Lịch trình (Itinerary Plan)
  const [plan, setPlan] = useState<TripItinerary>(() => createEmptyItinerary(trip));
  const [isSaving, setIsSaving] = useState(false);
  const [showCustomSettings, setShowCustomSettings] = useState(false);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number>(1);
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  // Danh sách ý tưởng (Ideas) của chuyến đi
  const [tripIdeas, setTripIdeas] = useState<string[]>(() => {
    if (Array.isArray(trip.ideas)) return trip.ideas;
    return [];
  });

  useEffect(() => {
    if (Array.isArray(trip.ideas)) {
      setTripIdeas(trip.ideas);
    }
  }, [trip.ideas]);

  // Tải plan từ backend & căn chỉnh theo số ngày của chuyến đi
  useEffect(() => {
    let active = true;
    getTripItinerary(trip.id)
      .then((p) => {
        if (active && p) {
          const aligned = alignItineraryToTrip(p, trip);
          setPlan(aligned.itinerary);
        }
      })
      .catch(() => {
        if (active) {
          const fresh = createEmptyItinerary(trip);
          setPlan(fresh);
        }
      });
    return () => {
      active = false;
    };
  }, [trip.id]);

  // Đồng bộ số ngày khi trip.daysCount thay đổi
  useEffect(() => {
    if (trip.daysCount && trip.daysCount !== plan.days.length) {
      const aligned = alignItineraryToTrip(plan, trip);
      if (aligned.changed) {
        setPlan(aligned.itinerary);
        persistPlan(aligned.itinerary);
      }
    }
  }, [trip.daysCount, trip, plan]);

  const persistPlan = (nextPlan: TripItinerary) => {
    setPlan(nextPlan);
    setIsSaving(true);
    saveTripItinerary(nextPlan)
      .then(() => setIsSaving(false))
      .catch((err) => {
        console.warn('Could not save itinerary:', err);
        setIsSaving(false);
      });
  };

  // POIs từ ý tưởng
  const ideaPois = useMemo(() => {
    return tripIdeas
      .map((id) => allPois.find((p) => p.id === id || p.name.toLowerCase() === id.toLowerCase()))
      .filter((p): p is Poi => p !== null && p !== undefined);
  }, [tripIdeas, allPois]);

  // Xóa stop khỏi ngày
  const handleDeleteStop = (dayNumber: number, stopId: string) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      return {
        ...day,
        stops: day.stops.filter((s) => s.stop_id !== stopId).map((s, idx) => ({ ...s, sequence: idx })),
      };
    });
    persistPlan({ ...plan, days: nextDays });
  };

  const startMeta = useMemo(() => {
    return parseStartDateFromTrip(trip.startDate);
  }, [trip.startDate]);

  // Thông tin ngày cho header Calendar
  const calendarDaysMeta = useMemo(() => {
    return plan.days.map((day, idx) => {
      let dateObj: Date | null = null;
      if (day.date) {
        dateObj = new Date(day.date);
      } else {
        dateObj = new Date(startMeta.year, startMeta.month - 1, startMeta.day + idx);
      }

      const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
      const dayOfWeek = dayNames[dateObj.getDay()];
      const dayOfMonth = dateObj.getDate();
      const monthNum = dateObj.getMonth() + 1;

      return {
        day_number: day.day_number,
        dayOfWeek,
        dayOfMonth,
        monthNum,
        stops: day.stops,
      };
    });
  }, [plan.days, startMeta]);

  const calendarRangeText = useMemo(() => {
    if (calendarDaysMeta.length === 0) return '';
    const first = calendarDaysMeta[0];
    const last = calendarDaysMeta[calendarDaysMeta.length - 1];
    if (first.monthNum === last.monthNum) {
      return `${first.dayOfMonth} – ${last.dayOfMonth} thg ${first.monthNum}, ${startMeta.year}`;
    }
    return `${first.dayOfMonth}/${first.monthNum} – ${last.dayOfMonth}/${last.monthNum}, ${startMeta.year}`;
  }, [calendarDaysMeta, startMeta]);

  const totalScheduledStops = useMemo(
    () => plan.days.reduce((sum, day) => sum + day.stops.length, 0),
    [plan.days]
  );

  const selectedDayMeta = useMemo(
    () => calendarDaysMeta.find((d) => d.day_number === selectedCalendarDay) || calendarDaysMeta[0],
    [calendarDaysMeta, selectedCalendarDay]
  );

  // POIs cho bản đồ cột phải
  const currentDayStops = useMemo(() => {
    const day = plan.days.find((d) => d.day_number === selectedCalendarDay);
    if (!day) return [];
    return day.stops
      .map((s) => allPois.find((p) => p.id === s.poi_id || p.name.toLowerCase() === s.title.toLowerCase()))
      .filter((p): p is Poi => Boolean(p));
  }, [plan.days, selectedCalendarDay, allPois]);

  const mapPois = currentDayStops.length > 0 ? currentDayStops : ideaPois.slice(0, 10);

  // Chuẩn hóa tên chuyến đi (loại bỏ 'ư', 'a', text chat)
  const cleanTitle = trip.title?.trim();
  const isGibberish =
    !cleanTitle ||
    cleanTitle.length <= 2 ||
    cleanTitle.toLowerCase() === 'ư' ||
    cleanTitle.toLowerCase() === 'a' ||
    cleanTitle.toLowerCase().startsWith('bắt đầu');
  const displayTitle = isGibberish ? `Chuyến đi ${trip.destination || 'Đà Nẵng & Huế'}` : cleanTitle;

  const openItineraryTab = () => {
    if (onNavigateToItinerary) {
      onNavigateToItinerary();
    } else {
      onNavigateToTab?.('itinerary');
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white text-neutral-900 select-none overflow-hidden animate-fadeIn print-scroll-unlock">
      {/* ─── HEADER: TIÊU ĐỀ CHUYẾN ĐI & 3 TAB (TRIPHEADER) ─── */}
      <TripHeader
        trip={trip}
        activeTab="calendar"
        onNavigateToTab={(tab) => {
          if (tab === 'itinerary' && onNavigateToItinerary) {
            onNavigateToItinerary();
          } else {
            onNavigateToTab?.(tab);
          }
        }}
        onBack={onBack}
        showCustomSettings={showCustomSettings}
        setShowCustomSettings={setShowCustomSettings}
        isSaving={isSaving}
        daysCount={plan.days.length}
        rightActions={
          <button
            type="button"
            onClick={() => {
              setIsMapExpanded((prev) => !prev);
              setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
            }}
            aria-pressed={isMapExpanded}
            className="md:hidden min-h-10 inline-flex items-center gap-1.5 px-3 rounded-full border border-neutral-300 bg-white hover:border-neutral-950 hover:bg-neutral-50 text-xs font-semibold text-neutral-900 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            title={isMapExpanded ? 'Quay lại bảng lịch' : 'Xem bản đồ lộ trình'}
          >
            <MapPin size={14} className="text-emerald-700 shrink-0" aria-hidden="true" />
            <span>{isMapExpanded ? 'Lịch' : 'Bản đồ'}</span>
          </button>
        }
      />

      <ExpiredTripBanner
        trip={trip}
        plan={plan}
        onUpdateTrip={onUpdateTrip}
        onPlanUpdated={(next) => setPlan(next)}
      />

      {/* ─── NỘI DUNG CHÍNH: BỐ CỤC 2 CỘT (LỊCH TUẦN CRON/AMIE + BẢN ĐỒ) ─── */}
      <div className="flex-1 min-h-0 flex items-stretch overflow-hidden bg-white print-scroll-unlock">
        {/* ════════════════════════════════════════════════════════
            CỘT TRÁI: BẢNG LỊCH THỜI GIAN BIỂU (CRON / AMIE STYLE)
        ════════════════════════════════════════════════════════ */}
        <div
          className={`${
            isMapExpanded ? 'hidden' : 'w-full md:w-[560px] lg:w-[620px] xl:w-[660px] shrink-0'
          } h-full flex flex-col bg-white border-r border-neutral-200/80 select-none overflow-hidden transition-[width] duration-300 ease-in-out print-scroll-unlock print-full-width`}
        >
          {/* Header chỉ hiện khi In / Lưu PDF */}
          <div className="hidden print:block mb-4 pb-3 border-b-2 border-neutral-900">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              GreenTrip AI • Thời gian biểu chuyến đi
            </p>
            <h1 className="text-xl font-extrabold text-neutral-950 mt-1">{displayTitle}</h1>
            <p className="text-xs text-neutral-700 mt-1">
              {trip.destination} • {calendarRangeText} ({plan.days.length} ngày)
            </p>
          </div>

          {/* Header Lịch: Lịch theo tuần + Điều hướng ngày chuẩn chạm 40px */}
          <div className="no-print px-4 sm:px-6 pt-4 pb-3 shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold text-neutral-950 tracking-tight leading-tight">
                Lịch theo tuần
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-neutral-100 text-xs font-semibold text-neutral-800">
                  {plan.days.length} ngày
                </span>
                <span className="text-xs text-neutral-500" aria-hidden="true">•</span>
                <span className="text-xs font-medium text-neutral-600 truncate">
                  {trip.destination}
                </span>
                {selectedDayMeta && (
                  <>
                    <span className="text-xs text-neutral-500" aria-hidden="true">•</span>
                    <span className="text-xs font-semibold text-emerald-800">
                      Ngày {selectedDayMeta.day_number} ({selectedDayMeta.stops.length} điểm)
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Điều hướng dải ngày */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs sm:text-[13px] font-semibold text-neutral-900">
                {calendarRangeText}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={selectedCalendarDay <= 1}
                  onClick={() => setSelectedCalendarDay((prev) => Math.max(1, prev - 1))}
                  aria-label="Chọn ngày trước"
                  className="h-10 w-10 rounded-full border border-neutral-200 hover:border-neutral-950 hover:bg-neutral-50 flex items-center justify-center text-neutral-700 hover:text-neutral-950 cursor-pointer transition disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  title="Ngày trước"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={selectedCalendarDay >= plan.days.length}
                  onClick={() => setSelectedCalendarDay((prev) => Math.min(plan.days.length, prev + 1))}
                  aria-label="Chọn ngày sau"
                  className="h-10 w-10 rounded-full border border-neutral-200 hover:border-neutral-950 hover:bg-neutral-50 flex items-center justify-center text-neutral-700 hover:text-neutral-950 cursor-pointer transition disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  title="Ngày sau"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {/* Thanh xuất lịch & Chú thích danh mục màu (Amie style) */}
          <div className="no-print px-4 sm:px-6 py-2.5 border-b border-neutral-100 bg-neutral-50/50 shrink-0 flex flex-wrap items-center justify-between gap-2">
            <TripExportToolbar trip={trip} plan={plan} />
            <div className="hidden sm:flex items-center gap-3 text-xs text-neutral-600 font-medium">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" aria-hidden="true" />
                <span>Di tích &amp; Xanh</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />
                <span>Ẩm thực</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-500" aria-hidden="true" />
                <span>Lưu trú</span>
              </span>
            </div>
          </div>

          {/* Gợi ý nhẹ khi lịch chưa có điểm nào */}
          {totalScheduledStops === 0 && (
            <div className="no-print mx-4 sm:mx-6 mt-3 rounded-2xl border border-neutral-200 bg-neutral-50/80 px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  <CalendarDays size={16} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-neutral-900">
                    Chưa có khung giờ nào được xếp trên lịch tuần
                  </p>
                  <p className="text-xs text-neutral-600">
                    Thêm điểm dừng hoặc bấm Sắp xếp thông minh ở tab Kế hoạch chi tiết.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={openItineraryTab}
                className="min-h-10 px-4 rounded-full bg-neutral-950 hover:bg-neutral-800 text-white text-xs font-semibold transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                Mở Kế hoạch chi tiết
              </button>
            </div>
          )}

          {/* Lưới thời gian cuộn */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto relative auto-hide-scrollbar print-scroll-unlock">
            <div className="min-w-[460px]">
              {/* Header cột các ngày */}
              <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-neutral-200 flex items-stretch">
                <div className="w-16 shrink-0 flex items-center justify-center py-2.5 text-xs font-medium text-neutral-600 border-r border-neutral-100 select-none">
                  GMT+7
                </div>
                <div className="flex-1 grid grid-flow-col auto-cols-fr divide-x divide-neutral-100">
                  {calendarDaysMeta.map((day) => {
                    const isSelected = selectedCalendarDay === day.day_number;
                    return (
                      <button
                        key={day.day_number}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedCalendarDay(day.day_number)}
                        className={`py-2 px-1 text-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700 ${
                          isSelected ? 'bg-emerald-50/55' : 'hover:bg-neutral-50'
                        }`}
                      >
                        <div className={`text-xs font-semibold ${isSelected ? 'text-emerald-800' : 'text-neutral-600'}`}>
                          {day.dayOfWeek}
                        </div>
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mx-auto mt-0.5 transition-colors ${
                            isSelected
                              ? 'bg-neutral-950 text-white shadow-xs'
                              : 'text-neutral-900 hover:bg-neutral-200/70'
                          }`}
                        >
                          {day.dayOfMonth}
                        </div>
                        <div className="mt-1 flex items-center justify-center h-2">
                          {day.stops.length > 0 && (
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isSelected ? 'bg-emerald-700' : 'bg-neutral-400'
                              }`}
                              title={`${day.stops.length} điểm dừng`}
                            />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hàng Cả ngày */}
              <div className="flex items-stretch border-b border-neutral-200/90 text-xs text-neutral-600 bg-neutral-50/50">
                <div className="w-16 shrink-0 flex items-center justify-center py-1.5 text-xs font-medium border-r border-neutral-100 select-none">
                  Cả ngày
                </div>
                <div className="flex-1 grid grid-flow-col auto-cols-fr divide-x divide-neutral-100">
                  {calendarDaysMeta.map((day) => {
                    const isSelected = selectedCalendarDay === day.day_number;
                    return (
                      <div
                        key={day.day_number}
                        className={`h-7 px-1 flex items-center justify-center ${
                          isSelected ? 'bg-emerald-50/30' : ''
                        }`}
                      >
                        {day.stops.length > 0 && (
                          <span className="text-xs font-medium text-neutral-600 truncate">
                            {day.stops.length} điểm
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Các hàng giờ (07:00 đến 22:00) */}
              <div className="relative">
                {CALENDAR_HOURS.map((hour) => (
                  <div key={hour} className="h-16 flex items-stretch border-b border-neutral-100 relative group/row">
                    <div className="w-16 shrink-0 text-right pr-2.5 pt-1 text-xs text-neutral-600 font-medium tabular-nums select-none border-r border-neutral-100">
                      {formatCalendarHour(hour)}
                    </div>

                    <div className="flex-1 grid grid-flow-col auto-cols-fr divide-x divide-neutral-100 relative">
                      {calendarDaysMeta.map((day) => {
                        const isSelected = selectedCalendarDay === day.day_number;
                        const matchingStops = day.stops.filter((stop, idx) => {
                          const slot = getStopSlot(stop, idx);
                          return slot.hour === hour;
                        });

                        return (
                          <div
                            key={day.day_number}
                            onClick={() => setSelectedCalendarDay(day.day_number)}
                            className={`relative h-full p-0.5 transition-colors group/cell ${
                              isSelected ? 'bg-emerald-50/25 hover:bg-emerald-50/45' : 'hover:bg-neutral-50/70'
                            }`}
                          >
                            {matchingStops.map((stop) => {
                              const slot = getStopSlot(stop, day.stops.indexOf(stop));
                              const themeClass = getStopCategoryTheme(stop.category);
                              const stopKey = stop.poi_id || stop.stop_id;
                              const isActiveStop = selectedMapPoiId === stopKey;
                              return (
                                <div
                                  key={stop.stop_id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCalendarDay(day.day_number);
                                    setSelectedMapPoiId(stopKey);
                                  }}
                                  onMouseEnter={() => setHoveredStopId(stopKey)}
                                  onMouseLeave={() => setHoveredStopId(null)}
                                  className={`absolute inset-x-1 top-0.5 rounded-xl px-2 py-1.5 z-10 cursor-pointer transition-[background-color,box-shadow,border-color] border border-l-[3px] shadow-[0_1px_4px_rgba(28,25,23,0.06)] leading-snug ${themeClass} ${
                                    isActiveStop ? 'ring-2 ring-neutral-950/70 z-20' : ''
                                  }`}
                                  style={{
                                    height: `${Math.max(54, Math.min(116, (slot.duration / 60) * 64))}px`,
                                  }}
                                  title={`${stop.title} (${formatStopTime(slot.hour, slot.minute)} · ${slot.duration} phút)`}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="font-bold text-xs truncate">
                                      {stop.title}
                                    </div>
                                    <button
                                      type="button"
                                      aria-label={`Xóa ${stop.title} khỏi lịch`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteStop(day.day_number, stop.stop_id);
                                      }}
                                      className="h-5 w-5 rounded-full text-neutral-600 hover:text-rose-700 hover:bg-white/80 opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100 transition-opacity inline-flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                                      title="Xóa khỏi lịch"
                                    >
                                      <X size={12} aria-hidden="true" />
                                    </button>
                                  </div>
                                  <div className="text-xs font-medium opacity-85 mt-0.5 truncate tabular-nums">
                                    {formatStopTime(slot.hour, slot.minute)} · {slot.duration} phút
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            CỘT PHẢI: BẢN ĐỒ LỘ TRÌNH (ĐỒNG BỘ EXPLORE & PLANNER)
        ════════════════════════════════════════════════════════ */}
        <section
          className={`${isMapExpanded ? 'block' : 'hidden md:block'} flex-1 h-full relative bg-white overflow-hidden`}
          data-purpose="right-panel-container"
        >
          <div className="w-full h-full p-2 md:pl-3 md:pr-6 lg:pr-[36px] md:py-4 md:pb-6">
            <div className="w-full h-full rounded-[22px] overflow-hidden border border-neutral-200/80 shadow-[0_6px_24px_rgba(28,25,23,0.06)] relative [transform:translateZ(0)]">
              <PoiMap
                pois={mapPois}
                selectedPoiId={selectedMapPoiId}
                hoveredPoiId={hoveredStopId}
                onSelectPoi={(id) => setSelectedMapPoiId(id)}
                onHoverPoi={setHoveredStopId}
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
                onToggleFavorite={(_id, p) => {
                  if (p) openCollectionPicker(p);
                }}
                addedTrips={new Set(tripIdeas)}
                onToggleAddTrip={() => {}}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

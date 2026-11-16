import { vietnamNow, tripStartDate, dateAt } from '@/utils/tripDates';
import ExpiredTripBanner from './ExpiredTripBanner';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Check,
  X,
  RefreshCw,
  Lightbulb,
  Compass,
  Star,
  MapPin,
  SlidersHorizontal,
} from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import {
  type Poi,
  type PoiCategory,
  type PoiCity,
  getDeterministicImage,
  normalizeCategory,
  normalizeCity,
} from '@/data/pois';
import {
  type TripItinerary,
  type ItineraryDay,
  type ItineraryStop,
  getTripItinerary,
  saveTripItinerary,
  scheduleError,
  createEmptyItinerary,
  stopFromPoi,
  alignItineraryToTrip,
  parseStartDateFromTrip,
  updateDateRangeWithDays,
} from '@/services/itineraryService';
import PoiMap from '@/components/poi/PoiMap';
import { useSavedPlaces } from '@/context/SavedPlacesContext';
import { MorphTabIcon } from '@/components/ui/MorphButton';
import TripHeader from './TripHeader';
import { plannerStyles } from './plannerStyles';
import { usePlannerMapVisible } from './usePlannerMapVisible';

export interface TripCalendarViewProps {
  trip: UserTrip;
  allPois: Poi[];
  onBack: () => void;
  onUpdateTrip?: (trip: UserTrip) => void;
  onNavigateToItinerary?: () => void;
  activeWorkspaceTab?: 'ideas' | 'itinerary' | 'calendar';
  onNavigateToTab?: (tab: 'ideas' | 'itinerary' | 'calendar') => void;
  onOpenWhen?: () => void;
}

const CALENDAR_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

function formatCalendarHour(h: number) {
  return `${String(h).padStart(2, '0')}:00`;
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
  if (cat.includes('quan-an') || cat.includes('ẩm thực') || cat.includes('ăn') || cat.includes('cafe')) {
    return 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-900';
  }
  if (cat.includes('di-tich') || cat.includes('canh-quan') || cat.includes('chua') || cat.includes('xanh') || cat.includes('văn hóa')) {
    return 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200/70 text-emerald-950';
  }
  return 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-900';
}

export default function TripCalendarView({
  trip,
  allPois,
  onBack,
  onUpdateTrip,
  onNavigateToItinerary,
  activeWorkspaceTab = 'calendar',
  onNavigateToTab,
  onOpenWhen,
}: TripCalendarViewProps) {
  const { savedIds, pendingIds, openCollectionPicker } = useSavedPlaces();

  // 1. Quản lý trạng thái Lịch trình (Itinerary Plan)
  const [plan, setPlan] = useState<TripItinerary>(() => createEmptyItinerary(trip));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [now, setNow] = useState(() => vietnamNow());
  useEffect(() => {
    const refresh = () => setNow(vietnamNow());
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number>(1);
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const showMap = usePlannerMapVisible();

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
    setIsLoading(true);
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
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => {
      active = false;
    };
  }, [trip.id]);

  // Đồng bộ số ngày khi trip.daysCount thay đổi
  useEffect(() => {
    if (!isLoading && trip.daysCount && (trip.daysCount !== plan.days.length || tripStartDate(trip.startDate) !== plan.start_date)) {
      const aligned = alignItineraryToTrip(plan, trip);
      if (aligned.changed) {
        setPlan(aligned.itinerary);
        persistPlan(aligned.itinerary);
      }
    }
  }, [trip.daysCount, trip.startDate, trip, plan, isLoading]);

  const persistPlan = (nextPlan: TripItinerary) => {
    const error = scheduleError(nextPlan, plan);
    if (error) { setSaveError(error); return; }
    setSaveError('');
    setPlan(nextPlan);
    setIsSaving(true);
    saveTripItinerary(nextPlan)
      .then(() => setIsSaving(false))
      .catch((err) => {
        setSaveError(err instanceof Error ? err.message : 'Chưa thể lưu lịch.');
        setIsSaving(false);
      });
  };

  // POIs từ ý tưởng
  const ideaPois = useMemo(() => {
    return tripIdeas
      .map((id) => allPois.find((p) => p.id === id || p.name.toLowerCase() === id.toLowerCase()))
      .filter((p): p is Poi => p !== null && p !== undefined);
  }, [tripIdeas, allPois]);


  // Thêm một POI vào ngày cụ thể
  const handleAddStopToDay = (dayNumber: number, poi: Poi) => {
    const newStop = stopFromPoi(poi, 'manual');
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const stops = [...day.stops, newStop];
      return { ...day, stops: stops.map((s, idx) => ({ ...s, sequence: idx })) };
    });
    persistPlan({ ...plan, days: nextDays });
  };

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

  const calendarDaysMeta = useMemo(() => {
    const start = tripStartDate(trip.startDate);
    return plan.days.map(day => {
      const date = day.date || (start ? dateAt(start, day.day_number - 1) : null);
      const parsed = date ? new Date(`${date}T12:00:00`) : null;
      return { ...day, date, dayOfWeek: parsed ? ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][parsed.getDay()] : 'Ngày', dayOfMonth: parsed ? parsed.getDate() : day.day_number };
    });
  }, [plan.days, trip.startDate]);
  const calendarRangeText = calendarDaysMeta[0]?.date
    ? `${calendarDaysMeta[0].date} – ${calendarDaysMeta[calendarDaysMeta.length - 1].date}`
    : 'Ngày linh hoạt';

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
  const isGibberish = !cleanTitle || cleanTitle.length <= 2 || cleanTitle.toLowerCase() === 'ư' || cleanTitle.toLowerCase() === 'a' || cleanTitle.toLowerCase().startsWith('bắt đầu');
  const displayTitle = isGibberish ? `Chuyến đi ${trip.destination || 'Đà Nẵng & Huế'}` : cleanTitle;

  const [showCustomSettings, setShowCustomSettings] = useState(false);
  const totalStops = plan.days.reduce((sum, d) => sum + (d.stops?.length || 0), 0);
  const budgetBriefText = trip.budgetTier || 'Ngân sách linh hoạt';

  const formatStartingDate = (dateStr?: string) => {
    if (!dateStr) return 'Bắt đầu từ 10 thg 11';
    const match = dateStr.match(/(\d+)\s*[-–]\s*\d+\s+(?:tháng|thg)\s*(\d+)/i);
    if (match) return `Bắt đầu từ ${match[1]} thg ${match[2]}`;
    const dayMatch = dateStr.match(/(\d+)/);
    if (dayMatch) return `Bắt đầu từ ${dayMatch[1]} thg 11`;
    return 'Bắt đầu từ 10 thg 11';
  };

  return (
    <div className="flex flex-col h-full w-full bg-white text-gray-900 select-none overflow-hidden animate-fadeIn">
      {/* ─── THANH HEADER DÙNG CHUNG CHO CẢ BA TAB CHUẨN EXPLORE & MOCKUP ─── */}
      <TripHeader
        trip={trip}
        activeTab="calendar"
        onNavigateToTab={(tab) => {
          if (onNavigateToTab) onNavigateToTab(tab);
          else if (tab === 'ideas') onBack();
          else if (tab === 'itinerary') onNavigateToItinerary?.();
        }}
        onBack={onBack}
        showCustomSettings={showCustomSettings}
        setShowCustomSettings={setShowCustomSettings}
        onOpenWhere={() => onNavigateToTab?.('ideas')}
        onOpenWhen={onOpenWhen || (() => onNavigateToTab?.('ideas'))}
        onOpenWho={() => onNavigateToTab?.('ideas')}
        onOpenBudget={() => onNavigateToTab?.('ideas')}
        isSaving={isSaving}
        saveError={saveError}
        daysCount={plan.days.length}
      />

      <ExpiredTripBanner
        trip={trip}
        plan={plan}
        onUpdateTrip={onUpdateTrip}
        onPlanUpdated={(next) => setPlan(next)}
        onOpenWhen={onOpenWhen || (() => onNavigateToTab?.('ideas'))}
      />

      {/* ─── NỘI DUNG CHÍNH: BỐ CỤC 2 CỘT (LỊCH CALENDAR + BẢN ĐỒ / Ý TƯỞNG) ─── */}
      <div className="flex-1 min-h-0 flex items-stretch overflow-hidden bg-white">
        {/* ════════════════════════════════════════════════════════
            CỘT TRÁI: BẢNG LỊCH THỜI GIAN BIỂU (GOOGLE CALENDAR STYLE)
        ════════════════════════════════════════════════════════ */}
        <div className={`${isMapExpanded && showMap ? 'hidden' : plannerStyles.column} h-full flex flex-col bg-white select-none overflow-hidden transition-[width] duration-300 ease-in-out`}>
          {/* Header Lịch: Lịch chuyến đi + Điều hướng ngày */}
          <div className="px-4 sm:px-7 pt-6 pb-6 shrink-0 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <h1 className={plannerStyles.title}>
                Lịch chuyến đi
              </h1>
            </div>

            {/* Điều hướng dải ngày */}
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-medium text-gray-700">
                {calendarRangeText}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCalendarDay((prev) => Math.max(1, prev - 1));
                  }}
                  className={plannerStyles.icon}
                  title="Chọn ngày trước"
                  disabled={selectedCalendarDay <= 1}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCalendarDay((prev) => Math.min(plan.days.length, prev + 1));
                  }}
                  className={plannerStyles.icon}
                  title="Chọn ngày sau"
                  disabled={selectedCalendarDay >= plan.days.length}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Lời nhắc ngắn nếu chưa có hoạt động xếp giờ */}
          {isLoading && <div role="status" className="mx-4 sm:mx-7 mb-4 rounded-2xl bg-neutral-50 px-3.5 py-3 text-[13px] text-neutral-600">Đang tải lịch chuyến đi…</div>}
          {!isLoading && totalStops === 0 && (
            <div className="mx-4 sm:mx-7 mb-4 px-3.5 py-3 rounded-2xl bg-neutral-50 flex flex-wrap items-center justify-between gap-2 text-[13px] leading-5">
              <span className="text-gray-500">Chưa có hoạt động được xếp giờ.</span>
              <button
                type="button"
                onClick={() => onNavigateToTab ? onNavigateToTab('itinerary') : onNavigateToItinerary?.()}
                className="font-semibold text-black hover:underline cursor-pointer ml-3 shrink-0"
              >
                Sang Lịch trình →
              </button>
            </div>
          )}

          {/* Lưới thời gian cuộn */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto relative auto-hide-scrollbar">
            {/* Header cột các ngày */}
            <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-2xs flex items-stretch">
              <div className="w-14 shrink-0 text-center py-2.5 text-[12px] font-semibold text-neutral-600 border-r border-gray-100 select-none">
                GMT+7
              </div>
              <div className="flex-1 grid grid-flow-col auto-cols-fr divide-x divide-gray-100">
                {calendarDaysMeta.map((day) => {
                  const isSelected = selectedCalendarDay === day.day_number;
                  const isToday = day.date === now.date;
                  return (
                    <button
                      type="button" aria-pressed={isSelected} aria-current={isToday ? 'date' : undefined} aria-label={`${day.date || `Ngày ${day.day_number}`}${isToday ? ' hôm nay' : ''}`}
                      key={day.day_number}
                      onClick={() => setSelectedCalendarDay(day.day_number)}
                      className={`py-2 text-center cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black ${!isSelected ? 'hidden sm:block' : ''} ${
                        isSelected ? 'bg-neutral-100/70 ring-1 ring-inset ring-neutral-300' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="text-[12px] font-medium text-gray-500">
                        {day.dayOfWeek}
                      </div>
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mx-auto mt-0.5 ${
                          isToday
                            ? 'bg-emerald-700 text-white'
                            : 'text-gray-900 hover:bg-gray-200/70'
                        }`}
                      >
                        {day.dayOfMonth}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hàng all-day */}
            <div className="flex items-stretch border-b border-gray-200/90 text-xs text-neutral-600 bg-gray-50/30">
              <div className="w-14 shrink-0 text-center py-1.5 text-[12px] font-medium border-r border-gray-100 select-none">
                Cả ngày
              </div>
              <div className="flex-1 grid grid-flow-col auto-cols-fr divide-x divide-gray-100">
                {calendarDaysMeta.map((day) => (
                  <div key={day.day_number} className={`h-7 p-1 ${day.day_number !== selectedCalendarDay ? 'hidden sm:block' : ''}`}></div>
                ))}
              </div>
            </div>

            {/* Các hàng giờ (7:00 sáng đến 10:00 tối) */}
            <div className="relative">
              {CALENDAR_HOURS.map((hour) => (
                <div key={hour} data-calendar-hour={hour} className="h-16 flex items-stretch border-b border-gray-100/70 relative group/row">
                  <div className="w-14 shrink-0 text-right pr-2 pt-1 text-[12px] text-neutral-600 font-medium select-none border-r border-gray-100">
                    {formatCalendarHour(hour)}
                  </div>

                  <div className="flex-1 grid grid-flow-col auto-cols-fr divide-x divide-gray-100 relative">
                    {calendarDaysMeta.map((day) => {
                      const matchingStops = day.stops.filter((stop, idx) => {
                        const slot = getStopSlot(stop, idx);
                        return slot.hour === hour;
                      });

                      return (
                        <div
                          key={day.day_number}
                          data-calendar-date={day.date || undefined}
                          data-calendar-day={day.day_number}
                          onClick={() => setSelectedCalendarDay(day.day_number)}
                          className={`relative h-full p-0.5 hover:bg-gray-50/50 transition-colors group/cell ${day.day_number !== selectedCalendarDay ? 'hidden sm:block' : ''}`}
                        >
                          {day.date === now.date && now.minutes >= hour * 60 && now.minutes < (hour + 1) * 60 && (
                            <div data-current-time={now.minutes} aria-label="Giờ hiện tại" className="absolute inset-x-0 z-20 border-t border-red-500 pointer-events-none" style={{ top: `${(now.minutes % 60) / 60 * 64}px` }} />
                          )}
                          {matchingStops.map((stop) => {
                            const slot = getStopSlot(stop, day.stops.indexOf(stop));
                            const themeClass = getStopCategoryTheme(stop.category);
                            return (
                              <div
                                key={stop.stop_id}
                                data-calendar-stop={stop.stop_id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedMapPoiId(stop.poi_id || stop.stop_id);
                                }}
                                className={`absolute inset-x-1 rounded-xl p-2 z-10 cursor-pointer transition-all border leading-tight ${themeClass}`}
                                style={{
                                  top: `${slot.minute / 60 * 64}px`,
                                  height: `${slot.duration / 60 * 64}px`,
                                }}
                                title={`${stop.title} (${slot.duration} phút)`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <div className="min-w-0 font-semibold text-[12px] leading-4 flex items-start gap-1">
                                    <span className="line-clamp-2">{stop.title}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteStop(day.day_number, stop.stop_id);
                                    }}
                                    className="text-gray-500 hover:text-rose-600 opacity-100 sm:opacity-0 sm:group-hover/cell:opacity-100 sm:group-focus-within/cell:opacity-100 transition-opacity p-0.5 shrink-0"
                                    title="Xóa khỏi lịch"
                                  >
                                    <X size={11} />
                                  </button>
                                </div>
                                <div className="text-[12px] font-semibold opacity-80 mt-0.5">
                                  {stop.start_time || formatCalendarHour(hour)} · {slot.duration} phút
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

        {/* ════════════════════════════════════════════════════════
            CỘT PHẢI: BẢN ĐỒ LỘ TRÌNH DÙNG CHUNG KHUNG VỚI 2 TAB CÒN LẠI
        ════════════════════════════════════════════════════════ */}
        {showMap && (
        <section 
          className={plannerStyles.map}
          data-purpose="right-panel-container"
        >
          <div className={plannerStyles.mapSurface}>
            <PoiMap
              clipByParent
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
              onToggleFavorite={(_id, p) => { if (p) openCollectionPicker(p); }}
              addedTrips={new Set(tripIdeas)}
              onToggleAddTrip={() => {}}
            />
          </div>
        </section>
        )}
      </div>
    </div>
  );
}

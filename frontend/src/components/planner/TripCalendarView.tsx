import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  X,
  RefreshCw,
  Lightbulb,
  Compass,
  Star,
  MapPin,
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
  createEmptyItinerary,
  stopFromPoi,
  alignItineraryToTrip,
  parseStartDateFromTrip,
  updateDateRangeWithDays,
} from '@/services/itineraryService';
import PoiMap from '@/components/poi/PoiMap';
import { useSavedPlaces } from '@/context/SavedPlacesContext';

export interface TripCalendarViewProps {
  trip: UserTrip;
  allPois: Poi[];
  onBack: () => void;
  onUpdateTrip?: (trip: UserTrip) => void;
  onNavigateToItinerary?: () => void;
}

const CALENDAR_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

function formatCalendarHour(h: number) {
  if (h === 12) return '12pm';
  if (h > 12) return `${h - 12}pm`;
  return `${h}am`;
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
    return 'bg-amber-100/90 hover:bg-amber-200/90 border-amber-300 text-amber-950 shadow-2xs';
  }
  if (cat.includes('di-tich') || cat.includes('canh-quan') || cat.includes('chua') || cat.includes('xanh') || cat.includes('văn hóa')) {
    return 'bg-emerald-100/90 hover:bg-emerald-200/90 border-emerald-300 text-emerald-950 shadow-2xs';
  }
  return 'bg-blue-100/90 hover:bg-blue-200/90 border-blue-300 text-blue-950 shadow-2xs';
}

export default function TripCalendarView({
  trip,
  allPois,
  onBack,
  onUpdateTrip,
  onNavigateToItinerary,
}: TripCalendarViewProps) {
  const { savedIds, pendingIds, openCollectionPicker } = useSavedPlaces();

  // 1. Quản lý trạng thái Lịch trình (Itinerary Plan)
  const [plan, setPlan] = useState<TripItinerary>(() => createEmptyItinerary(trip));
  const [isSaving, setIsSaving] = useState(false);
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
    return `${first.dayOfMonth} – ${last.dayOfMonth} thg ${first.monthNum}, ${startMeta.year}`;
  }, [calendarDaysMeta, startMeta]);

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

  return (
    <div className="flex flex-col h-full w-full bg-white text-gray-900 select-none overflow-hidden animate-fadeIn">
      {/* ─── HEADER: TIÊU ĐỀ CHUYẾN ĐI & NÚT QUAY LẠI ─── */}
      <header className="h-[60px] px-6 lg:px-[36px] bg-white border-b border-gray-200/90 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-full border border-gray-200 hover:border-black hover:bg-gray-50 flex items-center justify-center text-gray-700 hover:text-black transition cursor-pointer shrink-0"
            title="Quay lại danh sách chuyến đi"
          >
            <ChevronLeft size={18} />
          </button>
          <img
            src={trip.image || (trip.destination === 'Huế' 
              ? 'https://images.unsplash.com/photo-1571508601891-ca5e7a713859?w=200&auto=format&fit=crop&q=80'
              : 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=200&auto=format&fit=crop&q=80'
            )}
            alt={trip.destination}
            className="w-8 h-8 rounded-lg object-cover border border-gray-200/80 shrink-0 shadow-2xs hidden sm:block"
          />
          <div className="min-w-0">
            <h1 className="font-extrabold text-[16px] sm:text-[18px] text-gray-950 truncate leading-snug">
              {displayTitle}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5 font-medium truncate">
              {trip.destination} • {calendarRangeText} ({plan.days.length} ngày)
            </p>
          </div>
        </div>

        {/* Nút hành động phải */}
        <div className="flex items-center gap-2.5">
          {onNavigateToItinerary && (
            <button
              type="button"
              onClick={onNavigateToItinerary}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 hover:border-black text-xs font-bold text-gray-800 hover:bg-gray-50 transition cursor-pointer shadow-2xs group"
              title="Xem danh sách chi tiết các ngày"
            >
              <Compass size={13} className="text-emerald-600" />
              <span>Kế hoạch chi tiết</span>
              <ChevronRight size={12} className="text-gray-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}

          <div className="text-xs text-gray-500 hidden sm:flex items-center gap-1 font-medium">
            {isSaving ? (
              <span className="flex items-center gap-1 text-amber-700">
                <RefreshCw size={12} className="animate-spin" /> Đang lưu...
              </span>
            ) : (
              <span className="text-emerald-700 flex items-center gap-1">
                <Check size={13} /> Đã lưu
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onBack}
            className="h-9 px-5 rounded-full bg-black hover:bg-neutral-800 text-white text-xs font-bold transition cursor-pointer shadow-xs active:scale-95"
            title="Xong và quay lại"
          >
            Xong
          </button>
        </div>
      </header>

      {/* ─── NỘI DUNG CHÍNH: BỐ CỤC 2 CỘT (LỊCH CALENDAR + BẢN ĐỒ / Ý TƯỞNG) ─── */}
      <div className="flex-1 min-h-0 flex items-stretch overflow-hidden bg-white">
        {/* ════════════════════════════════════════════════════════
            CỘT TRÁI: BẢNG LỊCH THỜI GIAN BIỂU (GOOGLE CALENDAR STYLE)
        ════════════════════════════════════════════════════════ */}
        <div className={`${isMapExpanded ? 'hidden' : 'w-[560px] lg:w-[620px] xl:w-[660px] shrink-0'} h-full flex flex-col bg-white border-r border-gray-100 select-none overflow-hidden transition-[width] duration-300 ease-in-out`}>
          {/* Header Lịch: Calendar + Điều hướng ngày */}
          <div className="px-6 pt-5 pb-3 shrink-0 flex items-center justify-between border-b border-gray-100">
            <div>
              <h2 className="text-[26px] font-extrabold text-gray-950 tracking-tight leading-none">
                Calendar
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md">
                  {plan.days.length} days
                </span>
                <span className="text-xs text-gray-400">•</span>
                <span className="text-xs font-semibold text-gray-600">
                  {trip.destination}
                </span>
              </div>
            </div>

            {/* Điều hướng dải ngày */}
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-bold text-gray-900">
                {calendarRangeText}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCalendarDay((prev) => Math.max(1, prev - 1));
                  }}
                  className="w-7 h-7 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black cursor-pointer shadow-2xs"
                  title="Ngày trước"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCalendarDay((prev) => Math.min(plan.days.length, prev + 1));
                  }}
                  className="w-7 h-7 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black cursor-pointer shadow-2xs"
                  title="Ngày sau"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Lưới thời gian cuộn */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto relative auto-hide-scrollbar">
            {/* Header cột các ngày */}
            <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-2xs flex items-stretch">
              <div className="w-14 shrink-0 text-center py-2.5 text-[11px] font-semibold text-gray-400 border-r border-gray-100 select-none">
                GMT+7
              </div>
              <div className="flex-1 grid grid-flow-col auto-cols-fr divide-x divide-gray-100">
                {calendarDaysMeta.map((day) => {
                  const isSelected = selectedCalendarDay === day.day_number;
                  return (
                    <div
                      key={day.day_number}
                      onClick={() => setSelectedCalendarDay(day.day_number)}
                      className={`py-2 text-center cursor-pointer transition-colors ${
                        isSelected ? 'bg-neutral-50/80' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="text-[11.5px] font-medium text-gray-500">
                        {day.dayOfWeek}
                      </div>
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mx-auto mt-0.5 ${
                          isSelected
                            ? 'bg-black text-white shadow-xs'
                            : 'text-gray-900 hover:bg-gray-200/70'
                        }`}
                      >
                        {day.dayOfMonth}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hàng all-day */}
            <div className="flex items-stretch border-b border-gray-200/90 text-xs text-gray-400 bg-gray-50/30">
              <div className="w-14 shrink-0 text-center py-1.5 text-[10.5px] font-medium border-r border-gray-100 select-none">
                all-day
              </div>
              <div className="flex-1 grid grid-flow-col auto-cols-fr divide-x divide-gray-100">
                {calendarDaysMeta.map((day) => (
                  <div key={day.day_number} className="h-7 p-1"></div>
                ))}
              </div>
            </div>

            {/* Các hàng giờ (7:00 sáng đến 10:00 tối) */}
            <div className="relative">
              {CALENDAR_HOURS.map((hour) => (
                <div key={hour} className="h-14 flex items-stretch border-b border-gray-100 relative group/row">
                  <div className="w-14 shrink-0 text-right pr-2 pt-1 text-[11px] text-gray-400 font-medium select-none border-r border-gray-100">
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
                          onClick={() => setSelectedCalendarDay(day.day_number)}
                          className="relative h-full p-0.5 hover:bg-gray-50/50 transition-colors group/cell"
                        >
                          {matchingStops.map((stop) => {
                            const slot = getStopSlot(stop, day.stops.indexOf(stop));
                            const themeClass = getStopCategoryTheme(stop.category);
                            return (
                              <div
                                key={stop.stop_id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedMapPoiId(stop.poi_id || stop.stop_id);
                                }}
                                className={`absolute inset-x-1 top-0.5 rounded-xl p-2 z-10 cursor-pointer transition-all border leading-tight ${themeClass}`}
                                style={{
                                  height: `${Math.max(48, Math.min(100, (slot.duration / 60) * 56))}px`,
                                }}
                                title={`${stop.title} (${slot.duration} phút)`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <div className="font-bold text-[11.5px] truncate flex items-center gap-1">
                                    <span>★</span>
                                    <span className="truncate">{stop.title}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteStop(day.day_number, stop.stop_id);
                                    }}
                                    className="text-gray-500 hover:text-rose-600 opacity-0 group-hover/cell:opacity-100 transition-opacity p-0.5 shrink-0"
                                    title="Xóa khỏi lịch"
                                  >
                                    <X size={11} />
                                  </button>
                                </div>
                                <div className="text-[10px] font-semibold opacity-80 mt-0.5">
                                  {formatCalendarHour(hour)} • {slot.duration}m
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
            CỘT PHẢI: BẢN ĐỒ LỘ TRÌNH (CHUẨN 1:1 TRANG EXPLORE)
        ════════════════════════════════════════════════════════ */}
        <section className="flex-1 h-full relative bg-white overflow-hidden" data-purpose="right-panel-container">
          <div className="w-full h-full pl-3 pr-6 lg:pr-[36px] py-4 pb-6">
            <div className="w-full h-full rounded-[22px] overflow-hidden border border-gray-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.06)] relative [transform:translateZ(0)]">
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
                onToggleFavorite={(_id, p) => { if (p) openCollectionPicker(p); }}
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

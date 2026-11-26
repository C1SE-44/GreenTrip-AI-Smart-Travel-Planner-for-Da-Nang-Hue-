import { tripRangeLabel } from '@/utils/tripDates';
import React from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  Users,
  Wallet,
} from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import PoiImage from '@/components/ui/PoiImage';
import SmoothSegmentedTabs from '@/components/ui/SmoothSegmentedTabs';
import { plannerStyles } from './plannerStyles';

export interface TripHeaderProps {
  trip: UserTrip;
  activeTab: 'ideas' | 'itinerary' | 'calendar';
  onNavigateToTab?: (tab: 'ideas' | 'itinerary' | 'calendar') => void;
  onBack: () => void;
  showCustomSettings: boolean;
  setShowCustomSettings: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenWhere?: () => void;
  onOpenWhen?: () => void;
  onOpenWho?: () => void;
  onOpenBudget?: () => void;
  isSaving?: boolean;
  saveError?: string | null;
  daysCount?: number;
  rightActions?: React.ReactNode;
}

/**
 * Format real trip date range, days count and guests count:
 * e.g. "10–13/11 · 4 ngày · 2 khách"
 */
function formatTripSummarySubtitle(trip: UserTrip, overrideDaysCount?: number): string {
  const rawDate = trip.startDate?.trim() || '';

  const dashMatch = rawDate.match(/(\d+)\s*[-–]\s*(\d+)\s+(?:tháng|thg)\s*(\d+)/i);
  const ngayMatch = rawDate.match(/^Ngày\s+(\d+)\s*[-–]\s*(\d+)\s+tháng\s+(\d+)/i);

  let days = overrideDaysCount || trip.daysCount;
  if (!days) {
    if (dashMatch) {
      days = Math.max(1, parseInt(dashMatch[2], 10) - parseInt(dashMatch[1], 10) + 1);
    } else if (ngayMatch) {
      days = Math.max(1, parseInt(ngayMatch[2], 10) - parseInt(ngayMatch[1], 10) + 1);
    } else {
      days = 3;
    }
  }

  const guests = trip.peopleCount || 2;
  return `${tripRangeLabel(trip.startDate, days)} · ${days} ngày · ${guests} khách`;
}

function formatStartingDate(dateStr?: string): string {
  return tripRangeLabel(dateStr, 1);
}

export default function TripHeader({
  trip,
  activeTab,
  onNavigateToTab,
  onBack,
  showCustomSettings,
  setShowCustomSettings,
  onOpenWhere,
  onOpenWhen,
  onOpenWho,
  onOpenBudget,
  isSaving,
  saveError,
  daysCount,
  rightActions,
}: TripHeaderProps) {
  const cleanTitle = trip.title?.trim();
  const isGibberish =
    !cleanTitle ||
    cleanTitle.length <= 2 ||
    cleanTitle.toLowerCase() === 'ư' ||
    cleanTitle.toLowerCase() === 'a' ||
    cleanTitle.toLowerCase().startsWith('bắt đầu');
  const displayTitle = isGibberish
    ? `Chuyến đi ${trip.destination || 'Đà Nẵng & Huế'}`
    : cleanTitle.replace(/\s*\(\d+\s*ngày\)/gi, '');

  const subtitleText = formatTripSummarySubtitle(trip, daysCount);
  const budgetText = trip.budgetTier || 'Ngân sách linh hoạt';

  const defaultImage =
    trip.destination === 'Huế'
      ? 'https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/ce249bef-0477-4a46-a19c-735b3db10498.webp'
      : 'https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/fcef1de3-bd58-4eb0-ae95-7d6d8f77f93b.webp';

  return (
    <header className="no-print min-h-[116px] xl:min-h-[68px] relative px-4 sm:px-6 lg:px-8 pt-3 pb-[54px] xl:py-0 bg-white/95 backdrop-blur-md border-b border-neutral-200/80 flex items-center justify-between gap-3 shrink-0 z-30 select-none">
      {/* Left: Back + Trip Thumbnail + Title & Subtitle */}
      <div className="flex items-center gap-3 shrink min-w-0 max-w-[calc(100%-56px)] xl:max-w-[36%]">
        <button
          type="button"
          onClick={onBack}
          aria-label="Quay lại danh sách chuyến đi"
          className="w-10 h-10 rounded-full border border-neutral-200 hover:border-neutral-950 flex items-center justify-center text-neutral-800 hover:bg-neutral-50 transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          title="Quay lại danh sách chuyến đi"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>

        <div className="w-10 h-10 rounded-xl overflow-hidden border border-neutral-200/80 shrink-0 hidden sm:block bg-neutral-100">
          <PoiImage
            src={trip.image || defaultImage}
            alt={trip.destination}
            fallbackSeed={trip.id}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="min-w-0">
          <h1 className={`${plannerStyles.tripTitle} truncate`}>{displayTitle}</h1>
          <p className="text-xs leading-[18px] text-neutral-600 font-medium truncate">
            {subtitleText}
          </p>
        </div>
      </div>

      {/* Center: Smooth Sliding Segmented Workspace Switcher */}
      <div
        className={`flex w-max max-w-[calc(100%-24px)] whitespace-nowrap items-center absolute bottom-2 xl:bottom-auto left-1/2 -translate-x-1/2 ${plannerStyles.controlText}`}
      >
        <SmoothSegmentedTabs
          variant="pill"
          ariaLabel="Chuyển đổi góc nhìn lịch trình"
          value={activeTab}
          onChange={(tab) => onNavigateToTab?.(tab)}
          options={[
            { id: 'ideas', label: 'Ý tưởng' },
            { id: 'itinerary', label: 'Lịch trình' },
            { id: 'calendar', label: 'Lịch' },
          ]}
        />
      </div>

      {/* Right: Save status + Extra actions + Customize Popover */}
      <div className="flex items-center gap-2 shrink-0">
        {isSaving ? (
          <span className="text-xs text-amber-800 hidden md:flex items-center gap-1.5 font-semibold mr-1">
            <RefreshCw size={12} className="animate-spin" aria-hidden="true" />
            <span>Đang lưu…</span>
          </span>
        ) : saveError ? (
          <span className="text-xs text-rose-700 hidden md:flex items-center gap-1 font-semibold mr-1">
            Lưu lỗi
          </span>
        ) : null}

        {rightActions}

        <div className="h-5 w-px bg-neutral-200 hidden sm:block" aria-hidden="true" />

        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowCustomSettings(!showCustomSettings);
            }}
            className={`h-10 w-10 sm:w-auto sm:px-4 rounded-full border text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
              showCustomSettings
                ? 'bg-neutral-950 border-neutral-950 text-white'
                : 'bg-white border-neutral-300 hover:border-neutral-950 text-neutral-900'
            }`}
            title="Tùy chỉnh thông số chuyến đi"
            aria-expanded={showCustomSettings}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Tùy chỉnh</span>
            <ChevronDown
              size={13}
              aria-hidden="true"
              className={`hidden sm:block transition-transform duration-200 ${showCustomSettings ? 'rotate-180' : ''}`}
            />
          </button>

          {showCustomSettings && (
            <div
              className="absolute right-0 top-12 w-76 bg-white rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.14)] border border-neutral-200 p-2 z-50 animate-fadeIn divide-y divide-neutral-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-xs font-bold text-neutral-600 px-3 py-2">
                Thông số chuyến đi
              </div>

              <div className="pt-1 space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomSettings(false);
                    onOpenWhere?.();
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-neutral-50 transition flex items-center justify-between gap-2 group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200/70 text-emerald-800 flex items-center justify-center shrink-0">
                      <MapPin size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs text-neutral-600 font-medium">Điểm đến</div>
                      <div className="text-sm font-semibold text-neutral-950 truncate">
                        {trip.destination}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-neutral-500 group-hover:text-neutral-950 shrink-0" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowCustomSettings(false);
                    onOpenWhen?.();
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-neutral-50 transition flex items-center justify-between gap-2 group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-neutral-100 border border-neutral-200/70 text-neutral-800 flex items-center justify-center shrink-0">
                      <Calendar size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs text-neutral-600 font-medium">Thời gian bắt đầu</div>
                      <div className="text-sm font-semibold text-neutral-950 truncate">
                        {formatStartingDate(trip.startDate)}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-neutral-500 group-hover:text-neutral-950 shrink-0" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowCustomSettings(false);
                    onOpenWho?.();
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-neutral-50 transition flex items-center justify-between gap-2 group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-neutral-100 border border-neutral-200/70 text-neutral-800 flex items-center justify-center shrink-0">
                      <Users size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs text-neutral-600 font-medium">Số du khách</div>
                      <div className="text-sm font-semibold text-neutral-950 truncate">
                        {trip.peopleCount ? `${trip.peopleCount} du khách` : '2 du khách'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-neutral-500 group-hover:text-neutral-950 shrink-0" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowCustomSettings(false);
                    onOpenBudget?.();
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-neutral-50 transition flex items-center justify-between gap-2 group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-neutral-100 border border-neutral-200/70 text-neutral-800 flex items-center justify-center shrink-0">
                      <Wallet size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs text-neutral-600 font-medium">Ngân sách</div>
                      <div className="text-sm font-semibold text-neutral-950 truncate">
                        {budgetText}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-neutral-500 group-hover:text-neutral-950 shrink-0" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

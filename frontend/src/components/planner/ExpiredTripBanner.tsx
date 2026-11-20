import { useState } from 'react';
import { Clock, CalendarCheck, X, RefreshCw } from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import { vietnamNow, tripStartDate, dateAt, tripRangeLabel } from '@/utils/tripDates';
import {
  alignItineraryToTrip,
  createEmptyItinerary,
  getTripItinerary,
  saveTripItinerary,
  type TripItinerary,
} from '@/services/itineraryService';

export interface ExpiredTripBannerProps {
  trip: UserTrip;
  plan?: TripItinerary | null;
  onUpdateTrip?: (updatedTrip: UserTrip) => void;
  onPlanUpdated?: (updatedPlan: TripItinerary) => void;
  onOpenWhen?: () => void;
}

export default function ExpiredTripBanner({
  trip,
  plan,
  onUpdateTrip,
  onPlanUpdated,
  onOpenWhen,
}: ExpiredTripBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [error, setError] = useState('');

  const start = tripStartDate(trip.startDate);
  const count = trip.daysCount || 1;
  const end = start ? dateAt(start, count - 1) : null;
  const today = vietnamNow().date;

  // Chỉ hiện banner khi ngày bắt đầu của chuyến đi đã nằm trong quá khứ
  const isExpired = Boolean(start && start < today);

  if (!isExpired || dismissed) {
    return null;
  }

  const handleRollToToday = async () => {
    setIsRolling(true);
    setError('');
    try {
      const updatedTrip: UserTrip = {
        ...trip,
        startDate: today,
        daysCount: count,
      };

      let basePlan = plan;
      if (!basePlan) {
        try {
          basePlan = await getTripItinerary(trip.id);
        } catch {
          basePlan = createEmptyItinerary(updatedTrip);
        }
      }
      const aligned = alignItineraryToTrip(basePlan, updatedTrip);
      if (aligned.warning) throw new Error(aligned.warning);

      const savedItinerary = await saveTripItinerary(aligned.itinerary);
      onUpdateTrip?.(updatedTrip);
      onPlanUpdated?.(savedItinerary);
      setDismissed(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa thể cập nhật ngày chuyến đi.');
    } finally {
      setIsRolling(false);
    }
  };

  const shortDayMonth = (isoDate: string) => `${Number(isoDate.slice(8))}/${Number(isoDate.slice(5, 7))}`;

  return (
    <div
      role="alert"
      className="no-print bg-amber-50 border-b border-amber-200/90 px-4 sm:px-6 lg:px-[36px] py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-amber-950 z-20 animate-fadeIn"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-full bg-amber-100 border border-amber-300/60 flex items-center justify-center shrink-0 text-amber-800 shadow-2xs">
          <Clock size={14} />
        </div>
        <div className="text-[13px] leading-snug">
          <span className="font-semibold text-amber-950">
            {end && end < today
              ? `Lịch trình này đã qua ngày dự kiến (${tripRangeLabel(trip.startDate, count)}).`
              : `Ngày khởi hành (${tripRangeLabel(trip.startDate, 1)}) đã qua.`}
          </span>
          <span className="text-amber-800/90 hidden md:inline ml-1.5">
            Bạn có muốn dời ngày bắt đầu sang hôm nay để tiếp tục sử dụng không?
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {error && <span className="text-[12px] text-rose-600 font-medium mr-1">{error}</span>}
        <button
          type="button"
          onClick={handleRollToToday}
          disabled={isRolling}
          className="h-8 px-3.5 rounded-full bg-black hover:bg-neutral-800 text-white text-[12px] font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-2xs cursor-pointer disabled:opacity-50"
        >
          {isRolling ? (
            <>
              <RefreshCw size={12} className="animate-spin" />
              <span>Đang cập nhật...</span>
            </>
          ) : (
            <>
              <CalendarCheck size={13} className="text-amber-300" />
              <span>Dời sang hôm nay ({shortDayMonth(today)})</span>
            </>
          )}
        </button>
        {onOpenWhen && (
          <button
            type="button"
            onClick={onOpenWhen}
            className="h-8 px-3 rounded-full bg-white hover:bg-amber-100/60 border border-amber-300/80 text-amber-900 text-[12px] font-medium transition cursor-pointer"
          >
            Chọn ngày khác
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="w-7 h-7 rounded-full hover:bg-amber-100 flex items-center justify-center text-amber-700 transition cursor-pointer"
          title="Đóng thông báo"
          aria-label="Đóng thông báo"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

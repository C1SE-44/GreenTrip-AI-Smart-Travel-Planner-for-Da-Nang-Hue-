import { useState } from 'react';
import { Copy, Eye, RefreshCw } from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';

export interface SampleTripReadOnlyBannerProps {
  trip: UserTrip;
  onUseSample?: (sampleTripId: string) => Promise<void> | void;
}

export default function SampleTripReadOnlyBanner({
  trip,
  onUseSample,
}: SampleTripReadOnlyBannerProps) {
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState('');

  if (!trip.id.startsWith('sample-')) {
    return null;
  }

  const handleUseSample = async () => {
    if (!onUseSample) return;
    setIsCloning(true);
    setError('');
    try {
      await onUseSample(trip.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa thể sao chép chuyến đi mẫu.');
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <div
      role="status"
      aria-label="Chuyến đi mẫu ở chế độ chỉ xem"
      className="no-print bg-emerald-50 border-b border-emerald-200/90 px-4 sm:px-6 lg:px-[36px] py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-emerald-950 z-20 shrink-0"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-full bg-emerald-100 border border-emerald-300/70 flex items-center justify-center shrink-0 text-emerald-800">
          <Eye size={14} />
        </div>
        <div className="text-xs sm:text-[13px] leading-snug">
          <span className="font-semibold text-emerald-950">
            Đây là hành trình mẫu để tham khảo (chế độ chỉ xem).
          </span>
          <span className="text-emerald-800 hidden md:inline ml-1.5">
            Tạo bản sao riêng vào tài khoản để đổi ngày khởi hành, thêm địa điểm và lưu vĩnh viễn.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {error && <span className="text-xs text-rose-700 font-medium mr-1">{error}</span>}
        <button
          type="button"
          onClick={handleUseSample}
          disabled={isCloning || !onUseSample}
          className="min-h-[44px] px-4 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-2xs cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
        >
          {isCloning ? (
            <>
              <RefreshCw size={13} className="animate-spin" />
              <span>Đang tạo bản sao...</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Dùng mẫu này</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

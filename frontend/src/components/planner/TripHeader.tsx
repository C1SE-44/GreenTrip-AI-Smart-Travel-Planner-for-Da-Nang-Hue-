import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';

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
}

/**
 * Format real trip date range, days count and guests count:
 * e.g. "10–13/11 · 4 ngày · 2 khách"
 */
export function formatTripSummarySubtitle(trip: UserTrip, overrideDaysCount?: number): string {
  const rawDate = trip.startDate?.trim() || '';
  let dateRange = '10–12/11';

  // 1. Parse date range
  const dashMatch = rawDate.match(/(\d+)\s*[-–]\s*(\d+)\s+(?:tháng|thg)\s*(\d+)/i);
  const ngayMatch = rawDate.match(/^Ngày\s+(\d+)\s*[-–]\s*(\d+)\s+tháng\s+(\d+)/i);
  const slashMatch = rawDate.match(/(\d+)\s*[-–]\s*(\d+)\s*\/\s*(\d+)/);
  const singleDateMatch = rawDate.match(/(\d+)\s+(?:tháng|thg)\s*(\d+)/i);

  if (dashMatch) {
    dateRange = `${dashMatch[1]}–${dashMatch[2]}/${dashMatch[3]}`;
  } else if (ngayMatch) {
    dateRange = `${ngayMatch[1]}–${ngayMatch[2]}/${ngayMatch[3]}`;
  } else if (slashMatch) {
    dateRange = `${slashMatch[1]}–${slashMatch[2]}/${slashMatch[3]}`;
  } else if (singleDateMatch) {
    dateRange = `${singleDateMatch[1]}/${singleDateMatch[2]}`;
  } else if (rawDate.includes('/')) {
    dateRange = rawDate;
  }

  // 2. Compute days count
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

  // 3. Guests count
  const guests = trip.peopleCount || 2;

  return `${dateRange} · ${days} ngày · ${guests} khách`;
}

export function formatStartingDate(dateStr?: string): string {
  if (!dateStr) return 'Bắt đầu từ 10 thg 11';
  const match = dateStr.match(/(\d+)\s*[-–]\s*\d+\s+(?:tháng|thg)\s*(\d+)/i);
  if (match) return `Bắt đầu từ ${match[1]} thg ${match[2]}`;
  const dayMatch = dateStr.match(/(\d+)/);
  if (dayMatch) return `Bắt đầu từ ${dayMatch[1]} thg 11`;
  return 'Bắt đầu từ 10 thg 11';
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
      ? 'https://images.unsplash.com/photo-1571508601891-ca5e7a713859?w=200&auto=format&fit=crop&q=80'
      : 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=200&auto=format&fit=crop&q=80';

  return (
    <header className="h-[64px] relative px-6 lg:px-[36px] bg-white border-b border-gray-200/80 flex items-center justify-between shrink-0 z-30 select-none">
      {/* ─── VÙNG TRÁI: NÚT QUAY LẠI + ẢNH NHỎ + TÊN CHUYẾN ĐI & PHỤ ĐỀ ─── */}
      <div className="flex items-center gap-3 shrink min-w-0 max-w-[340px] xl:max-w-[420px]">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-full border border-gray-200/90 hover:border-black flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer shrink-0 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          title="Quay lại danh sách chuyến đi"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Thumbnail ảnh nhỏ bo góc 8px */}
        <img
          src={trip.image || defaultImage}
          alt={trip.destination}
          className="w-9 h-9 rounded-lg object-cover border border-gray-200/80 shrink-0 shadow-2xs hidden sm:block"
        />

        <div className="min-w-0">
          <h1 className="text-[16px] leading-[22px] font-semibold text-gray-950 truncate">
            {displayTitle}
          </h1>
          <p className="text-[13px] leading-[18px] text-gray-500 font-normal truncate">
            {subtitleText}
          </p>
        </div>
      </div>

      {/* ─── VÙNG GIỮA: Ý TƯỞNG · LỊCH TRÌNH · LỊCH (CHUẨN EXPLORE & MOCKUP) ─── */}
      <div className="flex items-center absolute left-1/2 -translate-x-1/2 gap-1 text-[14px] leading-[20px] font-medium">
        <button
          type="button"
          onClick={() => onNavigateToTab?.('ideas')}
          className={`h-[36px] px-[14px] rounded-full transition-colors font-medium flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${
            activeTab === 'ideas'
              ? 'bg-black text-white'
              : 'text-neutral-700 hover:text-black bg-transparent hover:bg-gray-100/60'
          }`}
        >
          Ý tưởng
        </button>

        <button
          type="button"
          onClick={() => onNavigateToTab?.('itinerary')}
          className={`h-[36px] px-[14px] rounded-full transition-colors font-medium flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${
            activeTab === 'itinerary'
              ? 'bg-black text-white'
              : 'text-neutral-700 hover:text-black bg-transparent hover:bg-gray-100/60'
          }`}
        >
          Lịch trình
        </button>

        <button
          type="button"
          onClick={() => onNavigateToTab?.('calendar')}
          className={`h-[36px] px-[14px] rounded-full transition-colors font-medium flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${
            activeTab === 'calendar'
              ? 'bg-black text-white'
              : 'text-neutral-700 hover:text-black bg-transparent hover:bg-gray-100/60'
          }`}
        >
          Lịch
        </button>
      </div>

      {/* ─── VÙNG PHẢI: TRẠNG THÁI LƯU (NẾU ĐANG LƯU/LỖI) + ĐƯỜNG PHÂN CÁCH + NÚT TÙY CHỈNH ─── */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Phản hồi khi đang lưu hoặc lỗi - không đẩy cụm tab ở giữa vì tab căn absolute giữa */}
        {isSaving ? (
          <span className="text-[12px] text-amber-700 hidden md:flex items-center gap-1 font-medium mr-1 animate-pulse">
            <RefreshCw size={11} className="animate-spin" /> Đang lưu...
          </span>
        ) : saveError ? (
          <span className="text-[12px] text-rose-600 hidden md:flex items-center gap-1 font-medium mr-1">
            Lưu lỗi
          </span>
        ) : null}

        {/* Đường gạch phân cách nhẹ nhàng chuẩn mockup */}
        <div className="h-5 w-px bg-gray-200 hidden sm:block" />

        {/* Nút Tùy chỉnh với Dropdown Popover 4 thông số */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowCustomSettings(!showCustomSettings);
            }}
            className={`h-9 px-3.5 rounded-full border border-gray-200/90 hover:border-black text-[13px] font-medium transition flex items-center gap-2 shadow-2xs cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${
              showCustomSettings ? 'bg-black text-white' : 'bg-white hover:bg-gray-50 text-gray-900'
            }`}
            title="Tùy chỉnh thông số chuyến đi"
          >
            <SlidersHorizontal size={14} className={showCustomSettings ? 'text-white' : 'text-gray-700'} />
            <span>Tùy chỉnh</span>
            <ChevronDown
              size={12}
              className={`transition-transform duration-200 ${showCustomSettings ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Popover chứa 4 thông số */}
          {showCustomSettings && (
            <div
              className="absolute right-0 top-11 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-fadeIn"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[11px] font-bold text-gray-400 px-2.5 py-1 uppercase tracking-wider">
                Tùy chỉnh chuyến đi
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowCustomSettings(false);
                  onOpenWhere?.();
                }}
                className="w-full text-left p-2.5 rounded-xl hover:bg-gray-50 transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                    <i className="ph-fill ph-map-pin text-sm"></i>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 font-medium">Điểm đến</div>
                    <div className="text-[13px] font-bold text-gray-900 group-hover:text-black">
                      {trip.destination}
                    </div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-gray-400 group-hover:text-black" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowCustomSettings(false);
                  onOpenWhen?.();
                }}
                className="w-full text-left p-2.5 rounded-xl hover:bg-gray-50 transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                    <i className="ph-fill ph-calendar text-sm"></i>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 font-medium">Thời gian bắt đầu</div>
                    <div className="text-[13px] font-bold text-gray-900 group-hover:text-black">
                      {formatStartingDate(trip.startDate)}
                    </div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-gray-400 group-hover:text-black" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowCustomSettings(false);
                  onOpenWho?.();
                }}
                className="w-full text-left p-2.5 rounded-xl hover:bg-gray-50 transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                    <i className="ph-fill ph-users text-sm"></i>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 font-medium">Số du khách</div>
                    <div className="text-[13px] font-bold text-gray-900 group-hover:text-black">
                      {trip.peopleCount ? `${trip.peopleCount} du khách` : '2 du khách'}
                    </div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-gray-400 group-hover:text-black" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowCustomSettings(false);
                  onOpenBudget?.();
                }}
                className="w-full text-left p-2.5 rounded-xl hover:bg-gray-50 transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                    <i className="ph-fill ph-wallet text-sm"></i>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 font-medium">Ngân sách</div>
                    <div className="text-[13px] font-bold text-gray-900 group-hover:text-black">
                      {budgetText}
                    </div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-gray-400 group-hover:text-black" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

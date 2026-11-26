import { tripRangeLabel } from '@/utils/tripDates';
import React from 'react';
import { CalendarDays, ChevronLeft, MapPin, RefreshCw, Users, Wallet } from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import { plannerStyles } from './plannerStyles';

export interface TripHeaderProps {
  trip: UserTrip;
  /** Compatibility props retained for existing callers after removing header tabs and settings menu. */
  activeTab: 'ideas' | 'itinerary' | 'calendar';
  onNavigateToTab?: (tab: 'ideas' | 'itinerary' | 'calendar') => void;
  onBack: () => void;
  showCustomSettings: boolean;
  setShowCustomSettings: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenWhere?: () => void;
  onOpenWhen?: () => void;
  onOpenWho?: () => void;
  onOpenBudget?: () => void;
  onOpenPreferences?: () => void;
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


  // 1. Parse date range
  const dashMatch = rawDate.match(/(\d+)\s*[-–]\s*(\d+)\s+(?:tháng|thg)\s*(\d+)/i);
  const ngayMatch = rawDate.match(/^Ngày\s+(\d+)\s*[-–]\s*(\d+)\s+tháng\s+(\d+)/i);

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

  return `${tripRangeLabel(trip.startDate, days)} · ${days} ngày · ${guests} khách`;
}

const PREFERENCE_LABELS: Record<string, string> = {
  beach: 'Biển',
  nature: 'Thiên nhiên',
  culture: 'Văn hóa – Lịch sử',
  food: 'Ẩm thực',
  coffee: 'Cà phê',
  checkin: 'Check-in',
  adventure: 'Phiêu lưu',
  relaxation: 'Nghỉ dưỡng',
  spiritual: 'Tâm linh',
  local: 'Trải nghiệm địa phương',
};

interface TripMetaItemProps {
  icon: React.ReactNode;
  label: string;
  title: string;
  onClick?: () => void;
}

function TripMetaItem({ icon, label, title, onClick }: TripMetaItemProps) {
  const className = 'flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 cursor-pointer';
  const content = (
    <>
      {icon}
      <span className="truncate">{label}</span>
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} title={title} aria-label={title} className={`${className} min-h-10`}>
      {content}
    </button>
  ) : (
    <span title={title} className={`${className} min-h-10`}>
      {content}
    </span>
  );
}

export default function TripHeader({
  trip,
  onBack,
  onOpenWhere,
  onOpenWhen,
  onOpenWho,
  onOpenBudget,
  onOpenPreferences,
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
  const resolvedDaysCount = daysCount || trip.daysCount || trip.flexibleDays || 3;
  const dateRangeText = `${tripRangeLabel(trip.startDate, resolvedDaysCount)} · ${resolvedDaysCount} ngày`;
  const budgetText = typeof trip.totalBudget === 'number'
    ? `${new Intl.NumberFormat('vi-VN').format(trip.totalBudget)} ₫`
    : trip.budgetTier?.includes('dining:') ? 'Ngân sách tùy chỉnh' : trip.budgetTier || 'Ngân sách linh hoạt';
  const preferences = [
    ...(trip.preferences ?? []).map((preference) => PREFERENCE_LABELS[preference] || preference),
    ...(trip.preferenceText?.trim() ? [trip.preferenceText.trim()] : []),
  ];
  const preferencesText = preferences.length === 0
    ? 'Sở thích'
    : `${preferences[0]}${preferences.length > 1 ? ` +${preferences.length - 1}` : ''}`;

  const defaultImage =
    trip.destination === 'Huế'
      ? 'https://images.unsplash.com/photo-1571508601891-ca5e7a713859?w=200&auto=format&fit=crop&q=80'
      : 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=200&auto=format&fit=crop&q=80';

  return (
    <header className="no-print min-h-[64px] relative px-4 sm:px-6 lg:px-[36px] py-2 xl:py-0 bg-white border-b border-gray-200/80 flex items-center justify-between gap-3 shrink-0 z-30 select-none">
      {/* ─── VÙNG TRÁI: NÚT QUAY LẠI + ẢNH NHỎ + TÊN CHUYẾN ĐI & PHỤ ĐỀ ─── */}
      <div className="flex items-center gap-3 shrink min-w-0 max-w-[calc(100%-56px)] xl:max-w-[35%]">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-full border border-gray-200/90 hover:border-black flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer shrink-0 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
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
          <h1 className={`${plannerStyles.tripTitle} truncate`}>
            {displayTitle}
          </h1>
          <p className="text-[13px] leading-[18px] text-gray-500 font-normal truncate">
            {subtitleText}
          </p>
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 justify-center px-2 xl:flex" aria-label="Thông tin chuyến đi">
        <div className="inline-flex min-w-0 max-w-[560px] flex-1 divide-x divide-neutral-200 overflow-hidden rounded-full border border-neutral-200 bg-white">
          <TripMetaItem
            icon={<MapPin size={13} className="shrink-0 text-neutral-600" aria-hidden="true" />}
            label={trip.destination || 'Điểm đến'}
            title={`Điểm đến: ${trip.destination || 'Chưa chọn'}`}
            onClick={onOpenWhere}
          />
          <TripMetaItem
            icon={<CalendarDays size={13} className="shrink-0 text-neutral-600" aria-hidden="true" />}
            label={dateRangeText}
            title={`Thời gian: ${dateRangeText}`}
            onClick={onOpenWhen}
          />
          <TripMetaItem
            icon={<Users size={13} className="shrink-0 text-neutral-600" aria-hidden="true" />}
            label={`${trip.peopleCount || 2} khách`}
            title={`Số khách: ${trip.peopleCount || 2}`}
            onClick={onOpenWho}
          />
          <TripMetaItem
            icon={<Wallet size={13} className="shrink-0 text-neutral-600" aria-hidden="true" />}
            label={budgetText}
            title={`Ngân sách: ${budgetText}`}
            onClick={onOpenBudget}
          />
          <TripMetaItem
            icon={<span className="shrink-0 text-neutral-500" aria-hidden="true">♡</span>}
            label={preferencesText}
            title={preferences.length > 0 ? `Sở thích: ${preferences.join(', ')}` : 'Chưa chọn sở thích'}
            onClick={onOpenPreferences}
          />
        </div>
      </div>

      {/* ─── VÙNG PHẢI: TRẠNG THÁI VÀ THAO TÁC CHUYẾN ĐI ─── */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Phản hồi khi đang lưu hoặc lỗi */}
        {isSaving ? (
          <span className="text-[12px] text-amber-700 hidden md:flex items-center gap-1 font-medium mr-1 animate-pulse">
            <RefreshCw size={11} className="animate-spin" /> Đang lưu...
          </span>
        ) : saveError ? (
          <span className="text-[12px] text-rose-600 hidden md:flex items-center gap-1 font-medium mr-1" role="status" title={saveError}>
            Lưu lỗi
          </span>
        ) : null}

        {rightActions}
      </div>
    </header>
  );
}

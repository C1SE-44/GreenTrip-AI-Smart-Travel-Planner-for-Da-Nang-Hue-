import React, { useRef, useState, useEffect } from 'react';
import {
  SlidersHorizontal,
  Clock,
  Star,
  Award,
  Leaf,
  Ticket,
  CloudRain,
  Wallet,
  Check,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import type { ExploreFilterValues } from './ExploreFilterModal';

interface QuickFilterBarProps {
  values: ExploreFilterValues;
  onChange: React.Dispatch<React.SetStateAction<ExploreFilterValues>>;
  onOpenModal?: () => void;
  activeFilterCount?: number;
  onClearAll?: () => void;
}

export const QuickFilterBar: React.FC<QuickFilterBarProps> = ({
  values,
  onChange,
  onOpenModal,
  activeFilterCount = 0,
  onClearAll,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll, { passive: true });
      window.addEventListener('resize', checkScroll);
    }
    return () => {
      if (el) el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, []);

  const scrollByAmount = (offset: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  const toggleOpenNow = () => {
    onChange((prev) => ({ ...prev, openNowOnly: !prev.openNowOnly }));
  };

  const toggleRating4Plus = () => {
    onChange((prev) => ({
      ...prev,
      minRating: prev.minRating === 4.0 ? null : 4.0,
    }));
  };

  const toggleEcoCertified = () => {
    onChange((prev) => ({
      ...prev,
      ecoCertifiedOnly: !prev.ecoCertifiedOnly,
    }));
  };

  const toggleFreeTicket = () => {
    onChange((prev) => ({
      ...prev,
      freeTicketOnly: !prev.freeTicketOnly,
    }));
  };

  const toggleCheapBudget = () => {
    onChange((prev) => ({
      ...prev,
      budget: prev.budget === '$' ? 'all' : '$',
    }));
  };

  const toggleRainyDay = () => {
    onChange((prev) => ({
      ...prev,
      rainyDayFriendly: !prev.rainyDayFriendly,
    }));
  };

  const PILL_BASE =
    'h-[34px] px-3.5 rounded-full flex items-center gap-1.5 transition-all duration-150 text-xs font-semibold cursor-pointer shrink-0 border select-none active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 whitespace-nowrap';
  const PILL_UNSELECTED =
    'bg-white border-[#E2E8E4] text-neutral-800 hover:border-emerald-300 hover:bg-emerald-50/40';
  const PILL_SELECTED =
    'bg-emerald-800 border-emerald-800 text-white shadow-[0_2px_8px_rgba(6,95,70,0.22)]';

  return (
    <div
      className="flex items-center gap-2 pt-1 pb-1 w-full"
      role="toolbar"
      aria-label="Thanh công cụ lọc chuyến đi"
    >
      {/* 1. MASTER MODAL TRIGGER (Nút Bộ lọc chi tiết - Ngôn ngữ du khách) */}
      {onOpenModal && (
        <>
          <button
            type="button"
            onClick={onOpenModal}
            className={`h-[34px] px-3.5 rounded-full border flex items-center gap-1.5 shrink-0 text-xs font-bold cursor-pointer transition-all duration-150 select-none active:scale-[0.96] ${
              activeFilterCount > 0
                ? 'bg-emerald-800 border-emerald-800 text-white shadow-[0_2px_8px_rgba(6,95,70,0.22)]'
                : 'bg-white border-neutral-300 text-neutral-900 hover:border-emerald-400 hover:bg-neutral-50'
            }`}
            aria-label={`Bộ lọc chuyến đi${activeFilterCount > 0 ? ` (${activeFilterCount} điều kiện đang chọn)` : ''}`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>Bộ lọc chuyến đi</span>
            {activeFilterCount > 0 && (
              <span className="flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white shadow-xs">
                {activeFilterCount}
              </span>
            )}
          </button>
          {/* Phân tách tinh tế */}
          <div className="h-5 w-[1px] bg-neutral-200/90 shrink-0" aria-hidden="true" />
        </>
      )}

      {/* 2. SCROLLABLE QUICK PILLS CONTAINER */}
      <div className="relative flex-1 min-w-0 flex items-center">
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollByAmount(-150)}
            className="absolute -left-1 z-10 w-6 h-6 rounded-full bg-white shadow-md border border-neutral-200 flex items-center justify-center text-neutral-700 hover:text-black cursor-pointer"
            aria-label="Cuộn sang trái"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth pr-10 py-0.5"
        >
          {/* Pill 1: Đang mở cửa */}
          <button
            type="button"
            onClick={toggleOpenNow}
            aria-pressed={values.openNowOnly}
            className={`${PILL_BASE} ${values.openNowOnly ? PILL_SELECTED : PILL_UNSELECTED}`}
          >
            <Clock
              className={`w-3.5 h-3.5 shrink-0 ${
                values.openNowOnly ? 'text-emerald-200' : 'text-neutral-600'
              }`}
            />
            <span>Đang mở cửa</span>
            {values.openNowOnly && <Check className="w-3 h-3 ml-0.5 text-white" />}
          </button>

          {/* Pill 2: Đánh giá 4.0+ Rất tốt */}
          <button
            type="button"
            onClick={toggleRating4Plus}
            aria-pressed={values.minRating === 4.0}
            className={`${PILL_BASE} ${values.minRating === 4.0 ? PILL_SELECTED : PILL_UNSELECTED}`}
          >
            <Star
              className={`w-3.5 h-3.5 shrink-0 ${
                values.minRating === 4.0
                  ? 'text-amber-300 fill-amber-300'
                  : 'text-amber-500 fill-amber-400'
              }`}
            />
            <span>★ 4.0+ Rất tốt</span>
            {values.minRating === 4.0 && <Check className="w-3 h-3 ml-0.5 text-white" />}
          </button>

          {/* Pill 3: Điểm đến Xanh (Eco-Certified) */}
          <button
            type="button"
            onClick={toggleEcoCertified}
            aria-pressed={values.ecoCertifiedOnly}
            className={`${PILL_BASE} ${
              values.ecoCertifiedOnly
                ? 'bg-emerald-800 border-emerald-800 text-white shadow-[0_2px_8px_rgba(4,120,87,0.25)]'
                : PILL_UNSELECTED
            }`}
          >
            <Leaf
              className={`w-3.5 h-3.5 shrink-0 ${
                values.ecoCertifiedOnly ? 'text-emerald-300' : 'text-emerald-700'
              }`}
            />
            <span>Chuẩn Xanh</span>
            {values.ecoCertifiedOnly && <Check className="w-3 h-3 ml-0.5 text-white" />}
          </button>

          {/* Pill 4: Vé vào 0đ */}
          <button
            type="button"
            onClick={toggleFreeTicket}
            aria-pressed={values.freeTicketOnly}
            className={`${PILL_BASE} ${values.freeTicketOnly ? PILL_SELECTED : PILL_UNSELECTED}`}
          >
            <Ticket
              className={`w-3.5 h-3.5 shrink-0 ${
                values.freeTicketOnly ? 'text-emerald-200' : 'text-neutral-600'
              }`}
            />
            <span>Vé vào 0đ</span>
            {values.freeTicketOnly && <Check className="w-3 h-3 ml-0.5 text-white" />}
          </button>

          {/* Pill 5: Bình dân (<100k) */}
          <button
            type="button"
            onClick={toggleCheapBudget}
            aria-pressed={values.budget === '$'}
            className={`${PILL_BASE} ${values.budget === '$' ? PILL_SELECTED : PILL_UNSELECTED}`}
          >
            <Wallet
              className={`w-3.5 h-3.5 shrink-0 ${
                values.budget === '$' ? 'text-emerald-200' : 'text-neutral-600'
              }`}
            />
            <span>Bình dân (&lt;100k)</span>
            {values.budget === '$' && <Check className="w-3 h-3 ml-0.5 text-white" />}
          </button>

          {/* Pill 6: Thích hợp ngày mưa */}
          <button
            type="button"
            onClick={toggleRainyDay}
            aria-pressed={values.rainyDayFriendly}
            className={`${PILL_BASE} ${values.rainyDayFriendly ? PILL_SELECTED : PILL_UNSELECTED}`}
          >
            <CloudRain
              className={`w-3.5 h-3.5 shrink-0 ${
                values.rainyDayFriendly ? 'text-cyan-200' : 'text-neutral-600'
              }`}
            />
            <span>Thích hợp ngày mưa</span>
            {values.rainyDayFriendly && <Check className="w-3 h-3 ml-0.5 text-white" />}
          </button>
        </div>

        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollByAmount(150)}
            className="absolute right-0 z-10 w-6 h-6 rounded-full bg-white/95 shadow-md border border-neutral-200 flex items-center justify-center text-neutral-700 hover:text-black cursor-pointer"
            aria-label="Cuộn sang phải"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}

        {canScrollRight && (
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white via-white/80 to-transparent"
            aria-hidden="true"
          />
        )}
      </div>

      {/* 3. RESET BUTTON */}
      {activeFilterCount > 0 && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="h-[34px] px-2 text-xs font-semibold text-neutral-600 hover:text-neutral-950 underline underline-offset-2 shrink-0 transition flex items-center gap-1 cursor-pointer"
          title="Bỏ tất cả điều kiện lọc để xem toàn bộ địa điểm"
        >
          <RotateCcw className="w-3 h-3" />
          <span className="hidden sm:inline">Bỏ lọc</span>
        </button>
      )}
    </div>
  );
};

export default QuickFilterBar;

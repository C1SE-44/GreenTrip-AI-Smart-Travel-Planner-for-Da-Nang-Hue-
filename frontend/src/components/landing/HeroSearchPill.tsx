import React, { useState, useRef, useEffect } from 'react';
import { MapPin, Calendar, ChevronDown, ArrowRight, Sparkles } from 'lucide-react';

export interface HeroSearchPillProps {
  city: 'danang' | 'hue' | 'danang_hue';
  days: number;
  onCityChange: (city: 'danang' | 'hue' | 'danang_hue') => void;
  onDaysChange: (days: number) => void;
  onSubmit: () => void;
}

const DESTINATION_OPTIONS = [
  {
    id: 'danang' as const,
    label: 'Đà Nẵng',
    subtitle: 'Thành phố biển, bán đảo Sơn Trà & Cầu Rồng',
    badge: 'Biển & Năng động',
  },
  {
    id: 'hue' as const,
    label: 'Huế',
    subtitle: 'Cố đô di sản, dòng sông Hương & Lăng tẩm',
    badge: 'Di sản & Văn hóa',
  },
  {
    id: 'danang_hue' as const,
    label: 'Đà Nẵng & Huế',
    subtitle: 'Hành trình liên tuyến kết nối qua Đèo Hải Vân',
    badge: 'Liên tuyến Hot',
  },
];

const DURATION_OPTIONS = [
  { days: 1, label: '1 ngày', subtitle: 'Khám phá nhanh các điểm biểu tượng' },
  { days: 2, label: '2 ngày', subtitle: 'Cuối tuần trọn vẹn, nhịp điệu thong thả' },
  { days: 3, label: '3 ngày', subtitle: 'Hành trình lý tưởng, kết hợp văn hóa & ẩm thực' },
  { days: 4, label: '4 ngày', subtitle: 'Trải nghiệm sâu, khám phá các góc ẩn giấu' },
];

export function HeroSearchPill({
  city,
  days,
  onCityChange,
  onDaysChange,
  onSubmit,
}: HeroSearchPillProps) {
  const [destOpen, setDestOpen] = useState(false);
  const [daysOpen, setDaysOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDest = DESTINATION_OPTIONS.find((d) => d.id === city) || DESTINATION_OPTIONS[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDestOpen(false);
        setDaysOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto mt-7 flex w-full max-w-[740px] flex-col rounded-[28px] border border-[#1C2520]/10 bg-white/95 p-2 shadow-[0_16px_40px_rgba(28,37,32,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:rounded-[9999px]"
    >
      {/* Cột 1: Bạn muốn đi đâu? */}
      <div className="relative flex-1">
        <button
          type="button"
          onClick={() => {
            setDestOpen(!destOpen);
            setDaysOpen(false);
          }}
          className={`flex w-full flex-col items-start justify-center rounded-[20px] px-5 py-3 text-left transition-colors sm:rounded-[9999px] ${
            destOpen ? 'bg-[#DCEDE0]/40' : 'hover:bg-[#F7F6F0]'
          }`}
          aria-expanded={destOpen}
        >
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#56645C]">
            <MapPin size={14} className="text-[#286247]" />
            Bạn muốn đi đâu?
          </span>
          <div className="mt-1 flex w-full items-center justify-between gap-2">
            <span className="truncate text-[15px] font-bold text-[#1C2520]">
              {selectedDest.label}
            </span>
            <ChevronDown
              size={15}
              className={`text-[#56645C] transition-transform duration-200 ${
                destOpen ? 'rotate-180 text-[#286247]' : ''
              }`}
            />
          </div>
        </button>

        {/* Popover Chọn Điểm Đến */}
        {destOpen && (
          <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-full min-w-[280px] origin-top-left rounded-2xl border border-[#1C2520]/10 bg-[#FDFBF6] p-2 shadow-[0_20px_40px_rgba(28,37,32,0.12)] animate-in fade-in zoom-in-95 duration-150 sm:w-[320px]">
            <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#56645C]/80">
              Chọn điểm khởi hành
            </div>
            <div className="space-y-1">
              {DESTINATION_OPTIONS.map((item) => {
                const isSelected = item.id === city;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onCityChange(item.id);
                      setDestOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-[#DCEDE0]/60 text-[#163627] font-semibold'
                        : 'hover:bg-[#F7F6F0] text-[#1C2520]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px]">{item.label}</span>
                        {item.badge && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              isSelected
                                ? 'bg-[#286247] text-white'
                                : 'bg-[#EAE8DE] text-[#56645C]'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[12px] text-[#56645C] font-normal">
                        {item.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="hidden h-9 w-[1px] bg-[#1C2520]/10 sm:block" />

      {/* Cột 2: Bạn có bao lâu? */}
      <div className="relative flex-1">
        <button
          type="button"
          onClick={() => {
            setDaysOpen(!daysOpen);
            setDestOpen(false);
          }}
          className={`flex w-full flex-col items-start justify-center rounded-[20px] px-5 py-3 text-left transition-colors sm:rounded-[9999px] ${
            daysOpen ? 'bg-[#DCEDE0]/40' : 'hover:bg-[#F7F6F0]'
          }`}
          aria-expanded={daysOpen}
        >
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#56645C]">
            <Calendar size={14} className="text-[#286247]" />
            Bạn có bao lâu?
          </span>
          <div className="mt-1 flex w-full items-center justify-between gap-2">
            <span className="truncate text-[15px] font-bold text-[#1C2520]">{days} ngày</span>
            <ChevronDown
              size={15}
              className={`text-[#56645C] transition-transform duration-200 ${
                daysOpen ? 'rotate-180 text-[#286247]' : ''
              }`}
            />
          </div>
        </button>

        {/* Popover Chọn Số Ngày */}
        {daysOpen && (
          <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-full min-w-[260px] origin-top-left rounded-2xl border border-[#1C2520]/10 bg-[#FDFBF6] p-2 shadow-[0_20px_40px_rgba(28,37,32,0.12)] animate-in fade-in zoom-in-95 duration-150 sm:w-[300px]">
            <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#56645C]/80">
              Thời lượng chuyến đi
            </div>
            <div className="space-y-1">
              {DURATION_OPTIONS.map((item) => {
                const isSelected = item.days === days;
                return (
                  <button
                    key={item.days}
                    type="button"
                    onClick={() => {
                      onDaysChange(item.days);
                      setDaysOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-[#DCEDE0]/60 text-[#163627] font-semibold'
                        : 'hover:bg-[#F7F6F0] text-[#1C2520]'
                    }`}
                  >
                    <div>
                      <div className="text-[14px] font-medium">{item.label}</div>
                      <p className="mt-0.5 text-[12px] text-[#56645C] font-normal">
                        {item.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Nút Khám phá lịch mẫu */}
      <div className="p-1 sm:p-0">
        <button
          type="button"
          onClick={onSubmit}
          className="group flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-[9999px] !bg-[#1C2520] hover:!bg-[#286247] px-6 py-3.5 text-[14px] font-semibold !text-[#FDFBF6] shadow-sm transition-[background-color,box-shadow,transform] hover:shadow-md active:scale-[0.98] sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
        >
          <Sparkles size={15} className="text-[#DCEDE0]" />
          <span>Thử lịch mẫu</span>
          <ArrowRight
            size={15}
            className="transition-transform duration-200 group-hover:translate-x-1"
          />
        </button>
      </div>
    </div>
  );
}

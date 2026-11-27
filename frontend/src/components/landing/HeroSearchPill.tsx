import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Calendar, ChevronDown, ArrowRight, Sparkles, MessageSquare } from 'lucide-react';

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

const AI_PRESETS = [
  {
    label: 'Cuối tuần Sơn Trà',
    prompt: 'Lên lịch trình 2 ngày cuối tuần tại Đà Nẵng – bán đảo Sơn Trà, ưu tiên quán cà phê yên tĩnh và ít chen chúc',
  },
  {
    label: 'Huế & Làng nghề',
    prompt: 'Gợi ý lịch trình 2 ngày tại Huế đi chậm, kết hợp di sản, làng hương và ẩm thực bản địa',
  },
  {
    label: 'Đèo Hải Vân 3 ngày',
    prompt: 'Thiết kế lịch trình xanh 3 ngày liên tuyến Đà Nẵng – Đèo Hải Vân – Huế cho gia đình đi thong thả',
  },
] as const;

export function HeroSearchPill({
  city,
  days,
  onCityChange,
  onDaysChange,
  onSubmit,
}: HeroSearchPillProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'sample' | 'ai'>('sample');
  const [aiQuery, setAiQuery] = useState('');
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

  const handleOpenChat = (promptText?: string) => {
    const q = (promptText ?? aiQuery).trim();
    navigate(q ? `/chat?q=${encodeURIComponent(q)}` : '/chat');
  };

  return (
    <div ref={containerRef} className="mx-auto mt-6 w-full max-w-[760px]">
      {/* OH! Tour-inspired Mode Tabs */}
      <div
        role="tablist"
        aria-label="Chọn cách bắt đầu lịch trình"
        className="mx-auto mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-[#1C2520]/10 bg-white/90 p-1 shadow-sm backdrop-blur-md"
      >
        <button
          type="button"
          role="tab"
          id="hero-tab-sample"
          aria-selected={mode === 'sample'}
          aria-controls="hero-panel-sample"
          onClick={() => {
            setMode('sample');
            setDestOpen(false);
            setDaysOpen(false);
          }}
          className={`aui-press inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 py-2 text-xs sm:text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
            mode === 'sample'
              ? '!bg-[#1B3B2B] !text-white shadow-sm'
              : '!bg-transparent hover:!bg-[#F3F1EB] !text-[#1C2520]'
          }`}
        >
          <Sparkles size={14} aria-hidden="true" />
          <span>Xem lịch mẫu nhanh</span>
        </button>

        <button
          type="button"
          role="tab"
          id="hero-tab-ai"
          aria-selected={mode === 'ai'}
          aria-controls="hero-panel-ai"
          onClick={() => {
            setMode('ai');
            setDestOpen(false);
            setDaysOpen(false);
          }}
          className={`aui-press inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 py-2 text-xs sm:text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
            mode === 'ai'
              ? '!bg-[#1B3B2B] !text-white shadow-sm'
              : '!bg-transparent hover:!bg-[#F3F1EB] !text-[#1C2520]'
          }`}
        >
          <MessageSquare size={14} aria-hidden="true" />
          <span>Hỏi Trợ lý AI</span>
        </button>
      </div>

      {/* Tab Panel 1: Sample Itinerary Picker */}
      {mode === 'sample' ? (
        <div
          id="hero-panel-sample"
          role="tabpanel"
          aria-labelledby="hero-tab-sample"
          className="relative flex w-full flex-col rounded-[28px] border border-[#1C2520]/10 bg-white/95 p-2 shadow-[0_16px_40px_rgba(28,37,32,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:rounded-[9999px]"
        >
          {/* Cột 1: Bạn muốn đi đâu? */}
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => {
                setDestOpen(!destOpen);
                setDaysOpen(false);
              }}
              className={`aui-press flex w-full flex-col items-start justify-center rounded-[20px] px-5 py-2.5 text-left sm:rounded-[9999px] ${
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
                  className={`text-[#56645C] transition-transform duration-[220ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] ${
                    destOpen ? 'rotate-180 text-[#286247]' : ''
                  }`}
                />
              </div>
            </button>

            {destOpen && (
              <div className="aui-popover-in absolute left-0 top-[calc(100%+8px)] z-50 w-full min-w-[280px] rounded-2xl border border-[#1C2520]/10 bg-[#FDFBF6] p-2 shadow-[0_20px_40px_rgba(28,37,32,0.12)] sm:w-[320px]">
                <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#56645C]">
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
                        className={`aui-press flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left ${
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
              className={`aui-press flex w-full flex-col items-start justify-center rounded-[20px] px-5 py-2.5 text-left sm:rounded-[9999px] ${
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
                  className={`text-[#56645C] transition-transform duration-[220ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] ${
                    daysOpen ? 'rotate-180 text-[#286247]' : ''
                  }`}
                />
              </div>
            </button>

            {daysOpen && (
              <div className="aui-popover-in absolute left-0 top-[calc(100%+8px)] z-50 w-full min-w-[260px] rounded-2xl border border-[#1C2520]/10 bg-[#FDFBF6] p-2 shadow-[0_20px_40px_rgba(28,37,32,0.12)] sm:w-[300px]">
                <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#56645C]">
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
                        className={`aui-press flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left ${
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
              className="aui-press group flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-[9999px] !bg-[#1C2520] hover:!bg-[#286247] px-6 py-3.5 text-[14px] font-semibold !text-[#FDFBF6] shadow-sm hover:shadow-md sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <Sparkles size={15} className="text-[#DCEDE0]" />
              <span>Thử lịch mẫu</span>
              <ArrowRight
                size={15}
                className="transition-transform duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-1 motion-reduce:transform-none"
              />
            </button>
          </div>
        </div>
      ) : (
        /* Tab Panel 2: AI Assistant Quick Prompt */
        <div id="hero-panel-ai" role="tabpanel" aria-labelledby="hero-tab-ai">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleOpenChat();
            }}
            className="aui-popover-in relative flex w-full flex-col rounded-[28px] border border-[#1C2520]/10 bg-white/95 p-2 shadow-[0_16px_40px_rgba(28,37,32,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:rounded-[9999px]"
          >
            <label htmlFor="hero-ai-prompt" className="sr-only">
              Mô tả gu du lịch của bạn để hỏi Trợ lý AI
            </label>
            <div className="flex flex-1 items-center gap-3 px-4 py-2 sm:py-0">
              <MessageSquare size={18} className="text-[#286247] shrink-0" aria-hidden="true" />
              <input
                id="hero-ai-prompt"
                type="text"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                placeholder="Ví dụ: 3 ngày Huế đi chậm, ăn chay, ít đông..."
                className="w-full min-h-[42px] bg-transparent text-sm sm:text-[15px] font-medium text-[#1C2520] placeholder:text-[#56645C] focus:outline-none"
              />
            </div>
            <div className="p-1 sm:p-0">
              <button
                type="submit"
                className="aui-press group flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[9999px] !bg-[#1C2520] hover:!bg-[#286247] px-6 py-3.5 text-[14px] font-semibold !text-[#FDFBF6] shadow-sm hover:shadow-md sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <span>Hỏi Trợ lý AI</span>
                <ArrowRight
                  size={15}
                  className="transition-transform duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-1 motion-reduce:transform-none"
                />
              </button>
            </div>
          </form>

          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
            {AI_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleOpenChat(preset.prompt)}
                className="aui-press inline-flex min-h-[40px] items-center rounded-full !bg-white/90 hover:!bg-white px-3.5 py-1.5 text-xs font-semibold !text-[#1C2520] !border !border-[#1C2520]/15 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

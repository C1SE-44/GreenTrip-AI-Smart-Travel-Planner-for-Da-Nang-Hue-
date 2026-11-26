import React from 'react';
import { Star, Check, Leaf, Sparkles } from 'lucide-react';

interface ValuePropsSectionProps {
  onOpenSample: () => void;
}

export function ValuePropsSection({ onOpenSample }: ValuePropsSectionProps) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const features = [
    {
      id: 'hieu-dung',
      label: 'Hiểu đúng',
      bgColor: 'bg-[#0f1f63]',
      gradient: 'from-[#0f1f63]',
      // Mindtrip Dusty Rose tint on Midnight Navy
      title: (
        <span className="text-[#F9CDCC] text-[1.22em] leading-[0.94] block mt-8 font-extrabold tracking-[-0.035em]">
          Hiểu đúng<br />nhu cầu<br />của bạn.
        </span>
      ),
      desc: 'Hãy chia sẻ những điều quan trọng với bạn. Trợ lý du lịch GreenTrip ghi nhớ gu đi du lịch của bạn — từ quán cà phê muối ven sông đến những ngõ ẩm thực bản địa ít người biết. Bạn càng dùng nhiều, gợi ý càng chuẩn vị.',
      img: '/images/landing/danang-1400.webp',
      imgAlt: 'Cầu Rồng và sông Hàn Đà Nẵng về đêm',
      widgets: (
        <>
          {/* Bubble 1 (Top Left) */}
          <div className="absolute top-12 left-4 lg:left-4 max-w-[calc(100%-2rem)] rounded-[24px] border border-white/70 bg-white/95 p-4 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.22)] animate-slideUp z-10 transition-transform hover:-translate-y-0.5">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 shrink-0">
                  <Star size={10} className="text-white fill-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-neutral-200" />
              </div>
              <p className="text-[13px] font-bold text-neutral-900 sm:whitespace-nowrap">
                Ưu tiên quán bản địa ít người biết.
              </p>
            </div>
          </div>

          {/* Bubble 2 (Middle Right) */}
          <div
            className="absolute top-[40%] right-4 lg:right-4 max-w-[calc(100%-2rem)] -translate-y-1/2 rounded-[24px] border border-white/70 bg-white/95 p-4 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.22)] animate-slideUp z-10 transition-transform hover:-translate-y-0.5"
            style={{ animationDelay: '150ms' }}
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 shrink-0">
                  <Star size={10} className="text-white fill-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-neutral-200" />
              </div>
              <p className="text-[13px] font-bold text-neutral-900 sm:whitespace-nowrap">
                3 ngày cuối tuần · Thong thả, không chạy sô.
              </p>
            </div>
          </div>

          {/* Bubble 3 (Bottom Left) */}
          <div
            className="absolute bottom-32 left-4 lg:left-4 max-w-[calc(100%-2rem)] rounded-[24px] border border-white/70 bg-white/95 p-4 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.22)] animate-slideUp z-10 transition-transform hover:-translate-y-0.5"
            style={{ animationDelay: '300ms' }}
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-800 shrink-0">
                  <Leaf size={10} className="text-white fill-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-neutral-200" />
              </div>
              <p className="text-[13px] font-bold text-neutral-900 sm:whitespace-nowrap">
                Cà phê muối &amp; Du lịch xanh giảm phát thải.
              </p>
            </div>
          </div>

          {/* Soundwave Dial Button (Mindtrip-styled concentric glass dial) */}
          <button
            type="button"
            onClick={onOpenSample}
            aria-label="Xem gợi ý theo gu"
            className="absolute bottom-10 left-1/2 -translate-x-1/2 flex h-20 w-20 items-center justify-center rounded-full !bg-white/95 backdrop-blur-2xl border border-white/80 shadow-[0_16px_40px_rgba(0,0,0,0.28)] ring-4 ring-white/20 hover:scale-105 active:scale-95 transition-transform cursor-pointer z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <div className="flex items-center gap-1.5">
              <div className="w-1 h-3.5 bg-neutral-900 rounded-full animate-pulseRing" />
              <div className="w-1 h-7 bg-neutral-900 rounded-full animate-pulseRing" style={{ animationDelay: '100ms' }} />
              <div className="w-1 h-9 bg-neutral-900 rounded-full animate-pulseRing" style={{ animationDelay: '200ms' }} />
              <div className="w-1 h-5 bg-neutral-900 rounded-full animate-pulseRing" style={{ animationDelay: '150ms' }} />
              <div className="w-1 h-2.5 bg-neutral-900 rounded-full animate-pulseRing" style={{ animationDelay: '250ms' }} />
            </div>
          </button>
        </>
      ),
    },
    {
      id: 'sap-xep',
      label: 'Sắp xếp',
      bgColor: 'bg-[#9e472a]',
      gradient: 'from-[#9e472a]',
      // Mindtrip Warm Apricot tint on Terracotta
      title: (
        <span className="text-[#FFCEAB] text-[1.22em] leading-[0.94] block mt-8 font-extrabold tracking-[-0.035em]">
          AI sắp xếp<br />mọi cung<br />đường.
        </span>
      ),
      desc: 'Trợ lý du lịch tự động sắp xếp thứ tự điểm đến, phương tiện và quán ăn theo cụm gần nhau Hải Châu – Sơn Trà, không chạy vòng qua cầu, tiết kiệm hơn 50% thời gian di chuyển.',
      img: '/images/landing/studio/plan_haivan_pass_real.webp',
      imgAlt: 'Cung đường Đèo Hải Vân hùng vĩ ven biển nối Đà Nẵng - Huế',
      widgets: (
        <>
          {/* Bubble 1 (Top Left) */}
          <div className="absolute top-12 left-4 lg:left-4 max-w-[calc(100%-2rem)] rounded-[24px] border border-white/70 bg-white/95 p-4 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.22)] animate-slideUp z-10 transition-transform hover:-translate-y-0.5">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 shrink-0">
                  <Check size={10} className="text-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-neutral-200" />
              </div>
              <p className="text-[13px] font-bold text-neutral-900 sm:whitespace-nowrap">
                <span className="line-through text-neutral-600 font-normal">2h 35m / 42.8 km</span> → Tuyến tối ưu: 1h 15m (-52%).
              </p>
            </div>
          </div>

          {/* Bubble 2 (Middle Right) */}
          <div
            className="absolute top-[40%] right-4 lg:right-4 max-w-[calc(100%-2rem)] -translate-y-1/2 rounded-[24px] border border-white/70 bg-white/95 p-4 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.22)] animate-slideUp z-10 transition-transform hover:-translate-y-0.5"
            style={{ animationDelay: '150ms' }}
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 shrink-0">
                  <Sparkles size={10} className="text-amber-400 fill-amber-400" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-neutral-200" />
              </div>
              <p className="text-[13px] font-bold text-neutral-900 sm:whitespace-nowrap">
                Trợ lý du lịch AI: Chiều nay ngắm hoàng hôn đèo nhé?
              </p>
            </div>
          </div>

          {/* Bubble 3 (Bottom Left) */}
          <div
            className="absolute bottom-32 left-4 lg:left-4 max-w-[calc(100%-2rem)] rounded-[24px] border border-white/70 bg-white/95 p-4 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.22)] animate-slideUp z-10 transition-transform hover:-translate-y-0.5"
            style={{ animationDelay: '300ms' }}
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-800 shrink-0">
                  <Leaf size={10} className="text-white fill-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-neutral-200" />
              </div>
              <p className="text-[13px] font-bold text-neutral-900 sm:whitespace-nowrap">
                Gom cụm Hải Châu – Sơn Trà · Tiết kiệm 4.6 kg CO₂.
              </p>
            </div>
          </div>

          {/* Soundwave Dial Button */}
          <button
            type="button"
            onClick={onOpenSample}
            aria-label="Xem lộ trình tối ưu"
            className="absolute bottom-10 left-1/2 -translate-x-1/2 flex h-20 w-20 items-center justify-center rounded-full !bg-white/95 backdrop-blur-2xl border border-white/80 shadow-[0_16px_40px_rgba(0,0,0,0.28)] ring-4 ring-white/20 hover:scale-105 active:scale-95 transition-transform cursor-pointer z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <div className="flex items-center gap-1.5">
              <div className="w-1 h-3.5 bg-neutral-900 rounded-full animate-pulseRing" />
              <div className="w-1 h-7 bg-neutral-900 rounded-full animate-pulseRing" style={{ animationDelay: '100ms' }} />
              <div className="w-1 h-9 bg-neutral-900 rounded-full animate-pulseRing" style={{ animationDelay: '200ms' }} />
              <div className="w-1 h-5 bg-neutral-900 rounded-full animate-pulseRing" style={{ animationDelay: '150ms' }} />
              <div className="w-1 h-2.5 bg-neutral-900 rounded-full animate-pulseRing" style={{ animationDelay: '250ms' }} />
            </div>
          </button>
        </>
      ),
    },
    {
      id: 'dong-bo',
      label: 'Đồng bộ',
      bgColor: 'bg-[#22362b]',
      gradient: 'from-[#22362b]',
      // Mindtrip Lemon Sage tint on Forest Green
      title: (
        <span className="text-[#F1F2BA] text-[1.22em] leading-[0.94] block mt-8 font-extrabold tracking-[-0.035em]">
          Đồng bộ<br />trên một<br />màn hình.
        </span>
      ),
      desc: 'Không gian làm việc 4-trong-1 kết hợp Ý tưởng, Lịch trình, Lịch ngày và Bản đồ số. Tự động dời lịch linh hoạt khi bạn đổi kế hoạch mà không bao giờ mất dữ liệu.',
      img: '/images/landing/hue-1400.webp',
      imgAlt: 'Ngọ Môn Đại Nội Huế cổ kính trong nắng sớm',
      widgets: (
        <>
          {/* Bubble 1 (Top Left) */}
          <div className="absolute top-12 left-4 lg:left-4 max-w-[calc(100%-2rem)] rounded-[24px] border border-white/70 bg-white/95 p-4 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.22)] animate-slideUp z-10 transition-transform hover:-translate-y-0.5">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 shrink-0">
                  <Check size={10} className="text-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-neutral-200" />
              </div>
              <p className="text-[13px] font-bold text-neutral-900 sm:whitespace-nowrap">
                01. Ý tưởng &amp; 02. Lịch trình khám phá Cố đô Huế.
              </p>
            </div>
          </div>

          {/* Bubble 2 (Middle Right) */}
          <div
            className="absolute top-[40%] right-4 lg:right-4 max-w-[calc(100%-2rem)] -translate-y-1/2 rounded-[24px] border border-white/70 bg-white/95 p-4 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.22)] animate-slideUp z-10 transition-transform hover:-translate-y-0.5"
            style={{ animationDelay: '150ms' }}
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 shrink-0">
                  <Check size={10} className="text-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-neutral-200" />
              </div>
              <p className="text-[13px] font-bold text-neutral-900 sm:whitespace-nowrap">
                03. Lịch ngày: Tự dời khi thay đổi thời tiết.
              </p>
            </div>
          </div>

          {/* Bubble 3 (Bottom Left) */}
          <div
            className="absolute bottom-32 left-4 lg:left-4 max-w-[calc(100%-2rem)] rounded-[24px] border border-white/70 bg-white/95 p-4 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.22)] animate-slideUp z-10 transition-transform hover:-translate-y-0.5"
            style={{ animationDelay: '300ms' }}
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 shrink-0">
                  <Check size={10} className="text-white" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-neutral-200" />
              </div>
              <p className="text-[13px] font-bold text-neutral-900 sm:whitespace-nowrap">
                04. Bản đồ số: Tương tác lộ trình hai chiều.
              </p>
            </div>
          </div>

          {/* Soundwave Dial Button */}
          <button
            type="button"
            onClick={onOpenSample}
            aria-label="Xem không gian làm việc đồng bộ"
            className="absolute bottom-10 left-1/2 -translate-x-1/2 flex h-20 w-20 items-center justify-center rounded-full !bg-white/95 backdrop-blur-2xl border border-white/80 shadow-[0_16px_40px_rgba(0,0,0,0.28)] ring-4 ring-white/20 hover:scale-105 active:scale-95 transition-transform cursor-pointer z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <div className="flex items-center gap-1.5">
              <div className="w-1 h-3.5 bg-neutral-900 rounded-full animate-pulseRing" />
              <div className="w-1 h-7 bg-neutral-900 rounded-full animate-pulseRing" style={{ animationDelay: '100ms' }} />
              <div className="w-1 h-9 bg-neutral-900 rounded-full animate-pulseRing" style={{ animationDelay: '200ms' }} />
              <div className="w-1 h-5 bg-neutral-900 rounded-full animate-pulseRing" style={{ animationDelay: '150ms' }} />
              <div className="w-1 h-2.5 bg-neutral-900 rounded-full animate-pulseRing" style={{ animationDelay: '250ms' }} />
            </div>
          </button>
        </>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-8 pt-24 pb-16 bg-[#FAF8F5]">
      {/* Section Header */}
      <div className="text-center max-w-xl mx-auto px-4 mb-4 sm:mb-6">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white border border-neutral-200/80 text-neutral-700 text-xs font-semibold tracking-wider uppercase mb-3.5 shadow-2xs">
          <Sparkles size={12} className="text-neutral-900" />
          CÁCH GREENTRIP HOẠT ĐỘNG
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#111111] tracking-[-0.035em] leading-tight">
          Lên kế hoạch thông minh hơn.
        </h2>
        <p className="mt-3.5 text-base sm:text-lg text-[#555555] leading-relaxed max-w-lg mx-auto font-normal">
          Học gu riêng của bạn, tự động tối ưu hóa cung đường và đồng bộ mọi thao tác trên một màn hình duy nhất.
        </p>
      </div>

      {/* 3 Separate Feature Panels with In-Page Scroll Nav (Sprint 2 exact layout + Mindtrip refinement) */}
      {features.map((feature) => (
        <section key={feature.id} id={feature.id} className="px-4 md:px-8 scroll-mt-[57px]">
          <div className={`relative mx-auto max-w-[1400px] overflow-hidden rounded-[40px] text-white min-h-[500px] ${feature.bgColor} shadow-2xl`}>
            <div className="flex flex-col lg:flex-row min-h-[500px]">
              {/* Left Column (Copy) */}
              <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-16 lg:w-1/2 z-10">
                {/* In-Card Segmented Pill Tabs (Mindtrip signature style) */}
                <div className="inline-flex items-center rounded-full border border-white/20 bg-black/15 p-1 backdrop-blur-md mb-8 self-start gap-1">
                  {features.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => scrollTo(f.id)}
                      className={`rounded-full px-4 sm:px-5 py-1.5 text-xs sm:text-[13px] font-semibold transition-all cursor-pointer ${
                        f.id === feature.id
                          ? 'bg-white text-neutral-900 shadow-md'
                          : 'text-white/85 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <h2 className="font-heading text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl lg:text-6xl text-white">
                  {feature.title}
                </h2>

                <p className="mt-8 max-w-md text-base sm:text-lg font-light text-white/90 leading-relaxed">
                  {feature.desc}
                </p>
              </div>

              {/* Right Column (Visual: Real Da Nang - Hue Images) */}
              <div className="relative lg:w-1/2 min-h-[400px] overflow-hidden">
                <img
                  src={feature.img}
                  alt={feature.imgAlt}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
                <div className={`absolute inset-0 bg-gradient-to-r ${feature.gradient} to-transparent lg:w-52 opacity-90`} />
                <div className="absolute inset-0 bg-black/20" />

                {/* Floating Widgets */}
                {feature.widgets}
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Compass, Leaf, Quote, Sparkles, Users } from 'lucide-react';
import { useRevealOnScroll } from './useRevealOnScroll';

type City = 'danang' | 'hue' | 'danang_hue';

interface TravelerStoriesAndAboutSectionProps {
  onOpenSample: (city: City, days: number) => void;
}

const TRAVELER_SCENARIOS: ReadonlyArray<{
  id: string;
  persona: string;
  tripTag: string;
  quote: string;
  metric: string;
  ctaLabel: string;
  city: City;
  days: number;
}> = [
  {
    id: 'friends-dn',
    persona: 'Nhóm bạn 4 người · Đà Nẵng – Sơn Trà',
    tripTag: 'Cuối tuần gọn nhẹ',
    quote:
      'Trước đây nhóm mất cả buổi tối cãi nhau nên đi Bà Nà hay Sơn Trà trước. Dùng lịch gợi ý 2 ngày gom cụm theo bờ biển, tụi mình ghé được cả quán cà phê yên tĩnh và xuất 1 file PDF cho cả nhóm.',
    metric: 'Giảm ~18 km chạy vòng · 8 điểm xanh',
    ctaLabel: 'Xem lịch Đà Nẵng 2 ngày',
    city: 'danang',
    days: 2,
  },
  {
    id: 'family-dn-hue',
    persona: 'Gia đình có trẻ nhỏ · Đà Nẵng – Huế',
    tripTag: 'Đi chậm & thư thả',
    quote:
      'Điều thích nhất là nhịp đi không bị nhồi 6–7 điểm một ngày. Mỗi chặng qua đèo Hải Vân đều ghi rõ giờ mở cửa, chỗ nghỉ trưa và quán ăn bản địa phù hợp cả người lớn lẫn trẻ em.',
    metric: 'Nhịp vừa sức · Giảm ~2.6 kg CO₂',
    ctaLabel: 'Xem lịch liên tuyến 3 ngày',
    city: 'danang_hue',
    days: 3,
  },
  {
    id: 'couple-hue',
    persona: 'Cặp đôi · Huế Cố Đô & Làng nghề',
    tripTag: 'Di sản & ẩm thực bản địa',
    quote:
      'Thay vì chỉ đi những điểm đông khách du lịch, mục Điểm xanh gợi ý thêm nhà vườn, làng hương và tiệm bánh truyền thống đúng gu đi chậm mà tụi mình chưa từng thấy trên blog cũ.',
    metric: '5+ quán bản địa · Điểm xanh 86/100',
    ctaLabel: 'Xem lịch Huế 2 ngày',
    city: 'hue',
    days: 2,
  },
];

const ABOUT_PILLARS = [
  {
    icon: Compass,
    title: 'Dữ liệu chuẩn hóa địa phương',
    desc: '575+ địa điểm tại Đà Nẵng và Huế có tọa độ, giờ mở cửa và chi phí tham khảo được kiểm chứng.',
  },
  {
    icon: Users,
    title: 'Ưu tiên cộng đồng & quán bản địa',
    desc: 'Khuyến khích ghé làng nghề, homestay xanh và hàng quán địa phương để chuyến đi mang lại giá trị thật.',
  },
  {
    icon: Leaf,
    title: 'Minh bạch từng gợi ý',
    desc: 'Mỗi điểm dừng đều hiển thị Điểm xanh theo 4 trụ cột và lý do phù hợp với nhịp đi của bạn.',
  },
] as const;

export function TravelerStoriesAndAboutSection({ onOpenSample }: TravelerStoriesAndAboutSectionProps) {
  const storiesReveal = useRevealOnScroll<HTMLDivElement>();
  const aboutReveal = useRevealOnScroll<HTMLDivElement>();

  return (
    <div className="bg-[#FAF8F5]">
      {/* SECTION 5: PROOF / SCENARIO TESTIMONIALS */}
      <section aria-labelledby="stories-heading" className="py-16 sm:py-24">
        <div
          ref={storiesReveal.ref}
          onFocusCapture={storiesReveal.onFocusCapture}
          className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8"
        >
          <div className="max-w-3xl mb-10 sm:mb-12">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white border border-neutral-200/90 text-neutral-700 text-xs font-semibold tracking-wider uppercase mb-3.5 shadow-sm">
              <Sparkles size={12} className="text-emerald-800" aria-hidden="true" />
              TRẢI NGHIỆM THỰC TẾ
            </div>
            <h2
              id="stories-heading"
              className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-[#111111] tracking-[-0.03em] leading-[1.15]"
            >
              Thiết kế cho mọi nhịp đi từ cuối tuần đến nghỉ dưỡng gia đình.
            </h2>
            <p className="mt-3.5 text-base sm:text-lg text-neutral-600 leading-relaxed">
              Ba kịch bản hành trình tiêu biểu từ nhóm người dùng trải nghiệm sớm tại Đà Nẵng và Huế.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TRAVELER_SCENARIOS.map((story, idx) => (
              <article
                key={story.id}
                data-revealed={storiesReveal.revealed ? 'true' : 'false'}
                style={storiesReveal.revealed ? { transitionDelay: `${idx * 80}ms` } : undefined}
                className="aui-reveal aui-card motion-reduce:!delay-0 rounded-[24px] border border-neutral-200/90 hover:border-neutral-300 bg-white p-6 sm:p-7 flex flex-col justify-between shadow-sm hover:shadow-[0_14px_30px_-14px_rgba(15,23,42,0.16)]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-5">
                    <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-900/15 px-3 py-1 text-xs font-semibold text-emerald-900">
                      {story.tripTag}
                    </span>
                    <Quote size={18} className="text-neutral-500 shrink-0" aria-hidden="true" />
                  </div>

                  <p className="text-sm sm:text-[15px] text-neutral-700 leading-relaxed">
                    “{story.quote}”
                  </p>
                </div>

                <div className="mt-6 pt-5 border-t border-neutral-200/80 space-y-4">
                  <div>
                    <p className="text-sm font-bold text-[#111111]">{story.persona}</p>
                    <p className="mt-1 text-xs font-semibold text-emerald-800">{story.metric}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenSample(story.city, story.days)}
                    className="aui-press w-full min-h-[44px] px-4 py-2.5 rounded-full !bg-neutral-50 hover:!bg-neutral-900 !text-neutral-900 hover:!text-white !border !border-neutral-200 hover:!border-neutral-900 text-xs font-semibold flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <span>{story.ctaLabel}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 6: ABOUT US */}
      <section
        id="about-us"
        aria-labelledby="about-heading"
        onFocusCapture={aboutReveal.onFocusCapture}
        className="pb-16 sm:pb-24"
      >
        <div
          ref={aboutReveal.ref}
          data-revealed={aboutReveal.revealed ? 'true' : 'false'}
          className="aui-reveal max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8"
        >
          <div className="rounded-[32px] border border-neutral-200/90 bg-white p-6 sm:p-10 lg:p-12 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              {/* Left visual collage */}
              <div className="lg:col-span-6 space-y-3">
                <div className="group relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-neutral-900">
                  <img
                    src="/images/landing/studio/plan_haivan_pass_real.webp"
                    alt="Cung đường đèo Hải Vân nối Đà Nẵng và Huế"
                    width={1200}
                    height={750}
                    loading="lazy"
                    decoding="async"
                    className="aui-card-media w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                  <span className="absolute bottom-3.5 left-4 inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-[#111111]">
                    Đà Nẵng · Đèo Hải Vân · Huế
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="group relative aspect-[16/10] sm:aspect-auto sm:min-h-[144px] overflow-hidden rounded-2xl bg-neutral-900">
                    <img
                      src="/images/landing/hue-1400.webp"
                      alt="Cố đô Huế yên bình bên sông Hương"
                      width={1400}
                      height={933}
                      loading="lazy"
                      decoding="async"
                      className="aui-card-media w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
                    <span className="absolute bottom-3 left-3.5 text-xs font-semibold text-white">
                      Di sản &amp; Làng nghề Huế
                    </span>
                  </div>

                  <div className="rounded-2xl bg-[#1B3B2B] text-white p-5 flex flex-col justify-between min-h-[144px]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-200">
                      Tiêu chí Điểm xanh
                    </span>
                    <div>
                      <p className="text-base font-bold text-white leading-snug">
                        4 trụ cột đánh giá minh bạch
                      </p>
                      <p className="mt-1.5 text-xs text-emerald-100 leading-relaxed">
                        Môi trường, Văn hóa, Cộng đồng bản địa &amp; Khả năng di chuyển xanh.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right narrative */}
              <div className="lg:col-span-6">
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-900/15 text-emerald-900 text-xs font-semibold tracking-wider uppercase mb-3.5">
                  <Leaf size={12} aria-hidden="true" />
                  VỀ GREENTRIP AI
                </div>
                <h2
                  id="about-heading"
                  className="text-3xl sm:text-4xl font-extrabold text-[#111111] tracking-[-0.03em] leading-[1.15]"
                >
                  Sinh ra cho hành trình xanh giữa Đà Nẵng và Huế.
                </h2>
                <p className="mt-4 text-sm sm:text-base text-neutral-600 leading-relaxed">
                  GreenTrip AI kết hợp dữ liệu địa điểm thực tế tại Miền Trung với thuật toán tối ưu tuyến đường và chấm Điểm xanh minh bạch — giúp bạn bớt thời gian loay hoay chọn điểm và để lại dấu chân nhẹ hơn sau mỗi chuyến đi.
                </p>

                <ul className="mt-6 space-y-4">
                  {ABOUT_PILLARS.map((pillar) => {
                    const Icon = pillar.icon;
                    return (
                      <li key={pillar.title} className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-900/15 text-emerald-900">
                          <Icon size={17} aria-hidden="true" />
                        </div>
                        <div>
                          <h3 className="text-sm sm:text-[15px] font-bold text-[#111111]">
                            {pillar.title}
                          </h3>
                          <p className="mt-0.5 text-xs sm:text-sm text-neutral-600 leading-relaxed">
                            {pillar.desc}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    to="/explore"
                    className="aui-press inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-neutral-900 hover:bg-emerald-950 px-5 py-2.5 text-xs sm:text-sm font-semibold !text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <span>Khám phá 575+ điểm đến</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                  <Link
                    to="/planner"
                    className="aui-press inline-flex min-h-[44px] items-center justify-center rounded-full bg-white hover:bg-neutral-50 px-5 py-2.5 text-xs sm:text-sm font-semibold !text-neutral-900 border border-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    Mở bảng lập lịch trình
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

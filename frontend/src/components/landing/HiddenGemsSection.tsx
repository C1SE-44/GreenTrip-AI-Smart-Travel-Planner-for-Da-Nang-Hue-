import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Leaf, MapPin, ArrowRight, BedDouble, Utensils, Landmark, Trees, Compass } from 'lucide-react';
import { loadLandingCatalogue } from '@/services/landingCatalogue';
import type { PlaceCatalogItem } from '@/data/landingSampleModel';
import { Link } from 'react-router-dom';
import SmoothSegmentedTabs from '@/components/ui/SmoothSegmentedTabs';
import { useRevealOnScroll } from './useRevealOnScroll';

const TOPIC_CHIPS = [
  { label: 'Lưu trú xanh', to: '/explore?tab=luu-tru', icon: BedDouble },
  { label: 'Ẩm thực bản địa', to: '/explore?tab=quan-an', icon: Utensils },
  { label: 'Di sản Huế', to: '/explore?tab=di-tich', icon: Landmark },
  { label: 'Thiên nhiên & Biển', to: '/explore?tab=canh-quan', icon: Trees },
  { label: 'Chùa & Tâm linh', to: '/explore?tab=chua', icon: Compass },
] as const;

const BENTO_DESTINATIONS: ReadonlyArray<{
  id: string;
  cityKey: 'danang' | 'hue' | 'danang_hue';
  days: number;
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  alt: string;
  spanClass: string;
}> = [
  {
    id: 'bento-danang',
    cityKey: 'danang',
    days: 2,
    eyebrow: 'Cụm biển & sinh thái',
    title: 'Đà Nẵng · Sơn Trà',
    subtitle: 'Cầu Rồng, bán đảo Sơn Trà, biển Mỹ Khê và các quán cà phê ven sông Hàn ít chen chúc.',
    image: '/images/landing/danang-1400.webp',
    alt: 'Cầu Rồng và sông Hàn Đà Nẵng lúc lên đèn',
    spanClass: 'md:col-span-2 lg:col-span-2',
  },
  {
    id: 'bento-hue',
    cityKey: 'hue',
    days: 2,
    eyebrow: 'Di sản & làng nghề',
    title: 'Huế Cố Đô',
    subtitle: 'Đại Nội, chùa Thiên Mụ, nhà vườn và nhịp sống chậm bên dòng sông Hương.',
    image: '/images/landing/hue-1400.webp',
    alt: 'Cố đô Huế bình yên bên sông Hương',
    spanClass: 'lg:col-span-1',
  },
  {
    id: 'bento-haivan',
    cityKey: 'danang_hue',
    days: 3,
    eyebrow: 'Tuyến liên đô thị',
    title: 'Đèo Hải Vân',
    subtitle: 'Kết nối Đà Nẵng – Huế qua cung đèo biển mây, tối ưu điểm dừng nghỉ và ăn trưa.',
    image: '/images/landing/studio/plan_haivan_pass_real.webp',
    alt: 'Cung đường đèo Hải Vân nối Đà Nẵng và Huế',
    spanClass: 'lg:col-span-1',
  },
];

interface HiddenGemsSectionProps {
  onOpenSampleForCity: (city: 'danang' | 'hue' | 'danang_hue', days: number) => void;
}

export function HiddenGemsSection({ onOpenSampleForCity }: HiddenGemsSectionProps) {
  const [filter, setFilter] = useState<'danang' | 'hue' | 'hidden_gem'>('danang');

  const section = useRef<HTMLElement>(null);
  const reveal = useRevealOnScroll<HTMLDivElement>();
  const [catalogue, setCatalogue] = useState<PlaceCatalogItem[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if(entry.isIntersecting) {setReady(true); observer.disconnect();} }, {rootMargin:'300px'});
    if(section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if(!ready) return;
    let active = true; setLoading(true); setError('');
    void loadLandingCatalogue().then(items => {if(active) setCatalogue(items);}).catch(() => {if(active) setError('Chưa tải được địa điểm.');}).finally(() => {if(active) setLoading(false);});
    return () => {active=false;};
  }, [ready, retry]);
  const filteredSpots = catalogue.filter(p => filter === 'hidden_gem' ? (p.greenScore ?? 0) >= 75 : p.city === (filter === 'hue' ? 'Huế' : 'Đà Nẵng')).slice(0,4).map(p => ({
    ...p, imageUrl:p.photos[0]?.src, badgeLabel:p.category,
    targetCityKey:(p.city === 'Huế' ? 'hue' : 'danang') as 'hue' | 'danang', recommendedDays:2,
  }));

  return (
    <section ref={section} className="py-20 sm:py-28 bg-[#FAF8F5]">
      <div className="section-width mx-auto px-4 sm:px-6 lg:px-8 max-w-[1400px]">
        {/* Section Heading */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-neutral-200 text-neutral-700 text-xs font-semibold tracking-wider uppercase mb-3 shadow-sm">
              <Sparkles size={12} className="text-neutral-900" aria-hidden="true" />
              ĐỊA ĐIỂM TỪ GREENTRIP
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#111111] tracking-[-0.03em] leading-tight">
              Chọn nơi bạn muốn ghé.
            </h2>
            <p className="mt-3 text-base text-[#555555] max-w-xl leading-relaxed">
              Xem địa điểm trong dữ liệu GreenTrip, rồi thử một lịch tham khảo theo thành phố. Bạn có thể chỉnh trước khi lưu.
            </p>
          </div>

          {/* Smooth Segmented Filter Tabs */}
          <SmoothSegmentedTabs
            variant="pill"
            ariaLabel="Lọc địa điểm theo thành phố"
            value={filter}
            onChange={(next) => setFilter(next)}
            options={[
              { id: 'danang', label: 'Đà Nẵng' },
              { id: 'hue', label: 'Huế Cố Đô' },
              { id: 'hidden_gem', label: 'Điểm xanh trong dữ liệu' },
            ]}
          />
        </div>

        {/* ND Travel-inspired Quick Topic Chips */}
        <div aria-label="Chủ đề khám phá nhanh" className="flex flex-wrap items-center gap-2.5 mb-8">
          {TOPIC_CHIPS.map((chip) => {
            const Icon = chip.icon;
            return (
              <Link
                key={chip.to}
                to={chip.to}
                className="aui-press inline-flex min-h-[40px] items-center gap-2 rounded-full bg-white hover:bg-emerald-950 border border-neutral-200/90 hover:border-emerald-950 px-4 py-2 text-xs sm:text-[13px] font-semibold !text-[#111111] hover:!text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <Icon size={14} aria-hidden="true" />
                <span>{chip.label}</span>
              </Link>
            );
          })}
        </div>

        {/* ND Travel-inspired Featured Bento Grid (2-1-1) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {BENTO_DESTINATIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenSampleForCity(item.cityKey, item.days)}
              className={`aui-card group relative ${item.spanClass} min-h-[250px] sm:min-h-[290px] w-full overflow-hidden rounded-[24px] !bg-neutral-900 text-left shadow-sm hover:shadow-[0_18px_38px_-18px_rgba(15,23,42,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700`}
            >
              <img
                src={item.image}
                alt={item.alt}
                loading="lazy"
                decoding="async"
                className="aui-card-media absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/15" />

              <div className="relative z-10 flex h-full min-h-[250px] sm:min-h-[290px] flex-col justify-between p-5 sm:p-6">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-[#111111]">
                    {item.eyebrow}
                  </span>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white border border-white/30">
                    <ArrowRight
                      size={15}
                      className="transition-transform duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-0.5 motion-reduce:transform-none"
                      aria-hidden="true"
                    />
                  </span>
                </div>

                <div>
                  <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-xs sm:text-[13px] text-white/90 leading-relaxed line-clamp-2 max-w-md">
                    {item.subtitle}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                    <span>Xem lịch {item.days} ngày</span>
                    <ArrowRight size={13} aria-hidden="true" />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Proof Metrics Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-10">
          <div className="rounded-2xl border border-neutral-200/80 bg-white px-4 py-4 sm:px-5 sm:py-5">
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111111]">575+</p>
            <p className="mt-1 text-xs sm:text-[13px] text-neutral-600 leading-snug">
              Địa điểm Đà Nẵng &amp; Huế chuẩn hóa tọa độ, giờ mở cửa
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200/80 bg-white px-4 py-4 sm:px-5 sm:py-5">
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111111]">4 trụ cột</p>
            <p className="mt-1 text-xs sm:text-[13px] text-neutral-600 leading-snug">
              Tiêu chí Điểm xanh minh bạch cho mọi điểm đến
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200/80 bg-white px-4 py-4 sm:px-5 sm:py-5">
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-900">-52%</p>
            <p className="mt-1 text-xs sm:text-[13px] text-neutral-600 leading-snug">
              Quãng đường chạy vòng giảm trên tuyến tham khảo
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200/80 bg-white px-4 py-4 sm:px-5 sm:py-5">
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111111]">0₫</p>
            <p className="mt-1 text-xs sm:text-[13px] text-neutral-600 leading-snug">
              Miễn phí lập lịch trình AI, bản đồ &amp; xuất PDF
            </p>
          </div>
        </div>

        {/* Editorial Cards Grid — Exactly 1 Row of 4 Cards */}
        <div
          ref={reveal.ref}
          onFocusCapture={reveal.onFocusCapture}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {loading && Array.from({length:4}, (_,i) => <div key={i} role="status" aria-label="Đang tải địa điểm" className="h-72 rounded-3xl bg-neutral-200 animate-pulse" />)}
          {!loading && error && <div role="alert">{error} <button className="min-h-[44px] underline" onClick={() => setRetry(n => n+1)}>Thử lại</button></div>}
          {!loading && !error && !filteredSpots.length && <p>Chưa có địa điểm phù hợp với lựa chọn này.</p>}
          {!loading && filteredSpots.map((spot, idx) => {
            return (
              <div
                key={spot.id}
                data-revealed={reveal.revealed ? 'true' : 'false'}
                style={reveal.revealed ? { transitionDelay: `${idx * 80}ms` } : undefined}
                className="aui-reveal aui-card motion-reduce:!delay-0 group bg-white rounded-[24px] overflow-hidden border border-neutral-200/80 hover:border-neutral-300 hover:shadow-[0_18px_38px_-18px_rgba(15,23,42,0.18)] flex flex-col justify-between"
              >
                <div>
                  {/* Aspect 4/3 Photo */}
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-900">
                    {spot.imageUrl && <img decoding="async"
                      src={spot.imageUrl}
                      alt={spot.name}
                      loading="lazy"
                      className="aui-card-media w-full h-full object-cover"
                    />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-black/10" />

                    {/* Tag Badge */}
                    <div className="absolute top-3 left-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide bg-white/95 text-[#111111] backdrop-blur-md shadow-2xs">
                        {spot.badgeLabel}
                      </span>
                    </div>

                    {/* Green Score Badge */}
                    {spot.greenScore !== null && <div className="absolute top-3 right-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-[#111111]/85 text-emerald-300 backdrop-blur-sm">
                        <Leaf size={10} className="fill-emerald-300 text-emerald-300" />
                        {spot.greenScore}
                      </span>
                    </div>}

                    {/* City & Category */}
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-white font-medium">
                      <span className="flex items-center gap-1">
                        <MapPin size={11} className="text-white/80" />
                        {spot.city}
                      </span>
                      <span className="text-white/80">{spot.category}</span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-4 sm:p-5">
                    <h3 className="font-bold text-[14px] text-[#111111] group-hover:text-neutral-700 transition-colors line-clamp-1 mb-1">
                      {spot.name}
                    </h3>
                    <p className="text-xs text-[#555555] leading-relaxed line-clamp-2">
                      {spot.shortDesc}
                    </p>
                  </div>
                </div>

                {/* Footer Action: Minimal Outline Pill */}
                <div className="p-4 sm:p-5 pt-0">
                  <button
                    type="button"
                    onClick={() => onOpenSampleForCity(spot.targetCityKey, spot.recommendedDays)}
                    className="aui-press w-full min-h-[44px] py-2.5 px-3 rounded-full !bg-white hover:!bg-emerald-950 !text-[#111111] hover:!text-white !border !border-neutral-200 hover:!border-emerald-950 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    Xem lịch {spot.recommendedDays} ngày
                    <ArrowRight size={13} className="transition-transform duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Explore all link */}
        <div className="mt-10 text-center">
          <Link
            to="/explore"
            className="aui-press inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 rounded-full text-xs font-semibold !text-[#111111] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            Tìm thêm địa điểm tại Đà Nẵng & Huế
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}

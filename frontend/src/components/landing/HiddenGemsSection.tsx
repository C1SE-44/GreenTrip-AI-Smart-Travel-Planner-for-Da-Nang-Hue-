import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Leaf, MapPin, ArrowRight } from 'lucide-react';
import { loadLandingCatalogue } from '@/services/landingCatalogue';
import type { PlaceCatalogItem } from '@/data/landingSampleModel';
import { Link } from 'react-router-dom';

interface HiddenGemsSectionProps {
  onOpenSampleForCity: (city: 'danang' | 'hue' | 'danang_hue', days: number) => void;
}

export function HiddenGemsSection({ onOpenSampleForCity }: HiddenGemsSectionProps) {
  const [filter, setFilter] = useState<'danang' | 'hue' | 'hidden_gem'>('danang');

  const section = useRef<HTMLElement>(null);
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
      <div className="section-width mx-auto px-4 sm:px-6 lg:px-8 max-w-[1240px]">
        {/* Section Heading */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-neutral-200 text-neutral-600 text-xs font-semibold tracking-wider uppercase mb-3 shadow-2xs">
              <Sparkles size={12} className="text-neutral-900" />
              ĐỊA ĐIỂM TỪ GREENTRIP
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#111111] tracking-[-0.03em] leading-tight">
              Chọn nơi bạn muốn ghé.
            </h2>
            <p className="mt-3 text-base text-[#555555] max-w-xl leading-relaxed">
              Xem địa điểm trong dữ liệu GreenTrip, rồi thử một lịch tham khảo theo thành phố. Bạn có thể chỉnh trước khi lưu.
            </p>
          </div>

          {/* Minimal Filter Pills */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilter('danang')}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                filter === 'danang'
                  ? 'bg-[#111111] text-white shadow-2xs'
                  : 'bg-white text-neutral-600 border border-neutral-200/80 hover:bg-neutral-50'
              }`}
            >
              Đà Nẵng
            </button>
            <button
              type="button"
              onClick={() => setFilter('hue')}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                filter === 'hue'
                  ? 'bg-[#111111] text-white shadow-2xs'
                  : 'bg-white text-neutral-600 border border-neutral-200/80 hover:bg-neutral-50'
              }`}
            >
              Huế Cố Đô
            </button>
            <button
              type="button"
              onClick={() => setFilter('hidden_gem')}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                filter === 'hidden_gem'
                  ? 'bg-[#111111] text-white shadow-2xs'
                  : 'bg-white text-neutral-600 border border-neutral-200/80 hover:bg-neutral-50'
              }`}
            >
              Điểm xanh trong dữ liệu
            </button>
          </div>
        </div>

        {/* Editorial Cards Grid — Exactly 1 Row of 4 Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {loading && Array.from({length:4}, (_,i) => <div key={i} role="status" aria-label="Đang tải địa điểm" className="h-72 rounded-3xl bg-neutral-200 animate-pulse" />)}
          {!loading && error && <div role="alert">{error} <button className="min-h-11 underline" onClick={() => setRetry(n => n+1)}>Thử lại</button></div>}
          {!loading && !error && !filteredSpots.length && <p>Chưa có địa điểm phù hợp với lựa chọn này.</p>}
          {!loading && filteredSpots.map((spot) => {
            return (
              <div
                key={spot.id}
                className="group bg-white rounded-[24px] overflow-hidden border border-neutral-200/80 hover:border-neutral-300 hover:shadow-xl hover:shadow-black/5 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  {/* Aspect 4/3 Photo */}
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-100">
                    {spot.imageUrl && <img decoding="async"
                      src={spot.imageUrl}
                      alt={spot.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10" />

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
                    className="w-full py-2.5 px-3 rounded-full bg-white hover:bg-[#FAF8F5] text-[#111111] border border-neutral-200 hover:border-neutral-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    Xem lịch {spot.recommendedDays} ngày
                    <ArrowRight size={13} />
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
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#111111] hover:underline"
          >
            Tìm thêm địa điểm tại Đà Nẵng & Huế
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}

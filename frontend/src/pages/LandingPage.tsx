import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, ArrowRight, Leaf, ArrowDown } from 'lucide-react';
import { HeroScenes } from '@/components/landing/HeroScenes';
import { HeroSearchPill } from '@/components/landing/HeroSearchPill';
import { ProblemComparisonSection } from '@/components/landing/ProblemComparisonSection';
import { ValuePropsSection } from '@/components/landing/ValuePropsSection';
import { HiddenGemsSection } from '@/components/landing/HiddenGemsSection';
import { TravelerStoriesAndAboutSection } from '@/components/landing/TravelerStoriesAndAboutSection';
import { LandingFaqSection } from '@/components/landing/LandingFaqSection';
import '@/components/landing/landing.css';

const SampleItineraryModal = lazy(() => import('@/components/landing/SampleItineraryModal').then(m => ({default:m.SampleItineraryModal})));

type City = 'danang' | 'hue' | 'danang_hue';

export default function LandingPage() {
  const location = useLocation();
  const [city, setCity] = useState<City>('danang');
  const [days, setDays] = useState(1);
  const [sampleLoaded, setSampleLoaded] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [inView, setInView] = useState(true);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [tabVisible, setTabVisible] = useState(!document.hidden);
  const hero = useRef<HTMLElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = (e: MediaQueryListEvent) => setReduced(e.matches);
    const onVisibility = () => setTabVisible(!document.hidden);
    media.addEventListener('change', onMotion);
    document.addEventListener('visibilitychange', onVisibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.05 });
    if (hero.current) observer.observe(hero.current);
    return () => {
      media.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, []);

  const openSample = (c: City = city, d: number = days) => {
    setSampleLoaded(true);
    setCity(c);
    setDays(d);
    setSampleOpen(true);
  };

  const sceneCity = city === 'hue' ? 'hue' : 'danang';

  return (
    <div className="gt-landing">
      <a className="skip-link" href="#main">Đến nội dung chính</a>

      <main id="main">
        {/* SECTION 1: HERO */}
        <section className={`hero hero-${sceneCity}`} ref={hero} aria-labelledby="hero-title">
            <HeroScenes
              selectedCity={sceneCity}
              running={inView && tabVisible && !sampleOpen && location.pathname === '/'}
              reduced={reduced}
            />

            <div className="hero-content">
              <h1 id="hero-title">
                Có lịch để bắt đầu.
              </h1>
              <p>
                Chọn điểm đến và số ngày để xem ngay lịch trình tham khảo —{' '}
                <br className="mobile-only" />
                hoặc hỏi Trợ lý AI để thiết kế riêng.
              </p>

              {/* Hero Search Pill (2 Tabs: Sample vs AI Chat) */}
              <HeroSearchPill
                city={city}
                days={days}
                onCityChange={setCity}
                onDaysChange={setDays}
                onSubmit={() => openSample()}
              />
            </div>

            <a href="#problem" className="hero-scroll" aria-label="Xem vì sao chọn GreenTrip AI">
              <ArrowDown size={20} aria-hidden="true" />
            </a>
          </section>

          {/* SECTION 2: PROBLEM VS SOLUTION */}
          <ProblemComparisonSection onOpenSample={() => openSample()} />

          {/* SECTION 3: SOLUTION / HOW IT WORKS (3 PANELS) */}
          <div id="core-values">
            <ValuePropsSection onOpenSample={() => openSample()} />
          </div>

          {/* SECTION 4: PROOF / PORTFOLIO & CURATED SPOTS */}
          <HiddenGemsSection
            onOpenSampleForCity={(c, d) => openSample(c, d)}
          />

          {/* SECTION 5 & 6: PROOF / TESTIMONIALS + ABOUT US */}
          <TravelerStoriesAndAboutSection onOpenSample={(c, d) => openSample(c, d)} />

          {/* SECTION 7: INTERACTIVE FAQ ACCORDION */}
          <LandingFaqSection />

          {/* SECTION 8: EDITORIAL CLOSING PHOTO CTA */}
          <section className="closing-photo section-width">
            <img
              src="/images/landing/closing-resort-1400.webp"
              srcSet="/images/landing/closing-resort-640.webp 640w, /images/landing/closing-resort-1400.webp 1400w"
              sizes="100vw"
              width={1400}
              height={933}
              decoding="async"
              alt=""
              loading="lazy"
            />
            <div className="closing-photo-content">
              <h2>
                Bớt lo lịch. Thêm thời gian sống.
              </h2>
              <p>
                Chọn nơi muốn đến, số ngày bạn có. GreenTrip làm phần còn lại.
              </p>
              <div className="closing-photo-actions">
                <button className="button aui-press" onClick={() => openSample()}>
                  Xem lịch trình mẫu <ArrowRight size={18} aria-hidden="true" />
                </button>
                <Link to="/chat" className="closing-photo-secondary aui-press">
                  Hỏi Trợ lý AI <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>
        </main>

        {/* SECTION 9: STRUCTURED MULTI-COLUMN FOOTER */}
        <footer className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 border-t border-neutral-200/80 pt-14 pb-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10">
            <div className="lg:col-span-5">
              <a className="logo" href="#">
                <Leaf size={25} aria-hidden="true" />
                greentrip
              </a>
              <p className="mt-4 max-w-sm text-sm text-[#575048] leading-relaxed">
                Du lịch thông minh &amp; bền vững cho hành trình Đà Nẵng – Huế. Tối ưu cung đường xanh từ hơn 575 địa điểm chuẩn hóa.
              </p>
            </div>

            <div className="lg:col-span-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-3">
                Khám phá
              </h2>
              <ul className="space-y-1 text-sm">
                <li>
                  <Link
                    to="/explore"
                    className="aui-press inline-flex min-h-[40px] items-center !text-[#575048] hover:!text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    Khám phá điểm đến
                  </Link>
                </li>
                <li>
                  <Link
                    to="/chat"
                    className="aui-press inline-flex min-h-[40px] items-center !text-[#575048] hover:!text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    Trợ lý AI
                  </Link>
                </li>
                <li>
                  <Link
                    to="/planner"
                    className="aui-press inline-flex min-h-[40px] items-center gap-1 !text-[#575048] hover:!text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <span>Lập lịch trình</span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                </li>
                <li>
                  <Link
                    to="/saved"
                    className="aui-press inline-flex min-h-[40px] items-center !text-[#575048] hover:!text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    Địa điểm đã lưu
                  </Link>
                </li>
              </ul>
            </div>

            <div className="lg:col-span-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-3">
                Lịch trình gợi ý
              </h2>
              <ul className="space-y-1 text-sm">
                <li>
                  <button
                    type="button"
                    onClick={() => openSample('danang', 2)}
                    className="aui-press inline-flex min-h-[40px] items-center text-left !text-[#575048] hover:!text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    Đà Nẵng 2 ngày
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openSample('hue', 2)}
                    className="aui-press inline-flex min-h-[40px] items-center text-left !text-[#575048] hover:!text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    Huế Cố Đô 2 ngày
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openSample('danang_hue', 3)}
                    className="aui-press inline-flex min-h-[40px] items-center text-left !text-[#575048] hover:!text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    Liên tuyến Đà Nẵng – Huế 3 ngày
                  </button>
                </li>
              </ul>
            </div>

            <div className="lg:col-span-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-3">
                Tìm hiểu thêm
              </h2>
              <ul className="space-y-1 text-sm">
                <li>
                  <a
                    href="#problem"
                    className="aui-press inline-flex min-h-[40px] items-center !text-[#575048] hover:!text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    Vì sao chọn GreenTrip
                  </a>
                </li>
                <li>
                  <a
                    href="#core-values"
                    className="aui-press inline-flex min-h-[40px] items-center !text-[#575048] hover:!text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    Cách hoạt động
                  </a>
                </li>
                <li>
                  <a
                    href="#about-us"
                    className="aui-press inline-flex min-h-[40px] items-center !text-[#575048] hover:!text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    Về chúng tôi
                  </a>
                </li>
                <li>
                  <a
                    href="#faq"
                    className="aui-press inline-flex min-h-[40px] items-center !text-[#575048] hover:!text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    Câu hỏi thường gặp
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-neutral-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#575048]">
            <span>
              © {new Date().getFullYear()} GreenTrip AI · Dự án du lịch thông minh &amp; xanh.
            </span>
            <span>Đà Nẵng · Đèo Hải Vân · Huế</span>
          </div>
        </footer>

        {/* RICH SAMPLE ITINERARY MODAL */}
        {sampleLoaded && <Suspense fallback={<p role="status">Đang mở lịch tham khảo…</p>}><SampleItineraryModal
          isOpen={sampleOpen}
          city={city}
          days={days}
          onClose={() => setSampleOpen(false)}
          onCityChange={setCity}
          onDaysChange={setDays}
        /></Suspense>}
      </div>
    );
}

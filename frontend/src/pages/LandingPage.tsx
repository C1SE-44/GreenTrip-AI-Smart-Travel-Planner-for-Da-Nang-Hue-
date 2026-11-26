import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, ArrowRight, Leaf, ArrowDown, Sparkles } from 'lucide-react';
import { HeroScenes } from '@/components/landing/HeroScenes';
import { HeroSearchPill } from '@/components/landing/HeroSearchPill';
import { ValuePropsSection } from '@/components/landing/ValuePropsSection';
import { HiddenGemsSection } from '@/components/landing/HiddenGemsSection';
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
              {/* Small pill label above H1 */}
              <div className="inline-flex items-center rounded-full border border-white/40 bg-white/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-700 backdrop-blur-sm mb-6">
                LẬP LỊCH TRÌNH DU LỊCH XANH · ĐÀ NẴNG &amp; HUẾ
              </div>

              <h1 id="hero-title">
                Có lịch để bắt đầu.
              </h1>
              <p>
                Chọn điểm đến và số ngày. Thử chỉnh một lịch tham khảo —{' '}
                <br className="mobile-only" />
                xem ngay, không cần đăng ký.
              </p>

              {/* Hero Search Pill */}
              <HeroSearchPill
                city={city}
                days={days}
                onCityChange={setCity}
                onDaysChange={setDays}
                onSubmit={() => openSample()}
              />

              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/chat"
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-emerald-800 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  <Sparkles size={14} aria-hidden="true" />
                  <span>Hỏi Trợ lý AI ngay</span>
                </Link>
                <Link
                  to="/explore"
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-neutral-300 bg-white/85 px-4 py-2 text-xs font-semibold text-neutral-900 hover:bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  <span>Khám phá điểm đến xanh</span>
                </Link>
              </div>

              <p className="hero-note">Thử chỉnh miễn phí · Địa điểm từ GreenTrip · Đăng nhập khi lưu</p>
            </div>

            <a href="#core-values" className="hero-scroll" aria-label="Xem GreenTrip giúp bạn thế nào">
              <ArrowDown size={20} />
            </a>
          </section>

          {/* SECTION 2: HOW IT WORKS (3 TABS) + TESTIMONIALS */}
          <div id="core-values">
            <ValuePropsSection onOpenSample={() => openSample()} />
          </div>

          {/* SECTION 3: CURATED SPOTS & HIDDEN GEMS (EXACTLY 4 CARDS) */}
          <HiddenGemsSection
            onOpenSampleForCity={(c, d) => openSample(c, d)}
          />

          {/* SECTION 4: EDITORIAL CLOSING PHOTO CTA */}
          <section className="closing-photo section-width">
            <img
              src="/images/landing/closing-resort-1400.webp"
              srcSet="/images/landing/closing-resort-640.webp 640w, /images/landing/closing-resort-1400.webp 1400w"
              sizes="100vw"
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
              <button className="button" onClick={() => openSample()}>
                Xem lịch trình mẫu <ArrowRight size={18} />
              </button>
            </div>
          </section>
        </main>

        {/* FOOTER */}
        <footer className="site-footer section-width">
          <div>
            <a className="logo" href="#">
              <Leaf size={25} />
              greentrip
            </a>
            <p>
              Du lịch thông minh, bắt đầu từ những lựa chọn của bạn.
              <br />
              Đà Nẵng · Huế
            </p>
          </div>
          <div className="footer-links">
            <Link to="/explore">Khám phá điểm đến</Link>
            <Link to="/chat">Trợ lý AI</Link>
            <button onClick={() => openSample()}>Xem lịch mẫu</button>
            <Link to="/planner">
              Lập lịch trình <ArrowUpRight size={14} />
            </Link>
          </div>
          <span className="copyright">
            © {new Date().getFullYear()} GreenTrip AI · Dự án du lịch thông minh &amp; xanh.
          </span>
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

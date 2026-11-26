import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, ArrowRight, Leaf, ArrowDown } from 'lucide-react';
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
              <h1 id="hero-title">
                Có lịch để bắt đầu.
              </h1>
              <p>
                Chọn điểm đến và số ngày để xem ngay lịch trình tham khảo —{' '}
                <br className="mobile-only" />
                hoặc hỏi Trợ lý AI để thiết kế riêng.
              </p>

              {/* Hero Search Pill */}
              <HeroSearchPill
                city={city}
                days={days}
                onCityChange={setCity}
                onDaysChange={setDays}
                onSubmit={() => openSample()}
              />

              <div className="mt-4 flex items-center justify-center">
                <Link
                  to="/chat"
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-neutral-900 shadow-xs border border-neutral-200/80 hover:bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  <span>Chưa biết đi đâu? Hỏi Trợ lý AI ngay</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>
            </div>

            <a href="#core-values" className="hero-scroll" aria-label="Xem GreenTrip giúp bạn thế nào">
              <ArrowDown size={20} aria-hidden="true" />
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

          {/* SECTION 3.5: TRUST & FAQ STRIP */}
          <section
            aria-label="Câu hỏi thường gặp"
            className="section-width py-10 md:py-12"
          >
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
              <div className="text-center mb-6">
                <span className="inline-block text-xs font-semibold uppercase tracking-wider text-emerald-800 mb-1.5">
                  Rõ ràng trước khi xuất phát
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
                  Mọi thắc mắc phổ biến, trả lời gọn trong 10 giây
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <article className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-2xs">
                  <h3 className="text-sm font-semibold text-neutral-900 mb-1.5">
                    Có mất phí để lập lịch trình không?
                  </h3>
                  <p className="text-xs sm:text-[13px] text-neutral-600 leading-relaxed">
                    Miễn phí hoàn toàn cho việc khám phá địa điểm, hỏi Trợ lý AI, tối ưu tuyến đường xanh và xuất lịch trình PDF.
                  </p>
                </article>
                <article className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-2xs">
                  <h3 className="text-sm font-semibold text-neutral-900 mb-1.5">
                    Địa điểm gợi ý có thực tế không?
                  </h3>
                  <p className="text-xs sm:text-[13px] text-neutral-600 leading-relaxed">
                    Hơn 575 địa điểm tại Đà Nẵng và Huế được chuẩn hóa tọa độ, giờ mở cửa và chi phí tham khảo theo từng tuyến đường.
                  </p>
                </article>
                <article className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-2xs">
                  <h3 className="text-sm font-semibold text-neutral-900 mb-1.5">
                    Có thể tự chỉnh lại lịch trình AI tạo?
                  </h3>
                  <p className="text-xs sm:text-[13px] text-neutral-600 leading-relaxed">
                    Có. Bạn thêm, bớt hoặc kéo thả đổi thứ tự từng điểm dừng theo ngày và lưu lại trực tiếp trong tài khoản cá nhân.
                  </p>
                </article>
              </div>
            </div>
          </section>

          {/* SECTION 4: EDITORIAL CLOSING PHOTO CTA */}
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
              <button className="button" onClick={() => openSample()}>
                Xem lịch trình mẫu <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </section>
        </main>

        {/* FOOTER */}
        <footer className="site-footer section-width">
          <div>
            <a className="logo" href="#">
              <Leaf size={25} aria-hidden="true" />
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
              Lập lịch trình <ArrowUpRight size={14} aria-hidden="true" />
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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { TravelerSprite } from './TravelerSprite';
import { places } from './places';
import './scene-motion.css';

const SLIDE_INTERVAL_MS = 3000;
const TRANSITION_MS = 760;

interface HeroSlide {
  id: string;
  cityKey: keyof typeof places;
  image: string;
  srcSet?: string;
  label: string;
  tagline: string;
  positionClass: string;
}

const HERO_SLIDES: ReadonlyArray<HeroSlide> = [
  {
    id: 'danang-day',
    cityKey: 'danang',
    image: '/images/landing/danang-hero-2400.webp',
    srcSet: '/images/landing/danang-hero-640.webp 640w, /images/landing/danang-hero-1400.webp 1400w, /images/landing/danang-hero-2400.webp 2400w',
    label: 'ĐÀ NẴNG · CẦU RỒNG',
    tagline: 'Một khởi đầu bên dòng sông Hàn.',
    positionClass: 'image-danang',
  },
  {
    id: 'danang-night',
    cityKey: 'danang',
    image: '/images/landing/hero-cau-rong-dem.jpg',
    label: 'ĐÀ NẴNG · SÔNG HÀN ĐÊM',
    tagline: 'Rực rỡ sắc đèn bên nhịp cầu Rồng.',
    positionClass: 'image-night',
  },
  {
    id: 'hue-ngomon',
    cityKey: 'hue',
    image: '/images/landing/hue-hero-1376.webp',
    srcSet: '/images/landing/hue-hero-640.webp 640w, /images/landing/hue-hero-1376.webp 1376w',
    label: 'HUẾ · NGỌ MÔN',
    tagline: 'Một nhịp chậm giữa lòng cố đô.',
    positionClass: 'image-hue',
  },
  {
    id: 'danang-cau-vang',
    cityKey: 'danang',
    image: '/images/landing/hero-cau-vang.png',
    label: 'ĐÀ NẴNG · CẦU VÀNG',
    tagline: 'Giữa mây trời và núi xanh Bà Nà.',
    positionClass: 'image-golden',
  },
  {
    id: 'haivan-quan',
    cityKey: 'hue',
    image: '/images/landing/hero-hai-van-quan.jpg',
    label: 'ĐÈO HẢI VÂN · HẢI VÂN QUAN',
    tagline: 'Cung đường di sản nối Đà Nẵng và Huế.',
    positionClass: 'image-haivan',
  },
];

function firstIndexForCity(city: keyof typeof places): number {
  const idx = HERO_SLIDES.findIndex((slide) => slide.cityKey === city);
  return idx >= 0 ? idx : 0;
}

export function HeroScenes({
  selectedCity,
  running,
  reduced,
}: {
  selectedCity: keyof typeof places;
  running: boolean;
  reduced: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number>(() => firstIndexForCity(selectedCity));
  const [transition, setTransition] = useState<{ from: number; to: number; id: number } | null>(null);
  const [beat, setBeat] = useState(0);
  const [timerNonce, setTimerNonce] = useState(0);
  const [ready, setReady] = useState(false);
  const currentRef = useRef<number>(firstIndexForCity(selectedCity));
  const prevCityRef = useRef<keyof typeof places>(selectedCity);
  const changingRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const seqRef = useRef(0);

  useEffect(() => {
    const delay = window.setTimeout(() => setReady(true), 500);
    return () => window.clearTimeout(delay);
  }, []);

  const goToSlide = useCallback(
    (nextIndex: number) => {
      const normalized = ((nextIndex % HERO_SLIDES.length) + HERO_SLIDES.length) % HERO_SLIDES.length;
      if (normalized === currentRef.current) return;

      if (reduced) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
        changingRef.current = false;
        currentRef.current = normalized;
        setActiveIndex(normalized);
        setTransition(null);
        return;
      }

      if (changingRef.current) {
        window.clearTimeout(timerRef.current);
      }

      changingRef.current = true;
      const from = currentRef.current;
      const id = ++seqRef.current;
      currentRef.current = normalized;
      setTransition({ from, to: normalized, id });
      setBeat(id);

      timerRef.current = window.setTimeout(() => {
        changingRef.current = false;
        setActiveIndex(normalized);
        setTransition(null);
        timerRef.current = undefined;
      }, TRANSITION_MS);
    },
    [reduced],
  );

  useEffect(() => {
    if (prevCityRef.current === selectedCity) return;
    prevCityRef.current = selectedCity;
    const targetIdx = firstIndexForCity(selectedCity);
    if (HERO_SLIDES[currentRef.current]?.cityKey !== selectedCity) {
      goToSlide(targetIdx);
    }
  }, [selectedCity, goToSlide]);

  useEffect(() => {
    if (!running || reduced || !ready) return;
    const interval = window.setInterval(() => {
      goToSlide(currentRef.current + 1);
    }, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [running, reduced, ready, goToSlide, timerNonce]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const visibleIndex = transition ? transition.to : activeIndex;
  const visibleSlide = HERO_SLIDES[visibleIndex] ?? HERO_SLIDES[0];

  const slideClass = (idx: number) =>
    transition
      ? idx === transition.from
        ? 'is-exiting'
        : idx === transition.to
          ? 'is-entering'
          : 'is-standby'
      : idx === activeIndex
        ? 'is-active'
        : 'is-standby';

  return (
    <>
      <div
        className="hero-scenery"
        aria-hidden="true"
        data-scene={visibleSlide.id}
        data-transitioning={Boolean(transition)}
        data-paused={!running}
      >
        {HERO_SLIDES.map((slide, idx) => (
          <div key={slide.id} className={`hero-scene ${slideClass(idx)}`}>
            <div className="hero-scene-motion">
              <img
                src={slide.image}
                srcSet={slide.srcSet}
                sizes="100vw"
                decoding="async"
                className={`hero-scene-img ${slide.positionClass}`}
                alt=""
                loading={idx === 0 ? 'eager' : 'lazy'}
                {...({ fetchpriority: idx === 0 ? 'high' : 'low' } as Record<string, string>)}
              />
            </div>
          </div>
        ))}
        {transition && <div key={transition.id} className="scene-sweep" />}
      </div>

      <div className="hero-travelers">
        <TravelerSprite active={running && ready && !reduced} transitionId={beat} reducedMotion={reduced} />
      </div>

      <div className="scene-caption">
        <span>
          <MapPin size={14} aria-hidden="true" />
          {visibleSlide.label}
        </span>
        <p>{visibleSlide.tagline}</p>
      </div>

      {/* Interactive Hero Slide Controls & 3s Progress Indicator */}
      <div className="hero-slide-controls" role="region" aria-label="Điều khiển ảnh nền Hero">
        <button
          type="button"
          className="hero-slide-btn aui-press"
          onClick={() => {
            goToSlide(currentRef.current - 1);
            setTimerNonce((n) => n + 1);
          }}
          aria-label="Ảnh cảnh trước"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>

        <div className="hero-slide-status">
          <span className="hero-slide-count">
            {visibleIndex + 1}/{HERO_SLIDES.length}
          </span>
          <div className="hero-slide-bar" aria-hidden="true">
            <span
              key={`${visibleSlide.id}-${running ? 'run' : 'pause'}-${timerNonce}`}
              className="hero-slide-fill"
              style={{
                animationDuration: `${SLIDE_INTERVAL_MS}ms`,
                animationPlayState: running && ready && !reduced ? 'running' : 'paused',
              }}
            />
          </div>
        </div>

        <button
          type="button"
          className="hero-slide-btn aui-press"
          onClick={() => {
            goToSlide(currentRef.current + 1);
            setTimerNonce((n) => n + 1);
          }}
          aria-label="Ảnh cảnh tiếp theo"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}

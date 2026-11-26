import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import './MobileNotchedTabBar.css';

export interface MobileTabItem {
  key: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}

export interface MobileNotchedTabBarProps {
  items: readonly MobileTabItem[];
}

export default function MobileNotchedTabBar({ items }: MobileNotchedTabBarProps) {
  const navRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const springRef = useRef({ x: 0, v: 0, target: 0, raf: 0, initialized: false });

  const rawActiveIndex = items.findIndex((item) => item.active);
  const hasActive = rawActiveIndex >= 0;
  const activeIndex = hasActive ? rawActiveIndex : 0;

  const getTabCenter = useCallback((idx: number): number => {
    const btn = tabRefs.current[idx];
    const nav = navRef.current;
    if (!btn || !nav) return 0;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    return btnRect.left - navRect.left + btnRect.width / 2;
  }, []);

  const stepSpring = useCallback(() => {
    const s = springRef.current;
    const nav = navRef.current;
    if (!nav) {
      s.raf = 0;
      return;
    }
    const accel = (s.target - s.x) * 0.18 - s.v * 0.44;
    s.v += accel;
    s.x += s.v;
    nav.style.setProperty('--notch-x', `${s.x.toFixed(2)}px`);

    if (Math.abs(s.target - s.x) > 0.3 || Math.abs(s.v) > 0.3) {
      s.raf = window.requestAnimationFrame(stepSpring);
    } else {
      s.x = s.target;
      s.v = 0;
      nav.style.setProperty('--notch-x', `${s.x}px`);
      s.raf = 0;
    }
  }, []);

  useEffect(() => {
    const syncPosition = () => {
      const center = getTabCenter(activeIndex);
      if (!center || !navRef.current) return;
      const s = springRef.current;
      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      s.target = center;
      if (!s.initialized || reducedMotion) {
        s.x = center;
        s.v = 0;
        s.initialized = true;
        navRef.current.style.setProperty('--notch-x', `${center}px`);
        return;
      }
      if (!s.raf) {
        s.raf = window.requestAnimationFrame(stepSpring);
      }
    };

    syncPosition();
    window.addEventListener('resize', syncPosition);
    return () => {
      window.removeEventListener('resize', syncPosition);
    };
  }, [activeIndex, getTabCenter, stepSpring]);

  useEffect(() => {
    const spring = springRef.current;
    return () => {
      if (spring.raf) {
        window.cancelAnimationFrame(spring.raf);
      }
    };
  }, []);

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLButtonElement>) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const nextIdx = (index + delta + items.length) % items.length;
    tabRefs.current[nextIdx]?.focus();
    items[nextIdx]?.onClick();
  };

  return (
    <nav
      ref={navRef}
      aria-label="Điều hướng di động"
      className={`gt-mnav md:hidden fixed bottom-0 inset-x-0 z-40 no-print ${hasActive ? '' : 'is-neutral'}`.trim()}
    >
      <div className="gt-mnav-bg" aria-hidden="true" />
      {hasActive && <span className="gt-mnav-bub" aria-hidden="true" />}
      <ul className="gt-mnav-tabs" role="tablist" aria-label="Thanh điều hướng chính">
        {items.map((item, idx) => (
          <li key={item.key} role="none">
            <button
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              type="button"
              role="tab"
              aria-selected={item.active}
              tabIndex={item.active ? 0 : -1}
              onClick={item.onClick}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              className="gt-mnav-tab"
            >
              <span className="gt-mnav-ic" aria-hidden="true">
                <i className={`${item.icon} text-[20px]`} />
              </span>
              {item.badge !== undefined && item.badge > 0 ? (
                <em className="gt-mnav-bd" aria-label={`${item.badge} mục đã lưu`}>
                  {item.badge}
                </em>
              ) : null}
              <span className="gt-mnav-lab">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

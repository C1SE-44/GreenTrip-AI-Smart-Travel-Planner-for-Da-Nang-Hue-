// Lucian UX/UI Prompt #022 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#022
import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import './FavoriteHeartButton.css';

interface BurstDotSpec {
  a: string;
  c: string;
  c2: string;
}

const BURST_DOTS: readonly BurstDotSpec[] = [
  { a: '0deg', c: '#FF4D6D', c2: '#FFB26B' },
  { a: '51deg', c: '#10B981', c2: '#FF7A93' },
  { a: '103deg', c: '#FFB547', c2: '#22C3A6' },
  { a: '154deg', c: '#FF4D6D', c2: '#059669' },
  { a: '206deg', c: '#22C3A6', c2: '#FFB547' },
  { a: '257deg', c: '#FF7A93', c2: '#34D399' },
  { a: '309deg', c: '#059669', c2: '#FF4D6D' },
];

export interface FavoriteHeartButtonProps {
  active: boolean;
  pending?: boolean;
  variant?: 'overlay' | 'pill';
  label?: string;
  ariaLabel: string;
  title?: string;
  className?: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

export default function FavoriteHeartButton({
  active,
  pending = false,
  variant = 'overlay',
  label,
  ariaLabel,
  title,
  className = '',
  onClick,
}: FavoriteHeartButtonProps) {
  const rawId = useId();
  const gradId = `u022-g-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [isPopping, setIsPopping] = useState(false);
  const prevActiveRef = useRef(active);
  const popTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const becameActive = !prevActiveRef.current && active;
    prevActiveRef.current = active;

    if (!becameActive) return;
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    setIsPopping(true);
    if (popTimerRef.current !== null) {
      window.clearTimeout(popTimerRef.current);
    }
    popTimerRef.current = window.setTimeout(() => {
      setIsPopping(false);
      popTimerRef.current = null;
    }, 900);
  }, [active]);

  useEffect(() => {
    return () => {
      if (popTimerRef.current !== null) {
        window.clearTimeout(popTimerRef.current);
      }
    };
  }, []);

  return (
    <span
      className={`ux u022 u022--${variant} ${active ? 'is-on' : ''} ${isPopping ? 'is-pop' : ''} ${className}`.trim()}
    >
      <button
        type="button"
        className="u022-btn"
        aria-label={ariaLabel}
        aria-pressed={active}
        aria-busy={pending}
        disabled={pending}
        title={title}
        onClick={onClick}
      >
        <span className="u022-stage" aria-hidden="true">
          <span className="u022-ring" />
          {BURST_DOTS.map((dot) => (
            <span
              key={dot.a}
              className="u022-dot"
              style={
                {
                  '--a': dot.a,
                  '--c': dot.c,
                  '--c2': dot.c2,
                } as CSSProperties
              }
            >
              <i />
              <i />
            </span>
          ))}
          <span className="u022-heart">
            <svg viewBox="0 0 52 52">
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#FF7A93" />
                  <stop offset="1" stopColor="#E11D48" />
                </linearGradient>
              </defs>
              <path
                className="u022-f"
                style={{ fill: `url(#${gradId})` }}
                d="M26 45S5 33 5 18.5C5 11.6 10.4 7 16.4 7c4.3 0 7.6 2.3 9.6 5.6C28 9.3 31.3 7 35.6 7 41.6 7 47 11.6 47 18.5 47 33 26 45 26 45z"
              />
              <path
                className="u022-o"
                d="M26 45S5 33 5 18.5C5 11.6 10.4 7 16.4 7c4.3 0 7.6 2.3 9.6 5.6C28 9.3 31.3 7 35.6 7 41.6 7 47 11.6 47 18.5 47 33 26 45 26 45z"
              />
            </svg>
          </span>
        </span>
        {variant === 'pill' && label ? (
          <span className="underline underline-offset-2">{label}</span>
        ) : null}
      </button>
    </span>
  );
}

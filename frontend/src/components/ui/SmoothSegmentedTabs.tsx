import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './SmoothSegmentedTabs.css';

export interface SegmentedTabOption<T extends string> {
  id: T;
  label: string;
}

export interface SmoothSegmentedTabsProps<T extends string> {
  options: readonly SegmentedTabOption<T>[];
  value: T;
  onChange: (nextValue: T) => void;
  variant?: 'pill' | 'underline';
  ariaLabel?: string;
  className?: string;
}

export default function SmoothSegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  variant = 'pill',
  ariaLabel,
  className = '',
}: SmoothSegmentedTabsProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  const measure = useCallback(() => {
    const activeBtn = btnRefs.current[value];
    if (!activeBtn) return;
    setIndicator({
      left: activeBtn.offsetLeft,
      width: activeBtn.offsetWidth,
      ready: true,
    });
  }, [value]);

  useLayoutEffect(() => {
    measure();
  }, [measure, options]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`gt-tabs gt-tabs--${variant} ${className}`.trim()}
    >
      <span
        className="gt-tabs-indicator"
        aria-hidden="true"
        style={{
          width: `${indicator.width}px`,
          transform: `translateX(${indicator.left}px)`,
          opacity: indicator.ready ? 1 : 0,
        }}
      />
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            ref={(el) => {
              btnRefs.current[option.id] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={`gt-tab-btn ${active ? 'is-active' : ''}`.trim()}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

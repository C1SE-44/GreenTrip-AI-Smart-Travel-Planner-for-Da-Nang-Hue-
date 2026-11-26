// Lucian UX/UI Prompt #453 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#453
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import './AiThinkingDisclosure.css';

const DEFAULT_THINKING_STEPS = [
  'Truy vấn Neo4j Knowledge Graph Đà Nẵng – Huế',
  'Kiểm chứng tọa độ, thời tiết & tuyến di chuyển xanh',
  'Cân đối ngân sách & xếp thứ tự điểm dừng hợp lý',
];

export interface AiThinkingDisclosureProps {
  isThinking: boolean;
  thinkingLabel?: string;
  doneLabel?: string;
  steps?: string[];
  reasoningText?: string;
  defaultExpanded?: boolean;
  className?: string;
}

export default function AiThinkingDisclosure({
  isThinking,
  thinkingLabel = 'Trợ lý GreenTrip AI đang suy nghĩ…',
  doneLabel = 'Đã phân tích · Đồng bộ Đồ thị Tri thức',
  steps,
  reasoningText,
  defaultExpanded = false,
  className = '',
}: AiThinkingDisclosureProps) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [visibleCount, setVisibleCount] = useState(isThinking ? 1 : 999);
  const starSvgRef = useRef<SVGSVGElement | null>(null);
  const spinAnimRef = useRef<Animation | null>(null);

  const lines = useMemo(() => {
    if (reasoningText && reasoningText.trim().length > 0) {
      return reasoningText
        .split(/\r?\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    }
    if (steps && steps.length > 0) {
      return steps;
    }
    return DEFAULT_THINKING_STEPS;
  }, [reasoningText, steps]);

  useEffect(() => {
    const svg = starSvgRef.current;
    if (!svg || typeof svg.animate !== 'function') return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    const SPIN_MS = 2400;

    if (isThinking) {
      spinAnimRef.current?.cancel();
      spinAnimRef.current = svg.animate(
        [
          { transform: 'rotate(0deg) scale(1)' },
          { transform: 'rotate(180deg) scale(0.78)' },
          { transform: 'rotate(360deg) scale(1)' },
        ],
        { duration: SPIN_MS, iterations: Infinity },
      );
      return () => {
        spinAnimRef.current?.cancel();
        spinAnimRef.current = null;
      };
    }

    if (spinAnimRef.current) {
      const currentTime = Number(spinAnimRef.current.currentTime ?? 0);
      const p = (currentTime % SPIN_MS) / SPIN_MS;
      const deg = p * 360;
      const s = p < 0.5 ? 1 - 0.44 * p : 0.78 + 0.44 * (p - 0.5);
      spinAnimRef.current.cancel();
      spinAnimRef.current = null;
      const settle = svg.animate(
        [
          { transform: `rotate(${deg}deg) scale(${s})` },
          { transform: `rotate(${Math.ceil((deg + 25) / 90) * 90}deg) scale(1)` },
        ],
        { duration: 750, easing: 'cubic-bezier(.3,1.45,.5,1)', fill: 'forwards' },
      );
      return () => {
        settle.cancel();
      };
    }
  }, [isThinking]);

  useEffect(() => {
    if (!isThinking) {
      setVisibleCount(lines.length);
      return;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      setVisibleCount(lines.length);
      return;
    }

    setVisibleCount(1);
    const timers: number[] = [];
    lines.forEach((_, idx) => {
      if (idx === 0) return;
      const delay = 450 + idx * 1100;
      timers.push(
        window.setTimeout(() => {
          setVisibleCount((prev) => Math.max(prev, idx + 1));
        }, delay),
      );
    });
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [isThinking, lines]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setExpanded(false);
    }
  };

  return (
    <div className={`ux u453 ${isThinking ? '' : 'is-done'} ${className}`.trim()}>
      <div className="u453-w">
        <button
          type="button"
          className="u453-h"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((prev) => !prev)}
          onKeyDown={handleKeyDown}
        >
          <span className="u453-ic" aria-hidden="true">
            <svg ref={starSvgRef} viewBox="0 0 24 24">
              <path d="M12 1.6c.8 5.3 5.1 9.6 10.4 10.4-5.3.8-9.6 5.1-10.4 10.4C11.2 17.1 6.9 12.8 1.6 12 6.9 11.2 11.2 6.9 12 1.6Z" />
            </svg>
          </span>
          <span className="u453-tx">
            <span className="u453-a" aria-hidden={!isThinking}>
              {thinkingLabel}
            </span>
            <span className="u453-b" aria-hidden={isThinking}>
              {doneLabel}
            </span>
          </span>
          <svg className="u453-cv" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9.5 6 6 6-6 6" />
          </svg>
        </button>

        <div id={panelId} className="u453-pn">
          <div className="u453-in">
            <div className="u453-ls">
              {lines.map((line, index) => (
                <p
                  key={`${index}-${line.slice(0, 24)}`}
                  className={`u453-ln ${index < visibleCount ? 'is-on' : ''}`}
                >
                  <span>
                    <span>{line}</span>
                  </span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="u453-live" role="status">
        {isThinking ? thinkingLabel : doneLabel}
      </p>
    </div>
  );
}

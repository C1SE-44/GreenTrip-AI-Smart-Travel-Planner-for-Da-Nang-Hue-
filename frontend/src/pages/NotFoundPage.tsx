// Lucian UX/UI Prompt #089 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#089
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Leaf } from 'lucide-react';
import './NotFoundPage.css';

interface CandidateRoute {
  path: string;
  label: string;
  keywords: string[];
}

const GREENTRIP_ROUTES: readonly CandidateRoute[] = [
  { path: '/explore', label: 'Khám phá địa điểm', keywords: ['explore', 'khampha', 'poi', 'diadiem', 'map'] },
  { path: '/planner', label: 'Lập lịch trình xanh', keywords: ['planner', 'plan', 'trip', 'trips', 'itinerary', 'lichtrinh'] },
  { path: '/saved', label: 'Bộ sưu tập đã lưu', keywords: ['saved', 'save', 'bookmark', 'favorite', 'yeuthich'] },
  { path: '/home', label: 'Bảng điều khiển', keywords: ['home', 'dashboard', 'trangchu'] },
  { path: '/chat', label: 'Trợ lý GreenTrip AI', keywords: ['chat', 'ai', 'copilot', 'assistant'] },
  { path: '/profile', label: 'Tài khoản cá nhân', keywords: ['profile', 'account', 'settings', 'taikhoan'] },
];

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

function scoreRoute(rawPath: string, candidate: CandidateRoute): number {
  const cleaned = rawPath.toLowerCase().replace(/^\/+|\/+$/g, '').split('/')[0] || '';
  if (!cleaned) return 0.45;
  let best = 0;
  for (const kw of candidate.keywords) {
    const dist = levenshtein(cleaned, kw);
    const maxLen = Math.max(cleaned.length, kw.length, 1);
    let score = 1 - dist / maxLen;
    if (kw.startsWith(cleaned.slice(0, 2)) || cleaned.startsWith(kw.slice(0, 2))) {
      score += 0.14;
    }
    best = Math.max(best, score);
  }
  return Math.max(0.28, Math.min(0.96, best));
}

export default function NotFoundPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const initialPath = location.pathname && location.pathname !== '/' ? location.pathname : '/explre';
  const suggestions = useMemo(() => {
    return GREENTRIP_ROUTES.map((route) => ({
      ...route,
      score: scoreRoute(initialPath, route),
    }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [initialPath]);

  const [displayPath, setDisplayPath] = useState(initialPath);
  const [phase, setPhase] = useState<'idle' | 'fixing' | 'found'>('idle');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [digits, setDigits] = useState<[number, number]>([4, 4]);
  const [isTracking, setIsTracking] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [heading, setHeading] = useState('Có vẻ bạn đi lạc đường rồi');
  const [subtitle, setSubtitle] = useState('Đường dẫn có thể bị gõ nhầm hoặc trang đã chuyển đi');

  const cardRef = useRef<HTMLDivElement | null>(null);
  const numRef = useRef<HTMLDivElement | null>(null);
  const compassRef = useRef<HTMLSpanElement | null>(null);
  const needleRef = useRef<SVGGElement | null>(null);
  const firstRowRef = useRef<HTMLButtonElement | null>(null);

  const springRef = useRef({ a: 0, v: 0, tgt: 0, raf: 0, last: 0 });
  const timersRef = useRef<number[]>([]);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  const stepSpring = useCallback((now: number) => {
    const s = springRef.current;
    s.raf = 0;
    const needle = needleRef.current;
    if (!needle) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dt = Math.min(0.032, Math.max(0.001, (now - s.last) / 1000));
    s.last = now;

    if (reducedMotion) {
      s.a = s.tgt;
      s.v = 0;
    } else {
      s.v += (220 * (s.tgt - s.a) - 17 * s.v) * dt;
      s.a += s.v * dt;
    }
    needle.style.transform = `rotate(${s.a.toFixed(2)}deg)`;

    if (Math.abs(s.v) > 0.05 || Math.abs(s.tgt - s.a) > 0.05) {
      s.raf = window.requestAnimationFrame(stepSpring);
    }
  }, []);

  const kickSpring = useCallback(() => {
    const s = springRef.current;
    if (!s.raf) {
      s.last = performance.now();
      s.raf = window.requestAnimationFrame(stepSpring);
    }
  }, [stepSpring]);

  const aimNeedle = useCallback(
    (deg: number) => {
      const s = springRef.current;
      s.tgt = s.a + ((((deg - s.a) % 360) + 540) % 360) - 180;
      kickSpring();
    },
    [kickSpring],
  );

  const aimToward = useCallback(
    (clientX: number, clientY: number) => {
      const cp = compassRef.current;
      const card = cardRef.current;
      const num = numRef.current;
      if (!cp || !card || !num) return;
      const r = cp.getBoundingClientRect();
      const dx = clientX - (r.left + r.width / 2);
      const dy = clientY - (r.top + r.height / 2);
      aimNeedle((Math.atan2(dx, -dy) * 180) / Math.PI);
      const halfW = Math.max(1, card.getBoundingClientRect().width / 2);
      const lean = Math.max(-1, Math.min(1, dx / halfW));
      num.style.setProperty('--r', lean.toFixed(3));
    },
    [aimNeedle],
  );

  useEffect(() => {
    setDisplayPath(initialPath);
  }, [initialPath]);

  useEffect(() => {
    const spring = springRef.current;
    return () => {
      clearAllTimers();
      if (spring.raf) {
        window.cancelAnimationFrame(spring.raf);
      }
    };
  }, [clearAllTimers]);

  const swapCopy = useCallback(
    (nextTitle: string, nextSub: string) => {
      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setIsSwapping(true);
      schedule(() => {
        setHeading(nextTitle);
        setSubtitle(nextSub);
        setIsSwapping(false);
      }, reducedMotion ? 0 : 250);
    },
    [schedule],
  );

  const handleSelectSuggestion = (index: number) => {
    if (phase !== 'idle') return;
    const picked = suggestions[index];
    if (!picked) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    setPhase('fixing');
    setSelectedIndex(index);

    const from = displayPath;
    const to = picked.path;
    let k = from.length;

    const eraseStep = () => {
      if (k > 1) {
        k -= 1;
        setDisplayPath(from.slice(0, k));
        schedule(eraseStep, reducedMotion ? 0 : 34);
        return;
      }
      let j = 1;
      const typeStep = () => {
        j += 1;
        setDisplayPath(to.slice(0, j));
        if (j < to.length) {
          schedule(typeStep, reducedMotion ? 0 : 55);
          return;
        }
        setPhase('found');
        setIsTracking(false);
        numRef.current?.style.setProperty('--r', '0');
        setDigits([2, 0]);

        const s = springRef.current;
        s.tgt = s.a - (((s.a % 360) + 360) % 360) + 720;
        kickSpring();

        swapCopy('Đã tìm thấy trang!', `Đang mở “${picked.label}”…`);

        schedule(() => {
          navigate(picked.path);
        }, reducedMotion ? 150 : 1050);
      };
      typeStep();
    };

    eraseStep();
  };

  const handleUndo = () => {
    clearAllTimers();
    setPhase('idle');
    setSelectedIndex(null);
    setDisplayPath(initialPath);
    setDigits([4, 4]);
    swapCopy('Có vẻ bạn đi lạc đường rồi', 'Đường dẫn có thể bị gõ nhầm hoặc trang đã chuyển đi');
    firstRowRef.current?.focus({ preventScroll: true });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (phase !== 'idle') return;
    setIsTracking(true);
    aimToward(event.clientX, event.clientY);
  };

  const handlePointerLeave = () => {
    if (cardRef.current?.contains(document.activeElement)) return;
    setIsTracking(false);
    numRef.current?.style.setProperty('--r', '0');
    aimNeedle(0);
  };

  const handleFocusOut = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!cardRef.current?.contains(nextTarget) && !cardRef.current?.matches(':hover')) {
      setIsTracking(false);
      numRef.current?.style.setProperty('--r', '0');
      aimNeedle(0);
    }
  };

  const hostLabel =
    typeof window !== 'undefined' && window.location.host
      ? window.location.host
      : 'greentrip.ai';

  return (
    <main className="ux u089-page">
      <div
        ref={cardRef}
        className={`u089 ${phase === 'fixing' ? 'fixing' : ''} ${phase === 'found' ? 'found' : ''} ${isTracking ? 'trk' : ''} ${isSwapping ? 'swap' : ''}`.trim()}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onBlur={handleFocusOut}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginBottom: '10px',
            color: '#065f46',
            fontWeight: 700,
            fontSize: '15px',
            letterSpacing: '-0.02em',
          }}
        >
          <Leaf size={17} aria-hidden="true" />
          <span>greentrip</span>
        </div>

        <div className="u089-url">
          <svg viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5.6" />
            <path d="M1.6 7h10.8M7 1.4c1.8 1.6 1.8 9.6 0 11.2M7 1.4c-1.8 1.6-1.8 9.6 0 11.2" />
          </svg>
          <span className="u089-url-text">
            {hostLabel}
            <b>{displayPath}</b>
          </span>
        </div>

        <div
          ref={numRef}
          className="u089-num"
          role="img"
          aria-label={phase === 'found' ? '200 OK' : 'Lỗi 404 không tìm thấy trang'}
        >
          <span className="u089-d" aria-hidden="true">
            <span className="u089-col" style={{ '--v': digits[0] } as CSSProperties}>
              <span>0</span>
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
            </span>
          </span>
          <span ref={compassRef} className="u089-cp" aria-hidden="true">
            <svg viewBox="0 0 72 72">
              <circle className="u089-ring" cx="36" cy="36" r="30.5" />
              <path className="u089-tk" d="M36 14v3M36 55v3M14 36h3M55 36h3" />
              <g className="u089-wob">
                <g ref={needleRef} className="u089-nd">
                  <path d="M36 15.5l5.5 20.5h-11z" fill="#E11D48" />
                  <path d="M36 56.5l-5.5-20.5h11z" fill="var(--ux-ink-3)" />
                </g>
              </g>
              <circle className="u089-hub" cx="36" cy="36" r="3.4" />
            </svg>
          </span>
          <span className="u089-d" aria-hidden="true">
            <span className="u089-col" style={{ '--v': digits[1] } as CSSProperties}>
              <span>0</span>
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
            </span>
          </span>
        </div>

        <h1 className="u089-t" aria-live="polite">
          {heading}
        </h1>
        <p className="u089-s">{subtitle}</p>

        <div className="u089-lab">
          <span>Trang gần giống nhất</span>
          <button className="u089-re" type="button" onClick={handleUndo}>
            Hoàn tác
          </button>
        </div>

        <ul className="u089-sug">
          {suggestions.map((item, idx) => {
            const isPicked = selectedIndex === idx;
            const disabled = phase === 'fixing' && !isPicked;
            return (
              <li key={item.path}>
                <button
                  ref={idx === 0 ? firstRowRef : undefined}
                  type="button"
                  disabled={disabled}
                  className={`u089-row ${isPicked ? 'on' : ''}`.trim()}
                  aria-label={`Đi tới ${item.path} ${item.label}, khớp ${Math.round(item.score * 100)}%`}
                  onClick={() => handleSelectSuggestion(idx)}
                  onFocus={(e) => {
                    if (phase !== 'idle') return;
                    setIsTracking(true);
                    const r = e.currentTarget.getBoundingClientRect();
                    aimToward(r.left + r.width / 2, r.top + r.height / 2);
                  }}
                >
                  <code>{item.path}</code>
                  <small>{item.label}</small>
                  <span className="u089-m" aria-hidden="true">
                    <i style={{ '--m': item.score } as CSSProperties} />
                  </span>
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    {isPicked && phase === 'found' ? (
                      <path d="M3.2 8.4l3 3L12.8 4.8" />
                    ) : (
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    )}
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <Link
        to="/"
        className="inline-flex items-center min-h-[40px] px-4 rounded-full text-xs font-semibold text-emerald-800 hover:bg-emerald-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
      >
        ← Quay về trang chủ GreenTrip AI
      </Link>
    </main>
  );
}

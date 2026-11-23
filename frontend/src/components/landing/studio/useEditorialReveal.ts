import { useEffect, useRef, useState } from 'react';

export function useEditorialReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [revealState, setRevealState] = useState<'visible' | 'pending'>('visible');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches || typeof IntersectionObserver === 'undefined') {
      setRevealState('visible');
      return;
    }

    const rect = el.getBoundingClientRect();
    // If card starts already visible or above viewport on load, keep visible immediately
    if (rect.top <= window.innerHeight * 0.92) {
      setRevealState('visible');
      return;
    }

    setRevealState('pending');

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealState('visible');
          observer.disconnect();
        }
      },
      { threshold: 0.14 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, revealState };
}

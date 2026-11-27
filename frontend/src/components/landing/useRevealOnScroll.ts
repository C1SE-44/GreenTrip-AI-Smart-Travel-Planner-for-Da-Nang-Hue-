import { useEffect, useRef, useState } from 'react';

export function useRevealOnScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(() => {
    if (typeof window === 'undefined') return true;
    if (typeof IntersectionObserver === 'undefined') return true;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  });

  useEffect(() => {
    if (revealed) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.01, rootMargin: '80px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [revealed]);

  return {
    ref,
    revealed,
    onFocusCapture: () => {
      if (!revealed) setRevealed(true);
    },
  };
}

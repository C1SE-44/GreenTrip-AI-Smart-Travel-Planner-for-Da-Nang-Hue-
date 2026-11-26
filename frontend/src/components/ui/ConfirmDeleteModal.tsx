// Lucian UX/UI Prompt #436 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#436
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import './ConfirmDeleteModal.css';

export interface ConfirmDeleteModalProps {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  role?: 'dialog' | 'alertdialog';
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export default function ConfirmDeleteModal({
  title,
  description,
  confirmLabel = 'Xóa',
  cancelLabel = 'Hủy',
  role = 'dialog',
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const titleId = `u436-t-${uid}`;
  const descId = `u436-p-${uid}`;
  const clipId = `u436-c-${uid}`;

  const [isDeletingAnim, setIsDeletingAnim] = useState(false);
  const [liveStatus, setLiveStatus] = useState('');
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const locked = busy || isDeletingAnim;

  useEffect(() => {
    mountedRef.current = true;
    cancelBtnRef.current?.focus({ preventScroll: true });
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (error && isDeletingAnim) {
      setIsDeletingAnim(false);
    }
  }, [error, isDeletingAnim]);

  const handleConfirmClick = () => {
    if (locked) return;
    setIsDeletingAnim(true);
    setLiveStatus('Đang xóa…');

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animDelayMs = reducedMotion ? 80 : 1150;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      Promise.resolve(onConfirm()).finally(() => {
        if (mountedRef.current) {
          setIsDeletingAnim(false);
        }
      });
    }, animDelayMs);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !locked) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key === 'Tab') {
      const active = document.activeElement;
      if (event.shiftKey && active === cancelBtnRef.current) {
        event.preventDefault();
        confirmBtnRef.current?.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === confirmBtnRef.current) {
        event.preventDefault();
        cancelBtnRef.current?.focus({ preventScroll: true });
      }
    }
  };

  return (
    <div
      className="u436-backdrop"
      onClick={() => {
        if (!locked) onCancel();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        className={`ux u436 ${isDeletingAnim ? 'is-del' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <section
          className="u436-d"
          role={role}
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          tabIndex={-1}
        >
          <div className="u436-ic" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <defs>
                <clipPath id={clipId}>
                  <rect x="-10" y="-30" width="52" height="40.5" />
                </clipPath>
              </defs>
              <g clipPath={`url(#${clipId})`}>
                <g className="doc">
                  <path d="M12.5 -1.5h5l3 3v8h-8z" />
                  <path d="M14.5 3.5h3.5M14.5 6h3.5" strokeWidth="1.2" />
                </g>
              </g>
              <g className="lid">
                <path d="M5.5 9.5h21" />
                <path d="M12.5 9V7a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 19.5 7v2" />
              </g>
              <g className="bd">
                <path d="M8 10.5l1.3 14.6a2.4 2.4 0 0 0 2.4 2.2h8.6a2.4 2.4 0 0 0 2.4-2.2L24 10.5" />
                <path d="M13.5 15v7.5M18.5 15v7.5" />
              </g>
            </svg>
          </div>
          <h2 id={titleId}>{title}</h2>
          <p id={descId} className="u436-desc">
            {description}
          </p>
          {error ? (
            <p className="u436-err" role="alert">
              {error}
            </p>
          ) : null}
          <div className="u436-bs">
            <button
              ref={cancelBtnRef}
              type="button"
              className="u436-no"
              disabled={locked}
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmBtnRef}
              type="button"
              className="u436-ok"
              disabled={locked}
              onClick={handleConfirmClick}
            >
              {confirmLabel}
            </button>
          </div>
        </section>
        <p className="u436-live" role="status">
          {liveStatus}
        </p>
      </div>
    </div>
  );
}

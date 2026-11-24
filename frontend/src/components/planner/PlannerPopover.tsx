import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Keep carousel menus outside the horizontal scroll container's clipping area. */
export default function PlannerPopover({ anchorId, children, onClose }: {
  anchorId: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 320, ready: false });
  useLayoutEffect(() => {
    const anchor = document.getElementById(anchorId);
    if (!anchor || !menu.current) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(224, window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const useAbove = below < 240 && above > below;
      const maxHeight = Math.max(80, useAbove ? above : below);
      const height = Math.min(menu.current?.scrollHeight || 320, maxHeight);
      setPosition({ left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), top: useAbove ? Math.max(8, rect.top - height - 8) : rect.bottom + 8, maxHeight, ready: true });
    };
    const dismiss = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); anchor.focus(); }
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [anchorId, onClose]);
  return createPortal(
    <div ref={menu} style={{ position: 'fixed', left: position.left, top: position.top, maxHeight: position.maxHeight, visibility: position.ready ? 'visible' : 'hidden', width: 'min(224px, calc(100vw - 16px))' }}
      className="z-[1000] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-1.5 text-[13px] text-neutral-800 shadow-xl auto-hide-scrollbar [&_button]:min-h-10 [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-inset [&_button]:focus-visible:ring-black"
      onClick={(event) => event.stopPropagation()}>{children}</div>, document.body,
  );
}

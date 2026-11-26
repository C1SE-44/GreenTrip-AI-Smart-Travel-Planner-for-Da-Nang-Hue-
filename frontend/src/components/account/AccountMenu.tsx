import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronUp, LogOut, UserRound } from 'lucide-react';
import type { UserProfile } from '@/services/auth';
import './AccountMenu.css';

interface AccountMenuProps {
  user: UserProfile | null;
  collapsed: boolean;
  onOpenProfile: () => void;
  onLogout: () => void;
}

export default function AccountMenu({ user, collapsed, onOpenProfile, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = 'account-menu-options';

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.avatar_url]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const closeAnd = (callback: () => void) => {
    setOpen(false);
    callback();
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative gt-acct-root ${open ? 'is-open' : ''}`.trim()}>
      <div
        id={menuId}
        role="menu"
        aria-label="Menu tài khoản"
        aria-hidden={!open}
        onKeyDown={handleMenuKeyDown}
        className={`gt-acct-pop absolute bottom-full z-50 mb-3 rounded-2xl border border-neutral-200/90 bg-white p-2 shadow-[0_12px_36px_rgba(28,25,23,0.14)] ${
          collapsed ? 'left-1 w-64' : 'inset-x-0'
        }`}
      >
        {user ? (
          <>
            <div className="border-b border-neutral-100 px-3 py-2.5 mb-1" style={{ '--item-idx': 0 } as CSSProperties}>
              <p className="truncate text-sm font-bold text-neutral-950">{user.full_name}</p>
              <p className="truncate text-xs text-neutral-600 mt-0.5">{user.email}</p>
            </div>
            <button
              type="button"
              role="menuitem"
              tabIndex={open ? 0 : -1}
              style={{ '--item-idx': 1 } as CSSProperties}
              onClick={() => closeAnd(onOpenProfile)}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100/80 hover:text-neutral-950 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <UserRound size={17} className="text-neutral-700 shrink-0" aria-hidden="true" />
              <span>Hồ sơ của tôi</span>
            </button>
            <div className="my-1 h-px bg-neutral-100" role="separator" style={{ '--item-idx': 2 } as CSSProperties} />
            <button
              type="button"
              role="menuitem"
              tabIndex={open ? 0 : -1}
              style={{ '--item-idx': 3 } as CSSProperties}
              onClick={() => closeAnd(onLogout)}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700"
            >
              <LogOut size={17} className="shrink-0" aria-hidden="true" />
              <span>Đăng xuất</span>
            </button>
          </>
        ) : (
          <Link
            to="/login"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            style={{ '--item-idx': 0 } as CSSProperties}
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center justify-center rounded-xl bg-emerald-800 hover:bg-emerald-900 px-3 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            Đăng nhập
          </Link>
        )}
      </div>

      <button
        ref={triggerRef}
        type="button"
        aria-label={user ? `Menu tài khoản của ${user.full_name}` : 'Mở menu tài khoản'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((previous) => !previous)}
        className="gt-acct-trigger flex min-h-11 w-full items-center rounded-xl px-1.5 py-1.5 text-left transition hover:bg-neutral-100/80 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
      >
        <span className="gt-acct-av relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-950 text-sm font-semibold text-white ring-1 ring-neutral-200 transition-shadow">
          {user?.avatar_url && !avatarFailed ? (
            <img
              src={user.avatar_url}
              alt=""
              width={40}
              height={40}
              className="h-full w-full object-cover"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            user?.full_name?.trim().charAt(0).toUpperCase() || 'G'
          )}
        </span>
        <span className={`min-w-0 flex-1 pl-2.5 transition-[max-width,opacity] ${collapsed ? 'max-w-0 overflow-hidden opacity-0' : 'opacity-100'}`}>
          <span className="block truncate text-sm font-semibold leading-5 text-neutral-950">
            {user?.full_name || 'Khách'}
          </span>
          <span className="block truncate text-xs leading-5 text-neutral-600">
            {user?.email || 'Đăng nhập để quản lý tài khoản'}
          </span>
        </span>
        {!collapsed && (
          <ChevronUp
            size={16}
            className={`ml-auto shrink-0 text-neutral-600 transition-transform ${open ? '' : 'rotate-180'}`}
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  );
}

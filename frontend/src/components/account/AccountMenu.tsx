import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronUp, LogOut, UserRound } from 'lucide-react';
import type { UserProfile } from '@/services/auth';

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

  return (
    <div ref={rootRef} className="relative">
      {open && (
        <div
          id={menuId}
          className={`absolute bottom-full z-50 mb-3 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl ${
            collapsed ? 'left-1 w-60' : 'inset-x-0'
          }`}
        >
          {user ? (
            <>
              <div className="border-b border-gray-100 px-3 py-2.5">
                <p className="truncate text-sm font-semibold text-neutral-900">{user.full_name}</p>
                <p className="truncate text-sm text-neutral-600">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => closeAnd(onOpenProfile)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800"
              >
                <UserRound size={18} aria-hidden="true" />
                Hồ sơ của tôi
              </button>
              <button
                type="button"
                onClick={() => closeAnd(onLogout)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
              >
                <LogOut size={18} aria-hidden="true" />
                Đăng xuất
              </button>
            </>
          ) : (
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center justify-center rounded-xl bg-neutral-900 px-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800"
            >
              Đăng nhập
            </Link>
          )}
        </div>
      )}

      <button
        ref={triggerRef}
        type="button"
        aria-label={user ? `Menu tài khoản của ${user.full_name}` : 'Mở menu tài khoản'}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((previous) => !previous)}
        className="flex min-h-11 w-full items-center rounded-xl py-1 text-left transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-900 text-sm font-semibold text-white">
          {user?.avatar_url && !avatarFailed ? (
            <img
              src={user.avatar_url}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            user?.full_name?.trim().charAt(0).toUpperCase() || 'G'
          )}
        </span>
        <span className={`min-w-0 flex-1 pl-2.5 transition-all ${collapsed ? 'max-w-0 overflow-hidden opacity-0' : 'opacity-100'}`}>
          <span className="block truncate text-sm font-medium leading-5 text-neutral-900">
            {user?.full_name || 'Khách'}
          </span>
          <span className="block truncate text-sm leading-5 text-neutral-600">
            {user?.email || 'Đăng nhập để quản lý tài khoản'}
          </span>
        </span>
        {!collapsed && <ChevronUp size={16} className={`ml-auto shrink-0 transition-transform ${open ? '' : 'rotate-180'}`} aria-hidden="true" />}
      </button>
    </div>
  );
}

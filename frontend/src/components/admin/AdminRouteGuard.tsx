import { type ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, ShieldAlert } from 'lucide-react';
import { getMe } from '@/services/auth';
import {
  type AdminGuardState,
  type AuthenticatedAdminUser,
  resolveAdminGuardState,
} from '@/types/auth';

interface AdminRouteGuardProps {
  children: (adminUser: AuthenticatedAdminUser) => ReactNode;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled AdminGuardState variant: ${String(value)}`);
}

export default function AdminRouteGuard({ children }: AdminRouteGuardProps) {
  const navigate = useNavigate();
  const [guardState, setGuardState] = useState<AdminGuardState>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    async function verifyAdminSession(): Promise<void> {
      setGuardState({ status: 'loading' });
      try {
        const user = await getMe();
        if (!active) return;
        setGuardState(resolveAdminGuardState(user));
      } catch {
        if (!active) return;
        setGuardState({ status: 'unauthenticated' });
      }
    }

    void verifyAdminSession();

    const handleAuthChange = () => {
      void verifyAdminSession();
    };
    window.addEventListener('auth-change', handleAuthChange);
    return () => {
      active = false;
      window.removeEventListener('auth-change', handleAuthChange);
    };
  }, []);

  switch (guardState.status) {
    case 'loading':
      return (
        <main className="min-h-screen bg-neutral-50 px-4 py-12">
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="h-10 w-64 animate-pulse rounded-xl bg-neutral-200" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((idx) => (
                <div key={idx} className="h-24 animate-pulse rounded-2xl bg-white p-5 shadow-sm" />
              ))}
            </div>
            <div className="h-72 animate-pulse rounded-2xl bg-white shadow-sm" />
          </div>
        </main>
      );

    case 'unauthenticated':
      return (
        <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
          <section
            aria-labelledby="admin-auth-title"
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm sm:p-8"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-800">
              <Lock className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
              HTTP 401 • Yêu cầu xác thực
            </p>
            <h1 id="admin-auth-title" className="mt-2 text-xl font-bold text-neutral-900">
              Cổng quản trị GreenTrip AI
            </h1>
            <p className="mt-2 text-sm text-neutral-600">
              Vui lòng đăng nhập bằng tài khoản Quản trị viên (`ADMIN`) để truy cập trang quản lý dữ liệu.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => navigate('/login', { state: { returnTo: '/admin' } })}
                className="min-h-[44px] rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                Đăng nhập Quản trị viên
              </button>
              <Link
                to="/"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800"
              >
                Quay về Trang chủ
              </Link>
            </div>
          </section>
        </main>
      );

    case 'forbidden':
      return (
        <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
          <section
            role="alert"
            aria-labelledby="admin-forbidden-title"
            className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm sm:p-8"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-700">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">
              HTTP 403 Forbidden • Từ chối truy cập RBAC
            </p>
            <h1 id="admin-forbidden-title" className="mt-2 text-xl font-bold text-neutral-900">
              Bạn không có quyền truy cập trang Quản trị
            </h1>
            <p className="mt-2 text-sm text-neutral-600">
              Tài khoản <strong className="text-neutral-900">{guardState.email}</strong> hiện đang có vai trò{' '}
              <span className="inline-block rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-xs font-semibold text-neutral-800">
                {guardState.role}
              </span>
              . Khu vực `/admin` chỉ cho phép tài khoản có vai trò{' '}
              <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-800">
                ADMIN
              </span>{' '}
              và được xác minh hai lớp ở Backend.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                to="/explore"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
              >
                Quay về Khám phá
              </Link>
              <Link
                to="/"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800"
              >
                Trang chủ
              </Link>
            </div>
          </section>
        </main>
      );

    case 'authorized':
      return <>{children(guardState.user)}</>;

    default:
      return assertNever(guardState);
  }
}

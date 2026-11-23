import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  ClipboardList,
  Compass,
  Eye,
  EyeOff,
  Pencil,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import PoiImage from '@/components/ui/PoiImage';
import { normalizeCategory, normalizeCity } from '@/data/pois';
import {
  type AdminOverview,
  type AdminPoiItem,
  type AdminPoiStatusFilter,
  getAdminOverview,
  getAdminPois,
  patchAdminPoi,
} from '@/services/adminService';
import type { AuthenticatedAdminUser } from '@/types/auth';

const ADMIN_STATUS_FILTERS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'active', label: 'Đang hiển thị' },
  { value: 'inactive', label: 'Đang tạm ẩn' },
] as const satisfies readonly { value: AdminPoiStatusFilter; label: string }[];

const ADMIN_CITY_FILTERS = [
  { value: 'all', label: 'Đà Nẵng & Huế' },
  { value: 'Đà Nẵng', label: 'Đà Nẵng' },
  { value: 'Huế', label: 'Huế' },
] as const satisfies readonly { value: string; label: string }[];

interface AdminDashboardPageProps {
  adminUser: AuthenticatedAdminUser;
}

interface EditingPoiState {
  poi: AdminPoiItem;
  costInput: string;
  greenPercentInput: string;
}

export default function AdminDashboardPage({ adminUser }: AdminDashboardPageProps) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [pois, setPois] = useState<AdminPoiItem[]>([]);
  const [totalPois, setTotalPois] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [searchInput, setSearchInput] = useState<string>('');
  const [appliedSearch, setAppliedSearch] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<AdminPoiStatusFilter>('all');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyPoiId, setBusyPoiId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingPoiState | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [overviewRes, poiListRes] = await Promise.all([
        getAdminOverview(),
        getAdminPois({
          q: appliedSearch,
          city: cityFilter,
          status_filter: statusFilter,
          page,
          limit: 12,
        }),
      ]);
      setOverview(overviewRes);
      setPois(poiListRes.items);
      setTotalPois(poiListRes.total);
      setTotalPages(Math.max(1, poiListRes.total_pages));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể tải dữ liệu quản trị.');
    } finally {
      setIsLoading(false);
    }
  }, [appliedSearch, cityFilter, page, statusFilter]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === message ? null : prev));
    }, 3500);
  };

  const handleToggleActive = async (poi: AdminPoiItem) => {
    setBusyPoiId(poi.poi_id);
    setErrorMessage(null);
    try {
      const updated = await patchAdminPoi(poi.poi_id, { is_active: !poi.is_active });
      showToast(`${updated.message} (Mã audit: ${updated.audit_id.slice(0, 8)})`);
      await loadDashboard();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái địa điểm.');
    } finally {
      setBusyPoiId(null);
    }
  };

  const openEditModal = (poi: AdminPoiItem) => {
    setEditing({
      poi,
      costInput: poi.estimated_cost !== null ? String(Math.round(poi.estimated_cost)) : '0',
      greenPercentInput:
        poi.green_score !== null
          ? String(Math.round(poi.green_score <= 1 ? poi.green_score * 100 : poi.green_score))
          : '80',
    });
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;

    const cost = Number(editing.costInput);
    const greenPercent = Number(editing.greenPercentInput);
    if (!Number.isFinite(cost) || cost < 0) {
      setErrorMessage('Chi phí ước tính phải là số không âm.');
      return;
    }
    if (!Number.isFinite(greenPercent) || greenPercent < 0 || greenPercent > 100) {
      setErrorMessage('Điểm xanh phải nằm trong khoảng 0 đến 100%.');
      return;
    }

    setBusyPoiId(editing.poi.poi_id);
    setErrorMessage(null);
    try {
      const res = await patchAdminPoi(editing.poi.poi_id, {
        estimated_cost: cost,
        green_score: Math.round(greenPercent) / 100,
      });
      setEditing(null);
      showToast(`${res.message} (Mã audit: ${res.audit_id.slice(0, 8)})`);
      await loadDashboard();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể lưu thay đổi địa điểm.');
    } finally {
      setBusyPoiId(null);
    }
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(searchInput);
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-neutral-900">Cổng Quản Trị GreenTrip AI</h1>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  RBAC: {adminUser.role}
                </span>
              </div>
              <p className="text-xs text-neutral-600">Quản trị viên: {adminUser.email}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Làm mới
            </button>
            <Link
              to="/demo-qr"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <QrCode className="h-4 w-4" aria-hidden="true" />
              Mã QR Demo
            </Link>
            <Link
              to="/explore"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            >
              <Compass className="h-4 w-4" aria-hidden="true" />
              Trang Khám phá
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {toastMessage && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>{toastMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="min-h-[36px] rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
            >
              Thử lại
            </button>
          </div>
        )}

        <section aria-label="Thống kê tổng quan" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Tổng địa điểm</p>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              {overview ? overview.total_pois : '—'}
            </p>
            <p className="mt-1 text-xs text-neutral-600">Đà Nẵng & Huế trên Supabase</p>
          </article>
          <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Đang hiển thị</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">
              {overview ? overview.active_pois : '—'}
            </p>
            <p className="mt-1 text-xs text-neutral-600">Đang tạm ẩn: {overview ? overview.inactive_pois : 0}</p>
          </article>
          <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Tài khoản hệ thống</p>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              {overview ? overview.total_users : '—'}
            </p>
            <p className="mt-1 text-xs text-neutral-600">Quản trị viên (ADMIN): {overview ? overview.admin_users : 0}</p>
          </article>
          <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Lịch trình đã lưu</p>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              {overview ? overview.total_itineraries : '—'}
            </p>
            <p className="mt-1 text-xs text-neutral-600">Đồng bộ bảng itineraries</p>
          </article>
        </section>

        <section
          aria-labelledby="admin-poi-heading"
          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6"
        >
          <div className="flex flex-col gap-4 border-b border-neutral-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 id="admin-poi-heading" className="text-base font-bold text-neutral-900">
                Quản lý Kho Địa điểm ({totalPois})
              </h2>
              <p className="text-xs text-neutral-600">
                Mọi chỉnh sửa đều ghi vết vào bảng kiểm toán `admin_audit_logs` trong cùng một transaction.
              </p>
            </div>

            <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:min-w-[220px]">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Tìm tên địa điểm hoặc địa chỉ..."
                  aria-label="Tìm tên địa điểm hoặc địa chỉ"
                  className="min-h-[40px] w-full rounded-xl border border-neutral-300 bg-white pl-9 pr-3 text-sm text-neutral-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                />
              </div>

              <select
                aria-label="Lọc theo thành phố"
                value={cityFilter}
                onChange={(e) => {
                  setPage(1);
                  setCityFilter(e.target.value);
                }}
                className="min-h-[40px] rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
              >
                {ADMIN_CITY_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <select
                aria-label="Lọc theo trạng thái hiển thị"
                value={statusFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'all' || val === 'active' || val === 'inactive') {
                    setPage(1);
                    setStatusFilter(val);
                  }
                }}
                className="min-h-[40px] rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
              >
                {ADMIN_STATUS_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                className="min-h-[40px] rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                Tìm
              </button>
            </form>
          </div>

          {isLoading ? (
            <div className="space-y-3 py-6">
              {[0, 1, 2, 3].map((rowIdx) => (
                <div key={rowIdx} className="h-16 animate-pulse rounded-xl bg-neutral-100" />
              ))}
            </div>
          ) : pois.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-neutral-700">Không tìm thấy địa điểm nào khớp bộ lọc.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setAppliedSearch('');
                  setCityFilter('all');
                  setStatusFilter('all');
                  setPage(1);
                }}
                className="mt-3 min-h-[40px] rounded-xl border border-neutral-300 px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Xóa bộ lọc
              </button>
            </div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {pois.map((poi) => {
                const greenPct =
                  poi.green_score !== null
                    ? Math.round(poi.green_score <= 1 ? poi.green_score * 100 : poi.green_score)
                    : 0;
                const isBusy = busyPoiId === poi.poi_id;
                return (
                  <div
                    key={poi.poi_id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <PoiImage
                        src={poi.image_url || undefined}
                        poiId={poi.poi_id}
                        poiName={poi.name}
                        category={normalizeCategory(poi.category)}
                        city={normalizeCity(poi.city)}
                        alt={poi.name}
                        className="h-14 w-16 shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-neutral-900">{poi.name}</h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              poi.is_active
                                ? 'bg-emerald-50 text-emerald-800'
                                : 'bg-neutral-200 text-neutral-700'
                            }`}
                          >
                            {poi.is_active ? 'Đang hiển thị' : 'Đang ẩn'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-600">
                          {poi.city} • {poi.category} • Giá ~{' '}
                          {poi.estimated_cost !== null
                            ? `${Math.round(poi.estimated_cost).toLocaleString('vi-VN')} ₫`
                            : 'Miễn phí'}{' '}
                          • Điểm xanh {greenPct}/100
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => openEditModal(poi)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Chỉnh sửa
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleActive(poi)}
                        className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white disabled:opacity-50 ${
                          poi.is_active
                            ? 'bg-neutral-800 hover:bg-neutral-900'
                            : 'bg-emerald-700 hover:bg-emerald-800'
                        }`}
                      >
                        {poi.is_active ? (
                          <>
                            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                            Tạm ẩn
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            Hiển thị lại
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-neutral-200 pt-4 text-xs text-neutral-600">
              <span>
                Trang {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-[36px] rounded-lg border border-neutral-300 px-3 font-medium text-neutral-800 disabled:opacity-40"
                >
                  Trước
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-[36px] rounded-lg border border-neutral-300 px-3 font-medium text-neutral-800 disabled:opacity-40"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </section>

        <section
          aria-labelledby="admin-audit-heading"
          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6"
        >
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-emerald-700" aria-hidden="true" />
            <h2 id="admin-audit-heading" className="text-base font-bold text-neutral-900">
              Nhật ký Kiểm toán Gần đây (`admin_audit_logs`)
            </h2>
          </div>

          {!overview || overview.recent_audit_logs.length === 0 ? (
            <p className="text-sm text-neutral-600">Chưa có thao tác chỉnh sửa nào được ghi nhận.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 text-xs">
              {overview.recent_audit_logs.map((log) => (
                <li key={log.audit_id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="font-semibold text-neutral-900">{log.action}</span>{' '}
                    <span className="text-neutral-600">
                      bởi {log.admin_email || log.admin_user_id} • {log.target_table} ({log.target_id.slice(0, 8)}...)
                    </span>
                    <p className="mt-0.5 font-mono text-xs text-neutral-600">
                      {JSON.stringify(log.changes_json)}
                    </p>
                  </div>
                  <time className="shrink-0 text-neutral-600">{log.created_at}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-poi-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        >
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 id="edit-poi-title" className="text-base font-bold text-neutral-900">
              Cập nhật địa điểm: {editing.poi.name}
            </h3>
            <div className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-neutral-800">
                Chi phí ước tính (VNĐ)
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={editing.costInput}
                  onChange={(e) => setEditing({ ...editing, costInput: e.target.value })}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-neutral-300 px-3 text-sm text-neutral-900"
                />
              </label>

              <label className="block text-sm font-medium text-neutral-800">
                Điểm xanh (%) — từ 0 đến 100
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={editing.greenPercentInput}
                  onChange={(e) => setEditing({ ...editing, greenPercentInput: e.target.value })}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-neutral-300 px-3 text-sm text-neutral-900"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="min-h-[40px] rounded-xl border border-neutral-300 px-4 text-sm font-medium text-neutral-800"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={busyPoiId === editing.poi.poi_id}
                className="min-h-[40px] rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                Lưu & Ghi Audit
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

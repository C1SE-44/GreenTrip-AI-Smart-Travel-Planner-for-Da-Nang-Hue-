import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  Activity,
  AlertTriangle,
  Check,
  Compass,
  Copy,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import Logo from '@/components/ui/Logo';
import { API_BASE_URL } from '@/lib/api';
import {
  DEMO_QR_PRESETS,
  type DemoQrPresetId,
  buildDemoQrUrl,
  normalizePublicBaseUrl,
} from '@/utils/demoQr';

type HealthStatus =
  | { state: 'loading' }
  | { state: 'ok'; latencyMs: number; service: string }
  | { state: 'error'; message: string };

interface QrRenderState {
  status: 'loading' | 'ready' | 'error';
  dataUrl: string;
  error: string | null;
}

const COMMITTEE_STEPS = [
  {
    step: '01',
    title: 'Quét mã QR bằng Camera điện thoại',
    detail: 'Mở ứng dụng Camera mặc định trên iOS hoặc Android để truy cập trực tiếp không cần cài app.',
  },
  {
    step: '02',
    title: 'Khám phá & lọc địa điểm xanh',
    detail: 'Trải nghiệm bản đồ Đà Nẵng - Huế, trọng số ưu tiên bền vững và tốc độ phản hồi Redis Cache.',
  },
  {
    step: '03',
    title: 'Lập lịch AI & ứng phó ngày mưa',
    detail: 'Tạo lịch trình nhanh, trò chuyện AI Copilot, tối ưu tuyến đường và bật chuyển đổi ngày mưa.',
  },
  {
    step: '04',
    title: 'Kiểm chứng phân quyền RBAC (/admin)',
    detail: 'Thử mở đường dẫn /admin trên máy khách để xác minh lớp chặn 401/403 trước khi cấp quyền.',
  },
] as const;

export default function DemoQrPage() {
  const defaultOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://greentrip.vn';

  const [baseUrlInput, setBaseUrlInput] = useState<string>(defaultOrigin);
  const [selectedPreset, setSelectedPreset] = useState<DemoQrPresetId>('landing');
  const [qrState, setQrState] = useState<QrRenderState>({
    status: 'loading',
    dataUrl: '',
    error: null,
  });
  const [qrRetryCount, setQrRetryCount] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [health, setHealth] = useState<HealthStatus>({ state: 'loading' });

  const copyTimerRef = useRef<number | null>(null);

  const normalizedBase = normalizePublicBaseUrl(baseUrlInput, defaultOrigin);
  const activePreset =
    DEMO_QR_PRESETS.find((preset) => preset.id === selectedPreset) ?? DEMO_QR_PRESETS[0];
  const targetUrl = buildDemoQrUrl(normalizedBase.url, activePreset.path);

  const checkBackendHealth = useCallback(async () => {
    setHealth({ state: 'loading' });
    const startedAt = performance.now();
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        headers: { Accept: 'application/json' },
      });
      const elapsedMs = Math.max(1, Math.round(performance.now() - startedAt));
      if (!response.ok) {
        setHealth({
          state: 'error',
          message: `API phản hồi mã HTTP ${response.status}`,
        });
        return;
      }
      const payload = (await response.json()) as { service?: unknown };
      const serviceName =
        typeof payload.service === 'string' && payload.service.trim()
          ? payload.service
          : 'greentrip-api';
      setHealth({ state: 'ok', latencyMs: elapsedMs, service: serviceName });
    } catch {
      setHealth({
        state: 'error',
        message: 'Không kết nối được tới API /health. Hãy kiểm tra Backend đang chạy.',
      });
    }
  }, []);

  useEffect(() => {
    void checkBackendHealth();
  }, [checkBackendHealth]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    setQrState((prev) => ({ ...prev, status: 'loading', error: null }));

    QRCode.toDataURL(targetUrl, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0E3D29',
        light: '#FFFFFF',
      },
    })
      .then((dataUrl: string) => {
        if (!active) return;
        setQrState({ status: 'ready', dataUrl, error: null });
      })
      .catch(() => {
        if (!active) return;
        setQrState({
          status: 'error',
          dataUrl: '',
          error: 'Không thể khởi tạo ảnh mã QR cho liên kết này.',
        });
      });

    return () => {
      active = false;
    };
  }, [targetUrl, qrRetryCount]);

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      // Browser may deny fullscreen if triggered outside direct gesture.
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2500);
    } catch {
      setCopied(false);
    }
  };

  const handleDownloadQr = () => {
    if (!qrState.dataUrl) return;
    const anchor = document.createElement('a');
    anchor.href = qrState.dataUrl;
    anchor.download = `greentrip-demo-qr-${activePreset.id}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleDomainFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizedBase.error) {
      setBaseUrlInput(normalizedBase.url);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              aria-label="Về trang chủ GreenTrip"
              className="rounded-xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <Logo size="md" />
            </Link>
            <span className="hidden h-5 w-px bg-neutral-200 sm:inline-block" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
              <QrCode className="h-3.5 w-3.5 text-emerald-800" aria-hidden="true" />
              Trình chiếu Hội đồng
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/explore"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <Compass className="h-4 w-4" aria-hidden="true" />
              Mở Khám phá
            </Link>
            <button
              type="button"
              onClick={() => void handleToggleFullscreen()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="h-4 w-4" aria-hidden="true" />
                  Thoát trình chiếu
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  Chế độ Trình chiếu
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-neutral-950 sm:text-3xl">
              Quét Mã QR Trải Nghiệm Trực Tiếp GreenTrip AI
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-neutral-600 leading-relaxed">
              Mời Quý Thầy/Cô trong Hội đồng hướng camera điện thoại vào mã QR bên dưới để kiểm
              chứng sản phẩm thực tế Đà Nẵng – Huế ngay trên thiết bị cá nhân.
            </p>
          </div>

          <div className="shrink-0">
            {health.state === 'loading' && (
              <div
                role="status"
                aria-label="Đang kiểm tra trạng thái máy chủ API"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-xs font-medium text-neutral-600 shadow-soft"
              >
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-neutral-400" />
                <span>Đang kiểm tra kết nối máy chủ...</span>
              </div>
            )}

            {health.state === 'ok' && (
              <div
                role="status"
                className="inline-flex min-h-[44px] items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-900 shadow-soft"
              >
                <Activity className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
                <span>
                  API Live ({health.service}) · {health.latencyMs} ms ·{' '}
                  {normalizedBase.isHttps ? 'HTTPS TLS' : 'HTTP'}
                </span>
              </div>
            )}

            {health.state === 'error' && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-900 shadow-soft"
              >
                <span>{health.message}</span>
                <button
                  type="button"
                  onClick={() => void checkBackendHealth()}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-rose-700 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Thử kiểm tra lại
                </button>
              </div>
            )}
          </div>
        </div>

        {normalizedBase.isLocalhost ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-soft"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-bold text-amber-950">
                Cảnh báo: Đang dùng địa chỉ nội bộ ({normalizedBase.url})
              </p>
              <p className="text-xs leading-relaxed text-amber-900">
                Địa chỉ localhost hoặc 127.0.0.1 chỉ mở được trên chính laptop trình chiếu. Trước
                khi mời Hội đồng quét mã QR, hãy nhập tên miền HTTPS trên VPS (ví dụ{' '}
                <code className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold">
                  https://greentrip.vn
                </code>
                ) hoặc IP LAN nội bộ (ví dụ{' '}
                <code className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold">
                  http://192.168.1.x:5173
                </code>
                ) ở khung bên phải.
              </p>
            </div>
          </div>
        ) : (
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 shadow-soft"
          >
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-800" aria-hidden="true" />
            <div className="space-y-0.5">
              <p className="font-bold text-emerald-950">
                {normalizedBase.isHttps
                  ? 'HTTPS sẵn sàng — Điện thoại Hội đồng quét mã có thể truy cập trực tiếp!'
                  : 'Địa chỉ mạng ngoài localhost đã sẵn sàng — Kiểm tra điện thoại cùng mạng Wi-Fi trước khi quét.'}
              </p>
              <p className="text-xs text-emerald-900">
                Đích đến hiện tại: <span className="font-semibold">{targetUrl}</span>
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-12">
          <section
            aria-label="Mã QR trình chiếu"
            className="min-w-0 flex flex-col items-center justify-between rounded-3xl border border-neutral-200 bg-white p-5 text-center shadow-card sm:p-8 lg:col-span-5"
          >
            <div className="w-full space-y-1">
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                {activePreset.badge}
              </span>
              <h2 className="pt-1 font-heading text-lg font-bold text-neutral-950">
                {activePreset.label}
              </h2>
              <p className="text-xs text-neutral-600">{activePreset.description}</p>
            </div>

            <div className="my-6 flex aspect-square w-full max-w-[280px] items-center justify-center rounded-3xl border border-neutral-200 bg-white p-4 shadow-soft sm:h-[312px] sm:w-[312px] sm:max-w-none">
              {qrState.status === 'loading' && (
                <div
                  aria-label="Đang tạo mã QR"
                  className="h-full w-full animate-pulse rounded-2xl bg-neutral-100"
                />
              )}

              {qrState.status === 'ready' && (
                <img
                  src={qrState.dataUrl}
                  alt={`Mã QR truy cập ${targetUrl}`}
                  className="h-full w-full rounded-xl object-contain"
                />
              )}

              {qrState.status === 'error' && (
                <div className="space-y-3 px-4 text-center">
                  <p className="text-xs font-medium text-rose-800">{qrState.error}</p>
                  <button
                    type="button"
                    onClick={() => setQrRetryCount((count) => count + 1)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Tạo lại mã QR
                  </button>
                </div>
              )}
            </div>

            <div className="w-full space-y-3">
              <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs font-semibold text-neutral-900 transition hover:border-emerald-700 hover:bg-emerald-50/40 break-all"
              >
                <span>{targetUrl}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-600" aria-hidden="true" />
              </a>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleCopyUrl()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                      <span>Đã sao chép!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      <span>Sao chép liên kết</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadQr}
                  disabled={qrState.status !== 'ready'}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>Tải mã QR (PNG)</span>
                </button>
              </div>
            </div>
          </section>

          <section
            aria-label="Cấu hình URL & Kịch bản Hội đồng"
            className="min-w-0 flex flex-col justify-between gap-6 rounded-3xl border border-neutral-200 bg-white p-5 shadow-card sm:p-8 lg:col-span-7"
          >
            <div className="space-y-6">
              <form onSubmit={handleDomainFormSubmit} className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="demo-qr-base-url"
                    className="text-sm font-bold text-neutral-950"
                  >
                    1. Tên miền Public / Địa chỉ VPS (tạo mã QR live)
                  </label>
                  <button
                    type="button"
                    onClick={() => setBaseUrlInput(defaultOrigin)}
                    className="min-h-[36px] rounded-lg px-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    Dùng URL hiện tại
                  </button>
                </div>

                <input
                  id="demo-qr-base-url"
                  type="text"
                  value={baseUrlInput}
                  onChange={(event) => setBaseUrlInput(event.target.value)}
                  aria-describedby="demo-qr-base-url-help"
                  placeholder="Ví dụ: https://greentrip.vn hoặc http://192.168.1.15:5173"
                  className="min-h-[44px] w-full rounded-2xl border border-neutral-300 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-500 focus:border-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                />

                <p
                  id="demo-qr-base-url-help"
                  className={`text-xs ${
                    normalizedBase.error ? 'font-semibold text-rose-700' : 'text-neutral-600'
                  }`}
                >
                  {normalizedBase.error
                    ? normalizedBase.error
                    : 'Nhập domain không cần gõ https:// cũng được (hệ thống tự chuẩn hóa sang https:// khi không phải localhost/LAN).'}
                </p>
              </form>

              <div className="space-y-2.5">
                <p className="text-sm font-bold text-neutral-950">
                  2. Chọn màn hình muốn Hội đồng mở trực tiếp
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {DEMO_QR_PRESETS.map((preset) => {
                    const active = selectedPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedPreset(preset.id)}
                        className={`flex min-h-[56px] flex-col items-start justify-center rounded-2xl border px-4 py-3 text-left transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                          active
                            ? 'border-emerald-800 bg-emerald-800 text-white shadow-soft'
                            : 'border-neutral-200 bg-neutral-50 text-neutral-900 hover:border-neutral-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="text-sm font-bold">{preset.label}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              active
                                ? 'bg-white/20 text-white'
                                : 'bg-white text-neutral-700 border border-neutral-200'
                            }`}
                          >
                            {preset.path}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 sm:p-5">
              <h3 className="text-sm font-bold text-neutral-950">
                3. Kịch bản trải nghiệm 60 giây dành cho Hội đồng
              </h3>
              <ol className="mt-3 grid gap-3 sm:grid-cols-2">
                {COMMITTEE_STEPS.map((item) => (
                  <li
                    key={item.step}
                    className="rounded-xl border border-neutral-200/80 bg-white p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-xs font-bold text-white">
                        {item.step}
                      </span>
                      <span className="text-xs font-bold text-neutral-900">{item.title}</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">{item.detail}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

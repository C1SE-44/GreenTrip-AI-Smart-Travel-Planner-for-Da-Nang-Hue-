export type DemoQrPresetId = 'landing' | 'explore' | 'planner' | 'admin';

export interface DemoQrPreset {
  id: DemoQrPresetId;
  label: string;
  path: string;
  description: string;
  badge: string;
}

export const DEMO_QR_PRESETS = [
  {
    id: 'landing',
    label: 'Trang chủ & Tạo lịch nhanh',
    path: '/',
    description: 'Mở thẳng màn hình giới thiệu và khung tạo nhanh hành trình Đà Nẵng - Huế.',
    badge: 'Điểm vào chính',
  },
  {
    id: 'explore',
    label: 'Bản đồ 642 địa điểm & lưu trú xanh',
    path: '/explore',
    description: 'Trải nghiệm 482 điểm tham quan/ẩm thực, 160 lưu trú xanh, lọc trọng số và bản đồ tương tác.',
    badge: 'Khám phá & Cache',
  },
  {
    id: 'planner',
    label: 'Lập lịch AI & Ngày mưa',
    path: '/planner',
    description: 'Kiểm thử AI Travel Copilot, tối ưu tuyến đường CO₂ và chuyển chế độ ngày mưa.',
    badge: 'Lõi AI & OR',
  },
  {
    id: 'admin',
    label: 'Kiểm thử bảo mật RBAC 401/403',
    path: '/admin',
    description: 'Hội đồng thử truy cập cổng quản trị trên điện thoại để kiểm chứng chặn RBAC.',
    badge: 'Bảo mật 2 lớp',
  },
] as const satisfies readonly DemoQrPreset[];

export interface NormalizedBaseUrlResult {
  url: string;
  error: string | null;
  isLocalhost: boolean;
  isHttps: boolean;
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
const PRIVATE_IPV4_RE = /^(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/;

export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname.trim().toLowerCase());
}

export function isPrivateIpv4(hostname: string): boolean {
  return PRIVATE_IPV4_RE.test(hostname.trim());
}

function classifyOrigin(origin: string): { isLocalhost: boolean; isHttps: boolean } {
  try {
    const parsed = new URL(origin);
    return {
      isLocalhost: isLocalHostname(parsed.hostname),
      isHttps: parsed.protocol === 'https:',
    };
  } catch {
    return { isLocalhost: true, isHttps: false };
  }
}

export function normalizePublicBaseUrl(
  rawInput: string,
  fallbackOrigin: string,
): NormalizedBaseUrlResult {
  const safeFallback = fallbackOrigin.trim().replace(/\/+$/, '') || 'http://127.0.0.1:5173';
  const trimmed = rawInput.trim();

  if (!trimmed) {
    const meta = classifyOrigin(safeFallback);
    return { url: safeFallback, error: null, ...meta };
  }

  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidate)) {
    const hostPart = candidate.split('/')[0]?.split(':')[0] ?? '';
    const useHttp = isLocalHostname(hostPart) || isPrivateIpv4(hostPart);
    candidate = `${useHttp ? 'http' : 'https'}://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      const meta = classifyOrigin(safeFallback);
      return {
        url: safeFallback,
        error: 'Chỉ hỗ trợ địa chỉ http:// hoặc https://.',
        ...meta,
      };
    }

    const hostname = parsed.hostname;
    if (!hostname || /\s/.test(hostname) || (!isLocalHostname(hostname) && !hostname.includes('.'))) {
      const meta = classifyOrigin(safeFallback);
      return {
        url: safeFallback,
        error: 'Tên miền chưa hợp lệ (ví dụ: https://greentrip.vn hoặc http://192.168.1.10:5173).',
        ...meta,
      };
    }

    const normalizedOrigin = parsed.origin.replace(/\/+$/, '');
    return {
      url: normalizedOrigin,
      error: null,
      isLocalhost: isLocalHostname(hostname),
      isHttps: parsed.protocol === 'https:',
    };
  } catch {
    const meta = classifyOrigin(safeFallback);
    return {
      url: safeFallback,
      error: 'URL không hợp lệ. Vui lòng kiểm tra lại định dạng (ví dụ: https://greentrip.vn).',
      ...meta,
    };
  }
}

export function buildDemoQrUrl(baseUrl: string, path: string): string {
  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${normalizedPath}`;
}

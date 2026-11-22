import { fetchJson } from '../lib/api';

export type AdminPoiStatusFilter = 'all' | 'active' | 'inactive';

export interface AdminAuditLogItem {
  audit_id: string;
  admin_user_id: string;
  admin_email: string | null;
  action: string;
  target_table: string;
  target_id: string;
  changes_json: Record<string, unknown>;
  created_at: string;
}

export interface AdminOverview {
  total_pois: number;
  active_pois: number;
  inactive_pois: number;
  total_users: number;
  admin_users: number;
  total_itineraries: number;
  recent_audit_logs: AdminAuditLogItem[];
}

export interface AdminPoiItem {
  poi_id: string;
  name: string;
  city: string;
  category: string;
  address: string | null;
  estimated_cost: number | null;
  green_score: number | null;
  is_active: boolean;
  image_url: string | null;
}

export interface AdminPoiListResponse {
  items: AdminPoiItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface AdminPoiPatchPayload {
  is_active?: boolean;
  estimated_cost?: number;
  green_score?: number;
}

export interface AdminPoiPatchResponse {
  poi: AdminPoiItem;
  audit_id: string;
  message: string;
}

export interface AdminPoiQueryParams {
  q?: string;
  city?: string;
  status_filter?: AdminPoiStatusFilter;
  page?: number;
  limit?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(obj: Record<string, unknown>, key: string): string {
  const val = obj[key];
  if (typeof val !== 'string') {
    throw new Error(`Dữ liệu quản trị không hợp lệ: thiếu chuỗi '${key}'.`);
  }
  return val;
}

function readNullableString(obj: Record<string, unknown>, key: string): string | null {
  const val = obj[key];
  if (val === undefined || val === null) return null;
  return typeof val === 'string' ? val : String(val);
}

function readInt(obj: Record<string, unknown>, key: string): number {
  const val = obj[key];
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new Error(`Dữ liệu quản trị không hợp lệ: thiếu số '${key}'.`);
  }
  return Math.trunc(val);
}

function readNullableNumber(obj: Record<string, unknown>, key: string): number | null {
  const val = obj[key];
  if (val === undefined || val === null) return null;
  if (typeof val !== 'number' || !Number.isFinite(val)) return null;
  return val;
}

function parseAuditLogItem(raw: unknown): AdminAuditLogItem {
  if (!isRecord(raw)) {
    throw new Error('Dữ liệu nhật ký kiểm toán không hợp lệ.');
  }
  const rawChanges = raw['changes_json'];
  return {
    audit_id: readString(raw, 'audit_id'),
    admin_user_id: readString(raw, 'admin_user_id'),
    admin_email: readNullableString(raw, 'admin_email'),
    action: readString(raw, 'action'),
    target_table: readString(raw, 'target_table'),
    target_id: readString(raw, 'target_id'),
    changes_json: isRecord(rawChanges) ? rawChanges : {},
    created_at: readString(raw, 'created_at'),
  };
}

export function parseAdminOverview(raw: unknown): AdminOverview {
  if (!isRecord(raw)) {
    throw new Error('Phản hồi tổng quan quản trị không hợp lệ.');
  }
  const rawLogs = raw['recent_audit_logs'];
  const logs = Array.isArray(rawLogs) ? rawLogs.map(parseAuditLogItem) : [];
  return {
    total_pois: readInt(raw, 'total_pois'),
    active_pois: readInt(raw, 'active_pois'),
    inactive_pois: readInt(raw, 'inactive_pois'),
    total_users: readInt(raw, 'total_users'),
    admin_users: readInt(raw, 'admin_users'),
    total_itineraries: readInt(raw, 'total_itineraries'),
    recent_audit_logs: logs,
  };
}

export function parseAdminPoiItem(raw: unknown): AdminPoiItem {
  if (!isRecord(raw)) {
    throw new Error('Dữ liệu địa điểm quản trị không hợp lệ.');
  }
  const rawActive = raw['is_active'];
  if (typeof rawActive !== 'boolean') {
    throw new Error("Dữ liệu địa điểm thiếu cờ boolean 'is_active'.");
  }
  return {
    poi_id: readString(raw, 'poi_id'),
    name: readString(raw, 'name'),
    city: readString(raw, 'city'),
    category: readString(raw, 'category'),
    address: readNullableString(raw, 'address'),
    estimated_cost: readNullableNumber(raw, 'estimated_cost'),
    green_score: readNullableNumber(raw, 'green_score'),
    is_active: rawActive,
    image_url: readNullableString(raw, 'image_url'),
  };
}

export function parseAdminPoiList(raw: unknown): AdminPoiListResponse {
  if (!isRecord(raw) || !Array.isArray(raw['items'])) {
    throw new Error('Danh sách địa điểm quản trị không hợp lệ.');
  }
  return {
    items: raw['items'].map(parseAdminPoiItem),
    total: readInt(raw, 'total'),
    page: readInt(raw, 'page'),
    limit: readInt(raw, 'limit'),
    total_pages: readInt(raw, 'total_pages'),
  };
}

export function parseAdminPoiPatchResponse(raw: unknown): AdminPoiPatchResponse {
  if (!isRecord(raw)) {
    throw new Error('Phản hồi cập nhật địa điểm không hợp lệ.');
  }
  return {
    poi: parseAdminPoiItem(raw['poi']),
    audit_id: readString(raw, 'audit_id'),
    message: readString(raw, 'message'),
  };
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const raw: unknown = await fetchJson<unknown>('/admin/overview');
  return parseAdminOverview(raw);
}

export async function getAdminPois(params: AdminPoiQueryParams = {}): Promise<AdminPoiListResponse> {
  const query = new URLSearchParams();
  if (params.q && params.q.trim()) query.set('q', params.q.trim());
  if (params.city && params.city !== 'all') query.set('city', params.city);
  if (params.status_filter && params.status_filter !== 'all') {
    query.set('status_filter', params.status_filter);
  }
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  const path = qs ? `/admin/pois?${qs}` : '/admin/pois';
  const raw: unknown = await fetchJson<unknown>(path);
  return parseAdminPoiList(raw);
}

export async function patchAdminPoi(
  poiId: string,
  payload: AdminPoiPatchPayload,
): Promise<AdminPoiPatchResponse> {
  const raw: unknown = await fetchJson<unknown>(`/admin/pois/${encodeURIComponent(poiId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseAdminPoiPatchResponse(raw);
}

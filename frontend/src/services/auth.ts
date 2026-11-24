import { API_BASE_URL } from '../lib/api';
import {
  type AuthenticatedUserProfile,
  type UserRole,
  normalizeUserRole,
} from '../types/auth';

export type { UserRole };
export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

function translateBackendAuthDetail(raw: string): string {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (lower.includes('invalid email or password')) {
    return 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.';
  }
  if (lower.includes('email is already registered')) {
    return 'Email này đã được đăng ký. Vui lòng chuyển sang đăng nhập.';
  }
  if (lower.includes('invalid email format')) {
    return 'Định dạng email không hợp lệ (ví dụ: ten@gmail.com).';
  }
  if (lower.includes('at least 8 characters')) {
    return 'Mật khẩu phải có ít nhất 8 ký tự.';
  }
  if (lower.includes('full name cannot be empty')) {
    return 'Vui lòng nhập họ và tên của bạn.';
  }
  if (lower.includes('invalid phone number format')) {
    return 'Số điện thoại không hợp lệ (gồm 9–15 chữ số).';
  }
  if (lower.includes('current password is incorrect')) {
    return 'Mật khẩu hiện tại không chính xác.';
  }
  return trimmed;
}

export function extractApiErrorMessage(errorData: unknown, fallback: string): string {
  if (!errorData || typeof errorData !== 'object') {
    return fallback;
  }
  const detail = (errorData as { detail?: unknown }).detail;
  if (typeof detail === 'string' && detail.trim()) {
    return translateBackendAuthDetail(detail);
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (first && typeof first === 'object' && 'msg' in first && typeof (first as { msg?: unknown }).msg === 'string') {
      return translateBackendAuthDetail((first as { msg: string }).msg);
    }
  }
  return fallback;
}

export function saveAuthSession(token: string): void {
  localStorage.setItem('access_token', token);
  sessionStorage.setItem('access_token', token);
  window.dispatchEvent(new Event('auth-change'));
}

export interface SignupPayload {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
}

export interface CheckEmailResponse {
  exists: boolean;
  email: string;
  status?: string | null;
}

export interface SignupResponse {
  message: string;
  user: {
    user_id: string;
    full_name: string;
    email: string;
    phone?: string | null;
    role: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
  require_otp?: boolean;
  otp_session_token?: string;
  access_token?: string;
  token_type?: string;
}

export async function checkEmail(email: string): Promise<CheckEmailResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/check-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMessage = extractApiErrorMessage(
      errorData,
      'Kiểm tra email thất bại. Vui lòng thử lại.'
    );
    throw new ApiError(errorMessage, response.status, errorMessage);
  }

  return response.json();
}

export interface VerifyEmailResponse {
  message: string;
  email: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export async function signup(payload: SignupPayload): Promise<SignupResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMessage = extractApiErrorMessage(
      errorData,
      'Đăng ký tài khoản thất bại. Vui lòng thử lại.'
    );
    throw new ApiError(errorMessage, response.status, errorMessage);
  }

  const data: SignupResponse = await response.json();
  if (data.access_token) {
    saveAuthSession(data.access_token);
  }
  return data;
}

export async function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/verify-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMessage = extractApiErrorMessage(
      errorData,
      'Liên kết xác nhận không hợp lệ hoặc đã hết hạn.'
    );
    throw new ApiError(errorMessage, response.status, errorMessage);
  }

  return response.json();
}

export async function resendVerification(email: string): Promise<VerifyEmailResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMessage = extractApiErrorMessage(
      errorData,
      'Không thể gửi lại email xác nhận.'
    );
    throw new ApiError(errorMessage, response.status, errorMessage);
  }

  return response.json();
}

export async function login(payload: LoginPayload): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMessage = extractApiErrorMessage(
      errorData,
      'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.'
    );
    throw new ApiError(errorMessage, response.status, errorMessage);
  }

  const data: TokenResponse = await response.json();
  if (data.access_token) {
    saveAuthSession(data.access_token);
  }
  return data;
}

export interface GoogleLoginResponse {
  require_otp?: boolean;
  email: string;
  otp_session_token?: string;
  access_token?: string;
  token_type?: string;
  user?: UserProfile;
  message: string;
}

export interface VerifyOtpPayload {
  email: string;
  otp_code: string;
  otp_session_token: string;
}

export interface ResendOtpPayload {
  email: string;
  otp_session_token: string;
}

export interface ResendOtpResponse {
  message: string;
  email: string;
}

export async function googleLogin(credential: string): Promise<GoogleLoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ credential }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMessage = extractApiErrorMessage(
      errorData,
      'Đăng nhập với Google thất bại. Vui lòng thử lại.'
    );
    throw new ApiError(errorMessage, response.status, errorMessage);
  }

  const data: GoogleLoginResponse = await response.json();
  if (data.access_token) {
    saveAuthSession(data.access_token);
  }
  return data;
}

export async function verifyOtp(payload: VerifyOtpPayload): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMessage = extractApiErrorMessage(
      errorData,
      'Xác thực mã OTP thất bại. Vui lòng thử lại.'
    );
    throw new ApiError(errorMessage, response.status, errorMessage);
  }

  const data: TokenResponse = await response.json();
  if (data.access_token) {
    saveAuthSession(data.access_token);
  }
  return data;
}

export async function resendOtp(payload: ResendOtpPayload): Promise<ResendOtpResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/resend-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMessage = extractApiErrorMessage(
      errorData,
      'Không thể gửi lại mã OTP lúc này.'
    );
    throw new ApiError(errorMessage, response.status, errorMessage);
  }

  return response.json();
}

export type UserProfile = AuthenticatedUserProfile;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseUserProfile(raw: unknown): UserProfile {
  if (!isRecord(raw) || typeof raw['user_id'] !== 'string' || typeof raw['email'] !== 'string') {
    throw new Error('Dữ liệu hồ sơ người dùng không hợp lệ.');
  }
  return {
    user_id: raw['user_id'],
    full_name: typeof raw['full_name'] === 'string' ? raw['full_name'] : raw['email'],
    email: raw['email'],
    phone: typeof raw['phone'] === 'string' ? raw['phone'] : null,
    role: normalizeUserRole(raw['role']),
    status: typeof raw['status'] === 'string' ? raw['status'] : 'ACTIVE',
    created_at: typeof raw['created_at'] === 'string' ? raw['created_at'] : '',
    updated_at: typeof raw['updated_at'] === 'string' ? raw['updated_at'] : '',
    avatar_url: typeof raw['avatar_url'] === 'string' ? raw['avatar_url'] : null,
    has_password: typeof raw['has_password'] === 'boolean' ? raw['has_password'] : null,
  };
}

export function getAccessToken(): string | null {
  return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
}

export function clearAuthSession(): void {
  localStorage.removeItem('access_token');
  sessionStorage.removeItem('access_token');
  window.dispatchEvent(new Event('auth-change'));
}

export async function getMe(): Promise<UserProfile> {
  const token = getAccessToken();
  if (!token) {
    throw new ApiError('Chưa đăng nhập', 401);
  }

  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    let errorMessage = 'Không thể tải thông tin người dùng.';
    if (errorData && typeof errorData.detail === 'string') {
      errorMessage = errorData.detail;
    }
    throw new ApiError(errorMessage, response.status, typeof errorData?.detail === 'string' ? errorData.detail : undefined);
  }

  const payload: unknown = await response.json();
  return parseUserProfile(payload);
}



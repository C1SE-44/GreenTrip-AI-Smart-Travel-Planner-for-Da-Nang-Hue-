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
    let errorMessage = 'Kiểm tra email thất bại. Vui lòng thử lại.';

    if (errorData && typeof errorData.detail === 'string') {
      errorMessage = errorData.detail;
    }

    throw new ApiError(errorMessage, response.status, typeof errorData?.detail === 'string' ? errorData.detail : undefined);
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
    let errorMessage = 'Đăng ký tài khoản thất bại. Vui lòng thử lại.';

    if (errorData && typeof errorData.detail === 'string') {
      errorMessage = errorData.detail;
    }

    throw new ApiError(errorMessage, response.status, typeof errorData?.detail === 'string' ? errorData.detail : undefined);
  }

  const data: SignupResponse = await response.json();
  if (data.access_token) {
    localStorage.setItem('access_token', data.access_token);
    sessionStorage.setItem('access_token', data.access_token);
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
    let errorMessage = 'Liên kết xác nhận không hợp lệ hoặc đã hết hạn.';

    if (errorData && typeof errorData.detail === 'string') {
      errorMessage = errorData.detail;
    }

    throw new ApiError(errorMessage, response.status, typeof errorData?.detail === 'string' ? errorData.detail : undefined);
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
    let errorMessage = 'Không thể gửi lại email xác nhận.';

    if (errorData && typeof errorData.detail === 'string') {
      errorMessage = errorData.detail;
    }

    throw new ApiError(errorMessage, response.status, typeof errorData?.detail === 'string' ? errorData.detail : undefined);
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
    let errorMessage = 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.';

    if (errorData && typeof errorData.detail === 'string') {
      errorMessage = errorData.detail;
    }

    throw new ApiError(errorMessage, response.status, typeof errorData?.detail === 'string' ? errorData.detail : undefined);
  }

  return response.json();
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
    let errorMessage = 'Đăng nhập với Google thất bại. Vui lòng thử lại.';

    if (errorData && typeof errorData.detail === 'string') {
      errorMessage = errorData.detail;
    }

    throw new ApiError(errorMessage, response.status, typeof errorData?.detail === 'string' ? errorData.detail : undefined);
  }

  const data: GoogleLoginResponse = await response.json();
  if (data.access_token) {
    localStorage.setItem('access_token', data.access_token);
    sessionStorage.setItem('access_token', data.access_token);
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
    let errorMessage = 'Xác thực mã OTP thất bại. Vui lòng thử lại.';

    if (errorData && typeof errorData.detail === 'string') {
      errorMessage = errorData.detail;
    }

    throw new ApiError(errorMessage, response.status, typeof errorData?.detail === 'string' ? errorData.detail : undefined);
  }

  return response.json();
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
    let errorMessage = 'Không thể gửi lại mã OTP lúc này.';

    if (errorData && typeof errorData.detail === 'string') {
      errorMessage = errorData.detail;
    }

    throw new ApiError(errorMessage, response.status, typeof errorData?.detail === 'string' ? errorData.detail : undefined);
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



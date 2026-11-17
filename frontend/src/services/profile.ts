import { API_BASE_URL } from '@/lib/api';
import { ApiError, getAccessToken, type UserProfile } from '@/services/auth';

export interface ProfileUpdate {
  full_name?: string;
  phone?: string | null;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

const profileApiErrorTranslations: Record<string, string> = {
  'Please sign in to update your profile.': 'Vui lòng đăng nhập để cập nhật hồ sơ.',
  'Provide at least one profile field to update.': 'Vui lòng nhập thông tin cần cập nhật.',
  'User profile not found.': 'Không tìm thấy hồ sơ người dùng.',
  'Unable to update profile right now.': 'Hiện chưa thể cập nhật hồ sơ. Vui lòng thử lại sau.',
  'User account not found.': 'Không tìm thấy tài khoản người dùng.',
  'Current password is incorrect.': 'Mật khẩu hiện tại không chính xác.',
  'This account uses Google sign-in and has no local password.': 'Tài khoản này đăng nhập bằng Google và chưa có mật khẩu riêng.',
  'Unable to change password right now.': 'Hiện chưa thể đổi mật khẩu. Vui lòng thử lại sau.',
  'Avatar storage is not configured or is unavailable.': 'Kho lưu trữ ảnh chưa được cấu hình hoặc hiện không khả dụng.',
  'Avatar storage denied access. Check the backend key and bucket configuration.': 'Máy chủ chưa có quyền truy cập kho ảnh. Vui lòng kiểm tra cấu hình Supabase.',
  'Avatar image exceeds the storage upload limit.': 'Ảnh vượt quá giới hạn dung lượng của kho lưu trữ.',
  'Avatar image must be 5 MB or smaller.': 'Ảnh đại diện phải có dung lượng tối đa 5 MB.',
  'Upload a JPG, PNG, or WebP image.': 'Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.',
  'The uploaded file is not a valid image of the selected type.': 'Tệp tải lên không phải ảnh hợp lệ theo định dạng đã chọn.',
  'Avatar support is not ready. Apply migration 014 first.': 'Chức năng ảnh đại diện chưa sẵn sàng. Vui lòng liên hệ quản trị viên.',
  'Avatar storage cannot create a private display URL.': 'Không thể tạo đường dẫn an toàn để hiển thị ảnh đại diện.',
  'Unable to update avatar right now.': 'Hiện chưa thể cập nhật ảnh đại diện. Vui lòng thử lại sau.',
};

function translateProfileApiError(detail: unknown, status: number): string {
  if (typeof detail === 'string' && profileApiErrorTranslations[detail]) {
    return profileApiErrorTranslations[detail];
  }
  if (status === 401) return 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 413) return 'Ảnh vượt quá giới hạn 5 MB.';
  if (status === 415) return 'Chỉ hỗ trợ ảnh định dạng JPG, PNG hoặc WebP.';
  if (status === 422) return 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường đã nhập.';
  if (status === 503) return 'Dịch vụ hồ sơ hiện không khả dụng. Vui lòng thử lại sau.';
  return 'Không thể cập nhật tài khoản lúc này. Vui lòng thử lại sau.';
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new ApiError('Vui lòng đăng nhập để cập nhật hồ sơ.', 401);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = translateProfileApiError(data?.detail, response.status);
    throw new ApiError(message, response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function updateProfile(payload: ProfileUpdate): Promise<UserProfile> {
  return request<UserProfile>('/auth/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function changePassword(payload: ChangePasswordPayload): Promise<void> {
  return request<void>('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function uploadAvatar(file: File): Promise<UserProfile> {
  return request<UserProfile>('/auth/me/avatar', {
    method: 'PUT',
    headers: { 'Content-Type': file.type, Accept: 'application/json' },
    body: file,
  });
}

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Camera, LogOut, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { UserProfile } from '@/services/auth';
import { updateProfile, uploadAvatar } from '@/services/profile';
import ChangePasswordForm from './ChangePasswordForm';

interface ProfileSettingsPageProps {
  user: UserProfile | null;
  loading: boolean;
  onBack: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onProfileUpdated: (user: UserProfile) => void;
}

const phonePattern = /^\+?[0-9]{9,15}$/;
const avatarTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxAvatarBytes = 5 * 1024 * 1024;

export default function ProfileSettingsPage({
  user,
  loading,
  onBack,
  onLogin,
  onLogout,
  onProfileUpdated,
}: ProfileSettingsPageProps) {
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name);
    setPhone(user.phone ?? '');
  }, [user]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (loading) {
    return (
      <main className="h-full min-w-0 flex-1 overflow-y-auto auto-hide-scrollbar bg-white px-5 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
        <div className="w-full animate-pulse" role="status" aria-label="Đang tải hồ sơ">
          <div className="h-8 w-56 rounded-lg bg-neutral-200" />
          <div className="mt-3 h-4 w-96 max-w-full rounded bg-neutral-100" />
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
            <div className="border-b border-neutral-100 pb-8 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
              <div className="h-6 w-36 rounded bg-neutral-200" />
              <div className="mt-6 flex items-center gap-5 lg:flex-col lg:items-start">
                <div className="h-32 w-32 rounded-full bg-neutral-200" />
                <div className="space-y-3">
                  <div className="h-5 w-40 rounded bg-neutral-200" />
                  <div className="h-4 w-48 rounded bg-neutral-100" />
                </div>
              </div>
              <div className="mt-5 h-11 w-44 rounded-xl bg-neutral-100" />
            </div>
            <div className="space-y-8">
              <div className="space-y-4 border-b border-neutral-100 pb-8">
                <div className="h-6 w-44 rounded bg-neutral-200" />
                <div className="h-14 w-full rounded-xl bg-neutral-100" />
                <div className="h-14 w-full rounded-xl bg-neutral-100" />
              </div>
              <div className="h-6 w-40 rounded bg-neutral-200" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="h-full min-w-0 flex-1 overflow-y-auto auto-hide-scrollbar bg-white px-5 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
        <header className="border-b border-neutral-200 pb-6">
          <h1 id="profile-settings-title" className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">Hồ sơ &amp; Cài đặt</h1>
          <p className="mt-2 text-sm text-neutral-700">Quản lý thông tin cá nhân và bảo mật tài khoản.</p>
        </header>
        <section className="py-8" aria-labelledby="profile-sign-in-heading">
          <h2 id="profile-sign-in-heading" className="text-lg font-semibold text-neutral-900">Đăng nhập để xem hồ sơ</h2>
          <p className="mt-2 text-sm text-neutral-700">Bạn cần đăng nhập để xem và cập nhật thông tin cá nhân.</p>
          <Button type="button" className="mt-5 min-h-11 rounded-full px-5" variant="dark" onClick={onLogin}>Đăng nhập</Button>
        </section>
      </main>
    );
  }

  const onSelectAvatar = (file?: File) => {
    setAvatarError(null);
    setAvatarSuccess(null);
    if (!file) return;
    if (!avatarTypes.includes(file.type)) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setAvatarError('Vui lòng chọn ảnh JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size > maxAvatarBytes) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setAvatarError('Ảnh phải có dung lượng tối đa 5 MB.');
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setSelectedFile(file);
  };

  const saveAvatar = async () => {
    if (!selectedFile) return;
    setAvatarBusy(true);
    setAvatarError(null);
    setAvatarSuccess(null);
    try {
      const updatedUser = await uploadAvatar(selectedFile);
      onProfileUpdated(updatedUser);
      setSelectedFile(null);
      setPreviewUrl(null);
      setAvatarSuccess('Ảnh đại diện đã được cập nhật.');
    } catch (requestError) {
      setAvatarError(requestError instanceof Error ? requestError.message : 'Không thể cập nhật ảnh đại diện.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setProfileSuccess(null);
    const normalizedName = fullName.trim();
    const normalizedPhone = phone.trim();
    if (!normalizedName || normalizedName.length > 100) {
      setError('Họ tên cần có từ 1 đến 100 ký tự.');
      return;
    }
    if (normalizedPhone && !phonePattern.test(normalizedPhone)) {
      setError('Số điện thoại cần có từ 9 đến 15 chữ số và có thể bắt đầu bằng dấu +.');
      return;
    }

    setProfileBusy(true);
    try {
      const updatedUser = await updateProfile({
        full_name: normalizedName,
        phone: normalizedPhone || null,
      });
      onProfileUpdated({ ...updatedUser, avatar_url: updatedUser.avatar_url ?? user.avatar_url ?? null });
      setFullName(updatedUser.full_name);
      setPhone(updatedUser.phone ?? '');
      setProfileSuccess('Thông tin hồ sơ đã được lưu.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể lưu thông tin hồ sơ.');
    } finally {
      setProfileBusy(false);
    }
  };

  const avatarSrc = previewUrl || user.avatar_url;
  const initials = user.full_name.trim().charAt(0).toUpperCase() || 'G';

  return (
    <main className="h-full min-w-0 flex-1 overflow-y-auto auto-hide-scrollbar bg-white" data-purpose="profile-page">
      <div className="w-full px-5 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-200 pb-6">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Quay lại Khám phá"
              className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <h1 id="profile-settings-title" className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">Hồ sơ &amp; Cài đặt</h1>
              <p id="profile-settings-description" className="mt-2 text-sm text-neutral-700">Quản lý thông tin cá nhân và bảo mật tài khoản.</p>
            </div>
          </div>
        </header>

        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] xl:gap-10">
          <aside className="border-b border-neutral-200 pb-8 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8" aria-labelledby="account-overview-heading">
            <h2 id="account-overview-heading" className="text-base font-semibold text-neutral-900">Tài khoản của bạn</h2>
            <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center lg:flex-col lg:items-start">
              <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-900 text-4xl font-semibold text-white ring-1 ring-neutral-200" aria-label="Xem trước ảnh đại diện">
                {avatarSrc ? <img src={avatarSrc} alt={`Ảnh đại diện của ${user.full_name}`} className="h-full w-full object-cover" /> : initials}
              </div>
              <div className="min-w-0">
                <h3 className="break-words text-lg font-semibold text-neutral-900">{user.full_name}</h3>
                <p className="mt-1 break-all text-sm text-neutral-600">{user.email}</p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Chọn ảnh đại diện"
              className="sr-only"
              onChange={(event) => onSelectAvatar(event.target.files?.[0])}
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="button" variant="ghostDark" className="min-h-11 rounded-full px-5" onClick={() => fileInputRef.current?.click()}>
                <Camera size={17} aria-hidden="true" />
                Chọn ảnh
              </Button>
              {selectedFile && <Button type="button" variant="dark" loading={avatarBusy} className="min-h-11 rounded-full px-5" onClick={saveAvatar}>{avatarBusy ? 'Đang tải ảnh...' : 'Tải ảnh lên'}</Button>}
            </div>
            <p className="mt-3 text-sm text-neutral-700">Ảnh JPG, PNG hoặc WebP. Dung lượng tối đa 5 MB.</p>
            {avatarError && <p role="alert" className="mt-2 text-sm text-red-700">{avatarError}</p>}
            {avatarSuccess && <p role="status" className="mt-2 text-sm font-medium text-emerald-800">{avatarSuccess}</p>}
          </aside>

          <div className="min-w-0 divide-y divide-neutral-200">
            <section aria-labelledby="personal-info-heading" className="pb-8">
              <h2 id="personal-info-heading" className="text-lg font-semibold text-neutral-900">Thông tin cá nhân</h2>
              <form className="mt-5 grid gap-x-5 gap-y-4 xl:grid-cols-2" onSubmit={saveProfile}>
                <Input
                  id="profile-full-name"
                  label="Họ và tên"
                  className="bg-white border-neutral-300 focus:ring-emerald-800 focus:border-emerald-800"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  maxLength={100}
                  required
                />
                <Input id="profile-email" label="Địa chỉ email" value={user.email} readOnly aria-readonly="true" className="cursor-not-allowed bg-neutral-100" />
                <div className="xl:col-span-2">
                  <Input
                    id="profile-phone"
                    label="Số điện thoại"
                    type="tel"
                    className="bg-white border-neutral-300 focus:ring-emerald-800 focus:border-emerald-800"
                    autoComplete="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    maxLength={20}
                    hint="Thêm mã quốc gia khi cần."
                  />
                </div>
                {error && <p role="alert" className="text-sm text-red-700 xl:col-span-2">{error}</p>}
                <div className="flex flex-wrap items-center gap-3 xl:col-span-2">
                  <Button type="submit" variant="dark" loading={profileBusy} className="min-h-11 rounded-full px-5">{profileBusy ? 'Đang lưu...' : 'Lưu thay đổi'}</Button>
                  {profileSuccess && <p role="status" className="text-sm font-medium text-emerald-800">{profileSuccess}</p>}
                </div>
              </form>
            </section>

            <section aria-labelledby="account-security-heading" className="py-8">
              <h2 id="account-security-heading" className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900">
                <ShieldCheck size={19} aria-hidden="true" />
                Bảo mật tài khoản
              </h2>
              <div className="max-w-3xl">
                <ChangePasswordForm hasPassword={user.has_password !== false} />
              </div>
            </section>

            <section aria-labelledby="account-actions-heading" className="py-8">
              <h2 id="account-actions-heading" className="text-lg font-semibold text-neutral-900">Tài khoản</h2>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-2xl text-sm leading-6 text-neutral-700">
                  Đăng xuất khỏi thiết bị này. Các phiên trên thiết bị khác vẫn hoạt động cho đến khi mã truy cập hết hạn.
                </p>
                <Button type="button" variant="ghostDark" className="min-h-11 rounded-full border-red-200 text-red-700 hover:bg-red-50" onClick={onLogout}>
                  <LogOut size={17} aria-hidden="true" />
                  Đăng xuất
                </Button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

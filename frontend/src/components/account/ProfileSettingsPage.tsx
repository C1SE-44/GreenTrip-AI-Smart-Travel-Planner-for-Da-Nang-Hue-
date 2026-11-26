import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Camera, CheckCircle2, Crop, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { UserProfile } from '@/services/auth';
import { updateProfile, uploadAvatar } from '@/services/profile';
import ChangePasswordForm from './ChangePasswordForm';
import AvatarCropModal from './AvatarCropModal';

interface ProfileSettingsPageProps {
  user: UserProfile | null;
  loading: boolean;
  onBack: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onProfileUpdated: (user: UserProfile) => void;
}

type SectionKey = 'personal' | 'security' | 'account';

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
  const [activeSection, setActiveSection] = useState<SectionKey>('personal');
  const [profileBusy, setProfileBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name);
    setPhone(user.phone ?? '');
  }, [user]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const scrollToSection = (key: SectionKey, elementId: string) => {
    setActiveSection(key);
    const target = document.getElementById(elementId);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <main className="h-full min-w-0 flex-1 overflow-y-auto auto-hide-scrollbar bg-white px-5 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
        <div className="w-full animate-pulse" role="status" aria-label="Đang tải hồ sơ">
          <div className="h-8 w-56 rounded-lg bg-neutral-200" />
          <div className="mt-3 h-4 w-96 max-w-full rounded bg-neutral-100" />
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
            <div className="border-b border-neutral-100 pb-8 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
              <div className="h-56 w-full rounded-3xl bg-neutral-100" />
              <div className="mt-5 space-y-2">
                <div className="h-11 w-full rounded-xl bg-neutral-100" />
                <div className="h-11 w-full rounded-xl bg-neutral-100" />
              </div>
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
          <h1 id="profile-settings-title" className="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            Hồ sơ &amp; Cài đặt
          </h1>
          <p className="mt-2 text-sm text-neutral-600">Quản lý thông tin cá nhân và bảo mật tài khoản.</p>
        </header>
        <section className="py-10 max-w-lg" aria-labelledby="profile-sign-in-heading">
          <h2 id="profile-sign-in-heading" className="text-lg font-semibold text-neutral-950">
            Đăng nhập để xem hồ sơ
          </h2>
          <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
            Bạn cần đăng nhập để xem và cập nhật thông tin cá nhân cũng như đồng bộ các chuyến đi đã lưu.
          </p>
          <Button type="button" className="mt-5 min-h-11 rounded-full px-6" variant="dark" onClick={onLogin}>
            Đăng nhập
          </Button>
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
      <div className="w-full px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
        {/* Header chuẩn Airbnb Web Account Settings */}
        <header className="flex items-start justify-between gap-3 border-b border-neutral-200/90 pb-6">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Quay lại Khám phá"
              className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-800 hover:border-neutral-950 hover:bg-neutral-50 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <ArrowLeft size={19} aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <h1 id="profile-settings-title" className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                Hồ sơ &amp; Cài đặt
              </h1>
              <p id="profile-settings-description" className="mt-1.5 text-sm text-neutral-600">
                Quản lý thông tin cá nhân, ảnh đại diện và bảo mật tài khoản.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="hidden sm:inline-flex min-h-10 items-center justify-center rounded-full bg-neutral-100 hover:bg-neutral-200 px-5 text-sm font-semibold text-neutral-950 transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            Xong
          </button>
        </header>

        {/* Bố cục 2 cột chuẩn Airbnb Account Settings & Profile */}
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] xl:gap-12">
          {/* Cột trái: Thẻ hồ sơ nổi + Danh mục cài đặt */}
          <aside className="min-w-0 border-b border-neutral-200/90 pb-8 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8 space-y-6" aria-labelledby="account-overview-heading">
            <h2 id="account-overview-heading" className="sr-only">Tài khoản của bạn</h2>

            {/* Airbnb Profile Identity Card */}
            <div className="rounded-3xl bg-white border border-neutral-200/90 shadow-[0_6px_24px_rgba(28,25,23,0.07)] p-5 sm:p-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <div
                    className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-950 text-4xl font-semibold text-white ring-4 ring-neutral-100"
                    aria-label="Xem trước ảnh đại diện"
                  >
                    {avatarSrc ? (
                      <img src={avatarSrc} alt={`Ảnh đại diện của ${user.full_name}`} width={112} height={112} className="h-full w-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <span
                    className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-700 text-white ring-2 ring-white shadow-xs"
                    title="Tài khoản đã xác thực"
                  >
                    <CheckCircle2 size={15} aria-hidden="true" />
                  </span>
                </div>

                <h3 className="mt-4 break-words text-lg font-bold text-neutral-950 max-w-full">
                  {user.full_name}
                </h3>
                <p className="mt-0.5 break-all text-xs font-medium text-neutral-600 max-w-full">
                  {user.email}
                </p>
                <span className="mt-2.5 inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200/80 px-3 py-1 text-xs font-semibold text-emerald-900">
                  Thành viên GreenTrip
                </span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Chọn ảnh đại diện"
                className="sr-only"
                onChange={(event) => onSelectAvatar(event.target.files?.[0])}
              />
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="ghostDark"
                  className="min-h-11 rounded-full px-4 border-neutral-300"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera size={16} aria-hidden="true" />
                  Chọn ảnh
                </Button>
                {selectedFile && previewUrl && (
                  <Button
                    type="button"
                    variant="ghostDark"
                    className="min-h-11 rounded-full px-4 border-neutral-300"
                    onClick={() => setCropModalOpen(true)}
                  >
                    <Crop size={15} aria-hidden="true" />
                    Cắt ảnh
                  </Button>
                )}
                {selectedFile && (
                  <Button
                    type="button"
                    variant="dark"
                    loading={avatarBusy}
                    className="min-h-11 rounded-full px-5"
                    onClick={saveAvatar}
                  >
                    {avatarBusy ? 'Đang tải ảnh…' : 'Tải ảnh lên'}
                  </Button>
                )}
              </div>
              <p className="mt-3 text-center text-xs text-neutral-600">
                Ảnh JPG, PNG hoặc WebP · Tối đa 5 MB.
              </p>
              {avatarError && <p role="alert" className="mt-2 text-center text-xs font-medium text-rose-700">{avatarError}</p>}
              {avatarSuccess && <p role="status" className="mt-2 text-center text-xs font-semibold text-emerald-800">{avatarSuccess}</p>}
            </div>

            {/* Điều hướng nhanh kiểu Airbnb Account Settings */}
            <nav aria-label="Danh mục cài đặt tài khoản" className="hidden lg:block space-y-1">
              {([
                { key: 'personal', id: 'personal-info-heading', label: 'Thông tin cá nhân', Icon: UserRound },
                { key: 'security', id: 'account-security-heading', label: 'Bảo mật & đăng nhập', Icon: ShieldCheck },
                { key: 'account', id: 'account-actions-heading', label: 'Tài khoản', Icon: LogOut },
              ] as const).map(({ key, id, label, Icon }) => {
                const isActive = activeSection === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => scrollToSection(key, id)}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                      isActive
                        ? 'bg-neutral-100 font-semibold text-neutral-950'
                        : 'font-medium text-neutral-700 hover:bg-neutral-50 hover:text-neutral-950'
                    }`}
                  >
                    <Icon size={17} className="shrink-0" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Cột phải: Các mục nội dung chi tiết */}
          <div className="min-w-0 max-w-5xl divide-y divide-neutral-200/90">
            <section aria-labelledby="personal-info-heading" className="pb-8 scroll-mt-6">
              <h2 id="personal-info-heading" className="text-xl font-bold tracking-tight text-neutral-950">
                Thông tin cá nhân
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Cập nhật tên hiển thị và số điện thoại liên hệ cho các hành trình của bạn.
              </p>

              <form className="mt-6 grid gap-x-5 gap-y-5 xl:grid-cols-2" onSubmit={saveProfile}>
                <Input
                  id="profile-full-name"
                  name="full_name"
                  label="Họ và tên"
                  className="bg-white border-neutral-300 focus:ring-emerald-800 focus:border-emerald-800"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  maxLength={100}
                  required
                />
                <Input
                  id="profile-email"
                  name="email"
                  label="Địa chỉ email"
                  value={user.email}
                  readOnly
                  aria-readonly="true"
                  className="cursor-not-allowed bg-neutral-100/90 border-neutral-200 text-neutral-700"
                  hint="Email đăng nhập cố định của tài khoản."
                />
                <div className="xl:col-span-2">
                  <Input
                    id="profile-phone"
                    name="phone"
                    label="Số điện thoại"
                    type="tel"
                    className="bg-white border-neutral-300 focus:ring-emerald-800 focus:border-emerald-800"
                    autoComplete="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    maxLength={20}
                    hint="Thêm mã quốc gia khi cần (ví dụ: +84901234567)."
                  />
                </div>
                {error && <p role="alert" className="text-sm font-medium text-rose-700 xl:col-span-2">{error}</p>}
                <div className="flex flex-wrap items-center gap-3 pt-1 xl:col-span-2">
                  <Button type="submit" variant="dark" loading={profileBusy} className="min-h-11 rounded-full px-6">
                    {profileBusy ? 'Đang lưu…' : 'Lưu thay đổi'}
                  </Button>
                  {profileSuccess && <p role="status" className="text-sm font-medium text-emerald-800">{profileSuccess}</p>}
                </div>
              </form>
            </section>

            <section aria-labelledby="account-security-heading" className="py-8 scroll-mt-6">
              <h2 id="account-security-heading" className="flex items-center gap-2 text-xl font-bold tracking-tight text-neutral-950">
                <ShieldCheck size={20} className="text-emerald-700 shrink-0" aria-hidden="true" />
                <span>Bảo mật tài khoản</span>
              </h2>
              <div className="mt-5">
                <ChangePasswordForm hasPassword={user.has_password !== false} />
              </div>
            </section>

            <section aria-labelledby="account-actions-heading" className="py-8 scroll-mt-6">
              <h2 id="account-actions-heading" className="text-xl font-bold tracking-tight text-neutral-950">
                Tài khoản
              </h2>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200/90 bg-neutral-50/50 p-4 sm:p-5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-950">Đăng xuất khỏi thiết bị này</p>
                  <p className="mt-1 text-sm leading-6 text-neutral-600">
                    Các phiên trên thiết bị khác vẫn hoạt động cho đến khi mã truy cập hết hạn.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghostDark"
                  className="min-h-11 rounded-full border-rose-200 bg-white text-rose-700 hover:bg-rose-50 hover:border-rose-300 px-5 shrink-0"
                  onClick={onLogout}
                >
                  <LogOut size={16} aria-hidden="true" />
                  Đăng xuất
                </Button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {cropModalOpen && previewUrl && selectedFile && (
        <AvatarCropModal
          imageSrc={previewUrl}
          fileName={selectedFile.name}
          onCancel={() => setCropModalOpen(false)}
          onApply={(croppedFile) => {
            setSelectedFile(croppedFile);
            setPreviewUrl(URL.createObjectURL(croppedFile));
            setCropModalOpen(false);
          }}
        />
      )}
    </main>
  );
}

import { useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import PasswordStrengthField from '@/components/auth/PasswordStrengthField';
import { changePassword } from '@/services/profile';

interface ChangePasswordFormProps {
  hasPassword: boolean;
}

export default function ChangePasswordForm({ hasPassword }: ChangePasswordFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!hasPassword) {
    return (
      <p className="rounded-2xl border border-neutral-200/80 bg-neutral-50 px-4 py-3.5 text-sm leading-5 text-neutral-700">
        Tài khoản này đăng nhập bằng Google nên chưa có mật khẩu riêng để đổi tại đây.
      </p>
    );
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword.length < 8 || newPassword.length > 128) {
      setError('Mật khẩu mới cần có từ 8 đến 128 ký tự.');
      return;
    }
    if (!newPassword.trim() || newPassword !== confirmPassword) {
      setError('Hai lần nhập mật khẩu mới không khớp.');
      return;
    }

    setLoading(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Mật khẩu đã được thay đổi.');
      setExpanded(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể đổi mật khẩu lúc này.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {!expanded ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200/90 bg-white px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-neutral-950">Mật khẩu</p>
            <p className="mt-0.5 text-sm text-neutral-600">
              Dùng mật khẩu tối thiểu 8 ký tự để bảo vệ tài khoản của bạn.
            </p>
          </div>
          <Button
            type="button"
            variant="ghostDark"
            className="min-h-11 rounded-full border-neutral-300 hover:border-neutral-950 px-5 shrink-0"
            onClick={() => {
              setExpanded(true);
              setSuccess(null);
            }}
          >
            Đổi mật khẩu
          </Button>
        </div>
      ) : (
        <form className="rounded-2xl border border-neutral-200/90 bg-neutral-50/50 p-4 sm:p-6 space-y-4" onSubmit={onSubmit}>
          <PasswordStrengthField
            id="current-password"
            name="current-password"
            label="Mật khẩu hiện tại"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            required
          />
          <PasswordStrengthField
            id="new-password"
            name="new-password"
            label="Mật khẩu mới"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            required
            showStrength
          />
          <PasswordStrengthField
            id="confirm-password"
            name="confirm-password"
            label="Xác nhận mật khẩu mới"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            required
          />
          {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
          <div className="flex flex-wrap gap-2.5 pt-1">
            <Button type="submit" variant="dark" loading={loading} className="min-h-11 rounded-full px-6">
              {loading ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
            </Button>
            <Button
              type="button"
              variant="ghostDark"
              className="min-h-11 rounded-full border-neutral-300 bg-white px-5"
              onClick={() => {
                setExpanded(false);
                setError(null);
              }}
            >
              Hủy
            </Button>
          </div>
        </form>
      )}
      {success && <p role="status" className="mt-3 text-sm font-medium text-emerald-800">{success}</p>}
    </div>
  );
}

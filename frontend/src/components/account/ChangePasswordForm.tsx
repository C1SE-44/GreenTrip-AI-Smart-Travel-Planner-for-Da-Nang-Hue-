import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { changePassword } from '@/services/profile';

interface ChangePasswordFormProps {
  hasPassword: boolean;
}

export default function ChangePasswordForm({ hasPassword }: ChangePasswordFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!hasPassword) {
    return (
      <p className="rounded-xl bg-neutral-50 px-4 py-3 text-sm leading-5 text-neutral-700">
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
        <Button
          type="button"
          variant="ghostDark"
          className="min-h-11 w-full max-w-xl justify-between"
          onClick={() => { setExpanded(true); setSuccess(null); }}
        >
          Đổi mật khẩu
          <span aria-hidden="true">›</span>
        </Button>
      ) : (
        <form className="max-w-xl space-y-4" onSubmit={onSubmit}>
          {([
            ['current-password', 'Mật khẩu hiện tại', currentPassword, setCurrentPassword],
            ['new-password', 'Mật khẩu mới', newPassword, setNewPassword],
            ['confirm-password', 'Xác nhận mật khẩu mới', confirmPassword, setConfirmPassword],
          ] as const).map(([id, label, value, setValue]) => (
            <div key={id} className="relative">
              <Input
                id={id}
                label={label}
                type={showPasswords ? 'text' : 'password'}
                autoComplete={id === 'current-password' ? 'current-password' : 'new-password'}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                required
                maxLength={128}
                className="pr-14 bg-white border-neutral-300 focus:ring-emerald-800 focus:border-emerald-800"
              />
              <button
                type="button"
                aria-label={showPasswords ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                aria-pressed={showPasswords}
                onClick={() => setShowPasswords((visible) => !visible)}
                className="absolute right-1 top-7 flex h-11 w-11 items-center justify-center rounded-lg text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
              >
                {showPasswords ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          ))}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="dark" loading={loading} className="min-h-11 rounded-full px-5">{loading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}</Button>
            <Button type="button" variant="ghostDark" className="min-h-11 rounded-full px-5" onClick={() => { setExpanded(false); setError(null); }}>
              Hủy
            </Button>
          </div>
        </form>
      )}
      {success && <p role="status" className="mt-2 text-sm font-medium text-emerald-800">{success}</p>}
    </div>
  );
}

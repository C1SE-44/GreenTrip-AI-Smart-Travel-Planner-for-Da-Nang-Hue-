import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, User, ExternalLink, ArrowLeft, RefreshCw, CheckCircle2 } from 'lucide-react';
import AuthLayout from '@/components/layout/AuthLayout';

import Input from '@/components/ui/Input';
import PasswordInput from '@/components/ui/PasswordInput';
import PasswordStrength from '@/components/ui/PasswordStrength';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import GoogleButton from '@/components/ui/GoogleButton';
import { VerifyOtpModal } from '@/components/auth/VerifyOtpModal';
import { signup, resendVerification, googleLogin, ApiError } from '@/services/auth';

interface Errors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
  terms?: string;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  const [otpModal, setOtpModal] = useState<{
    isOpen: boolean;
    email: string;
    token: string;
  }>({
    isOpen: false,
    email: '',
    token: '',
  });

  // Initialize Google Sign-In SDK and render official Google button
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const setupGoogle = () => {
      if (!window.google?.accounts?.id) return false;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) return;
          setGoogleLoading(true);
          try {
            const res = await googleLogin(response.credential);
            if (res.require_otp) {
              setOtpModal({
                isOpen: true,
                email: res.email,
                token: res.otp_session_token,
              });
            }
          } catch (err) {
            if (err instanceof ApiError) {
              setGeneralError(err.message);
            } else {
              setGeneralError('Đăng ký với Google thất bại. Vui lòng thử lại.');
            }
          } finally {
            setGoogleLoading(false);
          }
        },
      });

      const btnContainer = document.getElementById('googleRegisterBtn');
      if (btnContainer) {
        btnContainer.innerHTML = '';
        const btnWidth = Math.min(380, Math.max(220, window.innerWidth - 64));
        window.google.accounts.id.renderButton(btnContainer, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signup_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: btnWidth,
        });
      }
      return true;
    };

    if (!setupGoogle()) {
      const interval = setInterval(() => {
        if (setupGoogle()) {
          clearInterval(interval);
        }
      }, 150);
      return () => clearInterval(interval);
    }
  }, [navigate]);

  const handleGoogleClick = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setGeneralError('Hệ thống đang chuẩn bị kết nối Google OAuth. Vui lòng cung cấp VITE_GOOGLE_CLIENT_ID trong file .env để kích hoạt tính năng này.');
      return;
    }

    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    }
  };


  const validate = (): boolean => {
    const e: Errors = {};
    if (!name.trim()) e.name = 'Vui lòng nhập họ và tên';
    if (!email) e.email = 'Vui lòng nhập email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Email không hợp lệ';
    if (!password) e.password = 'Vui lòng nhập mật khẩu';
    else if (password.length < 8) e.password = 'Mật khẩu phải có ít nhất 8 ký tự';
    if (!confirm) e.confirm = 'Vui lòng xác nhận mật khẩu';
    else if (confirm !== password) e.confirm = 'Mật khẩu xác nhận không khớp';
    if (!terms) e.terms = 'Vui lòng đồng ý với Điều khoản & Chính sách bảo mật';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setGeneralError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      await signup({
        full_name: name.trim(),
        email: email.trim(),
        password,
      });

      setRegisteredEmail(email.trim());
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setGeneralError('Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.');
        } else {
          setGeneralError(err.message);
        }
      } else {
        setGeneralError('Không thể kết nối đến máy chủ. Vui lòng thử lại sau.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!registeredEmail || resending) return;
    setResending(true);
    setResendStatus(null);
    try {
      const res = await resendVerification(registeredEmail);
      setResendStatus(res.message || 'Đã gửi lại email xác nhận thành công!');
    } catch (err) {
      if (err instanceof ApiError) {
        setResendStatus(err.message);
      } else {
        setResendStatus('Không thể gửi lại email lúc này. Vui lòng thử lại sau.');
      }
    } finally {
      setResending(false);
    }
  };

  if (registeredEmail) {
    return (
      <AuthLayout
        image="https://picsum.photos/seed/hue_auth/1200/1600"
        imageAlt="Chùa Thiên Mụ bên sông Hương"
        slogan="Lên lịch trình riêng, đi theo cách của bạn."
        benefits={[
          'Tạo lịch trình trong 30 giây với AI gợi ý thông minh',
          'Lưu địa điểm yêu thích, dùng lại cho chuyến sau',
          'Theo dõi chỉ số xanh của mỗi chuyến đi',
        ]}
        ecoStat={{ score: 91, co2: '5,8 kg' }}
      >
        <div className="text-center py-2" data-testid="verification-sent-screen">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-forest-600 shadow-sm border border-emerald-200">
            <Mail size={32} />
          </div>

          <h2 className="font-display text-2xl font-semibold text-charcoal">
            Kiểm tra hộp thư của bạn
          </h2>

          <p className="mt-2 text-sm text-muted">
            GreenTrip AI đã gửi liên kết xác nhận kích hoạt đến:
          </p>

          <div className="my-3 inline-block rounded-lg bg-emerald-50 px-4 py-2 border border-emerald-200">
            <span className="font-semibold text-forest-700" data-testid="registered-email-display">
              {registeredEmail}
            </span>
          </div>

          <p className="text-sm text-charcoal/80 leading-relaxed mb-5">
            Vui lòng nhấn vào nút <strong>Kích hoạt tài khoản</strong> trong email để kích hoạt tài khoản của bạn trước khi đăng nhập.
          </p>

          <div className="rounded-xl bg-amber-50/80 border border-amber-200 p-3.5 text-xs text-amber-800 text-left mb-6 space-y-1">
            <p className="font-semibold">💡 Bạn chưa nhận được email?</p>
            <p>• Vui lòng kiểm tra thêm hòm thư <strong>Spam / Thư rác / Quảng cáo</strong>.</p>
            <p>• Liên kết xác nhận có hiệu lực trong vòng <strong>24 giờ</strong>.</p>
          </div>

          {resendStatus && (
            <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-forest-700 flex items-center justify-center gap-2">
              <CheckCircle2 size={16} />
              <span>{resendStatus}</span>
            </div>
          )}

          <div className="space-y-3">
            <a
              href="https://mail.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-forest-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-forest-700 transition"
            >
              Mở Gmail
              <ExternalLink size={16} />
            </a>

            <Button
              variant="ghost"
              size="lg"
              className="w-full"
              loading={resending}
              onClick={handleResend}
            >
              <RefreshCw size={16} className="mr-1.5" />
              Gửi lại email kích hoạt
            </Button>

            <Button
              variant="ghost"
              size="lg"
              className="w-full"
              onClick={() => navigate('/login', { state: { registeredEmail } })}
            >
              <ArrowLeft size={16} className="mr-1.5" />
              Đi tới trang Đăng nhập
            </Button>
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={() => {
                setRegisteredEmail(null);
                setPassword('');
                setConfirm('');
                setGeneralError(null);
                setResendStatus(null);
              }}
              className="text-xs text-muted hover:text-forest-600 hover:underline"
            >
              Đăng ký bằng email khác
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }


  return (
    <AuthLayout
      image="https://picsum.photos/seed/hue_auth/1200/1600"
      imageAlt="Chùa Thiên Mụ bên sông Hương"
      slogan="Lên lịch trình riêng, đi theo cách của bạn."
      benefits={[
        'Tạo lịch trình trong 30 giây với AI gợi ý thông minh',
        'Lưu địa điểm yêu thích, dùng lại cho chuyến sau',
        'Theo dõi chỉ số xanh của mỗi chuyến đi',
      ]}
      ecoStat={{ score: 91, co2: '5,8 kg' }}
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-6">
          <h2 className="font-display text-2xl font-semibold text-charcoal">
            Tạo tài khoản
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            Miễn phí, chỉ mất vài giây
          </p>
        </div>

        {generalError && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {generalError}
          </div>
        )}

        <div className="space-y-4">
          <Input
            label="Họ và tên"
            placeholder="Nguyễn Văn A"
            icon={<User size={17} />}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
            }}
            error={errors.name}
            autoComplete="name"
          />

          <Input
            label="Email"
            type="email"
            placeholder="ban@duLich.vn"
            icon={<Mail size={17} />}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
            }}
            error={errors.email}
            autoComplete="email"
          />

          <div>
            <PasswordInput
              label="Mật khẩu"
              placeholder="Tối thiểu 8 ký tự"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
              }}
              error={errors.password}
              autoComplete="new-password"
            />
            <PasswordStrength password={password} />
          </div>

          <PasswordInput
            label="Xác nhận mật khẩu"
            placeholder="Nhập lại mật khẩu"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined }));
            }}
            error={errors.confirm}
            autoComplete="new-password"
          />
        </div>

        <div className="mt-5">
          <Checkbox
            checked={terms}
            onChange={(v) => {
              setTerms(v);
              if (errors.terms) setErrors((p) => ({ ...p, terms: undefined }));
            }}
            label="Tôi đồng ý với Điều khoản & Chính sách bảo mật"
            error={errors.terms}
          />
        </div>

        <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-6 w-full">
          Đăng ký
        </Button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-beige" />
          <span className="text-xs font-medium text-muted">hoặc</span>
          <div className="h-px flex-1 bg-beige" />
        </div>

        <div className="w-full flex justify-center min-h-[44px]">
          <div id="googleRegisterBtn" className="w-full flex justify-center" />
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Đã có tài khoản?{' '}
          <Link
            to="/login"
            className="font-medium text-forest-600 hover:text-forest-700 hover:underline"
          >
            Đăng nhập
          </Link>
        </p>
      </form>

      <VerifyOtpModal
        isOpen={otpModal.isOpen}
        email={otpModal.email}
        otpSessionToken={otpModal.token}
        onSuccess={(token) => {
          localStorage.setItem('access_token', token);
          setOtpModal({ isOpen: false, email: '', token: '' });
          navigate('/explore');
        }}
        onClose={() => setOtpModal({ isOpen: false, email: '', token: '' })}
      />
    </AuthLayout>
  );
}

import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/layout/AuthLayout';
import Input from '@/components/ui/Input';
import PasswordInput from '@/components/ui/PasswordInput';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import GoogleButton from '@/components/ui/GoogleButton';
import { VerifyOtpModal } from '@/components/auth/VerifyOtpModal';
import { login, googleLogin, resendVerification, ApiError } from '@/services/auth';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type: 'standard';
              theme: 'outline';
              size: 'large';
              text: 'continue_with' | 'signin_with' | 'signup_with';
              shape: 'pill' | 'rectangular';
              logo_alignment: 'left';
              width: number;
            },
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

interface Errors {
  email?: string;
  password?: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as { registeredEmail?: string; verifiedEmail?: string } | null;

  const [email, setEmail] = useState(state?.registeredEmail || state?.verifiedEmail || '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [otpModal, setOtpModal] = useState<{
    isOpen: boolean;
    email: string;
    token: string;
  }>({
    isOpen: false,
    email: '',
    token: '',
  });

  const [noticeMessage, setNoticeMessage] = useState<string | null>(
    state?.verifiedEmail
      ? '🎉 Tài khoản của bạn đã được kích hoạt thành công! Hãy đăng nhập để bắt đầu.'
      : null
  );
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isInactive, setIsInactive] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

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
              setGeneralError('Đăng nhập với Google thất bại. Vui lòng thử lại.');
            }
          } finally {
            setGoogleLoading(false);
          }
        },
      });

      const btnContainer = document.getElementById('googleSignInBtn');
      if (btnContainer) {
        btnContainer.innerHTML = '';
        const btnWidth = Math.min(380, Math.max(220, window.innerWidth - 64));
        window.google.accounts.id.renderButton(btnContainer, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
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

  const validate = (): boolean => {
    const e: Errors = {};
    if (!email) e.email = 'Vui lòng nhập email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Email không hợp lệ';
    if (!password) e.password = 'Vui lòng nhập mật khẩu';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setGeneralError(null);
    setIsInactive(false);
    setResendStatus(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await login({ email: email.trim(), password });
      if (remember) {
        localStorage.setItem('access_token', res.access_token);
      } else {
        sessionStorage.setItem('access_token', res.access_token);
      }
      navigate('/explore');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setIsInactive(true);
          setGeneralError(err.message);
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
    if (!email.trim() || resending) return;
    setResending(true);
    setResendStatus(null);
    try {
      const res = await resendVerification(email.trim());
      setResendStatus(res.message || 'Đã gửi lại email kích hoạt!');
    } catch (err) {
      if (err instanceof ApiError) {
        setResendStatus(err.message);
      } else {
        setResendStatus('Không thể gửi lại email lúc này.');
      }
    } finally {
      setResending(false);
    }
  };

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

  return (
    <AuthLayout
      image="https://picsum.photos/seed/danang_auth/1200/1600"
      imageAlt="Cầu Rồng Đà Nẵng về đêm"
      slogan="Sáng Mỹ Khê, chiều Ngũ Hành Sơn, tối về Huế."
      benefits={[
        'Lịch trình tối ưu quãng đường – đi thêm được nhiều nơi',
        'Ngân sách linh hoạt, điều chỉnh theo túi tiền',
        'Ưu tiên du lịch xanh, giảm rác thải nhựa & CO₂',
      ]}
      ecoStat={{ score: 86, co2: '4,2 kg' }}
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-6">
          <h2 className="font-display text-2xl font-semibold text-charcoal">
            Chào mừng trở lại
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            Đăng nhập để tiếp tục lên lịch trình cho chuyến đi tiếp theo
          </p>
        </div>

        {noticeMessage && (
          <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-sm text-forest-700 flex items-start gap-2">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <span>{noticeMessage}</span>
          </div>
        )}

        {generalError && (
          <div className={`mb-4 rounded-xl p-3.5 text-sm border ${
            isInactive
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p>{generalError}</p>
                {isInactive && (
                  <div className="mt-2.5 pt-2 border-t border-amber-200/80">
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resending}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-forest-700 hover:text-forest-800 hover:underline"
                    >
                      {resending ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Đang gửi lại...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw size={13} />
                          <span>Gửi lại email kích hoạt đến {email}</span>
                        </>
                      )}
                    </button>
                    {resendStatus && (
                      <p className="mt-1 text-xs text-forest-600 font-medium">
                        ✓ {resendStatus}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
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

          <PasswordInput
            label="Mật khẩu"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
            }}
            error={errors.password}
            autoComplete="current-password"
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Checkbox
            checked={remember}
            onChange={setRemember}
            label="Ghi nhớ đăng nhập"
          />
          <Link
            to="/login"
            className="text-sm font-medium text-forest-600 hover:text-forest-700 hover:underline"
          >
            Quên mật khẩu?
          </Link>
        </div>

        <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-6 w-full">
          Đăng nhập
        </Button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-beige" />
          <span className="text-xs font-medium text-muted">hoặc</span>
          <div className="h-px flex-1 bg-beige" />
        </div>

        <div className="w-full flex justify-center min-h-[44px]">
          <div id="googleSignInBtn" className="w-full flex justify-center" />
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Chưa có tài khoản?{' '}
          <Link
            to="/register"
            className="font-medium text-forest-600 hover:text-forest-700 hover:underline"
          >
            Đăng ký
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

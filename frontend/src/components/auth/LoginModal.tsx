import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  ArrowLeft,
  RefreshCw,
  Mail,
  Check,
  Leaf,
  Sparkles,
  Heart,
  Compass,
} from 'lucide-react';
import {
  login,
  signup,
  googleLogin,
  checkEmail,
  verifyOtp,
  resendOtp,
  saveAuthSession,
  ApiError,
} from '@/services/auth';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
  onLoginSuccess?: () => void;
  onRegisterSuccess?: () => void;
}

type Step = 'email' | 'login' | 'register' | 'otp';

const CLIENT_EMAIL_RE = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function suggestDisplayNameFromEmail(rawEmail: string): string {
  const localPart = (rawEmail.split('@')[0] || '').trim();
  if (!localPart) return '';
  const cleaned = localPart.replace(/[._-]+/g, ' ').replace(/\d+$/g, '').trim();
  if (!cleaned) return localPart;
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function syncOnboardingNameToStorage(fullName: string): void {
  const trimmed = fullName.trim();
  if (!trimmed) return;
  try {
    const parts = trimmed.split(/\s+/);
    const firstName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    const lastName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
    const existingRaw = localStorage.getItem('greentrip_onboarding_profile');
    const existing = existingRaw ? (JSON.parse(existingRaw) as Record<string, unknown>) : {};
    localStorage.setItem(
      'greentrip_onboarding_profile',
      JSON.stringify({
        ...existing,
        firstName: existing.firstName || firstName,
        lastName: existing.lastName || lastName,
      })
    );
  } catch {
    // Ignore browser storage errors cleanly
  }
}

export default function LoginModal({
  isOpen,
  onClose,
  initialMode = 'login',
  onLoginSuccess,
  onRegisterSuccess,
}: LoginModalProps) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 6 ô OTP rời
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [otpSessionToken, setOtpSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Đếm ngược 60s cho mã OTP
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    }
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [countdown]);

  // Khóa cuộn trang & hỗ trợ phím Escape khi modal mở
  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = 'unset';
      return;
    }
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, loading, onClose]);

  // Reset form khi đóng modal
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setStep('email');
        setEmail('');
        setFullName('');
        setPassword('');
        setConfirmPassword('');
        setShowPassword(false);
        setShowConfirmPassword(false);
        setOtpDigits(['', '', '', '', '', '']);
        setCountdown(0);
        setError('');
        setAttemptedSubmit(false);
        setOtpSessionToken(null);
        setLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Focus ô OTP đầu tiên khi vào step 'otp'
  useEffect(() => {
    if (step === 'otp') {
      const timer = setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const isPasswordStrong = hasMinLength && hasUppercase && hasNumber && hasSymbol;
  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;

  const handleOtpChange = (index: number, value: string) => {
    const cleanVal = value.replace(/\D/g, '');

    if (cleanVal.length > 1) {
      const pasted = cleanVal.slice(0, 6).split('');
      const newDigits = [...otpDigits];
      pasted.forEach((char, i) => {
        newDigits[i] = char;
      });
      setOtpDigits(newDigits);
      const nextIndex = Math.min(pasted.length, 5);
      otpInputsRef.current[nextIndex]?.focus();
      return;
    }

    const newDigits = [...otpDigits];
    newDigits[index] = cleanVal;
    setOtpDigits(newDigits);
    setError('');

    if (cleanVal && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        otpInputsRef.current[index - 1]?.focus();
      }
    } else if (e.key === 'Enter') {
      void handleContinue();
    }
  };

  const handleResendOtp = async () => {
    if (!email) return;
    setError('');
    if (!otpSessionToken) {
      setError('Phiên xác thực OTP không hợp lệ. Vui lòng đăng nhập lại.');
      return;
    }
    try {
      await resendOtp({
        email: email.trim().toLowerCase(),
        otp_session_token: otpSessionToken,
      });
      setCountdown(60);
      setOtpDigits(['', '', '', '', '', '']);
      otpInputsRef.current[0]?.focus();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Không thể gửi lại mã OTP. Vui lòng thử lại.'));
    }
  };

  const handleGoogleClick = async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google?.accounts?.id) {
      setError('Xác thực Google chưa sẵn sàng. Bạn có thể đăng nhập nhanh bằng email ở trên.');
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) return;
          try {
            setLoading(true);
            const res = await googleLogin(response.credential);
            if (res.access_token || !res.require_otp) {
              if (res.access_token) {
                saveAuthSession(res.access_token);
              }
              onClose();
              if (onLoginSuccess) onLoginSuccess();
              else navigate('/explore');
            } else if (res.require_otp && res.otp_session_token) {
              setEmail(res.email);
              setOtpSessionToken(res.otp_session_token);
              setStep('otp');
              setCountdown(60);
            }
          } catch (err: unknown) {
            setError(getErrorMessage(err, 'Đăng nhập Google thất bại. Vui lòng thử lại.'));
          } finally {
            setLoading(false);
          }
        },
      });

      window.google.accounts.id.prompt();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Không thể mở xác thực Google.'));
    }
  };

  const switchToRegisterStep = (targetEmail: string) => {
    setStep('register');
    setError('');
    setAttemptedSubmit(false);
    if (!fullName.trim()) {
      setFullName(suggestDisplayNameFromEmail(targetEmail));
    }
  };

  const switchToLoginStep = () => {
    setStep('login');
    setError('');
    setAttemptedSubmit(false);
  };

  const handleContinue = async () => {
    setError('');
    setAttemptedSubmit(true);

    // BƯỚC 1: Nhập email (Tự động kiểm tra tài khoản đã tồn tại hay chưa chuẩn Mindtrip / Wanderlog)
    if (step === 'email') {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !CLIENT_EMAIL_RE.test(cleanEmail)) {
        setError('Vui lòng nhập địa chỉ email hợp lệ (ví dụ: ten@gmail.com).');
        return;
      }
      setLoading(true);
      try {
        const check = await checkEmail(cleanEmail);
        setEmail(cleanEmail);
        setAttemptedSubmit(false);
        if (check.exists) {
          switchToLoginStep();
        } else {
          switchToRegisterStep(cleanEmail);
        }
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          setError(err.message);
          return;
        }
        setError(getErrorMessage(err, 'Không thể kết nối máy chủ xác thực. Vui lòng thử lại.'));
      } finally {
        setLoading(false);
      }
    }
    // BƯỚC 2A: Đăng nhập (tài khoản đã tồn tại)
    else if (step === 'login') {
      if (!password) {
        setError('Vui lòng nhập mật khẩu của bạn.');
        return;
      }
      setLoading(true);
      try {
        const res = await login({ email: email.trim().toLowerCase(), password });
        saveAuthSession(res.access_token);
        onClose();
        if (onLoginSuccess) {
          onLoginSuccess();
        } else {
          navigate('/explore');
        }
      } catch (err: unknown) {
        setError(getErrorMessage(err, 'Email hoặc mật khẩu không chính xác. Vui lòng thử lại.'));
      } finally {
        setLoading(false);
      }
    }
    // BƯỚC 2B: Thiết lập tài khoản đăng ký mới
    else if (step === 'register') {
      const cleanName = fullName.trim() || suggestDisplayNameFromEmail(email) || email.split('@')[0];
      if (!cleanName) {
        setError('Vui lòng nhập tên hiển thị của bạn.');
        return;
      }
      if (!isPasswordStrong) {
        setError('Vui lòng hoàn thành đủ 4 tiêu chí bảo mật mật khẩu bên dưới.');
        return;
      }
      if (!confirmPassword) {
        setError('Vui lòng nhập lại mật khẩu để xác nhận.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Mật khẩu nhập lại không khớp.');
        return;
      }

      setLoading(true);
      try {
        const res = await signup({
          full_name: cleanName,
          email: email.trim().toLowerCase(),
          password,
        });

        syncOnboardingNameToStorage(cleanName);

        if (res.access_token || !res.require_otp) {
          if (res.access_token) {
            saveAuthSession(res.access_token);
          }
          onClose();
          if (onRegisterSuccess) {
            onRegisterSuccess();
          } else if (onLoginSuccess) {
            onLoginSuccess();
          } else {
            navigate('/explore');
          }
          return;
        }

        if (res.otp_session_token) {
          setOtpSessionToken(res.otp_session_token);
        }
        setError('');
        setAttemptedSubmit(false);
        setCountdown(60);
        setOtpDigits(['', '', '', '', '', '']);
        setStep('otp');
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 409) {
          setStep('login');
          setError('Email này đã có tài khoản. Vui lòng nhập mật khẩu để đăng nhập.');
          return;
        }
        setError(getErrorMessage(err, 'Đăng ký thất bại. Vui lòng thử lại.'));
      } finally {
        setLoading(false);
      }
    }
    // BƯỚC 3: Xác thực mã OTP qua Gmail
    else if (step === 'otp') {
      const fullOtp = otpDigits.join('');
      if (fullOtp.length < 6) {
        setError('Vui lòng nhập đầy đủ 6 chữ số mã xác thực.');
        return;
      }
      if (!otpSessionToken) {
        setError('Phiên xác thực đã hết hạn. Vui lòng quay lại và đăng nhập lại.');
        return;
      }

      setLoading(true);
      try {
        const res = await verifyOtp({
          email: email.trim().toLowerCase(),
          otp_code: fullOtp,
          otp_session_token: otpSessionToken,
        });
        saveAuthSession(res.access_token);

        onClose();
        if (onRegisterSuccess) {
          onRegisterSuccess();
        } else if (onLoginSuccess) {
          onLoginSuccess();
        } else {
          navigate('/explore');
        }
      } catch (err: unknown) {
        setError(getErrorMessage(err, 'Mã OTP không chính xác hoặc đã hết hạn.'));
      } finally {
        setLoading(false);
      }
    }
  };

  if (!isOpen || !mounted) return null;

  const isLogin = step === 'login';
  const isRegister = step === 'register';
  const isEmailStep = step === 'email';
  const isOtpStep = step === 'otp';
  const showPasswordErrors = isRegister && attemptedSubmit && !isPasswordStrong;
  const fullOtp = otpDigits.join('');

  const passwordRules = [
    { key: 'length', label: 'Ít nhất 8 ký tự', met: hasMinLength },
    { key: 'upper', label: '1 chữ viết hoa (A-Z)', met: hasUppercase },
    { key: 'number', label: '1 chữ số (0-9)', met: hasNumber },
    { key: 'symbol', label: '1 ký tự đặc biệt (!@#...)', met: hasSymbol },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="greentrip-auth-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[4px] animate-fadeIn"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-[480px] max-h-[92vh] overflow-y-auto rounded-[28px] bg-white px-7 sm:px-9 pt-8 pb-7 shadow-2xl animate-fadeInScale border border-gray-100/80">
        {/* Navigation Top Bar: Back & Close Buttons */}
        <div className="flex items-center justify-between mb-4">
          {!isEmailStep ? (
            <button
              type="button"
              onClick={() => {
                if (isOtpStep) {
                  setStep('register');
                } else {
                  setStep('email');
                }
                setError('');
                setAttemptedSubmit(false);
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center text-gray-600 hover:text-black hover:bg-gray-100 transition-colors cursor-pointer"
              aria-label="Quay lại bước trước"
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/70 px-3 py-1 text-xs font-semibold text-emerald-800">
              <Leaf size={13} className="text-emerald-600" />
              <span>GreenTrip AI • Đà Nẵng & Huế</span>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition-colors text-base cursor-pointer"
            aria-label="Đóng cửa sổ đăng nhập"
          >
            ✕
          </button>
        </div>

        {/* Header Icon */}
        {isOtpStep && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
              <Mail size={20} />
            </div>
          </div>
        )}

        {/* Title */}
        <h2
          id="greentrip-auth-modal-title"
          className="font-heading text-[1.6rem] font-extrabold tracking-tight text-gray-950 leading-tight"
        >
          {isEmailStep &&
            (initialMode === 'register'
              ? 'Bắt đầu hành trình xanh'
              : 'Chào mừng đến với GreenTrip')}
          {isLogin && 'Chào mừng bạn trở lại!'}
          {isRegister && 'Tạo tài khoản mới'}
          {isOtpStep && 'Xác thực tài khoản'}
        </h2>

        {/* Subtitle */}
        {isEmailStep && (
          <>
            <p className="mt-1.5 mb-3.5 text-sm font-normal text-gray-600 leading-relaxed">
              Nhập email để đăng nhập hoặc tạo tài khoản mới chỉ trong vài giây — hệ thống sẽ tự nhận diện cho bạn.
            </p>
            <div className="mb-5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                <Heart size={12} className="text-emerald-700" />
                Lưu bộ sưu tập yêu thích
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                <Compass size={12} className="text-emerald-700" />
                Xếp lịch theo cụm gần nhau
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                <Sparkles size={12} className="text-emerald-700" />
                Trợ lý AI bản địa
              </span>
            </div>
          </>
        )}
        {isLogin && (
          <p className="mt-1.5 mb-5 text-sm font-normal text-gray-600">
            Nhập mật khẩu của bạn để mở lại bộ sưu tập và các lịch trình đã lưu.
          </p>
        )}
        {isRegister && (
          <p className="mt-1.5 mb-5 text-sm font-normal text-gray-600">
            Hoàn tất thông tin bên dưới để lưu địa điểm yêu thích và đồng bộ lịch trình trên mọi thiết bị.
          </p>
        )}
        {isOtpStep && (
          <p className="mt-1.5 mb-6 text-sm font-normal text-gray-600 leading-relaxed">
            Mã xác thực 6 chữ số đã được gửi tới hộp thư:
            <br />
            <span className="font-semibold text-gray-900 inline-flex items-center gap-1.5 mt-0.5">
              {email}
            </span>
          </p>
        )}

        {/* Form Body */}
        <div className="mt-0">
          {/* 1. Email Step */}
          {isEmailStep && (
            <div className="mb-3">
              <label htmlFor="greentrip-auth-email" className="sr-only">
                Địa chỉ email
              </label>
              <input
                id="greentrip-auth-email"
                type="email"
                autoComplete="email"
                placeholder="Nhập email của bạn (vd: ten@gmail.com)"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && void handleContinue()}
                autoFocus
                className="w-full rounded-full border border-gray-300 px-5 py-3.5 text-[15px] font-normal text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
              />
            </div>
          )}

          {/* 2. Email preview pill (khi ở bước Login hoặc Register) */}
          {(isLogin || isRegister) && (
            <div className="flex items-center justify-between rounded-full border border-gray-200 bg-gray-50/90 px-5 py-2.5 mb-3">
              <span className="text-sm font-medium text-gray-800 truncate mr-2">{email}</span>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setPassword('');
                  setConfirmPassword('');
                  setError('');
                  setAttemptedSubmit(false);
                }}
                className="min-h-8 px-2 text-xs font-bold text-emerald-800 hover:text-black transition-colors shrink-0 cursor-pointer"
              >
                Đổi email
              </button>
            </div>
          )}

          {/* 2B. Full Name input (chỉ ở bước Đăng ký chuẩn Mindtrip / Wanderlog) */}
          {isRegister && (
            <div className="mb-3">
              <label htmlFor="greentrip-auth-fullname" className="block text-xs font-semibold text-gray-700 mb-1.5 px-2">
                Tên hiển thị của bạn
              </label>
              <input
                id="greentrip-auth-fullname"
                type="text"
                autoComplete="name"
                placeholder="Ví dụ: Minh Nguyễn"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (error) setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && void handleContinue()}
                className="w-full rounded-full border border-gray-300 px-5 py-3 text-[15px] font-normal text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
              />
            </div>
          )}

          {/* 3. Password input (Login hoặc Register) */}
          {(isLogin || isRegister) && (
            <div className="mb-2.5">
              {isRegister && (
                <label htmlFor="greentrip-auth-password" className="block text-xs font-semibold text-gray-700 mb-1.5 px-2">
                  Mật khẩu bảo mật
                </label>
              )}
              <div className="relative">
                <input
                  id="greentrip-auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  placeholder={isLogin ? 'Nhập mật khẩu của bạn' : 'Tạo mật khẩu (ít nhất 8 ký tự)'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && void handleContinue()}
                  autoFocus={isLogin}
                  className={`w-full rounded-full border px-5 py-3.5 pr-12 text-[15px] font-normal text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all ${
                    showPasswordErrors
                      ? 'border-[#E25C43] focus:border-[#E25C43] focus:ring-1 focus:ring-[#E25C43]'
                      : 'border-gray-300 focus:border-black focus:ring-1 focus:ring-black'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:text-black transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {/* Live Registration Password Requirements Checklist (4 tiêu chí trực quan) */}
          {isRegister && (
            <div className="mb-3.5 px-1.5 grid grid-cols-2 gap-1.5">
              {passwordRules.map((rule) => (
                <div
                  key={rule.key}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    rule.met
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80'
                      : showPasswordErrors
                        ? 'bg-red-50 text-[#E25C43] border border-red-200'
                        : 'bg-neutral-100/80 text-neutral-600 border border-transparent'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                      rule.met
                        ? 'bg-emerald-600 text-white'
                        : 'bg-neutral-200 text-neutral-500'
                    }`}
                  >
                    {rule.met ? <Check size={11} strokeWidth={3} /> : '•'}
                  </span>
                  <span className="truncate">{rule.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Confirm Password input (chỉ ở bước Đăng ký) */}
          {isRegister && (
            <div className="mb-3">
              <div className="relative">
                <input
                  id="greentrip-auth-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Nhập lại mật khẩu"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (error) setError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && void handleContinue()}
                  className={`w-full rounded-full border px-5 py-3.5 pr-12 text-[15px] font-normal text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all ${
                    attemptedSubmit && confirmPassword && password !== confirmPassword
                      ? 'border-[#E25C43] focus:border-[#E25C43] focus:ring-1 focus:ring-[#E25C43]'
                      : passwordsMatch
                        ? 'border-emerald-600 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700'
                        : 'border-gray-300 focus:border-black focus:ring-1 focus:ring-black'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:text-black transition-colors cursor-pointer"
                  aria-label={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {passwordsMatch && (
                <p className="mt-1.5 px-3 text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <Check size={13} strokeWidth={2.5} />
                  <span>Mật khẩu xác nhận đã khớp</span>
                </p>
              )}
            </div>
          )}

          {/* 4. OTP Step (Giao diện 6 ô chuẩn Mindtrip / FinTech hiện đại) */}
          {isOtpStep && (
            <div className="py-2 mb-6">
              <div className="flex items-center justify-between gap-2.5 max-w-[360px] mx-auto">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpInputsRef.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    aria-label={`Chữ số OTP thứ ${idx + 1}`}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className={`w-12 h-14 text-center text-xl font-bold rounded-2xl border transition-all outline-none ${
                      digit
                        ? 'border-black bg-gray-50/50 text-black shadow-xs'
                        : 'border-gray-200 bg-white text-gray-900 hover:border-gray-300 focus:border-black focus:ring-2 focus:ring-black/10'
                    }`}
                  />
                ))}
              </div>

              {/* Hàng đếm ngược gửi lại mã */}
              <div className="mt-5 text-center text-xs text-gray-600 flex items-center justify-center gap-1.5">
                <span>Bạn chưa nhận được mã?</span>
                {countdown > 0 ? (
                  <span className="font-medium text-gray-500">
                    Gửi lại ({countdown}s)
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleResendOtp()}
                    className="inline-flex items-center gap-1 font-bold text-black hover:underline cursor-pointer"
                  >
                    <RefreshCw size={12} />
                    <span>Gửi lại ngay</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <p
              role="alert"
              className="mb-3.5 rounded-2xl bg-red-50 border border-red-200/80 py-2.5 px-3.5 text-xs font-medium text-[#C83E2B] text-center animate-fadeIn"
            >
              {error}
            </p>
          )}

          {/* CTA Button */}
          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={loading}
            className={`w-full min-h-12 rounded-full py-3.5 text-[15px] font-bold text-white transition-all cursor-pointer shadow-sm active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2 ${
              isOtpStep && fullOtp.length < 6
                ? 'bg-black/90 hover:bg-black'
                : 'bg-black hover:bg-gray-900'
            }`}
          >
            {loading && <RefreshCw className="h-4 w-4 animate-spin text-white" />}
            {isEmailStep && 'Tiếp tục với Email'}
            {isLogin && 'Đăng nhập'}
            {isRegister && 'Tạo tài khoản & Tiếp tục'}
            {isOtpStep && 'Xác nhận & Hoàn tất'}
          </button>

          {/* 1-Click Switch between Login & Register (Wanderlog pattern) */}
          {isLogin && (
            <div className="mt-3 text-center text-xs text-gray-600">
              <span>Chưa có tài khoản với email này? </span>
              <button
                type="button"
                onClick={() => switchToRegisterStep(email)}
                className="font-bold text-emerald-800 hover:underline cursor-pointer"
              >
                Tạo tài khoản mới
              </button>
            </div>
          )}
          {isRegister && (
            <div className="mt-3 text-center text-xs text-gray-600">
              <span>Đã có tài khoản? </span>
              <button
                type="button"
                onClick={switchToLoginStep}
                className="font-bold text-emerald-800 hover:underline cursor-pointer"
              >
                Chuyển sang đăng nhập
              </button>
            </div>
          )}
        </div>

        {/* Divider & Google (chỉ hiển thị ở bước Email và Login/Register) */}
        {!isOtpStep && (
          <>
            <div className="flex items-center gap-4 my-4">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs font-medium text-gray-500">hoặc</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={() => void handleGoogleClick()}
              className="flex items-center justify-center gap-3 w-full min-h-12 rounded-full border border-gray-300 bg-white px-6 py-3 text-sm font-bold text-black hover:bg-gray-50 transition-colors mb-4 cursor-pointer shadow-xs active:scale-[0.99]"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span>Tiếp tục với Google</span>
            </button>

            <p className="text-center text-xs font-normal leading-relaxed text-gray-500">
              Bằng cách tiếp tục, bạn đồng ý với Điều khoản dịch vụ và Chính sách bảo mật dữ liệu hành trình của GreenTrip AI.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

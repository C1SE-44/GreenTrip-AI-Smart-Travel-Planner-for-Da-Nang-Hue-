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

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    }
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [countdown]);

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

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setStep('email');
        setEmail('');
        setFullName('');
        setPassword('');
        setShowPassword(false);
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

  useEffect(() => {
    if (step === 'otp') {
      const timer = setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const hasMinLength = password.length >= 8;

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
      setError('Xác thực Google chưa sẵn sàng. Bạn có thể dùng email ở trên.');
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

    // BƯỚC 1: Nhập email -> Tự nhận diện tài khoản cũ hoặc mới
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
        setError(getErrorMessage(err, 'Không thể kết nối máy chủ. Vui lòng thử lại.'));
      } finally {
        setLoading(false);
      }
    }
    // BƯỚC 2A: Đăng nhập (1 ô mật khẩu duy nhất)
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
        setError(getErrorMessage(err, 'Email hoặc mật khẩu không chính xác.'));
      } finally {
        setLoading(false);
      }
    }
    // BƯỚC 2B: Đăng ký tối giản (Tên gợi ý sẵn + 1 ô mật khẩu >= 8 ký tự, không bắt nhập lại mật khẩu lần 2)
    else if (step === 'register') {
      const cleanName = fullName.trim() || suggestDisplayNameFromEmail(email) || email.split('@')[0];
      if (!cleanName) {
        setError('Vui lòng nhập tên hiển thị của bạn.');
        return;
      }
      if (!hasMinLength) {
        setError('Mật khẩu cần có ít nhất 8 ký tự.');
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
    // BƯỚC 3: Xác thực OTP (nếu bật 2FA)
    else if (step === 'otp') {
      const fullOtp = otpDigits.join('');
      if (fullOtp.length < 6) {
        setError('Vui lòng nhập đủ 6 chữ số mã xác thực.');
        return;
      }
      if (!otpSessionToken) {
        setError('Phiên xác thực đã hết hạn. Vui lòng thử lại.');
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
  const showPasswordErrors = isRegister && attemptedSubmit && !hasMinLength;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="greentrip-auth-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[3px] animate-fadeIn"
        onClick={onClose}
      />

      {/* Modal Card — Tối giản, thoáng đãng chuẩn Mindtrip / Wanderlog */}
      <div className="relative w-full max-w-[430px] max-h-[92vh] overflow-y-auto rounded-[26px] bg-white px-7 pt-7 pb-6 shadow-2xl animate-fadeInScale border border-gray-100">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-4">
          {!isEmailStep ? (
            <button
              type="button"
              onClick={() => {
                setStep(isOtpStep ? 'register' : 'email');
                setError('');
                setAttemptedSubmit(false);
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 hover:text-black hover:bg-gray-100 transition-colors cursor-pointer"
              aria-label="Quay lại"
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
              <Leaf size={14} className="text-emerald-600" />
              <span>GreenTrip AI</span>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-colors text-base cursor-pointer"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {isOtpStep && (
          <div className="mb-2">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Mail size={20} />
            </div>
          </div>
        )}

        {/* Title */}
        <h2
          id="greentrip-auth-modal-title"
          className="font-heading text-2xl font-extrabold tracking-tight text-gray-950 leading-tight"
        >
          {isEmailStep &&
            (initialMode === 'register' ? 'Tạo tài khoản miễn phí' : 'Đăng nhập hoặc Đăng ký')}
          {isLogin && 'Chào mừng trở lại'}
          {isRegister && 'Hoàn tất tài khoản'}
          {isOtpStep && 'Nhập mã xác thực'}
        </h2>

        {/* Subtitle ngắn gọn 1 dòng */}
        <p className="mt-1 mb-5 text-sm text-gray-600">
          {isEmailStep && 'Nhập email của bạn để tiếp tục vào hành trình.'}
          {isLogin && 'Nhập mật khẩu để mở các chuyến đi và địa điểm đã lưu.'}
          {isRegister && 'Chỉ cần đặt mật khẩu để bắt đầu lưu lịch trình.'}
          {isOtpStep && `Mã 6 chữ số đã được gửi tới ${email}`}
        </p>

        {/* Form Body */}
        <div>
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
                placeholder="ten@gmail.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && void handleContinue()}
                autoFocus
                className="w-full rounded-2xl border border-gray-300 px-4 py-3.5 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
              />
            </div>
          )}

          {/* 2. Email pill ở bước Login / Register */}
          {(isLogin || isRegister) && (
            <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 mb-3">
              <span className="text-sm font-medium text-gray-800 truncate mr-2">{email}</span>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setPassword('');
                  setError('');
                  setAttemptedSubmit(false);
                }}
                className="text-xs font-bold text-emerald-800 hover:text-black transition-colors shrink-0 cursor-pointer"
              >
                Đổi
              </button>
            </div>
          )}

          {/* 2B. Tên hiển thị (tự điền sẵn từ email, người dùng không bắt buộc phải gõ lại) */}
          {isRegister && (
            <div className="mb-3">
              <label htmlFor="greentrip-auth-fullname" className="block text-xs font-semibold text-gray-700 mb-1">
                Tên của bạn
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
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
              />
            </div>
          )}

          {/* 3. Ô mật khẩu duy nhất (có nút mắt Xem/Ẩn, không bắt gõ lại lần 2) */}
          {(isLogin || isRegister) && (
            <div className="mb-3">
              {isRegister && (
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="greentrip-auth-password" className="text-xs font-semibold text-gray-700">
                    Mật khẩu
                  </label>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium ${
                      hasMinLength
                        ? 'text-emerald-700'
                        : showPasswordErrors
                          ? 'text-[#C83E2B]'
                          : 'text-gray-500'
                    }`}
                  >
                    {hasMinLength && <Check size={13} strokeWidth={2.5} />}
                    <span>{hasMinLength ? 'Đủ 8+ ký tự' : 'Tối thiểu 8 ký tự'}</span>
                  </span>
                </div>
              )}
              <div className="relative">
                <input
                  id="greentrip-auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  placeholder={isLogin ? 'Mật khẩu của bạn' : 'Nhập mật khẩu (từ 8 ký tự)'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && void handleContinue()}
                  autoFocus
                  className={`w-full rounded-2xl border px-4 py-3.5 pr-11 text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all ${
                    showPasswordErrors
                      ? 'border-[#E25C43] focus:border-[#E25C43] focus:ring-1 focus:ring-[#E25C43]'
                      : 'border-gray-300 focus:border-black focus:ring-1 focus:ring-black'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:text-black transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {/* 4. OTP Step */}
          {isOtpStep && (
            <div className="py-2 mb-5">
              <div className="flex items-center justify-between gap-2 max-w-[340px] mx-auto">
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
                    className={`w-11 h-13 text-center text-xl font-bold rounded-xl border transition-all outline-none ${
                      digit
                        ? 'border-black bg-gray-50 text-black'
                        : 'border-gray-200 bg-white text-gray-900 focus:border-black'
                    }`}
                  />
                ))}
              </div>

              <div className="mt-4 text-center text-xs text-gray-600 flex items-center justify-center gap-1.5">
                <span>Chưa nhận được mã?</span>
                {countdown > 0 ? (
                  <span className="font-medium text-gray-500">Gửi lại ({countdown}s)</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleResendOtp()}
                    className="inline-flex items-center gap-1 font-bold text-black hover:underline cursor-pointer"
                  >
                    <RefreshCw size={12} />
                    <span>Gửi lại</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <p
              role="alert"
              className="mb-3 rounded-xl bg-red-50 border border-red-200/80 py-2 px-3 text-xs font-medium text-[#C83E2B] text-center animate-fadeIn"
            >
              {error}
            </p>
          )}

          {/* CTA Button */}
          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={loading}
            className="w-full min-h-12 rounded-2xl py-3.5 text-[15px] font-bold text-white bg-black hover:bg-gray-900 transition-all cursor-pointer shadow-xs active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <RefreshCw className="h-4 w-4 animate-spin text-white" />}
            {isEmailStep && 'Tiếp tục'}
            {isLogin && 'Đăng nhập'}
            {isRegister && 'Tạo tài khoản'}
            {isOtpStep && 'Xác nhận'}
          </button>

          {/* Chuyển nhanh 1 chạm */}
          {isLogin && (
            <div className="mt-3 text-center text-xs text-gray-600">
              <span>Chưa có tài khoản? </span>
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
                Đăng nhập
              </button>
            </div>
          )}
        </div>

        {/* Google Login (chỉ hiển thị ở bước Email để giao diện bước Mật khẩu thật gọn) */}
        {isEmailStep && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">hoặc</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={() => void handleGoogleClick()}
              className="flex items-center justify-center gap-2.5 w-full min-h-12 rounded-2xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer"
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
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Mail,
  Check,
  X,
} from 'lucide-react';
import GoogleSignInButton from './GoogleSignInButton';
import PasswordStrengthField from './PasswordStrengthField';
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
  const [password, setPassword] = useState('');

  // 6 ô OTP rời
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [otpSessionToken, setOtpSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleSuccess, setGoogleSuccess] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);

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
        setPassword('');
        setGoogleBusy(false);
        setGoogleSuccess(false);
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
      setGoogleBusy(true);
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) {
            setGoogleBusy(false);
            return;
          }
          try {
            setLoading(true);
            const res = await googleLogin(response.credential);
            setGoogleBusy(false);
            setGoogleSuccess(true);
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
            setGoogleBusy(false);
            setGoogleSuccess(false);
            setError(getErrorMessage(err, 'Đăng nhập Google thất bại. Vui lòng thử lại.'));
          } finally {
            setLoading(false);
          }
        },
      });

      window.google.accounts.id.prompt();
    } catch (err: unknown) {
      setGoogleBusy(false);
      setError(getErrorMessage(err, 'Không thể mở xác thực Google.'));
    }
  };

  const switchToRegisterStep = () => {
    setStep('register');
    setError('');
    setAttemptedSubmit(false);
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
          switchToRegisterStep();
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
    // BƯỚC 2B: Đăng ký tối giản (chỉ Email + 1 ô Mật khẩu >= 8 ký tự, tự động tạo tên từ email)
    else if (step === 'register') {
      const cleanName = suggestDisplayNameFromEmail(email) || email.split('@')[0] || 'Du khách';
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

  const headerTitle = isEmailStep
    ? initialMode === 'register'
      ? 'Tạo tài khoản'
      : 'Đăng nhập hoặc đăng ký'
    : isLogin
      ? 'Đăng nhập'
      : isRegister
        ? 'Hoàn tất đăng ký'
        : 'Xác thực email';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="greentrip-auth-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-neutral-950/50 backdrop-blur-[2px] animate-fadeIn"
        onClick={onClose}
      />

      {/* Modal Card — Chuẩn Airbnb Web Logging in (header phân tách + body thoáng) */}
      <div className="relative w-full max-w-[480px] max-h-[92vh] flex flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_18px_50px_rgba(28,25,23,0.22)] animate-fadeInScale border border-neutral-200/80">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-5 min-h-[60px] border-b border-neutral-200 shrink-0">
          {!isEmailStep ? (
            <button
              type="button"
              onClick={() => {
                setStep(isOtpStep ? 'register' : 'email');
                setError('');
                setAttemptedSubmit(false);
              }}
              className="h-10 w-10 rounded-full flex items-center justify-center text-neutral-800 hover:text-neutral-950 hover:bg-neutral-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              aria-label="Quay lại"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="h-10 w-10 rounded-full flex items-center justify-center text-neutral-800 hover:text-neutral-950 hover:bg-neutral-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              aria-label="Đóng"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}

          <span className="text-[15px] font-bold text-neutral-950 tracking-tight">
            {headerTitle}
          </span>

          {!isEmailStep ? (
            <button
              type="button"
              onClick={onClose}
              className="h-10 w-10 rounded-full flex items-center justify-center text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              aria-label="Đóng"
            >
              <X size={18} aria-hidden="true" />
            </button>
          ) : (
            <div className="h-10 w-10" aria-hidden="true" />
          )}
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto overscroll-contain px-6 sm:px-7 py-6">
          {isOtpStep && (
            <div className="mb-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center">
                <Mail size={20} aria-hidden="true" />
              </div>
            </div>
          )}

          {/* Welcome Heading — Ấm áp chuẩn Airbnb Style 3 */}
          <h2
            id="greentrip-auth-modal-title"
            className={`font-heading text-[22px] font-semibold tracking-tight text-neutral-950 leading-snug ${
              isOtpStep ? 'mb-1.5' : 'mb-5'
            }`}
          >
            {isEmailStep && 'Chào mừng đến với GreenTrip'}
            {isLogin && 'Chào mừng trở lại'}
            {isRegister && 'Tạo mật khẩu cho tài khoản'}
            {isOtpStep && 'Nhập mã xác thực'}
          </h2>

          {isOtpStep && (
            <p className="mb-5 text-sm text-neutral-600 leading-relaxed">
              Mã 6 chữ số đã được gửi tới <strong className="font-semibold text-neutral-900">{email}</strong>
            </p>
          )}

          {/* Form Body */}
          <div>
            {/* 1. Email Step */}
            {isEmailStep && (
              <div className="mb-4">
                <label
                  htmlFor="greentrip-auth-email"
                  className="block text-xs font-semibold text-neutral-700 mb-1.5"
                >
                  Địa chỉ email
                </label>
                <input
                  id="greentrip-auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  placeholder="ten@gmail.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && void handleContinue()}
                  className="w-full min-h-12 rounded-xl border border-neutral-400 bg-white px-4 py-3 text-[15px] text-neutral-950 placeholder:text-neutral-500 focus:border-neutral-950 focus:outline-none focus:ring-2 focus:ring-neutral-950/15 transition-colors"
                />
                <p className="mt-2 text-xs text-neutral-600 leading-relaxed">
                  Chúng tôi sẽ tự động nhận diện email để đăng nhập hoặc tạo tài khoản mới.
                </p>
              </div>
            )}

            {/* 2. Email summary bar ở bước Login / Register */}
            {(isLogin || isRegister) && (
              <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 mb-4">
                <span className="text-sm font-medium text-neutral-900 truncate mr-2">{email}</span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setPassword('');
                    setError('');
                    setAttemptedSubmit(false);
                    setShowForgotHelp(false);
                  }}
                  className="min-h-8 px-2 text-xs font-semibold text-emerald-800 hover:text-neutral-950 underline underline-offset-2 transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded"
                >
                  Đổi email
                </button>
              </div>
            )}

            {/* 3. Ô mật khẩu duy nhất */}
            {(isLogin || isRegister) && (
              <div className="mb-4">
                <PasswordStrengthField
                  id="greentrip-auth-password"
                  name="password"
                  label="Mật khẩu"
                  value={password}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  placeholder={isLogin ? 'Nhập mật khẩu của bạn' : 'Nhập mật khẩu (từ 8 ký tự)'}
                  hasError={showPasswordErrors}
                  showStrength={isRegister}
                  onChange={(nextVal) => {
                    setPassword(nextVal);
                    if (error) setError('');
                  }}
                  onEnter={() => void handleContinue()}
                  headerRight={
                    isRegister ? (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          hasMinLength
                            ? 'text-emerald-800'
                            : showPasswordErrors
                              ? 'text-rose-700'
                              : 'text-neutral-600'
                        }`}
                      >
                        {hasMinLength && <Check size={13} strokeWidth={2.5} aria-hidden="true" />}
                        <span>{hasMinLength ? 'Đủ 8+ ký tự' : 'Tối thiểu 8 ký tự'}</span>
                      </span>
                    ) : null
                  }
                />
              </div>
            )}

            {/* 4. OTP Step */}
            {isOtpStep && (
              <div className="py-2 mb-5">
                <div className="flex items-center justify-between gap-2 max-w-[356px] mx-auto">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputsRef.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      spellCheck={false}
                      autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      aria-label={`Chữ số OTP thứ ${idx + 1}`}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      className={`w-11 h-12 sm:w-12 sm:h-13 text-center text-xl font-bold rounded-xl border transition-colors outline-none focus:ring-2 focus:ring-neutral-950/15 ${
                        digit
                          ? 'border-neutral-950 bg-neutral-50 text-neutral-950'
                          : 'border-neutral-300 bg-white text-neutral-950 focus:border-neutral-950'
                      }`}
                    />
                  ))}
                </div>

                <div className="mt-4 text-center text-xs text-neutral-600 flex items-center justify-center gap-1.5">
                  <span>Chưa nhận được mã?</span>
                  {countdown > 0 ? (
                    <span className="font-medium text-neutral-700 tabular-nums">Gửi lại ({countdown}s)</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleResendOtp()}
                      className="inline-flex items-center gap-1 font-semibold text-neutral-950 underline underline-offset-2 hover:text-emerald-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded"
                    >
                      <RefreshCw size={12} aria-hidden="true" />
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
                className="mb-4 rounded-xl bg-rose-50 border border-rose-200 py-2.5 px-3.5 text-xs font-medium text-rose-800 text-center animate-fadeIn"
              >
                {error}
              </p>
            )}

            {/* Primary CTA — Eco Accent chuẩn 60-30-10 & Airbnb Logging in */}
            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={loading}
              className="w-full min-h-12 rounded-xl py-3.5 text-[15px] font-semibold text-white bg-emerald-800 hover:bg-emerald-900 transition-colors cursor-pointer shadow-xs active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
            >
              {loading && <RefreshCw className="h-4 w-4 animate-spin text-white" aria-hidden="true" />}
              {isEmailStep && 'Tiếp tục'}
              {isLogin && 'Đăng nhập'}
              {isRegister && 'Tạo tài khoản'}
              {isOtpStep && 'Xác nhận'}
            </button>

            {/* Quên mật khẩu & Chuyển nhanh 1 chạm */}
            {isLogin && (
              <div className="mt-4 space-y-2.5 text-center text-xs text-neutral-600">
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                  <button
                    type="button"
                    onClick={() => setShowForgotHelp((prev) => !prev)}
                    className="min-h-8 px-1 font-medium text-neutral-700 underline underline-offset-2 hover:text-emerald-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded"
                  >
                    Quên mật khẩu?
                  </button>
                  <span aria-hidden="true" className="text-neutral-300">•</span>
                  <div>
                    <span>Chưa có tài khoản? </span>
                    <button
                      type="button"
                      onClick={switchToRegisterStep}
                      className="font-semibold text-emerald-800 underline underline-offset-2 hover:text-neutral-950 cursor-pointer"
                    >
                      Tạo tài khoản mới
                    </button>
                  </div>
                </div>
                {showForgotHelp && (
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-950 leading-relaxed text-left">
                    Mẹo: Nếu bạn từng đăng nhập bằng Google với email <span className="font-semibold">{email}</span>, hãy quay lại bước trước và chọn <strong>Tiếp tục với Google</strong> để vào ngay không cần mật khẩu.
                  </p>
                )}
              </div>
            )}
            {isRegister && (
              <div className="mt-4 text-center text-xs text-neutral-600">
                <span>Đã có tài khoản? </span>
                <button
                  type="button"
                  onClick={switchToLoginStep}
                  className="font-semibold text-emerald-800 underline underline-offset-2 hover:text-neutral-950 cursor-pointer"
                >
                  Đăng nhập
                </button>
              </div>
            )}
          </div>

          {/* Google Login — Outlined full-width chuẩn Airbnb Logging in */}
          {isEmailStep && (
            <>
              <div className="flex items-center gap-3 my-5">
                <div className="h-px flex-1 bg-neutral-200" />
                <span className="text-xs font-medium text-neutral-600">hoặc</span>
                <div className="h-px flex-1 bg-neutral-200" />
              </div>

              <GoogleSignInButton
                busy={googleBusy}
                success={googleSuccess}
                disabled={loading}
                onClick={() => void handleGoogleClick()}
              />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

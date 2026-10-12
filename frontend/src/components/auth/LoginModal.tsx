import { useEffect, useState, useRef, FormEvent, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Eye, EyeOff, Facebook, CheckCircle2, AlertCircle, AlertTriangle, Leaf, Loader2, Sparkles } from 'lucide-react';
import { login, signup, googleLogin, ApiError } from '@/services/auth';
import { VerifyOtpModal } from '@/components/auth/VerifyOtpModal';
import PasswordStrength from '@/components/ui/PasswordStrength';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
  onLoginSuccess?: () => void;
  onRegisterSuccess?: () => void;
}

export default function LoginModal({
  isOpen,
  onClose,
  initialMode = 'login',
  onLoginSuccess,
  onRegisterSuccess,
}: LoginModalProps) {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const navigate = useNavigate();
  const location = useLocation();

  // Input refs for auto-focus
  const emailInputRef = useRef<HTMLInputElement>(null);
  const fullNameInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Caps Lock detection
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);

  // Validation errors
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
  }>({});

  // UI status states
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  // 2FA OTP Modal for Google login
  const [otpModal, setOtpModal] = useState<{
    isOpen: boolean;
    email: string;
    token: string;
  }>({
    isOpen: false,
    email: '',
    token: '',
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync mode whenever initialMode or isOpen changes
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMsg(null);
      setSuccessMsg(null);
      setNoticeMsg(null);
      setFieldErrors({});
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, initialMode]);

  // Auto-focus on the first relevant input (Mẹo 8)
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (mode === 'register') {
          fullNameInputRef.current?.focus();
        } else {
          emailInputRef.current?.focus();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, mode]);

  // Reset inputs when modal closes
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setFullName('');
        setEmail('');
        setPassword('');
        setErrorMsg(null);
        setSuccessMsg(null);
        setNoticeMsg(null);
        setFieldErrors({});
        setShowPassword(false);
        setIsCapsLockOn(false);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Setup Google Identity Services button inside the modal
  useEffect(() => {
    if (!isOpen) return;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const setupGoogle = () => {
      if (!window.google?.accounts?.id) return false;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) return;
          setGoogleLoading(true);
          setErrorMsg(null);
          try {
            const res = await googleLogin(response.credential);
            if (res.require_otp) {
              setOtpModal({
                isOpen: true,
                email: res.email,
                token: res.otp_session_token,
              });
            } else {
              // Direct login
              window.dispatchEvent(new Event('auth-change'));
              if (onLoginSuccess) {
                onLoginSuccess();
              } else {
                handleModalClose();
                navigate('/explore');
              }
            }
          } catch (err) {
            if (err instanceof ApiError) {
              setErrorMsg(err.message);
            } else {
              setErrorMsg('Đăng nhập với Google thất bại. Vui lòng thử lại.');
            }
          } finally {
            setGoogleLoading(false);
          }
        },
      });

      const btnContainer = document.getElementById('googleModalSignInBtn');
      if (btnContainer) {
        btnContainer.innerHTML = '';
        window.google.accounts.id.renderButton(btnContainer, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: mode === 'login' ? 'signin_with' : 'signup_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: 380,
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
  }, [isOpen, mode, onLoginSuccess, navigate]);

  const handleFacebookClick = () => {
    setErrorMsg(null);
    setNoticeMsg('Tính năng đăng nhập qua Facebook đang trong quá trình tích hợp. Vui lòng chọn Google hoặc nhập Email!');
  };

  const switchToMode = (newMode: 'login' | 'register') => {
    setErrorMsg(null);
    setNoticeMsg(null);
    setFieldErrors({});
    setMode(newMode);
    if (location.pathname === '/login' || location.pathname === '/register') {
      navigate(`/${newMode}`, { replace: true });
    }
  };

  const handleModalClose = () => {
    onClose();
    if (location.pathname === '/login' || location.pathname === '/register') {
      navigate('/', { replace: true });
    }
  };

  // Caps Lock detection handler (Mẹo 12)
  const handleKeyModifier = (e: KeyboardEvent<HTMLInputElement>) => {
    setIsCapsLockOn(e.getModifierState('CapsLock'));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNoticeMsg(null);

    // Mẹo 14: Inline field validation
    const errs: { fullName?: string; email?: string; password?: string } = {};

    if (mode === 'register' && !fullName.trim()) {
      errs.fullName = 'Vui lòng nhập họ và tên của bạn.';
    }

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      errs.email = 'Vui lòng nhập địa chỉ email.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      errs.email = 'Vui lòng nhập đúng định dạng email (ví dụ: name@gmail.com).';
    }

    if (!password) {
      errs.password = 'Vui lòng nhập mật khẩu.';
    } else if (password.length < 8) {
      errs.password = 'Mật khẩu phải có tối thiểu 8 ký tự.';
    }

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (mode === 'register') {
      setLoading(true);
      try {
        await signup({
          full_name: fullName.trim(),
          email: cleanEmail,
          password,
        });
        setSuccessMsg(
          `Chúng tôi đã gửi email kích hoạt đến ${cleanEmail}. Vui lòng kiểm tra hộp thư (cả mục Spam) để kích hoạt tài khoản!`
        );
        if (onRegisterSuccess) onRegisterSuccess();
      } catch (err) {
        if (err instanceof ApiError) {
          setErrorMsg(err.message);
        } else {
          setErrorMsg('Đăng ký tài khoản thất bại. Vui lòng thử lại sau.');
        }
      } finally {
        setLoading(false);
      }
    } else {
      // Login mode
      setLoading(true);
      try {
        const res = await login({
          email: cleanEmail,
          password,
        });

        // Mẹo 9: Remember Me preference
        if (rememberMe) {
          localStorage.setItem('access_token', res.access_token);
        } else {
          sessionStorage.setItem('access_token', res.access_token);
        }

        window.dispatchEvent(new Event('auth-change'));
        if (onLoginSuccess) {
          onLoginSuccess();
        } else {
          handleModalClose();
          navigate('/explore');
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setErrorMsg(err.message);
        } else {
          setErrorMsg('Đăng nhập thất bại. Vui lòng kiểm tra email và mật khẩu.');
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const handleOtpSuccess = (accessToken: string) => {
    if (rememberMe) {
      localStorage.setItem('access_token', accessToken);
    } else {
      sessionStorage.setItem('access_token', accessToken);
    }
    setOtpModal({ isOpen: false, email: '', token: '' });
    window.dispatchEvent(new Event('auth-change'));
    if (onLoginSuccess) {
      onLoginSuccess();
    } else {
      handleModalClose();
      navigate('/explore');
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={handleModalClose}
        />

        {/* Modal Card - Wanderlog rounded shape */}
        <div className="relative z-10 w-full max-w-[490px] max-h-[92vh] overflow-y-auto rounded-[32px] bg-white p-6 sm:p-8 shadow-2xl animate-fadeInScale border border-white/60">
          {/* Close Button */}
          <button
            onClick={handleModalClose}
            className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:text-black hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <X size={20} />
          </button>

          {/* Header Title */}
          <div className="text-center pt-1 pb-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-forest-50 text-forest-700 text-xs font-medium mb-2.5">
              <Leaf size={13} className="text-forest-600" />
              <span>GreenTrip AI · Du lịch xanh thông minh</span>
            </div>
            <h2 className="font-heading text-2xl sm:text-[26px] font-bold text-gray-900 tracking-tight leading-tight">
              {mode === 'login' ? 'Đăng nhập để xem trang này' : 'Đăng ký để xem trang này'}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-gray-500 font-light">
              {mode === 'login'
                ? 'Đăng nhập để lưu lịch trình và tối ưu hóa chuyến đi của bạn.'
                : 'Tạo tài khoản miễn phí chỉ trong vài giây.'}
            </p>

            {/* Mẹo 1: Value Proposition banner in register mode */}
            {mode === 'register' && (
              <div className="mt-3 text-left rounded-2xl bg-forest-50/80 border border-forest-100 p-3 sm:p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-forest-800">
                  <Sparkles size={14} className="text-forest-600 shrink-0" />
                  <span>Lợi ích khi có tài khoản GreenTrip:</span>
                </div>
                <ul className="mt-1.5 space-y-1 text-[11.5px] sm:text-[12px] text-forest-700 leading-snug">
                  <li className="flex items-center gap-1.5">
                    <span className="text-forest-500 font-bold">•</span>
                    <span>Lưu & đồng bộ lịch trình cá nhân hóa với trợ lý AI</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-forest-500 font-bold">•</span>
                    <span>Tối ưu hóa cung đường và theo dõi chỉ số giảm phát thải CO₂</span>
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* Success Notification after Registration */}
          {successMsg ? (
            <div className="py-4 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-forest-600">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Đăng ký thành công!</h3>
              <p className="text-sm text-gray-600 leading-relaxed px-2">
                {successMsg}
              </p>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setSuccessMsg(null);
                    switchToMode('login');
                  }}
                  className="w-full rounded-full bg-forest-600 hover:bg-forest-700 py-3 text-sm font-semibold text-white shadow-sm transition-all cursor-pointer"
                >
                  Chuyển sang Đăng nhập ngay
                </button>
                <button
                  onClick={handleModalClose}
                  className="text-xs text-gray-500 hover:underline pt-1 cursor-pointer"
                >
                  Để sau
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Social Login Buttons (Wanderlog style on top) */}
              <div className="space-y-2.5">
                {/* Facebook Button */}
                <button
                  type="button"
                  onClick={handleFacebookClick}
                  className="flex w-full items-center justify-center gap-3 rounded-full bg-[#1877F2] hover:bg-[#166fe5] px-5 py-3 text-[14px] font-semibold text-white shadow-sm transition-all cursor-pointer"
                >
                  <Facebook size={18} fill="currentColor" strokeWidth={0} />
                  <span>{mode === 'login' ? 'Đăng nhập bằng Facebook' : 'Đăng ký bằng Facebook'}</span>
                </button>

                {/* Google Button */}
                <div className="w-full flex justify-center min-h-[42px]">
                  <div id="googleModalSignInBtn" className="w-full flex justify-center" />
                </div>
              </div>

              {/* Informative notice (e.g. for Facebook) */}
              {noticeMsg && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
                  <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                  <span>{noticeMsg}</span>
                </div>
              )}

              {/* Divider */}
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400 font-light">hoặc</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              {/* Form Input fields */}
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {/* Mẹo 10: Clear labels + descriptive placeholders */}
                {/* Full name input (Only in register mode) */}
                {mode === 'register' && (
                  <div>
                    <label className="block mb-1 text-xs font-semibold text-gray-700">
                      Họ và tên
                    </label>
                    <input
                      ref={fullNameInputRef}
                      type="text"
                      placeholder="vd: Nguyễn Văn A"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                      }}
                      className={`w-full rounded-2xl border px-4 py-2.5 sm:py-3 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all ${fieldErrors.fullName
                          ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-50/20'
                          : 'border-gray-300 focus:border-black focus:ring-1 focus:ring-black'
                        }`}
                    />
                    {fieldErrors.fullName && (
                      <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle size={12} className="shrink-0" /> {fieldErrors.fullName}
                      </p>
                    )}
                  </div>
                )}

                {/* Email input */}
                <div>
                  <label className="block mb-1 text-xs font-semibold text-gray-700">
                    Email
                  </label>
                  <input
                    ref={emailInputRef}
                    type="email"
                    placeholder="vd: travel@greentrip.vn"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    className={`w-full rounded-2xl border px-4 py-2.5 sm:py-3 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all ${fieldErrors.email
                        ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-50/20'
                        : 'border-gray-300 focus:border-black focus:ring-1 focus:ring-black'
                      }`}
                  />
                  {fieldErrors.email && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle size={12} className="shrink-0" /> {fieldErrors.email}
                    </p>
                  )}
                </div>

                {/* Password input */}
                <div>
                  <label className="block mb-1 text-xs font-semibold text-gray-700">
                    Mật khẩu
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Tối thiểu 8 ký tự, gồm chữ và số"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                      }}
                      onKeyDown={handleKeyModifier}
                      onKeyUp={handleKeyModifier}
                      className={`w-full rounded-2xl border px-4 py-2.5 sm:py-3 pr-11 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all ${fieldErrors.password
                          ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-50/20'
                          : 'border-gray-300 focus:border-black focus:ring-1 focus:ring-black'
                        }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors cursor-pointer"
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  {/* Mẹo 12: Caps Lock warning */}
                  {isCapsLockOn && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 animate-fadeIn">
                      <AlertTriangle size={13} className="shrink-0 text-amber-600" />
                      <span>Phím Caps Lock đang bật (chú ý chữ hoa/thường)</span>
                    </div>
                  )}

                  {/* Mẹo 13: Password strength meter in register mode */}
                  {mode === 'register' && password.length > 0 && (
                    <PasswordStrength password={password} />
                  )}

                  {/* Inline error for password */}
                  {fieldErrors.password && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle size={12} className="shrink-0" /> {fieldErrors.password}
                    </p>
                  )}
                </div>

                {/* Mẹo 9: Remember Me + Forgot Password in login mode */}
                {mode === 'login' && (
                  <div className="flex items-center justify-between pt-0.5">
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black cursor-pointer accent-black"
                      />
                      <span>Ghi nhớ đăng nhập</span>
                    </label>
                    <span
                      onClick={() =>
                        setNoticeMsg('Vui lòng liên hệ quản trị viên hoặc kiểm tra email của bạn để được hỗ trợ cấp lại mật khẩu.')
                      }
                      className="text-xs text-gray-500 hover:text-black hover:underline cursor-pointer"
                    >
                      Quên mật khẩu?
                    </span>
                  </div>
                )}

                {/* General Backend Error message */}
                {errorMsg && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-600 border border-red-200">
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Primary Action Button (Black Pill matching Landing Page) */}
                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-black hover:bg-gray-900 py-3.5 text-[15px] font-bold text-white shadow-sm hover:shadow transition-all disabled:opacity-60 cursor-pointer"
                >
                  {loading && <Loader2 size={18} className="animate-spin" />}
                  {mode === 'login' ? 'Đăng nhập' : 'Đăng ký bằng email'}
                </button>
              </form>

              {/* Bottom Switch Tab */}
              <div className="mt-4 text-center text-xs sm:text-[13px] text-gray-500">
                {mode === 'login' ? (
                  <p>
                    Chưa có tài khoản?{' '}
                    <button
                      type="button"
                      onClick={() => switchToMode('register')}
                      className="font-bold text-black hover:underline cursor-pointer"
                    >
                      Đăng ký
                    </button>
                  </p>
                ) : (
                  <p>
                    Đã có tài khoản?{' '}
                    <button
                      type="button"
                      onClick={() => switchToMode('login')}
                      className="font-bold text-black hover:underline cursor-pointer"
                    >
                      Đăng nhập
                    </button>
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2FA OTP Modal for Google verification */}
      <VerifyOtpModal
        isOpen={otpModal.isOpen}
        email={otpModal.email}
        otpSessionToken={otpModal.token}
        onSuccess={handleOtpSuccess}
        onClose={() => setOtpModal({ isOpen: false, email: '', token: '' })}
      />
    </>,
    document.body
  );
}

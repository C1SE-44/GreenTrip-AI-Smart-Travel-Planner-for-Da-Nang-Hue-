import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, RefreshCw, Mail } from 'lucide-react';
import { login, signup, googleLogin, checkEmail, verifyOtp, resendOtp, ApiError } from '@/services/auth';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
  onLoginSuccess?: () => void;
  onRegisterSuccess?: () => void;
}

// Mock "database" mẫu dự phòng
const MOCK_USERS: Record<string, string> = {
  'admin@gmail.com': '1111',
};

type Step = 'email' | 'login' | 'register' | 'otp';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
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

  // Khóa cuộn trang khi modal mở
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Reset form khi đóng modal
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setStep('email');
        setEmail('');
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

  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  const handleOtpChange = (index: number, value: string) => {
    const cleanVal = value.replace(/\D/g, '');

    // Nếu paste cả chuỗi (vd paste 6 số)
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

    // Tự động nhảy sang ô tiếp theo
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
      handleContinue();
    }
  };

  const handleResendOtp = async () => {
    if (!email) return;
    setError('');
    try {
      if (otpSessionToken) {
        await resendOtp({
          email: email.trim().toLowerCase(),
          otp_session_token: otpSessionToken,
        });
      }
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
      setError('Đang chuẩn bị xác thực Google...');
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
              window.dispatchEvent(new Event('auth-change'));
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

  const handleContinue = async () => {
    setError('');
    setAttemptedSubmit(true);

    // BƯỚC 1: Nhập email (Tự động kiểm tra tài khoản đã tồn tại hay chưa)
    if (step === 'email') {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        setError('Vui lòng nhập email hợp lệ.');
        return;
      }
      setLoading(true);
      try {
        const check = await checkEmail(cleanEmail);
        setAttemptedSubmit(false);
        if (check.exists) {
          setStep('login');
        } else {
          setStep('register');
        }
      } catch {
        // Fallback kiểm tra mock nếu offline hoặc kiểm tra ban đầu
        if (MOCK_USERS[cleanEmail] || initialMode === 'login') {
          setStep('login');
        } else {
          setStep('register');
        }
      } finally {
        setLoading(false);
      }
    }
    // BƯỚC 2A: Đăng nhập (tài khoản đã tồn tại)
    else if (step === 'login') {
      setLoading(true);
      try {
        const res = await login({ email: email.trim().toLowerCase(), password });
        localStorage.setItem('access_token', res.access_token);
        window.dispatchEvent(new Event('auth-change'));
        onClose();
        if (onLoginSuccess) {
          onLoginSuccess();
        } else {
          navigate('/explore');
        }
      } catch (err: unknown) {
        // Fallback kiểm tra mock nếu offline hoặc tài khoản mẫu
        const correctPass = MOCK_USERS[email.toLowerCase()];
        if (correctPass && password === correctPass) {
          localStorage.setItem('access_token', 'mock-user-token');
          window.dispatchEvent(new Event('auth-change'));
          onClose();
          if (onLoginSuccess) onLoginSuccess();
          else navigate('/explore');
          return;
        }
        setError(getErrorMessage(err, 'Mật khẩu không đúng, vui lòng thử lại.'));
      } finally {
        setLoading(false);
      }
    }
    // BƯỚC 2B: Thiết lập mật khẩu đăng ký
    else if (step === 'register') {
      if (!hasUppercase || !hasNumber || !hasSymbol) {
        return;
      }
      if (!confirmPassword) {
        setError('Vui lòng nhập lại mật khẩu.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Mật khẩu nhập lại không khớp.');
        return;
      }

      setLoading(true);
      try {
        const res = await signup({
          full_name: email.split('@')[0],
          email: email.trim().toLowerCase(),
          password,
        });

        if (res.access_token || !res.require_otp) {
          window.dispatchEvent(new Event('auth-change'));
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
          setError('Email đã được đăng ký. Vui lòng nhập mật khẩu để đăng nhập.');
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

      setLoading(true);
      try {
        if (otpSessionToken) {
          const res = await verifyOtp({
            email: email.trim().toLowerCase(),
            otp_code: fullOtp,
            otp_session_token: otpSessionToken,
          });
          localStorage.setItem('access_token', res.access_token);
        } else {
          localStorage.setItem('access_token', 'mock-user-token');
        }

        window.dispatchEvent(new Event('auth-change'));
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
  const showPasswordErrors = isRegister && attemptedSubmit && (!hasUppercase || !hasNumber || !hasSymbol);
  const fullOtp = otpDigits.join('');

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[4px] animate-fadeIn"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-[480px] max-h-[92vh] overflow-y-auto rounded-[28px] bg-white px-9 pt-9 pb-8 shadow-2xl animate-fadeInScale border border-gray-100/80">
        {/* Navigation Top Bar: Back & Close Buttons */}
        <div className="flex items-center justify-between mb-5">
          {isOtpStep ? (
            <button
              onClick={() => {
                setStep('register');
                setError('');
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition-colors cursor-pointer"
              aria-label="Quay lại"
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <div className="w-9 h-9" />
          )}

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-colors text-base cursor-pointer"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {/* Header Icon & Brand Badge */}
        <div className="flex items-center gap-2 mb-2">
          {isOtpStep ? (
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
              <Mail size={20} />
            </div>
          ) : (
            <span className="text-3xl leading-none">👋</span>
          )}
        </div>

        {/* Title */}
        <h2 className="font-heading text-[1.65rem] font-extrabold tracking-tight text-gray-950 leading-tight">
          {isEmailStep && 'Welcome to GreenTrip'}
          {isLogin && 'Chào mừng trở lại!'}
          {isRegister && 'Tạo tài khoản'}
          {isOtpStep && 'Xác thực tài khoản'}
        </h2>

        {/* Subtitle */}
        {isLogin && (
          <p className="mt-1.5 mb-6 text-[14px] font-normal text-gray-500">
            Nhập mật khẩu để tiếp tục.
          </p>
        )}
        {isRegister && (
          <p className="mt-1.5 mb-6 text-[14px] font-normal text-gray-500">
            Đăng ký GreenTrip nhanh chóng và miễn phí.
          </p>
        )}
        {isOtpStep && (
          <p className="mt-1.5 mb-6 text-[14px] font-normal text-gray-500 leading-relaxed">
            Mã xác thực 6 chữ số đã được gửi tới Gmail:
            <br />
            <span className="font-semibold text-gray-900 inline-flex items-center gap-1.5 mt-0.5">
              {email}
            </span>
          </p>
        )}

        {/* Form Body */}
        <div className={isEmailStep ? 'mt-4' : 'mt-0'}>
          {/* 1. Email Step */}
          {isEmailStep && (
            <input
              type="email"
              placeholder="Email của bạn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
              autoFocus
              className="w-full rounded-full border border-gray-300 px-5 py-3.5 text-[15px] font-normal text-gray-900 placeholder:text-gray-400 placeholder:font-light focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all mb-3"
            />
          )}

          {/* 2. Email preview pill (khi ở bước Login hoặc Register) */}
          {(isLogin || isRegister) && (
            <div className="flex items-center justify-between rounded-full border border-gray-200 bg-gray-50/80 px-5 py-3 mb-3">
              <span className="text-[14px] font-normal text-gray-700 truncate mr-2">{email}</span>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setPassword('');
                  setConfirmPassword('');
                  setError('');
                }}
                className="text-[13px] font-bold text-gray-600 hover:text-black transition-colors shrink-0 cursor-pointer"
              >
                Đổi
              </button>
            </div>
          )}

          {/* 3. Password input (Login hoặc Register) */}
          {(isLogin || isRegister) && (
            <div className="relative mb-2">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
                autoFocus
                className={`w-full rounded-full border px-5 py-3.5 pr-12 text-[15px] font-normal text-gray-900 placeholder:text-gray-400 placeholder:font-light focus:outline-none transition-all ${
                  showPasswordErrors
                    ? 'border-[#E25C43] focus:border-[#E25C43] focus:ring-1 focus:ring-[#E25C43]'
                    : 'border-gray-300 focus:border-black focus:ring-1 focus:ring-black'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors cursor-pointer"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          )}

          {/* Registration Password Requirements Checklist */}
          {showPasswordErrors && (
            <div className="mb-3 px-2 text-[13px] text-[#E25C43] flex flex-col gap-1 font-normal">
              {!hasUppercase && <span>• Phải chứa ít nhất một chữ cái viết hoa.</span>}
              {!hasNumber && <span>• Phải chứa ít nhất một số</span>}
              {!hasSymbol && <span>• Phải chứa ít nhất một ký hiệu</span>}
            </div>
          )}

          {/* Confirm Password input (chỉ ở bước Đăng ký) */}
          {isRegister && (
            <div className="relative mb-3">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Nhập lại mật khẩu"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
                className={`w-full rounded-full border px-5 py-3.5 pr-12 text-[15px] font-normal text-gray-900 placeholder:text-gray-400 placeholder:font-light focus:outline-none transition-all ${
                  attemptedSubmit && confirmPassword && password !== confirmPassword
                    ? 'border-[#E25C43] focus:border-[#E25C43] focus:ring-1 focus:ring-[#E25C43]'
                    : 'border-gray-300 focus:border-black focus:ring-1 focus:ring-black'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors cursor-pointer"
                aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
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
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
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
              <div className="mt-5 text-center text-[13px] text-gray-500 flex items-center justify-center gap-1.5">
                <span>Bạn chưa nhận được mã?</span>
                {countdown > 0 ? (
                  <span className="font-medium text-gray-400">
                    Gửi lại ({countdown}s)
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
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
            <p className="mb-3.5 text-[13.5px] font-normal text-[#E25C43] px-2 text-center animate-fadeIn">
              {error}
            </p>
          )}

          {/* CTA Button */}
          <button
            onClick={handleContinue}
            disabled={loading}
            className={`w-full rounded-full py-3.5 text-[15px] font-bold text-white transition-all cursor-pointer shadow-sm active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2 ${
              isOtpStep && fullOtp.length < 6
                ? 'bg-black/90 hover:bg-black'
                : 'bg-black hover:bg-gray-900'
            }`}
          >
            {loading && <RefreshCw className="h-4 w-4 animate-spin text-white" />}
            {isEmailStep && 'Tiếp tục'}
            {isLogin && 'Đăng nhập'}
            {isRegister && 'Tiếp tục'}
            {isOtpStep && 'Xác nhận & Hoàn tất'}
          </button>
        </div>

        {/* Divider & Google (chỉ hiển thị ở bước Email và Login/Register) */}
        {!isOtpStep && (
          <>
            <div className="flex items-center gap-4 my-5">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-sm font-light text-gray-500">hoặc</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={handleGoogleClick}
              className="flex items-center justify-center gap-3 w-full rounded-full border border-gray-300 bg-white px-6 py-3.5 text-[14px] font-bold text-black hover:bg-gray-50 transition-colors mb-5 cursor-pointer shadow-xs active:scale-[0.99]"
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
              <span>Continue with Google</span>
            </button>

            <p className="text-center text-[11px] font-light leading-relaxed text-gray-400">
              Bằng cách tiếp tục, bạn đồng ý với{' '}
              <a href="#" className="underline hover:text-black">
                Điều khoản dịch vụ
              </a>{' '}
              của GreenTrip và xác nhận rằng bạn đã đọc{' '}
              <a href="#" className="underline hover:text-black">
                Chính sách bảo mật
              </a>{' '}
              của chúng tôi.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
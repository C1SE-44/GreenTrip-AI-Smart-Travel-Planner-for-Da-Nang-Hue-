import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ArrowRight, RotateCw, AlertCircle, X } from 'lucide-react';
import { verifyOtp, resendOtp, ApiError } from '../../services/auth';

interface VerifyOtpModalProps {
  isOpen: boolean;
  email: string;
  otpSessionToken: string;
  onSuccess: (accessToken: string) => void;
  onClose: () => void;
}

export const VerifyOtpModal: React.FC<VerifyOtpModalProps> = ({
  isOpen,
  email,
  otpSessionToken,
  onSuccess,
  onClose,
}) => {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(60);
  const [resendSuccessMsg, setResendSuccessMsg] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input when modal opens
  useEffect(() => {
    if (isOpen) {
      setDigits(['', '', '', '', '', '']);
      setError(null);
      setResendSuccessMsg(null);
      setResendCountdown(60);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Countdown timer for resend
  useEffect(() => {
    if (!isOpen || resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, resendCountdown]);

  if (!isOpen) return null;

  const handleChange = (index: number, value: string) => {
    setError(null);
    setResendSuccessMsg(null);

    // Only allow single digit
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      const newDigits = [...digits];
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    const digit = cleaned[cleaned.length - 1];
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    // Auto-advance
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasteData) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasteData[i] || '';
    }
    setDigits(newDigits);

    const focusIndex = Math.min(pasteData.length, 5);
    inputRefs.current[focusIndex]?.focus();
  };

  const otpCode = digits.join('');
  const isComplete = otpCode.length === 6;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isComplete || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await verifyOtp({
        email,
        otp_code: otpCode,
        otp_session_token: otpSessionToken,
      });

      onSuccess(res.access_token);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Xác thực OTP thất bại. Vui lòng thử lại.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resendCountdown > 0 || isResending) return;

    setIsResending(true);
    setError(null);
    setResendSuccessMsg(null);

    try {
      const res = await resendOtp({
        email,
        otp_session_token: otpSessionToken,
      });
      setResendSuccessMsg(res.message || 'Mã OTP mới đã được gửi!');
      setResendCountdown(60);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Không thể gửi lại mã OTP lúc này.');
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 md:p-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Đóng"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-4 shadow-sm border border-emerald-100/60">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 font-serif">
            Xác thực 2 bước (2FA)
          </h3>
          <p className="text-sm text-slate-600 mt-2 max-w-xs leading-relaxed">
            Nhập mã gồm 6 chữ số vừa được gửi tới hòm thư:{' '}
            <strong className="text-slate-800 break-all">{email}</strong>
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs md:text-sm flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {resendSuccessMsg && (
          <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs md:text-sm flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{resendSuccessMsg}</span>
          </div>
        )}

        {/* OTP Input Row */}
        <form onSubmit={handleSubmit}>
          <div className="flex justify-between gap-2 md:gap-3 mb-6" onPaste={handlePaste}>
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-11 h-14 md:w-12 md:h-14 text-center text-2xl font-bold font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 outline-none transition-all"
                disabled={isSubmitting}
              />
            ))}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!isComplete || isSubmitting}
            className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 group cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                <span>Đang kiểm tra mã...</span>
              </>
            ) : (
              <>
                <span>Xác thực & Đăng nhập</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </form>

        {/* Resend Section */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-xs md:text-sm text-slate-500">
          <span>Chưa nhận được mã?</span>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCountdown > 0 || isResending}
            className="font-medium text-emerald-600 hover:text-emerald-700 disabled:text-slate-400 disabled:hover:text-slate-400 transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
          >
            {isResending ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin" />
            ) : null}
            {resendCountdown > 0 ? (
              <span>Gửi lại sau ({resendCountdown}s)</span>
            ) : (
              <span>Gửi lại mã OTP</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

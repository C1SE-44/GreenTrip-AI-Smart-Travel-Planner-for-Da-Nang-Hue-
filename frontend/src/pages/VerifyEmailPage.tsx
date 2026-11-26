import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, ArrowRight, Home, RefreshCw } from 'lucide-react';
import AuthLayout from '@/components/layout/AuthLayout';
import Button from '@/components/ui/Button';
import { verifyEmail, ApiError } from '@/services/auth';

type VerificationState = 'loading' | 'success' | 'error' | 'missing_token';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [state, setState] = useState<VerificationState>('loading');
  const [message, setMessage] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setState('missing_token');
      return;
    }

    let isMounted = true;

    async function handleVerify() {
      try {
        const result = await verifyEmail(token as string);
        if (isMounted) {
          setState('success');
          setMessage(result.message || 'Kích hoạt tài khoản thành công!');
          setUserEmail(result.email);
        }
      } catch (err) {
        if (isMounted) {
          setState('error');
          if (err instanceof ApiError) {
            setMessage(err.message);
          } else {
            setMessage('Đã xảy ra lỗi không xác định khi kích hoạt tài khoản.');
          }
        }
      }
    }

    handleVerify();

    return () => {
      isMounted = false;
    };
  }, [token]);

  return (
    <AuthLayout
      image="/images/empty-trips/front-sea.jpg"
      imageAlt="Phong cảnh du lịch xanh Đà Nẵng - Huế"
      slogan="Khám phá di sản và thiên nhiên xanh bền vững."
      benefits={[
        'Tài khoản đã xác thực mở khóa toàn bộ tính năng thông minh',
        'Tạo và cá nhân hóa lịch trình Đà Nẵng - Huế trong 30 giây',
        'Nhận gợi ý địa điểm thân thiện với môi trường',
      ]}
      ecoStat={{ score: 95, co2: '6,4 kg' }}
    >
      <div className="py-2">
        {state === 'loading' && (
          <div className="text-center py-6" role="status" aria-live="polite">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700">
              <Loader2 size={32} className="animate-spin text-emerald-700" aria-hidden="true" />
            </div>
            <h2 className="font-heading text-2xl font-bold tracking-tight text-neutral-950">
              Đang xác thực tài khoản…
            </h2>
            <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
              Vui lòng đợi giây lát trong khi GreenTrip AI kiểm tra liên kết của bạn.
            </p>
          </div>
        )}

        {state === 'success' && (
          <div className="text-center py-2" data-testid="verification-success">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 size={34} aria-hidden="true" />
            </div>
            <h2 className="font-heading text-2xl font-bold tracking-tight text-neutral-950">
              Kích hoạt thành công!
            </h2>
            <p className="mt-2 text-sm text-neutral-700 leading-relaxed">
              {message}
            </p>
            {userEmail && (
              <div className="my-4 inline-flex flex-wrap items-center justify-center gap-1 rounded-xl bg-emerald-50/80 px-4 py-2 border border-emerald-200/80 text-xs">
                <span className="text-neutral-600">Email đã kích hoạt:</span>
                <span className="font-semibold text-emerald-900">{userEmail}</span>
              </div>
            )}
            <p className="text-xs text-neutral-600 mb-6 leading-relaxed">
              Bạn có thể đăng nhập ngay bây giờ để bắt đầu lên kế hoạch cho chuyến đi của mình.
            </p>

            <Button
              variant="primary"
              size="lg"
              className="w-full min-h-12 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white"
              onClick={() => navigate('/login', { state: { verifiedEmail: userEmail } })}
            >
              <span>Đăng nhập ngay</span>
              <ArrowRight size={16} className="ml-1" aria-hidden="true" />
            </Button>
          </div>
        )}

        {state === 'error' && (
          <div className="text-center py-2" data-testid="verification-error">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              <XCircle size={34} aria-hidden="true" />
            </div>
            <h2 className="font-heading text-2xl font-bold tracking-tight text-neutral-950">
              Xác thực không thành công
            </h2>
            <div
              role="alert"
              className="my-4 rounded-xl bg-rose-50 p-3.5 text-sm font-medium text-rose-800 border border-rose-200"
            >
              {message}
            </div>
            <p className="text-xs text-neutral-600 mb-6 leading-relaxed">
              Liên kết có thể đã hết hạn sau 24 giờ hoặc đã được sử dụng trước đó.
            </p>

            <div className="space-y-3">
              <Button
                variant="primary"
                size="lg"
                className="w-full min-h-12 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white"
                onClick={() => navigate('/register')}
              >
                <RefreshCw size={16} className="mr-1" aria-hidden="true" />
                <span>Đăng ký tài khoản mới</span>
              </Button>

              <Button
                variant="ghostDark"
                size="lg"
                className="w-full min-h-12 rounded-xl border-neutral-300"
                onClick={() => navigate('/login')}
              >
                Về trang Đăng nhập
              </Button>
            </div>
          </div>
        )}

        {state === 'missing_token' && (
          <div className="text-center py-2">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              <XCircle size={34} aria-hidden="true" />
            </div>
            <h2 className="font-heading text-2xl font-bold tracking-tight text-neutral-950">
              Thiếu mã xác nhận
            </h2>
            <p className="mt-2 text-sm text-neutral-600 mb-6 leading-relaxed">
              Không tìm thấy mã xác nhận trong đường dẫn. Vui lòng mở lại email và nhấn vào nút kích hoạt tài khoản.
            </p>
            <Link to="/" className="block">
              <Button variant="ghostDark" size="lg" className="w-full min-h-12 rounded-xl border-neutral-300">
                <Home size={16} className="mr-1" aria-hidden="true" />
                <span>Về Trang chủ</span>
              </Button>
            </Link>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}

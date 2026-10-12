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
      image="https://picsum.photos/seed/danang_hue_green/1200/1600"
      imageAlt="Phong cảnh du lịch xanh Đà Nẵng - Huế"
      slogan="Khám phá di sản và thiên nhiên xanh bền vững."
      benefits={[
        'Tài khoản đã xác thực mở khóa toàn bộ tính năng thông minh',
        'Tạo và cá nhân hóa lịch trình Đà Nẵng - Huế trong 30 giây',
        'Nhận gợi ý địa điểm thân thiện với môi trường',
      ]}
      ecoStat={{ score: 95, co2: '6,4 kg' }}
    >
      <div className="py-4">
        {state === 'loading' && (
          <div className="text-center py-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-forest-50 text-forest-600">
              <Loader2 size={36} className="animate-spin text-forest-600" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-charcoal">
              Đang xác thực tài khoản...
            </h2>
            <p className="mt-2 text-sm text-muted">
              Vui lòng đợi giây lát trong khi GreenTrip AI kiểm tra liên kết của bạn.
            </p>
          </div>
        )}

        {state === 'success' && (
          <div className="text-center py-4" data-testid="verification-success">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-forest-600 shadow-sm border border-emerald-200">
              <CheckCircle2 size={36} />
            </div>
            <h2 className="font-display text-2xl font-semibold text-charcoal">
              Kích hoạt thành công!
            </h2>
            <p className="mt-2 text-sm text-charcoal/80">
              {message}
            </p>
            {userEmail && (
              <div className="my-4 inline-block rounded-lg bg-emerald-50 px-4 py-2 border border-emerald-200">
                <span className="text-xs text-muted">Email đã kích hoạt: </span>
                <span className="font-semibold text-forest-700">{userEmail}</span>
              </div>
            )}
            <p className="text-xs text-muted mb-6">
              Bạn có thể đăng nhập ngay bây giờ để bắt đầu lên kế hoạch cho chuyến đi của mình.
            </p>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => navigate('/login', { state: { verifiedEmail: userEmail } })}
            >
              Đăng nhập ngay
              <ArrowRight size={16} className="ml-2" />
            </Button>
          </div>
        )}

        {state === 'error' && (
          <div className="text-center py-4" data-testid="verification-error">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 shadow-sm border border-red-200">
              <XCircle size={36} />
            </div>
            <h2 className="font-display text-2xl font-semibold text-charcoal">
              Xác thực không thành công
            </h2>
            <div className="my-4 rounded-xl bg-red-50 p-3.5 text-sm text-red-700 border border-red-200">
              {message}
            </div>
            <p className="text-xs text-muted mb-6">
              Liên kết có thể đã hết hạn sau 24 giờ hoặc đã được sử dụng trước đó.
            </p>

            <div className="space-y-3">
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => navigate('/register')}
              >
                <RefreshCw size={16} className="mr-2" />
                Đăng ký tài khoản mới
              </Button>

              <Button
                variant="ghost"
                size="lg"
                className="w-full"
                onClick={() => navigate('/login')}
              >
                Về trang Đăng nhập
              </Button>
            </div>
          </div>
        )}

        {state === 'missing_token' && (
          <div className="text-center py-4">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700 shadow-sm border border-amber-200">
              <XCircle size={36} />
            </div>
            <h2 className="font-display text-2xl font-semibold text-charcoal">
              Thiếu mã xác nhận
            </h2>
            <p className="mt-2 text-sm text-muted mb-6">
              Không tìm thấy mã xác nhận trong đường dẫn. Vui lòng mở lại email và nhấn vào nút kích hoạt tài khoản.
            </p>
            <Link to="/">
              <Button variant="ghost" size="lg" className="w-full">
                <Home size={16} className="mr-2" />
                Về Trang chủ
              </Button>
            </Link>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}

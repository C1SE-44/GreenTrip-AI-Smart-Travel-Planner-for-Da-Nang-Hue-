import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Sparkles, XCircle } from 'lucide-react';
import { useRevealOnScroll } from './useRevealOnScroll';

interface ProblemComparisonSectionProps {
  onOpenSample: () => void;
}

const MANUAL_PAIN_POINTS = [
  {
    title: 'Mở hàng chục tab TikTok, Google Maps & ghi chú rời rạc',
    detail: 'Lưu rất nhiều nơi nhưng đến sáng xuất phát vẫn không biết nên đi điểm nào trước cho hợp giờ.',
  },
  {
    title: 'Chạy vòng qua cầu, tốn giờ và phát thải không cần thiết',
    detail: 'Xếp nhầm thứ tự Hải Châu → Sơn Trà → Ngũ Hành Sơn rồi vòng ngược lại gây mệt mỏi giữa trưa.',
  },
  {
    title: 'Lạc vào điểm đông đúc, bỏ lỡ quán bản địa gần ngay cạnh',
    detail: 'Thiếu dữ liệu giờ mở cửa thực tế và không biết đâu là địa điểm bền vững, ít chen chúc.',
  },
] as const;

const GREENTRIP_SOLUTIONS = [
  {
    title: 'Một bản phác thảo hoàn chỉnh trong 30 giây',
    detail: 'Chọn điểm đến & số ngày hoặc nhắn gu đi cho Trợ lý AI để nhận ngay lịch trình chia khung giờ rõ ràng.',
  },
  {
    title: 'Gom cụm theo cung đường gọn nhất',
    detail: 'Giảm quãng đường chạy vòng mẫu đến 52%, tiết kiệm thời gian di chuyển và giảm phát thải CO₂.',
  },
  {
    title: 'Minh bạch Điểm xanh & địa điểm chuẩn hóa',
    detail: 'Ưu tiên trải nghiệm bản địa, thiên nhiên, ít chen chúc từ hơn 575 địa điểm Đà Nẵng – Huế.',
  },
] as const;

export function ProblemComparisonSection({ onOpenSample }: ProblemComparisonSectionProps) {
  const reveal = useRevealOnScroll<HTMLElement>();

  return (
    <section
      ref={reveal.ref}
      id="problem"
      aria-labelledby="problem-heading"
      onFocusCapture={reveal.onFocusCapture}
      className="bg-[#FAF8F5] py-16 sm:py-24 border-b border-neutral-200/70"
    >
      <div
        data-revealed={reveal.revealed ? 'true' : 'false'}
        className="aui-reveal max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8"
      >
        <div className="max-w-3xl mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white border border-neutral-200/90 text-neutral-700 text-xs font-semibold tracking-wider uppercase mb-3.5 shadow-sm">
            <Sparkles size={12} className="text-emerald-800" aria-hidden="true" />
            VÌ SAO LÊN LỊCH THỦ CÔNG TỐN SỨC?
          </div>
          <h2
            id="problem-heading"
            className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-[#111111] tracking-[-0.03em] leading-[1.15]"
          >
            Đừng để 6 tiếng tìm kiếm làm mệt cả chuyến đi 2 ngày.
          </h2>
          <p className="mt-3.5 text-base sm:text-lg text-neutral-600 leading-relaxed">
            Giữa Đà Nẵng và Huế có hàng trăm điểm đến rải rác qua nhiều cầu, đèo và khung giờ mở cửa. Gom thủ công rất dễ đi vòng và hụt nhịp.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Before: Manual planning */}
          <article className="rounded-[28px] border border-neutral-200/90 bg-white p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-3 mb-6">
                <span className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                  Cách lập lịch truyền thống
                </span>
                <span className="text-xs font-medium text-neutral-600">
                  Mất 4–6 giờ tự dò bản đồ
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-[#111111] tracking-tight mb-5">
                Tự gom từ 15 tab rời rạc
              </h3>
              <ul className="space-y-4">
                {MANUAL_PAIN_POINTS.map((item) => (
                  <li key={item.title} className="flex items-start gap-3">
                    <XCircle size={20} className="text-rose-700 mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="text-sm sm:text-[15px] font-semibold text-[#111111] leading-snug">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs sm:text-sm text-neutral-600 leading-relaxed">
                        {item.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-7 pt-5 border-t border-neutral-200/80 text-xs sm:text-sm text-neutral-600">
              Kết quả thường gặp: vừa đi vừa sửa lịch ngay giữa nắng trưa.
            </div>
          </article>

          {/* After: GreenTrip AI */}
          <article className="rounded-[28px] border border-emerald-900/20 bg-[#F3F8F4] p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-3 mb-6">
                <span className="inline-flex items-center rounded-full bg-emerald-900 px-3 py-1 text-xs font-semibold text-white">
                  Với GreenTrip AI
                </span>
                <span className="text-xs font-semibold text-emerald-900">
                  Sẵn sàng trong ~30 giây
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-[#111111] tracking-tight mb-5">
                Tuyến đường gọn nhẹ, giàu trải nghiệm xanh
              </h3>
              <ul className="space-y-4">
                {GREENTRIP_SOLUTIONS.map((item) => (
                  <li key={item.title} className="flex items-start gap-3">
                    <CheckCircle2 size={20} className="text-emerald-800 mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="text-sm sm:text-[15px] font-semibold text-[#111111] leading-snug">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs sm:text-sm text-neutral-700 leading-relaxed">
                        {item.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-7 pt-5 border-t border-emerald-900/15 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onOpenSample}
                className="aui-press inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full !bg-neutral-900 hover:!bg-emerald-950 px-5 py-2.5 text-xs sm:text-sm font-semibold !text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <span>Xem thử lịch mẫu</span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
              <Link
                to="/chat"
                className="aui-press inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-white hover:bg-neutral-50 px-4 py-2.5 text-xs sm:text-sm font-semibold !text-neutral-900 border border-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <span>Hoặc hỏi Trợ lý AI ngay</span>
              </Link>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

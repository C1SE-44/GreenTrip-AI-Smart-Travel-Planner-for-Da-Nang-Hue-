import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, HelpCircle } from 'lucide-react';
import { useRevealOnScroll } from './useRevealOnScroll';

const FAQ_ITEMS = [
  {
    id: 'faq-free',
    question: 'Có mất phí để lập lịch trình trên GreenTrip AI không?',
    answer:
      'Miễn phí hoàn toàn cho việc khám phá địa điểm, trò chuyện cùng Trợ lý AI, tối ưu tuyến đường xanh và xuất lịch trình PDF để mang theo khi di chuyển.',
  },
  {
    id: 'faq-data',
    question: 'Các địa điểm gợi ý tại Đà Nẵng và Huế có dữ liệu thực tế không?',
    answer:
      'Có. Hệ thống hiện quản lý hơn 575 địa điểm tại Đà Nẵng và Huế được chuẩn hóa tọa độ, phân loại, giờ mở cửa và mức chi phí tham khảo theo từng cụm khu vực.',
  },
  {
    id: 'faq-edit',
    question: 'Tôi có thể tự chỉnh sửa lại lịch trình do AI tạo không?',
    answer:
      'Có. Trong màn hình Lập lịch trình (/planner), bạn có thể thêm hoặc bớt điểm dừng, đổi thứ tự theo từng ngày, xem bản đồ trực quan và lưu lại vào tài khoản cá nhân.',
  },
  {
    id: 'faq-green-score',
    question: 'Điểm xanh và lượng CO₂ ước tính được tính như thế nào?',
    answer:
      'Mỗi địa điểm được chấm Điểm xanh dựa trên 4 trụ cột: tác động môi trường, bảo tồn văn hóa, đóng góp cộng đồng địa phương và khả năng tiếp cận xanh. Quãng đường và CO₂ thay đổi theo tổng km của tuyến bạn chọn.',
  },
  {
    id: 'faq-export',
    question: 'Có thể mang lịch trình đi ngoại tuyến hoặc chia sẻ với nhóm bạn không?',
    answer:
      'Có. Bạn có thể xuất lịch trình ra file PDF gọn nhẹ hoặc thêm vào lịch cá nhân để xem lại giờ mở cửa và thứ tự điểm dừng ngay cả khi qua đèo Hải Vân sóng yếu.',
  },
  {
    id: 'faq-guest',
    question: 'Tôi có cần đăng ký tài khoản ngay mới dùng thử được không?',
    answer:
      'Không cần. Bạn có thể xem lịch mẫu ngay trên trang chủ, khám phá địa điểm hoặc thử Trợ lý AI trước khi đăng nhập để lưu chuyến đi lâu dài.',
  },
] as const;

interface FaqAccordionItemProps {
  id: string;
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

function FaqAccordionItem({ id, question, answer, isOpen, onToggle }: FaqAccordionItemProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const btnId = `${id}-btn`;
  const panelId = `${id}-panel`;

  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.inert = !isOpen;
    }
  }, [isOpen]);

  return (
    <div className="rounded-2xl border border-neutral-200/90 bg-white overflow-hidden shadow-sm">
      <h3>
        <button
          type="button"
          id={btnId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
          className="aui-press w-full min-h-[52px] px-5 py-4 !bg-white hover:!bg-neutral-50 !text-[#111111] text-left flex items-center justify-between gap-4 font-semibold text-sm sm:text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700"
        >
          <span>{question}</span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`aui-disclosure-chevron shrink-0 text-neutral-600 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>
      <div
        ref={panelRef}
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        aria-hidden={!isOpen}
        data-open={isOpen ? 'true' : 'false'}
        className="aui-disclosure-panel"
      >
        <div className="aui-disclosure-inner">
          <p className="px-5 pb-5 pt-0 text-xs sm:text-sm text-neutral-600 leading-relaxed">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

export function LandingFaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const reveal = useRevealOnScroll<HTMLElement>();

  return (
    <section
      ref={reveal.ref}
      id="faq"
      aria-labelledby="faq-heading"
      onFocusCapture={reveal.onFocusCapture}
      className="bg-[#FAF8F5] py-16 sm:py-24 border-t border-neutral-200/70"
    >
      <div
        data-revealed={reveal.revealed ? 'true' : 'false'}
        className="aui-reveal max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Left intro */}
          <div className="lg:col-span-4 lg:sticky lg:top-24">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white border border-neutral-200/90 text-neutral-700 text-xs font-semibold tracking-wider uppercase mb-3.5 shadow-sm">
              <HelpCircle size={12} className="text-emerald-800" aria-hidden="true" />
              RÕ RÀNG TRƯỚC KHI XUẤT PHÁT
            </div>
            <h2
              id="faq-heading"
              className="text-3xl sm:text-4xl font-extrabold text-[#111111] tracking-[-0.03em] leading-[1.15]"
            >
              Câu hỏi thường gặp
            </h2>
            <p className="mt-3.5 text-sm sm:text-base text-neutral-600 leading-relaxed">
              Mọi thông tin về dữ liệu địa điểm Đà Nẵng – Huế, Điểm xanh và cách xuất lịch trình đều minh bạch trước khi bạn bắt đầu.
            </p>
            <div className="mt-6">
              <Link
                to="/chat"
                className="aui-press inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white hover:bg-neutral-50 border border-neutral-300 px-4 py-2.5 text-xs sm:text-sm font-semibold !text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <span>Vẫn còn thắc mắc? Hỏi Trợ lý AI</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* Right accordion */}
          <div className="lg:col-span-8 space-y-3">
            {FAQ_ITEMS.map((item, idx) => (
              <FaqAccordionItem
                key={item.id}
                id={item.id}
                question={item.question}
                answer={item.answer}
                isOpen={openIndex === idx}
                onToggle={() => setOpenIndex(openIndex === idx ? null : idx)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

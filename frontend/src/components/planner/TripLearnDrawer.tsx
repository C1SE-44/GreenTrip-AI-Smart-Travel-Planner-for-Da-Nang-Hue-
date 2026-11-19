import { Leaf, Sparkles, X } from 'lucide-react';

interface TripLearnDrawerProps {
  onClose: () => void;
  onAskCopilot: (prompt: string) => void;
}

export default function TripLearnDrawer({ onClose, onAskCopilot }: TripLearnDrawerProps) {
  return (
    <div
      className="fixed inset-y-0 right-0 w-full sm:w-[620px] lg:w-[calc(50vw)] xl:w-[calc(50vw)] z-50 bg-white rounded-l-[24px] border-l border-gray-200/90 shadow-[-16px_0_40px_rgba(0,0,0,0.08),-4px_0_12px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden animate-slideInRight"
      role="dialog"
      aria-modal="true"
      aria-labelledby="learn-drawer-title"
    >
      <div className="px-6 py-4 border-b border-neutral-200/80 flex items-center justify-between gap-3 shrink-0 bg-emerald-50/40">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800">
            <Leaf size={14} className="shrink-0" />
            <span>Cẩm nang Bản địa Xanh</span>
          </span>
          <h3
            id="learn-drawer-title"
            className="text-base sm:text-lg font-bold text-neutral-900 tracking-tight mt-0.5 truncate"
          >
            Văn hóa, Phong thủy &amp; Mẹo đi Huế – Đà Nẵng
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng cẩm nang Huế – Đà Nẵng"
          className="min-h-[40px] min-w-[40px] rounded-full bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-700 flex items-center justify-center transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4 text-neutral-700">
        <section className="p-4 rounded-2xl bg-neutral-50/90 border border-neutral-200/80 space-y-1.5">
          <h4 className="text-sm font-bold text-neutral-900">
            1. Phong thủy Cố đô &amp; Cấu trúc 3 vòng thành Đại Nội
          </h4>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Kinh thành Huế quy hoạch theo triết lý phong thủy truyền thống: tựa thế &ldquo;tiền án, hậu chẩm&rdquo; lấy Sông Hương làm minh đường và Núi Ngự Bình làm bình phong. Bên trong gồm 3 vòng thành đồng tâm: <strong>Kinh thành</strong> (phòng thủ ngoài cùng), <strong>Hoàng thành</strong> (cơ quan triều đình &amp; Điện Thái Hòa) và <strong>Tử Cấm Thành</strong> (nơi sinh hoạt của hoàng gia). Tại Đà Nẵng, <strong>Bán đảo Sơn Trà</strong> giữ vai trò lá phổi xanh chắn gió và bảo tồn Voọc chà vá chân nâu quý hiếm.
          </p>
        </section>

        <section className="p-4 rounded-2xl bg-neutral-50/90 border border-neutral-200/80 space-y-1.5">
          <h4 className="text-sm font-bold text-neutral-900">
            2. Quy tắc Trang phục &amp; Ứng xử Di sản Xanh
          </h4>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Khi tham quan Đại Nội, Hệ thống Lăng tẩm (Tự Đức, Minh Mạng, Khải Định), Chùa Thiên Mụ hoặc Chùa Linh Ứng, du khách cần mặc áo có tay, quần hoặc váy dài qua gối. Giữ giọng nói nhỏ nhẹ nơi thờ tự, mang bình nước cá nhân để nạp lại tại các trạm xanh và hạn chế túi nylon sử dụng một lần.
          </p>
        </section>

        <section className="p-4 rounded-2xl bg-emerald-50/55 border border-emerald-200/80 space-y-1.5">
          <h4 className="text-sm font-bold text-emerald-950">
            3. Mẹo Di chuyển Cho Người Lớn Tuổi &amp; Phương tiện Ít Phát thải
          </h4>
          <p className="text-xs text-neutral-700 leading-relaxed">
            Thay vì đi ô tô leo đèo nhiều khúc cua gấp, hãy chọn <strong>Tàu hỏa Di sản Đà Nẵng → Huế</strong> men theo triền núi Đèo Hải Vân và Vịnh Lăng Cô — vừa êm ái cho người lớn tuổi vừa giảm ~60–75% phát thải CO₂. Trong khu di sản Đại Nội nên thuê xe điện nội khu; buổi chiều dạo thuyền rồng điện/chèo tay Sông Hương hoặc đi xe đạp nhẹ quanh vườn thanh trà Làng sinh thái Thủy Biều.
          </p>
        </section>

        <section className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-1.5">
          <h4 className="text-sm font-bold text-amber-950">
            4. Phương án Dự phòng Mùa Mưa Miền Trung (Tháng 10 – Tháng 12)
          </h4>
          <p className="text-xs text-neutral-700 leading-relaxed">
            Nếu gặp mưa dầm đặc trưng của Huế hoặc gió lớn ven biển Đà Nẵng, hãy chuyển sang các trải nghiệm trong nhà giàu giá trị văn hóa: Bảo tàng Cổ vật Cung đình Huế, Bảo tàng Điêu khắc Chăm Đà Nẵng, thưởng trà sen cung đình, hoặc trải nghiệm ngâm chân thảo mộc &amp; làm mứt thanh trà trong không gian nhà rường ấm cúng tại Làng Thủy Biều.
          </p>
        </section>
      </div>

      <div className="px-6 py-4 border-t border-neutral-200/80 bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            onClose();
            onAskCopilot(
              'Gợi ý mẹo lịch trình Huế – Đà Nẵng nhẹ nhàng cho bố mẹ lớn tuổi và phương án dự phòng trời mưa'
            );
          }}
          className="min-h-[40px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
        >
          <Sparkles size={14} className="shrink-0" />
          <span>Hỏi AI theo mẹo cẩm nang này</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[40px] px-4 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-900 text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
        >
          Đóng lại
        </button>
      </div>
    </div>
  );
}

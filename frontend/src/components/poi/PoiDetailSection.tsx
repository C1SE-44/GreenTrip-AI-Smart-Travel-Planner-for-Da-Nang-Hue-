import { useState, useMemo } from 'react';
import type { Poi } from '@/data/pois';
import { categoryLabels, getGalleryImages } from '@/data/pois';

interface PoiDetailSectionProps {
  poi: Poi;
  isFavorite: boolean;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
  onViewOnMap?: () => void;
}

export default function PoiDetailSection({
  poi,
  isFavorite,
  onClose,
  onToggleFavorite,
  onViewOnMap,
}: PoiDetailSectionProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'guides' | 'location'>('overview');
  const [askAiQuery, setAskAiQuery] = useState('');
  const [addedToTrip, setAddedToTrip] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // 5 ảnh phân bổ chuẩn: 1 ảnh lớn (span 2 hàng) + 4 ảnh nhỏ (2 cột x 2 hàng)
  const galleryImages = useMemo(() => getGalleryImages(poi), [poi]);

  const categoryName = categoryLabels[poi.category] || 'Điểm tham quan';

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <section 
      className="flex-1 bg-white flex flex-col h-full relative overflow-hidden select-none animate-fadeIn" 
      data-purpose="RightDetailSection"
    >
      <style>{`
        .poi-detail-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .poi-detail-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .poi-detail-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.18);
          border-radius: 9999px;
        }
        .poi-detail-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.35);
        }
      `}</style>

      {/* 1. Header chuẩn Mindtrip: icons X và <- thanh mảnh, không vòng tròn, căn chỉnh tinh tế */}
      <header className="px-8 pt-6 pb-2 flex items-center justify-between shrink-0 bg-white z-10">
        {/* Left side icons: X và <- thanh mảnh thuần icon chuẩn Mindtrip */}
        <div className="flex items-center gap-5 text-neutral-800">
          <button 
            onClick={onClose}
            className="text-neutral-800 hover:text-black hover:opacity-60 transition cursor-pointer p-0.5 flex items-center justify-center"
            title="Đóng chi tiết"
          >
            <svg className="w-[18px] h-[18px] stroke-[1.8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button 
            onClick={onClose}
            className="text-neutral-800 hover:text-black hover:opacity-60 transition cursor-pointer p-0.5 flex items-center justify-center"
            title="Trở về bản đồ"
          >
            <svg className="w-[20px] h-[20px] stroke-[1.8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M19 12H5m0 0l6 6m-6-6l6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Right side actions: Save, Add to Trip, Location, Headphones, Share */}
        <div className="flex items-center gap-2">
          {/* Nút Lưu */}
          <button 
            onClick={() => onToggleFavorite(poi.id)}
            className={`flex items-center gap-1.5 px-3.5 h-[34px] border rounded-full text-[12.5px] font-medium transition cursor-pointer ${
              isFavorite 
                ? 'bg-[#fef3c7] border-[#b45309]/30 text-[#b45309]' 
                : 'border-neutral-200 text-neutral-800 hover:bg-neutral-50'
            }`}
          >
            <svg className={`w-3.5 h-3.5 ${isFavorite ? 'fill-[#b45309] stroke-[#b45309]' : 'stroke-[1.8]'}`} fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{isFavorite ? 'Đã lưu' : 'Lưu'}</span>
          </button>

          {/* Nút Thêm vào chuyến đi */}
          <button 
            onClick={() => setAddedToTrip(!addedToTrip)}
            className={`flex items-center gap-1.5 px-3.5 h-[34px] border rounded-full text-[12.5px] font-medium transition cursor-pointer ${
              addedToTrip
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'border-neutral-200 text-neutral-800 hover:bg-neutral-50'
            }`}
          >
            <span className="text-sm font-bold leading-none">{addedToTrip ? '✓' : '+'}</span>
            <span>{addedToTrip ? 'Đã thêm' : 'Thêm vào chuyến đi'}</span>
          </button>

          {/* Icon Xem vị trí trên bản đồ */}
          <button 
            onClick={onViewOnMap || onClose}
            className="w-[34px] h-[34px] rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 hover:text-black transition cursor-pointer"
            title="Xem vị trí bản đồ"
          >
            <svg className="w-3.5 h-3.5 stroke-[1.8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Icon Tai nghe / Hướng dẫn thoại */}
          <button 
            onClick={() => alert('Tính năng Hướng dẫn thuyết minh audio sẽ có trong sprint tiếp theo!')}
            className="w-[34px] h-[34px] rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 hover:text-black transition cursor-pointer"
            title="Audio guide"
          >
            <i className="ph ph-headphones text-[15px]"></i>
          </button>

          {/* Icon Chia sẻ liên kết */}
          <button 
            onClick={handleShare}
            className="w-[34px] h-[34px] rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 hover:text-black transition cursor-pointer"
            title={copiedLink ? 'Đã sao chép liên kết!' : 'Chia sẻ'}
          >
            <svg className="w-3.5 h-3.5 stroke-[1.8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* 2. Scrollable Detail Body: Padding trái -13% (pl-[27px]), thanh cuộn nổi rộng 6px giúp lề phải nội dung còn khoảng 47px (pr-[47px]) */}
      <div className="flex-1 overflow-y-auto px-8 pt-4 pb-28 poi-detail-scrollbar">
        {/* Tiêu đề: Cỡ chữ 22px chuẩn Mindtrip, khoảng cách tinh tế */}
        <h1 className="text-[22px] font-bold tracking-tight text-gray-950 mt-3 mb-1.5 leading-snug font-heading">
          {poi.name}
        </h1>

        {/* Dòng địa điểm -> Lưới ảnh chuẩn Mindtrip */}
        <div className="flex items-center gap-2.5 text-[13px] text-neutral-500 mb-6 font-medium">
          <span className="flex items-center gap-1.5 text-neutral-700">
            <svg className="w-3.5 h-3.5 text-neutral-400 stroke-[1.8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{poi.city}, Việt Nam</span>
          </span>
          <span className="text-neutral-300">•</span>
          <span className="text-neutral-600">{categoryName}</span>
        </div>

        {/* 3. Lưới ảnh: aspect-ratio 2 / 1, grid-template-columns: 2.06fr 1fr 1fr, 2 hàng, ảnh lớn span 2 hàng, gap 13px đồng nhất */}
        <div 
          className="w-full aspect-[2/1] rounded-[20px] overflow-hidden grid grid-rows-2"
          style={{
            gridTemplateColumns: '2.06fr 1fr 1fr',
            gap: '13px'
          }}
        >
          {/* Main Left Image (Span 2 rows) */}
          <div className="row-span-2 col-span-1 h-full w-full relative overflow-hidden bg-neutral-100 group">
            <img 
              alt={poi.name} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
              src={galleryImages[0]}
            />
          </div>

          {/* 4 small photos in 2 rows x 2 cols */}
          <div className="row-span-1 col-span-1 h-full w-full relative overflow-hidden bg-neutral-100 group">
            <img 
              alt={`${poi.name} gallery 2`} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
              src={galleryImages[1]}
            />
          </div>
          <div className="row-span-1 col-span-1 h-full w-full relative overflow-hidden bg-neutral-100 group">
            <img 
              alt={`${poi.name} gallery 3`} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
              src={galleryImages[2]}
            />
          </div>
          <div className="row-span-1 col-span-1 h-full w-full relative overflow-hidden bg-neutral-100 group">
            <img 
              alt={`${poi.name} gallery 4`} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
              src={galleryImages[3]}
            />
          </div>
          <div className="row-span-1 col-span-1 h-full w-full relative overflow-hidden bg-neutral-100 group">
            <img 
              alt={`${poi.name} gallery 5`} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
              src={galleryImages[4]}
            />
          </div>
        </div>

        {/* 4. Tabs Navigation: Lưới ảnh -> Hàng tab +35% (mt-8), khoảng cách giữa các tab -17% (gap-6) */}
        <div className="border-b border-neutral-200 flex items-center gap-6 mt-8 mb-6 text-sm font-semibold">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`pb-3 transition-colors cursor-pointer ${
              activeTab === 'overview' 
                ? 'text-black border-b-2 border-black' 
                : 'text-neutral-400 hover:text-neutral-800'
            }`}
          >
            Tổng quan
          </button>
          <button 
            onClick={() => setActiveTab('guides')}
            className={`pb-3 transition-colors cursor-pointer ${
              activeTab === 'guides' 
                ? 'text-black border-b-2 border-black' 
                : 'text-neutral-400 hover:text-neutral-800'
            }`}
          >
            Cẩm nang xanh
          </button>
          <button 
            onClick={() => setActiveTab('location')}
            className={`pb-3 transition-colors cursor-pointer ${
              activeTab === 'location' 
                ? 'text-black border-b-2 border-black' 
                : 'text-neutral-400 hover:text-neutral-800'
            }`}
          >
            Vị trí bản đồ
          </button>
        </div>

        {/* 5. Nội dung Tab: Tab -> Mô tả +23% (mt-7), Cỡ chữ -5% (text-[14.25px]), line-height -10% (leading-[1.55]) */}
        {activeTab === 'overview' && (
          <div className="space-y-6 mt-7 animate-fadeIn">
            {/* Mô tả chính */}
            <p className="text-neutral-700 text-[14.25px] leading-[1.55] font-normal">
              {poi.description}. Tọa lạc tại vị trí thuận tiện thuộc {poi.city}, nơi đây mang đến không gian trải nghiệm văn hóa và cảnh sắc đặc sắc, kết hợp nét đẹp đặc trưng của miền Trung cùng phong cách phục vụ chu đáo, thân thiện với môi trường.
            </p>

            {poi.address && (
              <div className="pt-2 text-sm">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-neutral-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                  <div>
                    <h4 className="font-bold text-neutral-900">Địa chỉ</h4>
                    <p className="text-neutral-600 mt-0.5 leading-relaxed">{poi.address}</p>
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lng}`}
                      target="_blank" 
                      rel="noreferrer"
                      className="inline-block text-xs font-semibold text-neutral-900 underline mt-2 hover:opacity-75"
                    >
                      Chỉ đường
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'guides' && (
          <div className="space-y-4 text-sm mt-7 animate-fadeIn">
            <h3 className="font-bold text-neutral-900 text-base">Cẩm nang tham quan xanh</h3>
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100 space-y-2">
              <div className="font-semibold text-neutral-900 flex items-center gap-2">
                <span>🚲</span>
                <span>Phương tiện di chuyển đề xuất:</span>
              </div>
              <p className="text-neutral-600">
                Khu vực có trạm xe đạp công cộng và thuận tiện di chuyển bằng xe điện xanh để giảm thiểu phát thải carbon.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100 space-y-2">
              <div className="font-semibold text-neutral-900 flex items-center gap-2">
                <span>⏱️</span>
                <span>Khung giờ lý tưởng:</span>
              </div>
              <p className="text-neutral-600">
                Nên ghé thăm vào khoảng 16:30 – 19:30 để tận hưởng không khí hoàng hôn mát mẻ và ánh đèn rực rỡ.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'location' && (
          <div className="space-y-4 mt-7 animate-fadeIn">
            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100 space-y-2 text-sm">
              <p className="font-bold text-neutral-900">Tọa độ địa lý:</p>
              <p className="text-neutral-600 font-mono text-xs">{poi.lat.toFixed(4)}, {poi.lng.toFixed(4)}</p>
              <button
                onClick={onViewOnMap || onClose}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-black text-white text-xs font-semibold rounded-full hover:bg-neutral-800 transition cursor-pointer"
              >
                <span>Mở trên bản đồ tương tác</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6. Thanh tìm kiếm / hỏi đáp ngắn gọn chuẩn Mindtrip ("Ask Mindtrip") */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[72%] max-w-lg z-30 pointer-events-auto">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            alert('Tính năng Hỏi GreenTrip sẽ được kích hoạt trong sprint tiếp theo!');
          }}
          className="h-[50px] bg-white rounded-full border border-neutral-300/90 shadow-[0_6px_24px_rgba(0,0,0,0.1)] px-5 flex items-center justify-between hover:border-neutral-400 transition"
        >
          <input 
            className="w-full bg-transparent text-[14px] text-neutral-800 placeholder-neutral-400 outline-none border-none focus:ring-0 p-0 cursor-not-allowed" 
            placeholder="Hỏi GreenTrip" 
            type="text"
            value={askAiQuery}
            onChange={(e) => setAskAiQuery(e.target.value)}
          />
          <button 
            type="button"
            onClick={() => alert('Tính năng Hỏi GreenTrip sẽ được kích hoạt trong sprint tiếp theo!')}
            className="text-neutral-500 hover:text-black transition ml-3 shrink-0 flex items-center justify-center cursor-pointer"
            title="Microphone"
          >
            <i className="ph ph-microphone text-[19px]"></i>
          </button>
        </form>
      </div>
    </section>
  );
}

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

  // Generate 5 contextual, authentic images for gallery (1 main large + 4 in 2x2 grid)
  const galleryImages = useMemo(() => getGalleryImages(poi), [poi]);

  const categoryName = categoryLabels[poi.category] || 'Địa điểm';

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
      {/* 1. Top Bar Navigation Controls */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-neutral-100 shrink-0 bg-white z-10">
        {/* Left side icons: Close & Back/Collapse */}
        <div className="flex items-center gap-4 text-neutral-700">
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-neutral-100 hover:text-black transition"
            title="Đóng chi tiết"
          >
            <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-neutral-100 hover:text-black transition"
            title="Trở về bản đồ"
          >
            <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Right side actions: Save, Add to Trip, Location, Share */}
        <div className="flex items-center gap-2">
          {/* Save button */}
          <button 
            onClick={() => onToggleFavorite(poi.id)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 border rounded-full text-xs font-semibold transition ${
              isFavorite 
                ? 'bg-rose-50 border-rose-200 text-rose-600' 
                : 'border-neutral-200 text-neutral-800 hover:bg-neutral-50'
            }`}
          >
            <svg className={`w-3.5 h-3.5 ${isFavorite ? 'fill-rose-500 stroke-rose-500' : 'stroke-[2]'}`} fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{isFavorite ? 'Đã lưu' : 'Lưu'}</span>
          </button>

          {/* Add to trip button */}
          <button 
            onClick={() => setAddedToTrip(!addedToTrip)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 border rounded-full text-xs font-semibold transition ${
              addedToTrip
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'border-neutral-200 text-neutral-800 hover:bg-neutral-50'
            }`}
          >
            <span className="text-sm font-bold leading-none">{addedToTrip ? '✓' : '+'}</span>
            <span>{addedToTrip ? 'Đã thêm' : 'Thêm vào chuyến đi'}</span>
          </button>

          {/* Pin icon (View on map) */}
          <button 
            onClick={onViewOnMap || onClose}
            className="w-8 h-8 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 hover:text-black transition"
            title="Xem vị trí bản đồ"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>

          {/* Share icon */}
          <button 
            onClick={handleShare}
            className="w-8 h-8 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 hover:text-black transition"
            title={copiedLink ? 'Đã sao chép liên kết!' : 'Chia sẻ'}
          >
            <svg className="w-3.5 h-3.5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* 2. Scrollable Detail Body */}
      <div className="flex-1 overflow-y-auto px-8 pt-6 pb-28 custom-scroll">
        {/* Title */}
        <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 mb-2 font-heading">
          {poi.name}
        </h1>

        {/* Region & Category Meta */}
        <div className="flex items-center gap-2.5 text-sm text-neutral-600 mb-6 font-medium">
          <span className="flex items-center gap-1 text-neutral-800">
            <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
            <span>{poi.city}, Việt Nam</span>
          </span>
          <span className="text-neutral-300">•</span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-700">
            {categoryName}
          </span>
        </div>

        {/* 3. Photo Gallery Grid */}
        <div className="grid grid-cols-12 gap-3 h-[320px] rounded-2xl overflow-hidden mb-6">
          {/* Main Left Image */}
          <div className="col-span-7 h-full relative overflow-hidden bg-neutral-100 group">
            <img 
              alt={poi.name} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
              src={galleryImages[0]}
            />
          </div>

          {/* Right 2x2 Grid (4 Photos) */}
          <div className="col-span-5 h-full grid grid-cols-2 grid-rows-2 gap-2">
            {galleryImages.slice(1, 5).map((imgUrl, i) => (
              <div key={i} className="relative overflow-hidden bg-neutral-100 group">
                <img 
                  alt={`${poi.name} gallery ${i + 1}`} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                  src={imgUrl}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 4. Tabs Navigation: Tổng quan, Cẩm nang xanh, Vị trí */}
        <div className="border-b border-neutral-200 flex items-center gap-8 mb-6 text-sm font-semibold">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`pb-3 transition-colors ${
              activeTab === 'overview' 
                ? 'text-black border-b-2 border-black' 
                : 'text-neutral-400 hover:text-neutral-800'
            }`}
          >
            Tổng quan
          </button>
          <button 
            onClick={() => setActiveTab('guides')}
            className={`pb-3 transition-colors ${
              activeTab === 'guides' 
                ? 'text-black border-b-2 border-black' 
                : 'text-neutral-400 hover:text-neutral-800'
            }`}
          >
            Cẩm nang xanh
          </button>
          <button 
            onClick={() => setActiveTab('location')}
            className={`pb-3 transition-colors ${
              activeTab === 'location' 
                ? 'text-black border-b-2 border-black' 
                : 'text-neutral-400 hover:text-neutral-800'
            }`}
          >
            Vị trí bản đồ
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Overview Description */}
            <p className="text-neutral-700 leading-relaxed text-[15px]">
              {poi.description}. Tọa lạc tại vị trí đắc địa thuộc trung tâm thành phố {poi.city}, nơi đây mang đến không gian trải nghiệm ẩm thực và văn hóa đặc sắc, kết hợp phong vị truyền thống Việt Nam cùng phong cách phục vụ chu đáo, thân thiện với môi trường.
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

              {/* Phone */}
              <div className="hidden">
                <svg className="w-5 h-5 text-neutral-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
                <div>
                  <h4 className="font-bold text-neutral-900">Phone</h4>
                  <p className="text-neutral-600 mt-0.5 font-medium">+84 236 3616 226</p>
                </div>
              </div>

              {/* Hours */}
              <div className="hidden">
                <svg className="w-5 h-5 text-neutral-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeWidth="2" />
                  <polyline points="12 6 12 12 16 14" strokeWidth="2" />
                </svg>
                <div>
                  <h4 className="font-bold text-neutral-900">Hours</h4>
                  <p className="text-emerald-600 font-semibold mt-0.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Open now • 07:00 - 22:30
                  </p>
                </div>
              </div>
            </div>
            )}
          </div>
        )}

        {activeTab === 'guides' && (
          <div className="space-y-4 text-sm animate-fadeIn">
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
                Nên ghé thăm vào khoảng 16:30 – 19:30 để tận hưởng không khí hoàng hôn mát mẻ và ánh đèn lồng rực rỡ.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'location' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100 space-y-2 text-sm">
              <p className="font-bold text-neutral-900">Tọa độ địa lý:</p>
              <p className="text-neutral-600 font-mono text-xs">{poi.lat.toFixed(4)}, {poi.lng.toFixed(4)}</p>
              <button
                onClick={onViewOnMap || onClose}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-black text-white text-xs font-semibold rounded-full hover:bg-neutral-800 transition"
              >
                <span>Mở trên bản đồ tương tác</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Floating AI Prompt Bar "GreenTrip AI" */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-11/12 max-w-xl z-30">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            alert('Tính năng Trợ lý GreenTrip AI sẽ được hoàn thiện trong sprint tiếp theo!');
          }}
          className="bg-white rounded-full border border-neutral-300 shadow-xl px-5 py-3 flex items-center justify-between hover:border-neutral-400 transition"
        >
          <input 
            className="w-full bg-transparent text-sm font-medium text-neutral-800 placeholder-neutral-400 outline-none border-none focus:ring-0 p-0 cursor-not-allowed" 
            placeholder={`Hỏi GreenTrip AI về ${poi.name} (Sắp ra mắt trong sprint tới)...`} 
            type="text"
            value={askAiQuery}
            onChange={(e) => setAskAiQuery(e.target.value)}
            title="Tính năng đang được phát triển"
          />
          <button 
            type="button"
            onClick={() => alert('Tính năng Trợ lý GreenTrip AI sẽ được hoàn thiện trong sprint tiếp theo!')}
            className="text-emerald-600 hover:text-emerald-700 transition ml-3 shrink-0 flex items-center gap-1 text-xs font-semibold"
            title="GreenTrip AI"
          >
            <span>GreenTrip AI</span>
            <svg className="w-4 h-4 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>
    </section>
  );
}

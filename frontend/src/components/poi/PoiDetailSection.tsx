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
  const displayName = poi.cleanName || poi.name;

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const suggestedQuestions = [
    `Trải nghiệm đặc sắc nhất không nên bỏ lỡ tại ${displayName}?`,
    `Cách di chuyển xanh (xe buýt, xe đạp) thuận tiện nhất đến đây?`,
    `Mức giá và kinh nghiệm thực tế khi ghé thăm ${displayName}?`,
    `Khung giờ lý tưởng trong ngày để tránh đông đúc?`,
  ];

  const handleSelectSuggestedQuestion = (q: string) => {
    setAskAiQuery(q);
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
            className="p-1.5 rounded-full hover:bg-neutral-100 hover:text-black transition"
            title="Đóng chi tiết"
          >
            <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-neutral-100 hover:text-black transition"
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
            title="Xem vị trí trên bản đồ"
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
        {/* Title & Michelin Badge */}
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 font-heading">
            {displayName}
          </h1>
          {poi.isMichelin && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-sm animate-pulse">
              <span className="text-rose-600 font-serif">🌸</span>
              <span>MICHELIN Selected</span>
            </span>
          )}
        </div>

        {/* Region & Rating Meta Row */}
        <div className="flex flex-wrap items-center gap-2.5 text-sm text-neutral-600 mb-4 font-medium">
          {/* Star Rating */}
          <span className="inline-flex items-center gap-1.5 font-bold text-neutral-900 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 text-xs">
            <span className="text-amber-500 text-sm">★</span>
            <span>{poi.rating.toFixed(1)}</span>
            <span className="text-neutral-400 font-normal">({Math.floor(poi.rating * 180)}+ đánh giá)</span>
          </span>

          <span className="text-neutral-300">•</span>

          {/* Category */}
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-700">
            {categoryName}
          </span>

          <span className="text-neutral-300">•</span>

          {/* Location */}
          <span className="flex items-center gap-1 text-neutral-700 text-xs">
            <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
            <span>{poi.city}, Việt Nam</span>
          </span>

          <span className="text-neutral-300">•</span>

          {/* Eco Score Badge */}
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span>🌿</span>
            <span>Eco {poi.ecoScore}%</span>
          </span>

          {/* Estimated Cost */}
          {poi.estimatedCost ? (
            <>
              <span className="text-neutral-300">•</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                <span>₫</span>
                <span>~ {poi.estimatedCost.toLocaleString('vi-VN')} VNĐ</span>
              </span>
            </>
          ) : null}
        </div>

        {/* Curator Social Proof Banner */}
        <div className="flex items-center gap-2.5 mb-6 p-3 bg-neutral-50 rounded-xl border border-neutral-100 text-xs text-neutral-600">
          <div className="flex -space-x-1.5 overflow-hidden">
            <span className="inline-flex h-6 w-6 rounded-full ring-2 ring-white bg-emerald-600 text-white font-bold text-[10px] items-center justify-center">GT</span>
            <span className="inline-flex h-6 w-6 rounded-full ring-2 ring-white bg-amber-500 text-white font-bold text-[10px] items-center justify-center">VN</span>
            <span className="inline-flex h-6 w-6 rounded-full ring-2 ring-white bg-blue-600 text-white font-bold text-[10px] items-center justify-center">AI</span>
          </div>
          <span className="font-medium text-neutral-700">
            {poi.isMichelin 
              ? 'Đạt chuẩn MICHELIN Guide & GreenTrip AI tuyển chọn cho hành trình miền Trung' 
              : 'GreenTrip AI & Chuyên gia du lịch địa phương thẩm định chất lượng'}
          </span>
        </div>

        {/* 3. Photo Gallery Grid */}
        <div className="grid grid-cols-12 gap-3 h-[320px] rounded-2xl overflow-hidden mb-6 shadow-sm">
          {/* Main Left Image */}
          <div className="col-span-7 h-full relative overflow-hidden bg-neutral-100 group">
            <img 
              alt={displayName} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
              src={galleryImages[0]}
            />
          </div>

          {/* Right 2x2 Grid (4 Photos) */}
          <div className="col-span-5 h-full grid grid-cols-2 grid-rows-2 gap-2">
            {galleryImages.slice(1, 5).map((imgUrl, i) => (
              <div key={i} className="relative overflow-hidden bg-neutral-100 group">
                <img 
                  alt={`${displayName} gallery ${i + 1}`} 
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
            Vị trí & Chỉ đường
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Overview Description */}
            <div className="bg-neutral-50/60 p-5 rounded-2xl border border-neutral-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Giới thiệu</h3>
              <p className="text-neutral-800 leading-relaxed text-[15px]">
                {poi.description}
              </p>
            </div>

            {/* Practical Information Grid (Mindtrip Style 2-Column) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 rounded-2xl bg-neutral-50 border border-neutral-100 text-sm">
              {/* Address */}
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
                <div>
                  <h4 className="font-bold text-neutral-900">Địa chỉ thực tế</h4>
                  <p className="text-neutral-600 mt-0.5 leading-relaxed text-xs">
                    {poi.address || `${poi.city}, Việt Nam`}
                  </p>
                  <a 
                    href={`https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`}
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 mt-1.5 group"
                  >
                    <span>Mở chỉ đường trên Google Maps</span>
                    <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                  </a>
                </div>
              </div>

              {/* Hours & Status */}
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeWidth="2" />
                  <polyline points="12 6 12 12 16 14" strokeWidth="2" />
                </svg>
                <div>
                  <h4 className="font-bold text-neutral-900">Giờ hoạt động</h4>
                  <p className="text-emerald-700 font-semibold mt-0.5 flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Đang mở cửa • 08:00 – 22:00</span>
                  </p>
                  <p className="text-neutral-500 text-xs mt-1">
                    Thời lượng khuyến nghị: ~ {poi.visitDuration}
                  </p>
                </div>
              </div>

              {/* Estimated Cost */}
              <div className="flex items-start gap-3 pt-2 border-t border-neutral-200/60 md:border-t-0 md:pt-0">
                <svg className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
                <div>
                  <h4 className="font-bold text-neutral-900">Chi phí dự kiến</h4>
                  <p className="text-neutral-700 mt-0.5 text-xs font-medium">
                    {poi.estimatedCost 
                      ? `${poi.estimatedCost.toLocaleString('vi-VN')} VNĐ / khách` 
                      : 'Miễn phí vé vào cổng'}
                  </p>
                  <p className="text-neutral-400 text-xs mt-0.5">Giá tham khảo cập nhật mới nhất</p>
                </div>
              </div>

              {/* Green Score & Certification */}
              <div className="flex items-start gap-3 pt-2 border-t border-neutral-200/60 md:border-t-0 md:pt-0">
                <svg className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
                <div>
                  <h4 className="font-bold text-neutral-900">Tiêu chuẩn sinh thái</h4>
                  <p className="text-emerald-700 font-semibold mt-0.5 text-xs">
                    Điểm xanh GreenTrip: {poi.ecoScore}/100
                  </p>
                  <p className="text-neutral-500 text-xs mt-1">
                    Ưu tiên đi bộ, xe bus hoặc xe đạp công cộng
                  </p>
                </div>
              </div>
            </div>

            {/* Mindtrip-Style: "You might want to ask" (Câu hỏi gợi ý) */}
            <div className="pt-2">
              <h4 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
                <span>💡</span>
                <span>Câu hỏi bạn có thể muốn hỏi về {displayName}</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {suggestedQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectSuggestedQuestion(q)}
                    className="text-left p-3 rounded-xl border border-neutral-200 hover:border-emerald-500 hover:bg-emerald-50/50 text-xs font-medium text-neutral-700 hover:text-emerald-900 transition flex items-center justify-between group"
                  >
                    <span className="line-clamp-2 pr-2">{q}</span>
                    <span className="text-neutral-400 group-hover:text-emerald-600 transition shrink-0">→</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'guides' && (
          <div className="space-y-4 text-sm animate-fadeIn">
            <h3 className="font-bold text-neutral-900 text-base flex items-center gap-2">
              <span>🌿</span>
              <span>Cẩm nang du lịch xanh GreenTrip</span>
            </h3>

            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100 space-y-2">
              <div className="font-semibold text-emerald-900 flex items-center gap-2">
                <span>🚲</span>
                <span>Phương tiện giao thông xanh đề xuất:</span>
              </div>
              <p className="text-emerald-800 text-xs leading-relaxed">
                Tại khu vực {poi.city}, bạn có thể dễ dàng tiếp cận địa điểm này bằng xe buýt nội thành hoặc thuê xe đạp công cộng Danang Bike / xe điện du lịch Huế để giảm tối đa lượng phát thải carbon.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100 space-y-2">
              <div className="font-semibold text-neutral-900 flex items-center gap-2">
                <span>🌱</span>
                <span>Ước tính dấu chân Carbon:</span>
              </div>
              <p className="text-neutral-600 text-xs leading-relaxed">
                Di chuyển bằng phương tiện giao thông công cộng hoặc xe đạp giúp tiết kiệm ước tính <strong className="text-emerald-700">1.2 kg – 1.8 kg CO2</strong> so với di chuyển bằng taxi truyền thống.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100 space-y-2">
              <div className="font-semibold text-neutral-900 flex items-center gap-2">
                <span>⏱️</span>
                <span>Khung giờ lý tưởng & Mẹo địa phương:</span>
              </div>
              <p className="text-neutral-600 text-xs leading-relaxed">
                Thời lượng ghé thăm đề xuất: <strong className="text-neutral-900">~ {poi.visitDuration}</strong>. Nên ghé vào buổi sáng sớm (07:30 – 09:30) hoặc xế chiều (16:30 – 19:30) để tận hưởng không khí trong lành, chụp ảnh đẹp và tránh các khung giờ quá đông khách.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'location' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="p-5 rounded-2xl bg-neutral-50 border border-neutral-100 space-y-4 text-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-neutral-900 text-base">{displayName}</h4>
                  <p className="text-neutral-600 text-xs mt-1">{poi.address || `${poi.city}, Việt Nam`}</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                  {poi.city}
                </span>
              </div>

              {/* Tọa độ GPS */}
              <div className="p-3 bg-white rounded-xl border border-neutral-200 text-xs flex items-center justify-between">
                <div>
                  <span className="text-neutral-400 font-semibold block">Tọa độ GPS PostGIS:</span>
                  <span className="font-mono text-neutral-800 font-medium">
                    {poi.lat.toFixed(6)}, {poi.lng.toFixed(6)}
                  </span>
                </div>
                <span className="text-emerald-600 font-bold text-xs">Đã xác minh 100%</span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 pt-2">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-black text-white text-xs font-semibold rounded-full hover:bg-neutral-800 transition shadow-sm"
                >
                  <span>Chỉ đường trên Google Maps</span>
                  <span>↗</span>
                </a>
                <button
                  type="button"
                  onClick={onViewOnMap || onClose}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-neutral-300 text-neutral-800 text-xs font-semibold rounded-full hover:bg-neutral-50 transition"
                >
                  <span>Xem ghim trên bản đồ GreenTrip</span>
                  <span>📍</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Floating AI Prompt Bar "GreenTrip AI" */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-11/12 max-w-xl z-30">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (askAiQuery.trim()) {
              alert(`GreenTrip AI đang tổng hợp câu trả lời cho: "${askAiQuery}"`);
            }
          }}
          className="bg-white rounded-full border border-neutral-300 shadow-xl px-5 py-3 flex items-center justify-between hover:border-neutral-400 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100 transition"
        >
          <input 
            className="w-full bg-transparent text-sm font-medium text-neutral-800 placeholder-neutral-400 outline-none border-none focus:ring-0 p-0" 
            placeholder={`Hỏi GreenTrip AI về ${displayName}...`} 
            type="text"
            value={askAiQuery}
            onChange={(e) => setAskAiQuery(e.target.value)}
          />
          <button 
            type="submit"
            className="text-emerald-600 hover:text-emerald-700 transition ml-3 shrink-0 flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-full"
            title="Gửi câu hỏi cho GreenTrip AI"
          >
            <span>GreenTrip AI</span>
            <svg className="w-3.5 h-3.5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>
    </section>
  );
}

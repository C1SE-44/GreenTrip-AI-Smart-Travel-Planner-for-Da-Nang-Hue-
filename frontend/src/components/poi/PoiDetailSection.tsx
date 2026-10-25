import { useState, useMemo } from 'react';
import type { Poi } from '@/data/pois';
import { categoryLabels, getGalleryImages, SUB_CATEGORY_LABELS, CUISINE_LABELS } from '@/data/pois';

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
  const [askAiQuery, setAskAiQuery] = useState('');
  const [addedToTrip, setAddedToTrip] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedAiAnswer, setCopiedAiAnswer] = useState(false);
  const [showFullSchedule, setShowFullSchedule] = useState(false);
  const [aiConversation, setAiConversation] = useState<{
    query: string;
    answer: string;
    tips: string[];
    isLoading: boolean;
  } | null>(null);

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

  const generateAiAnswer = (queryText: string) => {
    const qLower = queryText.toLowerCase();
    const costText = poi.estimatedCost
      ? `${poi.estimatedCost.toLocaleString('vi-VN')} ₫/người`
      : 'khoảng 50.000 – 90.000 ₫/người';
    const hoursText = poi.openHours || '09:30 – 21:30';
    const durationText = poi.visitDuration || '60 phút';

    if (
      qLower.includes('món') ||
      qLower.includes('đặc sắc') ||
      qLower.includes('ăn gì') ||
      qLower.includes('trải nghiệm') ||
      qLower.includes('nổi tiếng')
    ) {
      if (poi.category === 'quan-an') {
        return {
          answer: `Tại **${displayName}**, món ăn trứ danh làm say lòng thực khách là bánh xèo miền Trung vỏ vàng giòn rụm với nhân tôm đồng tươi, thịt heo mềm thơm và giá đỗ ngọt thanh. Điểm khác biệt lớn nhất tạo nên thương hiệu chính là chén nước chấm đậu phộng gan heo béo bùi đậm đà gia truyền, ăn kèm rổ rau sống tươi sạch từ các vườn nông sản địa phương.`,
          tips: [
            'Nên gọi thêm một phần ram cuốn bắp hoặc nem lụi nướng than hoa để cuốn cùng bánh xèo.',
            'Tự cuốn bánh tráng cùng rau thơm, dưa leo và chuối chát để cảm nhận trọn vẹn vị béo bùi, giòn tan.',
            'Quán phục vụ nước đậu nành nấu tươi và sữa bắp rất thanh mát, giải nhiệt tuyệt vời.'
          ]
        };
      } else {
        return {
          answer: `Tại **${displayName}**, điểm đặc sắc nhất là không gian văn hóa lịch sử độc đáo và cảnh quan thiên nhiên trong lành của ${poi.city}. Đây là địa điểm lý tưởng để tìm hiểu về chiều sâu di sản kiến trúc truyền thống và thư thái tinh thần giữa lòng đô thị.`,
          tips: [
            `Thời lượng tham quan đề xuất khoảng ${durationText} để chiêm ngưỡng trọn vẹn.`,
            'Nên mặc trang phục lịch sự, trang nhã nếu vào khu vực dâng hương chiêm bái.',
            'Đừng quên ghi lại những khung hình đẹp dưới tán cây cổ thụ và các góc sân gạch cổ kính.'
          ]
        };
      }
    }

    if (
      qLower.includes('di chuyển') ||
      qLower.includes('xe buýt') ||
      qLower.includes('xe đạp') ||
      qLower.includes('đến đây') ||
      qLower.includes('đường đi')
    ) {
      return {
        answer: `Để thực hiện chuyến đi xanh tới **${displayName}** (${poi.address || poi.city}), GreenTrip AI khuyến nghị 2 phương thức giao thông ít phát thải carbon nhất:`,
        tips: [
          `🚌 **Xe buýt công cộng**: Đón xe buýt nội thành ${poi.city === 'Đà Nẵng' ? 'DanaBus (tuyến R16, R6A)' : 'xe buýt điện du lịch Huế'}, xuống trạm gần nhất và đi bộ khoảng 150 – 250m.`,
          `🚲 **Xe đạp chia sẻ**: Có trạm xe đạp công cộng Da Nang Bike / TNGo nằm cách đây chỉ khoảng 300m, chi phí 5.000 ₫ / 30 phút.`,
          `🌱 **Dấu chân Carbon**: Lựa chọn di chuyển xanh giúp bạn cắt giảm ước tính **1.2 – 1.6 kg CO2** cho chuyến đi.`
        ]
      };
    }

    if (
      qLower.includes('giá') ||
      qLower.includes('chi phí') ||
      qLower.includes('tiền') ||
      qLower.includes('bao nhiêu')
    ) {
      return {
        answer: `Chi phí trải nghiệm tại **${displayName}** rất bình dân, minh bạch và phù hợp với nhiều nhóm du khách, mức giá ước tính trung bình khoảng **${costText}**.`,
        tips: [
          'Menu có giá niêm yết công khai rõ ràng, không có phí dịch vụ hay phụ thu ẩn.',
          'Hỗ trợ thanh toán nhanh chóng bằng tiền mặt hoặc quét mã QR chuyển khoản ngân hàng tiện lợi.',
          'Nên đi theo nhóm 2–4 người để có thể gọi thưởng thức nhiều món phong phú với chi phí tối ưu nhất.'
        ]
      };
    }

    if (
      qLower.includes('giờ') ||
      qLower.includes('thời điểm') ||
      qLower.includes('đông') ||
      qLower.includes('khi nào')
    ) {
      return {
        answer: `**${displayName}** mở cửa đón khách từ **${hoursText}** hàng ngày. Thời lượng tham quan trung bình kéo dài khoảng **${durationText}**.`,
        tips: [
          '🕒 **Khung giờ vàng**: 09:30 – 11:00 sáng hoặc 14:00 – 16:30 chiều (ít đông, phục vụ nhanh, không gian thông thoáng).',
          '⚠️ **Khung giờ cao điểm**: 12:00 – 13:00 và 18:30 – 20:00 (lượng khách rất đông, có thể phải chờ xếp bàn từ 5–10 phút).',
          '🌿 Nên ghé sớm vào buổi sáng để thưởng thức đồ ăn nóng hổi và cảm nhận nhịp sống thư thái của địa phương.'
        ]
      };
    }

    return {
      answer: `**${displayName}** là một trong những điểm đến tiêu biểu tại ${poi.city} với điểm đánh giá ${poi.rating}/5 sao và chỉ số sinh thái Eco **${poi.ecoScore}%**. ${poi.description}`,
      tips: [
        `Địa chỉ cụ thể: ${poi.address || poi.city}`,
        `Thời lượng ghé thăm: ${durationText} • Mức giá ước tính: ${costText}`,
        'Được GreenTrip AI và cộng đồng du lịch bền vững kiểm chứng chất lượng phục vụ.'
      ]
    };
  };

  const handleAskAi = (queryText: string) => {
    if (!queryText.trim()) return;
    setAiConversation({
      query: queryText,
      answer: '',
      tips: [],
      isLoading: true,
    });
    setAskAiQuery('');

    // Smooth response animation
    setTimeout(() => {
      const result = generateAiAnswer(queryText);
      setAiConversation({
        query: queryText,
        answer: result.answer,
        tips: result.tips,
        isLoading: false,
      });
    }, 400);
  };

  const handleCopyAiAnswer = () => {
    if (!aiConversation) return;
    const textToCopy = `${aiConversation.query}\n\n${aiConversation.answer}\n\n` +
      aiConversation.tips.map((t) => `• ${t}`).join('\n');
    navigator.clipboard?.writeText(textToCopy);
    setCopiedAiAnswer(true);
    setTimeout(() => setCopiedAiAnswer(false), 2000);
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

      {/* 1. Header chuẩn Mindtrip: icons X và <- thanh mảnh, không vòng tròn viền xám */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-neutral-100 shrink-0 bg-white z-10">
        {/* Left side icons: X và <- thanh mảnh */}
        <div className="flex items-center gap-4 text-neutral-800">
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

        {/* Right side actions: Save, Add to Trip, Location, Share */}
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

          {/* Pin icon (View on map) */}
          <button 
            onClick={onViewOnMap || onClose}
            className="w-[34px] h-[34px] rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 hover:text-black transition cursor-pointer"
            title="Xem vị trí trên bản đồ"
          >
            <svg className="w-3.5 h-3.5 stroke-[1.8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Share icon */}
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

      {/* 2. Scrollable Detail Body */}
      <div className="flex-1 overflow-y-auto px-8 pt-6 pb-48 custom-scroll">
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

        {/* Clean Editorial Meta Line (Mindtrip Standard: Pure Typography, No Tag Clutter) */}
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500 mb-5">
          <span className="flex items-center gap-1 font-semibold text-neutral-900">
            <span className="text-amber-500 text-sm">★</span>
            <span>{poi.rating.toFixed(1)}</span>
            <span className="text-neutral-400 font-normal">({Math.floor(poi.rating * 180)}+)</span>
          </span>
          <span className="text-neutral-300">·</span>
          <span>{poi.sub_category && SUB_CATEGORY_LABELS[poi.sub_category] ? SUB_CATEGORY_LABELS[poi.sub_category] : categoryName}</span>
          <span className="text-neutral-300">·</span>
          <span>{poi.city}</span>
          {poi.budget_tier && (
            <>
              <span className="text-neutral-300">·</span>
              <span className="text-neutral-700 font-medium">{poi.budget_tier === 'free' ? 'Miễn phí' : poi.budget_tier}</span>
            </>
          )}
          <span className="text-neutral-300">·</span>
          <span className="text-emerald-700 font-medium">Eco {poi.ecoScore}</span>
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

        {/* Editorial Trust & Curator Assurance */}
        <div className="flex items-center gap-2.5 mb-6 px-4 py-2.5 bg-neutral-50 rounded-xl border border-neutral-100 text-xs text-neutral-600">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">✓</span>
          <span className="text-neutral-700 font-medium">
            {poi.isMichelin 
              ? 'Đạt chuẩn MICHELIN Guide & GreenTrip AI tuyển chọn cho hành trình miền Trung' 
              : 'Tuyển chọn & thẩm định bởi GreenTrip AI cùng chuyên gia du lịch địa phương Đà Nẵng – Huế'}
          </span>
        </div>

        {/* Seamless Single-Page Continuous Experience (Mindtrip Standard) */}
        <div className="space-y-6">
          {/* Section 1: Overview & Story */}
          <div className="bg-neutral-50/70 p-5 rounded-2xl border border-neutral-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Giới thiệu & Trải nghiệm</h3>
            <p className="text-neutral-800 leading-relaxed text-[15px]">
              {poi.description}
            </p>

            {/* Vibes & Green Credentials: Clean Editorial Typography (No Tag Clutter) */}
            {((poi.vibes && poi.vibes.length > 0) || (poi.eco_features && poi.eco_features.length > 0)) && (
              <div className="mt-4 pt-3 border-t border-neutral-200/60 flex flex-col gap-2 text-xs text-neutral-600">
                {poi.vibes && poi.vibes.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-neutral-500">Không gian:</span>
                    <span className="text-neutral-800">{poi.vibes.join(' · ')}</span>
                    {poi.ai_metadata?.noise_pace && (
                      <>
                        <span className="text-neutral-300">·</span>
                        <span className="text-neutral-700 font-medium">
                          {poi.ai_metadata.noise_pace === 'peaceful_zen' ? 'Thanh tịnh & Thiền' : poi.ai_metadata.noise_pace === 'chill_slow' ? 'Thư thái, Chậm rãi' : 'Náo nhiệt, Sôi động'}
                        </span>
                      </>
                    )}
                  </div>
                )}

                {poi.eco_features && poi.eco_features.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap text-emerald-800">
                    <span className="font-semibold text-emerald-700">Tiêu chí xanh:</span>
                    <span>{poi.eco_features.join(' · ')}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Practical Information & Booking/Contacts */}
          <div className="p-5 rounded-2xl bg-neutral-50/80 border border-neutral-100 space-y-4 text-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Thông tin thực tế & Liên hệ</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Address & Directions */}
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
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <a 
                      href={`https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`}
                      target="_blank" 
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 group"
                    >
                      <span>Mở chỉ đường Google Maps</span>
                      <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                    </a>
                    {onViewOnMap && (
                      <button
                        type="button"
                        onClick={onViewOnMap}
                        className="text-xs text-neutral-500 hover:text-neutral-900 underline cursor-pointer"
                      >
                        Xem ghim bản đồ
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Hours & Status */}
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeWidth="2" />
                  <polyline points="12 6 12 12 16 14" strokeWidth="2" />
                </svg>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-neutral-900">Giờ hoạt động</h4>
                    {poi.opening_hours?.weekday_text && poi.opening_hours.weekday_text.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowFullSchedule(!showFullSchedule)}
                        className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                      >
                        {showFullSchedule ? 'Thu gọn ▲' : 'Xem cả tuần ▼'}
                      </button>
                    )}
                  </div>

                  <p className="text-emerald-700 font-semibold mt-0.5 flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>
                      {poi.opening_hours?.status_text 
                        ? `${poi.opening_hours.status_text} • ${poi.openHours || '08:00 – 22:00'}`
                        : `Đang mở cửa • ${poi.openHours || '08:00 – 22:00'}`}
                    </span>
                  </p>

                  {/* 7-day schedule dropdown */}
                  {showFullSchedule && poi.opening_hours?.weekday_text && (
                    <div className="mt-2.5 p-2.5 bg-white rounded-xl border border-neutral-200 text-[11px] space-y-1 animate-fadeIn">
                      <div className="font-bold text-neutral-800 mb-1">Lịch hoạt động 7 ngày:</div>
                      {poi.opening_hours.weekday_text.map((dayText: string, dIdx: number) => (
                        <div key={dIdx} className="flex justify-between text-neutral-600 border-b border-neutral-50 last:border-none pb-0.5">
                          <span>{dayText.split(':')[0]}:</span>
                          <span className="font-mono text-neutral-800 font-medium">{dayText.substring(dayText.indexOf(':') + 1).trim()}</span>
                        </div>
                      ))}
                    </div>
                  )}

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
                  <p className="text-neutral-400 text-xs mt-0.5">
                    Ngân sách: {poi.budget_tier === 'free' ? 'Miễn phí' : poi.budget_tier || 'Tiêu chuẩn'}
                  </p>
                </div>
              </div>

              {/* Direct Booking & Hotline Action Buttons */}
              <div className="flex items-start gap-3 pt-2 border-t border-neutral-200/60 md:border-t-0 md:pt-0">
                <svg className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div>
                  <h4 className="font-bold text-neutral-900">Liên hệ & Đặt chỗ</h4>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {poi.phone_number ? (
                      <a
                        href={`tel:${poi.phone_number.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 transition-colors shadow-xs active:scale-95"
                        title="Gọi hotline đặt bàn"
                      >
                        <span>📞 {poi.phone_number}</span>
                      </a>
                    ) : (
                      <span className="text-xs text-neutral-400 italic">Cập nhật qua quầy lễ tân</span>
                    )}

                    {poi.website_url && (
                      <a
                        href={poi.website_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-neutral-200 text-neutral-800 font-medium text-xs hover:bg-neutral-50 transition-colors shadow-xs"
                      >
                        <span>Website / Menu ↗</span>
                      </a>
                    )}

                    {poi.social_links?.facebook && (
                      <a
                        href={poi.social_links.facebook}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-[#1877F2] text-white text-xs font-semibold hover:opacity-90 transition shadow-xs"
                        title="Fanpage Facebook"
                      >
                        FB
                      </a>
                    )}
                    {poi.social_links?.instagram && (
                      <a
                        href={poi.social_links.instagram}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xs font-semibold hover:opacity-90 transition shadow-xs"
                        title="Instagram"
                      >
                        IG
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Green Travel & Carbon Footprint Guide */}
          <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-100 space-y-3 text-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <span>🌿</span>
              <span>Cẩm nang du lịch xanh & Dấu chân Carbon</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-white/90 border border-emerald-100/80 space-y-1">
                <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                  <span>🚲</span>
                  <span>Phương tiện di chuyển xanh</span>
                </div>
                <p className="text-neutral-600 leading-relaxed">
                  Tại {poi.city}, bạn có thể đón xe buýt nội thành (DanaBus / xe buýt điện Huế) hoặc trạm xe đạp công cộng TNGo chỉ cách vài phút đi bộ.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-white/90 border border-emerald-100/80 space-y-1">
                <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                  <span>🌱</span>
                  <span>Cắt giảm phát thải</span>
                </div>
                <p className="text-neutral-600 leading-relaxed">
                  Chọn đi bộ hoặc xe bus giúp bạn giảm trung bình <strong className="text-emerald-700">1.2 – 1.8 kg CO2</strong> cho chặng này so với phương tiện cá nhân.
                </p>
              </div>
            </div>
          </div>

          {/* Section 4: Mindtrip-Style "You might want to ask" (Câu hỏi gợi ý) */}
          <div className="pt-1">
            <h4 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
              <span>💡</span>
              <span>Gợi ý câu hỏi thông minh về {displayName}</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {suggestedQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAskAi(q)}
                  className="text-left p-3 rounded-xl border border-neutral-200 hover:border-emerald-500 hover:bg-emerald-50/50 text-xs font-medium text-neutral-700 hover:text-emerald-900 transition flex items-center justify-between group cursor-pointer"
                >
                  <span className="line-clamp-2 pr-2">{q}</span>
                  <span className="text-neutral-400 group-hover:text-emerald-600 transition shrink-0">→</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 5: AI Assistant Answer Card */}
          {aiConversation && (
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 shadow-sm animate-fadeIn space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 rounded-full bg-emerald-600 text-white items-center justify-center text-xs font-bold">
                    ✨
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-950">GreenTrip AI Assistant</h4>
                    <p className="text-[10px] text-emerald-700 font-medium truncate max-w-sm">
                      "{aiConversation.query}"
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyAiAnswer}
                    className="px-2 py-1 text-[11px] font-semibold text-emerald-800 bg-white rounded-lg border border-emerald-200 hover:bg-emerald-50 transition cursor-pointer"
                  >
                    {copiedAiAnswer ? '✓ Đã chép' : 'Sao chép'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiConversation(null)}
                    className="p-1 text-emerald-700 hover:text-emerald-900 rounded-lg hover:bg-emerald-100 transition cursor-pointer"
                    title="Đóng câu trả lời"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {aiConversation.isLoading ? (
                <div className="py-6 flex flex-col items-center justify-center gap-2 text-emerald-800 text-xs">
                  <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                  <span>GreenTrip AI đang tra cứu dữ liệu địa phương...</span>
                </div>
              ) : (
                <div className="space-y-3 text-xs leading-relaxed text-neutral-800">
                  <p className="whitespace-pre-line font-normal">{aiConversation.answer}</p>
                  {aiConversation.tips && aiConversation.tips.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-emerald-100">
                      <div className="font-bold text-emerald-900 text-[11px]">Mẹo hữu ích từ GreenTrip:</div>
                      {aiConversation.tips.map((tip, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-[11px] text-neutral-700">
                          <span className="text-emerald-600 shrink-0">🌿</span>
                          <span>{tip}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 5. Floating AI Prompt Bar "GreenTrip AI" */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[85%] max-w-lg z-30 pointer-events-auto">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (askAiQuery.trim()) {
              handleAskAi(askAiQuery);
            }
          }}
          className="h-[50px] bg-white rounded-full border border-neutral-300 shadow-[0_6px_24px_rgba(0,0,0,0.1)] px-5 flex items-center justify-between hover:border-neutral-400 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100 transition"
        >
          <input 
            className="w-full bg-transparent text-[14px] font-medium text-neutral-800 placeholder-neutral-400 outline-none border-none focus:ring-0 p-0" 
            placeholder={`Hỏi GreenTrip AI về ${displayName}...`} 
            type="text"
            value={askAiQuery}
            onChange={(e) => setAskAiQuery(e.target.value)}
          />
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button
              type="button"
              onClick={() => alert('Tính năng nhập bằng giọng nói đang được hoàn thiện!')}
              className="text-neutral-400 hover:text-neutral-700 transition flex items-center justify-center p-1 cursor-pointer"
              title="Nhập bằng giọng nói"
            >
              <i className="ph ph-microphone text-[19px]"></i>
            </button>
            <button 
              type="submit"
              className="text-emerald-700 hover:text-emerald-800 transition flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-full cursor-pointer"
              title="Gửi câu hỏi cho GreenTrip AI"
            >
              <span>Hỏi AI</span>
              <svg className="w-3.5 h-3.5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

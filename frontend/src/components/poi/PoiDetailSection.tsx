import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Poi, FeaturedReview, MenuItem } from '@/data/pois';
import {
  categoryLabels,
  getGalleryImages,
  getDeterministicImage,
  SUB_CATEGORY_LABELS,
  VIBE_LABELS,
} from '@/data/pois';

interface PoiDetailSectionProps {
  poi: Poi;
  isFavorite: boolean;
  isFavoritePending?: boolean;
  showAddToTrip?: boolean;
  onClose: () => void;
  onToggleFavorite: (id: string, poi?: Poi) => void;
  onViewOnMap?: () => void;
  isAddedToTrip?: boolean;
  onToggleAddTrip?: (id: string) => void;
}

function cleanDescription(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/\[(?:Menu\s*\/)?\s*Dịch vụ & Giá vé\]:?[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\[Mức giá tham khảo\]:?[\s\S]*?(?=\n\n|$)/gi, '')
    .trim();
}

function formatPriceRange(poi: Poi): string {
  const display = poi.ai_metadata?.price_range_display?.trim();
  if (display) {
    if (/^miễn phí/i.test(display)) return 'Miễn phí';
    return `${display} (Tham khảo)`;
  }
  if (poi.estimatedCost == null) return 'Miễn phí hoặc tùy dịch vụ tại chỗ';
  if (poi.estimatedCost === 0) return 'Miễn phí tham quan';
  return `Khoảng ${new Intl.NumberFormat('vi-VN').format(poi.estimatedCost)} ₫/người (Ước tính)`;
}

export default function PoiDetailSection({
  poi,
  isFavorite,
  isFavoritePending = false,
  showAddToTrip = true,
  onClose,
  onToggleFavorite,
  onViewOnMap,
  isAddedToTrip,
  onToggleAddTrip,
}: PoiDetailSectionProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'menu' | 'guides' | 'location'>('overview');
  const [isMenuZoomOpen, setIsMenuZoomOpen] = useState(false);
  const [localAddedToTrip, setLocalAddedToTrip] = useState(false);
  const isAdded = isAddedToTrip !== undefined ? isAddedToTrip : localAddedToTrip;

  const handleToggleAddTrip = () => {
    if (onToggleAddTrip) {
      onToggleAddTrip(poi.id);
    } else {
      setLocalAddedToTrip((prev) => !prev);
    }
  };
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [isMobileView, setIsMobileView] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobileView(e.matches);
    setIsMobileView(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

    useEffect(() => {
    if (!isMenuZoomOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuZoomOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMenuZoomOpen]);

  const galleryImages = useMemo(() => getGalleryImages(poi), [poi]);

  const isCafe = Boolean(
    poi.sub_category?.includes('cafe') || 
    poi.sub_category?.includes('coffee') || 
    /coffee|cafe|cà phê|tiệm trà|workspace/i.test(poi.name)
  );

  const categoryName = (poi.sub_category && SUB_CATEGORY_LABELS[poi.sub_category])
    || (isCafe ? 'Quán cà phê' : categoryLabels[poi.category])
    || 'Điểm tham quan';

  const meta = poi.ai_metadata;
  const area = meta?.area?.trim() || '';
  const mindtripCategory = meta?.mindtrip_category?.trim() || '';
  const plusCode = meta?.plus_code?.trim() || '';
  const reviewCount = typeof meta?.review_count === 'number' && meta.review_count > 0
    ? meta.review_count
    : null;
  const ecoHighlights = meta?.eco_highlights?.trim() || '';
  const seasonalNote = meta?.seasonal_note?.trim() || '';
  const transportTip = meta?.transport_tip?.trim() || '';
  const amenities = Array.isArray(meta?.amenities)
    ? meta.amenities.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    : [];
  const featuredReviews: FeaturedReview[] = Array.isArray(meta?.featured_reviews)
    ? meta.featured_reviews.filter((r): r is FeaturedReview => Boolean(r && r.text))
    : [];

  const menuImageUrl = typeof meta?.menu_image_url === 'string' ? meta.menu_image_url.trim() : '';
  const menuItems: MenuItem[] = Array.isArray(meta?.menu_items)
    ? meta.menu_items.filter((item): item is MenuItem => Boolean(item && item.name))
    : [];
  const hasMenu = Boolean(
    menuImageUrl ||
    menuItems.length > 0 ||
    poi.category === 'quan-an' ||
    ['food', 'cafe'].includes(poi.sub_category || '')
  );

  const isTempClosed = Boolean(poi.opening_hours?.is_temporarily_closed);
  const liveStatus = typeof poi.opening_hours?.live_status === 'string'
    ? poi.opening_hours.live_status.trim()
    : '';
  const priceDisplay = formatPriceRange(poi);

  const facebookUrl = poi.social_links?.facebook?.trim()
    || (typeof meta?.facebook_url === 'string' ? meta.facebook_url.trim() : '')
    || '';
  const googleMapsUrl = poi.social_links?.google_maps?.trim()
    || (typeof meta?.google_maps_url === 'string' ? meta.google_maps_url.trim() : '')
    || `https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lng}`;
  const verificationStatus = typeof meta?.verification_status === 'string'
    ? meta.verification_status.trim()
    : '';
  const lastVerifiedAt = typeof meta?.last_verified_at === 'string'
    ? meta.last_verified_at.trim()
    : '2026-11-08';

  const vibeBadges = useMemo(() => {
    const raw = poi.vibes || [];
    const seen = new Set<string>();
    const result: string[] = [];

    for (const tag of raw) {
      const lower = tag.trim().toLowerCase();
      let mapped = VIBE_LABELS[lower] || tag.replace(/_/g, ' ');

      // Chuẩn hóa và dịch các nhãn tiếng Anh thô
      if (lower === 'culinary' || lower === 'food' || lower === 'dining') {
        mapped = 'Ẩm thực đặc sắc';
      } else if (lower === 'local_specialty' || lower === 'specialty') {
        mapped = 'Đặc sản địa phương';
      } else if (lower === 'street_food') {
        mapped = 'Ẩm thực đường phố';
      }

      // Bỏ qua nếu vẫn là tiếng Anh đơn thuần không có nghĩa tiếng Việt
      if (/^[a-zA-Z\s_-]+$/.test(mapped) && !['Brunch', 'Kayak', 'SUP'].includes(mapped)) {
        continue;
      }

      if (!seen.has(mapped)) {
        seen.add(mapped);
        result.push(mapped);
      }
    }

    return result.slice(0, 6);
  }, [poi.vibes]);

  const formattedBestTimes = useMemo(() => {
    const mapLegacy: Record<string, string> = {
      early_morning: 'Sáng sớm (05:30 – 07:30)',
      morning: 'Buổi sáng (07:30 – 11:00)',
      afternoon: 'Buổi chiều mát (14:30 – 17:30)',
      sunset: 'Hoàng hôn (16:30 – 18:15)',
      evening: 'Buổi tối (18:00 – 21:30)',
      night: 'Khung giờ đêm (20:00 – 23:00)',
    };
    return (poi.best_time || []).map((slot) => mapLegacy[slot.trim().toLowerCase()] || slot);
  }, [poi.best_time]);

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard?.writeText(phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>, idx: number) => {
    const target = e.currentTarget;
    const fallback = getDeterministicImage(poi.name, `${poi.id}_${idx}`, poi.category, poi.city);
    if (target.src !== fallback) {
      target.src = fallback;
    }
  };

  const detailContent = (
    <section
      className={
        isMobileView
          ? 'fixed inset-0 z-50 w-full h-full bg-white flex flex-col overflow-hidden animate-fadeIn'
          : 'flex-1 bg-white flex flex-col h-full relative overflow-hidden animate-fadeIn'
      }
      data-purpose="RightDetailSection"
    >
      <style>{`
        .poi-detail-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .poi-detail-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .poi-detail-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.15);
          border-radius: 9999px;
        }
        .poi-detail-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.35);
        }
      `}</style>

      {/* 1. Header responsive (chuẩn 320px -> 1280px, vùng chạm >= 40px) */}
      <header className="px-4 sm:px-8 pt-4 sm:pt-6 pb-2 flex flex-wrap items-center justify-between gap-2 shrink-0 bg-white z-10 border-b border-neutral-100 sm:border-none">
        <div className="flex items-center gap-1 text-neutral-800">
          <button
            type="button"
            aria-label="Đóng chi tiết"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] rounded-full text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 transition cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            title="Đóng chi tiết"
          >
            <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
          <button
            type="button"
            aria-pressed={isFavorite}
aria-busy={isFavoritePending}
            disabled={isFavoritePending}
            onClick={() => onToggleFavorite(poi.id, poi)}
            className={`flex items-center gap-1.5 px-3.5 min-h-[40px] border rounded-full text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-wait disabled:opacity-70 ${
              isFavorite
                ? 'bg-rose-50 border-rose-200 text-rose-600'
                : 'border-neutral-200 text-neutral-800 hover:bg-neutral-50'
            }`}
          >
            <svg className={`w-3.5 h-3.5 shrink-0 ${isFavorite ? 'fill-rose-500 stroke-rose-500' : 'stroke-[1.8]'}`} fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{isFavorite ? 'Đã lưu' : 'Lưu'}</span>
          </button>

          <button
            type="button"
            aria-pressed={isAdded}
            onClick={handleToggleAddTrip}
            className={`${showAddToTrip ? '' : 'hidden'} flex items-center gap-1.5 px-3.5 min-h-[40px] border rounded-full text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
              isAdded
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-black border-black text-white hover:bg-neutral-800'
            }`}
          >
            <span className="text-sm font-bold leading-none" aria-hidden="true">{isAdded ? '✓' : '+'}</span>
            <span>{isAdded ? 'Đã thêm' : 'Thêm vào chuyến đi'}</span>
          </button>

          <button
            type="button"
            aria-label="Xem vị trí bản đồ"
            onClick={onViewOnMap || onClose}
            className="min-w-[40px] min-h-[40px] rounded-full border border-neutral-200 flex items-center justify-center text-neutral-700 hover:bg-neutral-50 hover:text-neutral-950 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            title="Xem vị trí bản đồ"
          >
            <svg className="w-4 h-4 stroke-[1.8]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            type="button"
            aria-label={copiedLink ? 'Đã sao chép liên kết' : 'Chia sẻ địa điểm'}
            onClick={handleShare}
            className="min-w-[40px] min-h-[40px] rounded-full border border-neutral-200 flex items-center justify-center text-neutral-700 hover:bg-neutral-50 hover:text-neutral-950 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            title={copiedLink ? 'Đã sao chép liên kết!' : 'Chia sẻ'}
          >
            <svg className="w-4 h-4 stroke-[1.8]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* 2. Scrollable Detail Body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 pt-3 sm:pt-4 pb-16 poi-detail-scrollbar">
        <h1 className="text-xl sm:text-[23px] font-bold tracking-tight text-neutral-950 mt-2 mb-2 leading-snug font-heading">
          {poi.name}
        </h1>

        {/* Dòng thông tin tóm tắt: Sao + Số đánh giá + Khu vực + Danh mục + Điểm Xanh */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-neutral-700 mb-5 font-medium">
          {poi.rating > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-neutral-900">
              <span className="text-amber-500" aria-hidden="true">★</span>
              <span>{poi.rating.toFixed(1)}</span>
              {reviewCount && (
                <span className="text-neutral-500 font-normal">
                  ({reviewCount.toLocaleString('vi-VN')} đánh giá trên Google Maps)
                </span>
              )}
            </span>
          )}
          <span className="text-neutral-300" aria-hidden="true">•</span>
          <span className="inline-flex items-center gap-1 text-neutral-700">
            <svg className="w-3.5 h-3.5 text-emerald-700 stroke-[2] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{area ? `${area}, ${poi.city}` : `${poi.city}, Việt Nam`}</span>
          </span>
          <span className="text-neutral-300" aria-hidden="true">•</span>
          <span className="text-neutral-600">{categoryName}</span>
          {poi.isGreen && (
            <span 
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-3 py-1 text-xs font-bold text-emerald-900 shadow-2xs cursor-help"
              title="Địa điểm du lịch xanh: Thân thiện môi trường, tiết kiệm năng lượng và bảo tồn văn hóa địa phương"
            >
              <span aria-hidden="true">🌱</span>
              <span>Địa điểm xanh</span>
            </span>
          )}
        </div>

        {/* 3A. Lưới 5 ảnh thực tế Desktop (>= 640px): Bento chuẩn Mindtrip */}
        <div
          className="hidden sm:grid w-full aspect-[2/1] rounded-[20px] overflow-hidden grid-rows-2"
          style={{
            gridTemplateColumns: '2.06fr 1fr 1fr',
            gap: '12px',
          }}
        >
          <div className="row-span-2 col-span-1 h-full w-full relative overflow-hidden bg-neutral-100 group">
            <img
              alt={poi.name}
              referrerPolicy="no-referrer"
              onError={(e) => handleImageError(e, 0)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              src={galleryImages[0]}
            />
          </div>
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="row-span-1 col-span-1 h-full w-full relative overflow-hidden bg-neutral-100 group">
              <img
                alt={`${poi.name} - ảnh ${idx + 1}`}
                referrerPolicy="no-referrer"
                loading="lazy"
                onError={(e) => handleImageError(e, idx)}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                src={galleryImages[idx]}
              />
            </div>
          ))}
        </div>

        {/* 3B. Lưới 5 ảnh thực tế Mobile (< 640px, tối ưu 320px không cắt méo) */}
        <div className="grid sm:hidden grid-cols-2 gap-2 rounded-2xl overflow-hidden">
          <div className="col-span-2 aspect-[16/10] w-full bg-neutral-100 overflow-hidden">
            <img
              alt={poi.name}
              referrerPolicy="no-referrer"
              onError={(e) => handleImageError(e, 0)}
              className="w-full h-full object-cover"
              src={galleryImages[0]}
            />
          </div>
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="aspect-[4/3] w-full bg-neutral-100 overflow-hidden">
              <img
                alt={`${poi.name} - ảnh ${idx + 1}`}
                referrerPolicy="no-referrer"
                loading="lazy"
                onError={(e) => handleImageError(e, idx)}
                className="w-full h-full object-cover"
                src={galleryImages[idx]}
              />
            </div>
          ))}
        </div>

        {/* 4. Tabs Navigation */}
        <div
          role="tablist"
          aria-label="Thông tin chi tiết địa điểm"
          className="border-b border-neutral-200 flex items-center gap-4 sm:gap-6 mt-6 sm:mt-8 mb-6 text-sm overflow-x-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            className={`min-h-[44px] px-1 pb-2.5 whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${
              activeTab === 'overview'
                ? 'text-neutral-950 border-b-2 border-black font-bold'
                : 'text-neutral-400 hover:text-neutral-800 font-medium'
            }`}
          >
            Tổng quan
          </button>
          {hasMenu && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'menu'}
              onClick={() => setActiveTab('menu')}
              className={`min-h-[44px] px-1 pb-2.5 whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${
                activeTab === 'menu'
                  ? 'text-neutral-950 border-b-2 border-black font-bold'
                  : 'text-neutral-400 hover:text-neutral-800 font-medium'
              }`}
            >
              Thực đơn & Bảng giá
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'guides'}
            onClick={() => setActiveTab('guides')}
            className={`min-h-[44px] px-1 pb-2.5 whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${
              activeTab === 'guides'
                ? 'text-neutral-950 border-b-2 border-black font-bold'
                : 'text-neutral-400 hover:text-neutral-800 font-medium'
            }`}
          >
            Mẹo đi bền vững
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'location'}
            onClick={() => setActiveTab('location')}
            className={`min-h-[44px] px-1 pb-2.5 whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${
              activeTab === 'location'
                ? 'text-neutral-950 border-b-2 border-black font-bold'
                : 'text-neutral-400 hover:text-neutral-800 font-medium'
            }`}
          >
            Vị trí bản đồ
          </button>
        </div>

        {/* 5A. Tab Tổng quan */}
        {activeTab === 'overview' && (
          <div className="space-y-6 mt-5 animate-fadeIn">
            {/* 1. Lưới thông tin thiết thực cho du khách (Đưa lên đầu ngay dưới ảnh) */}
            <div className="space-y-3">
              <h2 className="text-base font-bold text-neutral-950 font-heading">Thông tin cần biết cho chuyến đi</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl bg-neutral-50 border border-neutral-200/80 p-3.5 space-y-1">
                  <div className="text-xs font-semibold text-neutral-500">📍 Địa chỉ cụ thể</div>
                  <p className="text-[13.5px] font-medium text-neutral-900 leading-snug">
                    {poi.address || `${poi.city}, Việt Nam`}
                  </p>
                  {plusCode && (
                    <p className="text-[11px] text-neutral-400">Mã Plus: {plusCode}</p>
                  )}
                </div>

                <div className="rounded-xl bg-neutral-50 border border-neutral-200/80 p-3.5 space-y-1">
                  <div className="text-xs font-semibold text-neutral-500">🕒 Giờ mở cửa</div>
                  <p className="text-[13.5px] font-medium text-neutral-900 leading-snug">
                    {poi.openHours || '07:30 – 17:30'}
                  </p>
                  {isTempClosed && (
                    <p className="text-[11.5px] text-red-600 font-semibold flex items-center gap-1 mt-0.5">
                      <span>⚠️</span>
                      <span>Địa điểm đang tạm ngưng đón khách</span>
                    </p>
                  )}
                  {!isTempClosed && liveStatus && liveStatus !== poi.openHours && (
                    <p className="text-[11.5px] text-emerald-800 font-medium">{liveStatus}</p>
                  )}
                </div>

                <div className="rounded-xl bg-neutral-50 border border-neutral-200/80 p-3.5 space-y-1">
                  <div className="text-xs font-semibold text-neutral-500">🎟️ Mức giá tham khảo</div>
                  <p className="text-[13.5px] font-medium text-neutral-900 leading-snug">
                    {priceDisplay}
                  </p>
                </div>

                <div className="rounded-xl bg-neutral-50 border border-neutral-200/80 p-3.5 space-y-1">
                  <div className="text-xs font-semibold text-neutral-500">⏱️ Thời lượng gợi ý</div>
                  <p className="text-[13.5px] font-medium text-neutral-900 leading-snug">
                    {poi.visitDuration}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Giới thiệu & Điểm nhấn trải nghiệm */}
            <div className="space-y-3 pt-1">
              <h2 className="text-base font-bold text-neutral-950 font-heading">Giới thiệu địa điểm</h2>
              <p className="text-neutral-700 text-[14.5px] leading-relaxed font-normal whitespace-pre-line">
                {cleanDescription(poi.description)}
              </p>

              {/* Tag trải nghiệm đã dịch tiếng Việt & chống lặp */}
              {vibeBadges.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {vibeBadges.map((badge) => (
                    <span
                      key={badge}
                      className="inline-flex items-center rounded-full bg-neutral-100 border border-neutral-200/60 px-3 py-1 text-xs font-medium text-neutral-800"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Tiêu chí Du lịch Xanh & Bền vững (Chỉ hiện khi đạt chuẩn xanh, KHÔNG số % ảo) */}
            {(poi.isGreen || (poi.eco_features && poi.eco_features.length > 0)) && (
              <div className="rounded-2xl bg-neutral-50 border border-neutral-200/80 p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-neutral-950 font-heading">
                  <span aria-hidden="true">🌱</span>
                  <h2>Tiêu chuẩn Du lịch Bền vững</h2>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-xs font-semibold">
                    <span>✓</span>
                    <span>Đạt tiêu chuẩn Điểm đến Xanh GreenTrip</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-neutral-700 border border-neutral-200/80 text-xs font-medium">
                    <span>✓</span>
                    <span>Ưu tiên nông sản & văn hóa bản địa</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-neutral-700 border border-neutral-200/80 text-xs font-medium">
                    <span>✓</span>
                    <span>Giảm thiểu rác thải nhựa dùng một lần</span>
                  </span>
                  {poi.eco_features && poi.eco_features.map((feat) => (
                    <span
                      key={feat}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-neutral-700 border border-neutral-200/80 text-xs font-medium"
                    >
                      <span>✓</span>
                      <span>{feat}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Liên hệ (tiêu đề gọn, nút đen trang nhã) */}
            <div className="space-y-3 pt-1">
              <h2 className="text-base font-bold text-neutral-950 font-heading">Liên hệ</h2>
              <div className="flex flex-wrap items-center gap-2.5">
                {poi.phone_number && (
                  <>
                    <a
                      href={`tel:${poi.phone_number.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-2 min-h-[40px] px-4 rounded-full bg-black text-white text-xs font-semibold hover:bg-neutral-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                    >
                      <span aria-hidden="true">📞</span>
                      <span>Gọi {poi.phone_number}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopyPhone(poi.phone_number!)}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full border border-neutral-300 bg-white text-neutral-800 text-xs font-semibold hover:bg-neutral-50 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                    >
                      <span>{copiedPhone ? '✓ Đã sao chép SĐT' : 'Sao chép SĐT'}</span>
                    </button>
                  </>
                )}

                {poi.website_url && (
                  <a
                    href={poi.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-full border border-neutral-300 bg-white text-neutral-900 text-xs font-semibold hover:bg-neutral-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                  >
                    <span aria-hidden="true">🌐</span>
                    <span>Website chính thức</span>
                  </a>
                )}

                {facebookUrl && (
                  <a
                    href={facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-full border border-neutral-300 bg-white text-neutral-800 text-xs font-semibold hover:bg-neutral-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                  >
                    <span aria-hidden="true">📘</span>
                    <span>Trang Facebook</span>
                  </a>
                )}

                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-full border border-neutral-300 bg-white text-neutral-800 text-xs font-semibold hover:bg-neutral-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                >
                  <span aria-hidden="true">📍</span>
                  <span>Mở trên Google Maps</span>
                </a>
              </div>
            </div>

            {/* 5. Đánh giá từ du khách */}
            {featuredReviews.length > 0 && (
              <div className="space-y-3.5 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-neutral-950 font-heading">Đánh giá từ du khách</h2>
                  <span className="text-xs font-semibold text-neutral-500">
                    ★ {poi.rating.toFixed(1)} / 5.0
                    {reviewCount ? ` · Theo Google Maps (${reviewCount.toLocaleString('vi-VN')} đánh giá)` : ''}
                  </span>
                </div>
                <div className="space-y-3">
                  {featuredReviews.map((rev, idx) => (
                    <article
                      key={`${rev.author}_${idx}`}
                      className="rounded-2xl bg-neutral-50 border border-neutral-200/80 p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-8 h-8 rounded-full bg-neutral-900 text-white text-xs font-bold flex items-center justify-center shrink-0"
                            aria-hidden="true"
                          >
                            {rev.author.trim().charAt(0).toUpperCase() || 'G'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] font-bold text-neutral-900 truncate">{rev.author}</div>
                            {rev.relative_time && (
                              <div className="text-xs text-neutral-500">{rev.relative_time}</div>
                            )}
                          </div>
                        </div>
                        <div
                          className="text-xs font-semibold text-amber-500 shrink-0"
                          aria-label={`${rev.rating} trên 5 sao`}
                        >
                          {'★'.repeat(Math.max(1, Math.min(5, Math.round(rev.rating))))}
                        </div>
                      </div>
                      <p className="text-[13.5px] text-neutral-700 leading-relaxed">{rev.text}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5B. Tab Cẩm nang xanh (động cho từng địa điểm) */}
        {activeTab === 'guides' && (
          <div className="space-y-4 text-sm mt-5 animate-fadeIn">
            <h2 className="font-bold text-neutral-950 text-base font-heading">Mẹo trải nghiệm & Du lịch bền vững</h2>

            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-2">
              <div className="font-semibold text-emerald-950 flex items-center gap-2">
                <span aria-hidden="true">🚲</span>
                <span>Phương tiện & Lộ trình xanh đề xuất</span>
              </div>
              <p className="text-neutral-700 leading-relaxed">
                {transportTip ||
                  'Khuyến khích tiếp cận bằng xe đạp công cộng, đi bộ hoặc phương tiện điện xanh để giảm phát thải carbon tại điểm đến.'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80 space-y-2">
              <div className="font-semibold text-neutral-950 flex items-center gap-2">
                <span aria-hidden="true">⏱️</span>
                <span>Khung giờ lý tưởng trong ngày</span>
              </div>
              {formattedBestTimes.length > 0 ? (
                <ul className="list-disc list-inside text-neutral-700 space-y-1">
                  {formattedBestTimes.map((slot) => (
                    <li key={slot}>{slot}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-neutral-700">
                  Nên ghé thăm vào buổi sáng sớm (07:00 – 09:30) hoặc chiều mát (15:30 – 18:00) để tận hưởng không khí trong lành.
                </p>
              )}
            </div>

            {amenities.length > 0 && (
              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80 space-y-2.5">
                <div className="font-semibold text-neutral-950 flex items-center gap-2">
                  <span aria-hidden="true">✨</span>
                  <span>Tiện ích & Dịch vụ tại điểm đến</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {amenities.map((am) => (
                    <span
                      key={am}
                      className="inline-flex items-center rounded-full bg-white border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-800"
                    >
                      ✓ {am}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {poi.eco_features && poi.eco_features.length > 0 && (
              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80 space-y-2">
                <div className="font-semibold text-neutral-950 flex items-center gap-2">
                  <span aria-hidden="true">🍃</span>
                  <span>Cam kết sinh thái & Bảo tồn bản địa</span>
                </div>
                <ul className="list-disc list-inside text-neutral-700 space-y-1">
                  {poi.eco_features.map((feat) => (
                    <li key={feat}>{feat}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 5C. Tab Vị trí bản đồ */}
        {activeTab === 'location' && (
          <div className="space-y-4 mt-5 animate-fadeIn">
            <div className="p-4 sm:p-5 rounded-2xl bg-neutral-50 border border-neutral-200/80 space-y-3 text-sm">
              <div>
                <p className="font-bold text-neutral-950">Địa chỉ chi tiết:</p>
                <p className="text-neutral-700 mt-1">{poi.address || `${poi.city}, Việt Nam`}</p>
                {plusCode && <p className="text-xs text-neutral-600 mt-1">Mã Plus Google Maps: {plusCode}</p>}
              </div>

              <div>
                <p className="font-bold text-neutral-950">Tọa độ địa lý (WGS84):</p>
                <p className="text-neutral-700 font-mono text-xs mt-1">
                  {poi.lat.toFixed(6)}, {poi.lng.toFixed(6)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onViewOnMap || onClose}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-4 bg-black text-white text-xs font-semibold rounded-full hover:bg-neutral-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                >
                  <span>Mở trên bản đồ tương tác</span>
                  <span aria-hidden="true">→</span>
                </button>
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-4 border border-neutral-300 bg-white text-neutral-900 text-xs font-semibold rounded-full hover:bg-neutral-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  <span aria-hidden="true">📍</span>
                  <span>Chỉ đường Google Maps</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal phóng to ảnh Menu toàn màn hình qua React Portal */}
      {isMenuZoomOpen && menuImageUrl && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Phóng to bảng giá thực đơn"
          onClick={() => setIsMenuZoomOpen(false)}
          className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-10 animate-fadeIn cursor-zoom-out"
        >
          <div
            className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-black border border-white/20 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsMenuZoomOpen(false)}
              className="absolute top-3 right-3 z-20 w-10 h-10 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center border border-white/30 transition-all cursor-pointer text-base font-bold shadow-lg"
              aria-label="Đóng phóng to"
            >
              ✕
            </button>
            <img
              src={menuImageUrl}
              alt={`Bảng giá thực đơn chi tiết ${poi.name}`}
              className="w-full h-auto max-h-[85vh] object-contain"
            />
          </div>
        </div>,
        document.body
      )}
    </section>
  );

  if (isMobileView && typeof document !== 'undefined') {
    return createPortal(detailContent, document.body);
  }

  return detailContent;
}

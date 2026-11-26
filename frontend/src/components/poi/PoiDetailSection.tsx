import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Bike,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Compass,
  Copy,
  ExternalLink,
  Globe,
  Grid2x2,
  Heart,
  Leaf,
  MapPin,
  Navigation,
  Phone,
  Plus,
  Search,
  Share2,
  Sparkles,
  Star,
  Ticket,
  Timer,
  Utensils,
  X,
} from 'lucide-react';
import type { Poi, FeaturedReview, MenuItem } from '@/data/pois';
import {
  categoryLabels,
  computeGreenScoreBreakdown,
  evaluateCrowdProfile,
  getGalleryImages,
  SUB_CATEGORY_LABELS,
  VIBE_LABELS,
} from '@/data/pois';
import ExplanationModal from '@/components/poi/ExplanationModal';
import PoiMap from '@/components/poi/PoiMap';
import PoiImage from '@/components/ui/PoiImage';
import FavoriteHeartButton from '@/components/ui/FavoriteHeartButton';

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
  onAskCopilot?: (question: string) => void;
  nearbyPois?: Poi[];
  onSelectNearbyPoi?: (poiId: string) => void;
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
  if (poi.category === 'luu-tru') {
    if (poi.estimatedCost && poi.estimatedCost > 0) {
      return `Khoảng ${new Intl.NumberFormat('vi-VN').format(poi.estimatedCost)} ₫/đêm`;
    }
    return 'Liên hệ cơ sở lưu trú';
  }
  if (poi.estimatedCost == null) return 'Miễn phí hoặc tùy dịch vụ';
  if (poi.estimatedCost === 0) return 'Miễn phí tham quan';
  return `Khoảng ${new Intl.NumberFormat('vi-VN').format(poi.estimatedCost)} ₫/người`;
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
  onAskCopilot,
  nearbyPois = [],
  onSelectNearbyPoi,
}: PoiDetailSectionProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'menu' | 'guides' | 'location'>('overview');
  const [isMenuZoomOpen, setIsMenuZoomOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isAmenitiesOpen, setIsAmenitiesOpen] = useState(false);
  const [isReviewsOpen, setIsReviewsOpen] = useState(false);
  const [reviewQuery, setReviewQuery] = useState('');
  const [isKgModalOpen, setIsKgModalOpen] = useState(false);
  const [localAddedToTrip, setLocalAddedToTrip] = useState(false);
  const isAdded = isAddedToTrip !== undefined ? isAddedToTrip : localAddedToTrip;

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [isMobileView, setIsMobileView] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false,
  );

  // Reset modal & tab states when switching to another POI
  useEffect(() => {
    setActiveTab('overview');
    setIsGalleryOpen(false);
    setIsAmenitiesOpen(false);
    setIsReviewsOpen(false);
    setIsMenuZoomOpen(false);
    setReviewQuery('');
  }, [poi.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobileView(e.matches);
    setIsMobileView(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const anyModalOpen = isMenuZoomOpen || isGalleryOpen || isAmenitiesOpen || isReviewsOpen;
    if (!anyModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isMenuZoomOpen) setIsMenuZoomOpen(false);
        else if (isGalleryOpen) setIsGalleryOpen(false);
        else if (isAmenitiesOpen) setIsAmenitiesOpen(false);
        else if (isReviewsOpen) setIsReviewsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMenuZoomOpen, isGalleryOpen, isAmenitiesOpen, isReviewsOpen]);

  const handleToggleAddTrip = () => {
    if (onToggleAddTrip) {
      onToggleAddTrip(poi.id);
    } else {
      setLocalAddedToTrip((prev) => !prev);
    }
  };

  const galleryImages = useMemo(() => getGalleryImages(poi), [poi]);
  const breakdown = useMemo(() => computeGreenScoreBreakdown(poi), [poi]);
  const crowd = useMemo(() => evaluateCrowdProfile(poi), [poi]);

  const isCafe = Boolean(
    poi.sub_category?.includes('cafe') ||
      poi.sub_category?.includes('coffee') ||
      /coffee|cafe|cà phê|tiệm trà|workspace/i.test(poi.name),
  );

  const categoryName =
    (poi.sub_category && SUB_CATEGORY_LABELS[poi.sub_category]) ||
    (isCafe ? 'Quán cà phê' : categoryLabels[poi.category]) ||
    'Điểm tham quan';

  const meta = poi.ai_metadata;
  const area = meta?.area?.trim() || '';
  const plusCode = meta?.plus_code?.trim() || '';
  const reviewCount =
    typeof meta?.review_count === 'number' && meta.review_count > 0 ? meta.review_count : null;
  const transportTip = meta?.transport_tip?.trim() || '';
  const amenities = useMemo(
    () =>
      Array.isArray(meta?.amenities)
        ? meta.amenities.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
        : [],
    [meta?.amenities],
  );
  const featuredReviews: FeaturedReview[] = useMemo(
    () =>
      Array.isArray(meta?.featured_reviews)
        ? meta.featured_reviews.filter((r): r is FeaturedReview => Boolean(r && r.text))
        : [],
    [meta?.featured_reviews],
  );

  const filteredReviews = useMemo(() => {
    const q = reviewQuery.trim().toLowerCase();
    if (!q) return featuredReviews;
    return featuredReviews.filter(
      (rev) =>
        rev.text.toLowerCase().includes(q) || rev.author.toLowerCase().includes(q),
    );
  }, [featuredReviews, reviewQuery]);

  const menuImageUrl = typeof meta?.menu_image_url === 'string' ? meta.menu_image_url.trim() : '';
  const menuItems: MenuItem[] = Array.isArray(meta?.menu_items)
    ? meta.menu_items.filter((item): item is MenuItem => Boolean(item && item.name))
    : [];
  const hasMenu = Boolean(
    menuImageUrl ||
      menuItems.length > 0 ||
      poi.category === 'quan-an' ||
      ['food', 'cafe'].includes(poi.sub_category || ''),
  );

  const isTempClosed = Boolean(poi.opening_hours?.is_temporarily_closed);
  const liveStatus =
    typeof poi.opening_hours?.live_status === 'string' ? poi.opening_hours.live_status.trim() : '';
  const priceDisplay = formatPriceRange(poi);
  const hasCoordinates = Number.isFinite(poi.lat) && Number.isFinite(poi.lng);

  const facebookUrl =
    poi.social_links?.facebook?.trim() ||
    (typeof meta?.facebook_url === 'string' ? meta.facebook_url.trim() : '') ||
    '';
  const googleMapsUrl =
    poi.social_links?.google_maps?.trim() ||
    (typeof meta?.google_maps_url === 'string' ? meta.google_maps_url.trim() : '') ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      hasCoordinates
        ? `${poi.lat},${poi.lng}`
        : [poi.name, poi.address, poi.city].filter(Boolean).join(', '),
    )}`;

  const vibeBadges = useMemo(() => {
    const raw = poi.vibes || [];
    const seen = new Set<string>();
    const result: string[] = [];

    for (const tag of raw) {
      const lower = tag.trim().toLowerCase();
      let mapped = VIBE_LABELS[lower] || tag.replace(/_/g, ' ');

      if (lower === 'culinary' || lower === 'food' || lower === 'dining') {
        mapped = 'Ẩm thực đặc sắc';
      } else if (lower === 'local_specialty' || lower === 'specialty') {
        mapped = 'Đặc sản địa phương';
      } else if (lower === 'street_food') {
        mapped = 'Ẩm thực đường phố';
      }

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

  const ecoHighlights = useMemo(() => {
    const list: string[] = [];
    if (poi.isGreen) {
      list.push('Đạt tiêu chuẩn Điểm đến Xanh GreenTrip');
      list.push('Ưu tiên nông sản & văn hóa bản địa');
      list.push('Giảm thiểu rác thải nhựa dùng một lần');
    }
    if (poi.eco_features && poi.eco_features.length > 0) {
      for (const feat of poi.eco_features) {
        if (!list.includes(feat)) list.push(feat);
      }
    }
    return list;
  }, [poi.isGreen, poi.eco_features]);

  const combinedOffers = useMemo(() => {
    const items: Array<{ label: string; group: 'eco' | 'amenity' }> = [];
    const seen = new Set<string>();
    for (const eco of ecoHighlights) {
      if (!seen.has(eco)) {
        seen.add(eco);
        items.push({ label: eco, group: 'eco' });
      }
    }
    for (const am of amenities) {
      if (!seen.has(am)) {
        seen.add(am);
        items.push({ label: am, group: 'amenity' });
      }
    }
    return items;
  }, [ecoHighlights, amenities]);

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

  const mindtripAiInsights = useMemo(() => {
    if (poi.category === 'luu-tru') {
      return {
        questions: [
          `${poi.name} có chính sách giảm rác thải nhựa và tiết kiệm năng lượng không?`,
          `Từ ${poi.name} di chuyển đến các điểm tham quan chính mất bao lâu?`,
          `Thời gian nhận phòng / trả phòng và tiện ích nổi bật tại ${poi.name}?`,
          `Cơ sở lưu trú này có phù hợp cho gia đình hoặc nhóm bạn đi nghỉ dưỡng không?`,
        ],
        summary: `Du khách đánh giá ${poi.name} có vị trí thuận tiện tại ${poi.city}, không gian nghỉ ngơi sạch sẽ và nhiều lựa chọn phù hợp lưu trú bền vững.`,
        pros: [
          'Thông tin vị trí, giá phòng tham khảo theo đêm và đánh giá thực tế đã kiểm chứng',
          'Thuận tiện kết nối cụm tham quan gần kề để giảm quãng đường di chuyển',
          'Khuyến khích lưu trú bản địa, giữ gìn cảnh quan và tiết kiệm tài nguyên',
        ],
        cons: [
          'Giá phòng có thể thay đổi theo cuối tuần hoặc mùa cao điểm du lịch miền Trung',
          'Nên kiểm tra trước giờ nhận phòng (thường từ 14:00) và chỗ đỗ xe nếu đi ô tô',
        ],
        carbonSaved: '~2.0 – 3.2 kg CO₂/ngày khi chọn lưu trú gần cụm điểm tham quan chính',
      };
    }
    const isFoodOrCafe = poi.category === 'quan-an' || isCafe;
    if (isFoodOrCafe) {
      return {
        questions: [
          `Món signature nhất tại ${poi.name} là gì?`,
          `${poi.name} có lựa chọn món chay hoặc thanh đạm không?`,
          `Khung giờ nào đến ${poi.name} ít đông và phục vụ nhanh nhất?`,
          `Từ đây nên kết hợp ghé quán cafe yên tĩnh nào gần nhất?`,
        ],
        summary: `Đa số du khách đánh giá cao hương vị bản địa chuẩn gốc, nguyên liệu tươi trong ngày và mức giá niêm yết minh bạch tại ${poi.name}.`,
        pros: [
          'Hương vị truyền thống đậm đà, nguyên liệu địa phương tươi sạch',
          'Không gian gọn gàng, giá cả minh bạch phù hợp đi cùng gia đình',
          'Thân thiện môi trường, hạn chế đồ nhựa dùng một lần',
        ],
        cons: [
          'Khung giờ cao điểm trưa (11:30–12:45) hoặc tối có thể hơi đông',
          'Một số món đặc sản có hải sản/gia vị miền Trung, nên dặn trước nếu kiêng',
        ],
        carbonSaved: '~1.8 – 2.6 kg CO₂/người khi gom cụm địa điểm gần nhau hoặc đi xe điện',
      };
    }
    return {
      questions: [
        `Điểm nhấn văn hóa & lịch sử đáng chú ý nhất tại ${poi.name}?`,
        `${poi.name} có lối đi bằng phẳng cho bố mẹ lớn tuổi không?`,
        `Nên đi ${poi.name} vào khung giờ nào để tránh nắng và đỡ đông?`,
        `Nếu trời mưa tháng 11–12 thì tham quan ${poi.name} thế nào?`,
      ],
      summary: `Du khách đánh giá ${poi.name} nổi bật với giá trị cảnh quan – di sản bản địa sâu sắc tại ${poi.city} và trải nghiệm không gian xanh thư thái.`,
      pros: [
        'Không gian di sản/sinh thái rộng thoáng, giá trị bản địa cao',
        'Thuận tiện kết hợp các điểm xanh lân cận trong cùng buổi',
        'Có phương án tiếp cận xanh bằng xe điện nội khu hoặc tản bộ',
      ],
      cons: [
        'Nên tránh khung trưa nắng gắt hoặc theo dõi dự báo mưa trước khi đi',
        'Cuối tuần lượng khách tham quan đông hơn từ 09:30 – 11:00',
      ],
      carbonSaved: '~2.2 – 3.5 kg CO₂/người khi dùng xe điện nội khu, xe buýt hoặc tàu hỏa',
    };
  }, [poi.name, poi.category, poi.city, isCafe]);

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

  const desktopPhotos = galleryImages.slice(0, 5);
  const desktopPhotoCount = desktopPhotos.length;

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
          width: 5px;
        }
        .poi-detail-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .poi-detail-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.16);
          border-radius: 9999px;
        }
        .poi-detail-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.34);
        }
      `}</style>

      {/* 1. Sticky Airbnb-style Action Header */}
      <header className="px-4 sm:px-7 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0 bg-white/95 backdrop-blur-md z-10 border-b border-neutral-200/80">
        <button
          type="button"
          aria-label="Đóng chi tiết"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 min-w-[40px] min-h-[40px] px-2.5 rounded-full text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          title="Đóng chi tiết"
        >
          <X className="w-5 h-5" aria-hidden="true" />
          <span className="hidden sm:inline text-xs font-semibold">Đóng</span>
        </button>

        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
          <button
            type="button"
            aria-label={copiedLink ? 'Đã sao chép liên kết' : 'Chia sẻ địa điểm'}
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-full text-xs font-semibold text-neutral-800 hover:bg-neutral-100 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            title={copiedLink ? 'Đã sao chép liên kết!' : 'Chia sẻ'}
          >
            <Share2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline underline underline-offset-2">
              {copiedLink ? 'Đã chép link' : 'Chia sẻ'}
            </span>
          </button>

          <FavoriteHeartButton
            active={isFavorite}
            pending={isFavoritePending}
            variant="pill"
            label={isFavorite ? 'Đã lưu' : 'Lưu'}
            ariaLabel={isFavorite ? `Bỏ lưu ${poi.name}` : `Lưu ${poi.name}`}
            title={isFavorite ? 'Đã lưu yêu thích' : 'Lưu yêu thích'}
            onClick={() => onToggleFavorite(poi.id, poi)}
          />

          <button
            type="button"
            aria-label="Xem vị trí bản đồ"
            onClick={onViewOnMap || onClose}
            disabled={!hasCoordinates}
            className="min-w-[40px] min-h-[40px] rounded-full border border-neutral-200 flex items-center justify-center text-neutral-700 hover:bg-neutral-50 hover:text-neutral-950 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            title={hasCoordinates ? 'Xem vị trí bản đồ' : 'Chưa có tọa độ chính xác'}
          >
            <MapPin className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-pressed={isAdded}
            onClick={handleToggleAddTrip}
            className={`${showAddToTrip ? '' : 'hidden'} inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-full text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
              isAdded
                ? 'bg-emerald-50 border border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                : 'bg-emerald-800 hover:bg-emerald-900 text-white shadow-xs'
            }`}
          >
            {isAdded ? (
              <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
            ) : (
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
            )}
            <span>{isAdded ? 'Đã thêm' : 'Thêm vào chuyến đi'}</span>
          </button>
        </div>
      </header>

      {/* 2. Scrollable Airbnb-style Detail Body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 xl:px-10 pt-5 pb-16 poi-detail-scrollbar">
        <div className="max-w-[1360px] mx-auto">
          {/* Title & Concise Subtitle */}
          <div className="mb-4">
            <h1 className="text-xl sm:text-[26px] font-bold tracking-tight text-neutral-950 leading-snug font-heading">
              {poi.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-neutral-600 font-medium">
              {poi.rating > 0 && (
                <span className="inline-flex items-center gap-1 font-semibold text-neutral-950">
                  <Star className="w-3.5 h-3.5 fill-neutral-950 text-neutral-950" aria-hidden="true" />
                  <span>{poi.rating.toFixed(1)}</span>
                  {reviewCount && (
                    <span className="text-neutral-600 font-normal">
                      ({reviewCount.toLocaleString('vi-VN')} đánh giá)
                    </span>
                  )}
                </span>
              )}
              <span className="text-neutral-300" aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-neutral-700">
                <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
                <span>{area ? `${area}, ${poi.city}` : `${poi.city}, Việt Nam`}</span>
              </span>
              <span className="text-neutral-300" aria-hidden="true">·</span>
              <span className="text-neutral-700">{categoryName}</span>
            </div>
          </div>

          {/* 3A. Desktop Photo Collage (1–5 authentic photos + Show All Photos button) */}
          {desktopPhotoCount > 0 && (
            <div className="relative hidden sm:block mb-6">
              <div
                className={
                  desktopPhotoCount === 1
                    ? 'grid w-full aspect-[2.1/1] max-h-[380px] xl:max-h-[430px] rounded-2xl overflow-hidden grid-cols-1 gap-2'
                    : desktopPhotoCount === 2
                      ? 'grid w-full aspect-[2.1/1] max-h-[380px] xl:max-h-[430px] rounded-2xl overflow-hidden grid-cols-2 gap-2'
                      : 'grid w-full aspect-[2/1] max-h-[380px] xl:max-h-[430px] rounded-2xl overflow-hidden grid-rows-2 gap-2'
                }
                style={
                  desktopPhotoCount === 3
                    ? { gridTemplateColumns: '1.65fr 1fr' }
                    : desktopPhotoCount === 4
                      ? { gridTemplateColumns: '1.8fr 1fr 1fr' }
                      : desktopPhotoCount >= 5
                        ? { gridTemplateColumns: '2fr 1fr 1fr' }
                        : undefined
                }
              >
                {desktopPhotos.map((src, idx) => {
                  const spanClass =
                    desktopPhotoCount >= 3 && idx === 0
                      ? 'row-span-2 col-span-1'
                      : desktopPhotoCount === 4 && idx === 1
                        ? 'row-span-1 col-span-2'
                        : 'row-span-1 col-span-1';
                  return (
                    <button
                      key={`${src}-${idx}`}
                      type="button"
                      onClick={() => setIsGalleryOpen(true)}
                      className={`${spanClass} h-full w-full relative overflow-hidden bg-neutral-100 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700`}
                      aria-label={`Mở thư viện ảnh ${poi.name}`}
                    >
                      <PoiImage
                        alt={idx === 0 ? poi.name : `${poi.name} - ảnh ${idx + 1}`}
                        poiId={poi.id}
                        poiName={poi.name}
                        category={poi.category}
                        city={poi.city}
                        fallbackSeed={`${poi.id}_${idx}`}
                        priority={idx === 0}
                        className={`w-full h-full object-cover group-hover:scale-[1.03] transition-transform ${idx === 0 ? 'duration-500' : 'duration-300'}`}
                        src={src}
                      />
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setIsGalleryOpen(true)}
                className="absolute bottom-3.5 right-3.5 inline-flex items-center gap-2 min-h-[40px] px-4 rounded-xl bg-white/95 hover:bg-white text-neutral-950 border border-neutral-900/15 shadow-sm text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <Grid2x2 className="w-4 h-4" aria-hidden="true" />
                <span>Xem tất cả ảnh ({galleryImages.length})</span>
              </button>
            </div>
          )}

          {/* 3B. Mobile Photo Hero (< 640px, 320px safe) */}
          {galleryImages[0] && (
            <div className="relative sm:hidden mb-5 rounded-2xl overflow-hidden bg-neutral-100">
              <button
                type="button"
                onClick={() => setIsGalleryOpen(true)}
                className="block w-full aspect-[16/10] cursor-pointer"
                aria-label={`Xem toàn bộ ${galleryImages.length} ảnh của ${poi.name}`}
              >
                <PoiImage
                  alt={poi.name}
                  poiId={poi.id}
                  poiName={poi.name}
                  category={poi.category}
                  city={poi.city}
                  fallbackSeed={`${poi.id}_0`}
                  priority
                  className="w-full h-full object-cover"
                  src={galleryImages[0]}
                />
              </button>
              <button
                type="button"
                onClick={() => setIsGalleryOpen(true)}
                className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-neutral-950/75 text-white text-xs font-semibold backdrop-blur-sm cursor-pointer"
              >
                <Grid2x2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>1 / {galleryImages.length} ảnh</span>
              </button>
            </div>
          )}

          {/* A2 2-Column Body: Left (65% Tabs & Deep Content) | Right (35% Sticky Summary & Mini-Map) */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1.85fr)_minmax(340px,420px)] gap-6 xl:gap-10 items-start">
            <div className="min-w-0">
              {/* Mobile/Tablet Eco & Rating Summary Banner (hidden on lg+ where sticky right card leads) */}
              <div className="lg:hidden rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 mb-6 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 flex items-center justify-center shrink-0">
                  <Leaf className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {poi.isGreen ? (
                      <span className="text-sm font-bold text-neutral-950">
                        Địa điểm xanh được GreenTrip xác minh
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-neutral-950">
                        Điểm đến nổi bật tại {poi.city}
                      </span>
                    )}
                    {poi.isGreen && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
                        Địa điểm xanh
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-600 leading-relaxed">
                    {breakdown.summaryReason}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 sm:gap-5 pt-3 sm:pt-0 border-t sm:border-t-0 sm:border-l border-neutral-200 sm:pl-5 shrink-0">
                {poi.rating > 0 && (
                  <div className="text-center">
                    <div className="text-lg font-bold text-neutral-950 leading-none">
                      {poi.rating.toFixed(1)}
                    </div>
                    <div className="mt-1 text-xs font-medium text-neutral-600">
                      {reviewCount ? `${reviewCount.toLocaleString('vi-VN')} đánh giá` : 'Đánh giá'}
                    </div>
                  </div>
                )}
                <div className="h-8 w-px bg-neutral-200" aria-hidden="true" />
                <div className="text-center">
                  <div className="text-lg font-bold text-emerald-800 leading-none">
                    {breakdown.totalScore}/100
                  </div>
                  <div className="mt-1 text-xs font-medium text-neutral-600">Điểm xanh</div>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Tabs Navigation (WCAG AA compliant contrast) */}
          <div
            role="tablist"
            aria-label="Thông tin chi tiết địa điểm"
            className="border-b border-neutral-200 flex items-center gap-5 sm:gap-7 mb-6 text-sm overflow-x-auto no-scrollbar"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
              className={`min-h-[44px] px-0.5 pb-2.5 whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                activeTab === 'overview'
                  ? 'text-neutral-950 border-b-2 border-neutral-950 font-semibold'
                  : 'text-neutral-600 hover:text-neutral-950 font-medium'
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
                className={`min-h-[44px] px-0.5 pb-2.5 whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                  activeTab === 'menu'
                    ? 'text-neutral-950 border-b-2 border-neutral-950 font-semibold'
                    : 'text-neutral-600 hover:text-neutral-950 font-medium'
                }`}
              >
                Thực đơn &amp; Bảng giá
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'guides'}
              onClick={() => setActiveTab('guides')}
              className={`min-h-[44px] px-0.5 pb-2.5 whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                activeTab === 'guides'
                  ? 'text-neutral-950 border-b-2 border-neutral-950 font-semibold'
                  : 'text-neutral-600 hover:text-neutral-950 font-medium'
              }`}
            >
              Mẹo đi bền vững
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'location'}
              onClick={() => setActiveTab('location')}
              className={`min-h-[44px] px-0.5 pb-2.5 whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                activeTab === 'location'
                  ? 'text-neutral-950 border-b-2 border-neutral-950 font-semibold'
                  : 'text-neutral-600 hover:text-neutral-950 font-medium'
              }`}
            >
              Vị trí bản đồ
            </button>
          </div>

          {/* 5A. Tab Tổng quan (Airbnb clean divided sections) */}
          {activeTab === 'overview' && (
            <div className="divide-y divide-neutral-200 animate-fadeIn">
              {/* Quick Trip Facts — clean 2-col monochrome icon rows */}
              <div className="pb-6">
                <h2 className="text-base font-bold text-neutral-950 font-heading mb-4">
                  Thông tin nhanh cho chuyến đi
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-neutral-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-neutral-600">Địa chỉ</div>
                      <p className="text-sm font-medium text-neutral-950 leading-snug mt-0.5">
                        {poi.address || `${poi.city}, Việt Nam`}
                      </p>
                      {plusCode && <p className="text-xs text-neutral-600 mt-0.5">Mã Plus: {plusCode}</p>}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-neutral-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-neutral-600">Giờ mở cửa</div>
                      <p className="text-sm font-medium text-neutral-950 leading-snug mt-0.5">
                        {poi.openHours || '07:30 – 17:30'}
                      </p>
                      {isTempClosed && (
                        <p className="text-xs text-red-700 font-semibold flex items-center gap-1 mt-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>Đang tạm ngưng đón khách</span>
                        </p>
                      )}
                      {!isTempClosed && liveStatus && liveStatus !== poi.openHours && (
                        <p className="text-xs text-emerald-800 font-medium mt-0.5">{liveStatus}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Ticket className="w-5 h-5 text-neutral-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-neutral-600">Mức giá tham khảo</div>
                      <p className="text-sm font-semibold text-neutral-950 leading-snug mt-0.5">
                        {priceDisplay}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Timer className="w-5 h-5 text-neutral-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-neutral-600">Thời lượng gợi ý</div>
                      <p className="text-sm font-medium text-neutral-950 leading-snug mt-0.5">
                        {poi.visitDuration}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description & Vibes */}
              <div className="py-6 space-y-3">
                <h2 className="text-base font-bold text-neutral-950 font-heading">
                  Giới thiệu địa điểm
                </h2>
                <p className="text-neutral-700 text-[15px] leading-relaxed whitespace-pre-line">
                  {cleanDescription(poi.description)}
                </p>

                {vibeBadges.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {vibeBadges.map((badge) => (
                      <span
                        key={badge}
                        className="inline-flex items-center rounded-full bg-neutral-100 border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-800"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Amenities & Green Commitments — Airbnb "What this place offers" 2-column grid */}
              {combinedOffers.length > 0 && (
                <div className="py-6 space-y-4">
                  <h2 className="text-base font-bold text-neutral-950 font-heading">
                    Tiện ích &amp; Tiêu chuẩn bền vững
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {combinedOffers.slice(0, 6).map((item) => (
                      <div key={item.label} className="flex items-center gap-3 text-sm text-neutral-800">
                        {item.group === 'eco' ? (
                          <Leaf className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-neutral-700 shrink-0" aria-hidden="true" />
                        )}
                        <span className="leading-snug">{item.label}</span>
                      </div>
                    ))}
                  </div>
                  {combinedOffers.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setIsAmenitiesOpen(true)}
                      className="inline-flex items-center justify-center min-h-[42px] px-5 rounded-xl border border-neutral-900 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-950 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      Xem tất cả {combinedOffers.length} tiện ích &amp; tiêu chuẩn
                    </button>
                  )}
                </div>
              )}

              {/* Green Score 4 Pillars & Knowledge Graph */}
              <div className="py-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-neutral-950 font-heading flex items-center gap-2">
                      <Leaf className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                      <span>Chỉ số du lịch xanh ({breakdown.totalScore}/100)</span>
                    </h2>
                    <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                      {mindtripAiInsights.carbonSaved}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsKgModalOpen(true)}
                    className="inline-flex min-h-[40px] items-center self-start sm:self-center px-4 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-950 shrink-0 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    Vì sao chọn? (Đồ thị Tri thức)
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {breakdown.pillars.map((pillar) => (
                    <div key={pillar.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-neutral-800">
                        <span className="font-medium">
                          {pillar.label} ({pillar.weightPct}%)
                        </span>
                        <span className="font-bold text-neutral-950">{pillar.score}/100</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-700"
                          style={{ width: `${pillar.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {crowd.peakHours && (
                  <div className="rounded-xl bg-amber-50/80 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-950 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <strong>Mức độ đông đúc ({crowd.label}):</strong> Giờ cao điểm thường rơi vào{' '}
                      <strong>{crowd.peakHours}</strong>. {crowd.offPeakTip}.
                    </div>
                  </div>
                )}
              </div>

              {/* AI Copilot Quick Prompts + Pros/Cons Summary */}
              <div className="py-6 space-y-5">
                {onAskCopilot && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-bold text-neutral-950 font-heading flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                        <span>Hỏi nhanh Trợ lý GreenTrip AI</span>
                      </h2>
                      <span className="text-xs font-medium text-neutral-600">Bấm để mở Copilot</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {mindtripAiInsights.questions.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => onAskCopilot(q)}
                          className="min-h-[42px] px-3.5 py-2.5 rounded-xl bg-neutral-50 hover:bg-emerald-50 border border-neutral-200 hover:border-emerald-300 text-xs font-medium text-neutral-800 hover:text-emerald-950 text-left transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                        >
                          {q} →
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-neutral-950 font-heading">
                      Tóm tắt trải nghiệm từ AI
                    </h2>
                    <span className="text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                      Ưu &amp; Nhược điểm
                    </span>
                  </div>
                  <p className="text-sm text-neutral-700 leading-relaxed">
                    {mindtripAiInsights.summary}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-emerald-50/60 border border-emerald-200/80 p-4 space-y-2">
                      <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                        <span>Điểm cộng nổi bật</span>
                      </div>
                      <ul className="space-y-1.5 text-xs text-emerald-950 leading-relaxed">
                        {mindtripAiInsights.pros.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <span className="shrink-0 font-bold text-emerald-700">+</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl bg-amber-50/60 border border-amber-200/80 p-4 space-y-2">
                      <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-700" aria-hidden="true" />
                        <span>Lưu ý thực tế</span>
                      </div>
                      <ul className="space-y-1.5 text-xs text-amber-950 leading-relaxed">
                        {mindtripAiInsights.cons.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <span className="shrink-0 font-bold text-amber-700">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Reviews Grid — Airbnb style */}
              {featuredReviews.length > 0 && (
                <div className="py-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-neutral-950 font-heading flex items-center gap-2">
                      <Star className="w-4 h-4 fill-neutral-950 text-neutral-950" aria-hidden="true" />
                      <span>
                        {poi.rating.toFixed(1)} ·{' '}
                        {reviewCount
                          ? `${reviewCount.toLocaleString('vi-VN')} đánh giá`
                          : `${featuredReviews.length} nhận xét nổi bật`}
                      </span>
                    </h2>
                    <span className="text-xs font-medium text-neutral-600">Nguồn: Google Maps</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {featuredReviews.slice(0, 4).map((rev, idx) => (
                      <article
                        key={`${rev.author}_${idx}`}
                        className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className="w-9 h-9 rounded-full bg-neutral-900 text-white text-xs font-bold flex items-center justify-center shrink-0"
                              aria-hidden="true"
                            >
                              {rev.author.trim().charAt(0).toUpperCase() || 'G'}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-neutral-950 truncate">
                                {rev.author}
                              </div>
                              {rev.relative_time && (
                                <div className="text-xs text-neutral-600">{rev.relative_time}</div>
                              )}
                            </div>
                          </div>
                          <div
                            className="inline-flex items-center gap-0.5 text-xs font-semibold text-neutral-950 shrink-0"
                            aria-label={`${rev.rating} trên 5 sao`}
                          >
                            <Star className="w-3.5 h-3.5 fill-neutral-950 text-neutral-950" aria-hidden="true" />
                            <span>{rev.rating.toFixed(1)}</span>
                          </div>
                        </div>
                        <p className="text-sm text-neutral-700 leading-relaxed line-clamp-4">
                          {rev.text}
                        </p>
                      </article>
                    ))}
                  </div>

                  {featuredReviews.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setIsReviewsOpen(true)}
                      className="inline-flex items-center justify-center min-h-[42px] px-5 rounded-xl border border-neutral-900 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-950 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      Xem tất cả {featuredReviews.length} nhận xét nổi bật
                    </button>
                  )}
                </div>
              )}

              {/* Contact & External Links */}
              <div className="py-6 space-y-3">
                <h2 className="text-base font-bold text-neutral-950 font-heading">Liên hệ &amp; Bản đồ</h2>
                <div className="flex flex-wrap items-center gap-2.5">
                  {poi.phone_number && (
                    <>
                      <a
                        href={`tel:${poi.phone_number.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-2 min-h-[40px] px-4 rounded-xl bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                      >
                        <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Gọi {poi.phone_number}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCopyPhone(poi.phone_number!)}
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl border border-neutral-300 bg-white text-neutral-800 text-xs font-semibold hover:bg-neutral-50 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                      >
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{copiedPhone ? 'Đã sao chép SĐT' : 'Sao chép SĐT'}</span>
                      </button>
                    </>
                  )}

                  {poi.website_url && (
                    <a
                      href={poi.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-xl border border-neutral-300 bg-white text-neutral-900 text-xs font-semibold hover:bg-neutral-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Website chính thức</span>
                    </a>
                  )}

                  {facebookUrl && (
                    <a
                      href={facebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-xl border border-neutral-300 bg-white text-neutral-900 text-xs font-semibold hover:bg-neutral-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Trang Facebook</span>
                    </a>
                  )}

                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-xl border border-neutral-300 bg-white text-neutral-900 text-xs font-semibold hover:bg-neutral-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Mở trên Google Maps</span>
                  </a>
                </div>
              </div>

              {/* Nearby Eco POIs */}
              {nearbyPois.length > 0 && (
                <div className="pt-6 space-y-3">
                  <h2 className="text-base font-bold text-neutral-950 font-heading flex items-center gap-2">
                    <Compass className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                    <span>Địa điểm xanh gần đây (Gợi ý kết hợp)</span>
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {nearbyPois.map((np) => (
                      <button
                        key={np.id}
                        type="button"
                        onClick={() => onSelectNearbyPoi?.(np.id)}
                        className="rounded-xl border border-neutral-200 bg-white hover:border-neutral-400 hover:shadow-xs p-2.5 text-left transition cursor-pointer flex items-center gap-2.5 min-h-[60px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                      >
                        <PoiImage
                          src={np.image}
                          alt={np.name}
                          poiId={np.id}
                          poiName={np.name}
                          category={np.category}
                          city={np.city}
                          className="w-12 h-12 rounded-lg object-cover shrink-0 border border-neutral-200"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-neutral-950 truncate">{np.name}</div>
                          <div className="text-xs text-neutral-600 truncate mt-0.5">
                            ★ {np.rating.toFixed(1)} · {np.city}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5B. Tab Thực đơn & Bảng giá */}
          {activeTab === 'menu' && hasMenu && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-neutral-950 font-heading flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                  <span>Thực đơn &amp; Bảng giá tham khảo</span>
                </h2>
                <span className="text-xs font-semibold text-neutral-700 bg-neutral-100 px-3 py-1 rounded-full">
                  {priceDisplay}
                </span>
              </div>

              {menuImageUrl && (
                <div className="rounded-2xl border border-neutral-200 overflow-hidden bg-neutral-50">
                  <button
                    type="button"
                    onClick={() => setIsMenuZoomOpen(true)}
                    className="block w-full relative group cursor-zoom-in"
                    aria-label="Phóng to ảnh thực đơn"
                  >
                    <PoiImage
                      src={menuImageUrl}
                      alt={`Ảnh thực đơn ${poi.name}`}
                      poiId={poi.id}
                      poiName={poi.name}
                      category={poi.category}
                      city={poi.city}
                      className="w-full max-h-[360px] object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                    <span className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-neutral-950/80 text-white text-xs font-semibold">
                      Bấm để phóng to thực đơn
                    </span>
                  </button>
                </div>
              )}

              {menuItems.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {menuItems.map((item, idx) => (
                    <div
                      key={`${item.name}_${idx}`}
                      className="rounded-xl border border-neutral-200 bg-white p-3.5 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-neutral-950">{item.name}</span>
                          {item.is_signature && (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                              Nên thử
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-xs text-neutral-600 mt-0.5 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                      </div>
                      {item.price > 0 && (
                        <span className="text-xs font-bold text-emerald-800 shrink-0 whitespace-nowrap">
                          {new Intl.NumberFormat('vi-VN').format(item.price)} ₫
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                !menuImageUrl && (
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-700 leading-relaxed">
                    Mức giá tham khảo tại <strong>{poi.name}</strong>: <strong>{priceDisplay}</strong>.
                    Bạn có thể hỏi nhanh Trợ lý GreenTrip AI để biết món nên thử hoặc khẩu phần phù hợp nhóm của mình.
                  </div>
                )
              )}
            </div>
          )}

          {/* 5C. Tab Mẹo đi bền vững */}
          {activeTab === 'guides' && (
            <div className="space-y-4 text-sm animate-fadeIn">
              <h2 className="font-bold text-neutral-950 text-base font-heading">
                Mẹo trải nghiệm &amp; Du lịch bền vững
              </h2>

              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-2">
                <div className="font-semibold text-emerald-950 flex items-center gap-2">
                  <Bike className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                  <span>Phương tiện &amp; Lộ trình xanh đề xuất</span>
                </div>
                <p className="text-neutral-700 leading-relaxed">
                  {transportTip ||
                    'Khuyến khích tiếp cận bằng xe đạp công cộng, đi bộ hoặc phương tiện điện xanh để giảm phát thải carbon tại điểm đến.'}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-neutral-200 space-y-2">
                <div className="font-semibold text-neutral-950 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-neutral-700 shrink-0" aria-hidden="true" />
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
                <div className="p-4 rounded-2xl bg-white border border-neutral-200 space-y-2.5">
                  <div className="font-semibold text-neutral-950 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-neutral-700 shrink-0" aria-hidden="true" />
                    <span>Tiện ích &amp; Dịch vụ tại điểm đến</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {amenities.map((am) => (
                      <span
                        key={am}
                        className="inline-flex items-center rounded-full bg-neutral-50 border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-800"
                      >
                        ✓ {am}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {poi.eco_features && poi.eco_features.length > 0 && (
                <div className="p-4 rounded-2xl bg-white border border-neutral-200 space-y-2">
                  <div className="font-semibold text-neutral-950 flex items-center gap-2">
                    <Leaf className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                    <span>Cam kết sinh thái &amp; Bảo tồn bản địa</span>
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

          {/* 5D. Tab Vị trí bản đồ */}
          {activeTab === 'location' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-5 rounded-2xl bg-white border border-neutral-200 space-y-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-neutral-600">Địa chỉ chi tiết</p>
                  <p className="text-neutral-950 font-medium mt-1">
                    {poi.address || `${poi.city}, Việt Nam`}
                  </p>
                  {plusCode && <p className="text-xs text-neutral-600 mt-1">Mã Plus: {plusCode}</p>}
                </div>

                <div>
                  <p className="text-xs font-semibold text-neutral-600">Tọa độ địa lý (WGS84)</p>
                  <p className="text-neutral-800 font-mono text-xs mt-1">
                    {hasCoordinates
                      ? `${poi.lat.toFixed(6)}, ${poi.lng.toFixed(6)}`
                      : 'Chưa có tọa độ chính xác'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={onViewOnMap || onClose}
                    disabled={!hasCoordinates}
                    className="inline-flex items-center gap-1.5 min-h-[42px] px-5 bg-neutral-950 text-white text-xs font-semibold rounded-xl hover:bg-neutral-800 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <MapPin className="w-4 h-4" aria-hidden="true" />
                    <span>
                      {hasCoordinates ? 'Mở trên bản đồ tương tác' : 'Chưa có vị trí trên bản đồ'}
                    </span>
                  </button>
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-[42px] px-5 border border-neutral-300 bg-white text-neutral-900 text-xs font-semibold rounded-xl hover:bg-neutral-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <Navigation className="w-4 h-4" aria-hidden="true" />
                    <span>Chỉ đường Google Maps</span>
                  </a>
                </div>
              </div>
            </div>
          )}
            </div>

            {/* Right Sticky Column (~35%): Green Score + Hours/Price + Actions + Mini-Map */}
            <aside
              aria-label="Tóm tắt địa điểm và hành động nhanh"
              className="lg:sticky lg:top-6 self-start space-y-4"
            >
              <div className="rounded-2xl border border-neutral-200/90 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.08)] space-y-4">
                {/* Green Score + Rating Header */}
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-neutral-100">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 flex items-center justify-center shrink-0">
                      <Leaf className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block">
                        {poi.isGreen ? 'Điểm xanh GreenTrip' : `Điểm đến tại ${poi.city}`}
                      </span>
                      <div className="text-2xl font-extrabold text-neutral-950 leading-tight">
                        {breakdown.totalScore}
                        <span className="text-sm font-semibold text-neutral-600">/100</span>
                      </div>
                    </div>
                  </div>
                  {poi.rating > 0 && (
                    <div className="text-right shrink-0">
                      <div className="inline-flex items-center gap-1 text-sm font-bold text-neutral-950">
                        <Star className="w-4 h-4 fill-neutral-950 text-neutral-950" aria-hidden="true" />
                        <span>{poi.rating.toFixed(1)}</span>
                      </div>
                      <div className="text-xs text-neutral-600">
                        {reviewCount ? `${reviewCount.toLocaleString('vi-VN')} đánh giá` : 'Đánh giá'}
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-xs text-neutral-700 leading-relaxed bg-emerald-50/60 border border-emerald-100 rounded-xl px-3.5 py-2.5">
                  {breakdown.summaryReason}
                </p>

                {/* Key Practical Facts */}
                <dl className="space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="inline-flex items-center gap-1.5 text-neutral-600 font-medium shrink-0">
                      <Clock className="w-3.5 h-3.5 text-neutral-500" aria-hidden="true" />
                      <span>Giờ mở cửa</span>
                    </dt>
                    <dd className="text-right font-semibold text-neutral-950">
                      {poi.openHours || '07:30 – 17:30'}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="inline-flex items-center gap-1.5 text-neutral-600 font-medium shrink-0">
                      <Ticket className="w-3.5 h-3.5 text-neutral-500" aria-hidden="true" />
                      <span>Mức giá</span>
                    </dt>
                    <dd className="text-right font-semibold text-neutral-950">{priceDisplay}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="inline-flex items-center gap-1.5 text-neutral-600 font-medium shrink-0">
                      <Timer className="w-3.5 h-3.5 text-neutral-500" aria-hidden="true" />
                      <span>Thời lượng</span>
                    </dt>
                    <dd className="text-right font-semibold text-neutral-950">
                      {poi.visitDuration || 'Khoảng 1.5 giờ'}
                    </dd>
                  </div>
                </dl>

                {/* Primary Actions */}
                <div className="space-y-2.5 pt-1">
                  {showAddToTrip && (
                    <button
                      type="button"
                      aria-pressed={isAdded}
                      onClick={handleToggleAddTrip}
                      className={`w-full min-h-[44px] px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                        isAdded
                          ? 'bg-emerald-50 border border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                          : 'bg-emerald-800 hover:bg-emerald-900 text-white shadow-xs'
                      }`}
                    >
                      {isAdded ? (
                        <Check className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                      ) : (
                        <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                      )}
                      <span>{isAdded ? 'Đã thêm vào chuyến đi' : 'Thêm vào chuyến đi'}</span>
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isFavoritePending}
                      onClick={() => onToggleFavorite(poi.id, poi)}
                      className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60 ${
                        isFavorite
                          ? 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
                          : 'border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50'
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 shrink-0 ${isFavorite ? 'fill-rose-600 text-rose-600' : ''}`}
                        aria-hidden="true"
                      />
                      <span>{isFavorite ? 'Đã lưu' : 'Lưu địa điểm'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShare}
                      className="min-h-[44px] px-3 rounded-xl border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      <Share2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{copiedLink ? 'Đã chép link' : 'Chia sẻ'}</span>
                    </button>
                  </div>
                </div>

                {/* Mini-Map Card */}
                <div className="pt-2 border-t border-neutral-100 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-950 inline-flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                      <span>Vị trí bản đồ</span>
                    </span>
                    <span className="text-neutral-600 truncate max-w-[160px]">{area || poi.city}</span>
                  </div>

                  {hasCoordinates ? (
                    <div className="h-[190px] w-full rounded-xl overflow-hidden border border-neutral-200 relative bg-neutral-100">
                      <PoiMap
                        pois={[poi]}
                        selectedPoiId={null}
                        hoveredPoiId={null}
                        onSelectPoi={() => undefined}
                        onHoverPoi={() => undefined}
                        hideTopControls
                        showMapLoader={false}
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-4 text-xs text-neutral-600">
                      Chưa có tọa độ bản đồ chi tiết cho địa điểm này.
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={onViewOnMap || onClose}
                      disabled={!hasCoordinates}
                      className="min-h-[40px] px-2.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-900 inline-flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
                      <span>Mở bản đồ lớn</span>
                    </button>
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] px-2.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-900 inline-flex items-center justify-center gap-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      <Navigation className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Google Maps</span>
                    </a>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Modal 1: Fullscreen Photo Gallery (Airbnb Home photo gallery style) */}
      {isGalleryOpen &&
        galleryImages.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Thư viện ảnh ${poi.name}`}
            className="fixed inset-0 z-[9998] bg-white flex flex-col animate-fadeIn"
          >
            <div className="px-4 sm:px-8 h-16 border-b border-neutral-200 flex items-center justify-between shrink-0 bg-white">
              <button
                type="button"
                onClick={() => setIsGalleryOpen(false)}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full hover:bg-neutral-100 text-sm font-semibold text-neutral-900 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                <span>Quay lại</span>
              </button>
              <span className="text-sm font-semibold text-neutral-900 truncate max-w-[45%] hidden sm:inline">
                {poi.name} ({galleryImages.length} ảnh)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full hover:bg-neutral-100 text-xs font-semibold text-neutral-800 transition cursor-pointer"
                >
                  <Share2 className="w-4 h-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{copiedLink ? 'Đã chép' : 'Chia sẻ'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(poi.id, poi)}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full hover:bg-neutral-100 text-xs font-semibold text-neutral-800 transition cursor-pointer"
                >
                  <Heart
                    className={`w-4 h-4 ${isFavorite ? 'fill-rose-600 text-rose-600' : ''}`}
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline">{isFavorite ? 'Đã lưu' : 'Lưu'}</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-8 py-6 sm:py-8">
              <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
                {galleryImages.map((src, idx) => {
                  const isHeroRow = idx % 3 === 0;
                  return (
                    <div
                      key={`${src}_gallery_${idx}`}
                      className={`${isHeroRow ? 'sm:col-span-2 aspect-[16/10]' : 'aspect-[4/3]'} rounded-xl overflow-hidden bg-neutral-100`}
                    >
                      <PoiImage
                        src={src}
                        alt={`${poi.name} - ảnh ${idx + 1}`}
                        poiId={poi.id}
                        poiName={poi.name}
                        category={poi.category}
                        city={poi.city}
                        fallbackSeed={`${poi.id}_gal_${idx}`}
                        priority={idx === 0}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Modal 2: Amenities & Sustainability Details (Airbnb Amenities modal style) */}
      {isAmenitiesOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Tất cả tiện ích và tiêu chuẩn bền vững"
            onClick={() => setIsAmenitiesOpen(false)}
            className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4 animate-fadeIn"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl max-h-[82vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAmenitiesOpen(false)}
                  aria-label="Đóng"
                  className="w-10 h-10 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-800 cursor-pointer"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
                <h3 className="text-base font-bold text-neutral-950">Tiện ích &amp; Tiêu chuẩn xanh</h3>
                <div className="w-10" />
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-6">
                {ecoHighlights.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-neutral-950">Tiêu chuẩn du lịch bền vững</h4>
                    <ul className="divide-y divide-neutral-200">
                      {ecoHighlights.map((item) => (
                        <li key={item} className="py-3 flex items-center gap-3 text-sm text-neutral-800">
                          <Leaf className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {amenities.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-neutral-950">Tiện ích &amp; Dịch vụ tại chỗ</h4>
                    <ul className="divide-y divide-neutral-200">
                      {amenities.map((am) => (
                        <li key={am} className="py-3 flex items-center gap-3 text-sm text-neutral-800">
                          <CheckCircle2 className="w-4 h-4 text-neutral-700 shrink-0" aria-hidden="true" />
                          <span>{am}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Modal 3: Reviews Explorer (Airbnb Reviews modal style) */}
      {isReviewsOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Đánh giá cho ${poi.name}`}
            onClick={() => setIsReviewsOpen(false)}
            className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4 animate-fadeIn"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl max-h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => setIsReviewsOpen(false)}
                  aria-label="Đóng đánh giá"
                  className="w-10 h-10 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-800 cursor-pointer"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
                <h3 className="text-base font-bold text-neutral-950">Đánh giá từ du khách</h3>
                <div className="w-10" />
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain p-6 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
                <div className="space-y-4">
                  <div className="text-center md:text-left p-4 rounded-2xl bg-neutral-50 border border-neutral-200">
                    <div className="text-4xl font-bold text-neutral-950">{poi.rating.toFixed(1)}</div>
                    <div className="text-xs font-semibold text-neutral-700 mt-1">
                      {reviewCount
                        ? `${reviewCount.toLocaleString('vi-VN')} đánh giá Google Maps`
                        : `${featuredReviews.length} nhận xét nổi bật`}
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {breakdown.pillars.map((pillar) => (
                      <div key={pillar.key} className="flex items-center justify-between text-xs text-neutral-700 border-b border-neutral-100 pb-2">
                        <span>{pillar.label}</span>
                        <span className="font-bold text-neutral-950">{pillar.score}/100</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="relative">
                    <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <input
                      type="text"
                      name="review_search"
                      aria-label="Tìm kiếm trong nhận xét"
                      value={reviewQuery}
                      onChange={(e) => setReviewQuery(e.target.value)}
                      placeholder="Tìm kiếm trong nhận xét…"
                      className="w-full h-11 pl-10 pr-4 rounded-full border border-neutral-300 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus:border-neutral-950"
                    />
                  </div>

                  {filteredReviews.length === 0 ? (
                    <p className="text-sm text-neutral-600 py-6 text-center">
                      Không tìm thấy nhận xét khớp từ khóa "{reviewQuery}".
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {filteredReviews.map((rev, idx) => (
                        <article
                          key={`modal_rev_${rev.author}_${idx}`}
                          className="pb-4 border-b border-neutral-200 last:border-b-0 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-9 h-9 rounded-full bg-neutral-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
                                {rev.author.trim().charAt(0).toUpperCase() || 'G'}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-neutral-950 truncate">
                                  {rev.author}
                                </div>
                                {rev.relative_time && (
                                  <div className="text-xs text-neutral-600">{rev.relative_time}</div>
                                )}
                              </div>
                            </div>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-950">
                              <Star className="w-3.5 h-3.5 fill-neutral-950 text-neutral-950" aria-hidden="true" />
                              {rev.rating.toFixed(1)}
                            </span>
                          </div>
                          <p className="text-sm text-neutral-700 leading-relaxed">{rev.text}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Modal 4: Zoom Menu Image */}
      {isMenuZoomOpen &&
        menuImageUrl &&
        typeof document !== 'undefined' &&
        createPortal(
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
                className="absolute top-3 right-3 z-20 w-10 h-10 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center border border-white/30 transition-colors cursor-pointer shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Đóng phóng to"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
              <PoiImage
                src={menuImageUrl}
                alt={`Bảng giá thực đơn chi tiết ${poi.name}`}
                poiId={poi.id}
                poiName={poi.name}
                category={poi.category}
                city={poi.city}
                priority
                className="w-full h-auto max-h-[85vh] object-contain"
              />
            </div>
          </div>,
          document.body,
        )}

      {isKgModalOpen && (
        <ExplanationModal
          poiId={poi.id}
          poiName={poi.name}
          explanationSnippet={breakdown.summaryReason}
          isOpen={isKgModalOpen}
          onClose={() => setIsKgModalOpen(false)}
        />
      )}
    </section>
  );

  if (isMobileView && typeof document !== 'undefined') {
    return createPortal(detailContent, document.body);
  }

  return detailContent;
}

import { Check, ChevronLeft, ChevronRight, Leaf, Plus, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  computeGreenScoreBreakdown,
  evaluateCrowdProfile,
  evaluateLocalAuthentic,
  getGalleryImages,
  SUB_CATEGORY_LABELS,
  type Poi,
} from '@/data/pois';
import { CATEGORY_META } from '@/components/explore/exploreUtils';
import ExplanationModal from '@/components/poi/ExplanationModal';
import PoiImage from '@/components/ui/PoiImage';
import FavoriteHeartButton from '@/components/ui/FavoriteHeartButton';

export interface ExplorePoiCardProps {
  poi: Poi;
  index?: number;
  active?: boolean;
  favorite?: boolean;
  favoritePending?: boolean;
  isAdded?: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
  onToggleFavorite: (id: string, poi?: Poi) => void;
  onToggleAddTrip?: (id: string) => void;
  showLocalAuthenticBadge?: boolean;
}

function formatCardPrice(poi: Poi): string {
  const display = poi.ai_metadata?.price_range_display?.trim();
  if (display) {
    if (/^miễn phí/i.test(display)) return 'Miễn phí tham quan';
    return display;
  }
  if (poi.category === 'luu-tru') {
    if (poi.estimatedCost && poi.estimatedCost > 0) {
      return `${new Intl.NumberFormat('vi-VN').format(poi.estimatedCost)}₫ / đêm`;
    }
    return 'Liên hệ giá phòng';
  }
  if (poi.estimatedCost == null || poi.estimatedCost === 0) {
    return 'Miễn phí tham quan';
  }
  return `Từ ${new Intl.NumberFormat('vi-VN').format(poi.estimatedCost)}₫ / người`;
}

export default function ExplorePoiCard({
  poi,
  active = false,
  favorite = false,
  favoritePending = false,
  isAdded = false,
  onClick,
  onHover,
  onToggleFavorite,
  onToggleAddTrip,
  showLocalAuthenticBadge = false,
}: ExplorePoiCardProps) {
  const [imgIdx, setImgIdx] = useState(0);
  const [isCardHovered, setIsCardHovered] = useState(false);
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);

  const gallery = useMemo(() => getGalleryImages(poi), [poi]);
  const auth = useMemo(() => evaluateLocalAuthentic(poi), [poi]);
  const crowd = useMemo(() => evaluateCrowdProfile(poi), [poi]);
  const greenBreakdown = useMemo(() => computeGreenScoreBreakdown(poi), [poi]);
  const communityBadgeLabel =
    auth.badgeLabel ||
    (poi.isLocalBusiness
      ? poi.category === 'luu-tru'
        ? 'Lưu trú cộng đồng'
        : 'Cộng đồng bản địa'
      : showLocalAuthenticBadge
        ? 'Bản địa ít đông'
        : null);

  const isCafe = Boolean(
    poi.sub_category?.includes('cafe') ||
      poi.sub_category?.includes('coffee') ||
      /coffee|cafe|cà phê|tiệm trà|workspace/i.test(poi.name),
  );
  const resolvedCategoryLabel =
    poi.sub_category && SUB_CATEGORY_LABELS[poi.sub_category]
      ? SUB_CATEGORY_LABELS[poi.sub_category]
      : isCafe
        ? 'Quán cà phê'
        : CATEGORY_META[poi.category]?.label || 'Điểm tham quan';

  const locationLabel = poi.ai_metadata?.area?.trim()
    ? `${poi.ai_metadata.area.trim()}, ${poi.city}`
    : poi.city;
  const priceLabel = formatCardPrice(poi);

  return (
    <article
      onClick={onClick}
      onMouseEnter={() => {
        setIsCardHovered(true);
        onHover(poi.id);
      }}
      onMouseLeave={() => {
        setIsCardHovered(false);
        onHover(null);
      }}
      className="flex flex-col group cursor-pointer"
    >
      {/* 1:1 Airbnb-style Image Frame */}
      <div
        className={`relative w-full aspect-[1.05/1] rounded-2xl overflow-hidden bg-neutral-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition-shadow duration-200 isolate ${
          active ? 'ring-2 ring-neutral-950 ring-offset-2' : ''
        }`}
      >
        <PoiImage
          src={gallery[imgIdx] || poi.image}
          alt={poi.name}
          poiId={poi.id}
          poiName={poi.name}
          category={poi.category}
          city={poi.city}
          fallbackSeed={`${poi.id}_${imgIdx}`}
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
        />

        {/* Subtle top gradient for icon readability */}
        <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/30 via-black/10 to-transparent pointer-events-none z-[5]" />

        {/* Hover Carousel Controls (Airbnb crisp white circles) */}
        {isCardHovered && imgIdx > 0 && (
          <button
            type="button"
            aria-label="Ảnh trước"
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((prev) => Math.max(0, prev - 1));
            }}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/95 hover:bg-white text-neutral-900 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition z-10 cursor-pointer"
            title="Ảnh trước"
          >
            <ChevronLeft className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
          </button>
        )}

        {isCardHovered && imgIdx < gallery.length - 1 && (
          <button
            type="button"
            aria-label="Ảnh kế tiếp"
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((prev) => Math.min(gallery.length - 1, prev + 1));
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/95 hover:bg-white text-neutral-900 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition z-10 cursor-pointer"
            title="Ảnh kế tiếp"
          >
            <ChevronRight className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
          </button>
        )}

        {/* Top-left Eco Badge (Airbnb frosted white pill, no pulsing noise) */}
        {poi.isGreen && (
          <div
            className="absolute top-3 left-3 z-10 pointer-events-auto cursor-help"
            title="Địa điểm du lịch xanh: Thân thiện môi trường, tiết kiệm năng lượng và bảo tồn văn hóa địa phương"
          >
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-sm text-emerald-900 border border-white/70 text-xs font-semibold tracking-tight shadow-xs">
              <Leaf className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>Địa điểm xanh</span>
            </span>
          </div>
        )}

        {/* Top-right Actions (40px touch targets) */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
          <FavoriteHeartButton
            active={favorite}
            pending={favoritePending}
            variant="overlay"
            ariaLabel={favorite ? `Bỏ lưu ${poi.name}` : `Lưu ${poi.name}`}
            title={favorite ? 'Đã lưu yêu thích' : 'Lưu yêu thích'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(poi.id, poi);
            }}
          />
          <button
            type="button"
            aria-label={isAdded ? `Đã thêm ${poi.name} vào chuyến đi` : `Thêm ${poi.name} vào chuyến đi`}
            aria-pressed={isAdded}
            onClick={(e) => {
              e.stopPropagation();
              onToggleAddTrip?.(poi.id);
            }}
            className={`w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition cursor-pointer shadow-xs active:scale-95 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
              isAdded ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-black/30 hover:bg-black/50'
            }`}
            title={isAdded ? 'Đã thêm vào chuyến đi' : 'Thêm vào chuyến đi'}
          >
            {isAdded ? (
              <Check className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
            ) : (
              <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Bottom Pagination Dots */}
        {gallery.length > 1 && (
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none z-10">
            {gallery.slice(0, 5).map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-[transform,background-color] ${
                  i === imgIdx ? 'bg-white scale-125 shadow-xs' : 'bg-white/50'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Clean 3-Tier Airbnb Card Typography (>= 12px, WCAG AA contrast) */}
      <div className="mt-2.5 space-y-1">
        {/* Tier 1: Name + Rating */}
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <h3 className="font-semibold text-[15px] text-neutral-950 tracking-tight truncate leading-snug group-hover:text-emerald-800 transition-colors">
            {poi.name}
          </h3>
          {Number(poi.rating) > 0 && (
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-neutral-900 shrink-0">
              <Star className="w-3.5 h-3.5 fill-neutral-900 text-neutral-900" aria-hidden="true" />
              <span>
                {(typeof poi.rating === 'number' ? poi.rating : Number(poi.rating || 4.5)).toFixed(1)}
              </span>
            </span>
          )}
        </div>

        {/* Tier 2: Category · Location + optional Local/Crowd Badge */}
        <div className="flex items-center gap-1.5 text-[13px] text-neutral-600 min-w-0">
          <span className="truncate">
            {resolvedCategoryLabel} · {locationLabel}
          </span>
          {communityBadgeLabel ? (
            <span className="ml-auto shrink-0 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-900">
              {communityBadgeLabel}
            </span>
          ) : crowd.level === 'high' ? (
            <span
              className="ml-auto shrink-0 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900"
              title={crowd.peakHours ? `Giờ cao điểm: ${crowd.peakHours}` : 'Điểm phổ biến dễ đông khách'}
            >
              {crowd.label}
            </span>
          ) : null}
        </div>

        {/* Tier 3: Price + Explainability Trigger */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[13px] font-semibold text-neutral-950 truncate">{priceLabel}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExplanationOpen(true);
            }}
            className="shrink-0 min-h-[40px] inline-flex items-center px-2 -my-2 text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline underline-offset-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded"
            aria-label={`Xem vì sao đề xuất ${poi.name}`}
          >
            Vì sao chọn?
          </button>
        </div>

        <p className="text-xs text-neutral-600 line-clamp-1" title={greenBreakdown.summaryReason}>
          {greenBreakdown.summaryReason}
        </p>
      </div>

      {isExplanationOpen && (
        <ExplanationModal
          poiId={poi.id}
          poiName={poi.name}
          explanationSnippet={`${greenBreakdown.summaryReason}${crowd.offPeakTip ? ` ${crowd.offPeakTip}.` : ''}`}
          isOpen={isExplanationOpen}
          onClose={() => setIsExplanationOpen(false)}
        />
      )}
    </article>
  );
}

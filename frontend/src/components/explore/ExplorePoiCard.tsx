import { Leaf } from 'lucide-react';
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
  const resolvedCategoryIcon = isCafe ? 'ph-coffee' : CATEGORY_META[poi.category]?.icon || 'ph-map-pin';

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
      <div
        className={`relative w-full aspect-[1.05/1] rounded-[20px] overflow-hidden bg-gray-100 shadow-sm transition-all duration-200 isolate ${active ? 'ring-2 ring-black' : ''}`}
      >
        <PoiImage
          src={gallery[imgIdx] || poi.image}
          alt={poi.name}
          poiId={poi.id}
          poiName={poi.name}
          category={poi.category}
          city={poi.city}
          fallbackSeed={`${poi.id}_${imgIdx}`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {isCardHovered && imgIdx > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((prev) => Math.max(0, prev - 1));
            }}
            className="absolute left-3.5 top-[45%] -translate-y-1/2 w-8 h-8 rounded-full bg-black/45 hover:bg-black/75 backdrop-blur-md text-white shadow-sm flex items-center justify-center hover:scale-110 active:scale-90 transition-all z-10 cursor-pointer"
            title="Ảnh trước"
          >
            <i className="ph ph-caret-left text-lg font-bold"></i>
          </button>
        )}

        {isCardHovered && imgIdx < gallery.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((prev) => Math.min(gallery.length - 1, prev + 1));
            }}
            className="absolute right-3.5 top-[45%] -translate-y-1/2 w-8 h-8 rounded-full bg-black/45 hover:bg-black/75 backdrop-blur-md text-white shadow-sm flex items-center justify-center hover:scale-110 active:scale-90 transition-all z-10 cursor-pointer"
            title="Ảnh kế tiếp"
          >
            <i className="ph ph-caret-right text-lg font-bold"></i>
          </button>
        )}

        <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/35 via-black/10 to-transparent pointer-events-none z-[5]" />

        {poi.isGreen && (
          <div
            className="absolute top-3 left-3 z-10 pointer-events-auto cursor-help"
            title="Địa điểm du lịch xanh: Thân thiện môi trường, tiết kiệm năng lượng và bảo tồn văn hóa địa phương"
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 backdrop-blur-md text-emerald-200 border border-emerald-400/40 text-[11px] font-bold tracking-tight shadow-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              <Leaf size={11} className="text-emerald-400 shrink-0" />
              <span>Địa điểm xanh</span>
            </span>
          </div>
        )}

        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
          <button
            type="button"
            aria-label={favorite ? `Bỏ lưu ${poi.name}` : `Lưu ${poi.name}`}
            aria-pressed={favorite}
            aria-busy={favoritePending}
            disabled={favoritePending}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(poi.id, poi);
            }}
            className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-wait disabled:opacity-70 ${
              favorite ? 'bg-white text-rose-600' : 'bg-black/35 hover:bg-black/55 text-white'
            }`}
            title="Lưu yêu thích"
          >
            <i className={`ph ${favorite ? 'ph-fill ph-heart text-rose-600' : 'ph-heart'} text-lg`} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleAddTrip?.(poi.id);
            }}
            className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 text-white ${
              isAdded ? 'bg-emerald-600' : 'bg-black/35 hover:bg-black/55'
            }`}
            title={isAdded ? 'Đã thêm vào chuyến đi' : 'Thêm vào chuyến đi'}
          >
            <i className={`ph ${isAdded ? 'ph-check font-bold' : 'ph-plus font-bold'} text-base`} />
          </button>
        </div>

        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none z-10">
          {gallery.slice(0, 5).map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === imgIdx ? 'bg-white scale-125 shadow-xs' : 'bg-white/40'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mt-2.5 space-y-1">
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <h3 className="font-bold text-[15px] text-gray-950 tracking-tight truncate leading-tight group-hover:text-emerald-800 transition-colors">
            {poi.name}
          </h3>
          {Number(poi.rating) > 0 && (
            <span className="flex items-center gap-1 text-[13px] font-bold text-gray-900 shrink-0">
              <i className="ph ph-fill ph-star text-[12px] text-amber-500"></i>
              <span>{(typeof poi.rating === 'number' ? poi.rating : Number(poi.rating || 4.5)).toFixed(1)}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[13px] text-neutral-600 font-normal">
          <i className={`ph ${resolvedCategoryIcon} text-neutral-500 text-[14px] shrink-0`}></i>
          <span className="truncate">{resolvedCategoryLabel}</span>
          {communityBadgeLabel ? (
            <span className="ml-auto shrink-0 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-800">
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

        <div className="flex items-center justify-between gap-2 text-xs text-neutral-600">
          <span className="truncate">
            {poi.address || `${poi.city === 'Đà Nẵng' ? 'Hải Châu, Đà Nẵng' : `${poi.city}, Việt Nam`}`}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExplanationOpen(true);
            }}
            className="shrink-0 font-semibold text-emerald-800 hover:text-emerald-950 underline underline-offset-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded px-1 py-0.5"
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

import { useState, useMemo } from 'react';
import type { Poi, PoiCategory } from '@/data/pois';
import { getGalleryImages, getDeterministicImage, SUB_CATEGORY_LABELS, categoryLabels } from '@/data/pois';
import ExplanationModal from '@/components/poi/ExplanationModal';

const CATEGORY_META: Record<PoiCategory, { icon: string; label: string }> = {
  'quan-an': { icon: 'ph-fork-knife', label: 'Quán ăn' },
  'di-tich': { icon: 'ph-landmark', label: 'Di tích' },
  'chua': { icon: 'ph-hands-praying', label: 'Chùa & Tâm linh' },
  'canh-quan': { icon: 'ph-mountains', label: 'Cảnh quan' },
};

export interface PoiCardProps {
  poi: Poi;
  index?: number;
  active?: boolean;
  favorite?: boolean;
  isAdded?: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
  onToggleFavorite: (id: string) => void;
  onToggleAddTrip?: (id: string) => void;
  recommendation?: {
    matchScore: number;
    greenScore: number | null;
    isLocalBusiness: boolean;
    explanation: string;
  };
}

export default function PoiCard({
  poi,
  active = false,
  favorite = false,
  isAdded = false,
  onClick,
  onHover,
  onToggleFavorite,
  onToggleAddTrip,
  recommendation,
}: PoiCardProps) {
  const [imgIdx, setImgIdx] = useState(0);
  const [isCardHovered, setIsCardHovered] = useState(false);
  const [isExplanationModalOpen, setIsExplanationModalOpen] = useState(false);

  const gallery = useMemo(() => getGalleryImages(poi), [poi]);

  const categoryLabel = poi.sub_category && SUB_CATEGORY_LABELS[poi.sub_category]
    ? SUB_CATEGORY_LABELS[poi.sub_category]
    : CATEGORY_META[poi.category]?.label || categoryLabels[poi.category] || 'Điểm tham quan';
  const isEcoLocal = Boolean(
    recommendation &&
      (recommendation.isLocalBusiness || (recommendation.greenScore ?? 0) >= 0.7),
  );
  const formattedCost = poi.estimatedCost == null
    ? 'Chưa cập nhật giá'
    : poi.estimatedCost === 0
      ? 'Miễn phí'
      : new Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
          maximumFractionDigits: 0,
        }).format(poi.estimatedCost);

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
      className="flex flex-col group cursor-pointer select-none"
    >
      {/* 1. Card Image Box: aspect-[1.05/1], rounded-[20px], isolate */}
      <div className={`relative w-full aspect-[1.05/1] rounded-[20px] overflow-hidden bg-gray-100 shadow-sm transition-all duration-200 isolate ${
        active ? 'ring-2 ring-black' : ''
      }`}>
        <img
          src={gallery[imgIdx] || poi.image}
          alt={poi.name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            const target = e.currentTarget;
            const fallback = getDeterministicImage(poi.name, poi.id, poi.category, poi.city);
            if (target.src !== fallback) {
              target.src = fallback;
            }
          }}
        />

        {/* Nút tròn chuyển ảnh ‹ (chỉ hiện khi hover và từ ảnh thứ 2 trở đi) */}
        {isCardHovered && imgIdx > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((prev) => Math.max(0, prev - 1));
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/95 text-zinc-900 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-10 cursor-pointer backdrop-blur-xs"
            title="Ảnh trước"
          >
            <i className="ph ph-caret-left text-base font-bold"></i>
          </button>
        )}

        {/* Nút tròn chuyển ảnh › (chỉ hiện khi hover và chưa đến ảnh cuối) */}
        {isCardHovered && imgIdx < gallery.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((prev) => Math.min(gallery.length - 1, prev + 1));
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/95 text-zinc-900 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-10 cursor-pointer backdrop-blur-xs"
            title="Ảnh kế tiếp"
          >
            <i className="ph ph-caret-right text-base font-bold"></i>
          </button>
        )}

        {/* Nút tim và "+" ở góc trên */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(poi.id);
            }}
            className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 ${
              favorite ? 'bg-white text-[#b45309]' : 'bg-black/35 hover:bg-black/55 text-white'
            }`}
            title="Lưu yêu thích"
          >
            <i className={`ph ${favorite ? 'ph-fill ph-heart text-[17px] text-[#b45309]' : 'ph-heart text-[17px]'}`}></i>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleAddTrip?.(poi.id);
            }}
            className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 ${
              isAdded ? 'bg-emerald-600 text-white' : 'bg-black/35 hover:bg-black/55 text-white'
            }`}
            title="Thêm vào chuyến đi"
          >
            <i className={`ph ${isAdded ? 'ph-check text-[17px] font-bold' : 'ph-plus text-[17px]'}`}></i>
          </button>
        </div>

        {/* Michelin badge nếu có */}
        {poi.isMichelin && (
          <div className="absolute top-3 left-3 z-10 bg-rose-600 text-white text-[10.5px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1">
            <span>★</span>
            <span>MICHELIN</span>
          </div>
        )}

        {recommendation && (
          <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-5rem)] flex-col items-start gap-1.5">
            <span className="rounded-full bg-gradient-to-r from-emerald-700 to-teal-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-md">
              {Math.round(recommendation.matchScore)}% Phù hợp
            </span>
            {isEcoLocal && (
              <span className="rounded-full border border-emerald-100/70 bg-emerald-950/85 px-2 py-1 text-[10px] font-semibold text-emerald-50 shadow-md backdrop-blur-sm">
                🌿 Eco / Local
              </span>
            )}
          </div>
        )}

        {/* Chấm phân trang bên dưới */}
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

        {/* Icon ⓘ ở góc phải đáy */}
        <div className="absolute bottom-2.5 right-2.5 pointer-events-none z-10">
          <i className="ph ph-info text-white/80 hover:text-white text-[14px] drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"></i>
        </div>
      </div>

      {/* 2. Card Details: Tên, loại hình, địa chỉ & rating */}
      <div className="mt-2.5 space-y-1">
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <h3 className="font-bold text-[15px] text-gray-950 tracking-tight truncate leading-tight group-hover:text-black" title={poi.name}>
            {poi.cleanTitle || poi.cleanName || poi.name}
          </h3>
          {poi.rating > 0 && (
            <span className="text-[12px] font-semibold text-gray-800 shrink-0 flex items-center gap-0.5">
              <span className="text-amber-500">★</span> {poi.rating.toFixed(1)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[13px] text-gray-500 font-normal">
          <i className={`ph ${CATEGORY_META[poi.category]?.icon || 'ph-map-pin'} text-gray-400 text-[14px] shrink-0`}></i>
          <span className="truncate">{categoryLabel}</span>
          <span className="text-gray-300">·</span>
          <span className="truncate">{poi.city}</span>
        </div>

        <div className="text-[12.5px] text-gray-400 font-normal truncate">
          <span>{poi.address || `${poi.city === 'Đà Nẵng' ? 'Hải Châu, Đà Nẵng' : `${poi.city}, Việt Nam`}`}</span>
        </div>

        {recommendation && (
          <div className="pt-1.5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate font-semibold text-gray-800">{formattedCost}</span>
              <span className="shrink-0 text-gray-600">
                <span className="text-amber-500" aria-hidden="true">★</span>{' '}
                {poi.rating > 0 ? poi.rating.toFixed(1) : '—'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onToggleAddTrip?.(poi.id)}
              aria-pressed={isAdded}
              className={`mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-[12px] font-semibold transition-all duration-200 ${
                isAdded
                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                  : 'bg-[#102b21] text-white hover:bg-[#194332]'
              }`}
            >
              <i className={`ph ${isAdded ? 'ph-check' : 'ph-plus'} text-sm`} aria-hidden="true"></i>
              {isAdded ? 'Đã thêm vào chuyến đi' : '+ Thêm vào chuyến đi'}
            </button>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={isExplanationModalOpen}
              onClick={() => setIsExplanationModalOpen(true)}
              className="mt-1.5 flex min-h-11 w-full items-center justify-center gap-1 text-xs font-medium text-emerald-800 transition-colors hover:text-emerald-950 focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <i className="ph ph-sparkle" aria-hidden="true"></i>
              Lý do AI gợi ý · Vì sao nơi này?
            </button>
          </div>
        )}
        {!recommendation && (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isExplanationModalOpen}
            onClick={(event) => { event.stopPropagation(); setIsExplanationModalOpen(true); }}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-emerald-200 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Vì sao nơi này?
          </button>
        )}
      </div>

      {/* Explanation Modal (KG + AI) */}
      {isExplanationModalOpen && (
        <ExplanationModal
          key={poi.id}
          poiId={poi.id}
          poiName={poi.name}
          explanationSnippet={recommendation?.explanation}
          isOpen={isExplanationModalOpen}
          onClose={() => setIsExplanationModalOpen(false)}
        />
      )}
    </article>
  );
}

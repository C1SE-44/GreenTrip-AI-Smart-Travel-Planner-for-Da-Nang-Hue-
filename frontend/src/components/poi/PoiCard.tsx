import { useState, useMemo } from 'react';
import { Heart } from 'lucide-react';
import type { Poi, PoiCategory } from '@/data/pois';
import { getGalleryImages, getDeterministicImage, SUB_CATEGORY_LABELS, categoryLabels } from '@/data/pois';
import ExplanationModal from '@/components/poi/ExplanationModal';

const CATEGORY_META: Record<PoiCategory, { icon: string; label: string }> = {
  'quan-an': { icon: 'ph-fork-knife', label: 'Quán ăn' },
  'di-tich': { icon: 'ph-landmark', label: 'Di tích' },
  'chua': { icon: 'ph-hands-praying', label: 'Chùa & Tâm linh' },
  'canh-quan': { icon: 'ph-mountains', label: 'Cảnh quan' },
};


function getShortLocation(poi: Poi): string {
  if (poi.address) {
    const cleaned = poi.address
      .replace(/\b\d{4,6}\b/g, '')
      .replace(/,\s*Việt Nam$/i, '')
      .trim();
    const rawParts = cleaned.split(',').map((s) => s.trim()).filter(Boolean);
    const parts = rawParts.map((s) =>
      s
        .replace(/^(phường|quận|huyện|thị xã|thành phố|tp\.|tp|tỉnh)\s+/i, '')
        .trim()
    ).filter(Boolean);

    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
    }
  }
  const area = poi.ai_metadata?.area?.trim();
  if (area) {
    const cleanArea = area.replace(/^(phường|quận|huyện|thị xã)\s+/i, '').trim();
    return `${cleanArea}, ${poi.city}`;
  }
  return poi.city;
}

function getPriceTierDisplay(poi: Poi): string {
  const display = poi.ai_metadata?.price_range_display?.toLowerCase() || '';
  if (display.includes('miễn phí') || poi.estimatedCost === 0) {
    return '$';
  }
  const cost = poi.estimatedCost ?? 0;
  if (cost > 0) {
    if (cost < 50000) return '$';
    if (cost <= 150000) return '$$';
    if (cost <= 400000) return '$$$';
    return '$$$$';
  }
  if (display.includes('$$$$')) return '$$$$';
  if (display.includes('$$$')) return '$$$';
  if (display.includes('$$')) return '$$';
  return '$$';
}

function formatCompactPrice(poi: Poi): string {
  const display = poi.ai_metadata?.price_range_display?.trim();
  if (display) {
    if (/^miễn phí/i.test(display)) return 'Miễn phí';
    const shortMatch = display.match(/^([^(]+)/);
    return (shortMatch ? shortMatch[1] : display).trim();
  }
  if (poi.estimatedCost == null) return 'Chưa cập nhật giá';
  if (poi.estimatedCost === 0) return 'Miễn phí';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(poi.estimatedCost);
}

export interface PoiCardProps {
  poi: Poi;
  index?: number;
  active?: boolean;
  favorite?: boolean;
  favoritePending?: boolean;
  isAdded?: boolean;
  showAddToTrip?: boolean;
  compact?: boolean;
  showSavedCount?: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
  onToggleFavorite: (id: string, poi?: Poi) => void;
  onToggleAddTrip?: (id: string) => void;
  showExplanation?: boolean;
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
  favoritePending = false,
  isAdded = false,
  showAddToTrip = true,
  compact = false,
  showSavedCount = false,
  onClick,
  onHover,
  onToggleFavorite,
  onToggleAddTrip,
  recommendation,
  showExplanation = false,
}: PoiCardProps) {
  const [imgIdx, setImgIdx] = useState(0);
  const [isCardHovered, setIsCardHovered] = useState(false);
  const [isExplanationModalOpen, setIsExplanationModalOpen] = useState(false);

  const gallery = useMemo(() => getGalleryImages(poi), [poi]);

  const isCafe = Boolean(
    poi.sub_category?.includes('cafe') || 
    poi.sub_category?.includes('coffee') || 
    /coffee|cafe|cà phê|tiệm trà|workspace/i.test(poi.name)
  );

  const categoryLabel = poi.sub_category && SUB_CATEGORY_LABELS[poi.sub_category]
    ? SUB_CATEGORY_LABELS[poi.sub_category]
    : isCafe
      ? 'Quán cà phê'
      : CATEGORY_META[poi.category]?.label || categoryLabels[poi.category] || 'Điểm tham quan';

  const categoryIcon = isCafe
    ? 'ph-coffee'
    : (CATEGORY_META[poi.category]?.icon || 'ph-map-pin');

  const isEcoLocal = Boolean(
    recommendation &&
      (recommendation.isLocalBusiness || (recommendation.greenScore ?? 0) >= 0.7),
  );

  const reviewCount = typeof poi.ai_metadata?.review_count === 'number' && poi.ai_metadata.review_count > 0
    ? poi.ai_metadata.review_count
    : null;

  const areaText = poi.ai_metadata?.area?.trim();
  const locationLabel = areaText ? `${areaText}, ${poi.city}` : poi.city;
  const formattedCost = formatCompactPrice(poi);

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
      {/* 1. Card Image Box */}
      <div className={`relative w-full ${compact ? 'aspect-[1.35/1] rounded-2xl' : 'aspect-[1.05/1] rounded-[20px]'} overflow-hidden bg-neutral-100 shadow-sm transition-all duration-200 isolate ${
        active 
          ? (poi.isGreen ? 'ring-2 ring-emerald-600 shadow-md' : 'ring-2 ring-neutral-900') 
          : poi.isGreen && isCardHovered
            ? 'ring-2 ring-emerald-500/50 shadow-md'
            : ''
      }`}>
        <img
          src={gallery[imgIdx] || poi.image}
          alt={poi.name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            const target = e.currentTarget;
            const fallback = getDeterministicImage(poi.name, `${poi.id}_${imgIdx}`, poi.category, poi.city);
            if (target.src !== fallback) {
              target.src = fallback;
            }
          }}
        />

        {/* Nút tròn chuyển ảnh ‹ */}
        {isCardHovered && imgIdx > 0 && (
          <button
            type="button"
            aria-label="Ảnh trước"
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((prev) => Math.max(0, prev - 1));
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 text-neutral-900 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-10 cursor-pointer backdrop-blur-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            title="Ảnh trước"
          >
            <i className="ph ph-caret-left text-base font-bold" aria-hidden="true"></i>
          </button>
        )}

        {/* Nút tròn chuyển ảnh › */}
        {isCardHovered && imgIdx < gallery.length - 1 && (
          <button
            type="button"
            aria-label="Ảnh kế tiếp"
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((prev) => Math.min(gallery.length - 1, prev + 1));
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 text-neutral-900 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-10 cursor-pointer backdrop-blur-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            title="Ảnh kế tiếp"
          >
            <i className="ph ph-caret-right text-base font-bold" aria-hidden="true"></i>
          </button>
        )}

        {/* Nút tim và "+" ở góc trên: Tim không nền, "+" vòng tròn mờ, kích thước x0.6 (32px), gap x0.83, tâm cách góc ≈0.12 */}
        <div className="absolute top-[22px] right-[22px] flex items-center gap-[5px] z-10">
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
            className="w-[32px] h-[32px] flex items-center justify-center cursor-pointer transition-transform active:scale-90 focus-visible:outline-none text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] bg-transparent border-0 shadow-none"
            title={favorite ? "Bỏ lưu khỏi danh sách Đã lưu" : "Lưu vào danh sách Đã lưu"}
          >
            <i className={`ph ${favorite ? 'ph-fill ph-heart text-[22px] text-rose-500' : 'ph-heart text-[22px] text-white'}`} aria-hidden="true"></i>
          </button>
          <button
            type="button"
            aria-label="Thêm vào chuyến đi"
            aria-pressed={isAdded}
            onClick={(e) => {
              e.stopPropagation();
              onToggleAddTrip?.(poi.id);
            }}
            className={`${showAddToTrip ? '' : 'hidden'} w-[32px] h-[32px] rounded-full border border-white/40 flex items-center justify-center transition-all cursor-pointer active:scale-90 focus-visible:outline-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] ${
              isAdded 
                ? 'bg-white text-black' 
                : 'bg-black/35 hover:bg-black/55 text-white backdrop-blur-xs'
            }`}
            title={isAdded ? "Đã thêm vào chuyến đi (Bấm để bỏ)" : "Thêm vào chuyến đi"}
          >
            <i className={`ph ${isAdded ? 'ph-check text-[14px] font-bold' : 'ph-plus text-[14px]'}`} aria-hidden="true"></i>
          </button>
        </div>

        {/* Michelin badge hoặc Điểm Xanh badge */}
        {poi.isMichelin && !recommendation && (
          <div className="absolute top-3 left-3 z-10 bg-rose-700 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
            <span aria-hidden="true">★</span>
            <span>MICHELIN</span>
          </div>
        )}

        {!poi.isMichelin && !recommendation && poi.isGreen && (
          <div 
            className="absolute top-[22px] left-[22px] z-10 w-[32px] h-[32px] rounded-full bg-black/35 backdrop-blur-xs flex items-center justify-center text-emerald-400 drop-shadow-md cursor-help border border-white/25"
            title="Địa điểm xanh: Thân thiện môi trường"
          >
            <i className="ph ph-leaf text-[15px]" aria-hidden="true"></i>
            <span className="sr-only">Địa điểm xanh</span>
          </div>
        )}

        {showExplanation && recommendation && (
          <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-6rem)] flex-col items-start gap-1.5">
            <span 
              className="rounded-full bg-emerald-800 px-2.5 py-1 text-xs font-bold text-white shadow-md cursor-help"
              title={`Độ tương thích ${Math.round(recommendation.matchScore)}% dựa trên điểm đến, ngân sách và sở thích của bạn`}
            >
              {Math.round(recommendation.matchScore)}% Phù hợp gu
            </span>
            {isEcoLocal && (
              <span className="rounded-full border border-emerald-100/70 bg-emerald-950/85 px-2.5 py-1 text-xs font-semibold text-emerald-50 shadow-md backdrop-blur-sm">
                📍 Điểm bản địa
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
                i === imgIdx ? 'bg-white scale-125 shadow-xs' : 'bg-white/45'
              }`}
            />
          ))}
        </div>
      </div>

      {/* 2. Card Details: Khoảng cách ảnh→tên x1.3 (mt-[22px]), 4 dòng text chuẩn Mindtrip */}
      <div className={`${compact ? 'mt-2 space-y-0.5' : 'mt-[22px] space-y-1'}`}>
        {/* Dòng 1: Tên (cho phép 2 dòng, min-h-[2.5rem]) + rating nằm góc phải */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <h3 className={`font-bold ${compact ? 'text-sm' : 'text-[15px]'} text-neutral-950 tracking-tight line-clamp-2 min-h-[2.5rem] leading-snug group-hover:text-emerald-900`} title={poi.name}>
            {poi.cleanTitle || poi.cleanName || poi.name}
          </h3>
          {poi.rating > 0 && (
            <span className="text-xs font-semibold text-neutral-800 shrink-0 flex items-center gap-0.5 pt-0.5">
              <span className="text-amber-500" aria-hidden="true">★</span>
              <span>{poi.rating.toFixed(1)}</span>
              {reviewCount && (
                <span className="text-neutral-500 font-normal">({reviewCount.toLocaleString('vi-VN')})</span>
              )}
            </span>
          )}
        </div>

        {/* Dòng 2: Loại hình kèm icon */}
        <div className={`flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-[13px]'} text-neutral-500 font-medium truncate`}>
          <i className={`ph ${categoryIcon} text-neutral-500 text-[14px] shrink-0`} aria-hidden="true"></i>
          <span className="truncate">{categoryLabel}</span>
        </div>

        {/* Dòng 3: Khu vực ngắn (rút gọn 2 đoạn cuối địa chỉ) */}
        <div className={`${compact ? 'text-xs' : 'text-[13px]'} text-neutral-500 font-normal truncate`}>
          {getShortLocation(poi)}
        </div>

        {/* Dòng 4: Giá $ / $$ / $$$ / $$$$ */}
        <div className={`${compact ? 'text-xs' : 'text-[13px]'} text-neutral-500 font-normal`}>
          {getPriceTierDisplay(poi)}
        </div>

        {showExplanation && recommendation && (
          <div className="pt-1.5" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => onToggleAddTrip?.(poi.id)}
              aria-pressed={isAdded}
              className={`mt-1.5 flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                isAdded
                  ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
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
              className="mt-1 flex min-h-[40px] w-full items-center justify-center gap-1 rounded-full text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-50 hover:text-emerald-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <i className="ph ph-sparkle text-emerald-700" aria-hidden="true"></i>
              Vì sao nơi này phù hợp với bạn?
            </button>
          </div>
        )}
        {showExplanation && !recommendation && (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isExplanationModalOpen}
            onClick={(event) => { event.stopPropagation(); setIsExplanationModalOpen(true); }}
            className="mt-2 flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full border border-emerald-200 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
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

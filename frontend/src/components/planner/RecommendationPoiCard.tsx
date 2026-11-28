import { Check, MapPin, Plus } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { Poi } from '@/data/pois';
import { formatCategoryLabel } from './tripItineraryUtils';
import PoiImage from '@/components/ui/PoiImage';

interface RecommendationPoiCardProps {
  poi: Poi;
  imageSrc?: string | null;
  imageSourceAvailable?: boolean;
  estimatedCost?: number | null;
  reason?: string | null;
  isAdded?: boolean;
  onOpenDetail?: (poiId: string, trigger: HTMLElement) => void;
  onExplain?: () => void;
  onAdd: () => void;
}

export default function RecommendationPoiCard({
  poi,
  imageSrc,
  imageSourceAvailable,
  estimatedCost,
  reason,
  isAdded = false,
  onOpenDetail,
  onExplain,
  onAdd,
}: RecommendationPoiCardProps) {
  const hasSourceImage = imageSourceAvailable ?? poi.imageSourceAvailable ?? true;
  const cardImage = imageSrc === undefined ? poi.image : imageSrc;
  const readableReason = reason?.trim();
  const openDetail = (event: MouseEvent<HTMLButtonElement>) => {
    onOpenDetail?.(poi.id, event.currentTarget);
  };

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_2px_8px_rgba(43,38,34,0.04)]">
      <button
        type="button"
        onClick={openDetail}
        aria-label={`Xem chi tiết ${poi.name}`}
        className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700"
      >
        <div className="aspect-[16/9] max-h-[190px] min-h-[140px] w-full overflow-hidden bg-neutral-100">
          <PoiImage
            src={hasSourceImage ? cardImage : null}
            alt={`Ảnh ${poi.name}`}
            poiId={poi.id}
            poiName={poi.name}
            category={poi.category}
            city={poi.city}
            fallbackMode="neutral"
            className="h-full w-full object-cover"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col p-3">
          <h4 className="line-clamp-2 min-h-10 text-sm font-bold leading-snug text-neutral-950" title={poi.name}>
            {poi.name}
          </h4>
          <p className="mt-1 flex min-w-0 items-center gap-1 truncate text-xs text-neutral-700">
            <MapPin size={12} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{poi.city} · {formatCategoryLabel(poi.category)}</span>
          </p>
          {typeof estimatedCost === 'number' && Number.isFinite(estimatedCost) && estimatedCost >= 0 && (
            <p className="mt-1 text-xs text-neutral-700">
              Khoảng {new Intl.NumberFormat('vi-VN').format(Math.round(estimatedCost))} ₫/người
            </p>
          )}
          {readableReason && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-neutral-700" title={readableReason}>
              {readableReason}
            </p>
          )}
        </div>
      </button>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-1 px-3 pb-3 pt-0">
        {onExplain ? (
          <button
            type="button"
            onClick={onExplain}
            className="min-h-10 rounded-full px-2 text-xs font-semibold text-emerald-900 underline decoration-emerald-700 underline-offset-2 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            aria-haspopup="dialog"
          >
            Vì sao gợi ý?
          </button>
        ) : <span aria-hidden="true" />}
        <button
          type="button"
          onClick={onAdd}
          disabled={isAdded}
          aria-pressed={isAdded}
          className={`inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${isAdded ? 'cursor-default bg-emerald-100 text-emerald-900' : 'bg-neutral-900 text-white hover:bg-neutral-800'}`}
          aria-label={isAdded ? `${poi.name} đã có trong Trip` : `Thêm ${poi.name} vào danh sách địa điểm muốn đi`}
        >
          {isAdded ? <Check size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
          {isAdded ? 'Đã thêm' : 'Thêm'}
        </button>
      </div>
    </article>
  );
}

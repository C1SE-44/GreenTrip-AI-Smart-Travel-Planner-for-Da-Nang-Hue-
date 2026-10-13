import { X, Star, Clock } from 'lucide-react';
import type { Poi } from '@/data/pois';
import { categoryLabels } from '@/data/pois';
import { CityTag, EcoBadge } from '@/components/ui/Badge';

interface PoiPopupProps {
  poi: Poi;
  onClose: () => void;
  onSelect?: () => void;
}

export default function PoiPopup({ poi, onClose, onSelect }: PoiPopupProps) {
  return (
    <div
      className="animate-fadeInScale w-72 overflow-hidden rounded-2xl border border-beige bg-ivory shadow-cardHover"
      role="dialog"
      aria-label={`Thông tin ${poi.name}`}
    >
      {/* Image */}
      <div className="relative h-36 overflow-hidden">
        <img src={poi.image} alt={poi.name} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal/40 to-transparent" />
        <button
          onClick={onClose}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ivory/90 backdrop-blur-sm transition-all hover:bg-ivory"
          aria-label="Đóng"
        >
          <X size={16} className="text-charcoal" />
        </button>
        <div className="absolute bottom-2 left-2">
          <span className="inline-flex items-center rounded-full bg-ivory/90 px-2.5 py-1 text-xs font-medium text-charcoal backdrop-blur-sm">
            {categoryLabels[poi.category]}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5">
        <h3 className="font-display text-base font-semibold text-charcoal leading-snug">
          {poi.name}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">
          {poi.description}
        </p>

        <div className="mt-3 flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Star size={13} className="fill-amber-400 text-amber-400" />
            <span className="font-medium text-charcoal">{poi.rating.toFixed(1)}</span>
          </span>
          <span className="flex items-center gap-1">
            <Clock size={13} />
            {poi.visitDuration}
          </span>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <CityTag city={poi.city} />
          {poi.ecoScore >= 75 && <EcoBadge score={poi.ecoScore} />}
        </div>

        {onSelect && (
          <button
            onClick={onSelect}
            className="mt-3 w-full rounded-xl bg-forest-50 py-2 text-sm font-medium text-forest-700 transition-colors hover:bg-forest-100"
          >
            Xem chi tiết
          </button>
        )}
      </div>

      {/* Triangle pointer */}
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
        <div
          className="h-4 w-4 rotate-45 border-b border-r border-beige bg-ivory"
          style={{ marginTop: '-1px' }}
        />
      </div>
    </div>
  );
}

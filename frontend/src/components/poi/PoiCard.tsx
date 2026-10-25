import { Star, Clock, Heart, Plus } from 'lucide-react';
import type { Poi } from '@/data/pois';
import { categoryLabels, SUB_CATEGORY_LABELS, CUISINE_LABELS } from '@/data/pois';

interface PoiCardProps {
  poi: Poi;
  active?: boolean;
  hovered?: boolean;
  favorite?: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
  onToggleFavorite: (id: string) => void;
}

export default function PoiCard({
  poi,
  active = false,
  favorite = false,
  onClick,
  onHover,
  onToggleFavorite,
}: PoiCardProps) {
  const subCatText = poi.sub_category && SUB_CATEGORY_LABELS[poi.sub_category]
    ? SUB_CATEGORY_LABELS[poi.sub_category]
    : categoryLabels[poi.category];

  return (
    <article
      onClick={onClick}
      onMouseEnter={() => onHover(poi.id)}
      onMouseLeave={() => onHover(null)}
      className={`
        group relative cursor-pointer rounded-2xl border bg-ivory p-3 transition-all duration-250
        ${active
          ? 'border-forest-500 shadow-card'
          : 'border-beige shadow-soft hover:-translate-y-0.5 hover:border-forest-300 hover:shadow-cardHover'
        }
      `}
    >
      <div className="flex gap-4">
        {/* Image */}
        <div className="relative h-[130px] w-[110px] flex-shrink-0 overflow-hidden rounded-xl bg-beige">
          <img
            src={poi.image}
            alt={poi.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          <div className="pointer-events-none absolute inset-0 bg-forest-900/10 mix-blend-overlay transition-opacity group-hover:opacity-0" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(poi.id);
            }}
            className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-ivory/90 backdrop-blur-sm transition-all hover:bg-ivory shadow-sm"
            aria-label={favorite ? 'Bỏ yêu thích' : 'Lưu yêu thích'}
            aria-pressed={favorite}
          >
            <Heart
              size={15}
              className={`transition-all ${
                favorite ? 'fill-marker text-marker' : 'text-charcoal/60'
              }`}
            />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col justify-between py-0.5 min-w-0">
          <div>
            <h3 className="truncate text-base font-semibold text-charcoal">
              {poi.name}
            </h3>
            
            <p className="mt-0.5 truncate text-[12px] text-muted flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-forest-700">{subCatText}</span>
              <span>·</span>
              <span>{poi.city}</span>
              {poi.budget_tier && (
                <span className="text-[11px] text-charcoal/70">
                  · {poi.budget_tier === 'free' ? 'Miễn phí' : poi.budget_tier}
                </span>
              )}
            </p>
            <p className="mt-1 line-clamp-2 text-[12px] text-charcoal/75 leading-relaxed">
              {poi.description}
            </p>
          </div>

          <div className="mt-2.5 flex items-center justify-between text-xs text-muted">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Star size={13} className="fill-sun-500 text-sun-500" />
                <span className="font-semibold text-charcoal">{poi.rating.toFixed(1)}</span>
              </span>
              <span className="flex items-center gap-1 text-[11px]">
                <Clock size={12} />
                {poi.visitDuration}
              </span>
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); }}
              className="flex items-center gap-1 rounded-lg bg-forest-50 px-2.5 py-1 text-xs font-semibold text-forest-700 transition-colors hover:bg-forest-600 hover:text-ivory"
            >
              <Plus size={13} />
              Thêm
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

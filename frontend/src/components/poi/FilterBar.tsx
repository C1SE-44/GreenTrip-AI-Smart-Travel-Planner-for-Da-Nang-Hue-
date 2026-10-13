import { Search, X } from 'lucide-react';
import type { PoiCategory, PoiCity } from '@/data/pois';
import { categoryLabels } from '@/data/pois';

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  cityFilter: 'all' | PoiCity;
  onCityChange: (v: 'all' | PoiCity) => void;
  categoryFilter: 'all' | PoiCategory;
  onCategoryChange: (v: 'all' | PoiCategory) => void;
  count: number;
}

const cityOptions: { value: 'all' | PoiCity; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'Đà Nẵng', label: 'Đà Nẵng' },
  { value: 'Huế', label: 'Huế' },
];

const categoryOptions: { value: 'all' | PoiCategory; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'chua', label: categoryLabels['chua'] },
  { value: 'quan-an', label: categoryLabels['quan-an'] },
  { value: 'canh-quan', label: categoryLabels['canh-quan'] },
  { value: 'di-tich', label: categoryLabels['di-tich'] },
];

export default function FilterBar({
  search,
  onSearchChange,
  cityFilter,
  onCityChange,
  categoryFilter,
  onCategoryChange,
  count,
}: FilterBarProps) {
  return (
    <div className="sticky top-0 z-20 bg-cream/95 backdrop-blur-md pt-3 pb-3 space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Tìm địa điểm, món ăn, chùa chiền..."
          className="w-full rounded-xl border border-beige bg-ivory py-2.5 pl-10 pr-9 text-sm text-charcoal placeholder:text-muted/60 transition-all focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-300"
          aria-label="Tìm kiếm địa điểm"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-charcoal"
            aria-label="Xóa tìm kiếm"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {/* City Segmented Control */}
        <div className="flex w-full rounded-xl bg-beige/50 p-1">
          {cityOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onCityChange(opt.value)}
              className={`
                flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all duration-200
                ${cityFilter === opt.value
                  ? 'bg-ivory text-forest-700 shadow-sm'
                  : 'text-muted hover:text-charcoal'
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Category chips with right fade */}
        <div className="relative">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
            {categoryOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onCategoryChange(opt.value)}
                className={`
                  flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 border
                  ${categoryFilter === opt.value
                    ? 'bg-forest-500 text-ivory border-forest-500 shadow-sm'
                    : 'bg-ivory text-muted border-beige hover:border-forest-200 hover:text-forest-600'
                  }
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Fade edge */}
          <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-8 bg-gradient-to-l from-cream to-transparent" />
        </div>
      </div>

      {/* Count */}
      <p className="text-sm text-muted">
        Có <span className="font-semibold text-charcoal">{count}</span> địa điểm
      </p>
    </div>
  );
}

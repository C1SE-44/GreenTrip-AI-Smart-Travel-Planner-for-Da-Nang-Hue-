import { useMemo, useState } from 'react';
import { Backpack, ChevronDown, CloudRain, Compass, Plus, Waves, X } from 'lucide-react';
import type { CentralVietnamAdvisory } from '@/utils/centralVietnamAdvisories';

export interface CentralVietnamAdvisoryBannerProps {
  advisories: CentralVietnamAdvisory[];
  onOpenChecklist?: () => void;
  onAddHueDay?: () => void;
  onSwapOutdoorForRain?: () => void;
  className?: string;
}

export default function CentralVietnamAdvisoryBanner({
  advisories,
  onOpenChecklist,
  onAddHueDay,
  onSwapOutdoorForRain,
  className = '',
}: CentralVietnamAdvisoryBannerProps) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const visibleAdvisories = useMemo(
    () => advisories.filter((item) => !dismissedIds.includes(item.id)),
    [advisories, dismissedIds]
  );

  if (visibleAdvisories.length === 0) return null;

  const dismiss = (id: string) => {
    setDismissedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <section
      aria-label="Lưu ý đặc thù miền Trung"
      className={`no-print space-y-1.5 ${className}`}
    >
      {visibleAdvisories.map((adv) => {
        const isWarning = adv.severity === 'warning';
        const isExpanded = expandedIds.includes(adv.id);
        const Icon =
          adv.id === 'rainy-season-central'
            ? CloudRain
            : adv.id === 'beach-rip-current'
              ? Waves
              : Compass;

        const actionDisabled =
          (adv.actionType === 'open-checklist' && !onOpenChecklist) ||
          (adv.actionType === 'add-hue-day' && !onAddHueDay);

        return (
          <div
            key={adv.id}
            role="status"
            className={`rounded-2xl border px-3.5 py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 transition-colors ${
              isWarning
                ? 'border-amber-200/80 bg-amber-50/60 text-neutral-900'
                : 'border-emerald-200/80 bg-emerald-50/60 text-neutral-900'
            }`}
          >
            <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  isWarning
                    ? 'bg-amber-100/90 text-amber-800'
                    : 'bg-emerald-100/90 text-emerald-800'
                }`}
                aria-hidden="true"
              >
                <Icon size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-xs text-neutral-800 leading-snug ${
                    isExpanded ? 'whitespace-normal' : 'truncate'
                  }`}
                >
                  <strong className="font-semibold text-neutral-950">{adv.title}:</strong>{' '}
                  {adv.message}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => toggleExpand(adv.id)}
                className="min-h-8 px-2.5 rounded-full text-xs font-semibold text-neutral-700 hover:text-neutral-950 hover:bg-black/5 inline-flex items-center gap-1 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <span>{isExpanded ? 'Thu gọn' : 'Chi tiết'}</span>
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {onSwapOutdoorForRain &&
                (adv.id === 'rainy-season-central' || adv.id === 'beach-rip-current') && (
                  <button
                    type="button"
                    onClick={onSwapOutdoorForRain}
                    className="min-h-8 px-3 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <CloudRain size={12} aria-hidden="true" />
                    <span>Đổi điểm trong nhà</span>
                  </button>
                )}

              {adv.actionLabel && !actionDisabled && (
                <button
                  type="button"
                  onClick={() => {
                    if (adv.actionType === 'open-checklist') onOpenChecklist?.();
                    else if (adv.actionType === 'add-hue-day') onAddHueDay?.();
                  }}
                  className="min-h-8 px-3 rounded-full bg-white border border-neutral-300 hover:border-neutral-950 text-xs font-semibold text-neutral-900 inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  {adv.actionType === 'open-checklist' ? (
                    <Backpack size={12} aria-hidden="true" />
                  ) : (
                    <Plus size={12} aria-hidden="true" />
                  )}
                  <span>{adv.actionLabel}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => dismiss(adv.id)}
                aria-label={`Đã hiểu: ${adv.title}`}
                className="h-8 w-8 rounded-full text-neutral-600 hover:text-neutral-950 hover:bg-black/5 inline-flex items-center justify-center transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                title="Đóng gợi ý này"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

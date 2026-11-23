import { useMemo, useState } from 'react';
import { Backpack, CloudRain, Compass, Plus, Waves, X } from 'lucide-react';
import type { CentralVietnamAdvisory } from '@/utils/centralVietnamAdvisories';

export interface CentralVietnamAdvisoryBannerProps {
  advisories: CentralVietnamAdvisory[];
  onOpenChecklist?: () => void;
  onAddHueDay?: () => void;
  className?: string;
}

export default function CentralVietnamAdvisoryBanner({
  advisories,
  onOpenChecklist,
  onAddHueDay,
  className = '',
}: CentralVietnamAdvisoryBannerProps) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const visibleAdvisories = useMemo(
    () => advisories.filter((item) => !dismissedIds.includes(item.id)),
    [advisories, dismissedIds]
  );

  if (visibleAdvisories.length === 0) return null;

  const dismiss = (id: string) => {
    setDismissedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  return (
    <section
      aria-label="Lưu ý đặc thù miền Trung"
      className={`no-print space-y-2 ${className}`}
    >
      {visibleAdvisories.map((adv) => {
        const isWarning = adv.severity === 'warning';
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
            className={`rounded-2xl border px-3.5 py-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
              isWarning
                ? 'border-amber-300 bg-amber-50/90 text-neutral-900'
                : 'border-emerald-200 bg-emerald-50/80 text-neutral-900'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  isWarning
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
                aria-hidden="true"
              >
                <Icon size={15} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-neutral-950 leading-snug">
                  {adv.title}
                </p>
                <p className="text-xs text-neutral-700 mt-0.5 leading-relaxed">
                  {adv.message}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              {adv.actionLabel && !actionDisabled && (
                <button
                  type="button"
                  onClick={() => {
                    if (adv.actionType === 'open-checklist') onOpenChecklist?.();
                    else if (adv.actionType === 'add-hue-day') onAddHueDay?.();
                  }}
                  className="min-h-[40px] px-3.5 rounded-full bg-white border border-neutral-300 hover:border-neutral-900 text-xs font-bold text-neutral-900 inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  {adv.actionType === 'open-checklist' ? (
                    <Backpack size={13} aria-hidden="true" />
                  ) : (
                    <Plus size={13} aria-hidden="true" />
                  )}
                  <span>{adv.actionLabel}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => dismiss(adv.id)}
                aria-label={`Đã hiểu: ${adv.title}`}
                className="min-h-[40px] min-w-[40px] rounded-full text-neutral-600 hover:text-neutral-950 hover:bg-black/5 inline-flex items-center justify-center transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                title="Đóng gợi ý này"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

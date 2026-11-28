import { useMemo, useState } from 'react';
import { Backpack, CloudRain, Compass, Plus, Waves, X } from 'lucide-react';
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
      className={`no-print space-y-1.5 ${className}`}
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
            className={`rounded-xl border px-3 py-2 flex items-center justify-between gap-2 ${
              isWarning
                ? 'border-amber-200 bg-amber-50/80 text-neutral-900'
                : 'border-emerald-200 bg-emerald-50/75 text-neutral-900'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  isWarning
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
                aria-hidden="true"
              >
                <Icon size={13} />
              </span>
              <p className="text-xs text-neutral-800 truncate sm:whitespace-normal leading-snug">
                <strong className="font-semibold text-neutral-950">{adv.title}:</strong>{' '}
                {adv.message}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              {onSwapOutdoorForRain &&
                (adv.id === 'rainy-season-central' || adv.id === 'beach-rip-current') && (
                  <button
                    type="button"
                    onClick={onSwapOutdoorForRain}
                    className="min-h-8 px-2.5 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
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
                  className="min-h-8 px-2.5 rounded-full bg-white border border-neutral-300 hover:border-neutral-900 text-xs font-semibold text-neutral-900 inline-flex items-center gap-1 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
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
                className="h-7 w-7 rounded-full text-neutral-500 hover:text-neutral-950 hover:bg-black/5 inline-flex items-center justify-center transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
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

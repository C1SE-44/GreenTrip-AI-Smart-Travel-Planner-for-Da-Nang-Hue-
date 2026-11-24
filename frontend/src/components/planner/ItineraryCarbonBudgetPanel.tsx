import { AlertTriangle, Bike, Bus, Car, Footprints, Leaf, Route as RouteIcon, Wallet, X } from 'lucide-react';
import {
  TRANSPORT_MODES_META,
  formatCarbonAmount,
  type computeTripBudgetSummary,
  type estimateCarbonFootprint,
  type RouteTransportMode,
} from '@/services/itineraryService';

interface ItineraryCarbonBudgetPanelProps {
  totalRoadKm: number;
  carbon: ReturnType<typeof estimateCarbonFootprint>;
  openingConflictCount: number;
  transportMode: RouteTransportMode;
  onChangeTransportMode: (mode: RouteTransportMode) => void;
  onOptimizeAllDays: () => void;
  budgetSummary: ReturnType<typeof computeTripBudgetSummary>;
  peopleCount: number;
  formatVnd: (amount: number) => string;
  optimizeFeedback: string | null;
  onDismissOptimizeFeedback: () => void;
}

export default function ItineraryCarbonBudgetPanel({
  totalRoadKm,
  carbon,
  openingConflictCount,
  transportMode,
  onChangeTransportMode,
  onOptimizeAllDays,
  budgetSummary,
  peopleCount,
  formatVnd,
  optimizeFeedback,
  onDismissOptimizeFeedback,
}: ItineraryCarbonBudgetPanelProps) {
  return (
    <div className="no-print mb-2.5 rounded-xl border border-emerald-200/80 bg-[#F7FBF8] px-3 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-800">
          <span className="inline-flex items-center gap-1 font-bold text-emerald-900">
            <Leaf size={13} className="text-emerald-700 shrink-0" />
            <span>{totalRoadKm.toFixed(1)} km</span>
          </span>
          <span className="text-gray-400" aria-hidden="true">·</span>
          <span className="font-semibold text-gray-900">
            {formatCarbonAmount(carbon.co2Grams)}
          </span>
          {carbon.savedPercent > 0 && totalRoadKm > 0 && (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">
              -{carbon.savedPercent}% CO₂
            </span>
          )}
          <span className="text-gray-400" aria-hidden="true">·</span>
          <span
            className={`inline-flex items-center gap-1 font-semibold ${
              budgetSummary.isOverBudget ? 'text-amber-900' : 'text-emerald-900'
            }`}
          >
            <Wallet size={12} className="shrink-0" aria-hidden="true" />
            {budgetSummary.maxBudget !== null ? (
              budgetSummary.isOverBudget ? (
                <span>
                  Vượt {formatVnd(Math.abs(budgetSummary.remaining || 0))} ({formatVnd(budgetSummary.totalCost)}/{formatVnd(budgetSummary.maxBudget)})
                </span>
              ) : (
                <span>
                  {formatVnd(budgetSummary.totalCost)} / {formatVnd(budgetSummary.maxBudget)} ({budgetSummary.percentUsed}%)
                </span>
              )
            ) : (
              <span>
                ~{formatVnd(budgetSummary.totalCost)} ({peopleCount} khách)
              </span>
            )}
          </span>
          {openingConflictCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-950 border border-amber-300">
              <AlertTriangle size={11} className="shrink-0" />
              <span>{openingConflictCount} giờ mở cửa</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <div className="flex items-center gap-1" role="group" aria-label="Chọn phương tiện ước tính phát thải CO2">
            {TRANSPORT_MODES_META.map((mode) => {
              const active = transportMode === mode.id;
              const ModeIcon =
                mode.id === 'driving'
                  ? Car
                  : mode.id === 'motorcycle'
                    ? Bike
                    : mode.id === 'transit'
                      ? Bus
                      : Footprints;
              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChangeTransportMode(mode.id)}
                  className={`inline-flex min-h-[32px] items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                    active
                      ? 'border-emerald-800 bg-emerald-800 text-white shadow-2xs'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <ModeIcon size={12} aria-hidden="true" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOptimizeAllDays}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-full bg-gray-950 px-3 text-xs font-bold text-white hover:bg-gray-800 active:scale-95 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            title="Sắp xếp lại các điểm trong mỗi ngày theo cụm gần nhau để giảm đi vòng (zig-zag)"
          >
            <RouteIcon size={12} aria-hidden="true" />
            <span>Tối ưu đường đi</span>
          </button>
        </div>
      </div>

      {optimizeFeedback && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start justify-between gap-2 rounded-lg bg-white border border-emerald-200 px-2.5 py-1.5 text-xs text-emerald-950 font-medium"
        >
          <span>{optimizeFeedback}</span>
          <button
            type="button"
            onClick={onDismissOptimizeFeedback}
            aria-label="Đóng thông báo tối ưu"
            className="text-gray-500 hover:text-gray-900 cursor-pointer shrink-0 p-0.5"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

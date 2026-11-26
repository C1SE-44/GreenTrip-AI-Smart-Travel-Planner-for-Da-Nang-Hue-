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
  hasMeasurableDistance: boolean;
  routeCoordinateCount: number;
  routeStopCount: number;
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
  hasMeasurableDistance,
  routeCoordinateCount,
  routeStopCount,
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
    <div className="no-print mb-3 rounded-2xl border border-emerald-200/80 bg-[#F7FBF8] p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-800">
          <span className="inline-flex items-center gap-1.5 font-bold text-emerald-900">
            <Leaf size={14} className="text-emerald-700 shrink-0" />
            <span>
              {hasMeasurableDistance
                ? `~${totalRoadKm.toFixed(1)} km ước tính`
                : 'Chưa đủ tọa độ để tính km'}
            </span>
          </span>
          {hasMeasurableDistance && (
            <>
              <span className="text-gray-400" aria-hidden="true">·</span>
              <span className="font-semibold text-gray-900">
                ~{formatCarbonAmount(carbon.co2Grams)}
              </span>
            </>
          )}
          {hasMeasurableDistance && carbon.savedPercent > 0 && totalRoadKm > 0 && (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">
              -{carbon.savedPercent}% so với ô tô
            </span>
          )}
          {openingConflictCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-950 border border-amber-300">
              <AlertTriangle size={12} className="shrink-0" />
              <span>{openingConflictCount} điểm cần xem giờ mở cửa</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onOptimizeAllDays}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-gray-950 px-3.5 text-xs font-bold text-white hover:bg-gray-800 active:scale-95 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          title="Sắp xếp lại các điểm trong mỗi ngày theo cụm gần nhau để giảm đi vòng (zig-zag)"
        >
          <RouteIcon size={14} aria-hidden="true" />
          <span>Tối ưu đường đi</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Chọn phương tiện ước tính phát thải CO2">
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
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                active
                  ? 'border-emerald-800 bg-emerald-800 text-white shadow-2xs'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <ModeIcon size={13} aria-hidden="true" />
              <span>{mode.label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-gray-700">
        Quãng đường là ước tính từ tọa độ các điểm, chưa phải chỉ đường giao thông thực tế. Phương tiện chỉ thay đổi ước tính CO₂.
        {routeStopCount > routeCoordinateCount && (
          <> Hiện có tọa độ cho {routeCoordinateCount}/{routeStopCount} địa điểm; quãng đường chỉ tính các chặng có đủ tọa độ.</>
        )}
      </p>

      {/* Real-time Budget Cap Summary (C_total vs B_max) */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-emerald-200/70">
        <div
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
            budgetSummary.isOverBudget
              ? 'border-amber-300 bg-amber-100 text-amber-950'
              : 'border-emerald-300 bg-emerald-100/80 text-emerald-950'
          }`}
        >
          <Wallet size={13} className="shrink-0" aria-hidden="true" />
          {budgetSummary.maxBudget !== null ? (
            budgetSummary.isOverBudget ? (
              <span>
                Vượt ngân sách {formatVnd(Math.abs(budgetSummary.remaining || 0))}:{' '}
                {formatVnd(budgetSummary.totalCost)} / {formatVnd(budgetSummary.maxBudget)}
              </span>
            ) : (
              <span>
                Ngân sách: {formatVnd(budgetSummary.totalCost)} / {formatVnd(budgetSummary.maxBudget)} ({budgetSummary.percentUsed}%)
              </span>
            )
          ) : (
            <span>
              Chi phí dự kiến: {formatVnd(budgetSummary.totalCost)} ({peopleCount} khách)
            </span>
          )}
        </div>
      </div>

      {optimizeFeedback && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start justify-between gap-2 rounded-xl bg-white border border-emerald-200 px-3 py-2 text-xs text-emerald-950 font-medium"
        >
          <span>{optimizeFeedback}</span>
          <button
            type="button"
            onClick={onDismissOptimizeFeedback}
            aria-label="Đóng thông báo tối ưu"
            className="text-gray-500 hover:text-gray-900 cursor-pointer shrink-0 p-0.5"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

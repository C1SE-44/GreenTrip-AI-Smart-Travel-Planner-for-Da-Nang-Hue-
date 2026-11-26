import {
  AlertTriangle,
  Bike,
  Bus,
  Car,
  Footprints,
  Leaf,
  RotateCcw,
  Route as RouteIcon,
  Wallet,
  X,
} from 'lucide-react';
import {
  TRANSPORT_MODES_META,
  formatCarbonAmount,
  formatCarbonEquivalence,
  type computeTripBudgetSummary,
  type estimateCarbonFootprint,
  type ItineraryResearchMetrics,
  type OptimizationTradeoffMode,
  type RouteTransportMode,
} from '@/services/itineraryService';

interface ItineraryCarbonBudgetPanelProps {
  totalRoadKm: number;
  carbon: ReturnType<typeof estimateCarbonFootprint>;
  openingConflictCount: number;
  intercityConflictCount?: number;
  transportMode: RouteTransportMode;
  onChangeTransportMode: (mode: RouteTransportMode) => void;
  onOptimizeAllDays: () => void;
  tradeoffMode?: OptimizationTradeoffMode;
  onApplyTradeoffOptimize?: (mode: OptimizationTradeoffMode) => void;
  canUndoOptimize?: boolean;
  onUndoOptimize?: () => void;
  researchMetrics?: ItineraryResearchMetrics | null;
  budgetSummary: ReturnType<typeof computeTripBudgetSummary>;
  peopleCount: number;
  formatVnd: (amount: number) => string;
  optimizeFeedback: string | null;
  onDismissOptimizeFeedback: () => void;
}

const TRADEOFF_PRESETS: ReadonlyArray<{ id: OptimizationTradeoffMode; label: string; title: string }> = [
  { id: 'fast', label: 'Nhanh nhất', title: 'Ưu tiên rút gọn quãng đường và thời gian di chuyển' },
  { id: 'budget', label: 'Tiết kiệm', title: 'Ưu tiên giảm chi phí vé/ăn uống và dùng xe công cộng' },
  { id: 'green_local', label: 'Xanh & Ít đông', title: 'Ưu tiên giảm CO₂, tránh giờ cao điểm và đổi sang điểm cộng đồng' },
];

export default function ItineraryCarbonBudgetPanel({
  totalRoadKm,
  carbon,
  openingConflictCount,
  intercityConflictCount = 0,
  transportMode,
  onChangeTransportMode,
  onOptimizeAllDays,
  tradeoffMode = 'fast',
  onApplyTradeoffOptimize,
  canUndoOptimize = false,
  onUndoOptimize,
  researchMetrics = null,
  budgetSummary,
  peopleCount,
  formatVnd,
  optimizeFeedback,
  onDismissOptimizeFeedback,
}: ItineraryCarbonBudgetPanelProps) {
  const safePeople = Math.max(1, peopleCount || 1);
  const perPersonCost = Math.round(budgetSummary.totalCost / safePeople);
  const carbonEquiv = totalRoadKm > 0 ? formatCarbonEquivalence(carbon.savedGrams, carbon.savedPercent) : null;

  return (
    <div className="no-print mb-3 rounded-2xl border border-neutral-200 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.03)] overflow-hidden">
      {/* Row 1: Airbnb Reservation-style 2-Column Summary Strip (Carbon/Route | Budget) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-neutral-200 bg-neutral-50/60">
        <div className="px-4 py-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-neutral-600 flex items-center gap-1.5">
              <Leaf size={13} className="text-emerald-700 shrink-0" aria-hidden="true" />
              <span>Quãng đường &amp; Phát thải CO₂</span>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm font-bold text-neutral-950">{totalRoadKm.toFixed(1)} km</span>
              <span className="text-xs font-semibold text-neutral-700">
                · {formatCarbonAmount(carbon.co2Grams)}
              </span>
              {carbonEquiv && (
                <span
                  className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-900"
                  title="Quy đổi dựa trên mức ô tô riêng 171 g CO₂/km và khả năng hấp thụ ~60 g CO₂/ngày của 1 cây xanh trưởng thành"
                >
                  {carbonEquiv}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 py-3">
          <div className="text-xs font-semibold text-neutral-600 flex items-center gap-1.5">
            <Wallet size={13} className="text-neutral-700 shrink-0" aria-hidden="true" />
            <span>Dự trù cả nhóm ({safePeople} khách)</span>
          </div>
          <div
            className={`mt-1 text-sm font-bold leading-snug ${
              budgetSummary.isOverBudget ? 'text-amber-900' : 'text-neutral-950'
            }`}
            title={`Dự trù cho cả nhóm ${safePeople} khách (~${formatVnd(perPersonCost)}/người): gồm vé tham quan & ăn uống các điểm trong lịch; chưa gồm lưu trú & di chuyển liên tỉnh.`}
          >
            {budgetSummary.maxBudget !== null ? (
              budgetSummary.isOverBudget ? (
                <span>
                  {formatVnd(budgetSummary.totalCost)} / {formatVnd(budgetSummary.maxBudget)}{' '}
                  <span className="text-xs font-semibold text-amber-800">
                    (Vượt {formatVnd(Math.abs(budgetSummary.remaining || 0))})
                  </span>
                </span>
              ) : (
                <span>
                  {formatVnd(budgetSummary.totalCost)} / {formatVnd(budgetSummary.maxBudget)}{' '}
                  <span className="text-xs font-medium text-neutral-600">
                    ({budgetSummary.percentUsed}% · ~{formatVnd(perPersonCost)}/người)
                  </span>
                </span>
              )
            ) : (
              <span>
                ~{formatVnd(budgetSummary.totalCost)}{' '}
                <span className="text-xs font-medium text-neutral-600">
                  (~{formatVnd(perPersonCost)}/người)
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Controls (Transport + Tradeoff + Optimize CTA) & Alerts */}
      <div className="px-4 py-3 space-y-2.5 border-t border-neutral-200">
        {(openingConflictCount > 0 || intercityConflictCount > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {openingConflictCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-950 border border-amber-200">
                <AlertTriangle size={12} className="shrink-0 text-amber-700" aria-hidden="true" />
                <span>{openingConflictCount} điểm lệch giờ mở cửa</span>
              </span>
            )}
            {intercityConflictCount > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-900 border border-rose-200"
                title="Đà Nẵng và Huế cách nhau 2–2,5 giờ qua đèo/hầm Hải Vân. Nên tách sang 2 ngày riêng biệt."
              >
                <AlertTriangle size={12} className="shrink-0 text-rose-700" aria-hidden="true" />
                <span>{intercityConflictCount} ngày lẫn Đà Nẵng – Huế</span>
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Chọn phương tiện ước tính phát thải CO2"
          >
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
                  className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                    active
                      ? 'border-emerald-800 bg-emerald-800 text-white shadow-2xs'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:text-neutral-950'
                  }`}
                >
                  <ModeIcon size={13} aria-hidden="true" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOptimizeAllDays}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-neutral-950 px-3.5 text-xs font-semibold text-white hover:bg-neutral-800 active:scale-[0.98] transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            title="Sắp xếp lại các điểm trong mỗi ngày theo cụm gần nhau để giảm đi vòng (zig-zag)"
          >
            <RouteIcon size={13} aria-hidden="true" />
            <span>Tối ưu đường đi</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100">
          {onApplyTradeoffOptimize && (
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Chọn mức đánh đổi tối ưu hành trình"
            >
              <span className="text-xs font-semibold text-neutral-600">Ưu tiên:</span>
              {TRADEOFF_PRESETS.map((preset) => {
                const active = tradeoffMode === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={active}
                    title={preset.title}
                    onClick={() => onApplyTradeoffOptimize(preset.id)}
                    className={`inline-flex min-h-[32px] items-center rounded-full border px-3 text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                      active
                        ? 'border-emerald-800 bg-emerald-800 text-white'
                        : 'border-neutral-200 bg-white text-neutral-800 hover:border-emerald-700 hover:text-emerald-900'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              {canUndoOptimize && onUndoOptimize && (
                <button
                  type="button"
                  onClick={onUndoOptimize}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  title="Quay lại phương án trước khi tối ưu"
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  <span>Hoàn tác</span>
                </button>
              )}
            </div>
          )}

          {researchMetrics && (
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600"
              aria-label="5 chỉ số đánh giá hành trình xanh"
            >
              <span title="Route feasibility: Độ hợp lý tuyến (không lẫn tỉnh, không lệch giờ mở cửa/cao điểm)">
                Khả thi: <strong className="text-neutral-950">{researchMetrics.routeFeasibilityPct}%</strong>
              </span>
              <span title="User satisfaction: Điểm hài lòng trung bình của các điểm dừng">
                Hài lòng: <strong className="text-neutral-950">{researchMetrics.userSatisfactionScore}/5</strong>
              </span>
              <span title="Diversity: Độ đa dạng nhóm trải nghiệm (di sản, thiên nhiên, ẩm thực, bản địa)">
                Đa dạng: <strong className="text-neutral-950">{researchMetrics.diversityPct}%</strong>
              </span>
              <span title="Estimated emission reduction: Tỷ lệ giảm phát thải CO₂ so với ô tô riêng">
                Giảm CO₂: <strong className="text-emerald-800">{researchMetrics.emissionReductionPct}%</strong>
              </span>
              <span title="Local-business exposure: Tỷ lệ cơ sở cộng đồng địa phương trong hành trình">
                Cộng đồng: <strong className="text-emerald-800">{researchMetrics.localBusinessExposurePct}%</strong>
              </span>
            </div>
          )}
        </div>

        <p className="text-xs text-neutral-600">
          Dự trù ngân sách tính cho cả nhóm {safePeople} khách (~{formatVnd(perPersonCost)}/người), gồm vé tham quan và ăn uống các điểm dừng trong lịch; chưa gồm lưu trú và di chuyển liên tỉnh.
        </p>

        {optimizeFeedback && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-start justify-between gap-2 rounded-xl bg-emerald-50/70 border border-emerald-200 px-3 py-2 text-xs text-emerald-950 font-medium"
          >
            <span>{optimizeFeedback}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {canUndoOptimize && onUndoOptimize && (
                <button
                  type="button"
                  onClick={onUndoOptimize}
                  className="inline-flex items-center gap-1 rounded-full bg-white border border-emerald-300 px-2.5 py-0.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 cursor-pointer"
                >
                  <RotateCcw size={11} aria-hidden="true" />
                  <span>Hoàn tác</span>
                </button>
              )}
              <button
                type="button"
                onClick={onDismissOptimizeFeedback}
                aria-label="Đóng thông báo tối ưu"
                className="text-neutral-600 hover:text-neutral-950 cursor-pointer p-0.5"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

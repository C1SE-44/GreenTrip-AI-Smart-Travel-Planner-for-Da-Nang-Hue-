import React, { useState, useEffect } from 'react';
import {
  X,
  Globe2,
  Sprout,
  Scale,
  Leaf,
  Sparkles,
  Landmark,
  MountainSnow,
  Utensils,
  Building2,
  Compass,
  Sunrise,
  Sun,
  Moon,
  Award,
  Bus,
  Check,
  RotateCcw,
  SlidersHorizontal,
  Flame,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Types (Preserved 100% Contract)
// ─────────────────────────────────────────────
export type BudgetTier = 'all' | '$' | '$$' | '$$$' | '$$$$';
export type EcoPriority = 'all' | 'basic' | 'balanced' | 'eco' | 'pure';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';
export type PoiCategoryFilter = 'di-tich' | 'canh-quan' | 'chua' | 'quan-an' | 'bao-tang' | 'giai-tri';

export interface ExploreFilterValues {
  budget: BudgetTier;
  ecoPriority: EcoPriority;
  ecoCertifiedOnly: boolean;
  greenTransitOnly: boolean;
  categories: PoiCategoryFilter[];
  timeOfDay: TimeOfDay[];
  radiusKm: number | null; // null = tất cả
}

interface ExploreFilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  values: ExploreFilterValues;
  onApply: (newValues: ExploreFilterValues) => void;
  onClearAll: () => void;
  matchingCount: number;
}

// ─────────────────────────────────────────────
// Design System Dataset (Semantic Lucide Icons)
// ─────────────────────────────────────────────
const BUDGET_TIERS: { id: BudgetTier; label: string; desc: string; range: string }[] = [
  { id: '$',    label: '$',    desc: 'Tiết kiệm', range: '< 100.000 ₫' },
  { id: '$$',   label: '$$',   desc: 'Hợp lý', range: '100k – 400.000 ₫' },
  { id: '$$$',  label: '$$$',  desc: 'Cao cấp', range: '400k – 1.000.000 ₫' },
  { id: '$$$$', label: '$$$$', desc: 'Thượng hạng', range: '> 1.000.000 ₫' },
];

const ECO_SEGMENTS: {
  id: EcoPriority;
  label: string;
  sub: string;
  minScore: number;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'all',      label: 'Tất cả',         sub: 'Không lọc Eco',  minScore: 0,  icon: Globe2 },
  { id: 'basic',    label: 'Cơ bản',          sub: 'Eco ≥ 30%',      minScore: 30, icon: Sprout },
  { id: 'balanced', label: 'Cân bằng',        sub: 'Eco ≥ 55%',      minScore: 55, icon: Scale },
  { id: 'eco',      label: 'Thân thiện',      sub: 'Eco ≥ 75%',      minScore: 75, icon: Leaf },
  { id: 'pure',     label: 'Thuần sinh thái', sub: 'Eco ≥ 90%',      minScore: 90, icon: Sparkles },
];

const CATEGORY_OPTIONS: {
  id: PoiCategoryFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'di-tich',   label: 'Di tích lịch sử',   icon: Landmark },
  { id: 'canh-quan', label: 'Cảnh quan biển đảo', icon: MountainSnow },
  { id: 'chua',      label: 'Chùa & Đền miếu',   icon: Flame },
  { id: 'quan-an',   label: 'Ẩm thực địa phương', icon: Utensils },
  { id: 'bao-tang',  label: 'Bảo tàng & Văn hóa', icon: Building2 },
  { id: 'giai-tri',  label: 'Điểm trải nghiệm',  icon: Compass },
];

const TIME_OPTIONS: {
  id: TimeOfDay;
  label: string;
  range: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
}[] = [
  { id: 'morning',   label: 'Buổi sáng', range: '06:00 – 11:00', icon: Sunrise, accentColor: 'text-amber-600' },
  { id: 'afternoon', label: 'Buổi trưa', range: '11:00 – 17:00', icon: Sun,     accentColor: 'text-orange-500' },
  { id: 'evening',   label: 'Buổi tối',  range: '17:00 – 22:00', icon: Moon,    accentColor: 'text-indigo-600' },
];

const RADIUS_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Tất cả' },
  { value: 2,   label: '< 2 km' },
  { value: 5,   label: '< 5 km' },
  { value: 10,  label: '< 10 km' },
  { value: 20,  label: '< 20 km' },
];

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export const ExploreFilterPopover: React.FC<ExploreFilterPopoverProps> = ({
  isOpen,
  onClose,
  values,
  onApply,
  onClearAll,
  matchingCount,
}) => {
  const [budget, setBudget]                     = useState<BudgetTier>(values.budget);
  const [ecoPriority, setEcoPriority]           = useState<EcoPriority>(values.ecoPriority);
  const [ecoCertifiedOnly, setEcoCertifiedOnly] = useState(values.ecoCertifiedOnly);
  const [greenTransitOnly, setGreenTransitOnly] = useState(values.greenTransitOnly);
  const [categories, setCategories]             = useState<PoiCategoryFilter[]>(values.categories);
  const [timeOfDay, setTimeOfDay]               = useState<TimeOfDay[]>(values.timeOfDay);
  const [radiusKm, setRadiusKm]                 = useState<number | null>(values.radiusKm);

  useEffect(() => {
    if (isOpen) {
      setBudget(values.budget);
      setEcoPriority(values.ecoPriority);
      setEcoCertifiedOnly(values.ecoCertifiedOnly);
      setGreenTransitOnly(values.greenTransitOnly);
      setCategories(values.categories);
      setTimeOfDay(values.timeOfDay);
      setRadiusKm(values.radiusKm);
    }
  }, [isOpen, values]);

  if (!isOpen) return null;

  const handleApply = () => {
    onApply({ budget, ecoPriority, ecoCertifiedOnly, greenTransitOnly, categories, timeOfDay, radiusKm });
    onClose();
  };

  const handleClear = () => {
    setBudget('all');
    setEcoPriority('all');
    setEcoCertifiedOnly(false);
    setGreenTransitOnly(false);
    setCategories([]);
    setTimeOfDay([]);
    setRadiusKm(null);
    onClearAll();
    onClose();
  };

  const toggleBudget = (tier: BudgetTier) =>
    setBudget((prev) => (prev === tier ? 'all' : tier));

  const toggleCategory = (cat: PoiCategoryFilter) =>
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );

  const toggleTime = (t: TimeOfDay) =>
    setTimeOfDay((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );

  const currentEcoSegment = ECO_SEGMENTS.find((s) => s.id === ecoPriority) ?? ECO_SEGMENTS[0];
  const activeBudgetObj = BUDGET_TIERS.find((t) => t.id === budget);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        className="relative w-full max-w-[540px] bg-white rounded-3xl shadow-cardHover border border-[#E8E2D9] overflow-hidden z-10 flex flex-col max-h-[88vh] animate-fadeInScale"
        role="dialog"
        aria-modal="true"
        aria-label="Bộ lọc địa điểm"
      >
        {/* ── Header ── */}
        <div className="relative px-6 py-4.5 bg-cream/70 border-b border-[#EFE8DC] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center text-forest-700">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-heading font-bold text-charcoal tracking-tight">
                Bộ lọc tìm kiếm
              </h2>
              <p className="text-[11px] text-muted font-sans">
                Tối ưu lịch trình Đà Nẵng & Huế theo chuẩn du lịch xanh
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-charcoal/60 hover:text-charcoal hover:bg-black/5 transition"
            aria-label="Đóng bộ lọc"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto overscroll-contain flex-1">

          {/* ═══════════════ 1. ECO PRIORITY (Segmented Track) ═══════════════ */}
          <section className="space-y-3" aria-labelledby="filter-eco-label">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-forest-700 font-heading">
                  Tiêu chí cốt lõi
                </span>
                <h3 id="filter-eco-label" className="text-sm font-heading font-bold text-charcoal">
                  Mức độ Ưu tiên Xanh
                </h3>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-forest-50 text-forest-800 border border-forest-200">
                <currentEcoSegment.icon className="w-3.5 h-3.5 text-forest-600" />
                <span>{currentEcoSegment.sub}</span>
              </div>
            </div>

            {/* Segmented Track Buttons */}
            <div className="bg-[#F4EFEA] p-1.5 rounded-2xl border border-[#E8E1D5] grid grid-cols-5 gap-1">
              {ECO_SEGMENTS.map(({ id, label, icon: Icon }) => {
                const isSelected = ecoPriority === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setEcoPriority(id)}
                    className={`flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl text-center transition-all duration-200 ${
                      isSelected
                        ? 'bg-forest-700 text-white shadow-sm font-semibold scale-[1.02]'
                        : 'text-charcoal/70 hover:text-charcoal hover:bg-white/60 font-medium'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-forest-600'}`} />
                    <span className="text-[11px] leading-tight line-clamp-1">{label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="h-px bg-[#EFE8DC]" />

          {/* ═══════════════ 2. BUDGET (Segmented Group) ═══════════════ */}
          <section className="space-y-3" aria-labelledby="filter-budget-label">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-wood-700 font-heading">
                  Ngân sách dự kiến
                </span>
                <h3 id="filter-budget-label" className="text-sm font-heading font-bold text-charcoal">
                  Phân khúc chi tiêu
                </h3>
              </div>
              <span className="text-xs text-muted font-medium">
                {activeBudgetObj ? `${activeBudgetObj.desc} (${activeBudgetObj.range})` : 'Tất cả mức giá'}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {BUDGET_TIERS.map(({ id, label, desc }) => {
                const isSelected = budget === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleBudget(id)}
                    className={`py-2.5 px-3 rounded-xl border text-center transition-all duration-200 flex flex-col items-center justify-center ${
                      isSelected
                        ? 'bg-wood-50 border-wood-600 text-wood-800 shadow-sm ring-1 ring-wood-500/20'
                        : 'bg-white border-[#E8E2D9] text-charcoal/80 hover:bg-[#F9F6F0] hover:border-wood-300'
                    }`}
                  >
                    <span className="text-sm font-bold tracking-wider">{label}</span>
                    <span className="text-[10px] text-muted font-sans mt-0.5">{desc}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="h-px bg-[#EFE8DC]" />

          {/* ═══════════════ 3. CATEGORIES (Lucide Vector Pills) ═══════════════ */}
          <section className="space-y-3" aria-labelledby="filter-cat-label">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted font-heading">
                  Trải nghiệm
                </span>
                <h3 id="filter-cat-label" className="text-sm font-heading font-bold text-charcoal">
                  Loại hình điểm đến
                </h3>
              </div>
              {categories.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCategories([])}
                  className="text-xs font-medium text-forest-700 hover:text-forest-800 hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Bỏ chọn</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORY_OPTIONS.map(({ id, label, icon: Icon }) => {
                const isSelected = categories.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleCategory(id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all duration-150 ${
                      isSelected
                        ? 'bg-forest-50 border-forest-600 text-forest-900 shadow-sm font-semibold'
                        : 'bg-white border-[#E8E2D9] text-charcoal/80 hover:bg-[#F9F7F2] hover:border-forest-300 font-medium'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-forest-600 text-white' : 'bg-[#F2ECE4] text-charcoal/70'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="h-px bg-[#EFE8DC]" />

          {/* ═══════════════ 4. TIME OF DAY ═══════════════ */}
          <section className="space-y-3" aria-labelledby="filter-time-label">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted font-heading">
                Thời gian
              </span>
              <h3 id="filter-time-label" className="text-sm font-heading font-bold text-charcoal">
                Khung giờ lý tưởng
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {TIME_OPTIONS.map(({ id, label, range, icon: Icon, accentColor }) => {
                const isSelected = timeOfDay.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleTime(id)}
                    className={`flex flex-col items-center py-3 px-2 rounded-xl border text-center transition-all duration-150 ${
                      isSelected
                        ? 'bg-forest-50 border-forest-600 text-forest-900 shadow-sm font-semibold'
                        : 'bg-white border-[#E8E2D9] text-charcoal/80 hover:bg-[#F9F7F2] hover:border-forest-300 font-medium'
                    }`}
                  >
                    <Icon className={`w-5 h-5 mb-1.5 ${isSelected ? 'text-forest-700' : accentColor}`} />
                    <span className="text-xs font-bold leading-tight">{label}</span>
                    <span className="text-[10px] text-muted mt-0.5 leading-none">{range}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="h-px bg-[#EFE8DC]" />

          {/* ═══════════════ 5. RADIUS ═══════════════ */}
          <section className="space-y-3" aria-labelledby="filter-radius-label">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted font-heading">
                Khoảng cách
              </span>
              <h3 id="filter-radius-label" className="text-sm font-heading font-bold text-charcoal">
                Bán kính từ trung tâm
              </h3>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {RADIUS_OPTIONS.map(({ value, label }) => {
                const isSelected = radiusKm === value;
                return (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setRadiusKm(value)}
                    className={`px-3.5 py-1.5 rounded-full text-xs transition-all duration-150 ${
                      isSelected
                        ? 'bg-charcoal text-white font-semibold shadow-sm'
                        : 'bg-[#F2ECE4] text-charcoal/80 hover:bg-[#EAE2D6] font-medium'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="h-px bg-[#EFE8DC]" />

          {/* ═══════════════ 6. TOGGLES (Tactile Switch) ═══════════════ */}
          <section className="space-y-3" aria-labelledby="filter-toggles-label">
            <span className="text-[11px] font-bold uppercase tracking-wider text-forest-700 font-heading">
              Tiêu chuẩn bền vững
            </span>
            <h3 id="filter-toggles-label" className="text-sm font-heading font-bold text-charcoal">
              Chứng chỉ & Giao thông Xanh
            </h3>

            <div className="space-y-2 pt-1">
              {/* Toggle: Eco-Certified */}
              <div className="flex items-center justify-between p-3 rounded-2xl border border-[#E8E2D9] bg-[#FAF8F5]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-forest-100/70 text-forest-700 flex items-center justify-center shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-charcoal leading-tight">
                      Điểm đạt chứng nhận Eco-Certified
                    </p>
                    <p className="text-[11px] text-muted mt-0.5">
                      Được kiểm định bảo tồn thiên nhiên, di sản & giảm phát thải
                    </p>
                  </div>
                </div>
                <ToggleSwitch
                  checked={ecoCertifiedOnly}
                  onChange={setEcoCertifiedOnly}
                  id="toggle-eco-certified"
                />
              </div>

              {/* Toggle: Green Transit */}
              <div className="flex items-center justify-between p-3 rounded-2xl border border-[#E8E2D9] bg-[#FAF8F5]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-forest-100/70 text-forest-700 flex items-center justify-center shrink-0">
                    <Bus className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-charcoal leading-tight">
                      Thuận tiện di chuyển xanh
                    </p>
                    <p className="text-[11px] text-muted mt-0.5">
                      Gần trạm xe buýt điện DanangBus hoặc cho thuê xe đạp
                    </p>
                  </div>
                </div>
                <ToggleSwitch
                  checked={greenTransitOnly}
                  onChange={setGreenTransitOnly}
                  id="toggle-green-transit"
                />
              </div>
            </div>
          </section>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 bg-cream/90 border-t border-[#EFE8DC] flex items-center justify-between">
          <button
            type="button"
            onClick={handleClear}
            className="text-xs font-semibold text-muted hover:text-charcoal transition flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Xóa bộ lọc</span>
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="px-6 py-2.5 rounded-full bg-forest-700 hover:bg-forest-800 active:scale-95 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>Xem kết quả</span>
            <span className="px-1.5 py-0.5 rounded-full bg-forest-800/80 text-[11px] font-medium text-white/90">
              {matchingCount}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Sub-component: Tactile Toggle Switch
// ─────────────────────────────────────────────
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}

function ToggleSwitch({ checked, onChange, id }: ToggleSwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 ${
        checked ? 'bg-forest-600' : 'bg-[#DDD5C7]'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default ExploreFilterPopover;

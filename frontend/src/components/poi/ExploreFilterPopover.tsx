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
// Datasets (Tactile Workshop x Uiverse Architecture)
// ─────────────────────────────────────────────
const BUDGET_TIERS: { id: BudgetTier; label: string; desc: string; range: string }[] = [
  { id: '$',    label: '$',    desc: 'Tiết kiệm', range: '< 100k ₫' },
  { id: '$$',   label: '$$',   desc: 'Hợp lý', range: '100k – 400k ₫' },
  { id: '$$$',  label: '$$$',  desc: 'Cao cấp', range: '400k – 1tr ₫' },
  { id: '$$$$', label: '$$$$', desc: 'Thượng hạng', range: '> 1.000.000 ₫' },
];

const ECO_SEGMENTS: {
  id: EcoPriority;
  label: string;
  gauge: string;
  minScore: number;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'all',      label: 'Tất cả',         gauge: 'Eco 0%',   minScore: 0,  icon: Globe2 },
  { id: 'basic',    label: 'Cơ bản',          gauge: 'Eco ≥ 30%', minScore: 30, icon: Sprout },
  { id: 'balanced', label: 'Cân bằng',        gauge: 'Eco ≥ 55%', minScore: 55, icon: Scale },
  { id: 'eco',      label: 'Thân thiện',      gauge: 'Eco ≥ 75%', minScore: 75, icon: Leaf },
  { id: 'pure',     label: 'Thuần sinh thái', gauge: 'Eco ≥ 90%', minScore: 90, icon: Sparkles },
];

const CATEGORY_OPTIONS: {
  id: PoiCategoryFilter;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'di-tich',   label: 'Di tích lịch sử',       sublabel: 'Cố đô, lăng tẩm & thành trì', icon: Landmark },
  { id: 'canh-quan', label: 'Cảnh quan thiên nhiên', sublabel: 'Bãi biển, đèo & núi rừng',    icon: MountainSnow },
  { id: 'chua',      label: 'Chùa & Đền miếu',       sublabel: 'Tâm linh & văn hóa cổ truyền', icon: Flame },
  { id: 'quan-an',   label: 'Ẩm thực địa phương',     sublabel: 'Đặc sản xứ Quảng & Cố đô',     icon: Utensils },
  { id: 'bao-tang',  label: 'Bảo tàng & Văn hóa',    sublabel: 'Không gian trưng bày & di sản', icon: Building2 },
  { id: 'giai-tri',  label: 'Điểm trải nghiệm',      sublabel: 'Làng nghề & sinh thái mở',     icon: Compass },
];

const TIME_OPTIONS: {
  id: TimeOfDay;
  label: string;
  range: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'morning',   label: 'Buổi sáng', range: '06:00 – 11:00', icon: Sunrise },
  { id: 'afternoon', label: 'Buổi trưa', range: '11:00 – 17:00', icon: Sun },
  { id: 'evening',   label: 'Buổi tối',  range: '17:00 – 22:00', icon: Moon },
];

const RADIUS_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Toàn thành phố' },
  { value: 2,   label: '< 2 km' },
  { value: 5,   label: '< 5 km' },
  { value: 10,  label: '< 10 km' },
  { value: 20,  label: '< 20 km' },
];

// ─────────────────────────────────────────────
// Component: ExploreFilterPopover (Modern Eco-Tactile)
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

  // Sync state on open
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

  // Keyboard Accessibility: Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Data Honesty: Check if filters are currently in default state
  const isDefaultState =
    budget === 'all' &&
    ecoPriority === 'all' &&
    !ecoCertifiedOnly &&
    !greenTransitOnly &&
    categories.length === 0 &&
    timeOfDay.length === 0 &&
    radiusKm === null;

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
      {/* Frosted Modern Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* Modern Eco-Tactile Dialog Shell */}
      <div
        className="relative w-full max-w-[580px] bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden z-10 flex flex-col max-h-[88vh] animate-fadeInScale"
        role="dialog"
        aria-modal="true"
        aria-label="Bộ lọc khám phá Đà Nẵng và Huế"
      >
        {/* ── Control Header ── */}
        <div className="px-6 py-4 bg-gradient-to-b from-slate-50/90 to-white border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-forest-600 to-forest-800 text-white flex items-center justify-center shadow-md shadow-forest-900/15">
              <SlidersHorizontal className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-heading font-bold text-slate-900 tracking-tight">
                  Bộ Lọc Khám Phá
                </h2>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-forest-50 text-forest-800 border border-forest-200/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-forest-500 animate-pulse" />
                  Đà Nẵng & Huế
                </span>
              </div>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Thiết lập tiêu chuẩn trải nghiệm & du lịch bền vững
              </p>
            </div>
          </div>

          {/* Uiverse Circular Close Button with 90deg hover spin */}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-all duration-200 hover:rotate-90 active:scale-95 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-forest-600 focus:outline-none"
            aria-label="Đóng bảng lọc (phím Escape)"
            title="Đóng (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Working Surface (Scrollable Body) ── */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto overscroll-contain flex-1 scrollbar-thin">

          {/* ═══════════════ 1. ECO PRIORITY (Uiverse Segmented Inlaid Dial) ═══════════════ */}
          <section className="space-y-3" aria-labelledby="filter-eco-label">
            <div className="flex items-center justify-between">
              <h3 id="filter-eco-label" className="text-xs font-heading font-bold uppercase tracking-wider text-slate-700">
                Mức độ Ưu tiên Xanh
              </h3>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-forest-50 text-forest-800 border border-forest-200/80 shadow-xs">
                <currentEcoSegment.icon className="w-3.5 h-3.5 text-forest-600" />
                <span className="font-mono font-bold">{currentEcoSegment.gauge}</span>
              </div>
            </div>

            {/* Inlaid Segmented Dial Tray */}
            <div className="bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/70 grid grid-cols-5 gap-1.5 shadow-inner">
              {ECO_SEGMENTS.map(({ id, label, icon: Icon, minScore }) => {
                const isSelected = ecoPriority === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setEcoPriority(id)}
                    className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-center transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-forest-600 focus:outline-none ${
                      isSelected
                        ? 'bg-gradient-to-b from-forest-600 to-forest-800 text-white font-bold shadow-md shadow-forest-900/20 scale-[1.02] border border-forest-500/30'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 font-medium'
                    }`}
                  >
                    <Icon className={`w-4 h-4 transition-transform ${isSelected ? 'text-white scale-110' : 'text-forest-700'}`} />
                    <span className="text-[11px] leading-tight font-heading">{label}</span>
                    <span className={`text-[9px] font-mono leading-none ${isSelected ? 'text-forest-100 font-bold' : 'text-slate-400'}`}>
                      {minScore > 0 ? `≥${minScore}%` : '0%'}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="h-px bg-slate-100" />

          {/* ═══════════════ 2. BUDGET TIERS (Uiverse Interactive Tile Cards) ═══════════════ */}
          <section className="space-y-3" aria-labelledby="filter-budget-label">
            <div className="flex items-center justify-between">
              <h3 id="filter-budget-label" className="text-xs font-heading font-bold uppercase tracking-wider text-slate-700">
                Phân khúc Ngân sách
              </h3>
              <span className="text-xs font-medium text-forest-700 bg-forest-50 px-2 py-0.5 rounded-md border border-forest-100">
                {activeBudgetObj ? `${activeBudgetObj.desc} • ${activeBudgetObj.range}` : 'Tất cả mức giá'}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {BUDGET_TIERS.map(({ id, label, desc, range }) => {
                const isSelected = budget === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => toggleBudget(id)}
                    className={`relative p-2.5 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center active:scale-95 focus-visible:ring-2 focus-visible:ring-forest-600 focus:outline-none cursor-pointer group ${
                      isSelected
                        ? 'bg-gradient-to-br from-forest-50/70 to-emerald-50/40 border-forest-600 text-forest-900 font-bold shadow-sm ring-2 ring-forest-500/20 translate-y-[-1px]'
                        : 'bg-white border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <span className={`text-sm font-mono font-bold tracking-wider ${isSelected ? 'text-forest-700' : 'text-slate-800'}`}>
                      {label}
                    </span>
                    <span className="text-[11px] font-heading font-semibold text-slate-800 mt-0.5">
                      {desc}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                      {range}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="h-px bg-slate-100" />

          {/* ═══════════════ 3. CATEGORIES (Uiverse Flex-Cards, No Truncation) ═══════════════ */}
          <section className="space-y-3" aria-labelledby="filter-cat-label">
            <div className="flex items-center justify-between">
              <h3 id="filter-cat-label" className="text-xs font-heading font-bold uppercase tracking-wider text-slate-700">
                Loại hình điểm đến
              </h3>
              {categories.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCategories([])}
                  className="text-xs font-semibold text-forest-700 hover:text-forest-900 hover:underline flex items-center gap-1 active:scale-95 focus-visible:ring-2 focus-visible:ring-forest-600 focus:outline-none rounded"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Bỏ chọn ({categories.length})</span>
                </button>
              )}
            </div>

            {/* Balanced 2-Column Grid with Full Labels */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {CATEGORY_OPTIONS.map(({ id, label, sublabel, icon: Icon }) => {
                const isSelected = categories.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleCategory(id)}
                    className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-forest-600 focus:outline-none group cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-forest-50/90 to-emerald-50/40 border-forest-600 text-forest-950 font-bold ring-2 ring-forest-500/15 shadow-sm'
                        : 'bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50/70 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-transform duration-200 group-hover:scale-105 ${
                        isSelected
                          ? 'bg-forest-700 border-forest-800 text-white shadow-sm'
                          : 'bg-slate-100 border-slate-200 text-slate-600 group-hover:bg-forest-50 group-hover:text-forest-700'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-heading font-bold leading-tight ${isSelected ? 'text-forest-950' : 'text-slate-800'}`}>
                        {label}
                      </p>
                      <p className="text-[10px] text-slate-400 font-sans leading-tight mt-0.5 truncate">
                        {sublabel}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full bg-forest-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="h-px bg-slate-100" />

          {/* ═══════════════ 4. TIME OF DAY (Uiverse Time Cards) ═══════════════ */}
          <section className="space-y-3" aria-labelledby="filter-time-label">
            <h3 id="filter-time-label" className="text-xs font-heading font-bold uppercase tracking-wider text-slate-700">
              Khung giờ tham quan
            </h3>

            <div className="grid grid-cols-3 gap-2">
              {TIME_OPTIONS.map(({ id, label, range, icon: Icon }) => {
                const isSelected = timeOfDay.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleTime(id)}
                    className={`flex flex-col items-center py-3 px-2 rounded-2xl border text-center transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-forest-600 focus:outline-none cursor-pointer group ${
                      isSelected
                        ? 'bg-gradient-to-b from-forest-50/80 to-white border-forest-600 text-forest-900 font-bold ring-2 ring-forest-500/20 shadow-sm'
                        : 'bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50/70 hover:border-slate-300'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mb-1.5 transition-transform duration-200 group-hover:scale-110 ${isSelected ? 'text-forest-700' : 'text-slate-500'}`} />
                    <span className="text-xs font-heading font-bold">{label}</span>
                    <span className="text-[10px] text-slate-400 font-mono mt-0.5">{range}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="h-px bg-slate-100" />

          {/* ═══════════════ 5. RADIUS DIAL (Uiverse Pill Selectors) ═══════════════ */}
          <section className="space-y-3" aria-labelledby="filter-radius-label">
            <h3 id="filter-radius-label" className="text-xs font-heading font-bold uppercase tracking-wider text-slate-700">
              Bán kính tìm kiếm
            </h3>

            <div className="flex items-center gap-2 flex-wrap">
              {RADIUS_OPTIONS.map(({ value, label }) => {
                const isSelected = radiusKm === value;
                return (
                  <button
                    key={String(value)}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setRadiusKm(value)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-heading transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-slate-900 focus:outline-none cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white font-bold shadow-sm scale-105 border border-slate-900'
                        : 'bg-slate-100 border border-slate-200/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900 font-medium'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="h-px bg-slate-100" />

          {/* ═══════════════ 6. SUSTAINABILITY TOGGLES (Uiverse Tactile Switches) ═══════════════ */}
          <section className="space-y-3" aria-labelledby="filter-toggles-label">
            <h3 id="filter-toggles-label" className="text-xs font-heading font-bold uppercase tracking-wider text-slate-700">
              Tiêu chuẩn Sinh thái & Di chuyển
            </h3>

            <div className="space-y-2.5 pt-0.5">
              {/* Toggle: Eco-Certified */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all duration-200 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-forest-50 border border-forest-200/80 text-forest-700 flex items-center justify-center shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-heading font-bold text-slate-900">
                      Chứng nhận Eco-Certified
                    </p>
                    <p className="text-[11px] text-slate-500 font-sans">
                      Được kiểm định giảm phát thải, bảo tồn thiên nhiên & văn hóa
                    </p>
                  </div>
                </div>
                <TactileSwitch
                  checked={ecoCertifiedOnly}
                  onChange={setEcoCertifiedOnly}
                  id="toggle-eco-certified"
                  ariaLabel="Chỉ điểm đạt chứng nhận Eco-Certified"
                />
              </div>

              {/* Toggle: Green Transit */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all duration-200 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-forest-50 border border-forest-200/80 text-forest-700 flex items-center justify-center shrink-0">
                    <Bus className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-heading font-bold text-slate-900">
                      Thuận tiện di chuyển xanh
                    </p>
                    <p className="text-[11px] text-slate-500 font-sans">
                      Gần tuyến xe buýt điện DanangBus hoặc trạm xe đạp công cộng
                    </p>
                  </div>
                </div>
                <TactileSwitch
                  checked={greenTransitOnly}
                  onChange={setGreenTransitOnly}
                  id="toggle-green-transit"
                  ariaLabel="Chỉ điểm thuận tiện di chuyển xanh"
                />
              </div>
            </div>
          </section>
        </div>

        {/* ── Control Deck Footer ── */}
        <div className="px-6 py-4 bg-gradient-to-t from-slate-50 to-white border-t border-slate-100 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleClear}
            disabled={isDefaultState}
            className={`group text-xs font-heading font-bold flex items-center gap-1.5 transition-all focus-visible:ring-2 focus-visible:ring-forest-600 focus:outline-none rounded-lg px-3 py-2 ${
              isDefaultState
                ? 'text-slate-400 opacity-40 cursor-not-allowed pointer-events-none'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:scale-95 cursor-pointer'
            }`}
            title={isDefaultState ? 'Đang ở trạng thái mặc định' : 'Khôi phục toàn bộ bộ lọc'}
          >
            <RotateCcw className="w-3.5 h-3.5 transition-transform duration-300 group-hover:-rotate-90" />
            <span>Xóa bộ lọc</span>
          </button>

          {/* Uiverse Primary Action CTA */}
          <button
            type="button"
            onClick={handleApply}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-forest-600 via-forest-700 to-forest-800 hover:from-forest-700 hover:to-forest-900 active:scale-95 text-white text-xs font-heading font-bold transition-all duration-200 flex items-center gap-2.5 border border-forest-500/30 shadow-md shadow-forest-900/20 focus-visible:ring-2 focus-visible:ring-forest-600 focus-visible:ring-offset-2 focus:outline-none cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Xem kết quả</span>
            <span className="px-2 py-0.5 rounded-lg bg-forest-900/50 font-mono text-[11px] text-white font-bold border border-white/10">
              {matchingCount}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Sub-component: Uiverse Tactile Glow Switch
// ─────────────────────────────────────────────
interface TactileSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
  ariaLabel: string;
}

function TactileSwitch({ checked, onChange, id, ariaLabel }: TactileSwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus-visible:ring-2 focus-visible:ring-forest-600 focus-visible:ring-offset-2 focus:outline-none active:scale-95 ${
        checked ? 'bg-gradient-to-r from-forest-500 to-forest-700 shadow-inner' : 'bg-slate-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-flex items-center justify-center h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200 ease-out my-auto ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      >
        {checked && <span className="w-1.5 h-1.5 rounded-full bg-forest-600" />}
      </span>
    </button>
  );
}

export default ExploreFilterPopover;
